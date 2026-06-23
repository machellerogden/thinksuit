#!/usr/bin/env python3
"""Parity ground-truth for the all-Node (fork B) runtime spike.

Windows a clip to exactly 2s (lead-padded, utterance at END — the convention
predict() needs), dumps the exact float32 samples to a raw .f32 file so the Node
spike consumes byte-identical input, and prints the reference score plus the
ONNX I/O names. Run from training/ via its venv:

    uv run python ../tools/parity_ref.py output/hey_thinksuit/hey_thinksuit.onnx \
        voice_samples/hey_thinksuit/clip_000000.wav /tmp/parity_input.f32
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import soundfile as sf

from livekit.wakeword import WakeWordModel
from livekit.wakeword.resources import get_embedding_model_path, get_mel_model_path

N = 32000  # 2s @ 16k


def window(a: np.ndarray) -> np.ndarray:
    if len(a) < N:
        return np.concatenate([np.zeros(N - len(a), "float32"), a]).astype("float32")
    return a[-N:].astype("float32")


def io_names(path):
    s = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    return ([i.name for i in s.get_inputs()], [o.name for o in s.get_outputs()],
            [i.shape for i in s.get_inputs()], [o.shape for o in s.get_outputs()])


def main() -> None:
    clf_path, clip_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    a, sr = sf.read(clip_path, dtype="float32")
    if a.ndim > 1:
        a = a.mean(axis=1)
    assert sr == 16000, sr
    w = window(a)
    Path(out_path).write_bytes(w.tobytes())

    model = WakeWordModel(models=[clf_path])
    name = Path(clf_path).stem
    score = model.predict(w).get(name, 0.0)

    print(f"clip:       {clip_path}")
    print(f"window:     {len(w)} samples -> {out_path} ({Path(out_path).stat().st_size} bytes)")
    print(f"REF SCORE:  {score:.6f}  (name={name})")
    for label, p in (("mel", get_mel_model_path()),
                     ("embedding", get_embedding_model_path()),
                     ("classifier", clf_path)):
        ins, outs, ishp, oshp = io_names(p)
        print(f"  {label:10s} in={ins}{ishp}  out={outs}{oshp}")


if __name__ == "__main__":
    main()
