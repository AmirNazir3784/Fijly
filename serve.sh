#!/bin/bash
echo "Starting local server at http://localhost:8000"
echo "Press Ctrl+C to stop"
cd site
python3 -m http.server 8000
