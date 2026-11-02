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
| 1.4 | Test đầu-cuối chuỗi giao việc → cursor agent → kết quả → nhật ký token | ✅ xong | Chu kỳ 4: task Cursor CLI thật `done`, 45.486 token, `cli-usage`, ledger + ví + HUD khớp. Sửa 5 lỗi: timeout 120s→300s, ví học quá nhỏ, sandbox browser crash server, DDG CAPTCHA chặn bot, thiếu bộ phân công tự động |
| 1.10 | Mọi nhân viên đều tiêu token thật (không việc giả) | ✅ xong | Chu kỳ 5: bỏ `setTimeout` giả ở việc "nội bộ" → 8/8 nhân viên có `tokensUsed>0`, `tasksDone>0` |
| 1.11 | Bộ điều tiết nhịp độ theo ngân sách (governor) | ✅ xong | Chu kỳ 5: `governorIntervalMs()` trải đều token còn lại ra giờ làm việc, nhịp 1–8 phút, hết token thì dừng |
| 1.12 | Số token thanh ngân sách khớp bảng chi tiêu | ✅ xong | Chu kỳ 6 (GĐ 1.1): 3 nguyên nhân — `/api/state` không gửi `spend`; thanh "Hôm nay" bỏ sót ví học; trần ngày hở lỗ 130%. Đã sửa + 4 test mới |
| 1.13 | Nhãn 3D rõ nét: biểu tượng trạng thái + thanh tiến độ + tự ẩn khi xa | ✅ xong | Chu kỳ 6: `src/client/assets/labels.ts` — canvas 1024×256, nền đậm chữ trắng, ẩn >13 m, không che mặt |
| 1.14 | Bầu trời gradient + skyline mờ (bỏ texture đốm tròn) | ✅ xong | Chu kỳ 6: `skyDome()` shader + `distantSkyline()` 2 vòng mờ + mây radial gradient |
| 1.15 | Chuỗi đầu-cuối + xác minh cờ Cursor CLI | ✅ xong | Chu kỳ 6: 96.984 token `cli-usage`, ledger khớp chính xác. `--sandbox enabled` KHÔNG chạy trên Windows (đã đo) |
| 1.5 | Kiểm tra hiệu năng: draw call, số mesh, FPS | ✅ xong | `scripts/perf.ts` — 1.371 draw call, 440k tri, 802 geometry, 29 đèn, FPS trung vị 48 (SwiftShader) |
| 1.6 | Xử lý resize làm méo composer/bloom | ✅ xong | `composer.setSize` + `setPixelRatio` trong handler resize |
| 1.7 | Cache vật liệu & geometry để giảm draw call | ✅ xong | 1.483 → 619 vật liệu; 1.235 → 802 geometry |
| 1.8 | Giảm số đèn hoạt động (chi phí shader) | ✅ xong | 38 → 29 đèn; đèn trần chỉ bật ở phòng đang xem, đèn sàn dùng emissive |
| 1.9 | Gộp mesh theo vật liệu (instancing) | ⬜ todo | 1.371 draw call vẫn nhiều; `InstancedMesh` cho lá cây, ghế, sách |

