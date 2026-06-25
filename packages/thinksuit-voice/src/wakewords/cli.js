// The `trigger` noun group for the thinksuit-voice CLI: define / train / manage /
// augment the trigger library. Thin surface over store + recorder + trainer.

import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store.js';
import { trainTrigger } from './trainer.js';
import {
    assertMicAvailable,
    createRecorderSession,
    trim,
    writeWavFile,
    peakOf,
    NEG_PROMPTS
} from './recorder.js';
import { SAMPLE_RATE } from '../audio/constants.js';

const TRAINING_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'training');

export const TRIGGER_USAGE = `Usage: thinksuit-voice trigger <command>

  setup                                 Fetch shared training deps (one-time)
  new <name> --phrase "..."             Define a new trigger
  import <name> --phrase "..." --model <onnx> [--samples dir] [--neg-samples dir] [--no-enable]
                                        Adopt an existing model + recordings
  ls                                    List triggers (* = enabled, all enabled are live)
  show <name>                           Show a trigger's details
  rm <name>                             Remove a trigger
  enroll <name> [--positive|--negative] [-n N] [--device id]
                                        Record samples (augment)
  train <name>                          Train/retrain; prints metric delta
  test <name> [--version vN] [--device id]
                                        Live-mic scoring (Ctrl-C to stop)
  promote <name> [vN]                   Make a version current (default latest)
  enable <name>                         Add a trigger to the listening set (additive)
  disable <name>                        Remove a trigger from the listening set
  bind <name> <converse|new>            Bind a trigger to a session action
  threshold <name> <0..1>               Set the detection threshold
  init <name> --phrase "..."            Guided new -> enroll -> train -> enable`;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(args) {
    const positional = [];
    const flags = {};
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        const isFlag = a.startsWith('--') || (a.startsWith('-') && a.length > 1 && Number.isNaN(Number(a)));
        if (isFlag) {
            const key = a.replace(/^-+/, '');
            const next = args[i + 1];
            if (next === undefined || next.startsWith('-')) flags[key] = true;
            else {
                flags[key] = next;
                i++;
            }
        } else {
            positional.push(a);
        }
    }
    return { positional, flags };
}

function requireName(name, verb) {
    if (!name) throw new Error(`usage: thinksuit-voice trigger ${verb} <name>`);
    return name;
}

function deviceOf(flags) {
    return flags.device != null && flags.device !== true ? parseInt(flags.device, 10) : -1;
}

function durationSec(samples) {
    return (samples.length / SAMPLE_RATE).toFixed(2);
}

function fmtMetrics(m = {}) {
    const pct = (x) => (x == null ? '?' : `${(x * 100).toFixed(1)}%`);
    const num = (x, d = 2) => (x == null ? '?' : Number(x).toFixed(d));
    return `recall=${pct(m.recall)} aut=${num(m.aut, 3)} fpph=${num(m.fpph, 1)} thr=${num(m.threshold, 2)}`;
}

