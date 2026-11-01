# Bước 4 — CODE (Phase 1–6)

Tài liệu này ghi lại những gì **đã viết code và đã kiểm chứng chạy thật**
trong Bước 4. Mọi số liệu đánh dấu ✅ đều đo trên máy thật, không phải ước lượng.

---

## 1. Bản đồ Phase → file

| Phase | Nội dung | File chính | Trạng thái |
|---|---|---|---|
| 1 | Bố cục 3D đủ 9 phòng ban | `src/server/agents/departments.ts`, `src/client/main.ts` | ✅ |
| 2 | Nhân vật + màn hình vẽ hoạt động | `src/client/main.ts` (class `Screen`) | ✅ |
| 3 | Token Budget + HUD năng lượng + hạn mức thật | `src/server/budget/*` | ✅ |
| 4 | Điều phối tác vụ, duyệt trước, nhật ký hoạt động | `src/server/tasks/taskRunner.ts`, `src/server/activity/activityLog.ts` | ✅ |
| 5 | Tối ưu hiệu năng 3D | `src/client/main.ts` (geometry/material dùng chung, chỉ redraw khi đổi) | ✅ |
| 6 | Tích hợp & kiểm chứng an toàn | `tests/budget.test.ts` (21 test), `tests/safety.test.ts` (32 test) | ✅ |

---

## 2. Phase 1 — Bố cục 9 phòng ban

Định nghĩa phòng nằm ở `src/server/agents/departments.ts`, server gửi xuống client
qua `/api/departments` và WebSocket. Mỗi phòng có: tâm, kích thước, màu sàn,
trang trí đặc trưng.

```
              ┌──────────────────────┐
              │  8. THƯ VIỆN        │
              └──────────────────────┘
   ┌──────────┐  ┌──────────────┐  ┌──────────┐
   │ 2. KHÁCH │  │              │  │ 3. BÁN   │
   │    HÀNG  │  │ 1. GIAO VIỆC │  │   HÀNG   │
   └──────────┘  │  (bàn của bạn)│  └──────────┘
                 └──────────────┘
   ┌──────────┐  ┌──────────────┐  ┌──────────┐
   │4.MARKETING│ │              │  │ 5. TÀI   │
   └──────────┘  └──────────────┘  │  CHÍNH   │
                                    └──────────┘
              ┌──────────────────────┐
              │  7. LÀM VIỆC TỰ ĐỘNG│
              └──────────────────────┘
                    (6. ĐỘI AI ở giữa)
```

Test `tests/budget.test.ts` kiểm tra **các phòng không chồng lấn** và **mọi nhân
vật nằm trong ranh giới phòng** — tránh tình trạng nhân vật đứng lọt sang phòng
khác khi bố cục thay đổi.

---

## 3. Phase 2 — Nhân vật & màn hình

- 8 nhân vật: Mai (khách hàng), Long (bán hàng), Huy (marketing), Thu (tài chính),
  Ban (đội AI), An (nghiên cứu), Tri (thư viện), Minh (giao việc).
- Vòng tròn dưới chân đổi màu theo trạng thái (`idle`/`working`/`researching`/
  `learning`/`waiting`/`blocked`/`stopped`).
- Mỗi nhân vật có một màn hình máy tính vẽ bằng `CanvasTexture`: tên nhân vật,
  trạng thái, trang đang mở, nhật ký duyệt web gần nhất, và tác vụ đang chạy.
- Thanh điều hướng dưới bên trái để nhảy nhanh tới 9 phòng; click vào sàn phòng
  cũng mở bảng điều khiển của phòng đó.

---

## 4. Phase 3 — Token Budget (phần cốt lõi)

### 4.1. Ba nguồn số liệu, đánh dấu rõ

| Nguồn | Cách lấy | Độ chính xác |
|---|---|---|
| ✅ `cli-usage` | `usage` trong JSON output của `cursor-agent` | Chính xác tuyệt đối |
| ✅ `cursor-api` | `DashboardService/GetCurrentPeriodUsage` | Chính xác ở mức hạn mức gói |
| 🔢 `estimated` | Công thức ước lượng khi không đọc được | Ước lượng |

Cột `quota_source` trong bảng `token_ledger` cho biết dòng đó lấy từ đâu.

### 4.2. Chi phí cố định của một lượt Cursor CLI — số đo thật

