@echo off
chcp 65001 >nul
echo.
echo ========================================================
echo   CAI DAT WHAT-IF STUDIO cho FunnyOVS
echo   (ShotBuilder engine - Tao clip khong ton token AI)
echo ========================================================
echo.

REM --- Kiem tra Node.js ---
node --version >nul 2>&1
if errorlevel 1 (
    echo [LOI] Chua co Node.js! Tai tai: https://nodejs.org  (chon ban LTS)
    pause & exit /b 1
)

REM --- Kiem tra Python ---
python --version >nul 2>&1
if errorlevel 1 (
    py -3 --version >nul 2>&1
    if errorlevel 1 (
        echo [LOI] Chua co Python 3! Tai tai: https://python.org/downloads
        pause & exit /b 1
    )
)

REM --- Kiem tra ffmpeg ---
ffmpeg -version >nul 2>&1
if errorlevel 1 (
    echo [CANH BAO] Chua co ffmpeg - can de ghep video co tieng.
    echo   Tai tai: https://ffmpeg.org/download.html roi them vao PATH.
    echo   (Neu chi can storyboard anh thi bo qua duoc)
    echo.
)

REM --- Cai edge-tts (giong doc tieng Viet local) ---
echo [1/3] Kiem tra edge-tts (giong doc)...
python -c "import edge_tts" >nul 2>&1
if errorlevel 1 (
    py -3 -c "import edge_tts" >nul 2>&1
    if errorlevel 1 (
        echo     Dang cai edge-tts...
        python -m pip install edge-tts --quiet 2>&1 || py -3 -m pip install edge-tts --quiet
        if errorlevel 1 (
            echo     [CANH BAO] Khong cai duoc edge-tts. Giong doc se khong hoat dong.
        ) else (
            echo     edge-tts da cai thanh cong!
        )
    ) else (
        echo     edge-tts da co san.
    )
) else (
    echo     edge-tts da co san.
)

REM --- Cai npm cho what-if-studio (Remotion) ---
echo [2/3] Cai Remotion cho What-If Studio...
cd /d "%~dp0app\what-if-studio"
if not exist node_modules (
    echo     Dang tai Remotion (lan dau ~1-2 phut)...
    call npm install --prefer-offline
    if errorlevel 1 (
        echo [LOI] npm install that bai! Kiem tra ket noi mang.
        pause & exit /b 1
    )
    echo     Remotion da cai thanh cong!
) else (
    echo     Remotion da co san (node_modules ton tai).
)

REM --- Patch Root.tsx de them Shot Builder compositions ---
echo [3/3] Kich hoat Shot Builder trong Remotion...
python builder\patch_root.py 2>&1 || py -3 builder\patch_root.py 2>&1
echo.

cd /d "%~dp0"
echo ========================================================
echo   CAI DAT HOAN THANH!
echo ========================================================
echo.
echo   Chay app:  npm run dev
echo   Roi mo:    http://localhost:5173
echo   Tab moi:   Bang trai > "Gioi What-If"
echo.
echo   Quy trinh tao clip (0 token API):
echo   1. Nhap kich ban > Sao chep lenh cho AI chat
echo   2. Dan vao ChatGPT/Gemini web mien phi > Luu JSON
echo   3. Mo file JSON > Dung clip (Remotion local)
echo.
pause