function spawnInherit(cmd, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd, stdio: 'inherit' });
        child.on('error', (err) =>
            reject(err.code === 'ENOENT' ? new Error(`\`${cmd}\` not found on PATH`) : err)
        );
        child.on('close', (code) =>
            code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`))
        );
    });
}

// ── verbs ──────────────────────────────────────────────────────────────────

async function setup() {
    console.log('fetching training dependencies (Piper, MUSAN, RIRs, validation features)…');
    await spawnInherit('uv', ['run', 'livekit-wakeword', 'setup', '--skip-acav'], TRAINING_DIR);
}

function newTrigger(name, flags) {
    requireName(name, 'new');
    if (!flags.phrase || flags.phrase === true) {
        throw new Error('usage: thinksuit-voice trigger new <name> --phrase "Hey ThinkSuit"');
    }
    store.createTrigger({ name, phrase: flags.phrase });
    console.log(`created trigger "${name}" — phrase "${flags.phrase}"`);
    console.log(`next: thinksuit-voice trigger enroll ${name} --positive -n 40`);
}

function importTrigger(name, flags) {
    requireName(name, 'import');
    if (!flags.phrase || flags.phrase === true) {
        throw new Error('usage: thinksuit-voice trigger import <name> --phrase "..." --model <onnx>');
    }
    if (!flags.model || flags.model === true) throw new Error('need --model <path to .onnx>');
    if (!existsSync(flags.model)) throw new Error(`model not found: ${flags.model}`);

    store.createTrigger({ name, phrase: flags.phrase });
    const version = store.registerVersion(name, { onnxPath: flags.model, metrics: null });
    store.promote(name, version);
    const pos = flags.samples && flags.samples !== true ? store.adoptSamples(name, 'positive', flags.samples) : 0;
    const neg =
        flags['neg-samples'] && flags['neg-samples'] !== true
            ? store.adoptSamples(name, 'negative', flags['neg-samples'])
            : 0;
    const doEnable = !flags['no-enable'];
    if (doEnable) store.setEnabled(name, true);

    console.log(
        `imported "${name}" as ${version} (model adopted${pos ? `, +${pos} positive` : ''}` +
            `${neg ? `, +${neg} negative` : ''} samples), promoted${doEnable ? ' and enabled' : ''}.`
    );
    console.log('Restart the voice daemon to load it.');
}

function ls() {
    const names = store.listTriggers();
    if (!names.length) {
        console.log('no triggers yet — create one: thinksuit-voice trigger new <name> --phrase "..."');
        return;
    }
    for (const n of names) {
        const m = store.readManifest(n);
        console.log(
            `${m.enabled ? '*' : ' '} ${n}  phrase="${m.phrase}" →${m.binding || 'converse'} ` +
                `current=${m.current || '-'} threshold=${m.threshold} ` +
                `pos=${store.countSamples(n, 'positive')} neg=${store.countSamples(n, 'negative')}`
        );
    }
}

function show(name) {
    requireName(name, 'show');
    const m = store.readManifest(name);
    console.log(JSON.stringify(
        {
            ...m,
            samples: { positive: store.countSamples(name, 'positive'), negative: store.countSamples(name, 'negative') }
        },
        null,
        2
    ));
}

function rm(name) {
    requireName(name, 'rm');
    store.removeTrigger(name);
    console.log(`removed trigger "${name}"`);
}

async function enroll(name, flags) {
    requireName(name, 'enroll');
    const m = store.readManifest(name);
    const kind = flags.negative ? 'negative' : 'positive';
    const count = parseInt(flags.n || flags.count || (kind === 'negative' ? 20 : 40), 10);
    const seconds = parseFloat(flags.seconds || 2.0);

    await assertMicAvailable();
    console.log(`recording ${count} ${kind} clips for "${name}". Vary your delivery; don't over-enunciate.`);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const session = await createRecorderSession({ deviceId: deviceOf(flags) });
    let idx = store.nextSampleIndex(name, kind);
    try {
        for (let k = 0; k < count; k++) {
            const prompt = kind === 'negative' ? NEG_PROMPTS[k % NEG_PROMPTS.length] : m.phrase;
            await rl.question(`[${k + 1}/${count}] press Enter, then say "${prompt}" > `);
            await delay(350); // let the keystroke pass before we start collecting
            const clip = trim(await session.captureClip(seconds));
            const path = store.sampleClipPath(name, kind, idx);
            writeWavFile(path, clip);
            const peak = peakOf(clip);
            const warn = peak < 0.05 ? '  <-- quiet, consider re-recording' : '';
            console.log(`  saved ${basename(path)} (${durationSec(clip)}s peak=${peak.toFixed(2)})${warn}`);
            idx++;
        }
    } finally {
        session.close();
        rl.close();
    }
    console.log(`enrolled ${count} ${kind} clips. Next: thinksuit-voice trigger train ${name}`);
}

async function train(name) {
    requireName(name, 'train');
    const before = store.readManifest(name);
    const prev = before.current
        ? before.versions.find((v) => v.version === before.current)?.metrics
        : null;

    console.log(`training "${name}"… first run ~50 min, augment ~12 min. Live logs below.`);
    const { version, metrics } = await trainTrigger(name, {
        onProgress: (msg) => {
            if (msg.event === 'phase') console.log(`  ${msg.phase}: ${msg.status}`);
        }
    });
    console.log(`trained ${version} — ${fmtMetrics(metrics)}`);
    if (prev) {
        const d = (a, b) => (a == null || b == null ? '?' : (b - a >= 0 ? '+' : '') + (b - a).toFixed(3));
        console.log(`  vs ${before.current}: recall ${d(prev.recall, metrics.recall)} aut ${d(prev.aut, metrics.aut)} fpph ${d(prev.fpph, metrics.fpph)}`);
    }
    console.log(`promote when ready: thinksuit-voice trigger promote ${name} ${version}`);
}

