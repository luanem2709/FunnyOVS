# Đạo diễn: shot list, character bible, floor plan, continuity

> Sinh tự động bởi `gen-docs.mjs` từ `shots.json`, `characters.json`, `timing.json` — sửa dữ liệu rồi chạy lại, đừng sửa tay file này.

Phương pháp học từ skill *camera-cinematography* trong OpenMontage (xem `NGHIEN-CUU.md` §7): đi theo 7 bước — ý tưởng → character bible → shot list (cỡ cảnh + góc máy + chuyển động theo ý đồ cảm xúc) → bố cục (1/3, headroom, lookspace) → floor plan + trục 180° → continuity → rà soát.

## 1. Ý tưởng

Truyện cảnh báo ngôi "bạn": người làm freelancer bị khách quỵt "tuần sau anh trả", rồi chính mình nói câu đó với người mới. Khung **2.39:1 (letterbox trên khung 16:9)**, 24 khung/giây, dài **76.3 giây**, nhịp cảnh do **độ dài giọng đọc thật** quyết định (`timing.json`).

## 2. Character bible

| Nhân vật | Kiểu | Nhận dạng cố định |
|---|---|---|
| Bạn (nhân vật chính, theo avatar chibi-plush của người dùng) | plush | đầu to tròn, thân nhỏ; tóc đen rối nhiều chùm nhọn; vương miện xanh nghiêng trái; cánh xám nhạt nhỏ sau lưng; tim xanh bay quanh; má ửng xanh, mắt đen có điểm sáng xanh; áo thun đen, quần ngắn đen, giày trắng |
| Bạn — cảnh 8 (cùng người, đổi vai) | plush | vest #2b2f3a + cà vạt đỏ #c0392b, vẫn giữ vương miện/tóc/cánh |
| Mẹ | blocky | áo hồng #e58aa6, tóc búi |
| Cậu sinh viên | blocky | áo xanh lá #3fa563, balô cam #e8a33b |
| 12 khách | blocky | 12 áo màu khác nhau; từ người thứ 4 trở đi (9 người) cầm biển "TUẦN SAU ANH TRẢ" |

Cảm xúc của nhân vật chính → mặt (decal): mong_doi = `smile`, binh_thuong = `flat`, that_vong = `sad`, kiet_suc = `tired`, soc = `shock`, nhech_mep = `smirk`.

## 3. Shot list

| # | Cảnh | Thời gian | Cỡ cảnh | Góc máy | Chuyển động | Ý đồ (vì sao chọn) |
|---|---|---|---|---|---|---|
| 1A | s1 | 4.4–7.9 s | WS | high | dolly in | giới thiệu bối cảnh: căn phòng nhỏ, người nhỏ |
| 1B | s1 | 7.9–11.4 s | MS | eye-level 3/4 | slow push-in | đồng cảm, hy vọng |
| 2A | s2 | 11.4–13.8 s | WS | high | static | đêm khuya, cô đơn, người nhỏ trong phòng |
| 2B | s2 | 13.8–16.7 s | MCU | eye-level 3/4 | push-in | căng thẳng tăng khi tin nhắn tới |
| 2C | s2 | 16.7–19.4 s | CU | reaction, eye-level | static | twist: nghe 'tuần sau anh trả' — phản ứng |
| 3A | s3 | 19.4–25.5 s | WS | eye-level slightly high | static (time-lapse) | khung cố định để thấy ngày–đêm lặp lại |
| 3B | s3 | 25.5–27.9 s | CU | high | static | yếu thế, kiệt sức lúc bình minh |
| 4A | s4 | 27.9–31.9 s | MS | eye-level 3/4 | static | chờ đợi, im lặng |
| 4B | s4 | 31.9–35.9 s | WS | high | dolly out | bị bỏ rơi: nhỏ dần trong căn phòng |
| 5A | s5 | 35.9–38.6 s | WS | eye-level side | truck right (theo mẹ đi vào) | đồng hành với người mẹ; hướng đi trái→phải |
| 5B | s5 | 38.6–40.1 s | Insert | high tabletop | static | đồ vật làm motif: hộp cơm còn ấm |
| 5C | s5 | 40.1–43.4 s | CU | eye-level 3/4 | static | phản ứng: nụ cười nhỏ |
| 6A | s6 | 43.4–47.8 s | WS group | eye-level frontal | truck right | tập thể: hàng người xếp ra từng người một |
| 6B | s6 | 47.8–51.4 s | MS | low | slow truck | choáng ngợp: biển 'tuần sau anh trả' đè lên bạn |
| 7A | s7 | 51.4–54.4 s | WS | high 3/4 | dolly in | người lạ bước vào không gian của bạn |
| 7B | s7 | 54.4–57.2 s | CU | eye-level 3/4 (nhìn sang phải) | static | lời xin: mắt cậu ấy nhìn sang phải |
| 7C | s7 | 57.2–59.9 s | CU | reverse, eye-level (nhìn sang trái) | static | shot ngược: bạn nhìn sang trái — khớp hướng nhìn |
| 8A | s8 | 59.9–64.3 s | WS | eye-level 3/4 | slow push-in | thiết lập: người cũ ngồi làm, bạn đứng sau |
| 8B | s8 | 64.3–67.8 s | MS | low | push-in | quyền lực: bạn nói câu quen thuộc |
| 8C | s8 | 67.8–70.9 s | ECU | reaction, frontal | slow push-in | twist: nhận ra mình vừa nói gì |

