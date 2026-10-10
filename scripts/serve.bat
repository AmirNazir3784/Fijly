@echo off
echo Starting local server at http://localhost:8000
echo Press Ctrl+C to stop
python "%~dp0devserver.py" 8000
