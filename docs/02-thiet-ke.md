# Bước 2 — Thiết kế "Văn phòng 3D"

> Ngày thiết kế: 2026-11-01 · Dựa trên `docs/01-phan-tich.md` · **Chưa viết code ở bước này.**

---

## 1. Sơ đồ kiến trúc

```
┌──────────────────────────────────────────────────────────────────────┐
│  GIAO DIỆN 3D  (three.js thuần, WebGL)                              │
│  ├── Camera (xoay, zoom, click phòng)                               │
│  ├── Nhân vật AI (di chuyển, ngồi máy tính, hoạt động)              │
│  ├── Màn hình trên bàn → vẽ nhật ký duyệt web / trạng thái          │
│  ├── Bảng điều khiển phòng (panel bên phải)                         │
│  ├── Hộp thoại xin quyền (ngay trong cảnh)                          │
│  └── Nút DỪNG KHẨN CẤP (luôn hiện)                                │
└────────────────────────────┬─────────────────────────────────────────┘
                             │  WebSocket (realtime, 2 chiều)
┌────────────────────────────▼─────────────────────────────────────────┐
│  LỚP ĐIỀU PHỐI AGENT                                                │
│  ├── Router (chọn agent theo model, fallback keyword)               │
│  ├── Hàng đợi tác vụ + trạng thái (rảnh/đang làm/chờ duyệt/lỗi)    │
│  ├── Bộ tách việc (một yêu cầu → nhiều bước → nhiều agent)         │
│  └── Điều khiển tự động (3 mức) + Dừng khẩn cấp                    │
└──┬──────────────┬──────────────┬──────────────┬─────────────────────┘
   │              │              │              │
┌──▼─────────┐ ┌──▼─────────┐ ┌──▼──────────┐ ┌▼────────────────────┐
│ LỚP THỰC   │ │ LỚP        │ │ LỚP TRÌNH   │ │ LỚP NGÂN SÁCH       │
│ THI TÁC VỤ │ │ TRI THỨC   │ │ DUYỆT       │ │ TOKEN               │
│           │ │            │ │ SANDBOX     │ │                     │
│ - Tool    │ │ - Thư viện │ │             │ │ - Hạn mức ngày/tuần │
│   registry│ │   Tri thức │ │ - Chrome    │ │ - Ví học riêng      │
│ - Mỗi    │ │   (SQLite)  │ │   profile   │ │ - Tự hạ cấp model   │
│   tool có │ │ - Ghi chú   │ │   RIÊNG     │ │ - Ước lượng trước   │
│   hậu quả │ │ - Kỹ năng   │ │ - Allowlist │ │ - Cache/tóm tắt     │
│   an toàn │ │ - Bài học   │ │ - Blocklist │ │ - Cảnh báo 80%      │
│ - Sandbox │ │ - Nhìn lại  │ │ - Chặn nội  │ │ - Khoá 100%         │
│   tool    │ │ - Độ tin    │ │   dung nhạy  │ │ - Nhật ký theo tác  │
│           │ │   cậy +    │ │   cảm       │ │   vụ                │
│           │ │   link nguồn│ │ - Chặn tải  │ │                     │
└───────────┘ └────────────┘ └─────────────┘ └──────────────────────┘
                                   │
┌──────────────────────────────┐   ┌──────────────────────────────────┐
│  LỚP QUYỀN TRUY CẬP          │   │  LỚP LƯU TRỮ                    │
│  - Path guard (realpath)     │   │  - SQLite (tri thức, nhật ký)   │
│  - Chặn cứng (~/.ssh, .env)  │   │  - JSON (quyền, cấu hình)       │
│  - Xin quyền trong 3D        │   │  - JSONL (nhật ký truy cập)     │
│  - Cấp/thu hồi quyền        │   │  - .env (khoá API)              │
│  - Nhật ký mọi lần truy cập  │   │  - workspace/ (thư mục riêng)   │
└──────────────────────────────┘   └──────────────────────────────────┘
```

### Luồng dữ liệu một tác vụ

