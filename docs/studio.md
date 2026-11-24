# Studio dựng clip (hoạt hình khối kiểu Roblox)

Mục tiêu: văn phòng AI thay một studio nhỏ — **nhanh, ít token, nhân vật lưu lại và dùng lại**. Agent không viết mã dựng; nó chỉ sửa **3 bộ dữ liệu nhỏ**, còn kết xuất là bộ máy xác định (three.js chạy trong Chrome + ffmpeg) nên **không tốn token lúc dựng**.

## Luồng

```
agent (Marketing / Automation Lab)                     bạn
  studio_save  script|shots|characters  ──kiểm zod──▶  <workspace>/studio/<dự-án>/*.json
  studio_render {preview? voice?}      ──▶ việc nền ──▶ thẻ "Studio dựng clip" (tiến độ, huỷ, xem clip)
        │  voice=true ──▶ HỘP DUYỆT "gửi lời đọc tới dịch vụ giọng online" ──(bạn duyệt)──▶ synth.py
        ▼
  timing → mix → render (Chrome) → ffmpeg ──▶ <dự-án>/clip-co-giong.mp4   (xem thử: <dự-án>/preview/*.jpg)
```

| Dữ liệu | File | Nội dung |
|---|---|---|
| Lời đọc | `loi-doc.json` | đúng 10 câu: tựa, 8 cảnh, kết (mỗi câu ≤ 260 ký tự) |
| Shot list | `shots.json` | cỡ cảnh, góc máy, chuyển động, tiêu cự, vị trí máy, ý đồ; **mỗi cảnh s1–s8 phải được phủ liền mạch từ 0 đến 1** |
| Nhân vật | `characters.json` | màu da/áo/quần/tóc, biến thể áo vest, màu 12 khách hàng — nguồn duy nhất cho ngoại hình, dùng lại ở mọi clip |

Dự án mới được tạo từ dữ liệu mẫu của kit (`studio/roblox-clip/`), nên agent có thể bắt đầu bằng cách chỉ sửa lời đọc.

## An toàn

- **Lời đọc ra ngoài phải qua duyệt.** Giọng dùng `edge-tts` (dịch vụ online của Microsoft) nên văn bản bị GỬI RA khỏi máy. `studio_render voice=true` (hoặc nút "Dựng video + giọng đọc") luôn tạo hộp duyệt `studio_voice` trong cảnh 3D (hết hạn 10 phút = từ chối). Giọng đã tạo trước đó (cùng văn bản + cùng giọng, băm sha1) được dùng lại **không cần duyệt vì không gửi gì**; sửa một câu thì chỉ câu đó phải duyệt/tạo lại. Không có cách "bỏ qua duyệt".
- **Dữ liệu được kiểm chặt** trước khi ghi (zod): độ dài, số hữu hạn, toạ độ máy trong ±1000, mỗi cảnh phủ kín. Lời đọc chứa thứ giống khoá/bí mật bị từ chối (vì sẽ bị gửi đi).
- **Chỉ trong workspace.** Tên dự án `^[a-z0-9][a-z0-9-]{1,40}$` + kiểm đường dẫn; REST chỉ phục vụ đúng `clip-co-giong.mp4` và ảnh xem thử.
- **Một việc một lúc**, chạy nền; huỷ được (giết cả cây tiến trình Chrome/ffmpeg); **dừng khẩn cấp** huỷ việc đang chạy, từ chối hộp duyệt đang chờ, và không nhận việc mới.
- **Quyền tối thiểu:** chỉ Marketing và Automation Lab có `studio_save` / `studio_render` / `studio_status`. Thao tác ghi/dựng qua REST chỉ nhận từ chính máy chạy app (`loopbackOnly`).
- **Nhật ký bảo mật:** `studio.save`, `studio.render`, `studio.cancel` (và `action.approved/denied/expired` cho hộp duyệt giọng). Không ghi nội dung lời đọc.

## Cần có trên máy

| Công cụ | Dùng cho | Thiếu thì |
|---|---|---|
| Chrome hoặc Edge | kết xuất hình | không dựng được (báo rõ) |
| `ffmpeg` trong PATH | ghép video, trộn âm | chỉ "xem thử" dùng được |
| Python + `pip install edge-tts` | giọng đọc | dựng không giọng (thời lượng ước lượng ~14 ký tự/giây, không có tiếng đọc) |

Thẻ Studio ở tab *Tổng quan* hiện công cụ còn thiếu.

## Giới hạn đã biết (nói thẳng)

- **Dàn cảnh 8 cảnh là mã viết tay** (`scene.js`, mẫu `freelancer-8`). Agent đổi được lời đọc, góc máy, màu/kiểu nhân vật — **không** tự tạo cảnh mới/đạo cụ mới. Muốn thêm cảnh/đạo cụ phải sửa mã (hoặc thêm mẫu mới).
- `edge-tts` thỉnh thoảng trả lỗi ngẫu nhiên hoặc treo kết nối; `synth.py` thử lại tối đa 12 lần (mỗi lần 25 giây) và có thể chạy lại tiếp từ câu còn thiếu.
- Một clip đầy đủ (~70–80 giây, 24 fps) kết xuất bằng Chrome phần mềm mất vài phút; "xem thử" chỉ vài giây.
- Giọng và tiếng đệm là tổng hợp; không dùng mẫu âm thanh/nhạc ngoài.

## API

`GET /api/studio/state` · `POST /api/studio/projects {project}` · `GET|PUT /api/studio/projects/:p/(script|shots|characters)` · `POST /api/studio/render {project, preview?, voice?}` (202) · `POST /api/studio/cancel {id}` · `GET /api/studio/projects/:p/clip.mp4` · `GET /api/studio/projects/:p/preview/:n`. Sự kiện `studio.state` đi qua schema chung (`OfficeEvent`).

## Đóng gói

`npm run desktop:prepare` chép kit + một phần tối thiểu của `three` (`build/app/studio/vendor/three`) để kết xuất chạy offline. Kit đọc `playwright-core` từ `node_modules` của app.

Nguồn ý tưởng điện ảnh: `studio/roblox-clip/NGHIEN-CUU.md` (từ OpenMontage — AGPL-3.0, chỉ học ý tưởng, không chép mã) và `DAO-DIEN.md` (shot list sinh từ dữ liệu).
