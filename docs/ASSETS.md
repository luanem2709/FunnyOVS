# Danh mục asset 3D — Kenney (CC0)

Mọi asset dùng trong dự án đều đến từ **Kenney** — giấy phép **CC0 1.0**
(public domain, dùng thương mại OK, không cần ghi nguồn, không cần xin phép).

> Quy tắc bất di bất dịch của dự án: **không tải asset từ nguồn khác**,
> **không tự tạo model phức tạp bằng code**. Asset phải là file `.glb` tải
> tay, đặt vào `public/models/`.

---

## 1. Nguồn tải

| Gói | Nguồn | Link |
|---|---|---|
| Kenney Furniture Kit | kenney.nl | <https://kenney.nl/assets/furniture-kit> |
| Kenney Building Kit | kenney-assets.itch.io | <https://kenney-assets.itch.io/building-kit> |
| Kenney Animated Characters | kenney.nl | <https://kenney.nl/assets/animated-characters-3> |

Tải bản **GLB** (không phải FBX/OBJ) — Three.js `GLTFLoader` đọc GLB trực tiếp,
một file = một model + texture + animation.

---

## 2. Cấu trúc thư mục mong đợi

```
public/
  models/
    furniture/     ← Furniture Kit (GLB)
    building/      ← Building Kit (GLB)
    characters/    ← Animated Characters (GLB)
```

Sau khi tải xong, chạy:

```bash
npx tsx scripts/scan-assets.ts
```

Script sẽ in ra: danh sách mesh của từng file, **tên animation có thật** bên
trong file nhân vật, và các file có rig. Tên file/animation thực tế sẽ được
lấy từ kết quả đó — **không đoán mò**.

---

## 3. Danh sách model theo từng phòng

Đây là danh sách **nhu cầu chức năng**. Tên file cụ thể sẽ chốt sau khi quét
thực tế (vì tên file trong gói Kenney có thể khác nhau giữa các bản phát hành).

### 3.1. Phòng Giao việc — **phòng mẫu, làm trước**

| Nhu cầu | Gợi ý trong Furniture Kit | Ghi chú |
|---|---|---|
| Bàn làm việc của bạn | `Desk` / `Computer desk` | Bàn lớn nhất phòng |
| Ghế của bạn | `Chair` | Có bản `Chair swivel` nếu có |
| Máy tính | `Computer` / `Monitor` | Màn hình sẽ được gắn texture động của ta |
| Bàn phụ + ghế | `Desk`, `Chair` | Cho 2 nhân vật phụ trợ |
| Tủ sách / kệ | `Bookcase` | Chứa "roadmap" |
| Đèn bàn | `Lamp` | Bổ sung ánh sáng cục bộ |
| Tường / sàn | Building Kit: `Wall`, `Floor` | Kiểm tra phòng mẫu |

### 3.2. Phòng Khách hàng

| Nhu cầu | Gợi ý |
|---|---|
| Bàn tiếp khách | `Table` (tròn hoặc vuông) |
| Ghế khách ×2–3 | `Chair` |
| Sofa | `Sofa` |
| Bàn làm việc + ghế + máy tính | `Desk`, `Chair`, `Computer` |
| Tủ / kệ | `Cabinet` |
| Điện thoại bàn | `Telephone` (nếu có) |

### 3.3. Phòng Bán hàng

| Nhu cầu | Gợi ý |
|---|---|
| Bàn làm việc + ghế + máy tính | `Desk`, `Chair`, `Computer` |
| Bảng phễu (bảng trắng) | `Whiteboard` / `Blackboard` |
| Ghế khách | `Chair` |
| Kệ | `Bookcase` / `Cabinet` |

### 3.4. Phòng Marketing

| Nhu cầu | Gợi ý |
|---|---|
| Bàn làm việc + ghế + máy tính | `Desk`, `Chair`, `Computer` |
| Bảng nội dung / whiteboard | `Whiteboard` |
| Ghế khách ×2 | `Chair` |
| Đèn | `Lamp` |

### 3.5. Phòng Tài chính

| Nhu cầu | Gợi ý |
|---|---|
| Bàn làm việc + ghế + máy tính | `Desk`, `Chair`, `Computer` |
| Bàn phụ để chồng giấy tờ | `Table` + instance `Paper`/`Sheet` |
| Ghế khách | `Chair` |
| Tủ kho | `Cabinet` |

### 3.6. Phòng Đội AI

| Nhu cầu | Gợi ý |
|---|---|
| Bàn tròn họp + ghế ×4 | `Table` (round), `Chair` |
| Bảng trắng lớn | `Whiteboard` |
| Kệ | `Bookcase` |
| Đèn treo | `Lamp` (ceiling) |

### 3.7. Phòng Làm việc tự động

