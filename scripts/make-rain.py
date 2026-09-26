"""Synthesize the rain-on-a-window ambience loop and a distant thunder one-shot.

Run: python3 scripts/make-rain.py   (requires numpy, scipy and ffmpeg/ffprobe)

Everything is generated from scratch with a fixed random seed, so the output is
reproducible and there are no third-party samples (original synthesized audio,
created for this project).

Writes:
  static/audio/atmosphere/rain.mp3     ~24 s seamless stereo loop, 128 kbps
  static/audio/atmosphere/rain.ogg     same loop as Ogg Vorbis (only if ffmpeg
                                       has libvorbis; skipped otherwise)
  static/audio/atmosphere/thunder.mp3  ~7 s distant rolling thunder, 96 kbps

How the loop is made seamless: the whole rain signal is built *circularly*.
The hiss bed is shaped noise synthesized directly in the frequency domain over
exactly one loop length (so it is periodic by construction), every droplet
that would run past the end wraps around onto the start (an overlap-add of the
tail onto the head), the slow swell uses whole periods of the loop, and the
final tone shaping is applied in the frequency domain too. The last sample
therefore flows into the first exactly like any other pair of neighbours:
no crossfade dip, no click and no level jump at the loop point.

After encoding, the script decodes the files back with ffmpeg and prints
durations, sizes, peak/RMS/LUFS, the seam check and the spectral centroid.
"""

import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 44_100
SEED = 20_260_926
RAIN_SECONDS = 24.0
THUNDER_SECONDS = 7.0
RAIN_TARGET_LUFS = -20.0
RAIN_PEAK_CEILING_DB = -6.0
THUNDER_TARGET_LUFS = -20.0
THUNDER_PEAK_CEILING_DB = -3.0

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "static/audio/atmosphere"
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"

rng = np.random.default_rng(SEED)


# ---------------------------------------------------------------- helpers

def db(x):
  return 20 * np.log10(max(float(x), 1e-12))


def spectral_noise(n, shape, channels=1):
  """Periodic noise of length n whose magnitude spectrum follows shape(f)."""
  freqs = np.fft.rfftfreq(n, 1 / SR)
  mag = shape(freqs)
  mag[0] = 0.0  # no DC
  out = []
  for _ in range(channels):
    phase = rng.uniform(0, 2 * np.pi, len(freqs))
    amp = mag * rng.rayleigh(1.0, len(freqs))  # Gaussian-like noise
    x = np.fft.irfft(amp * np.exp(1j * phase), n)
    out.append(x / (np.std(x) + 1e-12))
  return np.array(out)


def circular_filter(x, response):
  """Apply a zero-phase magnitude response to a periodic signal (per row)."""
  n = x.shape[-1]
  freqs = np.fft.rfftfreq(n, 1 / SR)
  h = response(freqs)
  h[0] = 0.0
  return np.fft.irfft(np.fft.rfft(x, axis=-1) * h, n, axis=-1)


def lowpass_mag(f, fc, order):
  return 1.0 / np.sqrt(1.0 + (f / fc) ** (2 * order))


def highpass_mag(f, fc, order):
  ratio = np.where(f > 0, fc / np.maximum(f, 1e-9), np.inf)
  return 1.0 / np.sqrt(1.0 + ratio ** (2 * order))


def pan_gains(pan):
  """Constant-power pan, pan in [-1, 1]."""
  angle = (pan + 1) * np.pi / 4
  return np.cos(angle), np.sin(angle)


def add_wrapped(buf, event, start, pan, delay_samples=0):
  """Mix a mono event into a stereo periodic buffer, wrapping at the end."""
  n = buf.shape[1]
  gl, gr = pan_gains(pan)
  # A tiny inter-channel delay on the far side adds width.
  dl, dr = (delay_samples, 0) if pan > 0 else (0, delay_samples)
  idx = np.arange(len(event))
  np.add.at(buf[0], (start + dl + idx) % n, gl * event)
  np.add.at(buf[1], (start + dr + idx) % n, gr * event)