```
Bạn gõ yêu cầu
   │
   ├─▶ Router chọn agent (model → keyword → agent mặc định)
   │
   ├─▶ Token Budget: ước lượng chi phí → nếu > ngưỡng thì hỏi bạn
   │
   ├─▶ Agent chạy tool:
   │     ├─ Web tool  → Lớp trình duyệt sandbox → đọc trang → bọc dữ liệu
   │     ├─ File tool → Lớp quyền truy cập → có quyền? → đọc/ghi
   │     └─ KB tool   → Thư viện Tri thức
   │
   ├─▶ Trạng thái gửi qua WebSocket → nhân vật trong 3D đổi hoạt ảnh
   │
   ├─▶ Có việc rủi ro? → hộp thoại trong 3D → chờ bạn duyệt
   │
   ├─▶ Xong → agent viết bản "nhìn lại" → lưu Thư viện Tri thức
   │
   └─▶ Trừ token vào Token Budget + ghi nhật ký chi tiêu
```

---

## 2. Ánh xạ "phòng ban" → không gian 3D

Bố cục: tầng trệt là **Phòng Giao việc** (trung tâm, bàn của bạn). Bốn phòng
chức năng xếp hai bên. Hai phòng đặc biệt nằm ở góc xa.

```
                        ┌──────────────────────────┐
                        │   PHÒNG THƯ VIỆN        │
                        │   tri thức · kỹ năng    │
                        │   bài học · nhìn lại     │
                        └──────────────────────────┘

   ┌───────────────┐  ┌────────────────────┐  ┌───────────────┐
   │  PHÒNG       │  │                    │  │  PHÒNG        │
   │  KHÁCH HÀNG  │  │   PHÒNG GIAO VIỆC │  │  BÁN HÀNG     │
   │  (tổng đài)  │  │   Bàn của bạn      │  │  (phễu)       │
   └───────────────┘  │   + bảng tiến độ   │  └───────────────┘
                      └────────────────────┘
   ┌───────────────┐  ┌────────────────────┐  ┌───────────────┐
   │  PHÒNG       │  │                    │  │  PHÒNG        │
   │  MARKETING   │  │                    │  │  TÀI CHÍNH    │
   │  (mạng xã hội)│  └────────────────────┘  └───────────────┘
   └───────────────┘

                        ┌──────────────────────────┐
                        │  PHÒNG LÀM VIỆC TỰ ĐỘNG │
                        │  máy tính riêng, sandbox  │
                        └──────────────────────────┘
```

| # | Phòng | Nhân vật phụ trách | Công cụ được dùng | Dữ liệu hiển thị | Trạng thái |
|---|---|---|---|---|---|
| 1 | **Giao việc** | Bạn (không phải AI) | Nhập lệnh, gọi agent | Danh sách việc đang chạy, tiến độ | — |
| 2 | **Khách hàng** | `Mai` — Chăm sóc KH | Đọc/ghi CRM, soạn tin nhắn | Hộp thư, số KH chờ, tin nhắn đã soạn | rảnh / đang làm / chờ duyệt |
| 3 | **Bán hàng** | `Long` — Phễu | Đọc pipeline, ghi báo cáo | Các giai đoạn phễu, giá trị, tỉ lệ | rảnh / đang làm / lỗi |
| 4 | **Marketing** | `Huy` — Nội dung | Soạn bài, lịch đăng, nghiên cứu xu hướng | Lịch đăng, hiệu suất bài, gợi ý chủ đề | rảnh / đang làm / chờ duyệt |
| 5 | **Tài chính** | `Thu` — Sổ sách | Đọc file CSV, tính toán, báo cáo | Doanh thu, chi phí, biểu đồ cột | rảnh / đang làm / lỗi |
| 6 | **Đội AI** | `Ban` — Điều phối | Router, chia việc, theo dõi agent khác | Roster agent, lịch sử chạy, hội thoại | rảnh / đang làm |
| 7 | **Làm việc tự động** | `An` — Nghiên cứu | Trình duyệt sandbox, tìm kiếm, đọc web | **Màn hình máy tính vẽ nhật ký duyệt web thật** | rảnh / đang duyệt / cảnh báo |
| 8 | **Thư viện** | `An` — Tri thức | Đọc/ghi KB, viết nhìn lại | Kệ sách (ghi chú / kỹ năng / bài học), bảng "nhìn lại" | rảnh / đang ghi |
| 9 | *(Dự án mở rộng)* | | | | |

### Mô tả trạng thái nhân vật (dùng chung cho mọi phòng)

