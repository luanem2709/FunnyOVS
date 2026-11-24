# K6 – FILE XUẤT DANH SÁCH TOOL (XUAT_DANH_SACH_TOOL.bat)

File này **chỉ đọc**, không sửa gì trong Shot Builder. Khách bấm đúp:
1. Tự tìm thư mục cài Shot Builder (C:\ShotBuilder, C:\WhatIf, D:\…; có nhiều bản thì hỏi chọn; không thấy thì hỏi đường dẫn).
2. Dùng Python của Shot Builder đọc danh sách bối cảnh, nhân vật, tư thế, biểu cảm, đồ vật, chữ/hiệu ứng, chuyển cảnh, đếm SFX, gói bổ sung đã cài.
3. Ghi file **DANH_SACH_TOOL_SHOTBUILDER.txt** ra Desktop. Khách kéo file đó vào chat.

Chạy được với mọi bản Shot Builder (kể cả bản cũ). Dòng "Ho tro bo sung" cho biết tool có nhận file cai_dat_shot_builder.bat bổ sung không.

Nếu khách không có file: đưa **nguyên văn toàn bộ** nội dung dưới đây (cả phần Python sau dòng `:::PYTHON:::`), dặn lưu bằng Notepad tên `XUAT_DANH_SACH_TOOL.bat`, "Save as type: All files", Encoding UTF-8, rồi bấm đúp.

```bat
@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Xuat danh sach Shot Builder cho chatbot
rem ======================================================================
rem  CHI DOC, KHONG SUA GI trong Shot Builder.
rem  Tu tim thu muc cai Shot Builder, dem boi canh / nhan vat / do vat / tu the /
rem  bieu cam / chuyen canh / SFX, ghi ra file DANH_SACH_TOOL_SHOTBUILDER.txt
rem  tren Desktop de gui cho chatbot.
rem ======================================================================
set "N=0"
for %%r in ("C:\ShotBuilder" "C:\WhatIf" "D:\ShotBuilder" "D:\WhatIf") do (
  if exist "%%~r\what-if-studio\builder" call :them "%%~fr"
)
if "%N%"=="0" if exist "%~dp0what-if-studio\builder" call :them "%~dp0."
if "%N%"=="0" goto :hoi
if "%N%"=="1" (
  set "ROOT=%R1%"
  goto :co
)
echo Tim thay %N% ban Shot Builder:
for /l %%i in (1,1,%N%) do call echo   %%i. %%R%%i%%
set "CH=1"
set /p "CH=Chon so (Enter = 1): "
call set "ROOT=%%R%CH%%%"
if not defined ROOT set "ROOT=%R1%"
goto :co

:hoi
echo Khong tu tim thay Shot Builder.
set "ROOT="
set /p "ROOT=Dan duong dan thu muc cai Shot Builder (thu muc co what-if-studio ben trong): "
if not defined ROOT goto :end
set "ROOT=%ROOT:"=%"
if not exist "%ROOT%\what-if-studio\builder" (
  echo Thu muc nay khong co what-if-studio\builder.
  goto :end
)

:co
echo Shot Builder: %ROOT%
set "PY="
if exist "%ROOT%\python_path.txt" set /p PY=<"%ROOT%\python_path.txt"
if defined PY if not exist "%PY%" set "PY="
if not defined PY (
  py -3.12 -c "print(1)" >nul 2>&1 && set "PY=py -3.12"
)
if not defined PY (
  py -3 -c "print(1)" >nul 2>&1 && set "PY=py -3"
)
if not defined PY (
  python -c "print(1)" >nul 2>&1 && set "PY=python"
)
if not defined PY (
  echo LOI: khong thay Python tren may. Shot Builder can Python 3.12 - cai lai Shot Builder.
  goto :end
)
set "DESK="
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('Desktop')"`) do set "DESK=%%d"
if not defined DESK set "DESK=%USERPROFILE%\Desktop"
if not exist "%DESK%" set "DESK=%~dp0."
set "OUTF=%DESK%\DANH_SACH_TOOL_SHOTBUILDER.txt"
set "TPY=%TEMP%\sb_xuat_danh_sach.py"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText('%~f0',[Text.Encoding]::UTF8); $m=[regex]::Match($t,'(?m)^:::PYTHON:::[ \t]*\r?\n([\s\S]*)'); if(-not $m.Success){exit 2}; [IO.File]::WriteAllText('%TPY%',$m.Groups[1].Value,(New-Object Text.UTF8Encoding $false))"
if errorlevel 1 (
  echo LOI: file nay bi thieu phan cuoi. Tai lai file.
  goto :end
)
if "%PY:~0,2%"=="py" (
  %PY% -B "%TPY%" "%ROOT%" "%OUTF%"
) else if "%PY%"=="python" (
  python -B "%TPY%" "%ROOT%" "%OUTF%"
) else (
  "%PY%" -B "%TPY%" "%ROOT%" "%OUTF%"
)
del /q "%TPY%" >nul 2>&1
if not exist "%OUTF%" (
  echo CO LOI: khong tao duoc file. Chup man hinh cua so nay gui lai.
  goto :end
)
echo.
echo ==========================================================
echo  XONG: %OUTF%
echo  Keo file DANH_SACH_TOOL_SHOTBUILDER.txt vao chat cua chatbot.
echo ==========================================================
explorer /select,"%OUTF%"
goto :end