def bandpassed_burst(length, fc, q, tau, attack=0.0003):
  """Short noise transient through a resonant band-pass: a droplet tick."""
  t = np.arange(length) / SR
  env = (1 - np.exp(-t / attack)) * np.exp(-t / tau)
  noise = rng.standard_normal(length) * env
  bw = fc / q
  lo, hi = max(fc - bw / 2, 40.0), min(fc + bw / 2, SR / 2 * 0.95)
  sos = signal.butter(2, [lo, hi], btype="bandpass", fs=SR, output="sos")
  y = signal.sosfilt(sos, noise)
  return y / (np.max(np.abs(y)) + 1e-12)


def damped_sine(length, f0, tau, sweep=0.0, attack=0.0004):
  t = np.arange(length) / SR
  freq = f0 * (1 + sweep * (1 - np.exp(-t / (tau * 1.5))))
  phase = 2 * np.pi * np.cumsum(freq) / SR
  env = (1 - np.exp(-t / attack)) * np.exp(-t / tau)
  return np.sin(phase) * env


def poisson_times(rate, n, envelope):
  """Event start samples with density following envelope (thinning)."""
  duration = n / SR
  peak = rate * envelope.max()
  count = rng.poisson(peak * duration)
  times = np.sort(rng.uniform(0, n, count)).astype(int)
  keep = rng.uniform(0, 1, count) < (rate * envelope[times]) / peak
  return times[keep]


def measure_lufs(path):
  """Integrated loudness (EBU R128) via ffmpeg's ebur128 filter."""
  res = subprocess.run(
    [FFMPEG, "-hide_banner", "-nostats", "-i", str(path),
     "-af", "ebur128=framelog=quiet", "-f", "null", "-"],
    capture_output=True, text=True,
  )
  found = re.findall(r"I:\s+(-?[\d.]+|-inf)\s+LUFS", res.stderr)
  return float(found[-1]) if found and found[-1] != "-inf" else float("-inf")


def write_wav(path, x):
  data = np.clip(x.T if x.ndim == 2 else x, -1.0, 1.0).astype(np.float32)
  wavfile.write(str(path), SR, data)


def normalise(x, tmp, name, target_lufs, peak_ceiling_db):
  """Scale to target LUFS, but never let the sample peak exceed the ceiling."""
  x = x - x.mean(axis=-1, keepdims=True)  # belt-and-braces DC removal
  x = x / np.max(np.abs(x)) * 0.5
  probe = tmp / f"{name}-probe.wav"
  write_wav(probe, x)
  gain_db = target_lufs - measure_lufs(probe)
  peak_db = db(np.max(np.abs(x))) + gain_db
  if peak_db > peak_ceiling_db:
    gain_db -= peak_db - peak_ceiling_db
  return x * 10 ** (gain_db / 20)


def encode(wav, out, codec_args):
  subprocess.run(
    [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
     *codec_args, "-map_metadata", "-1", str(out)],
    check=True,
  )


def has_encoder(name):
  res = subprocess.run([FFMPEG, "-hide_banner", "-encoders"],
                       capture_output=True, text=True)
  return re.search(rf"^\s*A\S*\s+{name}\s", res.stdout, re.M) is not None


# ---------------------------------------------------------------- rain

