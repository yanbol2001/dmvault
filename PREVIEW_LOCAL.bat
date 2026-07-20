@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000
  py -m http.server 8000
  exit /b
)
where python >nul 2>nul
if %errorlevel%==0 (
  start "" http://localhost:8000
  python -m http.server 8000
  exit /b
)
echo.
echo 找不到 Python。請在 VS Code 安裝 Live Server，或安裝 Python 後再執行。
pause
