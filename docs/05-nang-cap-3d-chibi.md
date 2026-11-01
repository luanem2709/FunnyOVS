# Nâng cấp giao diện 3D — nhân vật chibi + đồ đạc

Ngày: 2026-11-01

## Mục tiêu

Nâng nhân vật từ "capsule + khối cầu" lên **người 3D thật** theo phong cách
repo tham khảo `references/my-office`, đồng thời làm sáng cảnh.

## Đã làm

### 1. Nhân vật chibi (chính)

Port `chibi-rig.js` từ repo tham khảo (MIT, © 2026 khanh020905) vào
`src/client/assets/chibiRig.js`, bỏ phụ thuộc i18n.

Nhân vật có:
- Xương đầy đủ: hông → gối → giày; thân → cổ → đầu; vai → khuỷu → tay.
- Tori ngực dựng bằng `LatheGeometry` (theo đường viền hình người).
- Hộp sọ nạo tay (gò má, cằm, trán) bằng cách sửa vertex của sphere.
- Tóc bịt dựng procedural (`hairShell`) — 6 kiểu: bob, plain, spiky,
  ponytail, bun, curly; có gợn, có chổi tóc lệch.
- Mắt nhiều lớp (tròng + đồng tử + láng + chân mắt + lông mi) — nhấp nháy được.
- Miệng cười / miệng hình tròn, chuyển theo trạng thái.
- Trang phục: áo / hoodie / com-lê (áo vest + cà vạt).
- Phụ kiện: kính, tai nghe, mũ lưỡi trai, beanie.
- **IK 2 khớp** cho tay: gõ bàn phím thì tay với đúng mặt bàn.

Bảng màu 8 agent: mỗi người một màu áo + màu tóc + màu da + kiểu tóc +
trang phục + phụ kiện khác nhau (`src/client/assets/chibi.ts`).

Ánh xạ trạng thái → pose:

| Trạng thái | Pose |
|---|---|
| `idle` | `idle` |
| `working` | `type` |
| `researching` / `learning` | `read` |
| `waiting` | `wave` |
| `blocked` | `sweat` |
| `stopped` | `idle` |

### 2. Đồ đạc & tỷ lệ

`src/client/assets/roomBuilder.ts` dựng bàn / ghế / màn hình / bảng / kệ sách
đúng tỷ lệ mà rig cần:

- mặt bàn `0.78`, mặt ghế `0.49`, màn hình `0.81`
- bàn 1.7 × 0.86, ghế 0.58 × 0.54

Nếu có model Kenney trong `public/models/`, hệ thống tự thay thế model thật
(dựa trên `manifest.json` do `npm run scan:assets` sinh).

Kích thước phòng thu nhỏ lại cho hợp tỷ lệ người (~1.4 m):
phòng 7–9 đơn vị thay vì 9–12.

### 3. Ánh sáng

`src/client/assets/lighting.ts`:
- nền `#cdd9e6` thay cho nền đen, kèm fog cùng tông
- `HemisphereLight` + `DirectionalLight` chính + ánh sáng phụ
- shadow map 2048, PCF mềm, bias/normalBias tinh chỉnh
- đèn trần mỗi phòng, đèn trạng thái gắn nhân vật (đổi màu theo trạng thái)
- nhãn phòng: chữ to, nền trắng, viền xanh

### 4. Hạ tầng asset

| File | Vai trò |
|---|---|
| `src/client/assets/loader.ts` | nạp GLB, cache, clone (SkeletonUtils), instancing |
| `src/client/assets/manifest.ts` | đọc `manifest.json`, tìm file theo từ khoá |
| `src/client/assets/characterRig.ts` | mixer + clip thật, không bịa tên animation |
| `src/client/assets/characterFactory.ts` | chọn nguồn nhân vật: chibi → GLB → capsule |
| `src/client/assets/lighting.ts` | bộ ánh sáng |
| `src/client/assets/roomBuilder.ts` | dựng phòng + đồ đạc |
| `scripts/scan-assets.ts` | quét GLB, sinh `manifest.json` |
| `scripts/verify-scene.ts` | phân tích pixel cảnh |
| `scripts/closeup.ts` | ảnh cận cảnh nhân vật |
| `scripts/states.ts` | ảnh từng trạng thái agent |

## Kết quả kiểm chứng

- TypeScript: `tsc --noEmit` sạch
- Test: 55/55 pass
- Build: `vite build` thành công
- Scene: 470 draw call, 235k tam giác, 0.1% pixel tối, 104 màu phân biệt
- 8/8 agent: `kind = "chibi"`, `animated = true`
- Ảnh mỗi trạng thái: `docs/shots/state-*.png`

## Chưa làm

- Chưa có model Kenney trong `public/models/` (chưa tải) → cảnh dùng hình
  dựng thủ công cho đồ đạc, nhân vật dùng chibi.
- Chưa nhân đồ đạc ra 8 phòng còn lại theo bảng 2.3 trong `docs/ASSETS.md`
  (hiện đã dựng đồ đạc cho cả 9 phòng, nhưng mới ở mức cơ bản).
