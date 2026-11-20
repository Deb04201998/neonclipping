"""Stall-proof downloads for ShortCircuit (tuned for macOS, works anywhere).

Why this exists: a single in-process yt-dlp call has no way to notice a stalled or throttled download, and ffmpeg-based
section downloads (download_ranges) report no progress at all, so a hang looked like "stuck forever". Here every download
runs as a separate yt-dlp process that we watch. If the bytes on disk stop growing for STALL_SECS the process is killed
and retried from the partial file on a gentler setting (fewer parallel fragments, smaller chunks, other YouTube clients).

    from mac_dl import fetch
    files = fetch(url, str(DATA/'job.%(ext)s'), fmt='ba[ext=m4a]/ba', on_progress=lambda mb, tries: ...)
    files = fetch(url, str(DATA/'clip.%(ext)s'), fmt=VIDEO_FMT, sections=(120.0, 150.0), merge_mp4=True)

Environment knobs (all optional):
    SHORTCIRCUIT_STALL_SECS   seconds without growth before a retry (default 45)
    SHORTCIRCUIT_SLOTS        simultaneous downloads app-wide (default 2; YouTube throttles more than that)
    SHORTCIRCUIT_BROWSER      safari | chrome | firefox | brave | edge : borrow that browser's YouTube login cookies
                          (fixes "Sign in to confirm you're not a bot" and many throttling stalls)
    SHORTCIRCUIT_NO_UPDATE    set to 1 to skip the daily yt-dlp self-update
"""
import os, sys, time, signal, shutil, threading, subprocess
from pathlib import Path

STALL_SECS = int(os.environ.get('SHORTCIRCUIT_STALL_SECS', '45'))
SLOTS = threading.BoundedSemaphore(max(1, int(os.environ.get('SHORTCIRCUIT_SLOTS', '2'))))
STARTUP_GRACE = 90  # seconds allowed before the first byte lands (page fetch, signature solving, ffmpeg seek on long streams)
SKIP = ('.part', '.ytdl', '.temp', '.tmp', '.frag')

# Each rung is gentler / different from the last. Partial files are kept, so progress is not thrown away between rungs.
LADDER = [
    {'frags': 4, 'chunk': '10M', 'extra': []},
    {'frags': 1, 'chunk': '4M', 'extra': []},
    {'frags': 1, 'chunk': '4M', 'extra': ['--extractor-args', 'youtube:player_client=tv,web_safari,mweb']},
    {'frags': 1, 'chunk': '2M', 'extra': ['--extractor-args', 'youtube:player_client=default,-web']},
]


def browser():
    b = os.environ.get('SHORTCIRCUIT_BROWSER', '').strip().lower()
    return b if b in ('safari', 'chrome', 'firefox', 'brave', 'edge', 'chromium', 'opera', 'vivaldi') else ''


def info_opts(**extra):
    """Options for in-process yt-dlp metadata lookups (no download): fail fast instead of hanging."""
    o = {'noplaylist': True, 'quiet': True, 'no_warnings': True, 'socket_timeout': 20, 'retries': 5, 'extractor_retries': 3}
    if browser():
        o['cookiesfrombrowser'] = (browser(),)
    o.update(extra)
    return o


def _prefix(outtmpl):
    p = Path(outtmpl)
    return p.parent, p.name.split('%(')[0]


def _size(folder, prefix):
    total = 0
    try:
        for f in folder.iterdir():
            if f.name.startswith(prefix):
                try:
                    total += f.stat().st_size
                except OSError:
                    pass
    except OSError:
        pass
    return total


def _finished(folder, prefix):
    return sorted(f for f in folder.iterdir() if f.name.startswith(prefix) and f.suffix not in SKIP and f.is_file())


def _kill(proc):
    try:
        if os.name == 'posix':
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)  # also kills the ffmpeg child that yt-dlp spawns for sections
        else:
            proc.kill()
    except (ProcessLookupError, PermissionError, OSError):
        pass
    try:
        proc.wait(timeout=5)
    except Exception:
        pass