def make_rain():
  n = int(RAIN_SECONDS * SR)
  t = np.arange(n) / SR

  # Slow intensity swell: whole periods of the loop so it wraps cleanly.
  swell = (1.0
           + 0.10 * np.sin(2 * np.pi * t / RAIN_SECONDS + 0.7)
           + 0.05 * np.sin(2 * np.pi * 3 * t / RAIN_SECONDS + 2.1)
           + 0.03 * np.sin(2 * np.pi * 7 * t / RAIN_SECONDS + 4.0))

  # 1. Hiss bed: pink-to-brown noise, band-limited like sound heard through a
  #    closed window (glass and walls eat the highs). Two layers: a warm
  #    brownish body and a softer pinkish "sheet of rain" layer.
  def body_shape(f):
    f = np.maximum(f, 1.0)
    return (f ** -0.6 * highpass_mag(f, 140, 2) * lowpass_mag(f, 2200, 2))

  def sheet_shape(f):
    f = np.maximum(f, 1.0)
    return (f ** -0.5 * highpass_mag(f, 250, 2) * lowpass_mag(f, 3800, 3)
            * (1 + 0.6 * np.exp(-((np.log2(f / 900)) ** 2) / 0.8)))

  common_body = spectral_noise(n, body_shape)[0]
  body = 0.55 * common_body + 0.45 * spectral_noise(n, body_shape, 2)
  common_sheet = spectral_noise(n, sheet_shape)[0]
  sheet = 0.35 * common_sheet + 0.65 * spectral_noise(n, sheet_shape, 2)
  # A very slow, gentle flutter of the sheet (gusts against the pane),
  # itself periodic in the loop.
  gusts = circular_filter(rng.standard_normal((1, n)),
                          lambda f: lowpass_mag(f, 0.6, 2))[0]
  flutter = np.clip(1 + 0.15 * gusts / np.std(gusts), 0.6, 1.4)
  hiss = (0.6 * body + 0.8 * sheet * flutter) * swell

  drops = np.zeros((2, n))

  # 2. Fine patter: a dense field of tiny, soft ticks on the glass.
  for start in poisson_times(140, n, swell):
    length = int(SR * rng.uniform(0.004, 0.012))
    ev = bandpassed_burst(length, rng.uniform(1100, 3800), rng.uniform(1.5, 3.5),
                          rng.uniform(0.0008, 0.0025))
    amp = 0.02 * rng.lognormal(0, 0.45)
    add_wrapped(drops, ev * amp, start, rng.uniform(-0.9, 0.9),
                int(rng.uniform(0, 0.0004) * SR))

  # 3. Droplets: fewer, clearer taps, some with a faint glassy "tink".
  for start in poisson_times(9, n, swell):
    length = int(SR * rng.uniform(0.015, 0.04))
    ev = bandpassed_burst(length, rng.uniform(700, 2600), rng.uniform(2, 5),
                          rng.uniform(0.002, 0.006))
    if rng.uniform() < 0.35:
      ev = ev + 0.35 * damped_sine(length, rng.uniform(1800, 3400),
                                   rng.uniform(0.003, 0.007))
    amp = 0.055 * rng.lognormal(0, 0.4)
    add_wrapped(drops, ev * amp, start, rng.uniform(-0.8, 0.8),
                int(rng.uniform(0, 0.0005) * SR))

  # 4. Heavier drips (from the eave / sill): a soft click plus a low body
  #    thump, now and then a small rising "plop".
  for start in poisson_times(0.55, n, np.ones(n)):
    length = int(SR * 0.12)
    click = bandpassed_burst(length, rng.uniform(900, 1600), 2.0,
                             rng.uniform(0.003, 0.006))
    thump = damped_sine(length, rng.uniform(160, 320), rng.uniform(0.012, 0.025))
    ev = 0.5 * click + 0.8 * thump
    if rng.uniform() < 0.5:
      ev = ev + 0.5 * damped_sine(length, rng.uniform(550, 1000),
                                  rng.uniform(0.010, 0.02),
                                  sweep=rng.uniform(0.2, 0.45))
    ev /= np.max(np.abs(ev))
    amp = 0.12 * rng.lognormal(0, 0.3)
    add_wrapped(drops, ev * amp, start, rng.uniform(-0.6, 0.6),
                int(rng.uniform(0, 0.0005) * SR))

  mix = 0.03 * hiss + drops
  # Final "through the window" voicing, applied circularly: remove sub-rumble
  # and DC, roll the top off gently so nothing sounds like TV static.
  mix = circular_filter(
    mix, lambda f: highpass_mag(f, 80, 2) * lowpass_mag(f, 5500, 2))
  return mix


