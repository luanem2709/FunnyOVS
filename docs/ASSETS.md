# Danh mục asset 3D

Dự án dùng **hai loại** tài nguyên 3D:

1. **Nhân vật — chibi rig procedural** (`src/client/assets/chibiRig.js`):
   xương thật, tóc, mắt nhấp nháy, pose theo trạng thái. Không cần tải file.
2. **Đồ đạc — Kenney CC0** (tuỳ chọn): nếu bạn tải vào `public/models/`,
   hệ thống sẽ tự dùng model thật thay cho hình dựng thủ công.

> Quy tắc: asset bên ngoài **chỉ lấy từ Kenney** (CC0 1.0). Không tải từ
> nguồn khác. Nhân vật **không** dùng file tải về — được dựng bằng code theo
> bản quyền MIT của repo tham khảo (xem mục 5).

---

## 1. Nhân vật (đã hoàn thành)

### 1.1. Chibi rig

File: `src/client/assets/chibiRig.js` (port từ `references/my-office`,
MIT License, © 2026 khanh020905) + wrapper `src/client/assets/chibi.ts`.

Rig gồm: hông → gối → giày, thân → cổ → đầu, vai → khuỷu → tay; tóc bịt
(6 kiểu), mắt có lớp mắt + chân mắt + đồng tử + lông mi, miệng cười/hình tròn,
trang phục áo/hoodie/com-lê, phụ kiện kính/chống nắng/mũ.

Hai kiểu dáng: `toy` (đồ chơi, ~2 đầu) và `pixar` (hoạt hình, ~2.6 đầu).

### 1.2. Ánh xạ trạng thái → pose

| Trạng thái agent | Pose | Mô tả |
|---|---|---|
| `idle` | `idle` | đứng nghỉ, thở, tay đung đưa nhẹ |
| `working` | `type` | ngồi gõ bàn phím, tay dùng IK 2 khớp với đúng bàn |
| `researching` | `read` | cầm sách, cúi đầu |
| `learning` | `read` | như trên |
| `waiting` | `wave` | giơ tay chờ duyệt |
| `blocked` | `sweat` | căng thẳng, giọt mồ hôi, miệng hình tròn |
| `stopped` | `idle` | đứng yên |

Mỗi agent có bảng màu riêng (áo, tóc, da, kiểu tóc, trang phục, phụ kiện) —
8 người nhìn là biết ai là ai, xem `src/client/assets/chibi.ts`.

### 1.3. Kenney Animated Characters (tuỳ chọn)

Nếu bạn tải gói này vào `public/models/characters/`, hệ thống sẽ **ưu tiên
model GLB có rig** thay cho chibi, dùng đúng tên animation có thật trong file
(xem `src/client/assets/characterRig.ts` — có bảng ưu tiên + so khớp không phân
biệt hoa/thường).

| Gói | Nguồn | Link |
|---|---|---|
| Kenney Animated Characters | kenney.nl | <https://kenney.nl/assets/animated-characters-3> |

Quy tắc: **không bịa tên animation.** Nếu file không có clip "gõ máy",
hệ thống dùng clip *ngồi* + hiệu ứng màn hình nhấp nháy.

---

## 2. Đồ đạc — Kenney (tuỳ chọn)

### 2.1. Nguồn tải

| Gói | Nguồn | Link |
|---|---|---|
| Kenney Furniture Kit | kenney.nl | <https://kenney.nl/assets/furniture-kit> |
| Kenney Building Kit | kenney-assets.itch.io | <https://kenney-assets.itch.io/building-kit> |

Tải bản **GLB** (không phải FBX/OBJ).

### 2.2. Cấu trúc thư mục

```
public/
  models/
    furniture/     ← Furniture Kit (GLB)
    building/      ← Building Kit (GLB)
    characters/    ← Animated Characters (GLB)
```

Sau khi tải xong, chạy:

```bash
npm run scan:assets
```

Script in ra: mesh của từng file, **tên animation có thật**, file có rig; đồng
thời ghi `public/models/manifest.json` để client tự ánh xạ tên → file thật
(không hard-code tên file).

### 2.3. Danh sách nhu cầu theo phòng

