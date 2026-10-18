#!/usr/bin/env bash
# Chạy Smart Timetable V2 trên máy (cần Python 3). Mở trình duyệt tại http://localhost:8080
cd "$(dirname "$0")"
(sleep 1; xdg-open http://localhost:8080 2>/dev/null || open http://localhost:8080 2>/dev/null) &
python3 -m http.server 8080
