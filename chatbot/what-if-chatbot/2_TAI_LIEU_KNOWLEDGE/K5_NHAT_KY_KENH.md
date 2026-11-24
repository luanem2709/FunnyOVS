# K5 – NHẬT KÝ KÊNH (chống trùng ý tưởng)

Ưu tiên tự ghi nhớ các tập đã viết bằng bộ nhớ của nền tảng (nếu có). Vì nhiều nền tảng không nhớ giữa các cuộc trò chuyện, luôn giữ thêm bản dự phòng: **file NHAT_KY_KENH.txt do bạn tạo và khách giữ**; khách gửi lại khi bạn không nhớ các tập cũ.

## Khi nào cập nhật
Sau mỗi tập (sau bước 3, hoặc sau SEO nếu có): thêm 1 mục vào `tap_da_lam`, thêm 10 ý tưởng đã đưa ra (trừ ý đã làm) vào `y_tuong_da_de_xuat`, thêm id bổ sung vào `bo_sung_da_tao`. Giao lại **toàn bộ** file (không chỉ phần mới), tên `NHAT_KY_KENH.txt`.

## Định dạng (JSON trong file .txt)
```json
{"kenh": "tên kênh nếu khách cho biết",
 "cap_nhat": "2026-11-23",
 "tap_da_lam": [
  {"ngay": "2026-11-23", "slug": "pause_10_seconds", "tieu_de": "What if you could pause time for 10 seconds a day?",
   "tien_de": "pause time 10s/day, each pause erases 1 minute of memory", "loai": "superpower with a cost",
   "nhan_vat": ["nam", "linh", "tuan", "hung", "minh"], "boi_canh": ["bedroom2", "dodgeball", "classroom2", "cafeteria", "cafe"],
   "bo_sung": [], "do_dai_phut": 2, "tieu_de_seo": "", "ghi_chu": ""}],
 "y_tuong_da_de_xuat": ["What If You Could Hear Your Crush's Thoughts?", "..."],
 "bo_sung_da_tao": [{"pack": "pause_10_seconds", "sets": ["x_rooftop"], "props": ["x_hourglass"], "casts": ["x_maya"]}],
 "so_thich_kenh": {"do_dai_mac_dinh": 12, "bo_hinh": "pop", "giong": "", "chu_de_khach_thich": [], "chu_de_tranh": []}}
```

## Cách dùng khi đưa ý tưởng
- Không lặp `tien_de` hoặc `loai` + tình huống chính của các tập trong 10 tập gần nhất.
- Ý tưởng đã đề xuất mà khách chưa chọn có thể đưa lại tối đa 1 lần, ghi chú "(đề xuất lại)".
- Học `so_thich_kenh`: khách hay chọn loại nào thì đưa nhiều hơn; khách nói tránh gì thì tránh.
- Bối cảnh bổ sung đã tạo: nếu DANH_SACH có id đó (đã cài) thì dùng lại; nếu DANH_SACH không có (khách chưa cài hoặc cài máy khác) thì nhắc khách chạy lại file cai_dat_shot_builder.bat cũ, hoặc tạo lại gói.
