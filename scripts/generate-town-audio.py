#!/usr/bin/env python3
"""Generate the town's original music and UI sounds (Python stdlib + macOS afconvert).

No samples, downloaded music, third-party melody or synthesis dependency is used.
Run from any directory: python3 scripts/generate-town-audio.py
"""

import argparse
from array import array
import json
import math
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
import wave


RATE = 22050
BPM = 96
BEAT = 60 / BPM
LOOP_SECONDS = 16 * 4 * BEAT
TAU = math.tau


def note_frequency(midi):
    return 440 * 2 ** ((midi - 69) / 12)


def add_note(samples, start, midi, duration, level, voice="wood", circular=False):
    """Soft, short-attack additive voices, with a silent release to avoid clicks."""
    frequency = note_frequency(midi)
    offset = round(start * RATE)
    length = round(duration * RATE)
    for i in range(length):
        t = i / RATE
        release = min(1.0, (length - 1 - i) / (0.045 * RATE))
        attack = min(1.0, t / (0.007 if voice != "bass" else 0.018))
        phase = TAU * frequency * t
        if voice == "bass":
            decay = math.exp(-t * 2.6)
            tone = math.sin(phase) + 0.12 * math.sin(phase * 2)
        elif voice == "pluck":
            decay = math.exp(-t * 3.6)
            tone = (math.sin(phase) + 0.26 * math.exp(-t * 5) * math.sin(phase * 2)
                    + 0.08 * math.exp(-t * 8) * math.sin(phase * 3))
        else:
            decay = math.exp(-t * 4.4)
            tone = (math.sin(phase) + 0.28 * math.exp(-t * 8) * math.sin(phase * 3)
                    + 0.045 * math.exp(-t * 12) * math.sin(phase * 7))
        value = level * attack * release * decay * tone
        target = offset + i
        if circular:
            samples[target % len(samples)] += value
        elif target < len(samples):
            samples[target] += value


def add_brush(samples, start, level, rng):
    """A very quiet, filtered shaker; no sharp claps or heavy drums."""
    offset = round(start * RATE)
    length = round(0.075 * RATE)
    previous = 0.0
    for i in range(length):
        noise = rng.uniform(-1, 1)
        soft_noise = (noise + previous) * 0.5
        previous = noise
        envelope = math.sin(math.pi * i / length) ** 2 * math.exp(-i / (RATE * 0.028))
        samples[(offset + i) % len(samples)] += level * envelope * soft_noise


def finish(samples, peak):
    """Leave ample headroom and make the boundary quiet without a long fade."""
    mean = sum(samples) / len(samples)
    maximum = max(abs(sample - mean) for sample in samples)
    gain = peak / maximum if maximum else 1.0
    edge = round(RATE * 0.008)
    for i in range(len(samples)):
        fade = min(1.0, i / edge, (len(samples) - 1 - i) / edge)
        samples[i] = (samples[i] - mean) * gain * fade
    return samples


def make_music():
    samples = array("d", [0.0]) * round(LOOP_SECONDS * RATE)
    rng = random.Random(20261023)
    # Original 16-bar composition in C major: two related eight-bar phrases.
    # Each tuple is (bass, four gentle arpeggio notes); inversions keep motion small.
    chords = [
        (48, [60, 64, 67, 71]), (47, [59, 62, 67, 69]),
        (45, [60, 64, 67, 69]), (41, [57, 60, 64, 67]),
        (40, [55, 60, 64, 67]), (43, [59, 62, 65, 67]),
        (41, [57, 60, 64, 67]), (43, [59, 62, 67, 69]),
        (48, [60, 64, 67, 71]), (47, [59, 62, 67, 69]),
        (45, [60, 64, 67, 69]), (41, [57, 60, 64, 67]),
        (40, [55, 60, 64, 67]), (38, [57, 60, 62, 65]),
        (43, [60, 62, 67, 69]), (43, [59, 62, 65, 67]),
    ]
    # (beat within bar, MIDI note, duration in beats). Gaps give the tune room.
    melody = [
        [(0, 76, 0.8), (1, 79, 0.5), (1.75, 81, 0.5), (2.5, 79, 1.0)],
        [(0, 74, 1.0), (1.5, 71, 0.5), (2.5, 74, 1.0)],
        [(0, 72, 0.7), (1, 76, 0.7), (2, 79, 0.5), (2.75, 76, 0.8)],
        [(0, 77, 0.8), (1.5, 76, 0.6), (2.5, 72, 1.0)],
        [(0, 76, 0.6), (1, 79, 0.7), (2, 76, 0.5), (3, 74, 0.6)],
        [(0, 74, 0.6), (1, 71, 0.6), (2.5, 67, 1.0)],
        [(0, 69, 0.6), (1, 72, 0.6), (2, 76, 0.5), (2.75, 74, 0.8)],
        [(0, 74, 0.8), (1.5, 71, 0.6), (2.5, 67, 1.1)],
        [(0, 76, 0.8), (1, 79, 0.5), (1.75, 81, 0.5), (2.5, 79, 1.0)],
        [(0, 74, 0.7), (1, 79, 0.5), (2, 74, 0.5), (3, 71, 0.5)],
        [(0, 72, 0.6), (1, 76, 0.6), (2, 81, 0.7), (3, 79, 0.5)],
        [(0, 77, 0.9), (1.5, 76, 0.6), (2.5, 72, 1.0)],
        [(0, 76, 0.6), (1, 79, 0.5), (2, 76, 0.5), (3, 72, 0.5)],
        [(0, 74, 0.8), (1.5, 77, 0.6), (2.5, 76, 0.8)],
        [(0, 74, 0.6), (1, 72, 0.5), (2, 69, 0.6), (3, 72, 0.5)],
        [(0, 71, 0.8), (1.5, 74, 0.6), (2.5, 67, 1.0)],
    ]
    for bar, (bass, chord) in enumerate(chords):
        start = bar * 4 * BEAT
        add_note(samples, start, bass, BEAT * 1.7, 0.18, "bass", True)
        add_note(samples, start + 2 * BEAT, bass + 7, BEAT * 1.45, 0.10, "bass", True)
        for step, note in enumerate([chord[0], chord[2], chord[1], chord[3]]):
            add_note(samples, start + (step + 0.45) * BEAT, note, BEAT * 1.55,
                     0.083 if step % 2 == 0 else 0.069, "pluck", True)
        for beat, note, duration in melody[bar]:
            add_note(samples, start + beat * BEAT, note, (duration + 0.3) * BEAT,
                     0.135 if beat == 0 else 0.118, "wood", True)
        for step in range(8):
            add_brush(samples, start + (step * 0.5 + 0.02) * BEAT,
                      0.010 if step % 2 else 0.016, rng)
    # Two restrained, circular room reflections retain note tails across the loop.
    dry = samples[:]
    for delay, level in [(0.125, 0.14), (0.218, 0.075)]:
        offset = round(delay * RATE)
        for i, sample in enumerate(dry):
            samples[(i + offset) % len(samples)] += sample * level
    return finish(samples, 0.58)