# ---------------------------------------------------------------- thunder

def make_thunder():
  n = int(THUNDER_SECONDS * SR)
  t = np.arange(n) / SR

  # Brown-ish rumble, well low-passed (distance strips the highs).
  sos_rumble = signal.butter(4, [28, 220], btype="bandpass", fs=SR, output="sos")
  sos_mid = signal.butter(2, [120, 520], btype="bandpass", fs=SR, output="sos")
  base = rng.standard_normal((2, n))
  base = 0.6 * base[0] + 0.4 * base  # partially correlated stereo
  rumble = signal.sosfiltfilt(sos_rumble, base, axis=-1)
  grit = signal.sosfiltfilt(sos_mid, rng.standard_normal((2, n)), axis=-1)
  rumble /= np.std(rumble)
  grit /= np.std(grit)

  # Rolling envelope: a handful of overlapping swells of decreasing size,
  # each a smooth bump, modulated by slow random amplitude motion.
  env = np.zeros(n)
  onsets = [0.35, 0.9, 1.6, 2.5, 3.4, 4.3]
  for k, onset in enumerate(onsets):
    onset += rng.uniform(-0.12, 0.12)
    peak = 0.78 ** k * rng.uniform(0.75, 1.1)
    rise, fall = rng.uniform(0.15, 0.4), rng.uniform(0.7, 1.6)
    dt = t - onset
    bump = np.where(dt < 0, np.exp(-(dt / rise) ** 2),
                    np.exp(-dt / fall))
    env += peak * bump
  wobble = signal.sosfiltfilt(
    signal.butter(2, 6, fs=SR, output="sos"), rng.standard_normal(n))
  wobble = 1 + 0.45 * wobble / np.std(wobble)
  env = env * np.clip(wobble, 0.25, 1.8)

  # Soft initial crack: brief noisy burst, heavily low-passed.
  crack_t = 0.28
  dt = t - crack_t
  crack_env = np.where(dt < 0, 0.0, (1 - np.exp(-np.maximum(dt, 0) / 0.01))
                       * np.exp(-np.maximum(dt, 0) / 0.22))
  sos_crack = signal.butter(3, 900, btype="lowpass", fs=SR, output="sos")
  crack = signal.sosfiltfilt(sos_crack, rng.standard_normal((2, n)), axis=-1)
  crack /= np.std(crack)
  crack *= crack_env

  x = rumble * env + 0.35 * grit * env ** 1.4 + 0.5 * crack

  # Fade in the first 40 ms and to silence over the last 2 s.
  fade = np.ones(n)
  a = int(0.04 * SR)
  fade[:a] = np.sin(np.linspace(0, np.pi / 2, a)) ** 2
  f = int(2.0 * SR)
  fade[-f:] = np.cos(np.linspace(0, np.pi / 2, f)) ** 2
  x = x * fade
  x = signal.sosfiltfilt(signal.butter(2, 25, btype="highpass", fs=SR,
                                       output="sos"), x, axis=-1)
  x[:, -64:] = 0.0
  return x


# ---------------------------------------------------------------- checks

def decode(path):
  res = subprocess.run(
    [FFMPEG, "-hide_banner", "-loglevel", "error", "-i", str(path),
     "-f", "f32le", "-acodec", "pcm_f32le", "-ar", str(SR), "-"],
    capture_output=True, check=True,
  )
  channels = int(subprocess.run(
    [FFPROBE, "-v", "error", "-select_streams", "a:0", "-show_entries",
     "stream=channels", "-of", "csv=p=0", str(path)],
    capture_output=True, text=True, check=True).stdout.strip())
  return np.frombuffer(res.stdout, np.float32).reshape(-1, channels).T