> ⚠ Đây là điểm **quan trọng nhất** mà ước lượng ban đầu đã sai.

Lượt chạy thật ngày 2026-11-01 (prompt chỉ 21 token):

| Thành phần | Token |
|---|---|
| input | 10.356 |
| output | 558 |
| cache read | 33.664 |
| **tổng** | **44.578** |

Cursor CLI luôn nạp system prompt + định nghĩa tool + ngữ cảnh workspace.
Vì vậy `BASE_OVERHEAD` trong `src/server/budget/estimation.ts` cộng sẵn:
`input 10.000 · cacheRead 12.000 · output 800`.

Hệ quả: **ngưỡng hỏi người dùng phải nâng lên** so với bản thiết kế ban đầu.

| Ngưỡng | Thiết kế ban đầu | Hiện tại | Lý do |
|---|---|---|---|
| Chạy luôn | ≤ 20.000 | ≤ 60.000 | một lượt rẻ nhất cũng ~23.000 token |
| Hỏi người dùng | > 80.000 | > 120.000 | tránh hỏi oan cho tác vụ bình thường |
| Trần mỗi tác vụ | 50.000 | 200.000 | 50.000 sẽ chặn gần hết tác vụ thật |
| Trần ngày | — | 150.000 | ~3 lượt CLI/ngày |
| Trần tuần | — | 900.000 | |

### 4.3. Bảng giá — đã đối chiếu với số liệu Cursor trả về

| Model | input | cache read | output |
|---|---|---|---|
| Grok 4.7 / 4.6 / 4.5 | $2/M | $0.5/M | $6/M |
| Composer 2.5 | $0.5/M | $0.2/M | $2.5/M |

Đối chiếu: `22970×$2/M + 25472×$0.5/M + 503×$6/M = $0.061694`
→ `totalCents = 6.1694`, **khớp chính xác** số Cursor trả về.
Test `tests/budget.test.ts` khóa lại phép tính này.

### 4.4. Đọc hạn mức thật

`src/server/budget/cursorQuota.ts` gọi 3 endpoint nội bộ của Cursor:

```
POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage
POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetAggregatedUsageEvents
POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetPlanInfo
```

Kết quả đo được trên máy:

| Trường | Giá trị |
|---|---|
| Gói thật | `Free` (dù IDE cache `stripeMembershipType: pro`) |
| Đã dùng | `totalPercentUsed = 2–3%` |
| Chu kỳ | `2026-10-27` → `2026-11-27` (theo tháng, reset ngày 27) |
| `includedLimitZero` | `true` → gói Free **không có trần token** |
| Nâng cấp | `pro` / `$20/mo` |

Vì gói Free không có trần token, `TokenBudget` **không** dùng quota để khoá
spend. Hạn mức nội bộ của ứng dụng là lớp bảo vệ thứ hai, độc lập với Cursor.

Server poll mỗi 60 giây (`cursorQuotaPollMs`), cũng lưu snapshot vào ledger
(`cursor_percent_used`) để sau này biết tác vụ nào rơi vào thời điểm nào.

### 4.5. Token đăng nhập

`src/server/budget/cursorAuth.ts` đọc session token từ
`%APPDATA%\Cursor\User\globalStorage\state.vscdb` (khóa `cursorAuth/accessToken`)
hoặc từ biến môi trường `CURSOR_AUTH_TOKEN`.

**Token không bao giờ** được ghi vào log, ledger, file cấu hình hay commit.
Tiến trình con chạy với `HOME` riêng (`workspace/.cursor-home`) nên CLI không
đọc được khoá/credential nào khác của máy.

---

## 5. Phase 4 — Điều phối tác vụ

`src/server/tasks/taskRunner.ts` — mỗi tác vụ đi qua đúng 5 bước:

```
1. ƯỚC LƯỢNG  → 2. HỎI DUYỆT? → 3. KIỂM TRA NGÂN SÁCH → 4. GỌI LLM → 5. GHI LEDGER
```

Trạng thái tác vụ: `pending → awaiting-approval → running → done | failed | rejected`.

- Bước 2 chỉ bỏ qua khi chế độ tự động là *Tự chủ cao*.
- Bước 3 kiểm tra đồng thời: ví học, trần ngày, trần tuần.
- Bước 5 ghi đủ `input/output/cacheRead/cacheWrite`, chi phí, model, thời gian,
  % hạn mức Cursor tại thời điểm chạy, và nguồn số liệu.