| Trạng thái | Nghĩa | Hình ảnh trong 3D | Màu nhãn |
|---|---|---|---|
| `idle` | Rảnh, chờ việc | Đứng/ngồi yên, hơi thở | xám |
| `working` | Đang chạy tác vụ | Gõ bàn phím, màn hình nhấp nháy | xanh lá |
| `researching` | Đang duyệt web | Ngồi trước máy, màn hình hiện trang web | xanh dương |
| `learning` | Đang tự học | Ngồi ở Thư viện, sách mở | tím |
| `waiting` | **Chờ bạn duyệt** | Đứng giơ tay, có dấu `!` | vàng |
| `blocked` | Bị chặn / lỗi | Ngồi thu, dấu `?` | đỏ |
| `stopped` | Bị dừng khẩn cấp | Đứng yên, màn hình tắt | xám đậm |

---

## 3. Luồng giao tác

### 3.1 Bạn ra lệnh

1. **Chọn phòng hoặc nhân vật** → click vào phòng trong 3D hoặc bấm tên nhân vật.
2. **Gõ yêu cầu** trong bảng điều khiển của phòng đó (hoặc dùng giọng nói nếu
   trình duyệt hỗ trợ `SpeechRecognition`).
3. **Hệ thống tách việc:**
   - Yêu cầu đơn giản → giao thẳng cho agent của phòng.
   - Yêu cầu phức tạp → `Ban` (Phòng Đội AI) tách thành các bước, giao cho
     nhiều agent chạy song song, ghép kết quả.
4. **Tiến độ hiện trong 3D:** nhân vật đổi trạng thái, màn hình trên bàn vẽ
   việc đang làm, thanh tiến độ ở Phòng Giao việc.
5. **Kết quả về bàn của bạn** để duyệt — bạn chọn *Chấp nhận* / *Sửa & chạy lại* /
   *Bỏ*.

### 3.2 Ví dụ cụ thể

| Bạn nói | Hệ thống làm |
|---|---|
| "Mai, khách Vũ hỏi về giá gói Pro" | `Mai` đọc file CRM trong `/workspace` → tìm khách Vũ → soạn tin nhắn → **dừng ở trạng thái `waiting`** → bạn duyệt trước khi gửi. |
| "Tìm 5 bài về SEO năm 2026 cho Long" | `An` vào Phòng Làm việc tự động → trình duyệt sandbox → tìm kiếm → đọc 5 trang → đối chiếu → lưu vào Thư viện kèm link nguồn + độ tin cậy → báo lại. |
| "Tổng hợp chi tháng này" | `Thu` đọc CSV trong `/workspace` → tính toán → trả biểu đồ cột + bảng. Không cần duyệt. |
| "Thêm tool tra Google vào" | Agent tạo **đề xuất thay đổi** (diff) → bạn duyệt trong bảng Đề xuất → áp dụng → có nút **Hoàn tác**. |
| "Đọc file C:\Users\X\.ssh\config" | **Chặn cứng** → agent bị chặn ngay, bạn được báo; phải tự bật thủ công trong Cài đặt. |

### 3.3 Vòng đời một tác vụ (state machine)

```
            ┌────────────────────────────────────────┐
            │                                        │
   idle ──▶ dispatched ──▶ working ──▶ needs_review ──▶ done
     ▲           │            │              │
     │           │            ▼              ▼
     │           │        researching    rejected
     │           │            │              │
     │           │            ▼              ▼
     │           │         learning ──▶ idle
     │           │            │
     │           ▼            ▼
     └────── failed ◀──── blocked
```

---

## 4. Quy tắc an toàn — cái gì cần duyệt, cái gì tự chạy

### 4.1 Nhóm hành động

