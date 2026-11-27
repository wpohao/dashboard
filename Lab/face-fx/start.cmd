@echo off
cd /d %~dp0
echo FaceFX: http://localhost:8765/
start "" http://localhost:8765/
py -3 -m http.server 8765
