#!/usr/bin/env bash
set -euo pipefail

# Build a minimal, ad-hoc-signed .app bundle that the voice LaunchAgent runs.
#
# Why this exists: macOS TCC grants microphone access per code-signed bundle. A
# LaunchAgent pointed at the bare shared `node` binary is a headless launchd job
# with no bundle identity, so it is silently denied the mic — CoreAudio hands it
# all-zero buffers and wake detection can never fire. Running node as the main
# executable of a signed .app gives TCC a stable identity to grant and persist.
#
# The bundle is a thin permission shim: it contains a private copy of the Node
# runtime and an Info.plist, nothing else. The daemon code still lives in the
# repo and is loaded via the LaunchAgent's WorkingDirectory + bin/service.mjs.

NODE_BIN="${VOICE_NODE_BIN:-$HOME/.local/share/mise/installs/node/22/bin/node}"
APP="${VOICE_APP_PATH:-$HOME/Applications/ThinkSuit Voice.app}"
BUNDLE_ID="${VOICE_BUNDLE_ID:-com.machellerogden.thinksuit.voice}"
# The bundle's main executable is a copy of node under a meaningful name: macOS
# reports this filename in the "running in the background" notification, so it
# must not be left as "node". node runs fine regardless of its argv[0] name.
EXE="${VOICE_APP_EXE:-ThinkSuit Voice}"

if [ ! -x "$NODE_BIN" ]; then
    echo "error: node binary not found/executable: $NODE_BIN" >&2
    echo "       set VOICE_NODE_BIN to override" >&2
    exit 1
fi

echo "node:   $NODE_BIN"
echo "bundle: $APP"
echo "id:     $BUNDLE_ID"
echo "exe:    $EXE"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

cp "$NODE_BIN" "$APP/Contents/MacOS/$EXE"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>CFBundleIdentifier</key>
    <string>${BUNDLE_ID}</string>
    <key>CFBundleName</key>
    <string>ThinkSuit Voice</string>
    <key>CFBundleDisplayName</key>
    <string>ThinkSuit Voice</string>
    <key>CFBundleExecutable</key>
    <string>${EXE}</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSMicrophoneUsageDescription</key>
    <string>ThinkSuit listens for its wake word to start a hands-free voice turn.</string>
  </dict>
</plist>
PLIST

# Plain ad-hoc signature (no hardened runtime): TCC reads the mic usage string
# from Info.plist and keys the grant to this bundle's cdhash, which is stable as
# long as the embedded node binary and Info.plist don't change.
codesign --force --sign - "$APP"
codesign --verify --verbose "$APP"

echo
echo "built $APP"
echo "point the LaunchAgent ProgramArguments at:"
echo "  $APP/Contents/MacOS/$EXE"
echo "  bin/service.mjs"
