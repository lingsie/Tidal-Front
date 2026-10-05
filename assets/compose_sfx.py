#!/usr/bin/env python3
"""Render the original Tidal Front cinematic SFX library at 48 kHz.

Every weapon is built from separate muzzle-pressure, mechanical, resonant-body,
debris and coastal-reflection layers. No downloaded samples or one-shot reuse.
"""
from __future__ import annotations

import math
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parent
SR = 48_000
RNG = np.random.default_rng(0x53465835)
BLUETOOTH_SAFE_PEAKS = {
    'rifle': .42, 'sniper': .34, 'machinegun': .38, 'mortar': .60,
    'cannon': .58, 'tank': .34, 'artillery': .34, 'explosion': .45,
    'rocket': .46, 'shock': .36,
}


def moving_average(signal: np.ndarray, span: int) -> np.ndarray:
    span = max(2, int(span))
    return np.convolve(signal, np.ones(span, dtype=np.float32) / span, mode='same')


def high_noise(length: int, span: int = 27) -> np.ndarray:
    noise = RNG.normal(0, 1, length).astype(np.float32)
    return noise - moving_average(noise, span)


def low_noise(length: int, span: int = 19) -> np.ndarray:
    return moving_average(RNG.normal(0, 1, length).astype(np.float32), span)


def place(destination: np.ndarray, source: np.ndarray, start: float, gain: float = 1.0) -> None:
    first = max(0, int(round(start * SR)))
    count = min(len(source), len(destination) - first)
    if count > 0:
        destination[first:first + count] += source[:count] * gain


def room(mono: np.ndarray, size: float = 1.0, shore: bool = True) -> np.ndarray:
    """Asymmetric early reflections plus a diffuse, non-wrapping tail."""
    stereo = np.stack((mono.copy(), mono.copy()), axis=-1)
    taps = ((.041, .20, -.65), (.073, .16, .58), (.117, .12, -.32),
            (.181, .095, .42), (.269, .070, -.18), (.407, .045, .26))
    for delay, gain, pan in taps:
        shift = int(delay * size * SR)
        if shift <= 0 or shift >= len(mono):
            continue
        stereo[shift:, 0] += mono[:-shift] * gain * math.sqrt((1 - pan) * .5)
        stereo[shift:, 1] += mono[:-shift] * gain * math.sqrt((1 + pan) * .5)
    if shore:
        tail = low_noise(len(mono), 53)
        seconds = np.arange(len(mono), dtype=np.float64) / SR
        envelope = (1 - np.exp(-seconds * 10)) * np.exp(-seconds / max(.25, .62 * size))
        tail *= envelope.astype(np.float32) * .022
        stereo[:, 0] += np.roll(tail, int(.013 * SR))
        stereo[:, 1] += np.roll(tail, int(.029 * SR)) * .92
    return stereo


def selection_space(mono: np.ndarray, width: float = 1.0) -> np.ndarray:
    """Tight selection spatialization with no audible delayed confirmation hit."""
    stereo = np.stack((mono.copy(), mono.copy()), axis=-1)
    for delay, gain, pan in ((.008, .10, -.68), (.016, .075, .62), (.026, .04, -.18)):
        shift = int(delay * width * SR)
        if shift <= 0 or shift >= len(mono):
            continue
        stereo[shift:, 0] += mono[:-shift] * gain * math.sqrt((1 - pan) * .5)
        stereo[shift:, 1] += mono[:-shift] * gain * math.sqrt((1 + pan) * .5)
    return stereo


