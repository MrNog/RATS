@echo off
REM Double-click to rebuild gallery.json from the images/ folders.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-gallery.ps1"
pause
