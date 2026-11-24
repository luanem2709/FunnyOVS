# K3 – BỔ SUNG BỐI CẢNH / ĐỒ VẬT / NHÂN VẬT (file cai_dat_shot_builder.bat)

Khi kịch bản cần nơi chốn, đồ vật hoặc nhân vật mà DANH_SACH_TOOL chưa có, bạn **tự tạo** chúng và đóng thành **một file tự cài tên `cai_dat_shot_builder.bat`**. Khách chỉ bấm đúp file đó: nó tự tìm thư mục Shot Builder (C:\ShotBuilder, C:\WhatIf…) và chép gói vào `what-if-studio\library\bo_sung\`. Khách tắt/mở lại Shot Builder là dùng được để tạo video; trong tool chúng hiện với chữ "Bổ sung: …". Khách không phải mở tool để thêm tay.

**Điều kiện:** chỉ tạo khi DANH_SACH ghi `"hoTroGoiBoSung": true` (nhân vật thì cần thêm `"hoTroNhanVatBoSung": true`). Nếu `false`: KHÔNG dùng id `x_`, chỉ dùng thứ có sẵn, và nói 1 câu: "Muốn có bối cảnh/nhân vật mới, tải gói cài Shot Builder mới nhất, chạy CAI_DAT.bat (các tập đã lưu không mất), rồi xuất lại danh sách."
Chỉ tạo khi thật cần (thường 1–3 thứ mỗi tập). Thứ đã có (kể cả trong `goiBoSungDaCai`) thì dùng lại, không tạo lại.

## 1. Đặt tên
- `id`: **bắt đầu bằng `x_`**, chữ thường không dấu, số, gạch dưới; 3–40 ký tự. Vd. `x_rooftop`, `x_hourglass`, `x_maya`. Không trùng id đã có.
- `pack`: = `<slug>` của tập. Cài lại cùng `pack` sẽ ghi đè gói cũ cùng tên (dùng khi sửa).
- Tên file giao khách: **`cai_dat_shot_builder.bat`**. Nếu tạo được file nén: giao `<slug>_bo_sung.zip` chứa file đó.

## 2. Cấu trúc JSON của gói
```json
{"pack": "<slug>", "version": 1,
 "sets":  [ {"id": "x_...", "name": "Tên tiếng Việt ngắn", "hint": "1 câu: có gì, nhân vật đứng đâu", "actors": true,
             "svg": {"day": "<...SVG...>", "night": "<...SVG...>"} } ],
 "props": [ {"id": "x_...", "name": "Tên tiếng Việt", "w": 160, "h": 220, "svg": "<...SVG...>"} ],
 "casts": [ {"id": "x_...", "name": "Tên + mô tả ngoại hình", "base": "linh", "size": 1.0,
             "look": {"top": "#2FB5A3", "hair": "#C8452B", "hairStyle": "long", "topStyle": "jacket"} } ]}
```
Mục nào không cần thì bỏ (vd. chỉ có `casts`).

## 3. Bối cảnh (sets) – vẽ SVG
- `svg`: chuỗi SVG **chỉ gồm các hình** (không có thẻ `<svg>` bao ngoài). Một chuỗi (mọi giờ) hoặc object theo giờ `day` / `night` / `sunset` / `dawn` (thiếu giờ nào thì dùng `day`). Có cảnh đêm thì nên vẽ `night`.
- `actors: false` nếu là cảnh cận đồ vật/màn hình không có người.
- Tọa độ = khung hình **1920 × 1080**. Máy quay zoom/lia nên **nền vẽ tràn: x từ -600 đến 2520, y từ -400 đến 1700** (hình chữ nhật trời/tường đầu tiên phủ toàn vùng này).
- **Mặt sàn bắt đầu ở y ≈ 745** phủ xuống 1700. Chân nhân vật ở y ≈ 940; nhân vật cao ~450 px. **Để trống vùng x 300–1620, y 380–940**; đồ to đặt hai bên (x < 300 hoặc > 1620) hoặc phía sau, thấp hơn y = 650.
- Phong cách: hoạt hình phẳng, màu pastel tươi, **viền `#31303e` dày 4–6 px**, góc bo nhẹ (`rx`). Không gradient phức tạp, không ảnh chụp.
- Chỉ dùng thẻ: `rect, circle, ellipse, path, polygon, polyline, line, g` (+ `text` ngắn, `font-family='Arial'`). **Không** `<image>`, `<script>`, link ngoài, `<filter>`.
- **Dùng nháy đơn cho thuộc tính trong SVG** (`<rect x='0' fill='#bfe6f2'/>`) để không phải thoát `"` trong JSON. Không xuống dòng trong chuỗi.
- `night`: trời #1f2b45, sao, cửa sổ vàng, tường/sàn tối hơn ~40%. `sunset`: trời hồng cam.
- Mỗi bối cảnh ≤ ~40 KB SVG, có 1–2 chi tiết "chữ ký" nhận ra ngay.