**Hộp thoại duyệt hiện ngay trong cảnh 3D** (không phải popup riêng), giống hộp
thoại xin quyền — đúng như thiết kế §7.4.

Khi tác vụ thất bại, hệ thống **tự tạo đề xuất sửa lỗi** (self-dev) — chỉ tạo
diff để bạn duyệt, agent không tự sửa mã nguồn.

---

## 6. Phase 5 — Hiệu năng

| Kỹ thuật | Hiệu ứng |
|---|---|
| Geometry/material dùng chung (`GEO`, `MAT`) | Giảm số draw call khi tạo 9 phòng + 8 nhân vật |
| `CanvasTexture` chỉ redraw khi nội dung đổi | Màn hình không vẽ lại mỗi 2 giây nếu không có gì mới |
| `setPixelRatio(min(dpr, 1.75))` | Giảm tải GPU trên màn hình 4K |
| `PCFSoftShadowMap` + shadow map 1024 | Bóng mềm với chi phí thấp |
| `requestAnimationFrame` với `delta`-based animation | Nhân vật dao động theo thời gian thực |

---

## 7. Phase 6 — Tích hợp & kiểm chứng

### 7.1. API mới

| Route | Mô tả |
|---|---|
| `GET /api/departments` | 9 phòng + nhân vật + chi tiêu hôm nay |
| `GET /api/tasks` · `POST /api/tasks` | Danh sách / tạo tác vụ |
| `POST /api/tasks/:id/approve` `/reject` `/cancel` | Duyệt, từ chối, hủy |
| `GET /api/budget/ledger` | Nhật ký chi tiêu token + tổng theo ví & phòng ban |
| `GET /api/quota` · `POST /api/quota/refresh` | Hạn mức Cursor (đọc trực tiếp) |
| `GET /api/llm/status` | Cursor CLI đã cài? đã đăng nhập? model nào? |
| `GET /api/activity` | Nhật ký hoạt động |

### 7.2. Kết quả kiểm chứng chạy thật

Tác vụ thật gửi tới `POST /api/tasks`:

```
status       : done
tokens       : 44.578  (in 10.356 · out 558 · cache 33.664)
cost         : 4.0892 cents
quota_source : cli-usage
duration     : 18.758 ms → 18,7 giây
kết quả      : liệt kê đúng 3 file trong docs/
```

Ledger ghi đúng, `TokenBudget` trừ đúng, HUD hiển thị 30%.

### 7.3. Bộ test

```
tests/safety.test.ts   32 test   (quyền truy cập + chống prompt injection)
tests/budget.test.ts   21 test   (ước lượng + ngân sách + ledger + bố cục 3D)
────────────────────────────────────
                       53 test   tất cả PASS
```

Các test mới đáng chú ý:

- Ước lượng của tác vụ ngắn **≥ 20.000 token** (không lạc quá xa thực tế).
- Tác vụ vượt trần → `awaiting-approval` và **ledger rỗng** (chưa gọi LLM).
- Từ chối → tác vụ kết thúc, ledger vẫn rỗng.
- Ví học bị chặn khi tổng đã chạm trần ngày.
- Bảng giá khớp `6.1694` cents.
- 9 phòng không chồng lấn; mọi nhân vật nằm trong phòng.

---

## 8. API của Cursor CLI — cờ nào thật sự tồn tại

Đã chạy `agent --help` trên máy. Các cờ dùng trong code:

| Cờ | Trạng thái | Ghi chú |
|---|---|---|
| `-p` / `--print` | ✅ thật | chạy không tương tác |
| `--output-format json` | ✅ thật | trả JSON kèm `usage` |
| `--model <id>` | ✅ thật | gói Free chỉ nhận `auto` |
| `--mode plan` \| `ask` | ✅ thật | giới hạn thao tác |
| `--workspace <path>` | ✅ thật | giới hạn thư mục làm việc |
| `--trust` | ✅ thật | bắt buộc, nếu không CLI yêu cầu xác nhận |
| `--add-dir <path>` | ✅ thật | thư mục phụ (mặc định không dùng) |
| `--sandbox enabled` | ⚠ **không dùng** | lỗi trên Windows: *"Sandbox requires macOS or Linux"* |

