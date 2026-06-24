// Audio feedback cues via macOS `afplay`. createCuePlayer(cfg) ->
// { play(name), stop(), startLoop(name), stopLoop() }.
//
// One-shots: play(name) resolves when the sound finishes — the daemon awaits the
// start cue before arming capture so the beep isn't recorded into the utterance
// (there is no echo cancellation). play never rejects, so awaiting it can't stall
// capture. stop() kills an in-flight one-shot.
//
// Loop: startLoop(name) replays a sound until stopLoop() — used for the "working"
// cue that runs while a turn is in flight (submitted -> response received).

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

// Probe a sound file's real duration (ms) via macOS `afinfo`, so capture can trim
// exactly the cue rather than guessing. Returns null if it can't be determined.
export async function probeDurationMs(file) {
    try {
        const { stdout } = await run('/usr/bin/afinfo', [file]);
        const m = stdout.match(/estimated duration:\s*([\d.]+)\s*sec/i);
        if (m) return Math.round(parseFloat(m[1]) * 1000);
    } catch {
        // fall through
    }
    return null;
}

export function createCuePlayer({ enabled = true, start, end, error, working } = {}) {
    const sounds = { start, end, error, working };
    let current = null;
    let loopProc = null;
    let looping = false;

    function stop() {
        if (current) {
            current.kill();
            current = null;
        }
    }

    function play(name) {
        const file = sounds[name];
        if (!enabled || !file) return Promise.resolve();
        stop();
        return new Promise((resolve) => {
            const proc = spawn('afplay', [file], { stdio: 'ignore' });
            current = proc;
            const done = () => {
                if (current === proc) current = null;
                resolve();
            };
            proc.on('error', done);
            proc.on('close', done);
        });
    }

    function stopLoop() {
        looping = false;
        if (loopProc) {
            loopProc.kill();
            loopProc = null;
        }
    }

    function startLoop(name) {
        const file = sounds[name];
        if (!enabled || !file) return;
        stopLoop();
        looping = true;
        const spin = () => {
            if (!looping) return;
            const proc = spawn('afplay', [file], { stdio: 'ignore' });
            loopProc = proc;
            proc.on('error', () => {
                looping = false;
                if (loopProc === proc) loopProc = null;
            });
            proc.on('close', () => {
                if (looping && loopProc === proc) spin();
            });
        };
        spin();
    }

    return { play, stop, startLoop, stopLoop };
}
