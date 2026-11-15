#!/bin/sh
# Written with AI assistance (Claude Code)
# Renders the Home page's scroll film (an illustration) and writes the web set.
# Blender 5.2 with Cycles on the GPU; about 5-12 s a frame on an M-series Mac, 168 frames per set.
#   sh scripts/film/render.sh [workdir]      (resumable: frames already rendered are skipped)
set -e
cd "$(dirname "$0")/../.."
W="${1:-/tmp/film-render}"
B="${BLENDER:-blender}"
mkdir -p "$W/desktop" "$W/phone"
"$B" -b --factory-startup -P scripts/film/scene.py -- --set desktop --anchors "$W/anchors-desktop.json"
"$B" -b --factory-startup -P scripts/film/scene.py -- --set phone --anchors "$W/anchors-phone.json"
"$B" -b --factory-startup -P scripts/film/scene.py -- --out "$W/desktop" --set desktop --samples 40
"$B" -b --factory-startup -P scripts/film/scene.py -- --out "$W/phone" --set phone --samples 40
python3 -I scripts/film/encode.py --frames "$W/desktop" --anchors "$W/anchors-desktop.json" \
  --phone-frames "$W/phone" --phone-anchors "$W/anchors-phone.json"
