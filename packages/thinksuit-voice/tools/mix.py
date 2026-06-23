#!/usr/bin/env python3
"""Mix real-voice recordings into a wake-word model's positives and/or negatives.

Reads recordings from voice_samples/<name>/, peak-normalizes, drops too-quiet
ones, holds out a few for an honest test split, and oversamples the rest into the
model's positive_*/negative_* dirs using the clip_NNNNNN.wav convention the
pipeline expects. Idempotent: re-running first removes previously injected real
clips.

  - Positives are injected starting at the synthetic count from the config
    (n_samples / n_samples_val) and cleared by that same threshold.
  - Negatives are injected at a high offset (their synthetic count is capped and
    not knowable from config) and cleared by that offset.

After mixing, re-run: augment -> train -> export.

    cd packages/thinksuit-voice/training
    uv run python ../tools/mix.py configs/hey_thinksuit.yaml \
        --samples-dir voice_samples/hey_thinksuit \
        --neg-samples-dir voice_samples/hey_thinksuit_negatives
"""
from __future__ import annotations

import argparse
import wave
from pathlib import Path

import numpy as np
import soundfile as sf

from livekit.wakeword.config import load_config

NEG_OFFSET = 900000  # real negatives go here; synthetic negatives are < n_samples


def read_mono16k(path: Path) -> np.ndarray:
    a, sr = sf.read(str(path), dtype="float32")
    if a.ndim > 1:
        a = a.mean(axis=1)
    if sr != 16000:
        raise SystemExit(f"{path}: expected 16k, got {sr}")
    return a


def normalize_int16(a: np.ndarray, target_peak: float) -> np.ndarray:
    peak = float(np.abs(a).max()) or 1.0
    a = a * (target_peak / peak)
    return np.clip(a * 32768.0, -32768, 32767).astype(np.int16)


def save_wav(path: Path, samples: np.ndarray) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(samples.tobytes())


def clear_injected(clip_dir: Path, threshold: int) -> int:
    """Remove real clips injected by a prior run (index >= threshold)."""
    removed = 0
    for p in clip_dir.glob("clip_*.wav"):
        try:
            if int(p.stem.split("_")[1]) >= threshold:
                p.unlink()
                removed += 1
        except (IndexError, ValueError):
            continue
    return removed


def count_below(clip_dir: Path, threshold: int) -> int:
    n = 0
    for p in clip_dir.glob("clip_*.wav"):
        try:
            if int(p.stem.split("_")[1]) < threshold:
                n += 1
        except (IndexError, ValueError):
            continue
    return n


def inject(clip_dir: Path, start_idx: int, sources: list[np.ndarray], total: int) -> None:
    """Write `total` clips by round-robin oversampling `sources`, from start_idx."""
    for i in range(total):
        save_wav(clip_dir / f"clip_{start_idx + i:06d}.wav", sources[i % len(sources)])


def load_clips(samples_dir: str, min_peak: float, target_peak: float):
    paths = sorted(Path(samples_dir).glob("clip_*.wav"))
    kept, dropped = [], 0
    for p in paths:
        a = read_mono16k(p)
        if float(np.abs(a).max()) < min_peak:
            dropped += 1
            continue
        kept.append(normalize_int16(a, target_peak))
    return paths, kept, dropped


def mix_group(label, samples_dir, train_dir, test_dir, train_base, test_base,
              train_copies, test_copies, holdout, min_peak, target_peak):
    for d in (train_dir, test_dir):
        if not d.exists():
            raise SystemExit(f"missing {d} — run generate first")
    paths, kept, dropped = load_clips(samples_dir, min_peak, target_peak)
    if len(kept) <= holdout:
        raise SystemExit(f"{label}: only {len(kept)} usable clips; need > holdout ({holdout})")
    test_src, train_src = kept[:holdout], kept[holdout:]
    rt = clear_injected(train_dir, train_base)
    re = clear_injected(test_dir, test_base)
    inject(train_dir, train_base, train_src, train_copies)
    inject(test_dir, test_base, test_src, test_copies)
    synth = count_below(train_dir, train_base)
    frac = train_copies / (synth + train_copies) if (synth + train_copies) else 0.0
    print(f"[{label}] {len(paths)} found, {dropped} dropped (<{min_peak}), {len(kept)} kept; "
          f"cleared train={rt} test={re}")
    print(f"  train: {synth} synthetic + {train_copies} real ({len(train_src)} uniques) "
          f"= {synth + train_copies}  (real {frac:.0%})")
    print(f"  test:  +{test_copies} real ({len(test_src)} uniques)")


def main() -> None:
    ap = argparse.ArgumentParser(description="Mix real-voice clips into a wake-word model")
    ap.add_argument("config", help="wake word config YAML")
    ap.add_argument("--samples-dir", default=None, help="positive recordings dir")
    ap.add_argument("--neg-samples-dir", default=None, help="negative recordings dir")
    ap.add_argument("--min-peak", type=float, default=0.05, help="drop clips quieter than this")
    ap.add_argument("--target-peak", type=float, default=0.5, help="peak-normalize each clip to this")
    ap.add_argument("--train-copies", type=int, default=5000, help="real positives in positive_train")
    ap.add_argument("--test-copies", type=int, default=300, help="real positives in positive_test")
    ap.add_argument("--holdout", type=int, default=15, help="positive uniques reserved for test")
    ap.add_argument("--neg-train-copies", type=int, default=5000, help="real negatives in negative_train")
    ap.add_argument("--neg-test-copies", type=int, default=300, help="real negatives in negative_test")
    ap.add_argument("--neg-holdout", type=int, default=15, help="negative uniques reserved for test")
    args = ap.parse_args()

    if not args.samples_dir and not args.neg_samples_dir:
        raise SystemExit("provide --samples-dir and/or --neg-samples-dir")

    cfg = load_config(args.config)
    md = cfg.model_output_dir

    if args.samples_dir:
        mix_group("positives", args.samples_dir,
                  md / "positive_train", md / "positive_test",
                  cfg.n_samples, cfg.n_samples_val,
                  args.train_copies, args.test_copies, args.holdout,
                  args.min_peak, args.target_peak)

    if args.neg_samples_dir:
        mix_group("negatives", args.neg_samples_dir,
                  md / "negative_train", md / "negative_test",
                  NEG_OFFSET, NEG_OFFSET,
                  args.neg_train_copies, args.neg_test_copies, args.neg_holdout,
                  args.min_peak, args.target_peak)

    print("\nNext: augment -> train -> export:")
    print(f"  uv run livekit-wakeword augment {args.config}")
    print(f"  uv run livekit-wakeword train {args.config}")
    print(f"  uv run livekit-wakeword export {args.config}")


if __name__ == "__main__":
    main()
