"""Video encoder choices in order of preference. macOS gets Apple's hardware encoder (VideoToolbox) first;
every caller already falls through to the next entry if ffmpeg rejects one, so libx264 is always the safety net."""
import platform


def export(fast=False):
    """Encoder arg lists, best first. fast=True trades size for speed (live clips)."""
    mac = platform.system() == 'Darwin'
    x264 = ['-c:v', 'libx264', '-crf', '21' if fast else '20', '-preset', 'veryfast' if fast else 'fast']
    nv = ['-c:v', 'h264_nvenc', '-preset', 'p4' if fast else 'p5', '-cq', '21' if fast else '20']
    vt = ['-c:v', 'h264_videotoolbox', '-b:v', '10M', '-maxrate', '14M', '-bufsize', '20M', '-allow_sw', '1']
    return [vt, x264] if mac else [nv, x264]
