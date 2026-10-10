#!/bin/bash
echo "Starting local server at http://localhost:8000"
echo "Press Ctrl+C to stop"
exec python3 "$(dirname "$0")/devserver.py" 8000