:them
set /a N+=1
set "R%N%=%~1"
goto :eof

:end
echo.
pause
goto :eof

:::PYTHON:::
# Doc (KHONG sua) Shot Builder da cai, xuat danh sach boi canh / nhan vat / do vat... de gui chatbot.
# Cach chay: python -B xuat_danh_sach.py <thu_muc_cai_shot_builder> <file_ra>
import datetime
import json
import os
import sys

sys.dont_write_bytecode = True  # khong tao __pycache__ trong thu muc tool


def main():
    root, outf = sys.argv[1], sys.argv[2]
    studio = os.path.join(root, "what-if-studio")
    bd = os.path.join(studio, "builder")
    sys.path.insert(0, bd)
    try:
        import core  # chi doc: core chi nap danh sach, khong ghi file
    except Exception as e:
        open(outf, "w", encoding="utf-8").write("LOI: khong doc duoc Shot Builder o %s (%s)\n" % (root, e))
        print("LOI:", e)
        return 1
    M = core.META
    keys = ("stages", "stageHints", "casts", "castsPop", "poses", "exprs", "props", "uis", "moves", "cams", "trans",
            "tods", "weathers", "crowdMoods", "powers", "kits", "palettes", "grades", "motions", "facing")
    d = {k: M[k] for k in keys if k in M}
    # goi bo sung (neu ban tool ho tro)
    kit = os.path.join(studio, "src", "builder", "kit")
    addon_ok = os.path.isfile(os.path.join(kit, "addonData.js"))
    try:
        cast_ok = addon_ok and "ADDONS" in open(os.path.join(kit, "kid.tsx"), encoding="utf-8").read()
    except OSError:
        cast_ok = False
    packs = []
    adir = os.path.join(studio, "library", "bo_sung")
    if os.path.isdir(adir):
        for f in sorted(os.listdir(adir)):
            if f.lower().endswith(".json"):
                try:
                    with open(os.path.join(adir, f), encoding="utf-8-sig") as fh:
                        j = json.load(fh)
                    packs.append({"file": f, "pack": j.get("pack"),
                                  "sets": [[s.get("id"), s.get("name")] for s in j.get("sets") or []],
                                  "props": [[p.get("id"), p.get("name")] for p in j.get("props") or []],
                                  "casts": [[c.get("id"), c.get("name")] for c in j.get("casts") or []]})
                except (OSError, ValueError):
                    packs.append({"file": f, "loi": "file hong"})
    # SFX va chuyen canh co san (chi dem)
    sfx = 0
    sdir = os.path.join(studio, "library", "sfx")
    for r, _, fs in os.walk(sdir):
        sfx += sum(1 for f in fs if f.lower().endswith((".mp3", ".wav", ".ogg", ".m4a", ".flac")))
    nsets = len(d.get("stages", []))
    ncast = len(d.get("casts", [])) + len(d.get("castsPop", []))
    head = [
        "DANH SACH TOOL SHOT BUILDER - gui file nay cho chatbot viet kich ban.",
        "Xuat luc %s tu %s" % (datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), root),
        "So luong: %d boi canh, %d nhan vat, %d do vat, %d tu the, %d bieu cam, %d kieu chu/hieu ung, %d chuyen canh, %d SFX."
        % (nsets, ncast, len(d.get("props", [])), len(d.get("poses", [])), len(d.get("exprs", [])), len(d.get("uis", [])),
           len(d.get("trans", [])), sfx),
        "Ho tro bo sung boi canh/do vat: %s. Ho tro bo sung nhan vat: %s. Goi bo sung da cai: %d."
        % ("CO" if addon_ok else "KHONG (ban tool cu: cai Shot Builder moi nhat de co, hoac chatbot chi dung do co san)",
           "CO" if cast_ok else "KHONG", len(packs)),
        "CHATBOT: chi dung dung cac id ben duoi (phan tu dau cua moi cap [id, mo ta]).",
        "",
    ]
    d["hoTroGoiBoSung"] = addon_ok
    d["hoTroNhanVatBoSung"] = cast_ok
    d["goiBoSungDaCai"] = packs
    d["soSFX"] = sfx
    body = "{\n" + ",\n".join(" %s: %s" % (json.dumps(k), json.dumps(v, ensure_ascii=False)) for k, v in d.items()) + "\n}\n"
    with open(outf, "w", encoding="utf-8") as fh:
        fh.write("\n".join(head) + body)
    print(head[2])
    print(head[3])
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

## Đọc file DANH_SACH
Phần đầu: số lượng + có hỗ trợ gói bổ sung không. Sau đó là JSON với các khóa: `stages` (bối cảnh), `stageHints` (giải thích bối cảnh, `fx2`, `board`), `casts`/`castsPop` (nhân vật), `poses`, `exprs`, `props`, `uis`, `moves`, `cams`, `trans` (chuyển cảnh), `tods`, `weathers`, `crowdMoods`, `powers`, `kits`, `palettes`, `grades`, `motions`, `facing`, `hoTroGoiBoSung` (true/false), `hoTroNhanVatBoSung` (true/false), `goiBoSungDaCai` (gói và id x_ đã cài), `soSFX`. Mỗi mục dạng `["id", "mô tả tiếng Việt"]`: chỉ dùng id.