## 2. Bộ test an toàn (chỉ THÊM, không nới lỏng)

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 2.1 | Test: không đọc file ngoài `/workspace` | ✅ xong | Chu kỳ 7: `tests/safety-gd2.test.ts` — 12 vector bypass + junction Windows (đo thật) đều bị chặn |
| 2.2 | Test: không làm theo lệnh ẩn trong nội dung web (prompt injection) | ✅ xong | Chu kỳ 7: 6 payload + kiểm chứng bằng mock `ResearchEngine` (spy `GuardedFs` ⇒ 0 lần ghi file) |
| 2.3 | Test: chặn path traversal trong yêu cầu quyền thư mục | ✅ xong | Chu kỳ 7: grant không lan sang thư mục anh em, không dùng chéo agent, `read`≠ghi≠xoá |
| 2.4 | Chặn SSRF (mạng nội bộ, cloud metadata, file://) | ✅ xong | Chu kỳ 7: tìm ra lỗ hổng thật — `169.254.169.254` trước đây được phép. Đã chặn theo DẢI IPv4/IPv6 + giao thức |

## 3. Giao diện 3D chuyên nghiệp

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 3.1 | Hậu kỳ render: bloom + ACES + MSAA + IBL | ✅ xong | `assets/renderPipeline.ts` (port từ `my-office`) |
| 3.2 | Cây xanh trong chậu + đèn sàn | ✅ xong | `assets/props.ts` (port từ `my-office/terrace.js`, `plants-lamps.js`) |
| 3.3 | Ngoại cảnh 360°: skyline thành phố | ✅ xong | `assets/windows.ts` (port từ `my-office/windows.js`) |
| 3.4 | Texture sàn ván gỗ / gạch | ✅ xong | `assets/floorTextures.ts` |
| 3.5 | Tương phản & bảng màu vật liệu (đồ gỗ, tường, sàn) | ✅ xong | Bảng màu đậm hơn trong `roomBuilder.ts` + `main.ts` |
| 3.6 | Nhân vật không bị bàn che khi camera nhìn chếch | ✅ xong | Camera yaw 0.12, pitch 0.52; đồ đạc lùi sang bên |
| 3.7 | Màn hình máy tính phát sáng theo trạng thái agent | ✅ xong | `Screen.setStatus` — PointLight trước màn hình, màu theo trạng thái |
| 3.8 | Đồ đạc chi tiết: quầy cà phê, tủ server, máy in | ✅ xong | `assets/officeProps.ts` — port từ `my-office/{coffee,server-racks,printer}.js` |
| 3.9 | Vòng chuyển động ngày/đêm (mặt trời, đèn bật khi tối) | ⬜ todo | Repo tham khảo có `envDay`/`envNight` |
| 3.10 | Bóng đổ đẹp hơn: contact shadow / SSAO | ⬜ todo | Cân nhắc `SSAO` pass của three.js |

## 4. Phòng còn lại + duyệt việc + nhật ký

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 4.1 | Duyệt việc (proposal) hiển thị trong cảnh 3D | ⬜ todo | Hiện mới có panel HTML |
| 4.2 | Nhật ký token hiển thị trong cảnh (bảng LED/bảng điện tử) | ⬜ todo | |
| 4.3 | Hộp thoại xin quyền nổi 3D tại vị trí agent | ⬜ todo | |

## 4. Nhân viên đi lại (port từ `my-office/people/*`)

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 4.1 | Lưới điều hướng + A* tìm đường | ✅ xong | `assets/agentNav.ts` — lưới 0.5 m, chặn tường phòng, rút gọn đường |
| 4.2 | Máy trạng thái work → đi → nghỉ → về bàn | ✅ xong | `Walker` — 5 phase, animation `walk`/`coffee`/`board` |
| 4.3 | Chỗ nghỉ: cà phê, bảng trực ca, máy in, bình nước | ✅ xong | `AMENITIES` — 11 chỗ trong 6 phòng |
| 4.4 | Hàng chờ pha cà phê (mỗi người một lượt) | ⬜ todo | `my-office/breaks.js` — `joinCoffee`/`lineUp` |
| 4.5 | Nhân viên dừng lại nói chuyện với nhau | ⬜ todo | `my-office/nhau.js` — nhóm ngẫu nhiên tụ lại |
| 4.6 | Agent nhận việc mới → bỏ chỗ đang đi, quay về bàn | ✅ xong | `Walker.recall()` — vẫn đi bộ về, không dịch chuyển tức thì |
| 4.7 | Đường đi tránh bàn/ghế (vật cản nội thất) | ✅ xong | Thêm blocker bàn vào `navGrid` (pad 0.05 m) |

## 5. Thư viện Tri thức + giờ học tự động
| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 5.1 | Ghi bài học từ mỗi chu kỳ vào thư viện | ⬜ todo | |
| 5.2 | Nghiên cứu best practice 3D (ghi vào `docs/research/`) | ⬜ todo | |
| 5.3 | Nhân viên tự nhận việc khi rảnh (không cần bạn giao) | ✅ xong | Chu kỳ 4: `src/server/agents/workDispatcher.ts` — 7 việc thường nhật, mỗi nhân viên 1 việc, tôn trọng ví `normal`/`learning` |
| 5.4 | Việc nghiên cứu ghi vào ledger + cộng token cho nhân viên | ✅ xong | Chu kỳ 4: `researchEngine` trả `tokensUsed` → `token_ledger` + `registry.recordUsage()` |

## 6. Tài liệu

| # | Mục | Trạng thái | Ghi chú |
|---|-----|-----------|---------|
| 6.1 | README tiếng Việt cho người không rành lập trình | ⬜ todo | |
| 6.2 | `DEPENDENCIES.md` (tên, phiên bản, giấy phép, lý do) | ⬜ todo | |
