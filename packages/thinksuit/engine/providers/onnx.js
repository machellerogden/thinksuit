import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROCESSING_EVENTS } from '../constants/events.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, 'onnx-worker.js');

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

/**
 * ONNX provider - runs models locally using Transformers.js with ONNX Runtime
 */
export const createONNXProvider = (config) => {
    const { dtype = 'q4' } = config || {};

    return {
        async callLLM(machineContext, params) {
            const { execLogger, abortSignal } = machineContext;

            // Check abort before starting
            if (abortSignal?.aborted) {
                throw new Error('Request aborted');
            }

            // Get model metadata
            const modelInfo = MODEL_METADATA[params.model];
            if (!modelInfo) {
                throw new Error(`E_GRANITE_MODEL: Unknown model ${params.model}`);
            }

            // Log request
            execLogger.debug({
                event: PROCESSING_EVENTS.PROVIDER_API_RAW_REQUEST,
                msg: 'Granite generation request (via worker process)',
                data: {
                    model: params.model,
                    onnxModel: modelInfo.onnxModelId,
                    maxTokens: params.maxTokens,
                    toolCount: params.tools?.length || 0
                }
            });

            // Run in worker process to isolate ONNX crashes
            const response = await new Promise((resolve, reject) => {
                const worker = fork(WORKER_PATH);
                const requestId = `req_${Date.now()}`;
                let responded = false;

                // Handle abort
                if (abortSignal) {
                    abortSignal.addEventListener('abort', () => {
                        if (!responded) {
                            worker.kill();
                            reject(new Error('Request aborted'));
                        }
                    });
                }

                // Handle response
                worker.on('message', (msg) => {
                    if (msg.ready) {
                        // Worker is ready, send request
                        // Use ONNX model ID from metadata
                        worker.send({
                            id: requestId,
                            modelId: modelInfo.onnxModelId,
                            dtype,
                            params
                        });
                    } else if (msg.id === requestId) {
                        responded = true;
                        if (msg.success) {
                            resolve(msg.result);
                        } else {
                            reject(new Error(msg.error));
                        }
                        // Kill worker immediately - it will crash anyway during cleanup
                        worker.kill('SIGKILL');
                    }
                });

                // Handle worker errors/exits
                worker.on('error', (err) => {
                    if (!responded) {
                        responded = true;
                        reject(new Error(`Worker error: ${err.message}`));
                    }
                });

                worker.on('exit', (code) => {
                    if (!responded) {
                        responded = true;
                        // Worker exited without sending response
                        if (code === 0) {
                            reject(new Error('Worker exited unexpectedly'));
                        } else {
                            reject(new Error(`Worker crashed with code ${code}`));
                        }
                    }
                    // Worker exit after response is expected - cleanup complete
                });
            });

            // Log response
            execLogger.debug({
                event: PROCESSING_EVENTS.PROVIDER_API_RAW_RESPONSE,
                msg: 'Granite generation response',
                data: {
                    outputLength: response.output.length,
                    tokens: response.usage.completion,
                    finishReason: response.finishReason,
                    toolCallCount: response.toolCalls?.length || 0
                }
            });

            return response;
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