| Phòng | Nhu cầu |
|---|---|
| **Giao việc** (mẫu) | `Desk`, `Chair`, `Computer`, `Whiteboard` (roadmap), `Bookcase`, `Lamp` |
| Khách hàng | `Desk`, `Chair`, `Computer`, `Telephone`, `Cabinet`, `Sofa`, `Table` |
| Bán hàng | `Desk`, `Chair`, `Computer`, `Whiteboard` (phễu), `Bookcase` |
| Marketing | `Desk`, `Chair`, `Computer`, `Whiteboard`, `Lamp` |
| Tài chính | `Desk`, `Chair`, `Computer`, `Table`, `Cabinet` |
| Đội AI | `Desk`, `Chair`, `Computer`, `Whiteboard`, `Bookcase`, `Lamp` |
| Tự động | `Desk` ×2, `Chair` ×3, `Computer` ×3, `Cabinet`, `Lamp` |
| Thư viện | `Bookcase` ×4, `Table`, `Chair` ×2, `Desk`, `Computer`, `Lamp` |
| Dự án | `Desk`, `Chair`, `Computer`, `Whiteboard`, `Bookcase` |

### 2.4. Hành vi khi không có model

Nếu thiếu file, hệ thống dùng hình dựng thủ công với **đúng tỷ lệ** mà
chibi rig cần (`src/client/assets/roomBuilder.ts`):

- mặt bàn cao độ **0.78**
- mặt ghế cao độ **0.49**
- màn hình đặt trên bàn, cao độ **0.81**
- bàn rộng 1.7, ghế 0.58, phòng 7–9 đơn vị

Nên cảnh luôn đúng bố cục, chỉ khác chất liệu.

---

## 3. Ánh sáng (đã áp dụng)

| Hạng mục | Thay đổi |
|---|---|
| Nền | `#0d1117` → `#cdd9e6` (nền sáng) + fog cùng tông |
| Ánh sáng môi trường | `HemisphereLight` (trời xanh / đất be), cường độ 1.05 |
| Mặt trời | `DirectionalLight` 2.1, shadow map 2048, PCF mềm, bias tinh chỉnh |
| Ánh sáng phụ | `DirectionalLight` 0.55 từ hướng ngược lại |
| Đèn trần phòng | `PointLight` ấm, mỗi phòng một cái |
| Đèn trạng thái | `PointLight` gắn nhân vật, màu đổi theo trạng thái |
| Màn hình máy tính | texture động + `emissive` |
| Nhãn phòng | chữ 52px, nền trắng, viền xanh `#1f6feb` |

File: `src/client/assets/lighting.ts`.

---

## 4. Kiểm thử ảnh

```bash
npm run dev                      # chạy server + client
npx tsx scripts/verify-scene.ts dispatch   # phân tích pixel cảnh
npx tsx scripts/closeup.ts minh 3.0        # cận cảnh 1 nhân vật
npx tsx scripts/states.ts                  # ảnh từng trạng thái agent
```

Ghi chú: ảnh WebGL cần `?capture=1` trên URL (bật `preserveDrawingBuffer`).
Script dùng Chrome tại `C:\Program Files\Google\Chrome\Application\chrome.exe`.

---

## 5. Nhật ký tải

| Gói | Phiên bản | Ngày tải | Nguồn | Giấy phép |
|---|---|---|---|---|
| Kenney Furniture Kit | | | kenney.nl/assets/furniture-kit | CC0 1.0 |
| Kenney Building Kit | | | kenney-assets.itch.io/building-kit | CC0 1.0 |
| Kenney Animated Characters | | | kenney.nl/assets/animated-characters-3 | CC0 1.0 |

*(Chưa tải — bản nhân vật chibi hiện dùng bản quyền MIT từ repo tham khảo.)*

### Nguồn code chibi rig

| Thành phần | Nguồn | Giấy phép |
|---|---|---|
| `src/client/assets/chibiRig.js` | `references/my-office` (`src/office/people/chibi-rig.js`) | MIT — © 2026 khanh020905 |

Đã chỉnh sửa cho phù hợp: bỏ phụ thuộc i18n, đổi nhãn sang tiếng Việt,
ghi rõ nguồn gốc ở đầu file.
