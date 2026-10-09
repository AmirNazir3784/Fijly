@echo off
echo Starting local server at http://localhost:8000
echo Press Ctrl+C to stop
cd /d "%~dp0..\site"
python -m http.server 8000