def _cmd(url, outtmpl, fmt, sections, merge_mp4, rung):
    c = [sys.executable, '-m', 'yt_dlp', '--no-playlist', '--no-warnings', '--no-colors', '-q',
         '-f', fmt, '-o', outtmpl, '--continue', '--no-overwrites',
         '--retries', '10', '--fragment-retries', '10', '--extractor-retries', '3', '--socket-timeout', '20',
         '--concurrent-fragments', str(rung['frags']), '--http-chunk-size', rung['chunk'],
         '--retry-sleep', 'http:exp=1:20', '--retry-sleep', 'fragment:exp=1:20']
    if sections:
        c += ['--download-sections', f'*{max(0.0, sections[0]):.2f}-{sections[1]:.2f}', '--force-keyframes-at-cuts']
    if merge_mp4:
        c += ['--merge-output-format', 'mp4']
    if browser():
        c += ['--cookies-from-browser', browser()]
    return c + rung['extra'] + [url]


def fetch(url, outtmpl, fmt='b', sections=None, merge_mp4=False, on_progress=None, stall_secs=None, max_total=3 * 3600):
    """Download with stall detection. Returns the finished files (usually one). Raises RuntimeError with the real reason."""
    stall = stall_secs or STALL_SECS
    folder, prefix = _prefix(outtmpl)
    folder.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    last_err = ''
    with SLOTS:
        for attempt, rung in enumerate(LADDER, 1):
            if time.monotonic() - started > max_total:
                break
            proc = subprocess.Popen(_cmd(url, outtmpl, fmt, sections, merge_mp4, rung), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    text=True, start_new_session=(os.name == 'posix'))
            err_lines = []
            threading.Thread(target=lambda: [err_lines.append(l) for l in proc.stderr], daemon=True).start()
            last_size, last_move, began = _size(folder, prefix), time.monotonic(), time.monotonic()
            stalled = False
            while proc.poll() is None:
                time.sleep(2)
                size = _size(folder, prefix)
                now = time.monotonic()
                if size != last_size:
                    last_size, last_move = size, now
                if on_progress:
                    try:
                        on_progress(size / 1048576, attempt)
                    except Exception:
                        pass
                limit = stall if last_size > 0 else max(stall, STARTUP_GRACE)
                if now - last_move > limit:
                    stalled = True
                    _kill(proc)
                    break
                if now - started > max_total:
                    _kill(proc)
                    break
            last_err = ''.join(err_lines[-6:]).strip() or ('stalled: no new data for %ds' % stall if stalled else '')
            files = _finished(folder, prefix)
            if proc.returncode == 0 and files:
                return [str(f) for f in files]
            if not stalled and ('Sign in' in last_err or 'confirm you' in last_err or 'private video' in last_err.lower()):
                raise RuntimeError(last_err + '\nTip: set SHORTCIRCUIT_BROWSER=safari (or chrome) so downloads use your logged-in YouTube cookies.')
            time.sleep(min(3 * attempt, 10))
    raise RuntimeError(('Download failed after %d tries. ' % len(LADDER)) + (last_err[-600:] or 'unknown error'))


def self_update(data_dir):
    """Refresh yt-dlp at most once a day, in the background. YouTube changes often and an old yt-dlp is the #1 cause of stalls."""
    if os.environ.get('SHORTCIRCUIT_NO_UPDATE') == '1':
        return
    stamp = Path(data_dir) / '.ytdlp_updated'
    try:
        if stamp.exists() and time.time() - stamp.stat().st_mtime < 86400:
            return
    except OSError:
        return

    def run():
        try:
            subprocess.run([sys.executable, '-m', 'pip', 'install', '-U', '--quiet', 'yt-dlp'], capture_output=True, timeout=180)
            stamp.write_text(str(time.time()))
        except Exception:
            pass
    threading.Thread(target=run, daemon=True).start()
