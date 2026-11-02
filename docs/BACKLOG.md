# BACKLOG — Văn phòng 3D (FunnyOVS)

Nguồn thiết kế: [`02-thiet-ke.md`](./02-thiet-ke.md) · Nhật ký: [`LOG.md`](./LOG.md)

Quy tắc chọn mục: **giá trị cao, rủi ro thấp**. Ưu tiên theo thứ tự nhóm bên dưới.
Mỗi mục hoàn tất → gạch đầu và ghi kết quả vào `LOG.md`.

---

## 1. Chạy được & ổn định (ưu tiên cao nhất)

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 1.1 | Chụp ảnh kiểm thử bị trắng do `readPixels` xoá backbuffer | ✅ xong | Đã tách `toDataURL` trước `readPixels`, dùng FBO phụ để đọc pixel |
| 1.2 | Cảnh 3D "rửa trắng" sau khi bật bloom + IBL | ✅ xong | ACES + IBL cộng dồn với đèn sẵn có → giảm `environmentIntensity` 0.1, exposure 0.95 |
| 1.3 | Camera toàn cảnh bị phòng khác/tường che kín | ✅ xong | Thêm `focusMode` (mờ ẩn phòng khác) + `wallCulling` (mờ tường chắn tầm nhìn) |
| 1.4 | Test đầu-cuối chuỗi giao việc → cursor agent → kết quả → nhật ký token | ⬜ todo | Chạy 1 tác vụ thật qua UI, xác minh token ledger ghi đúng |
| 1.5 | Kiểm tra hiệu năng: draw call, số mesh, FPS | ⬜ todo | Đo trước/sau, đặt ngưỡng cảnh báo |
| 1.6 | Xử lý resize làm méo composer/bloom | ⬜ todo | `composer.setSize` chưa được gọi khi đổi kích thước cửa sổ |

## 2. Bộ test an toàn (chỉ THÊM, không nới lỏng)

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 2.1 | Test: không đọc file ngoài `/workspace` | ⬜ todo | |
| 2.2 | Test: không làm theo lệnh ẩn trong nội dung web (prompt injection) | ⬜ todo | |
| 2.3 | Test: chặn path traversal trong yêu cầu quyền thư mục | ⬜ todo | |

## 3. Giao diện 3D chuyên nghiệp

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 3.1 | Hậu kỳ render: bloom + ACES + MSAA + IBL | ✅ xong | `assets/renderPipeline.ts` (port từ `my-office`) |
| 3.2 | Cây xanh trong chậu + đèn sàn | ✅ xong | `assets/props.ts` (port từ `my-office/terrace.js`, `plants-lamps.js`) |
| 3.3 | Ngoại cảnh 360°: skyline thành phố | ✅ xong | `assets/windows.ts` (port từ `my-office/windows.js`) |
| 3.4 | Texture sàn ván gỗ / gạch | ✅ xong | `assets/floorTextures.ts` |
| 3.5 | Tương phản & bảng màu vật liệu (đồ gỗ, tường, sàn) | 🔄 đang làm | Ảnh vẫn nhạt, cần tăng contrast vật liệu |
| 3.6 | Nhân vật không bị bàn che khi camera nhìn chếch | 🔄 đang làm | Camera yaw ~0.12, pitch 0.52 — cần tinh chỉnh thêm |
| 3.7 | Màn hình máy tính phát sáng theo trạng thái agent | ⬜ todo | Dùng `screenGlowColor` + PointLight gắn màn hình |
| 3.8 | Đồ đạc chi tiết: quầy cà phê, tủ server, kệ sách | ⬜ todo | Tham khảo `my-office/src/office/world/props/*` |
| 3.9 | Vòng chuyển động ngày/đêm (mặt trời, đèn bật khi tối) | ⬜ todo | Repo tham khảo có `envDay`/`envNight` |
| 3.10 | Bóng đổ đẹp hơn: contact shadow / SSAO | ⬜ todo | Cân nhắc `SSAO` pass của three.js |

## 4. Phòng còn lại + duyệt việc + nhật ký

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 4.1 | Duyệt việc (proposal) hiển thị trong cảnh 3D | ⬜ todo | Hiện mới có panel HTML |
| 4.2 | Nhật ký token hiển thị trong cảnh (bảng LED/bảng điện tử) | ⬜ todo | |
| 4.3 | Hộp thoại xin quyền nổi 3D tại vị trí agent | ⬜ todo | |

## 5. Thư viện Tri thức + giờ học tự động

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 5.1 | Ghi bài học từ mỗi chu kỳ vào thư viện | ⬜ todo | |
| 5.2 | Nghiên cứu best practice 3D (ghi vào `docs/research/`) | ⬜ todo | |

## 6. Tài liệu

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 6.1 | README tiếng Việt cho người không rành lập trình | ⬜ todo | |
| 6.2 | `DEPENDENCIES.md` (tên, phiên bản, giấy phép, lý do) | ⬜ todo | |
