#!/usr/bin/env python3
"""Render the original, sample-free Tidal Front five-instrument score.

The four battle cues are phase-locked pairs: a complete stealth arrangement
and an additive firefight arrangement. The game keeps both files at the same
playhead and crossfades the firefight part without restarting the music.

Every musical sound is one of five deliberately modelled sources: drum kit,
piano, violin, bass guitar or trumpet. There are no stock loops, electronic
layers or environmental beds. All cues are sixty-second, 44.1 kHz stereo.
"""
from __future__ import annotations

import math
import shutil
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np


SR = 44_100
DURATION = 60.0
SAMPLES = int(SR * DURATION)
ROOT = Path(__file__).resolve().parent
RNG = np.random.default_rng(0x54494445)

DRUM_KIT = 'drum_kit'
PIANO = 'piano'
VIOLIN = 'violin'
BASS_GUITAR = 'bass_guitar'
TRUMPET = 'trumpet'
ALLOWED_INSTRUMENTS = (DRUM_KIT, PIANO, VIOLIN, BASS_GUITAR, TRUMPET)
PITCHED_INSTRUMENTS = (PIANO, VIOLIN, BASS_GUITAR, TRUMPET)


@dataclass(frozen=True)
class Theme:
    key: str
    title: str
    bpm: int
    bars: int
    chords: tuple[tuple[int, ...], ...]
    scale: tuple[int, ...]


THEMES = (
    Theme('morning', 'First Light, First Shot', 96, 24,
          ((45, 48, 52, 57), (41, 45, 48, 53), (48, 52, 55, 60), (43, 47, 50, 55)),
          (45, 47, 48, 52, 55, 57, 60)),
    Theme('noon', 'High Sun Frontline', 128, 32,
          ((38, 41, 45, 50), (34, 38, 41, 46), (41, 45, 48, 53), (36, 40, 43, 48)),
          (50, 53, 55, 57, 60, 62, 65)),
    Theme('afternoon', 'Market Road Home', 112, 28,
          ((43, 46, 50, 55), (39, 43, 46, 51), (46, 50, 53, 58), (41, 45, 48, 53)),
          (55, 57, 58, 62, 65, 67, 69)),
    Theme('night', 'Black Water Raid', 96, 24,
          ((37, 40, 44, 49), (33, 37, 40, 45), (40, 44, 47, 52), (35, 39, 42, 47)),
          (49, 52, 54, 56, 59, 61, 64)),
)


def midi(note: float) -> float:
    return 440.0 * 2.0 ** ((note - 69.0) / 12.0)


