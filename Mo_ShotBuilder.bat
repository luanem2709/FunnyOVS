@echo off
chcp 65001 >nul
title Shot Builder - What If Studio
echo.
echo ==========================================================
echo   KHOI DONG SHOT BUILDER (Standalone)
echo   Giao dien web: http://127.0.0.1:7870
echo ==========================================================
echo.

set "STUDIO=%~dp0app\what-if-studio"

rem Tim Python
set "PY="
python -c "import sys; print(sys.executable)" >nul 2>&1 && set "PY=python"
if not defined PY py -3 -c "import sys; print(sys.executable)" >nul 2>&1 && set "PY=py -3"

if not defined PY (
    echo [LOI] Khong tim thay Python! Hay cai Python 3.12 tai https://python.org
    pause
    exit /b 1
)

cd /d "%STUDIO%"
if exist "..\Shot Builder.exe" (
    start "" "..\Shot Builder.exe"
) else (
    start "" http://127.0.0.1:7870
    %PY% builder\app.pyc
)
