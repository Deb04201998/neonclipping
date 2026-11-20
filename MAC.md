# ShortCircuit Clipping for Mac

## Install (one command, safe to re-run to update)
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Deb04201998/shortcircuit/main/install_mac.sh)"
```
Needs Homebrew. Installs ffmpeg, Python, deno (yt-dlp needs it for YouTube), the app, and two launchers in `~/ShortCircuit`.

## Use
- **App:** double-click `ShortCircuit.command`.
- **Shorts from timestamps (no full download):**
  `~/ShortCircuit/clip.command "https://youtube.com/watch?v=..." 12:40=THE_HOOK 38:05-38:40=OTHER_HOOK 1:02:10`
  Output lands in `~/Movies/ShortCircuit` (1080x1920). Add `--captions` for burned-in captions.

## What changed from upstream (why downloads no longer hang)
- Every download runs as its own yt-dlp process that is watched. No new bytes for 45 s -> killed and retried from the partial file on a gentler setting (4 rungs: fewer parallel fragments, smaller chunks, other YouTube clients).
- Max 2 simultaneous downloads app-wide (YouTube throttles more).
- Videos over 30 min are imported at 480p instead of 720p.
- yt-dlp self-updates once a day.
- Mac: VideoToolbox hardware encoding first (libx264 fallback), Whisper goes straight to CPU int8.
- Installer pulls from this repo, not the original author's.

## If YouTube says "sign in to confirm you're not a bot"
`export SHORTCIRCUIT_BROWSER=safari` (or chrome) before launching. Other knobs: `SHORTCIRCUIT_STALL_SECS`, `SHORTCIRCUIT_SLOTS`, `SHORTCIRCUIT_NO_UPDATE=1`.

## Not yet verified on a real Mac or against live YouTube
Tested in a Linux sandbox against local servers (section download, forced-stall recovery, clipper output). VideoToolbox, Safari cookies, and the installer have not been run on macOS.

Based on ShortCircuit by iamajmeena (MIT). Mac changes by Deb04201998.
