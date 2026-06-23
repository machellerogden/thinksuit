#!/usr/bin/env python3
"""Guided recorder for real-voice wake-word positives.

Captures short utterances of the wake phrase, energy-trims each to the spoken
part, and saves them as clip_NNNNNN.wav (16 kHz mono) ready to be mixed into the
training positives. Run via the training venv (has pyaudio):

    cd packages/thinksuit-voice/training
    uv run python ../tools/record.py --count 120

Tips while recording: vary it — fast and lazy like you actually talk, some
slower, different distances from the mic, normal room. Don't over-enunciate;
the whole point is to teach the model your *natural* delivery.
"""
from __future__ import annotations

import argparse
import sys
import time
import wave
from pathlib import Path

import numpy as np
import pyaudio

HERE = Path(__file__).resolve().parent
TRAINING = HERE.parent / "training"

SR = 16000
FRAME = 320  # 20ms

# Hard negatives: things to say that are NOT the wake word, so the model learns
# to discriminate the phrase from your voice in general (esp. the "hey" onset and
# the partials "think"/"suit"). Cycled through during --negatives recording.
NEG_PROMPTS = [
    "hey",
    "hey there",
    "hey what's up",
    "hey hold on",
    "hey can you hear me",
    "hey think",
    "think",
    "suit",
    "thinksuit",
    "okay",
    "hello",
    "good morning",
    "what time is it",
    "(say any random sentence)",
    "(just talk normally for a second)",
]


def trim(samples: np.ndarray, pad_ms: int = 120) -> np.ndarray:
    """Energy-trim to the spoken region with a little padding."""
    if samples.size == 0:
        return samples
    a = samples.astype(np.float32)
    peak = float(np.abs(a).max()) or 1.0
    thr = 0.08 * peak
    n_frames = len(a) // FRAME
    loud = [i for i in range(n_frames) if np.abs(a[i * FRAME:(i + 1) * FRAME]).max() > thr]
    if not loud:
        return samples
    pad = int(SR * pad_ms / 1000)
    start = max(0, loud[0] * FRAME - pad)
    end = min(len(a), (loud[-1] + 1) * FRAME + pad)
    return samples[start:end]


def save_wav(path: Path, samples: np.ndarray) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(samples.astype(np.int16).tobytes())


def resolve_device(pa, spec: str | None) -> int | None:
    """Resolve --device (index or case-insensitive name substring) to an index."""
    if spec is None:
        return None
    if spec.isdigit():
        return int(spec)
    for i in range(pa.get_device_count()):
        info = pa.get_device_info_by_index(i)
        if info["maxInputChannels"] > 0 and spec.lower() in info["name"].lower():
            return i
    sys.exit(f"no input device matching {spec!r}")


def record_one(stream, seconds: float, in_ch: int) -> np.ndarray:
    n = int(SR * seconds)
    frames = []
    got = 0
    while got < n:
        data = stream.read(FRAME, exception_on_overflow=False)
        frames.append(np.frombuffer(data, dtype=np.int16))
        got += FRAME
    samples = np.concatenate(frames)
    if in_ch == 2:  # downmix stereo (e.g. Yeti) to mono
        samples = samples.reshape(-1, 2).mean(axis=1).astype(np.int16)
    return samples


def main() -> None:
    ap = argparse.ArgumentParser(description="Record real-voice wake-word clips")
    ap.add_argument("--phrase", default="Hey ThinkSuit")
    ap.add_argument("--count", type=int, default=120, help="how many utterances to record")
    ap.add_argument("--seconds", type=float, default=2.0, help="record window per utterance")
    ap.add_argument("--negatives", action="store_true",
                    help="record NOT-the-phrase clips (cycles hard-negative prompts)")
    ap.add_argument("--outdir", default=None, help="where to write clip_NNNNNN.wav")
    ap.add_argument("--start-index", type=int, default=None, help="resume numbering from here")
    ap.add_argument("--device", default=None, help="input device index or name substring (e.g. 'Yeti')")
    args = ap.parse_args()

    if args.outdir:
        outdir = Path(args.outdir)
    else:
        sub = "hey_thinksuit_negatives" if args.negatives else "hey_thinksuit"
        outdir = TRAINING / "voice_samples" / sub
    outdir.mkdir(parents=True, exist_ok=True)

    if args.start_index is not None:
        idx = args.start_index
    else:
        existing = sorted(outdir.glob("clip_*.wav"))
        idx = (int(existing[-1].stem.split("_")[1]) + 1) if existing else 0

    mode = "NEGATIVES (not the wake word)" if args.negatives else f"phrase {args.phrase!r}"
    print(f"mode:     {mode}")
    print(f"outdir:   {outdir}")
    print(f"count:    {args.count}   starting at clip_{idx:06d}")
    print("Press Enter, wait for 'now!', then say the prompted text. Ctrl-C to stop.\n")

    pa = pyaudio.PyAudio()
    dev_index = resolve_device(pa, args.device)
    resolved_index = dev_index if dev_index is not None else pa.get_default_input_device_info()["index"]
    dev_info = pa.get_device_info_by_index(resolved_index)
    in_ch = min(2, max(1, int(dev_info["maxInputChannels"])))
    print(f"device:   {dev_info['name']}  (channels={in_ch})")
    stream = pa.open(
        format=pyaudio.paInt16, channels=in_ch, rate=SR, input=True,
        input_device_index=dev_index, frames_per_buffer=FRAME,
    )
    recorded = 0
    try:
        for k in range(args.count):
            say_text = NEG_PROMPTS[k % len(NEG_PROMPTS)] if args.negatives else args.phrase
            input(f"[{k + 1}/{args.count}] Press Enter, wait for 'now!', then say \"{say_text}\" > ")
            time.sleep(0.45)  # let the Enter keystroke pass
            # flush audio buffered during the prompt (this is where the click hid)
            avail = stream.get_read_available()
            if avail:
                stream.read(avail, exception_on_overflow=False)
            print("    now!", flush=True)
            raw = record_one(stream, args.seconds, in_ch)
            clip = trim(raw)
            dur = len(clip) / SR
            path = outdir / f"clip_{idx:06d}.wav"
            save_wav(path, clip)
            peak = float(np.abs(clip.astype(np.float32)).max()) / 32768.0
            flag = "  <-- very quiet, consider re-recording" if peak < 0.05 else ""
            print(f"    saved {path.name}  ({dur:.2f}s, peak={peak:.2f}){flag}")
            idx += 1
            recorded += 1
    except KeyboardInterrupt:
        print("\nstopped early.")
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()
    print(f"\nDone. Recorded {recorded} clips into {outdir}")


if __name__ == "__main__":
    main()