def duration(path):
  return float(subprocess.run(
    [FFPROBE, "-v", "error", "-show_entries", "format=duration",
     "-of", "csv=p=0", str(path)],
    capture_output=True, text=True, check=True).stdout.strip())


def centroid(x):
  f, p = signal.welch(x.mean(axis=0), SR, nperseg=8192)
  return float(np.sum(f * p) / np.sum(p))


def rms(x):
  return float(np.sqrt(np.mean(np.square(x))))


def report(path, seam=False):
  x = decode(path)
  print(f"\n{path.relative_to(ROOT)}")
  print(f"  size        {path.stat().st_size / 1024:.1f} KB")
  print(f"  duration    {duration(path):.3f} s (decoded {x.shape[1] / SR:.3f} s, "
        f"{x.shape[0]} ch)")
  print(f"  peak        {db(np.max(np.abs(x))):.1f} dBFS")
  print(f"  rms         {db(rms(x)):.1f} dBFS")
  print(f"  loudness    {measure_lufs(path):.1f} LUFS integrated")
  print(f"  dc offset   {np.abs(x.mean(axis=1)).max():.2e}")
  print(f"  centroid    {centroid(x):.0f} Hz")
  if seam:
    w = int(0.05 * SR)
    head, tail = rms(x[:, :w]), rms(x[:, -w:])
    jump = np.abs(x[:, 0] - x[:, -1]).max()
    steps = np.abs(np.diff(x, axis=1))
    sec = [db(rms(x[:, i:i + SR])) for i in range(0, x.shape[1] - SR + 1, SR)]
    print(f"  seam rms    first 50 ms {db(head):.2f} dBFS, last 50 ms "
          f"{db(tail):.2f} dBFS (diff {db(head) - db(tail):+.2f} dB)")
    print(f"  seam step   |x[0]-x[-1]| = {jump:.4f} (sample-to-sample steps: "
          f"median {np.median(steps):.4f}, 99th pct "
          f"{np.percentile(steps, 99):.4f}, max {steps.max():.4f})")
    print(f"  1 s rms     {min(sec):.1f} .. {max(sec):.1f} dBFS (swell range)")


# ---------------------------------------------------------------- main

def main():
  OUT_DIR.mkdir(parents=True, exist_ok=True)
  with tempfile.TemporaryDirectory() as tmp_name:
    tmp = Path(tmp_name)

    rain = normalise(make_rain(), tmp, "rain", RAIN_TARGET_LUFS,
                     RAIN_PEAK_CEILING_DB)
    rain_wav = tmp / "rain.wav"
    write_wav(rain_wav, rain)
    encode(rain_wav, OUT_DIR / "rain.mp3",
           ["-c:a", "libmp3lame", "-b:a", "128k", "-ar", str(SR)])
    if has_encoder("libvorbis"):
      encode(rain_wav, OUT_DIR / "rain.ogg",
             ["-c:a", "libvorbis", "-q:a", "3", "-ar", str(SR)])
    else:
      print("ffmpeg has no libvorbis encoder; skipping rain.ogg")

    thunder = normalise(make_thunder(), tmp, "thunder", THUNDER_TARGET_LUFS,
                        THUNDER_PEAK_CEILING_DB)
    thunder_wav = tmp / "thunder.wav"
    write_wav(thunder_wav, thunder)
    encode(thunder_wav, OUT_DIR / "thunder.mp3",
           ["-c:a", "libmp3lame", "-b:a", "96k", "-ar", str(SR)])

    print("source WAV seam (before encoding): "
          f"|x[0]-x[-1]| = {np.abs(rain[:, 0] - rain[:, -1]).max():.4f}, "
          f"median step {np.median(np.abs(np.diff(rain, axis=1))):.4f}")

  report(OUT_DIR / "rain.mp3", seam=True)
  if (OUT_DIR / "rain.ogg").exists():
    report(OUT_DIR / "rain.ogg", seam=True)
  report(OUT_DIR / "thunder.mp3")


if __name__ == "__main__":
  main()
