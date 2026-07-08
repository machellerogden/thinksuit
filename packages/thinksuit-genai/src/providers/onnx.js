import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Test seam: unit tests point this at a stub worker script.
const WORKER_PATH = process.env.THINKSUIT_ONNX_WORKER || join(__dirname, 'onnx-worker.js');

/**
 * Model metadata for capabilities
 * Maps HuggingFace model IDs to their ONNX equivalents
 */
const MODEL_METADATA = {
    'ibm-granite/granite-4.0-h-1b': {
        maxContext: 128000,
        maxOutput: 2048,
        supports: { toolCalls: true, temperature: true },
        onnxModelId: 'onnx-community/granite-4.0-1b-ONNX-web'
    },
    'ibm-granite/granite-4.0-h-350m': {
        maxContext: 128000,
        maxOutput: 2048,
        supports: { toolCalls: true, temperature: true },
        onnxModelId: 'onnx-community/granite-4.0-h-350m-ONNX'
    },
    'Qwen/Qwen2.5-0.5B-Instruct': {
        maxContext: 32768,
        maxOutput: 2048,
        supports: { toolCalls: true, temperature: true },
        onnxModelId: 'onnx-community/Qwen2.5-0.5B-Instruct-ONNX'
    }
};

// ---------------------------------------------------------------------------
// Supervised resident worker
//
// One long-lived worker per process, shared by every ONNX provider instance
// (transformers.js is not concurrency-safe, so requests are FIFO-serialized).
// The worker never exits after a response: the old kill-per-call existed
// because ONNX Runtime crashes on teardown — never tearing down avoids both
// the crash and the per-call model reload. Crash isolation is preserved: if
// the worker dies, in-flight and queued requests are rejected and a fresh
// worker is forked lazily on the next request (one reload per crash, not per
// call). Abort kills the worker (native generate can't be cancelled) and pays
// the same lazy-respawn cost.
// ---------------------------------------------------------------------------

let worker = null;
let workerReady = false;
let current = null; // job in flight on the worker
const queue = []; // jobs waiting for the worker
let lastLoadedModels = []; // worker-reported cache keys, refreshed per response
let seq = 0;

// The resident worker must never outlive its parent (per-turn broker workers
// exit constantly) and must never hold the parent's event loop open while idle.
process.on('exit', () => {
    if (worker) worker.kill('SIGKILL');
});

function updateRefs() {
    if (!worker) return;
    // Hold the event loop only while there is work outstanding.
    if (current || queue.length > 0) {
        worker.ref();
        worker.channel?.ref();
    } else {
        worker.unref();
        worker.channel?.unref();
    }
}

function settleReject(job, error) {
    if (job.settled) return;
    job.settled = true;
    if (job.onAbort) job.abortSignal.removeEventListener('abort', job.onAbort);
    job.reject(error);
}

function settleResolve(job, result) {
    if (job.settled) return;
    job.settled = true;
    if (job.onAbort) job.abortSignal.removeEventListener('abort', job.onAbort);
    job.resolve(result);
}

// Kill the worker (if any) and reject every outstanding job.
function teardown(error) {
    const jobs = [current, ...queue].filter(Boolean);
    current = null;
    queue.length = 0;
    const w = worker;
    worker = null;
    workerReady = false;
    if (w) {
        w.removeAllListeners();
        w.kill('SIGKILL');
    }
    for (const job of jobs) settleReject(job, error);
}

function spawnWorker() {
    worker = fork(WORKER_PATH);
    workerReady = false;

    worker.on('message', (msg) => {
        if (msg.ready) {
            workerReady = true;
            pump();
            return;
        }
        if (current && msg.id === current.id) {
            const job = current;
            current = null;
            if (Array.isArray(msg.loadedModels)) lastLoadedModels = msg.loadedModels;
            if (msg.success) {
                settleResolve(job, msg.result);
            } else {
                settleReject(job, new Error(msg.error));
            }
            pump();
        }
    });

    worker.on('error', (err) => {
        teardown(new Error(`ONNX worker error: ${err.message}`));
    });

    worker.on('exit', (code, signal) => {
        // teardown() nulls `worker` before killing, so a deliberate kill
        // doesn't re-enter here.
        if (worker) teardown(new Error(`ONNX worker crashed (code ${code}, signal ${signal})`));
    });
}

function pump() {
    if (!current && queue.length > 0) {
        if (!worker) spawnWorker();
        if (workerReady) {
            const job = queue.shift();
            if (job.settled) return pump(); // aborted while queued
            current = job;
            worker.send({ id: job.id, modelId: job.modelId, dtype: job.dtype, params: job.params });
        }
    }
    updateRefs();
}

function runJob({ modelId, dtype, params }, abortSignal) {
    return new Promise((resolve, reject) => {
        const job = {
            id: `req_${++seq}`,
            modelId,
            dtype,
            params,
            resolve,
            reject,
            abortSignal,
            settled: false,
            onAbort: null
        };
        if (abortSignal) {
            job.onAbort = () => {
                if (job.settled) return;
                if (current === job) {
                    // Native generate can't be cancelled — kill the worker.
                    // Everything else outstanding dies with it (lazy respawn).
                    settleReject(job, new Error('Request aborted'));
                    teardown(new Error('ONNX worker killed: in-flight request aborted'));
                    updateRefs();
                } else {
                    settleReject(job, new Error('Request aborted'));
                }
            };
            abortSignal.addEventListener('abort', job.onAbort, { once: true });
        }
        queue.push(job);
        pump();
    });
}

/**
 * Observability surface for the daemon's /status route.
 */
export function getONNXWorkerStatus() {
    return {
        workerPid: worker?.pid ?? null,
        ready: workerReady,
        loadedModels: [...lastLoadedModels],
        queueDepth: queue.length + (current ? 1 : 0)
    };
}

/**
 * ONNX provider - runs models locally using Transformers.js with ONNX Runtime
 */
export const createONNXProvider = (config) => {
    const { dtype = 'q4' } = config || {};

    return {
        async callLLM(ctx, params) {
            const { abortSignal } = ctx || {};

            // Check abort before starting
            if (abortSignal?.aborted) {
                throw new Error('Request aborted');
            }

            // Get model metadata
            const modelInfo = MODEL_METADATA[params.model];
            if (!modelInfo) {
                throw new Error(`E_GRANITE_MODEL: Unknown model ${params.model}`);
            }

            return runJob({ modelId: modelInfo.onnxModelId, dtype, params }, abortSignal);
        },

        getCapabilities(model) {
            return MODEL_METADATA[model] || {
                maxContext: 4096,
                maxOutput: 2048,
                supports: { toolCalls: false, temperature: true }
            };
        }
    };
};