**Nhịp tăng dần cảm xúc:** mỗi cảnh đi Wide → Medium → Close-up (hoặc ngược lại khi cô lập nhân vật); cắt cứng trong cảnh, mờ đen 0,3 giây giữa các cảnh.

## 4. Floor plan (nhìn từ trên xuống, đơn vị stud)

```text
PHÒNG TRỌ (cảnh 1–5, 7)                         z = -9  tường sau (cửa sổ, áp phích, lịch)
  x:-13 ............................ +13
  [cây]      [cửa sổ]                    [GIƯỜNG x≈8.5, z≈-3.4]
         BẠN (x=-3, z=0.3) quay mặt +z (về phía máy)
         BÀN (x=-3, z=2.5) + LAPTOP (z=2.1, màn hình quay về phía bạn, lưng về máy)
  mẹ đi vào: x -14 → -6, z=3.9 (trái→phải) | sinh viên: x -18 → -9.5, z=6 (trái→phải)
  MÁY QUAY: luôn ở z > 0 (phía trước nhân vật), nửa x>0 cho cảnh 1–5, 7 → KHÔNG BAO GIỜ vượt trục

VĂN PHÒNG (cảnh 8, dời z = -200)
  sinh viên ngồi bàn (x=-6, z=0.2) | BẠN đứng sau (x=-1.5, z=-2.2) quay mặt về +z | máy ở z > 0
```

**Trục 180°:** cảnh 7 trục = đường nối sinh viên (trái) ↔ bạn (phải). Sinh viên nhìn **sang phải**, bạn quay **sang trái**: shot ngược 7C khớp hướng nhìn với 7B, máy không bao giờ qua trục.

## 5. Continuity sheet

| Cảnh | Giờ/ánh sáng | Cốc cà phê (motif) | Trang phục bạn | Ghi chú |
|---|---|---|---|---|
| s1 | ngày, sáng | 1 | áo thun đen | bong bóng "TỰ DO" chỉ ở đầu cảnh |
| s2 | đêm, đèn bàn + ánh màn hình | 2 | giống s1 | tin nhắn hiện đúng lúc giọng đọc nhắc tới |
| s3 | ngày–đêm lặp 3 lần → bình minh | 2→6 | giống s1 | gục dần: đầu cúi, mặt `tired` |
| s4 | ngày | 6 | giống s1 | 3 tin nhắn, "Đã xem" lần lượt |
| s5 | hoàng hôn | 6 | giống s1 | hộp cơm đặt ở (−5.4, 3.2, 3.0) và **còn đó** ở s7 |
| s6 | hoàng hôn, ngoài trời | — | giống s1 (nhỏ, tiền cảnh) | 12 khách, 9 biển |
| s7 | đêm | 6 | giống s1 | hộp cơm vẫn trên bàn; bạn quay sang trái |
| s8 | ngày, văn phòng | 4 | **vest + cà vạt đỏ** | cùng nhân vật, đổi vai |

## 6. Rà soát 10 lỗi continuity

| Lỗi | Cách xử lý trong clip |
|---|---|
| Đổi tay cầm đạo cụ | không có đạo cụ cầm tay đổi tay (hộp cơm do mẹ đặt xuống, không cầm lại) |
| Trang phục/tóc đổi | mọi cảnh lấy từ `characters.json`; chỉ đổi vest ở cảnh 8 có chủ đích |
| Ánh sáng/màu đổi | mỗi cảnh một chế độ ánh sáng ghi ở bảng trên |
| Đảo hướng nhìn/di chuyển | trái→phải ở s5, s7; trục 180° giữ nguyên |
| Đạo cụ tự dời | hộp cơm, cốc: vị trí cố định theo toạ độ trong mã |
| Thiết bị quay lọt khung / phản chiếu / logo | cảnh dựng bằng code: không có; không dùng logo Roblox |
| Đồng hồ sai giờ | không có đồng hồ trong cảnh |
| Tiếng nền đổi đột ngột | nền pad liên tục, hạ 50% dưới giọng đọc |