Lý do không dùng `--sandbox`: trên Windows, cô lập đạt được bằng
`--workspace` trỏ vào sandbox do ứng dụng tạo + `--mode ask` + `HOME` riêng +
timeout cứng + biến môi trường đã lọc.

---

## 9. Việc còn lại

- [ ] Đưa bảng giá vào `docs/03-ngan-sach-token.md` (hiện mới chỉ ở file code).
- [ ] Bản đồ hạn mức theo *ngày* của Cursor là *tháng*; HUD hiện hiển thị cả hai
      (ngày của ứng dụng + chu kỳ của Cursor) nhưng chưa gộp lại thành một con số.
---

## 10. Hai lỗi phát hiện khi kiểm chứng & cách sửa

Cả hai lỗi đều chỉ lộ ra khi chạy thật, không thấy được khi đọc code.

### 10.1. Thiếu `--trust` → mọi tác vụ fail

Cursor CLI từ chối chạy trong thư mục chưa được tin cậy:

```
? Workspace Trust Required
  Cursor Agent can execute code and access files in this directory.
  Do you trust the contents of this directory?
```

Sửa: thêm `--trust` vào `buildArgs()`. Workspace luôn là sandbox do ứng dụng
tạo (`workspace/`), nên tin cậy được. **Không** dùng `--force`/`--yolo` — chúng
cho phép chạy mọi lệnh mà không hỏi.

### 10.2. Ước lượng lệch 22 lần

Ước lượng đầu tiên cho một prompt 21 token là **2.030 token**; thực tế là
**44.578 token** — lệch 22 lần. Nguyên nhân: Cursor CLI luôn nạp system prompt
+ định nghĩa tool + ngữ cảnh workspace, không phụ thuộc độ dài prompt.

Sửa: thêm `BASE_OVERHEAD` vào công thức, và **hiệu chỉnh lại toàn bộ ngưỡng**
(xem bảng ở §4.2). Nếu giữ nguyên trần 50.000/tác vụ thì gần như mọi tác vụ
thật đều bị chặn.

> Bài học: với CLI có chi phí cố định, phải **đo một lượt thật** rồi mới đặt
> ngưỡng. Suy đoán từ độ dài prompt là sai.

---

## 11. Kiểm chứng từng hạng mục

| Hạng mục | Cách kiểm chứng | Kết quả |
|---|---|---|
| 9 phòng ban render | `/api/departments` + ảnh chụp trình duyệt | ✅ |
| Nhân vật + màn hình | Screenshot, phân tích pixel (895 màu phân biệt) | ✅ |
| HUD năng lượng | `Runtime.evaluate` đọc nội dung `#budget-widget` | ✅ 30%, Cursor Free 3% |
| Tác vụ chạy thật | `POST /api/tasks` | ✅ done, 44.578 token, 4.0892 cents |
| Ledger ghi đúng | `GET /api/budget/ledger` | ✅ 2 dòng, `cli-usage` |
| Hộp thoại duyệt | Tác vụ 272.800 token → `awaiting-approval`, hộp thoại hiện trong cảnh | ✅ |
| Từ chối | `POST /api/tasks/:id/reject` → rejected, ledger không đổi | ✅ |
| Emergency stop | `POST /api/emergency-stop` → cả 8 nhân vật `stopped` | ✅ |
| Nhật ký hoạt động | `GET /api/activity` | ✅ |
| Panel Cài đặt | Đọc nội dung: gói Free, 3%, reset 27/11/2026, nâng cấp pro $20/mo | ✅ |
| Typecheck | `npx tsc --noEmit` | ✅ sạch |
| Test | `npx vitest run` | ✅ 55/55 |

### Ảnh chụp màn hình

Ảnh toàn cảnh được lưu tại [`media/office.png`](media/office.png) và nhúng vào
README. Xác minh ảnh không bị lỗi bằng phân tích pixel trực tiếp (không phải
mở bằng mắt):

| Chỉ số | Giá trị | Ý nghĩa |
|---|---|---|
| Kích thước | 1470 × 1042 | ảnh hợp lệ |
| Số màu phân biệt | 1.038 | cảnh 3D thật, không phải màn hình đen |
| Độ sáng trung bình | 31,1 / 255 | có nội dung, tương phản vừa phải |

Các kiểm tra chức năng còn lại dựa vào đọc nội dung DOM qua `Runtime.evaluate`
(HUD năng lượng, hộp thoại duyệt, nội dung từng panel).