| Hành động | Mức | Lý do |
|---|---|---|
| Đọc/ghi file **trong** `/workspace` | 🟢 Tự chạy | Vùng làm việc riêng của agent |
| Đọc/ghi file **ngoài** `/workspace` | 🔴 **Duyệt** | Chạm vào máy bạn |
| Xóa file / ghi đè | 🔴 **Duyệt** (kể cả trong `/workspace`) | Không thể hoàn tác |
| Duyệt web (đọc trang) | 🟢 Tự chạy | Chỉ đọc |
| Tìm kiếm web | 🟢 Tự chạy | Chỉ đọc |
| Tải file về máy | 🔴 **Duyệt** | Rủi ro mã độc |
| Chạy file đã tải | 🔴 **Duyệt + chặn mặc định** | Rủi ro cao nhất |
| Đăng nhập tài khoản của bạn | 🔴 **Duyệt + chặn mặc định** | Không lộ phiên đăng nhập |
| Điền form có thông tin cá nhân | 🔴 **Duyệt** | Rò rỉ dữ liệu |
| Thanh toán / chuyển khoản | 🔴 **Duyệt + chặn mặc định** | Mất tiền |
| Đăng bài / gửi tin cho khách | 🔴 **Duyệt** | Đại diện bạn nói chuyện ra ngoài |
| Thêm ghi chú / kỹ năng / bài học vào KB | 🟢 Tự chạy | Chỉ ghi trong hệ thống |
| Tinh chỉnh prompt của chính nó | 🟢 Tự chạy (lưu theo phiên bản) | Nằm trong vùng riêng của agent |
| Thêm tool / thư viện / đổi cấu hình | 🟡 **Đề xuất + duyệt** | Đề xuất diff, bạn duyệt mới áp dụng |
| Sửa mã nguồn ứng dụng | 🟡 **Đề xuất + duyệt + hoàn tác** | Không tự sửa trực tiếp |
| Tăng ngân sách token / mở rộng quyền | 🟡 **Đề xuất + duyệt** | Không tự cấp quyền cho mình |
| Sửa lớp Token Budget / quy tắc an toàn / cơ chế xin quyền | ⛔ **KHÔNG BAO GIỜ** | Bất biến — không có đường ghi từ agent |
| Tự cấp quyền cho chính mình | ⛔ **KHÔNG BAO GIỜ** | Bất biến |

### 4.2 Nguyên tắc bất di bất dịch (đóng băng ở mã nguồn)

1. **Token Budget** không nhận lệnh sửa từ agent — cần token nội bộ do server giữ.
2. **Quy tắc an toàn** nằm trong `policy.ts` + `pathGuard.ts`; các cờ nguy hiểm
   (`allowUserLogin`, `allowPosting`, `allowPayments`, `allowDownloads`) bị ép về
   `false` **ngay trong hàm nhận cấu hình**, không phải ở tầng UI.
3. **Vùng chặn cứng** chỉ mở được qua `manualUnlock()` — hàm này chỉ có thể gọi
   từ API của người dùng, không có đường nào từ agent.
4. **Mọi thao tác file** đều đi qua `GuardedFs` → `PermissionManager`. Không có
   đường nào đọc/ghi file trực tiếp mà bỏ qua lớp này.

### 4.3 Chống prompt injection

```
Nội dung trang web
   │
   ├─▶ bọc marker  <<<UNTRUSTED_WEB_CONTENT>>> … <<<END_UNTRUSTED_WEB_CONTENT>>>
   ├─▶ quét mẫu lệnh ẩn (ignore previous, bỏ qua chỉ dẫn, system prompt…)
   ├─▶ nếu phát hiện → hạ độ tin cậy (0.3) + cảnh báo trong 3D + ghi nhật ký
   └─▶ không bao giờ có API "thi hành nội dung trang"
```

Nội dung web **chỉ** đi vào ngữ cảnh dưới dạng dữ liệu để agent đọc và tóm tắt.

### 4.4 Ngắt vòng lặp kẹt

- Giới hạn **vòng lặp**, **thời gian chạy**, **số trang duyệt** cho mỗi tác vụ
  (mặc định 8 / 120s / 15 trang ở mức *Cân bằng*).
- Nếu cùng một lỗi lặp lại 3 lần → tác vụ dừng, báo bạn kèm gợi ý đổi cách.

---

## 5. Mô hình Token Budget (chi tiết cho Bước 3)

### 5.1 Cấu trúc ví

```
TokenBudget (đóng băng, cấu hình cần token nội bộ)
  ├── Ví chính   : dùng cho tác vụ bạn giao
  └── Ví học     : dùng cho giờ học tự chọn  (mặc định 10% hạn mức ngày)
```

| Giới hạn | Mặc định | Chỉnh được |
|---|---|---|
| Hạn mức ngày | 500.000 token | ✅ |
| Phần trăm cho tự học | 10% | ✅ (0–50%) |
| Hạn mức tuần | 3.500.000 token | ✅ |
| Hạn mức mỗi phòng ban | không giới hạn riêng | ✅ |
| Hạn mức mỗi tác vụ | 50.000 token | ✅ |
| Ngưỡng cảnh báo | 80% | ✅ |
| Ngưỡng khoá | 100% | cố định |