## 4. Đồ vật (props) – vẽ SVG
- `w`, `h` = khung vẽ px (thường 100–300). Vẽ trong `0..w × 0..h`; **đáy giữa (w/2, h) là điểm chạm sàn / tay cầm**. Cùng phong cách viền `#31303e`.

## 5. Nhân vật (casts) – ghép từ bộ phận có sẵn (không vẽ SVG)
Nhân vật bổ sung dùng thân người que của tool (cử động, biểu cảm đầy đủ như nhân vật gốc), bạn chỉ chọn trang phục, tóc, màu. Dùng được ở bộ hình Pop và Doll.
- `base` (tùy chọn): id nhân vật có sẵn để kế thừa rồi đổi vài thứ (vd. `"base": "linh"` + đổi màu tóc, áo).
- `size`: 0.5–1.3 (trẻ em 0.75, người to 1.1).
- `look` – các khóa (màu dạng `#RRGGBB`):
  - `top` (màu áo), `trim` (cổ áo/dây mũ/viền), `pants`, `shoe`, `hair` (màu tóc), `skin` (màu da, mặc định trắng), `hatColor`, `backpack`, `headphones`, `cape`, `tie`.
  - `hairStyle`: tuft, spiky, cap, beanie, pony, bun, bald, curly, twin, side, long, antenna, none, afro, mohawk, bob, police, chef, hardhat, crown, headband, helmet, swoop.
  - `topStyle`: hoodie, tee, suit, dress, labcoat, jacket, apron, sweater, vest, jersey, uniform, stripe, spacesuit, robot.
  - Bật/tắt (true/false): `glasses`, `mustache`, `beard`, `mask`, `blush`. `number`: số trên áo thể thao (≤ 3 ký tự).
- Mỗi nhân vật phụ quan trọng của kịch bản (có tên riêng) nên có ngoại hình riêng, khác các nhân vật có sẵn.
- Dùng trong cảnh: `"actors": [{"cast": "x_maya", "spot": 0.6, ...}]`.

## 6. Đóng thành file cai_dat_shot_builder.bat
File = **chép nguyên văn khuôn dưới đây** (không sửa dòng nào), rồi **dán JSON của gói ngay sau dòng cuối `:::DU_LIEU_BO_SUNG:::`**. Không thêm gì sau JSON.