def make_effect(duration, notes, peak):
    samples = array("d", [0.0]) * round(duration * RATE)
    for start, midi, length, level in notes:
        add_note(samples, start, midi, length, level, "wood")
    return finish(samples, peak)


def write_wave(path, samples):
    pcm = array("h", (round(sample * 32767) for sample in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())


def analyze(path):
    with wave.open(str(path), "rb") as source:
        rate = source.getframerate()
        assert source.getnchannels() == 1 and source.getsampwidth() == 2
        samples = array("h", source.readframes(source.getnframes()))
    if sys.byteorder != "little":
        samples.byteswap()
    peak = max(abs(value) for value in samples) / 32768
    rms = math.sqrt(sum(value * value for value in samples) / len(samples)) / 32768
    return {
        "seconds": round(len(samples) / rate, 4),
        "peak_dbfs": round(20 * math.log10(peak), 2),
        "rms_dbfs": round(20 * math.log10(rms), 2),
        "clipped_samples": sum(abs(value) >= 32767 for value in samples),
        "loop_boundary_step": round(abs(samples[-1] - samples[0]) / 32768, 6),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--afconvert", default=shutil.which("afconvert"),
                        help="Path to the macOS AAC encoder/decoder")
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "miniapp/town-audio/audio")
    args = parser.parse_args()
    if not args.afconvert:
        parser.error("macOS afconvert is required to encode the compact AAC loop")
    args.output.mkdir(parents=True, exist_ok=True)
    report = {}
    with tempfile.TemporaryDirectory(prefix="little-town-music-") as directory:
        temp = Path(directory)
        music = args.output / "cheerful-loop.m4a"
        write_wave(temp / "music.wav", make_music())
        subprocess.run([args.afconvert, str(temp / "music.wav"), str(music),
                        "-f", "m4af", "-d", "aac", "-b", "32000", "-q", "127",
                        "-s", "0", "--no-filler"], check=True)
        # Check the actual delivered AAC after decoding, including encoder priming.
        subprocess.run([args.afconvert, str(music), str(temp / "decoded.wav"),
                        "-f", "WAVE", "-d", "LEI16"], check=True)
        report[music.name] = {"bytes": music.stat().st_size, **analyze(temp / "decoded.wav")}
    effects = {
        "tap.wav": (0.10, [(0, 76, 0.095, 1.0)], 0.37),
        "open.wav": (0.22, [(0, 72, 0.16, 0.8), (0.065, 79, 0.15, 0.75)], 0.40),
        "success.wav": (0.50, [(0, 72, 0.25, 0.7), (0.09, 76, 0.26, 0.7),
                                (0.18, 79, 0.30, 0.75)], 0.46),
    }
    for name, (duration, notes, peak) in effects.items():
        target = args.output / name
        write_wave(target, make_effect(duration, notes, peak))
        report[name] = {"bytes": target.stat().st_size, **analyze(target)}
    total = sum(item["bytes"] for item in report.values())
    assert total < 250_000, f"Audio assets exceed the 250 KB budget: {total}"
    assert all(item["clipped_samples"] == 0 for item in report.values())
    assert abs(report["cheerful-loop.m4a"]["seconds"] - LOOP_SECONDS) < 0.05
    assert report["cheerful-loop.m4a"]["loop_boundary_step"] < 0.015
    print(json.dumps({"assets": report, "total_bytes": total}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
