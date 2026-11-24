# Mô phỏng 30 ngày — Lớp kinh tế tự trị (EAL)

> **Đây là MÔ PHỎNG với dữ liệu giả lập, không phải dự báo doanh thu.** Mã của EAL (xuất bản có duyệt, paywall, sổ cái, chu kỳ, tạm dừng khi lỗ, đề xuất tái đầu tư) là mã thật; người mua, chi phí token và hành vi người vận hành là giả định bên dưới. Chạy lại: `npm run economy:backtest` (hạt giống cố định nên kết quả không đổi).

## Giả định

- 30 ngày, một chu kỳ mỗi 6 giờ (120 chu kỳ). Giá mỗi báo cáo $0.50.
- Người mua ~ Poisson(λ) cho MỖI báo cáo MỖI chu kỳ; λ theo kịch bản: 0.02 / 0.15 / 0.6.
- Ngày 0 có 1 báo cáo; cứ 3 ngày xuất bản thêm một báo cáo (do người vận hành duyệt) **khi Scout đang chạy** — nên Scout bị tạm dừng thì danh mục không lớn thêm.
- Chi phí suy luận quy ước: 30k token mỗi chu kỳ khi Scout bật × $0,50/triệu token; hạ tầng quy ước $0,10/ngày; chi phí người vận hành ghi tay $0.15/ngày (hosting/tunnel).
- Lỗ N chu kỳ liên tiếp → Scout tự tạm dừng; người vận hành xem xét và tiếp tục sau 24 giờ (Scout bật lại như trước). So sánh N = 3 (đặc tả: 18 giờ) và N = 12 (3 ngày).
- Tái đầu tư: đề xuất tối đa một lần mỗi 24 giờ và chỉ khi khoản ≥ $1; mọi đề xuất được duyệt. `add_api_key` giả định nhu cầu +5% (tối đa +50%), `add_agent` rút ngắn chu kỳ xuất bản 1 ngày; khoản chi được ghi như chi phí người vận hành.

## Tổng hợp

| Kịch bản | λ | N | Doanh thu | Chi phí | Lãi/lỗ | Lượt bán | Báo cáo | Lần tự tạm dừng | Tái đầu tư (duyệt) | Sổ cái |
|---|---|---|---|---|---|---|---|---|---|---|
| Bi quan (gần như không ai mua) | 0.02 | 3 | $1.50 | $12.84 | **-$11.34** | 3 | 10 | 16 | 0 | nguyên vẹn (195 dòng) |
| Cơ sở (một ít khách đều đặn) | 0.15 | 3 | $54.50 | $23.14 | **$31.36** | 109 | 15 | 5 | 7 | nguyên vẹn (298 dòng) |
| Lạc quan (nội dung được tìm nhiều) | 0.6 | 3 | $452 | $131 | **$321** | 904 | 24 | 0 | 24 | nguyên vẹn (1126 dòng) |
| Bi quan (gần như không ai mua) | 0.02 | 12 | $1.50 | $13.44 | **-$11.94** | 3 | 9 | 6 | 0 | nguyên vẹn (174 dòng) |
| Cơ sở (một ít khách đều đặn) | 0.15 | 12 | $52.50 | $21.20 | **$31.30** | 105 | 14 | 0 | 6 | nguyên vẹn (281 dòng) |
| Lạc quan (nội dung được tìm nhiều) | 0.6 | 12 | $452 | $131 | **$321** | 904 | 24 | 0 | 24 | nguyên vẹn (1126 dòng) |

### Bi quan (gần như không ai mua) — N = 3

| Tuần | Doanh thu | Chi phí | Lãi/lỗ | Báo cáo đang bán | Cuối tuần |
|---|---|---|---|---|---|
| 1 | $0.00 | $2.98 | -$2.98 | 2 | đang chạy |
| 2 | $1.00 | $3.04 | -$2.04 | 5 | Scout tạm dừng |
| 3 | $0.00 | $2.98 | -$2.98 | 7 | Scout tạm dừng |
| 4 | $0.50 | $2.98 | -$2.48 | 9 | đang chạy |
| 5 | $0.00 | $0.86 | -$0.86 | 10 | đang chạy |

### Cơ sở (một ít khách đều đặn) — N = 3

| Tuần | Doanh thu | Chi phí | Lãi/lỗ | Báo cáo đang bán | Cuối tuần |
|---|---|---|---|---|---|
| 1 | $4.50 | $3.10 | $1.40 | 3 | đang chạy |
| 2 | $3.50 | $3.04 | $0.46 | 5 | đang chạy |
| 3 | $15.50 | $7.16 | $8.34 | 8 | đang chạy |
| 4 | $22.50 | $7.76 | $14.74 | 13 | đang chạy |
| 5 | $8.50 | $2.08 | $6.42 | 15 | đang chạy |

### Lạc quan (nội dung được tìm nhiều) — N = 3

| Tuần | Doanh thu | Chi phí | Lãi/lỗ | Báo cáo đang bán | Cuối tuần |
|---|---|---|---|---|---|
| 1 | $13.00 | $5.78 | $7.22 | 3 | đang chạy |
| 2 | $43.50 | $14.35 | $29.15 | 8 | đang chạy |
| 3 | $122 | $38.08 | $83.42 | 15 | đang chạy |
| 4 | $195 | $52.08 | $142 | 22 | đang chạy |
| 5 | $79.50 | $21.13 | $58.37 | 24 | đang chạy |

## Đọc kết quả thế nào

- **Kịch bản bi quan** (3 lượt bán): lỗ $11.34 trong 30 ngày, Scout tự tạm dừng 16 lần. Đúng thiết kế — hệ thống không đốt thêm token khi không có người mua — nhưng cũng cho thấy **doanh thu thật ban đầu rất có thể gần 0** và người vận hành sẽ phải can thiệp thường xuyên.
- **Ngưỡng N = 3 (18 giờ) gây nhiều lần tạm dừng không cần thiết lúc khởi động:** chi phí cố định luôn > 0 còn doanh thu đến thưa thớt, nên ở kịch bản cơ sở Scout bị tạm dừng 5 lần (mỗi lần cần người vận hành xem lại) trong khi kết quả tài chính gần như không đổi so với N = 12 (lãi/lỗ $31.36 so với $31.30; 0 lần tạm dừng). **Khuyến nghị: đặt `ECONOMY_NEGATIVE_CYCLES` ≥ 12 khi chạy thật** (mặc định vẫn là 3 theo đặc tả).
- Kết luận nhạy với λ — chỉ cần λ đổi vài lần là dấu của lãi/lỗ đổi. **Mô phỏng không có cơ sở để nói λ thật là bao nhiêu**; chỉ chạy thật mới biết.
- Chi phí quy ước nhỏ (xu/ngày) vì nguồn AI miễn phí; chi phí thật chủ yếu là hosting/tunnel và THỜI GIAN của người vận hành (không được tính).
- Không tính: thuế, phí cổng thanh toán (Stripe ~2,9% + $0,30 — với giá $0,50 phí này **ăn gần hết doanh thu**; x402 phí rất thấp), hoàn tiền, gian lận, thay đổi điều khoản của nền tảng. Kịch bản lạc quan (λ = 0,6) là **trần tưởng tượng**, không phải mục tiêu.

