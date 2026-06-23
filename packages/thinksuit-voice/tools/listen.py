#!/usr/bin/env python3
"""Iteration-1 (Reading A) live-mic wake-word PoC.

Throwaway proof that mic -> wake event works in Python. This is NOT the runtime
home: the runtime fork (A: Python subprocess vs B: all-Node onnxruntime) is
deferred to Iteration 2. See ../SPEC.md.

Run via the training venv (it has livekit-wakeword + pyaudio installed):

    cd packages/thinksuit-voice/training
    uv run python ../tools/listen.py [path/to/model.onnx] [--threshold 0.5]

With no model arg it prefers the trained hey_thinksuit model, falling back to
the calibration model. macOS will prompt for microphone permission on first run.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from livekit.wakeword import WakeWordListener, WakeWordModel

HERE = Path(__file__).resolve().parent
TRAINING = HERE.parent / "training"
DEFAULT_CANDIDATES = [
    TRAINING / "output" / "hey_thinksuit" / "hey_thinksuit.onnx",
    TRAINING / "output" / "calibration" / "calibration.onnx",
]


def resolve_model(arg: str | None) -> Path:
    if arg:
        p = Path(arg)
        if not p.exists():
            sys.exit(f"model not found: {p}")
        return p
    for c in DEFAULT_CANDIDATES:
        if c.exists():
            return c
    sys.exit("no model found; train one or pass an explicit path")


def monitor(model_path: Path) -> None:
    """Diagnostic: print a live score every 80ms regardless of threshold.

    Say the phrase a few times and watch the number — tells us whether your
    voice lands near the threshold (calibration fix) or far below it (retrain).
    """
    from collections import deque

    import numpy as np
    import pyaudio

    name = model_path.stem
    model = WakeWordModel(models=[str(model_path)])
    SR, FRAME, CHUNK_FRAMES = 16000, 1280, 25  # 80ms frames, 2s window

    pa = pyaudio.PyAudio()
    stream = pa.open(format=pyaudio.paInt16, channels=1, rate=SR, input=True, frames_per_buffer=FRAME)
    buf: deque = deque(maxlen=CHUNK_FRAMES)
    peak = 0.0
    print("monitor mode: say the phrase; live score shown (Ctrl-C to stop)")
    try:
        while True:
            data = stream.read(FRAME, exception_on_overflow=False)
            buf.append(np.frombuffer(data, dtype=np.int16))
            if len(buf) < CHUNK_FRAMES:
                continue
            s = model.predict(np.concatenate(list(buf))).get(name, 0.0)
            peak = max(peak, s)
            bar = "#" * int(s * 40)
            print(f"\rscore={s:0.3f}  peak={peak:0.3f}  |{bar:<40}|", end="", flush=True)
    except KeyboardInterrupt:
        print(f"\npeak score this session: {peak:.3f}")
    finally:
        stream.stop_stream()
        stream.close()
        pa.terminate()


async def main() -> None:
    ap = argparse.ArgumentParser(description="Live-mic wake-word PoC")
    ap.add_argument("model", nargs="?", default=None, help="path to wake-word .onnx")
    ap.add_argument("--threshold", type=float, default=0.5, help="detection threshold (0-1)")
    ap.add_argument("--debounce", type=float, default=2.0, help="min seconds between detections")
    ap.add_argument("--monitor", action="store_true", help="diagnostic: print live score, no gating")
    args = ap.parse_args()

    model_path = resolve_model(args.model)
    print(f"model:     {model_path}")
    if args.monitor:
        monitor(model_path)
        return

    print(f"threshold: {args.threshold}   debounce: {args.debounce}s")
    model = WakeWordModel(models=[str(model_path)])

    print("listening... say the wake word (Ctrl-C to stop)")
    async with WakeWordListener(model, threshold=args.threshold, debounce=args.debounce) as listener:
        while True:
            d = await listener.wait_for_detection()
            print(f"WAKE  name={d.name}  confidence={d.confidence:.3f}  t={d.timestamp:.1f}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nstopped")