### 5.2 Tự hạ cấp (routing model)

| Độ khó tác vụ | Model | Ví dụ |
|---|---|---|
| Trích xuất, phân loại, đếm | **rẻ & nhanh** (`mini`/`flash`) | Tóm tắt 5 kết quả tìm kiếm |
| Phân tích, so sánh nhiều nguồn | trung bình | Đối chiếu số liệu 3 nguồn |
| Viết code, quyết định phức tạp | **mạnh** | Viết lại module, thiết kế kiến trúc |

### 5.3 Trước khi chạy tác vụ lớn

```
Ước lượng token (input + output dự kiến)
   │
   ├─ ≤ 20.000          → chạy luôn, không hỏi
   ├─ 20.000 – 80.000   → chạy luôn nhưng hiện "ước lượng ~X token" trên 3D
   └─ > 80.000         → HỎI BẠN trước khi chạy (hiện hộp thoại trong 3D)
```

### 5.4 Chống đốt token

| Kỹ thuật | Cách làm |
|---|---|
| Cache | Cache kết quả tìm kiếm / nội dung trang theo URL + hash |
| Tóm tắt ngữ cảnh | Mỗi lượt chỉ đưa 5 lượt gần nhất + tóm tắt cũ vào LLM |
| Giới hạn vòng lặp | `maxIterations` mỗi tác vụ |
| Cắt nội dung | Chỉ lấy 6.000 ký tự đầu mỗi trang; tóm tắt trước khi lưu |
| Dừng khi chạm ngưỡng | 80% cảnh báo · 100% khoá |

### 5.5 Nhật ký chi tiêu

Bảng `token_ledger` lưu mỗi lượt: thời gian · tác vụ · phòng ban · agent · model ·
token vào/ra · cache hit · tổng · loại ví (chính/học).

---

## 6. Lưu trữ

| Dữ liệu | Nơi lưu | Ghi chú |
|---|---|---|
| Tri thức (ghi chú / kỹ năng / bài học) | `.data/knowledge.db` (SQLite) | có `sources[]`, `confidence`, `from_web` |
| Bản "nhìn lại" | `.data/knowledge.db` (SQLite) | theo `task_id` |
| Quyền đã cấp | `.data/permissions.json` | xem & thu hồi bất cứ lúc nào |
| Nhật ký truy cập file | `.data/access-log.jsonl` | thời gian + nhân vật + hành động |
| Nhật ký duyệt web | `.data/browser-log.jsonl` | url, tiêu đề, trạng thái, cảnh báo |
| Cấu hình | `.data/config.json` | allowlist, hạn mức, mức tự động |
| Khoá API | `.env` | **không commit** |
| Thư mục làm việc agent | `./workspace/` | duy nhất agent được chạm |
| Đề xuất thay đổi | `.data/proposals.json` | kèm bản sao lưu để hoàn tác |
| Prompt phiên bản | `.data/prompts/` | `v1`, `v2`… quay lại được |

---

## 7. Giao diện 3D — chi tiết

### 7.1 Tương tác
| Hành động | Kết quả |
|---|---|
| Kéo chuột | Xoay camera |
| Lăn chuột | Zoom |
| Click phòng | Mở bảng điều khiển phòng đó |
| Click nhân vật | Xem trạng thái + lịch sử + nút giao việc |
| Click màn hình máy tính | Xem nhật ký duyệt web đầy đủ |
| Click kệ sách ở Thư viện | Mở ghi chú/kỹ năng/bài học tương ứng |
| Phím `Esc` | Đóng bảng |

### 7.2 Thanh trên cùng (luôn hiện)
- **NÚT DỪNG KHẨN CẤP** — đỏ, lớn, bên trái. Bấm 1 lần dừng toàn bộ agent.
- **3 mức tự động** — Chỉ hỏi / Cân bằng / Tự chủ cao.
- **Thanh năng lượng token** — % hôm nay + % ví học, đổi màu theo ngưỡng.