def pan_gains(pan: float) -> tuple[float, float]:
    angle = (max(-1.0, min(1.0, pan)) + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def envelope(length: int, attack: float, release: float) -> np.ndarray:
    env = np.ones(length, dtype=np.float32)
    attack_samples = min(length, max(1, int(attack * SR)))
    release_samples = min(length, max(1, int(release * SR)))
    env[:attack_samples] *= np.linspace(
        0.0, 1.0, attack_samples, endpoint=False, dtype=np.float32
    )
    env[-release_samples:] *= np.linspace(
        1.0, 0.0, release_samples, endpoint=False, dtype=np.float32
    )
    return env


def instrument_signal(kind: str, freq: float, seconds: np.ndarray, phase: float) -> np.ndarray:
    """Return a deliberately acoustic model for one allowed pitched instrument."""
    if kind not in PITCHED_INSTRUMENTS:
        raise ValueError(f'unsupported pitched instrument: {kind}')

    base_phase = 2.0 * np.pi * freq * seconds + phase

    if kind == PIANO:
        # Coupled strings keep the fundamental long while upper partials naturally
        # darken. The soft attack prevents a short wooden-bar character.
        out = np.zeros_like(seconds, dtype=np.float64)
        for harmonic in range(1, 13):
            stiffness = math.sqrt(1.0 + 0.00008 * harmonic * harmonic)
            decay = np.exp(-seconds * (0.11 + 0.045 * harmonic ** 1.32))
            weight = 1.0 / harmonic ** 1.24
            primary = np.sin(base_phase * harmonic * stiffness + harmonic * 0.043)
            paired = np.sin(
                2.0 * np.pi * freq * 1.00065 * harmonic * stiffness * seconds
                + phase * 0.91 + harmonic * 0.061
            )
            out += (primary + paired * 0.12) * decay * weight
        return out * 0.58

    if kind == VIOLIN:
        # Bowed harmonics, a gradual bow onset and delayed finger vibrato.
        vibrato = 0.52 * np.sin(2.0 * np.pi * 5.15 * seconds)
        vibrato *= 1.0 - np.exp(-seconds * 3.1)
        bowed_phase = base_phase + vibrato
        out = np.zeros_like(seconds, dtype=np.float64)
        for harmonic in range(1, 15):
            hz = freq * harmonic
            body = (
                0.72
                + 0.72 * np.exp(-((hz - 720.0) / 520.0) ** 2)
                + 0.38 * np.exp(-((hz - 2050.0) / 900.0) ** 2)
            )
            out += (
                np.sin(bowed_phase * harmonic + harmonic * 0.086)
                * body
                / harmonic ** 1.08
            )
        bow_settle = 0.82 + 0.18 * (1.0 - np.exp(-seconds * 7.0))
        return np.tanh(out * 0.42) * bow_settle * 0.76

    if kind == BASS_GUITAR:
        # Fingerstyle electric bass: a strong sustained fundamental and controlled
        # upper-string content, with no octave-below oscillator.
        out = np.zeros_like(seconds, dtype=np.float64)
        weights = (1.00, 0.34, 0.18, 0.10, 0.055, 0.028)
        for harmonic, weight in enumerate(weights, 1):
            decay = np.exp(-seconds * (0.14 + 0.085 * harmonic))
            out += np.sin(base_phase * harmonic + harmonic * 0.12) * weight * decay
        pickup = np.sin(base_phase * 2.0 + 0.4) * np.exp(-seconds * 2.8) * 0.055
        return (out + pickup) * 0.78

    # Open trumpet: lip buzz shaped by broad bell resonances.
    vibrato = 0.34 * np.sin(2.0 * np.pi * 5.35 * seconds)
    vibrato *= np.clip((seconds - 0.18) * 2.2, 0.0, 1.0)
    horn_phase = base_phase + vibrato
    out = np.zeros_like(seconds, dtype=np.float64)
    for harmonic in range(1, 13):
        hz = freq * harmonic
        bell = (
            0.52
            + 0.92 * np.exp(-((hz - 980.0) / 660.0) ** 2)
            + 0.38 * np.exp(-((hz - 2350.0) / 1150.0) ** 2)
        )
        out += (
            np.sin(horn_phase * harmonic + harmonic * 0.034)
            * bell
            / harmonic ** 0.94
        )
    return np.tanh(out * 0.43) * 0.74


def add_instrument(
    buf: np.ndarray,
    kind: str,
    note: float,
    start: float,
    duration: float,
    amp: float,
    pan: float = 0.0,
    detune: float = 0.0,
) -> None:
    if kind not in PITCHED_INSTRUMENTS:
        raise ValueError(f'invalid score instrument: {kind}')

    first = int(round(start * SR)) % SAMPLES
    length = max(8, min(SAMPLES, int(round(duration * SR))))
    indexes = (first + np.arange(length, dtype=np.int64)) % SAMPLES
    seconds = np.arange(length, dtype=np.float64) / SR
    freq = midi(note) * 2.0 ** (detune / 1200.0)
    phase = float(RNG.uniform(0.0, 2.0 * np.pi))
    signal = instrument_signal(kind, freq, seconds, phase)

    if kind == PIANO:
        attack, release = 0.010, min(0.48, duration * 0.30)
        key_noise = RNG.normal(0.0, 1.0, length)
        key_noise -= np.convolve(key_noise, np.ones(31) / 31, mode='same')
        signal += key_noise * np.exp(-seconds * 95.0) * 0.0025
    elif kind == VIOLIN:
        attack, release = min(0.13, duration * 0.22), min(0.34, duration * 0.30)
    elif kind == BASS_GUITAR:
        attack, release = 0.022, min(0.25, duration * 0.24)
        finger = RNG.normal(0.0, 1.0, length)
        finger -= np.convolve(finger, np.ones(25) / 25, mode='same')
        signal += finger * np.exp(-seconds * 72.0) * 0.002
    else:
        attack, release = min(0.055, duration * 0.18), min(0.22, duration * 0.28)
        breath = RNG.normal(0.0, 1.0, length)
        breath -= np.convolve(breath, np.ones(29) / 29, mode='same')
        signal += breath * (1.0 - np.exp(-seconds * 14.0)) * 0.003

    signal = signal.astype(np.float32) * envelope(length, attack, release) * amp
    left, right = pan_gains(pan)
    np.add.at(buf[:, 0], indexes, signal * left)
    np.add.at(buf[:, 1], indexes, signal * right)


def add_piano(
    buf: np.ndarray, note: float, start: float, duration: float, amp: float, pan: float = 0.0
) -> None:
    add_instrument(buf, PIANO, note, start, duration, amp, pan)


def add_violin(
    buf: np.ndarray, note: float, start: float, duration: float, amp: float, pan: float = 0.0
) -> None:
    add_instrument(buf, VIOLIN, note, start, duration, amp, pan)


def add_bass_guitar(
    buf: np.ndarray, note: float, start: float, duration: float, amp: float, pan: float = 0.0
) -> None:
    add_instrument(buf, BASS_GUITAR, note, start, duration, amp, pan)


def add_trumpet(
    buf: np.ndarray, note: float, start: float, duration: float, amp: float, pan: float = 0.0
) -> None:
    add_instrument(buf, TRUMPET, note, start, duration, amp, pan)


def high_noise(length: int) -> np.ndarray:
    noise = RNG.normal(0.0, 1.0, length).astype(np.float32)
    smooth = np.convolve(noise, np.ones(19, dtype=np.float32) / 19, mode='same')
    return noise - smooth


def add_kick(buf: np.ndarray, start: float, amp: float = 0.7, pan: float = 0.0) -> None:
    length = int(0.52 * SR)
    seconds = np.arange(length, dtype=np.float64) / SR
    phase = 2.0 * np.pi * (
        48.0 * seconds + 50.0 * (1.0 - np.exp(-seconds * 25.0)) / 25.0
    )
    head = high_noise(length)
    signal = (np.sin(phase) + 0.18 * np.sin(phase * 0.51)) * np.exp(-seconds * 10.5)
    signal += np.sin(2.0 * np.pi * 112.0 * seconds) * np.exp(-seconds * 28.0) * 0.12
    signal += head * np.exp(-seconds * 115.0) * 0.055
    left, right = pan_gains(pan)
    indexes = (int(start * SR) + np.arange(length)) % SAMPLES
    np.add.at(buf[:, 0], indexes, (signal * amp * left).astype(np.float32))
    np.add.at(buf[:, 1], indexes, (signal * amp * right).astype(np.float32))


def add_snare(buf: np.ndarray, start: float, amp: float = 0.42, pan: float = 0.0) -> None:
    length = int(0.42 * SR)
    seconds = np.arange(length, dtype=np.float64) / SR
    wires = high_noise(length) * (
        np.exp(-seconds * 16.0) * 0.70 + np.exp(-seconds * 42.0) * 0.24
    )
    body = (
        np.sin(2.0 * np.pi * 181.0 * seconds) * 0.30
        + np.sin(2.0 * np.pi * 327.0 * seconds + 0.2) * 0.18
    )
    body *= np.exp(-seconds * 13.0)
    transient = high_noise(length) * np.exp(-seconds * 120.0) * 0.22
    signal = (wires + body + transient) * amp
    left, right = pan_gains(pan)
    indexes = (int(start * SR) + np.arange(length)) % SAMPLES
    np.add.at(buf[:, 0], indexes, (signal * left).astype(np.float32))
    np.add.at(buf[:, 1], indexes, (signal * right).astype(np.float32))


def add_hat(
    buf: np.ndarray,
    start: float,
    amp: float = 0.15,
    open_hat: bool = False,
    pan: float = 0.0,
) -> None:
    duration = 0.48 if open_hat else 0.105
    length = int(duration * SR)
    seconds = np.arange(length, dtype=np.float64) / SR
    decay = 10.0 if open_hat else 42.0
    metal = sum(
        np.sin(2.0 * np.pi * frequency * seconds + index * 0.71) / (1.0 + index * 0.22)
        for index, frequency in enumerate((4371, 5683, 7247, 8911, 10333))
    )
    signal = (
        high_noise(length) * 0.58 + metal * 0.13
    ) * np.exp(-seconds * decay) * amp
    left, right = pan_gains(pan)
    indexes = (int(start * SR) + np.arange(length)) % SAMPLES
    np.add.at(buf[:, 0], indexes, (signal * left).astype(np.float32))
    np.add.at(buf[:, 1], indexes, (signal * right).astype(np.float32))


def add_tom(
    buf: np.ndarray, start: float, note: float, amp: float = 0.42, pan: float = 0.0
) -> None:
    length = int(0.5 * SR)
    seconds = np.arange(length, dtype=np.float64) / SR
    freq = midi(note)
    phase = 2.0 * np.pi * (
        freq * seconds + 10.0 * (1.0 - np.exp(-seconds * 17.0)) / 17.0
    )
    skin = RNG.normal(0.0, 1.0, length) * np.exp(-seconds * 75.0) * 0.035
    signal = (
        (np.sin(phase) + 0.21 * np.sin(2.03 * phase)) * np.exp(-seconds * 8.4)
        + skin
    ) * amp
    left, right = pan_gains(pan)
    indexes = (int(start * SR) + np.arange(length)) % SAMPLES
    np.add.at(buf[:, 0], indexes, (signal * left).astype(np.float32))
    np.add.at(buf[:, 1], indexes, (signal * right).astype(np.float32))


def add_cymbal(buf: np.ndarray, start: float, amp: float = 0.22) -> None:
    length = int(2.6 * SR)
    seconds = np.arange(length, dtype=np.float64) / SR
    shimmer = sum(
        np.sin(2.0 * np.pi * frequency * seconds + index * 0.53) / (1.0 + index * 0.18)
        for index, frequency in enumerate((2381, 3539, 5123, 6817, 8461, 10909))
    )
    signal = (
        high_noise(length) * 0.52 + shimmer * 0.12
    ) * (
        np.exp(-seconds * 1.65) * 0.72 + np.exp(-seconds * 5.8) * 0.28
    ) * amp
    indexes = (int(start * SR) + np.arange(length)) % SAMPLES
    np.add.at(buf[:, 0], indexes, (signal * 0.68).astype(np.float32))
    np.add.at(buf[:, 1], indexes, (signal * 0.74).astype(np.float32))


def add_brush(
    buf: np.ndarray, start: float, duration: float, amp: float, pan: float = 0.0
) -> None:
    length = max(8, int(duration * SR))
    seconds = np.arange(length, dtype=np.float64) / SR
    shape = np.sin(
        np.pi * np.minimum(1.0, seconds / max(0.01, duration))
    ) ** 2
    shape *= np.exp(-seconds / max(0.08, duration * 0.82))
    signal = high_noise(length) * shape * amp
    left, right = pan_gains(pan)
    indexes = (int(start * SR) + np.arange(length)) % SAMPLES
    np.add.at(buf[:, 0], indexes, (signal * left).astype(np.float32))
    np.add.at(buf[:, 1], indexes, (signal * right).astype(np.float32))


def add_rim(buf: np.ndarray, start: float, amp: float, pan: float = 0.0) -> None:
    length = int(0.16 * SR)
    seconds = np.arange(length, dtype=np.float64) / SR
    signal = (
        np.sin(2.0 * np.pi * 1260.0 * seconds)
        + 0.56 * np.sin(2.0 * np.pi * 2320.0 * seconds + 0.3)
    )
    signal *= np.exp(-seconds * 48.0) * amp
    left, right = pan_gains(pan)
    indexes = (int(start * SR) + np.arange(length)) % SAMPLES
    np.add.at(buf[:, 0], indexes, (signal * left).astype(np.float32))
    np.add.at(buf[:, 1], indexes, (signal * right).astype(np.float32))


def room_reverb(buf: np.ndarray, amount: float = 0.10) -> np.ndarray:
    """Short studio-room reflections; restrained enough to retain articulation."""
    dry = buf.copy()
    wet = np.zeros_like(buf)
    taps = (
        (0.071, 0.28, False),
        (0.109, 0.20, True),
        (0.163, 0.15, False),
        (0.239, 0.10, True),
    )
    for seconds, gain, cross in taps:
        delay = int(seconds * SR)
        wet[:, 0] += np.roll(dry[:, 1] if cross else dry[:, 0], delay) * gain
        wet[:, 1] += np.roll(dry[:, 0] if cross else dry[:, 1], delay + 149) * gain
    return dry + wet * amount


def edge_guard(buf: np.ndarray) -> None:
    length = int(0.007 * SR)
    fade = np.sin(np.linspace(0.0, np.pi / 2.0, length, dtype=np.float32)) ** 2
    buf[:length] *= fade[:, None]
    buf[-length:] *= fade[::-1, None]


def master(buf: np.ndarray, target_rms: float, peak_limit: float, drive: float) -> np.ndarray:
    peak = float(np.max(np.abs(buf)))
    if peak < 1e-7:
        return buf
    shaped = np.tanh(buf / peak * drive) / np.tanh(drive)
    rms = float(np.sqrt(np.mean(shaped ** 2)))
    gain = min(
        target_rms / max(rms, 1e-7),
        peak_limit / max(float(np.max(np.abs(shaped))), 1e-7),
    )
    return (shaped * gain).astype(np.float32)


def compose_battle(theme: Theme) -> tuple[np.ndarray, np.ndarray]:
    assert theme.bars * 4 * 60 / theme.bpm == DURATION
    beat = 60.0 / theme.bpm
    stealth = np.zeros((SAMPLES, 2), dtype=np.float32)
    firefight = np.zeros_like(stealth)
    intensity = {'morning': 0.90, 'noon': 1.10, 'afternoon': 0.96, 'night': 0.76}[theme.key]
    swing = 0.07 if theme.key == 'afternoon' else 0.025 if theme.key == 'night' else 0.0

    for bar in range(theme.bars):
        chord = theme.chords[bar % len(theme.chords)]
        at = bar * 4 * beat
        section = (bar // 4) % 4
        root = chord[0]

        # The quiet arrangement is still a complete band: sustained piano,
        # legato violin, fingerstyle bass guitar and a restrained drum kit.
        for index, note in enumerate(chord):
            add_piano(
                stealth,
                note + 12,
                at,
                3.72 * beat,
                (0.030 + section * 0.0012) * (1.0 if index < 3 else 0.82),
                -0.58 + index * 0.39,
            )
        if bar % 2:
            for index, note in enumerate(chord[:3]):
                add_piano(
                    stealth,
                    note + 24,
                    at + 2.55 * beat,
                    1.15 * beat,
                    0.014,
                    -0.38 + index * 0.38,
                )

        violin_notes = (
            chord[2] + 24 if bar % 2 == 0 else chord[1] + 24,
            chord[3] + 24 if bar % 2 == 0 else chord[2] + 24,
        )
        add_violin(stealth, violin_notes[0], at, 2.10 * beat, 0.020, 0.24)
        add_violin(stealth, violin_notes[1], at + 2.0 * beat, 2.08 * beat, 0.022, 0.32)

        add_bass_guitar(stealth, root, at, 1.82 * beat, 0.071, -0.16)
        add_bass_guitar(stealth, root + 7, at + 2.0 * beat, 1.78 * beat, 0.065, -0.10)

        for pulse in range(4):
            add_brush(
                stealth,
                at + pulse * beat,
                0.60 * beat,
                (0.016 if theme.key == 'night' else 0.020),
                -0.38 if pulse % 2 else 0.34,
            )
        add_kick(stealth, at, 0.125 * intensity)
        add_rim(stealth, at + beat, 0.034 * intensity, -0.18)
        add_rim(stealth, at + 3.0 * beat, 0.041 * intensity, 0.18)

        # The firefight arrangement adds an acoustic rhythm section, bowed
        # counterline, rhythmic piano and open-trumpet lead.
        for pulse in (0.0, 2.0, 2.75 if bar % 2 else 3.5):
            add_kick(
                firefight,
                at + pulse * beat,
                0.40 * intensity,
                -0.06 if pulse == 2.0 else 0.06,
            )
        add_snare(firefight, at + beat, 0.34 * intensity, -0.08)
        add_snare(firefight, at + 3.0 * beat, 0.42 * intensity, 0.10)
        for step in range(8):
            add_hat(
                firefight,
                at + (step * 0.5 + (swing if step % 2 else 0.0)) * beat,
                (0.064 if step % 2 else 0.080) * intensity,
                step == 7,
                -0.44 if step % 2 else 0.44,
            )

        for hit in (0.50, 2.50):
            for index, note in enumerate(chord[:3]):
                add_piano(
                    firefight,
                    note + 24,
                    at + hit * beat,
                    0.58 * beat,
                    0.023 * intensity,
                    -0.48 + index * 0.48,
                )

        violin_riff = (chord[1] + 24, chord[2] + 24, chord[1] + 24, chord[3] + 24)
        for step, note in enumerate(violin_riff):
            add_violin(
                firefight,
                note,
                at + (step + 0.5) * beat,
                0.58 * beat,
                0.020 * intensity,
                0.30,
            )

        if bar % 2 == 0:
            horn_notes = (chord[0] + 24, chord[2] + 24, chord[1] + 24)
            for index, (note, pulse, length) in enumerate(
                zip(horn_notes, (0.0, 1.5, 2.5), (0.72, 0.54, 1.20))
            ):
                add_trumpet(
                    firefight,
                    note,
                    at + pulse * beat,
                    length * beat,
                    0.044 * intensity,
                    -0.28 + index * 0.28,
                )
        else:
            add_trumpet(
                firefight,
                chord[2] + 24,
                at + 3.0 * beat,
                0.76 * beat,
                0.038 * intensity,
                0.24,
            )

        if bar % 4 == 3:
            for step in range(4):
                add_tom(
                    firefight,
                    at + (3.0 + step * 0.25) * beat,
                    38 + step * 2,
                    (0.22 + step * 0.028) * intensity,
                    -0.60 + step * 0.40,
                )
        if bar % 8 == 0:
            add_cymbal(firefight, at, 0.18 * intensity)

    motif = {
        'morning': (0, 2, 4, 6, 4, 2, 1, 4),
        'noon': (0, 4, 3, 6, 4, 2, 5, 3),
        'afternoon': (4, 2, 1, 0, 2, 5, 4, 1),
        'night': (0, 1, 4, 2, 6, 4, 1, 0),
    }[theme.key]
    for phrase in range(2, theme.bars, 8):
        at = phrase * 4 * beat
        for step, degree in enumerate(motif):
            note = theme.scale[degree] + 12
            add_piano(
                stealth,
                note,
                at + step * beat,
                (0.82 if step not in (3, 7) else 1.32) * beat,
                0.032,
                math.sin(step * 1.7) * 0.34,
            )
            add_trumpet(
                firefight,
                note + (12 if step in (3, 7) else 0),
                at + step * beat,
                0.58 * beat,
                0.034 * intensity,
                -math.sin(step * 1.7) * 0.38,
            )

    stealth = room_reverb(stealth, 0.12 if theme.key in ('morning', 'night') else 0.09)
    firefight = room_reverb(firefight, 0.08)
    edge_guard(stealth)
    edge_guard(firefight)
    return master(stealth, 0.100, 0.76, 1.08), master(firefight, 0.088, 0.60, 1.26)


def compose_scout() -> np.ndarray:
    bpm, bars = 80, 20
    assert bars * 4 * 60 / bpm == DURATION
    beat = 60.0 / bpm
    buf = np.zeros((SAMPLES, 2), dtype=np.float32)
    chords = (
        (40, 43, 47, 50),
        (45, 48, 52, 55),
        (38, 42, 45, 50),
        (43, 47, 50, 54),
    )
    scale = (52, 54, 55, 59, 62, 64, 66)

    for bar in range(bars):
        at = bar * 4 * beat
        chord = chords[bar % len(chords)]
        for index, note in enumerate(chord):
            add_piano(buf, note + 12, at, 3.72 * beat, 0.028, -0.58 + index * 0.39)
        add_bass_guitar(buf, chord[0], at, 1.85 * beat, 0.060, -0.14)
        add_bass_guitar(buf, chord[0] + 7, at + 2.0 * beat, 1.76 * beat, 0.055, -0.10)

        violin_pair = (
            chord[1] + 24 if bar % 2 else chord[2] + 24,
            chord[2] + 24 if bar % 2 else chord[1] + 24,
        )
        add_violin(buf, violin_pair[0], at, 2.08 * beat, 0.021, 0.28)
        add_violin(buf, violin_pair[1], at + 2.0 * beat, 2.08 * beat, 0.020, 0.34)

        for pulse in range(4):
            add_brush(
                buf,
                at + pulse * beat,
                0.68 * beat,
                0.016,
                -0.38 if pulse % 2 else 0.36,
            )
        add_kick(buf, at, 0.092)
        add_rim(buf, at + 3.0 * beat, 0.030, -0.20)

        if bar % 5 == 4:
            for index, degree in enumerate((0, 1, 3, 5)):
                add_trumpet(
                    buf,
                    scale[degree] + 12,
                    at + (2.0 + index * 0.5) * beat,
                    0.58 * beat,
                    0.026,
                    -0.42 + index * 0.28,
                )
        if bar % 4 in (1, 3):
            for index, degree in enumerate((0, 2, 1)):
                add_piano(
                    buf,
                    chord[degree] + 24,
                    at + (1.0 + index * 0.75) * beat,
                    0.64 * beat,
                    0.024,
                    -0.34 + index * 0.34,
                )

    buf = room_reverb(buf, 0.12)
    edge_guard(buf)
    return master(buf, 0.097, 0.76, 1.08)


def compose_home() -> np.ndarray:
    bpm, bars = 96, 24
    assert bars * 4 * 60 / bpm == DURATION
    beat = 60.0 / bpm
    buf = np.zeros((SAMPLES, 2), dtype=np.float32)
    chords = (
        (45, 48, 52, 57),
        (41, 45, 48, 53),
        (48, 52, 55, 60),
        (43, 47, 50, 55),
    )
    melody = (0, 2, 4, 2, 1, 3, 2, 0)
    scale = (57, 59, 60, 64, 67, 69, 72)

    for bar in range(bars):
        at = bar * 4 * beat
        chord = chords[bar % len(chords)]
        for index, note in enumerate(chord):
            add_piano(buf, note + 12, at, 3.70 * beat, 0.031, -0.58 + index * 0.39)

        add_bass_guitar(buf, chord[0], at, 1.84 * beat, 0.064, -0.13)
        add_bass_guitar(buf, chord[0] + 7, at + 2.0 * beat, 1.78 * beat, 0.058, -0.09)

        add_violin(buf, chord[2] + 24, at, 2.08 * beat, 0.020, 0.27)
        add_violin(buf, chord[1] + 24, at + 2.0 * beat, 2.08 * beat, 0.019, 0.34)

        for pulse in range(4):
            add_brush(
                buf,
                at + pulse * beat,
                0.56 * beat,
                0.015,
                0.32 if pulse % 2 else -0.32,
            )
        add_kick(buf, at, 0.108)
        add_rim(buf, at + 3.0 * beat, 0.032, 0.16)

        if bar % 8 in (2, 3):
            for step, degree in enumerate(melody):
                add_piano(
                    buf,
                    scale[degree] + 12,
                    at + step * 0.5 * beat,
                    0.58 * beat,
                    0.027,
                    -0.28 + (step % 3) * 0.28,
                )
        if bar % 8 == 7:
            for step, degree in enumerate((0, 2, 4, 5)):
                add_trumpet(
                    buf,
                    scale[degree] + 12,
                    at + (2.0 + step * 0.5) * beat,
                    0.62 * beat,
                    0.024,
                    -0.24 + step * 0.16,
                )

    buf = room_reverb(buf, 0.10)
    edge_guard(buf)
    return master(buf, 0.099, 0.76, 1.08)


def write_wav(path: Path, audio: np.ndarray) -> None:
    pcm = (np.clip(audio, -1.0, 1.0) * 32767).astype('<i2')
    with wave.open(str(path), 'wb') as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(SR)
        out.writeframes(pcm.tobytes())


def encode(audio: np.ndarray, destination: Path, title: str) -> None:
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg:
        raise SystemExit('ffmpeg is required to encode the Ogg masters')
    with tempfile.NamedTemporaryFile(suffix='.wav') as temporary:
        write_wav(Path(temporary.name), audio)
        subprocess.run(
            (
                ffmpeg,
                '-y',
                '-loglevel',
                'error',
                '-i',
                temporary.name,
                '-c:a',
                'libvorbis',
                '-q:a',
                '6',
                '-ar',
                str(SR),
                '-ac',
                '2',
                '-metadata',
                f'title={title}',
                '-metadata',
                'artist=Tidal Front Original Score',
                '-metadata',
                'comment=Original five-instrument score: drum kit, piano, violin, bass guitar and trumpet',
                str(destination),
            ),
            check=True,
        )
    print(f'{destination.name}: {destination.stat().st_size / 1024:.0f} KiB')


def main() -> None:
    assert set(ALLOWED_INSTRUMENTS) == {
        DRUM_KIT,
        PIANO,
        VIOLIN,
        BASS_GUITAR,
        TRUMPET,
    }
    encode(compose_home(), ROOT / 'home_theme.ogg', 'Harbor Workshop — Home')
    encode(compose_scout(), ROOT / 'scout_theme.ogg', 'Silent Reconnaissance')
    legacy_mix = None
    for theme in THEMES:
        stealth, firefight = compose_battle(theme)
        encode(
            stealth,
            ROOT / f'battle_{theme.key}_stealth.ogg',
            theme.title + ' — Stealth',
        )
        encode(
            firefight,
            ROOT / f'battle_{theme.key}_combat.ogg',
            theme.title + ' — Firefight Stem',
        )
        if theme.key == 'noon':
            legacy_mix = master(stealth + firefight * 0.72, 0.108, 0.80, 1.14)
    if legacy_mix is not None:
        encode(
            legacy_mix,
            ROOT / 'battle_theme.ogg',
            'High Sun Frontline — Full Mix',
        )


if __name__ == '__main__':
    main()