```bat
@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Cai bo sung boi canh / do vat / nhan vat cho Shot Builder
rem ======================================================================
rem  FILE CAI BO SUNG boi canh / do vat / nhan vat cho Shot Builder (do chatbot tao).
rem  Bam dup la xong: tu tim Shot Builder, chep goi bo sung vao
rem  what-if-studio\library\bo_sung. Khong can mo tool.
rem  Phan du lieu (JSON) nam o cuoi file, sau dong :::DU_LIEU_BO_SUNG:::
rem ======================================================================
set "ST="
for %%r in ("C:\ShotBuilder" "C:\WhatIf" "%~dp0.") do if not defined ST if exist "%%~r\what-if-studio\builder" set "ST=%%~fr\what-if-studio"
if not defined ST (
  echo LOI: khong thay Shot Builder o C:\ShotBuilder. Cai Shot Builder truoc.
  goto :end
)
if not exist "%ST%\src\builder\kit\addonData.js" (
  echo LOI: ban Shot Builder nay chua nhan duoc boi canh / nhan vat bo sung.
  echo Tai goi cai dat Shot Builder moi nhat, chay CAI_DAT.bat ^(tap da luu khong mat^), roi chay lai file nay.
  goto :end
)
set "DEST=%ST%\library\bo_sung"
if not exist "%DEST%" mkdir "%DEST%"
echo Cai goi bo sung vao: %DEST%
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText('%~f0',[Text.Encoding]::UTF8); $m=[regex]::Match($t,'(?m)^:::DU_LIEU_BO_SUNG:::[ \t]*\r?\n([\s\S]*)'); if(-not $m.Success){exit 2}; $j=$m.Groups[1].Value.Trim(); try{$o=$j|ConvertFrom-Json}catch{Write-Host $_; exit 3}; if(-not $o.pack){exit 4}; $n=($o.pack -replace '[^a-zA-Z0-9_-]','_'); [IO.File]::WriteAllText('%DEST%\'+$n+'.json',$j,(New-Object Text.UTF8Encoding $false)); Write-Host ('  Goi: '+$n+'.json'); foreach($s in @($o.sets)){if($s){Write-Host ('   + boi canh: '+$s.id+'  ('+$s.name+')')}}; foreach($p in @($o.props)){if($p){Write-Host ('   + do vat:   '+$p.id+'  ('+$p.name+')')}}; foreach($c in @($o.casts)){if($c){Write-Host ('   + nhan vat: '+$c.id+'  ('+$c.name+')')}}"
if errorlevel 4 (
  echo LOI: du lieu thieu ten goi "pack". Gui lai cho chatbot sua.
  goto :end
)
if errorlevel 3 (
  echo LOI: du lieu JSON bi hong ^(thuong do chep thieu^). Tai lai file tu chatbot.
  goto :end
)
if errorlevel 2 (
  echo LOI: khong thay phan du lieu trong file nay.
  goto :end
)
echo.
echo ==========================================================
echo  XONG. TAT Shot Builder roi MO LAI de thay boi canh / do vat / nhan vat moi.
echo  (Trong tool chung hien voi chu "Bo sung: ...")
echo ==========================================================
:end
echo.
pause
goto :eof

:::DU_LIEU_BO_SUNG:::
```
Sau dòng `:::DU_LIEU_BO_SUNG:::` là JSON, vd.:
```
:::DU_LIEU_BO_SUNG:::
{"pack": "pause_10_seconds", "version": 1, "sets": [...], "props": [...], "casts": [...]}
```
File mẫu hoàn chỉnh (sân thượng ngày/đêm + đồng hồ cát + 2 nhân vật Maya và ông bảo vệ), đã thử cài và dựng hình đúng: **MAU_CAI_BO_SUNG_san_thuong.txt** (khi giao khách thì tên là `cai_dat_shot_builder.bat`).

Tạo được file tải về: tạo file thật (UTF-8), nén vào `<slug>_bo_sung.zip` nếu được. Chỉ in được chữ: in toàn bộ file trong một khối code, dặn khách lưu bằng Notepad tên `cai_dat_shot_builder.bat`, "Save as type: All files", Encoding UTF-8.

## 7. Dùng trong file cảnh
`"set": "x_rooftop"` (kèm `tod`), `"props": [{"type": "x_hourglass", "spot": 0.6, "on": "floor"}]` hoặc cầm tay `"dy": 200`, `"actors": [{"cast": "x_maya", ...}]`. Khách chưa cài gói thì tool vẫn dựng nhưng bối cảnh thành nền tự động đơn giản, đồ vật bổ sung không hiện, nhân vật bổ sung thành nhân vật chính: luôn nhắc khách chạy file bổ sung TRƯỚC khi tạo video.