def master(stereo: np.ndarray, peak: float = .70) -> np.ndarray:
    stereo = np.asarray(stereo, dtype=np.float32)
    stereo -= np.mean(stereo, axis=0, keepdims=True)
    stereo = np.tanh(stereo * 1.22) / np.tanh(1.22)
    current = float(np.max(np.abs(stereo)))
    if current > 1e-7:
        stereo *= peak / current
    fade = min(int(.012 * SR), len(stereo) // 8)
    if fade:
        stereo[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)[:, None]
    return stereo


def save(name: str, stereo: np.ndarray, title: str, peak: float = .70) -> None:
    # Browsers do not expose the active Bluetooth route reliably. Keep every
    # combat master codec-safe instead: the extra headroom survives Vorbis,
    # OS resampling and a headset's SBC/AAC stage without changing the mix.
    if name in BLUETOOTH_SAFE_PEAKS:
        peak = BLUETOOTH_SAFE_PEAKS[name]
    stereo = master(stereo, peak)
    pcm = (np.clip(stereo, -1, 1) * 32767).astype('<i2')
    with tempfile.NamedTemporaryFile(suffix='.wav') as temp:
        with wave.open(temp.name, 'wb') as out:
            out.setnchannels(2)
            out.setsampwidth(2)
            out.setframerate(SR)
            out.writeframes(pcm.tobytes())
        destination = ROOT / f'{name}.ogg'
        subprocess.run(('ffmpeg', '-y', '-loglevel', 'error', '-i', temp.name,
                        '-c:a', 'libvorbis', '-q:a', '6', '-ar', str(SR), '-ac', '2',
                        '-metadata', f'title={title}',
                        '-metadata', 'artist=Tidal Front Original Sound Design',
                        '-metadata', 'comment=Layered 48 kHz stereo; Bluetooth-safe combat headroom',
                        str(destination)), check=True)
    print(f'{destination.name}: {destination.stat().st_size / 1024:.0f} KiB')


def pressure_pulse(seconds: float, body_hz: float, power: float, crack: float,
                   tail: float = 1.0) -> np.ndarray:
    length = int(seconds * SR)
    t = np.arange(length, dtype=np.float64) / SR
    noise = high_noise(length, 31)
    blast = (noise * np.exp(-t * (55 / tail)) * crack
             + low_noise(length, 11) * np.exp(-t * (8.5 / tail)) * .24 * power)
    glide = body_hz * t + (body_hz * .92 / 21) * (1 - np.exp(-21 * t))
    body = (np.sin(2 * np.pi * glide) + .28 * np.sin(2 * np.pi * glide * 1.97 + .2))
    body *= np.exp(-t * (8.2 / tail)) * .46 * power
    supersonic = np.sin(2 * np.pi * (1750 * t + 5100 * t * t))
    supersonic *= np.exp(-t * 125) * .10 * crack
    return (blast + body + supersonic).astype(np.float32)


def mechanism(seconds: float, heavy: float = 1.0) -> np.ndarray:
    length = int(seconds * SR)
    t = np.arange(length, dtype=np.float64) / SR
    metal = (np.sin(2 * np.pi * 1540 * t) + .63 * np.sin(2 * np.pi * 2870 * t + .4)
             + .30 * np.sin(2 * np.pi * 4360 * t + .8))
    return (metal * np.exp(-t * 72) * .14 * heavy
            + high_noise(length, 11) * np.exp(-t * 115) * .055 * heavy).astype(np.float32)


def gun(name: str, title: str, duration: float, body_hz: float, power: float,
        crack: float, tail: float, bolt_delay: float) -> None:
    mono = np.zeros(int(duration * SR), dtype=np.float32)
    place(mono, pressure_pulse(min(duration, 1.35), body_hz, power, crack, tail), 0)
    place(mono, mechanism(.18, .70 + power * .25), bolt_delay)
    stereo = room(mono, .78 + tail * .42, True)
    stereo[:, 1] += np.roll(mono, int(.00055 * SR)) * .08
    save(name, stereo, title)


def machine_gun() -> None:
    duration = 1.38
    mono = np.zeros(int(duration * SR), dtype=np.float32)
    shots = (0.000, .087, .176, .263, .354)
    gains = (1.00, .91, .96, .89, .94)
    for index, (at, gain) in enumerate(zip(shots, gains)):
        pulse = pressure_pulse(.58, 91 + index * 1.7, .74 * gain, .88 * gain, .52)
        place(mono, pulse, at)
        place(mono, mechanism(.105, .92), at + .047, .86)
    for at in (.043, .132, .219, .307, .445):
        place(mono, mechanism(.075, .52), at, .72)
    place(mono, mechanism(.22, 1.15), .438)
    save('machinegun', room(mono, .82, True), 'Heavy Machine Gun — Five-Round Burst')


def mortar_launch() -> None:
    duration = 1.45
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    tube = np.sin(2 * np.pi * (73 * t + 43 * (1 - np.exp(-t * 19)) / 19)) * np.exp(-t * 10) * .56
    air = low_noise(length, 25) * np.exp(-t * 9) * .44
    ring = np.sin(2 * np.pi * 392 * t) * np.exp(-t * 25) * .13
    save('mortar', room((tube + air + ring).astype(np.float32), .75, True), 'Mortar Tube Launch')


def coastal_cannon() -> None:
    """A short, heavy cannon report with a readable breech and coastal echo.

    The old generic gun recipe put too much energy into one broadband transient.
    Vorbis then exaggerated its inter-sample peak and the cannon was hard to tell
    from the impact explosion.  This version leaves separate time and frequency
    space for the muzzle crack, pressure body, breech clack and two reflections.
    """
    duration = 2.80
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    rng = np.random.default_rng(0x43414E4E)

    def band_noise(low: float, high: float) -> np.ndarray:
        noise = rng.normal(0, 1, length)
        spectrum = np.fft.rfft(noise)
        frequencies = np.fft.rfftfreq(length, 1 / SR)
        width = max(20.0, min(240.0, (high - low) * .12))
        mask = np.clip((frequencies - low) / width, 0, 1)
        mask *= np.clip((high - frequencies) / width, 0, 1)
        filtered = np.fft.irfft(spectrum * mask, n=length)
        filtered /= max(1e-9, np.sqrt(np.mean(filtered * filtered)))
        return filtered.astype(np.float32)

    # The first 90 ms reads as a cannon muzzle, not a generic impact.
    crack = band_noise(1500, 9200) * np.exp(-t * 78) * .20
    blast = band_noise(105, 1450) * (1 - np.exp(-t * 210)) * np.exp(-t * 11.0) * .50
    phase = 2 * np.pi * (43 * t + 44 * (1 - np.exp(-t * 25)) / 25)
    body = (np.sin(phase) + .31 * np.sin(phase * 1.91 + .34)) * np.exp(-t * 4.2) * .78
    bore = (np.sin(2 * np.pi * 181 * t + .3)
            + .43 * np.sin(2 * np.pi * 317 * t + 1.1)) * np.exp(-t * 20) * .085
    dry = (crack + blast + body + bore).astype(np.float32)

    # A delayed breech/receiver clack makes the weapon itself audible after the blast.
    u = np.maximum(0, t - .145)
    gate = (t >= .145).astype(np.float64)
    breech = ((np.sin(2 * np.pi * 613 * u + .2)
               + .58 * np.sin(2 * np.pi * 1187 * u + .9)
               + .27 * np.sin(2 * np.pi * 2131 * u + 1.7))
              * np.exp(-u * 47) * gate * .105)
    breech += band_noise(780, 5200) * np.exp(-u * 92) * gate * .026
    dry += breech.astype(np.float32)

    stereo = np.stack((dry.copy(), np.roll(dry, 11) * .985), axis=-1)

    # Directional early reflections and two low-passed cliff/shore returns.
    for delay, gain, pan in ((.047, .16, -.62), (.091, .125, .54), (.157, .085, -.25)):
        shift = int(delay * SR)
        reflected = moving_average(dry, 7)
        stereo[shift:, 0] += reflected[:-shift] * gain * math.sqrt((1 - pan) * .5)
        stereo[shift:, 1] += reflected[:-shift] * gain * math.sqrt((1 + pan) * .5)
    low_return = moving_average(dry, 71)
    for delay, gain, pan in ((.405, .13, .46), (.735, .075, -.38)):
        shift = int(delay * SR)
        stereo[shift:, 0] += low_return[:-shift] * gain * math.sqrt((1 - pan) * .5)
        stereo[shift:, 1] += low_return[:-shift] * gain * math.sqrt((1 + pan) * .5)

    tail = band_noise(38, 270) * (1 - np.exp(-t * 34)) * np.exp(-t * 1.52) * .085
    stereo[:, 0] += np.roll(tail, int(.019 * SR))
    stereo[:, 1] += np.roll(tail, int(.037 * SR)) * .91
    save('cannon', stereo.astype(np.float32), 'Coastal Cannon — Heavy Breech Report', peak=.72)


def explosion() -> None:
    duration = 3.15
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    rumble = low_noise(length, 39) * (1 - np.exp(-t * 48)) * np.exp(-t * 2.15) * .82
    crack = high_noise(length, 23) * np.exp(-t * 44) * .58
    body = np.sin(2 * np.pi * (43 * t + 34 * (1 - np.exp(-t * 14)) / 14)) * np.exp(-t * 3.6) * .58
    debris = np.zeros(length, dtype=np.float32)
    for index, at in enumerate((.08, .13, .21, .29, .42, .61, .79)):
        span = int((.13 + index * .012) * SR)
        u = np.arange(span, dtype=np.float64) / SR
        ping = np.sin(2 * np.pi * (1240 + index * 217) * u) * np.exp(-u * (32 - index))
        place(debris, ping.astype(np.float32), at, .070 - index * .005)
    save('explosion', room((rumble + crack + body + debris).astype(np.float32), 1.35, True),
         'High-Explosive Impact')


def rocket() -> None:
    duration = 2.0
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    ignition = pressure_pulse(duration, 76, .55, .40, .55)
    roar = high_noise(length, 17) * (1 - np.exp(-t * 65)) * np.exp(-t * 1.55) * .16
    whistle_phase = 2 * np.pi * (430 * t + 980 * t * t + 240 * t ** 3)
    whistle = np.sin(whistle_phase) * (1 - np.exp(-t * 16)) * np.exp(-t * 1.8) * .14
    save('rocket', room((ignition + roar + whistle).astype(np.float32), .70, False),
         'Rocket Ignition and Flyby')


def shock() -> None:
    """Three-stage launcher, impact and capacitor break; deliberately non-tonal."""
    duration = 1.72
    length = int(duration * SR)
    mono = np.zeros(length, dtype=np.float32)

    # 0.00 s: pneumatic cup-launcher thump and a short metal action.
    place(mono, pressure_pulse(.48, 83, .49, .41, .43), 0)
    place(mono, mechanism(.14, .86), .038)

    # 0.07–0.56 s: a dry air-cutting pass, not a rising synth tone.
    flight_len = int(.52 * SR)
    ft = np.arange(flight_len, dtype=np.float64) / SR
    flight_env = np.sin(np.pi * np.minimum(1, ft / .52)) ** 1.3
    flight_env *= np.exp(-ft * .68)
    air = high_noise(flight_len, 7) * flight_env.astype(np.float32) * .043
    air += low_noise(flight_len, 37) * flight_env.astype(np.float32) * .021
    place(mono, air, .055)

    # 0.60 s: weighty ground strike, then an irregular capacitor fracture.
    impact_at = .60
    place(mono, pressure_pulse(.94, 47, .98, .88, .83), impact_at)
    place(mono, mechanism(.19, 1.20), impact_at + .010, .78)
    for index, (at, gain) in enumerate(((.602, 1.0), (.638, .79), (.701, .66),
                                        (.786, .52), (.914, .37))):
        burst_len = int((.075 + index * .009) * SR)
        bt = np.arange(burst_len, dtype=np.float64) / SR
        crack = high_noise(burst_len, 3 + index * 2)
        crack *= np.exp(-bt * (82 - index * 7)).astype(np.float32) * gain * .30
        metal = (np.sin(2 * np.pi * (2180 + index * 317) * bt)
                 * np.exp(-bt * (96 - index * 5)) * gain * .10).astype(np.float32)
        place(mono, crack + metal, at)

    # A short, low electrical body makes the hit large without a watery sweep.
    tail_len = int(.72 * SR)
    tt = np.arange(tail_len, dtype=np.float64) / SR
    body = (np.sin(2 * np.pi * 63 * tt) + .31 * np.sin(2 * np.pi * 127 * tt + .4))
    body *= np.exp(-tt * 7.8) * .21
    place(mono, body.astype(np.float32), impact_at)
    stereo = room(mono, .82, False)
    stereo[:, 1] += np.roll(mono, int(.0017 * SR)) * .055
    save('shock', stereo, 'Shock Bomb — Launcher, Impact and Capacitor Break', peak=.55)


def flare() -> None:
    duration = 1.35
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    pop = pressure_pulse(duration, 122, .33, .38, .42)
    hiss = high_noise(length, 21) * (1 - np.exp(-t * 38)) * np.exp(-t * 3.6) * .075
    rise = np.sin(2 * np.pi * (290 * t + 420 * t * t)) * np.exp(-t * 2.7) * .11
    save('flare', room((pop + hiss + rise).astype(np.float32), .62, True), 'Signal Flare Launch')


def medkit() -> None:
    duration = 6.0
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    flyby = np.exp(-((t - 2.5) / 1.55) ** 2)
    prop = (np.sin(2 * np.pi * 71 * t + .18 * np.sin(2 * np.pi * 4.7 * t))
            + .34 * np.sin(2 * np.pi * 142 * t)) * flyby * .10
    wind = low_noise(length, 29) * flyby * .25
    chute = high_noise(length, 31) * np.exp(-((t - 4.45) / .72) ** 2) * .036
    impact = np.zeros(length, dtype=np.float32)
    place(impact, pressure_pulse(.62, 104, .28, .12, .30), 5.18)
    stereo = np.stack((prop + wind + chute + impact,
                       np.roll(prop + wind + chute, int(.018 * SR)) + impact), axis=-1)
    save('medkit', stereo.astype(np.float32), 'Medical Airdrop Pass')


def ui_click() -> None:
    """Short two-stage mechanical switch with no bell or arcade-note layer."""
    duration = .22
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    rng = np.random.default_rng(0x5549434C)
    raw = rng.normal(0, 1, length).astype(np.float32)
    plastic = raw - moving_average(raw, 23)
    contact = plastic * np.exp(-t * 128) * .19
    shell = moving_average(raw, 31) * np.exp(-t * 42) * .22
    thunk = (np.sin(2 * np.pi * 126 * t)
             + .28 * np.sin(2 * np.pi * 241 * t + .35)) * np.exp(-t * 52) * .19
    dry = (contact + shell + thunk).astype(np.float32)
    release = np.zeros(length, dtype=np.float32)
    release_start = int(.064 * SR)
    u = np.arange(length - release_start, dtype=np.float64) / SR
    release_noise = rng.normal(0, 1, len(u)).astype(np.float32)
    release[release_start:] = ((release_noise - moving_average(release_noise, 13))
                               * np.exp(-u * 155) * .080
                               + np.sin(2 * np.pi * 184 * u) * np.exp(-u * 75) * .055)
    dry += release
    stereo = np.stack((dry + np.roll(dry, 19) * .075,
                       np.roll(dry, 31) * .92 + np.roll(dry, 113) * .060), axis=-1)
    save('ui_click', stereo.astype(np.float32), 'UI Button — Mechanical Press', peak=.52)


def selection_sounds() -> None:
    """One authored selection signature per structure type plus both fleet hulls."""
    rng = np.random.default_rng(0x53454C45)

    duration = .58
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    hq = (np.sin(2 * np.pi * 92 * t) + .22 * np.sin(2 * np.pi * 184 * t + .3)) * np.exp(-t * 18) * .17
    hq += moving_average(rng.normal(0, 1, length), 17) * np.exp(-t * 31) * .11
    for at, gain in ((.018, .75), (.095, .48)):
        place(hq, mechanism(.15, gain), at)
    save('select_hq', selection_space(hq.astype(np.float32), .90), 'Structure Select — Command Relay', peak=.52)

    duration = .48
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    gold = moving_average(rng.normal(0, 1, length), 23) * np.exp(-t * 34) * .15
    for index, (at, frequency) in enumerate(((.015, 980), (.072, 1370), (.136, 1810))):
        u = np.maximum(0, t - at)
        gold += (np.sin(2 * np.pi * frequency * u)
                 + .24 * np.sin(2 * np.pi * frequency * 1.63 * u)) * np.exp(-u * (38 + index * 7)) * (t >= at) * (.075 - index * .012)
    save('select_gold', selection_space(gold.astype(np.float32), .82), 'Structure Select — Ore Chute', peak=.48)

    duration = .44
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    wood = np.zeros(length, dtype=np.float32)
    for index, at in enumerate((.012, .112)):
        u = np.maximum(0, t - at)
        knock = ((np.sin(2 * np.pi * (152 + index * 23) * u)
                  + .38 * np.sin(2 * np.pi * (304 + index * 37) * u + .5))
                 * np.exp(-u * (34 + index * 7)) * (t >= at) * (.18 - index * .045))
        knock += moving_average(rng.normal(0, 1, length), 9) * np.exp(-u * 80) * (t >= at) * .025
        wood += knock.astype(np.float32)
    save('select_wood', selection_space(wood, .78), 'Structure Select — Timber Knock', peak=.48)

    duration = .68
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    steel = (np.sin(2 * np.pi * 284 * t)
             + .51 * np.sin(2 * np.pi * 517 * t + .5)
             + .26 * np.sin(2 * np.pi * 903 * t + 1.1)) * np.exp(-t * 9.5) * .12
    steel += high_noise(length, 9) * np.exp(-t * 78) * .055
    save('select_steel', selection_space(steel.astype(np.float32), 1.0), 'Structure Select — Steel Plate', peak=.50)

    duration = .62
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    storage = np.zeros(length, dtype=np.float32)
    place(storage, mechanism(.18, 1.0), .012)
    slide_start = int(.075 * SR)
    u = np.arange(length - slide_start, dtype=np.float64) / SR
    slide = moving_average(rng.normal(0, 1, len(u)), 7) * np.exp(-u * 19) * .055
    storage[slide_start:] += slide.astype(np.float32)
    v = np.maximum(0, t - .095)
    storage += (np.sin(2 * np.pi * 74 * v) + .21 * np.sin(2 * np.pi * 151 * v)) * np.exp(-v * 22) * (t >= .095) * .17
    save('select_storage', selection_space(storage, .88), 'Structure Select — Storehouse Latch', peak=.52)

    duration = .56
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    servo_phase = 2 * np.pi * (205 * t + 165 * t * t)
    servo = np.sin(servo_phase) * (1 - np.exp(-t * 42)) * np.exp(-t * 5.8) * .075
    servo += moving_average(rng.normal(0, 1, length), 5) * (1 - np.exp(-t * 55)) * np.exp(-t * 8) * .026
    place(servo, mechanism(.16, .82), .055)
    save('select_defense', selection_space(servo.astype(np.float32), .82), 'Structure Select — Sniper Optic Servo', peak=.50)

    # Dedicated gold-store: steel cash drawer, falling ore and a positive lock.
    duration = .68
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    gold_store = np.zeros(length, dtype=np.float32)
    place(gold_store, mechanism(.17, .86), .008)
    for index, (at, frequency) in enumerate(((.052, 1120), (.094, 1490), (.138, 1930))):
        u = np.maximum(0, t - at)
        ping = (np.sin(2 * np.pi * frequency * u)
                + .19 * np.sin(2 * np.pi * frequency * 1.71 * u + .3))
        gold_store += (ping * np.exp(-u * (32 + index * 7))
                       * (t >= at) * (.057 - index * .008)).astype(np.float32)
    place(gold_store, pressure_pulse(.30, 92, .19, .07, .22), .032)
    save('select_gold_store', selection_space(gold_store, .92),
         'Structure Select — Gold Vault Drawer', peak=.49)

    # Dedicated timber store: hollow door knocks and a rough wooden slide.
    duration = .59
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    wood_store = np.zeros(length, dtype=np.float32)
    for index, at in enumerate((.008, .075, .142)):
        u = np.maximum(0, t - at)
        knock = (np.sin(2 * np.pi * (116 + index * 19) * u)
                 + .41 * np.sin(2 * np.pi * (235 + index * 29) * u + .5))
        wood_store += (knock * np.exp(-u * (31 + index * 6))
                       * (t >= at) * (.155 - index * .025)).astype(np.float32)
    slide_start = int(.125 * SR)
    slide = moving_average(rng.normal(0, 1, length - slide_start), 13)
    slide *= np.exp(-np.arange(len(slide)) / SR * 13).astype(np.float32) * .065
    wood_store[slide_start:] += slide
    save('select_wood_store', selection_space(wood_store, .84),
         'Structure Select — Timber Store Door', peak=.49)

    # Dedicated steel store: corrugated shutter resonance and ratchet catches.
    duration = .77
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    steel_store = ((np.sin(2 * np.pi * 211 * t)
                    + .44 * np.sin(2 * np.pi * 383 * t + .35)
                    + .21 * np.sin(2 * np.pi * 691 * t + .8))
                   * np.exp(-t * 7.2) * .105).astype(np.float32)
    scrape_env = (1 - np.exp(-t * 35)) * np.exp(-t * 8.2)
    steel_store += high_noise(length, 11) * scrape_env.astype(np.float32) * .042
    for at in (.012, .058, .105, .154):
        place(steel_store, mechanism(.095, .44), at)
    save('select_steel_store', selection_space(steel_store, 1.0),
         'Structure Select — Steel Store Shutter', peak=.50)

    # Vault: three massive bolts followed by the low body of the safe door.
    duration = .84
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    vault = np.zeros(length, dtype=np.float32)
    for index, at in enumerate((.006, .065, .126)):
        place(vault, mechanism(.20, 1.25 - index * .13), at)
    u = np.maximum(0, t - .075)
    door = (np.sin(2 * np.pi * 54 * u)
            + .33 * np.sin(2 * np.pi * 109 * u + .4))
    vault += (door * np.exp(-u * 8.1) * (t >= .075) * .29).astype(np.float32)
    vault += (moving_average(rng.normal(0, 1, length), 41)
              * np.exp(-u * 14) * (t >= .075) * .095).astype(np.float32)
    save('select_vault', selection_space(vault, 1.08),
         'Structure Select — Armored Vault Bolts', peak=.53)

    # Machine gun: rapid traverse gears, belt latch and a short receiver stop.
    duration = .53
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    gear = np.sin(2 * np.pi * (168 * t + 104 * t * t))
    ratchet = np.maximum(0, np.sin(2 * np.pi * 18 * t)) ** 8
    mg = gear * (1 - np.exp(-t * 50)) * np.exp(-t * 7.4) * .067
    mg += high_noise(length, 5) * ratchet.astype(np.float32) * np.exp(-t * 6.5) * .050
    place(mg, mechanism(.16, .93), .042)
    save('select_mg', selection_space(mg.astype(np.float32), .78),
         'Structure Select — Machine Gun Feed Lock', peak=.49)

    # Mortar: baseplate thump, elevation screw and a hollow launch-tube ring.
    duration = .67
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    mortar_select = np.zeros(length, dtype=np.float32)
    place(mortar_select, pressure_pulse(.55, 72, .31, .12, .29), 0)
    screw = np.sin(2 * np.pi * (126 * t + 210 * t * t))
    mortar_select += (screw * (1 - np.exp(-t * 38)) * np.exp(-t * 8.8) * .061).astype(np.float32)
    u = np.maximum(0, t - .055)
    tube = (np.sin(2 * np.pi * 418 * u) + .34 * np.sin(2 * np.pi * 837 * u))
    mortar_select += (tube * np.exp(-u * 18) * (t >= .055) * .074).astype(np.float32)
    save('select_mortar', selection_space(mortar_select.astype(np.float32), .92),
         'Structure Select — Mortar Baseplate Clamp', peak=.51)

    # Cannon: slow powered traverse and a separate, heavy breech-block closure.
    duration = .78
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    traverse = (np.sin(2 * np.pi * (86 * t + 54 * t * t))
                + .29 * np.sin(2 * np.pi * (173 * t + 31 * t * t) + .5))
    cannon_select = traverse * (1 - np.exp(-t * 22)) * np.exp(-t * 5.9) * .105
    cannon_select += low_noise(length, 17) * (1 - np.exp(-t * 28)) * np.exp(-t * 7.5) * .046
    place(cannon_select, mechanism(.24, 1.38), .025)
    place(cannon_select, pressure_pulse(.36, 61, .31, .08, .31), .075)
    save('select_cannon', selection_space(cannon_select.astype(np.float32), 1.05),
         'Structure Select — Cannon Breech Traverse', peak=.53)

    # Rocket battery: five tube relays, a hydraulic latch and dry gas hiss.
    duration = .73
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    rocket_select = np.zeros(length, dtype=np.float32)
    for index, at in enumerate((.008, .042, .078, .115, .153)):
        place(rocket_select, mechanism(.085, .50 + index * .035), at)
    hiss_at = int(.110 * SR)
    ht = np.arange(length - hiss_at, dtype=np.float64) / SR
    hiss = high_noise(len(ht), 7) * (1 - np.exp(-ht * 60)) * np.exp(-ht * 10.5) * .048
    rocket_select[hiss_at:] += hiss.astype(np.float32)
    place(rocket_select, pressure_pulse(.35, 101, .20, .06, .23), .045)
    save('select_rocket', selection_space(rocket_select, .88),
         'Structure Select — Rocket Tube Relay Bank', peak=.50)

    # Gunboat: bridge telegraph lever over a deep, brief diesel foundation.
    duration = .88
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    diesel = (np.sin(2 * np.pi * 43 * t + .18 * np.sin(2 * np.pi * 6.4 * t))
              + .35 * np.sin(2 * np.pi * 86 * t + .6)) * np.exp(-t * 4.9) * .13
    gunboat = diesel.astype(np.float32)
    place(gunboat, mechanism(.20, 1.08), .018)
    place(gunboat, mechanism(.17, .78), .090)
    u = np.maximum(0, t - .120)
    telegraph = (np.sin(2 * np.pi * 326 * u)
                 + .27 * np.sin(2 * np.pi * 651 * u + .2))
    gunboat += (telegraph * np.exp(-u * 14) * (t >= .120) * .063).astype(np.float32)
    save('select_gunboat', selection_space(gunboat, 1.12),
         'Fleet Select — Gunboat Engine Telegraph', peak=.52)

    # Landing craft: smaller diesel response, hull knock, ramp latch and water wash.
    duration = .69
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    engine = (np.sin(2 * np.pi * 67 * t + .15 * np.sin(2 * np.pi * 8.2 * t))
              + .24 * np.sin(2 * np.pi * 134 * t + .5)) * np.exp(-t * 7.4) * .105
    wash = high_noise(length, 29) * (1 - np.exp(-t * 28)) * np.exp(-t * 8.2) * .036
    landing_select = (engine + wash).astype(np.float32)
    place(landing_select, pressure_pulse(.31, 108, .18, .05, .20), .046)
    place(landing_select, mechanism(.14, .72), .092)
    save('select_landing_craft', selection_space(landing_select, .94),
         'Fleet Select — Landing Craft Hull and Ramp', peak=.49)


def landing_sequence_sounds() -> None:
    """Approach engine and hull-on-sand impact for a staged beach landing."""
    rng = np.random.default_rng(0x4C414E44)
    duration = 2.65
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    throttle = .72 + .28 * np.minimum(1, t / 1.45)
    pulse = .67 + .33 * np.maximum(0, np.sin(2 * np.pi * 7.1 * t))
    engine = (np.sin(2 * np.pi * 38 * t + .22 * np.sin(2 * np.pi * 7.1 * t))
              + .42 * np.sin(2 * np.pi * 76 * t + .6)
              + .18 * np.sin(2 * np.pi * 114 * t + 1.2)) * throttle * pulse * .16
    engine += moving_average(rng.normal(0, 1, length), 27) * throttle * .12
    bow_wash = high_noise(length, 31) * (1 - np.exp(-t * 3.2)) * (.06 + .055 * t / duration)
    fade = np.ones(length, dtype=np.float32)
    fade[-int(.22 * SR):] = np.linspace(1, 0, int(.22 * SR), dtype=np.float32)
    mono = (engine + bow_wash) * fade
    stereo = np.stack((mono + np.roll(bow_wash, 241) * .18,
                       np.roll(mono, 47) * .96 + np.roll(bow_wash, 397) * .16), axis=-1)
    save('landing_engine', stereo.astype(np.float32), 'Landing Craft — Diesel Surf Approach', peak=.58)

    duration = 1.85
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    thud = (np.sin(2 * np.pi * (46 * t + 22 * (1 - np.exp(-t * 18)) / 18))
            + .31 * np.sin(2 * np.pi * 91 * t + .4)) * np.exp(-t * 7.2) * .47
    spray = high_noise(length, 19) * (1 - np.exp(-t * 85)) * np.exp(-t * 4.8) * .18
    scrape = moving_average(rng.normal(0, 1, length), 7) * (1 - np.exp(-t * 36)) * np.exp(-t * 2.9) * .15
    hull = np.sin(2 * np.pi * 226 * t + .2) * np.exp(-t * 12) * .075
    mono = (thud + spray + scrape + hull).astype(np.float32)
    stereo = room(mono, .45, False)
    stereo[:, 1] += np.roll(scrape.astype(np.float32), int(.021 * SR)) * .16
    save('landing_impact', stereo.astype(np.float32), 'Landing Craft — Hull Beaching Impact', peak=.66)


def utility_sounds() -> None:
    duration = 1.15
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    build = np.sin(2 * np.pi * 168 * t) * np.exp(-t * 23) * .20
    for at, frequency in ((.16, 523), (.34, 659)):
        u = np.maximum(0, t - at)
        build += (np.sin(2 * np.pi * frequency * u) + .24 * np.sin(2 * np.pi * frequency * 2.01 * u)) * np.exp(-u * 5) * .095 * (t >= at)
    save('build', room(build.astype(np.float32), .38, False), 'Construction Confirm')

    duration = 2.35
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    victory = np.zeros(length, dtype=np.float32)
    for index, frequency in enumerate((392, 494, 587, 659, 784)):
        at = index * .19
        u = np.maximum(0, t - at)
        victory += (np.sin(2 * np.pi * frequency * u) + .20 * np.sin(2 * np.pi * frequency * 2 * u)) * np.exp(-u * 2.4) * .10 * (t >= at)
    save('win', room(victory, .72, False), 'Victory Brass Cadence')

    duration = 1.75
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    wash = low_noise(length, 37) * np.minimum(1, t * 16) * np.exp(-t * 2.1) * .62
    foam = high_noise(length, 19) * np.minimum(1, t * 10) * np.exp(-t * 3.1) * .09
    droplets = np.zeros(length, dtype=np.float32)
    for index, at in enumerate((.05, .09, .15, .23, .34, .47, .63)):
        span = int(.13 * SR)
        u = np.arange(span, dtype=np.float64) / SR
        ping = np.sin(2 * np.pi * (940 - index * 74) * u) * np.exp(-u * 46)
        place(droplets, ping.astype(np.float32), at, .042)
    save('splash', np.stack((wash + foam + droplets,
                             np.roll(wash + foam, 337) + np.roll(droplets, 113)), axis=-1),
         'Landing Craft Surf')

    duration = 1.25
    length = int(duration * SR)
    t = np.arange(length, dtype=np.float64) / SR
    ramp = low_noise(length, 5) * np.minimum(1, t * 40) * np.exp(-t * 3.1) * .19
    ramp += np.sin(2 * np.pi * 109 * t) * np.exp(-t * 3.8) * .10
    for at in (.03, .76, .91):
        place(ramp, mechanism(.19, 1.1), at)
    save('ramp', room(ramp.astype(np.float32), .44, False), 'Landing Craft Ramp')

    duration = 1.1
    length = int(duration * SR)
    steps = np.zeros(length, dtype=np.float32)
    for index, at in enumerate((0, .14, .28, .43, .57, .72, .88)):
        step = pressure_pulse(.17, 116 + index * 4, .12, .04, .18)
        place(steps, step, at, .78 + (index % 3) * .08)
    stereo = np.stack((steps + np.roll(steps, int(.019 * SR)) * .35,
                       np.roll(steps, int(.008 * SR)) * .82 + np.roll(steps, int(.031 * SR)) * .30), axis=-1)
    save('steps', stereo, 'Squad Footsteps on Wet Sand')


def main() -> None:
    gun('rifle', 'Service Rifle — Single Shot', 1.45, 96, .82, 1.03, .72, .052)
    gun('sniper', 'Sniper Rifle — Supersonic Shot', 2.45, 67, 1.22, 1.48, 1.35, .082)
    machine_gun()
    mortar_launch()
    coastal_cannon()
    gun('tank', 'Tank Main Gun', 2.45, 43, 1.62, 1.30, 1.52, .150)
    gun('artillery', 'Warship Deck Gun', 3.15, 36, 2.05, 1.55, 1.92, .185)
    explosion()
    rocket()
    shock()
    flare()
    medkit()
    ui_click()
    selection_sounds()
    landing_sequence_sounds()
    utility_sounds()


if __name__ == '__main__':
    main()
