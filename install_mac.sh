#!/usr/bin/env bash
# ShortCircuit Clipping for Mac. One command, safe to re-run (it updates in place).
#   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Deb04201998/shortcircuit/main/install_mac.sh)"
# Installs into ~/ShortCircuit. Delete that folder to uninstall. Asks nothing, but needs Homebrew (it tells you if missing).
set -e
DIR="${SHORTCIRCUIT_DIR:-$HOME/ShortCircuit}"
REPO="${SHORTCIRCUIT_REPO:-Deb04201998/shortcircuit}"
BRANCH="${SHORTCIRCUIT_BRANCH:-main}"
say() { printf '\n==> %s\n' "$1"; }

[ "$(uname)" = "Darwin" ] || { echo "This installer is for macOS. On Linux use install.sh."; exit 1; }
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is missing. Install it from https://brew.sh then run this again."; exit 1
fi

say "1/5 Tools (ffmpeg, python, deno)"
brew list ffmpeg >/dev/null 2>&1 || brew install ffmpeg
brew list python@3.12 >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1 || brew install python@3.12
brew list deno >/dev/null 2>&1 || brew install deno   # yt-dlp uses it to solve YouTube's checks; missing = slow or stuck downloads
PY="$(command -v python3.12 || command -v python3)"
"$PY" -c 'import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)' || { echo "Need Python 3.10+."; exit 1; }

say "2/5 Getting the app"
mkdir -p "$DIR"
TMP="$(mktemp -d)"
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.zip" -o "$TMP/nc.zip"
unzip -q "$TMP/nc.zip" -d "$TMP"
mkdir -p "$DIR/app"
# keep the user's data/ and models/ when updating
rsync -a --exclude data --exclude models --exclude .venv "$TMP"/shortcircuit-*/ "$DIR/app/"
rm -rf "$TMP"

say "3/5 Python packages (3-6 minutes the first time)"
cd "$DIR/app"
[ -d .venv ] || "$PY" -m venv .venv
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install -r requirements.txt --quiet
.venv/bin/pip install -U yt-dlp --quiet
.venv/bin/python -c "import fastapi, uvicorn, yt_dlp, numpy, cv2, faster_whisper, PIL; print('imports ok, yt-dlp', yt_dlp.version.__version__)"

say "4/5 Launcher"
cat > "$DIR/ShortCircuit.command" <<EOF
#!/usr/bin/env bash
cd "$DIR/app"
export SHORTCIRCUIT_BROWSER="\${SHORTCIRCUIT_BROWSER:-}"   # set to safari or chrome if YouTube asks you to sign in
PORT="\${SHORTCIRCUIT_PORT:-8770}"
(sleep 3; open "http://127.0.0.1:\$PORT") &
exec .venv/bin/python app.py
EOF
cat > "$DIR/clip.command" <<EOF
#!/usr/bin/env bash
# Terminal shortcut:  ~/ShortCircuit/clip.command URL 12:40 38:05-38:40=HOOK TEXT
cd "$DIR/app"
exec .venv/bin/python clip_timestamps.py "\$@"
EOF
chmod +x "$DIR/ShortCircuit.command" "$DIR/clip.command"

say "5/5 Done"
echo "Open the app:        double-click  $DIR/ShortCircuit.command"
echo "Clip from timestamps: $DIR/clip.command <link> 12:40 38:05-38:40=THE_HOOK   (Shorts land in ~/Movies/ShortCircuit)"
echo "If YouTube says 'sign in to confirm you're not a bot':  export SHORTCIRCUIT_BROWSER=safari   (or chrome)"
echo "Optional AI titles:  install Ollama (ollama.com) then run: ollama pull llama3.2:3b"
