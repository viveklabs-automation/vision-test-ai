#!/bin/bash

echo "🖥️ Starting Xvfb virtual display..."
Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &
export DISPLAY=:99

echo "🪟 Starting Fluxbox window manager..."
fluxbox &

echo "🔒 Starting x11vnc server..."
x11vnc -display :99 -N -forever -shared -bg

echo "🌐 Starting noVNC proxy on port 6080..."
websockify --web /usr/share/novnc 6080 localhost:5900 &

echo "🚀 Starting Express Web Dashboard..."
node dist/server.js
