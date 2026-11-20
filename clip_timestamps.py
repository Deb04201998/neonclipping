#!/usr/bin/env python3
"""Make 9:16 Shorts from timestamps, without downloading the whole video.

    python clip_timestamps.py URL_OR_FILE 12:40 38:05-38:40=THE_HOOK 1:02:10 [--len 25] [--out ~/Movies/ShortCircuit] [--captions]

Each item is  TIME[-END][=HOOK TEXT]
    12:40            one moment: clip starts 3s before it and runs --len seconds (default 25)
    38:05-38:40      exact range
    38:05-38:40=THE DRIVING FEELS LIKE THIS      hook text shown on screen for the first 3 seconds

Only the chosen sections are downloaded (stall-proof, see mac_dl.py). A local MP4 path works too (nothing is downloaded).
Output: 1080x1920 MP4, blurred-fill background, hook text, optional burned-in captions (needs faster-whisper).
"""
import argparse, os, platform, re, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import encoders  # noqa: E402

FMT = 'bv*[height<=1080][vcodec^=avc1]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b'


def secs(t):
    parts = [float(p) for p in t.strip().split(':')]
    if not 1 <= len(parts) <= 3 or any(p < 0 for p in parts):
        raise ValueError(t)
    out = 0.0
    for p in parts:
        out = out * 60 + p
    return out


def parse(item, default_len):
    hook = ''
    if '=' in item:
        item, hook = item.split('=', 1)
        hook = hook.replace('_', ' ').strip()
    if '-' in item:
        a, b = item.split('-', 1)
        s, e = secs(a), secs(b)
    else:
        s = max(0.0, secs(item) - 3)
        e = s + default_len
    if e <= s or e - s > 180:
        raise ValueError(f'{item}: a Short needs 1 to 180 seconds')
    return s, e, hook


def font():
    for f in ('/System/Library/Fonts/Helvetica.ttc', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/Library/Fonts/Arial Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(f):
            return f
    return ''


def clean(text):
    return re.sub(r"[^A-Za-z0-9 !?.,'&-]", '', text).replace("'", '’').upper()


def make_srt(video, srt):
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print('  (captions skipped: pip install faster-whisper)')
        return False
    model = WhisperModel('base', device='cpu', compute_type='int8', cpu_threads=max(1, (os.cpu_count() or 4) - 2))
    segs, _ = model.transcribe(str(video), vad_filter=True)

    def ts(x):
        h, r = divmod(x, 3600)
        m, s = divmod(r, 60)
        return f'{int(h):02}:{int(m):02}:{int(s):02},{int((s % 1) * 1000):03}'
    n = 0
    with open(srt, 'w', encoding='utf-8') as f:
        for sg in segs:
            n += 1
            f.write(f'{n}\n{ts(sg.start)} --> {ts(sg.end)}\n{sg.text.strip()}\n\n')
    return n > 0


def render(src, out, hook, srt, workdir):
    g = ('[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5[bg];'
         '[b]scale=1080:-2:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[v]')
    last = '[v]'
    f = font()
    if hook and f:
        import textwrap
        lines = textwrap.wrap(clean(hook), 17)[:3]  # 17 chars at size 74 always fits the 1080px width
        chain = '[v]'
        for i, ln in enumerate(lines):
            nxt = f'[h{i}]'
            g += (f";{chain}drawtext=fontfile='{f}':text='{ln}':fontcolor=white:fontsize=74:box=1:boxcolor=black@0.6:boxborderw=20:"
                  f"x=(w-text_w)/2:y={230 + i * 105}:enable='lt(t,3)'{nxt}")
            chain = nxt
        last = chain
    if srt:
        g += f";{last}subtitles={Path(srt).name}:force_style='Alignment=2,MarginV=380,FontSize=16,Outline=2,Bold=1'[v3]"
        last = '[v3]'
    base = ['ffmpeg', '-y', '-v', 'error', '-i', str(src), '-filter_complex', g, '-map', last, '-map', '0:a?', '-c:a', 'aac', '-b:a', '160k',
            '-movflags', '+faststart', '-pix_fmt', 'yuv420p']
    r = None
    for enc in encoders.export():
        r = subprocess.run(base + enc + [str(out)], capture_output=True, text=True, cwd=workdir)
        if r.returncode == 0:
            return
    raise RuntimeError(r.stderr[-600:])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('source', help='YouTube/Twitch/Kick URL or a local video file')
    ap.add_argument('items', nargs='+', help='TIME[-END][=HOOK]')
    ap.add_argument('--len', type=float, default=25, help='seconds for single-timestamp items (default 25)')
    ap.add_argument('--out', default=str(Path.home() / 'Movies' / 'ShortCircuit'))
    ap.add_argument('--captions', action='store_true', help='burn in captions (needs faster-whisper)')
    a = ap.parse_args()
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg not found. On a Mac: brew install ffmpeg')
    try:
        todo = [parse(i, a.len) for i in a.items]
    except ValueError as e:
        sys.exit(f'Bad item: {e}')
    out_dir = Path(a.out).expanduser()
    out_dir.mkdir(parents=True, exist_ok=True)
    local = Path(a.source).expanduser().exists()
    if not local:
        import mac_dl
    done = []
    for n, (s, e, hook) in enumerate(todo, 1):
        print(f'[{n}/{len(todo)}] {s:.0f}s-{e:.0f}s  {hook}')
        with tempfile.TemporaryDirectory() as tmp:
            try:
                if local:
                    cut = Path(tmp) / 'cut.mp4'
                    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', str(s), '-t', str(e - s), '-i', str(Path(a.source).expanduser()), '-c', 'copy', str(cut)], check=True)
                else:
                    cut = Path(mac_dl.fetch(a.source, str(Path(tmp) / 'cut.%(ext)s'), fmt=FMT, sections=(s, e), merge_mp4=True,
                                            on_progress=lambda mb, t: print(f'\r  downloading {mb:.0f} MB' + (f' (retry {t - 1})' if t > 1 else ''), end='', flush=True))[0])
                    print()
                srt = None
                if a.captions:
                    p = Path(tmp) / 'c.srt'
                    srt = p if make_srt(cut, p) else None
                out = out_dir / f'short_{n:02}_{int(s)}s.mp4'
                render(cut, out, hook, srt, tmp)
                done.append(out)
                print(f'  -> {out}')
            except Exception as ex:
                print(f'  FAILED: {ex}')
    print(f'\n{len(done)}/{len(todo)} Shorts saved in {out_dir}')
    if platform.system() == 'Darwin' and done:
        subprocess.run(['open', str(out_dir)])


if __name__ == '__main__':
    main()