async function test(name, flags) {
    requireName(name, 'test');
    const m = store.readManifest(name);
    const classifierPath =
        flags.version && flags.version !== true
            ? store.versionModelPath(name, flags.version)
            : store.currentModelPath(name);

    await assertMicAvailable();
    // Imported lazily so the heavy ONNX/PortAudio modules only load for `test`.
    const { createPipeline } = await import('../wake/pipeline.js');
    const { createDetector } = await import('../wake/detector.js');
    const { createCapture } = await import('../audio/capture.js');
    const { resolveMelModelPath, resolveEmbeddingModelPath } = await import('../paths.js');

    const pipeline = await createPipeline({
        melPath: resolveMelModelPath(),
        embeddingPath: resolveEmbeddingModelPath(),
        heads: [{ name, classifierPath }]
    });
    const detector = createDetector({
        pipeline,
        thresholds: { [name]: m.threshold },
        onScore: (scores) => {
            const s = scores[name] ?? 0;
            const bar = '#'.repeat(Math.round(s * 30));
            process.stdout.write(`\rscore=${s.toFixed(3)} |${bar.padEnd(30)}|`);
        },
        onWake: ({ confidence }) => process.stdout.write(`\nWAKE confidence=${confidence.toFixed(3)}\n`)
    });
    const capture = createCapture({
        deviceId: deviceOf(flags),
        onFrames: (frames) => detector.push(frames),
        onError: (e) => console.error('\naudio error:', e.message)
    });
    console.log(`testing "${name}" (threshold ${m.threshold}). Say the phrase. Ctrl-C to stop.`);
    capture.start();
}

function promote(name, version) {
    requireName(name, 'promote');
    const m = store.promote(name, version);
    console.log(`"${name}" current → ${m.current}`);
}

function enable(name) {
    requireName(name, 'enable');
    store.setEnabled(name, true);
    const live = store.getEnabledTriggers();
    console.log(`"${name}" enabled. Listening set: ${live.join(', ')}. Restart the voice daemon to load it.`);
}

function disable(name) {
    requireName(name, 'disable');
    store.setEnabled(name, false);
    const live = store.getEnabledTriggers();
    console.log(
        `"${name}" disabled. Listening set: ${live.length ? live.join(', ') : '(none)'}. Restart the voice daemon to apply.`
    );
}

function bind(name, action) {
    requireName(name, 'bind');
    if (!action) throw new Error('usage: thinksuit-voice trigger bind <name> <converse|new>');
    const m = store.setBinding(name, action);
    console.log(`"${name}" bound → ${m.binding}. Restart the voice daemon to apply.`);
}

function thresholdCmd(name, value) {
    requireName(name, 'threshold');
    if (value == null) throw new Error('usage: thinksuit-voice trigger threshold <name> <0..1>');
    const m = store.setThreshold(name, value);
    console.log(`"${name}" threshold → ${m.threshold}`);
}

async function init(name, flags) {
    requireName(name, 'init');
    if (!flags.phrase || flags.phrase === true) {
        throw new Error('usage: thinksuit-voice trigger init <name> --phrase "Hey ThinkSuit"');
    }
    store.createTrigger({ name, phrase: flags.phrase });
    console.log(`created "${name}". Let's enroll your voice, then train.\n`);
    await enroll(name, { ...flags, positive: true });
    console.log('\nNow some negatives (things that are NOT the phrase):\n');
    await enroll(name, { ...flags, negative: true, n: flags.negn || 20 });
    console.log('');
    await train(name);
    store.promote(name);
    store.setEnabled(name, true);
    console.log(`\n"${name}" is trained, promoted, and enabled. Test it: thinksuit-voice trigger test ${name}`);
    console.log('Restart the voice daemon to use it hands-free.');
}

export async function runTriggerCli(args) {
    const [verb, ...rest] = args;
    const { positional, flags } = parseArgs(rest);
    switch (verb) {
        case 'setup': return setup();
        case 'new': return newTrigger(positional[0], flags);
        case 'import': return importTrigger(positional[0], flags);
        case 'ls': case 'list': return ls();
        case 'show': return show(positional[0]);
        case 'rm': case 'remove': return rm(positional[0]);
        case 'enroll': return enroll(positional[0], flags);
        case 'train': return train(positional[0]);
        case 'test': return test(positional[0], flags);
        case 'promote': return promote(positional[0], positional[1]);
        case 'enable': return enable(positional[0]);
        case 'disable': return disable(positional[0]);
        case 'bind': return bind(positional[0], positional[1]);
        case 'threshold': return thresholdCmd(positional[0], positional[1]);
        case 'init': return init(positional[0], flags);
        default:
            console.error(TRIGGER_USAGE);
            process.exitCode = 1;
    }
}