### 7.3 Bảng bên phải (mở theo tab)
| Tab | Nội dung |
|---|---|
| Nhật ký duyệt web | Danh sách trang agent đã mở, lọc theo agent, cảnh báo injection |
| Phòng Thư viện | Ghi chú / kỹ năng / bài học / bảng nhìn lại |
| Quyền truy cập | Quyền đang cấp (thu hồi được) · nhật ký truy cập · mở thủ công vùng chặn |
| Đề xuất thay đổi | Danh sách diff · Duyệt & áp dụng · Từ chối · Hoàn tác |
| Cài đặt | Allowlist/blocklist · hạn mức token · chủ đề tự học · bật thủ công vùng chặn |

### 7.4 Hộp thoại trong cảnh 3D
Khi agent cần quyền, hộp thoại hiện **ở giữa phía dưới màn hình 3D** (không phải popup riêng) gồm:
- Nhân vật nào xin · đường dẫn chính xác · để làm gì
- 4 nút: **Cho phép một lần** · **Cho phép thư mục này, chỉ đọc** · **Cho phép đọc và ghi** · **Từ chối**
- Không bấm trong 45 giây → mặc định **Từ chối** (an toàn)

---

## 8. Cấu trúc mã nguồn dự kiến

```
src/
  server/
    main.ts                 khởi động server, đăng ký route + WebSocket
    config.ts               đọc/ghi cấu hình
    llm.ts                  lớp gọi LLM (OpenAI-compatible), có cache
    routes/                 express router, chia theo nhóm
    agents/
      registry.ts           danh sách nhân vật + trạng thái
      router.ts             chọn agent (model → keyword → mặc định)
      taskQueue.ts          hàng đợi tác vụ, tách việc
      tools.ts              registry của tool, mỗi tool có hậu quả an toàn
    browser/
      sandboxBrowser.ts     trình duyệt Playwright profile riêng
      policy.ts             allowlist/blocklist + phát hiện rủi ro
      search.ts             tìm kiếm (DuckDuckGo HTML, không cần API key)
    knowledge/
      knowledgeBase.ts      SQLite: note / skill / lesson / retrospective
      index.ts              tìm kiếm tri thức
    learning/
      researchEngine.ts     nghiên cứu + đối chiếu nhiều nguồn
      scheduler.ts          giờ học tự chọn
    budget/
      tokenBudget.ts        lớp Token Budget (đóng băng)
      ledger.ts             nhật ký chi tiêu theo tác vụ
      router.ts             tự hạ cấp model theo độ khó
    security/
      permissions.ts        cấp/thu hồi quyền, nhật ký
      guardedFs.ts          mọi thao tác file
      approvals.ts          hàng đợi duyệt (cho 3D)
    sandbox/
      pathGuard.ts          chuẩn hóa đường dẫn, chặn cứng
    selfdev/
      proposalStore.ts      đề xuất thay đổi + hoàn tác
      promptVersions.ts     prompt theo phiên bản
  client/
    main.ts                 khởi tạo three.js
    scene/                  floor, phòng, nhân vật, màn hình
    ui/                     panel, hộp thoại, thanh trên
    net/                    WebSocket client
```

---

## 9. Lộ trình Giai đoạn 4 (đã cập nhật theo Bước 3B)

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 1 | Khung dự án + cảnh 3D tĩnh, camera, click mở panel | ✅ có một phần |
| 2 | Agent tối thiểu + 1–2 phòng hoạt động thật, trạng thái nhân vật | 🔶 |
| 3 | Lớp Token Budget đầy đủ (Bước 3) | 🔶 |
| 3B | Sandbox web · Thư viện Tri thức · quyền thư mục · đề xuất thay đổi · dừng khẩn cấp · 3 mức tự động · bộ test | ✅ **xong** |
| 4 | Thêm các phòng còn lại, cơ chế duyệt việc, nhật ký hoạt động | ⬜ |
| 5 | Tinh chỉnh hiệu năng 3D, README tiếng Việt | ⬜ |

---

## 10. Câu hỏi cần bạn xác nhận trước Bước 3

1. **Nhà cung cấp LLM** — OpenAI / Anthropic / proxy OpenAI-compatible? (quyết định cách định giá token và tự hạ cấp model)
2. **Hạn mức Cursor** — có thể ứng dụng dùng trực tiếp hạn mức gói Cursor của bạn không, hay buộc phải dùng API key riêng? Tôi sẽ tra tài liệu Cursor; nếu chưa chắc sẽ ghi rõ.
3. **Chrome sandbox** — xác nhận dùng Chrome headless profile riêng (đã tìm thấy Chrome trên máy bạn).