| Nhu cầu | Gợi ý |
|---|---|
| Bàn dài + nhiều ghế | `Desk` ×2, `Chair` ×3 |
| Máy tính ×3 | `Computer` (mỗi cái 1 màn hình có texture riêng) |
| Tủ rack / kệ | `Cabinet` / `Bookcase` |
| Đèn | `Lamp` |

### 3.8. Phòng Thư viện

| Nhu cầu | Gợi ý |
|---|---|
| Tủ sách ×3–4 (đặt dọc tường) | `Bookcase` |
| Bàn đọc + ghế ×2 | `Table`, `Chair` |
| Bàn làm việc + máy tính | `Desk`, `Computer` |
| Đèn đọc | `Lamp` |

### 3.9. Phòng Dự án mở rộng

| Nhu cầu | Gợi ý |
|---|---|
| Bàn + ghế + máy tính | `Desk`, `Chair`, `Computer` |
| Bảng trắng | `Whiteboard` |
| Kệ | `Bookcase` |

---

## 4. Nhân vật

- **1 file nhân vật** từ Kenney Animated Characters, dùng lại cho cả 8 nhân vật
  (clone + đổi màu vật liệu). Không cần tải 8 file.
- Mỗi nhân vật một màu/skin khác nhau, theo bảng màu đã có trong code:
  Mai `#4f9cf9`, Long `#f7b32b`, Huy `#ef6f8e`, Thu `#43c59e`, Ban `#8f7bf0`,
  An `#3fb6c8`, Tri `#d0a35c`, Minh `#6fd67a`.

### Animation cần dùng

| Trạng thái trong game | Animation cần | Có sẵn trong gói? |
|---|---|---|
| `idle` — rảnh | đứng yên / thở | ⬜ chờ quét |
| `working` — đang làm việc | **gõ máy** | ⬜ chờ quét |
| `researching` — duyệt web | ngồi + màn hình nhấp nháy | ⬜ chờ quét |
| `waiting` — chờ duyệt | giơ tay / đứng | ⬜ chờ quét |
| `blocked` — lỗi | ngồi thu / cúi đầu | ⬜ chờ quét |

> **Quy tắc:** nếu gói **không có** animation "gõ máy" thì **không bịa**.
> Khi đó dùng animation *ngồi* (nếu có) + hiệu ứng màn hình nhấp nháy để biểu
> thị trạng thái `working`. Mọi animation thực sự có sẽ được xác nhận từ
> kết quả `scan-assets.ts` trước khi viết code.

### Biểu tượng trên đầu (giữ nguyên cách hiện tại)

- Vòng tròn dưới chân đổi màu theo trạng thái (đã có, giữ nguyên).
- Thêm icon 3D nhỏ nổi trên đầu: `!` (chờ duyệt), `?` (lỗi), `…` (đang làm).
  Làm bằng sprite/canvas — không phải model phức tạp, không vi phạm quy tắc.

---

## 5. Ánh sáng (Phase 5 của nâng cấp)

| Hạng mục | Thay đổi |
|---|---|
| Nền | từ `#0d1117` → nền sáng hơn, có gradient trời |
| Ánh sáng môi trường | thêm `HemisphereLight` (sky/ground) |
| Bóng | `PCFSoftShadowMap`, shadow map 2048, bias tinh chỉnh |
| Màn hình máy tính | thêm `PointLight` nhỏ (màu theo trạng thái agent) |
| Ánh sáng trong phòng | `Lamp` của Kenney → gắn `PointLight` nhẹ |
| Nhãn phòng | tăng cỡ chữ, thêm viền tương phản để đọc được trên nền sáng |

---

## 6. Nhật ký tải

| Gói | Phiên bản | Ngày tải | Nguồn | Giấy phép |
|---|---|---|---|---|
| Kenney Furniture Kit | | | kenney.nl/assets/furniture-kit | CC0 1.0 |
| Kenney Building Kit | | | kenney-assets.itch.io/building-kit | CC0 1.0 |
| Kenney Animated Characters | | | kenney.nl/assets/animated-characters-3 | CC0 1.0 |

*(Cập nhật sau khi tải — xem mục "Ngày tải" trong `docs/ASSETS.md`.)*

---

## 7. Quy trình làm

1. ⬜ Bạn tải 3 gói → đặt GLB vào `public/models/{furniture,building,characters}/`
2. ⬜ Chạy `npx tsx scripts/scan-assets.ts` → tôi báo cáo model + animation thực tế
3. ⬜ Tôi dựng **Phòng Giao việc** (phòng mẫu) + 1 nhân vật
4. ⬜ Bạn duyệt ảnh/phong cách
5. ⬜ Tôi nhân ra 8 phòng còn lại
6. ⬜ Commit + push
