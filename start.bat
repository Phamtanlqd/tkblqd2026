@echo off
REM Chay Smart Timetable V2 tren may (can Python). Mo trinh duyet tai http://localhost:8080
cd /d "%~dp0"
start "" http://localhost:8080
python -m http.server 8080 || py -m http.server 8080
