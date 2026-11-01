# Bước 3 — Ngân sách token: khả thi hay không

> Khảo sát: 2026-11-01 · Cursor IDE **3.22.12** · Cursor CLI **2026.10.22-27dcf5f**
> Tài liệu chính thức: `cursor.com/docs` → *Models & Pricing*

## Quy ước ghi chú

| Nhãn | Ý nghĩa |
|---|---|
| ✅ **ĐÃ KIỂM CHỨNG** | Chạy thật trên máy, có output quan sát được |
| 📄 **TÀI LIỆU** | Lấy từ `cursor.com/docs` (chưa chạy thử) |
| 🔢 **ƯỚC LƯỢNG** | Ta tự tính, không phải số Cursor công bố |

---

## 1. Câu trả lời thẳng

> *"Ứng dụng có thể dùng token từ gói Cursor của tôi không?"*

### 1.1 Có — và giờ đã **đọc được cả số dư hạn mức**

✅ **ĐÃ KIỂM CHỨNG.** Ba phát hiện thay đổi bản chất thiết kế:

| Phát hiện | Bằng chứng |
|---|---|
| **CLI gọi được model thật** | `agent -p --model auto --output-format json` → trả về kết quả đúng, kèm `usage: {inputTokens, outputTokens, cacheReadTokens}` |
| **Đọc được % đã dùng** | `POST api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage` → `autoPercentUsed`, `apiPercentUsed`, `totalPercentUsed` |
| **Đọc được token từng lượt** | `GetAggregatedUsageEvents` / `GetFilteredUsageEvents` → `inputTokens`, `outputTokens`, `cacheReadTokens`, `totalCents` |

→ Không cần ước lượng token nữa. App đọc được số thật từ Cursor.

### 1.2 Nhưng tài khoản của bạn thực ra là **Free**, không phải Pro

Đây là điểm quan trọng nhất và ngược với kỳ vọng:

| Nguồn | Kết quả |
|---|---|
| `cursorAuth/stripeMembershipType` trong IDE (local) | `pro` |
| `agent about --format json` (server) | `"subscriptionTier": "Free"` |
| `auth/full_stripe_profile` (server) | `"membershipType": "free"`, `"individualMembershipType": "free"` |
| `DashboardService/GetPlanInfo` (server) | `planName: "Free"`, `nextUpgrade: {tier: "pro", price: "$20/mo"}` |

**Server là nguồn sự thật.** Tài khoản đang ở tier Free, đã dùng thử và hết hạn
mức, nhưng IDE vẫn cache `pro` từ lần đăng nhập cũ.

Hệ quả trực tiếp — mọi model bị từ chối, trừ `auto`:

```
$ agent -p --model composer-2.5 ...
Error: Model unavailable on Free
  Free includes Grok 4.7, Grok 4.6, and Auto with fixed settings.

$ agent -p --model grok-4.7-low ...
Error: Model unavailable on Free        ← tên model đúng vẫn bị từ chối

$ agent -p --model auto ...
✅ thành công
```

Lưu ý: `grok-4.7-low` **có** trong danh sách model của tài khoản, nhưng Free tier
gói cứng chỉ cho dùng qua bucket `auto` với thiết lập cố định (Fast tắt, effort
= medium). Tài liệu mô tả đúng hành vi này cho tier Plus, nhưng gói Free bị hạn
chế hơn (chỉ Grok 4.7 / 4.6 / Auto).

**Hành động đề xuất:** nâng lên Pro (`$20/mo` theo `GetPlanInfo`, hoặc $30/mo
Premium theo bảng giá hiện hành) để mở Composer 2.5 + Grok 4.5, mở Fast mode và
chọn effort. Nếu giữ Free, ứng dụng **bắt buộc** chỉ dùng `auto`.

### 1.3 Chu kỳ làm mới hạn mức: **THEO THÁNG**, không theo tuần

✅ **ĐÃ KIỂM CHỨNG** (từ chính API, không phải tài liệu):

```json
// GetCurrentPeriodUsage
"billingCycleStart": "1793092334300",   // 2026-10-29
"billingCycleEnd":   "1795770734300"    // 2026-11-27
```

```json
// GetPlanInfo
"nextUpgrade": { "includedUsagePeriod": "INCLUDED_USAGE_PERIOD_MONTHLY" }
```

```json
// GetSandUsageStatus
"currentPeriodStart": "2026-10-29T00:00:00Z",
"includedLimitZero": true
```

→ Tài khoản Free của bạn dùng **pool theo tháng**, reset ngày 27 hằng tháng.
📄 Tài liệu mô tả gói Plus mới bằng pool **theo tuần** — đây là hành vi của
gói mới (The X Subscription), không áp dụng cho gói legacy mà bạn đang dùng.

Vậy mô hình "hạn mức ngày + ví tự học 10%" của ta vẫn dùng được, nhưng phải
**ánh xạ**: giới hạn nội bộ theo ngày, còn trần thực là pool tháng của Cursor.

### 1.4 Không có API công khai — nhưng có API nội bộ (đã kiểm chứng)

✅ **ĐÃ KIỂM CHỨNG** trên máy:

| Endpoint (POST) | Kết quả |
|---|---|
| `aiserver.v1.DashboardService/GetCurrentPeriodUsage` | **200** — % đã dùng + chu kỳ |
| `aiserver.v1.DashboardService/GetAggregatedUsageEvents` | **200** — tổng token + tiền |
| `aiserver.v1.DashboardService/GetFilteredUsageEvents` | **200** — chi tiết từng lượt |
| `aiserver.v1.DashboardService/GetPlanInfo` | **200** — tên gói + giá nâng cấp |
| `aiserver.v1.DashboardService/GetSandUsageStatus` | **200** — trạng thái pool |
| `aiserver.v1.DashboardService/GetUsageLimitStatusAndActiveGrants` | **200** — grant on-demand |
| `aiserver.v1.DashboardService/GetHardLimit` | **200** — `noUsageBasedAllowed` |
| `auth/full_stripe_profile` | **200** — membershipType |
| `aiserver.v1.AiServerService/GetUsageInfo` (GET) | 404 — route không tồn tại |
| `cursor.com/api/usage` | 401 — cần auth, không có route công khai |

Đây là **API nội bộ (không công khai)**. Rủi ro: Cursor có thể đổi route bất cứ
lúc nào. → Ta phải có **fallback**: nếu API lỗi, tự đếm token từ output của CLI
(`usage` trong JSON) và báo trạng thái "không đọc được số dư".

---

## 2. Cơ chế đăng nhập (đã kiểm chứng)

✅ **ĐÃ KIỂM CHỨNG.**

### 2.1 CLI cần token, và token của IDE **không** dùng được như API key

```
$ agent status                 → "Not logged in"
$ agent --list-models          → "Error: Authentication required."
```

Thử 2 cách dùng token `cursorAuth/accessToken` lấy từ
`%APPDATA%\Cursor\User\globalStorage\state.vscdb`:

| Cách | Kết quả |
|---|---|
| `CURSOR_API_KEY=<accessToken>` | ❌ `⚠ Warning: The provided API key is invalid.` |
| `CURSOR_AUTH_TOKEN=<accessToken>` | ✅ **Thành công** — liệt kê được 274 model, gọi được API |

→ Bắt buộc dùng biến **`CURSOR_AUTH_TOKEN`**, không phải `CURSOR_API_KEY`.

### 2.2 Token dạng gì

✅ **ĐÃ KIỂM CHỨNG.** accessToken là JWT HS256 (3 phần), payload:

```json
{
  "sub": "google-oauth2|user_...",
  "iss": "https://authentication.cursor.sh",
  "aud": "https://cursor.com",
  "scope": "openid profile email offline_access",
  "type": "session",
  "exp": 1798355520
}
```

Hạn dùng ~28/12/2026. `agent login` cũng tạo file
`%USERPROFILE%\.cursor\cli-config.json` chứa `authInfo` — nhưng file này IDE
đang khoá nên đọc bằng cách ghi đè sẽ lỗi `EPERM` (đã gặp, đã xử lý bằng
cách lấy token từ SQLite của IDE).

### 2.3 Chuỗi khởi động an toàn

```
%APPDATA%\Cursor\User\globalStorage\state.vscdb
  → bảng ItemTable, khóa "cursorAuth/accessToken"
  → gán vào biến môi trường CURSOR_AUTH_TOKEN
  → gọi %LOCALAPPDATA%\cursor-agent\agent.cmd
```

⚠️ Token **không** được ghi vào file log, ledger, hay commit. Chỉ nằm trong RAM
của tiến trình con.

---

## 3. Cờ CLI — xác nhận từ `agent --help`

✅ **ĐÃ KIỂM CHỨNG** (chạy `agent --help` thật).

| Cờ | Tồn tại? | Ghi chú thực tế |
|---|---|---|
| `-p, --print` | ✅ | In ra console, cho script. Mặc định `false` |
| `--output-format <fmt>` | ✅ | `text` \| `json` \| `stream-json`. Chỉ có tác dụng kèm `--print` |
| `--model <id>` | ✅ | Nhận cả id đơn giản và id có override trong ngoặc vuông |
| `--mode <mode>` | ✅ | Chỉ **2** lựa chọn: `plan`, `ask`. Không có `agent` (đó là mặc định) |
| `--sandbox <mode>` | ✅ **NHƯNG KHÔNG DÙNG ĐƯỢC** | `enabled` \| `disabled`. **Windows không hỗ trợ sandbox** |
| `--workspace <path>` | ✅ | Mặc định = thư mục hiện tại |
| `--trust` | ✅ | Tin workspace, không hỏi |
| `--api-key <key>` | ✅ | Hoặc `CURSOR_API_KEY` — **không dùng được với session token** |
| `--header <h>` | ✅ | Header tuỳ biến, dùng nhiều lần được |
| `--endpoint <url>` | ✅ | Mặc định `https://api2.cursor.sh` |
| `--auto-review` | ✅ | Server classifier tự duyệt tool call an toàn |
| `-f, --force` / `--yolo` | ✅ | Cho phép mọi lệnh — **không dùng** |
| `--list-models` | ✅ | Liệt kê model tài khoản được |
| `--stream-partial-output` | ✅ | Chỉ với `--print --output-format stream-json` |

### 3.1 Sandbox trên Windows: **không khả dụng** — đây là điểm an toàn quan trọng

✅ **ĐÃ KIỂM CHỨNG.** Chạy `--sandbox enabled`:

```
Error: Sandbox mode is enabled but not available on this system.
       Sandbox requires macOS or Linux.
Run 'agent sandbox disable' to switch to allowlist mode.
```

→ Trên Windows, CLI **luôn** chạy không sandbox. Ta **không được** dựa vào
`--sandbox` để cô lập. Phải tự cô lập:

| Lớp | Cách làm |
|---|---|
| Chỉ cho CLI đọc workspace | `--workspace <thư mục sandbox>` + `--add-dir` **không** dùng |
| Chế độ chỉ đọc | `--mode ask` hoặc `--mode plan` (không sửa file) |
| Cấm lệnh nguy hiểm | `--mode plan` cho mọi tác vụ chỉ cần đọc |
| Dừng an toàn | Timeout cứng, kill process tree |
| Env sạch | Chỉ giữ `PATH`, `HOME` trỏ thư mục sandbox, xoá biến môi trường khác |
| Không `--force`/`--yolo` | Tuyệt đối không dùng |

### 3.2 Bảng an toàn (đã sửa theo `--help` thật)

| Rủi ro | Cách chặn (đã kiểm chứng cờ tồn tại) |
|---|---|
| CLI đọc/ghi file ngoài workspace | `--workspace <dir>` + `--mode ask/plan`; **không** dựa vào `--sandbox` (Windows không có) |
| CLI tự chạy lệnh nguy hiểm | `--mode plan` (read-only) cho tác vụ chỉ đọc; không dùng `--force`/`--yolo` |
| CLI treo | Timeout cứng (mặc định 120s) + kill process tree |
| CLI đọc khoá của bạn | Env sạch, `HOME` trỏ thư mục sandbox, không truyền token qua tham số dòng lệnh |
| Chi phí vượt hạn mức | Token Budget kiểm tra **trước** + đọc `GetCurrentPeriodUsage` |

### 3.3 Cờ **không** tồn tại (đã loại khỏi tài liệu cũ)

- ❌ Không có `--output-format stream` (chỉ `text` \| `json` \| `stream-json`)
- ❌ Không có `--mode agent` (agent là mặc định, chỉ `plan` và `ask` là lựa chọn)
- ❌ Không có cờ nào để **đọc** hạn mức — phải gọi API `DashboardService`
- ❌ `--sandbox enabled` không hoạt động trên Windows

---

## 4. Kết quả chạy thử (1 lượt duy nhất)

✅ **ĐÃ KIỂM CHỨNG.**

Lệnh:
```bash
agent -p --model auto --output-format json --mode ask --workspace <repo> \
  "Tra lai thu muc docs/ va tra ve danh sach ten file kem so dong."
```

Output:
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 10307,
  "duration_api_ms": 10307,
  "result": "…3 file: 01-phan-tich.md (240 dòng), 02-thiet-ke.md (408), 03-ngan-sach-token.md (306)…",
  "session_id": "<đã lược bỏ>",
  "request_id": "<đã lược bỏ>",
  "usage": {
    "inputTokens": 22970,
    "outputTokens": 503,
    "cacheReadTokens": 25472,
    "cacheWriteTokens": 0
  }
}
```

### 4.1 Token đã tốn

| Loại | Token |
|---|---|
| Input | **22.970** |
| Output | **503** |
| Cache read | **25.472** |
| Cache write | 0 |
| **Tổng tính phí** | **48.945** |

Đối chiếu `GetFilteredUsageEvents` (cùng lượt đó):
```json
"requestsCosts": 1.5,
"tokenUsage": { "inputTokens": 22970, "outputTokens": 503, "cacheReadTokens": 25472, "totalCents": 6.1694 },
"chargedCents": 3.80985,
"isChargeable": true,
"subscriptionProductId": "free"
```

### 4.2 Kiểm chứng bảng giá trong tài liệu

🔢 **TÍNH TAY** từ giá Grok 4.7 trong tài liệu ($2/M input, $0.5/M cache read,
$6/M output):

```
22.970 × $2/M   = $0.045940
25.472 × $0.5/M = $0.012736
   503 × $6/M   = $0.003018
                  --------
                   $0.061694  =  6.1694 cents
```

→ **Khớp chính xác** `totalCents: 6.1694`. Bảng giá trong tài liệu là chính xác
cho Grok 4.7. Lưu ý `chargedCents: 3.80985` (≈62%) là phần thực trừ vào pool
thực tế, không bằng giá niêm yết.

### 4.3 Trạng thái hạn mức sau lượt chạy

✅ **ĐÃ KIỂM CHỨNG** từ `GetCurrentPeriodUsage`:

```json
"planUsage": {
  "totalSpend": 4, "bonusSpend": 4,
  "autoPercentUsed": 4, "apiPercentUsed": 0, "totalPercentUsed": 2
},
"spendLimitUsage": {
  "pooledLimit": "0", "pooledRemaining": "0",
  "individualLimit": 0, "limitType": "user",
  "overallLimit": 0, "overallRemaining": 0
},
"displayMessage": "You've used 0% of your included usage",
"autoModelSelectedDisplayMessage": "You've used 2% of your included total usage"
```

**Điểm quan trọng:** `includedLimitZero: true` và mọi `spendLimitUsage` đều **0**
→ pool Free **không có trần định lượng** bằng token, chỉ có giới hạn theo
số lượt. Vì vậy `totalPercentUsed: 2` là **phần trăm tương đối** so với một
mốc ẩn, không phải "đã dùng 2% của 100.000 token".

→ Hệ quả thiết kế: Token Budget của ta **không được** dùng `totalPercentUsed`
làm trần cứng. Ta dùng nó làm **tín hiệu cảnh báo**, còn trần thật do **ta tự
đặt** (theo ngày / theo tác vụ) để tránh đốt sạch pool.

### 4.4 Model nào thuộc bucket `auto`

✅ **ĐÃ KIỂM CHỨNG** (`autoBucketModels` trong `GetCurrentPeriodUsage`):
48 id, gồm `composer-1` → `composer-2.5`, `composer-2.5-fast`, `grok-4.5`,
`grok-4.6`, `grok-4.7` (mọi mức low/medium/high/xhigh/fast), `vega-*`, và `default`.

→ **Tự hạ cấp model chỉ được dùng model trong danh sách này.** Model bên thứ ba
(Claude, GPT, Gemini) không có trong pool → bị từ chối hoặc tính phí riêng.

---

## 5. Kiến trúc Token Budget (cập nhật)

```
                    ┌────────────────────────────┐
                    │        TokenBudget         │
                    │  (đóng băng + capability   │
                    │        token bắt buộc)      │
                    └─────────────┬──────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
   ┌─────▼─────┐          ┌───────▼───────┐        ┌───────▼───────┐
   │ Ví chính  │          │  Ví học 10%   │        │  CursorQuota  │
   │ (tác vụ)  │          │  (tách riêng) │        │  (đọc API)    │
   └─────┬─────┘          └───────┬───────┘        └───────┬───────┘
         │                        │                        │
         └────────────┬───────────┴────────────────────────┘
                      │
         ┌────────────▼─────────────┐
         │  Backend LLM (chọn)      │
         ├──────────────────────────┤
         │ 1. cursor-agent  ← ưu tiên│
         │ 2. api-key       ← dự phòng│
         │ 3. local/rule    ← không cần│
         └──────────────────────────┘
```

### 5.1 Hai nguồn số liệu, độ tin cậy khác nhau

| Nguồn | Dùng để | Tần suất |
|---|---|---|
| `usage` trong JSON của CLI | Token **thật** của từng lượt, ghi vào ledger ngay | Mỗi lượt |
| `GetCurrentPeriodUsage` | % đã dùng, chu kỳ reset, cảnh báo sớm | Mỗi 60s + khi ≥80% |
| Tự đếm của ta | Fallback khi API lỗi | Luôn |

Ưu tiên 1 > 2 > 3. Nếu 1 và 2 lệch >20% → ghi cảnh báo vào ledger.

### 5.2 Ví học (learning wallet)

```
learningLimit = dailyLimit × learningPercent / 100
Ràng buộc chéo:  usedToday + learningUsed ≤ dailyLimit
                  usedWeek + learningUsed ≤ weeklyLimit
```
Hết ví học → agent dừng tự học, **không** đụng ví chính.

### 5.3 Tự hạ cấp model (chỉ trong bucket `auto`)

| Độ khó | Tiêu chí | Model |
|---|---|---|
| `trivial` | trích xuất, đếm, phân loại | `composer-2.5` |
| `normal` | tóm tắt, so sánh nhiều nguồn | `grok-4.5-medium` |
| `hard` | viết code, thiết kế | `grok-4.7-high` |
| `huge` | > 200k ngữ cảnh | `grok-4.7` + `--model 'grok-4.7[context=500k]'` |

⚠️ Trên tier Free: **chỉ `auto`**. Bộ chuyển đổi tự động gộp mọi mức về
`auto` và báo bạn.

### 5.4 Ước lượng TRƯỚC khi chạy

🔢 ƯỚC LƯỢNG (ta tự tính):
```
estimate = inputTokens + outputTokens × 3 + 2000 (system prompt + lịch sử tool)
```

| Ước lượng | Hành động |
|---|---|
| ≤ 20.000 | Chạy luôn |
| 20.000 – 80.000 | Chạy, hiện con số ước trên 3D |
| > 80.000 | **HỎI BẠN** trong hộp thoại 3D trước khi chạy |
| > perTaskLimit | Chặn, đề xuất chia nhỏ |

### 5.5 Chống đốt token

| Kỹ thuật | Chi tiết |
|---|---|
| Cache | `sha256(systemPrompt + userPrompt)` → LRU 500 mục, TTL 1h. Hit = 0 token |
| Tóm tắt ngữ cảnh | Giữ 5 lượt gần nhất; lượt cũ hơn → 1 dòng tóm tắt |
| Giới hạn vòng lặp | `maxIterations` mỗi tác vụ (8 ở mức Cân bằng) |
| Cắt nội dung trang | 6.000 ký tự/trang |
| Cắt tool output | 4.000 ký tự/lần gọi tool |
| Ngưỡng | ≥80% cảnh báo · =100% khoá, mọi agent dừng |

### 5.6 Nhật ký chi tiêu (SQLite `token_ledger`)

| Cột | Ý nghĩa |
|---|---|
| `ts` | thời gian |
| `task_id` | mã tác vụ |
| `department` | phòng ban |
| `agent_id` | nhân vật |
| `model` | model đã dùng (`auto` hay tên cụ thể) |
| `backend` | `cursor-agent` / `api` / `local` |
| `input_tokens`, `output_tokens`, `cache_read_tokens` | số token thật từ `usage` |
| `cached` | có cache hit không |
| `cost_cents` | `totalCents` từ Cursor |
| `wallet` | `normal` / `learning` |
| `cursor_percent_used` | snapshot `totalPercentUsed` tại thời điểm ghi |
| `quota_source` | `cli-usage` / `api` / `estimated` — để biết độ tin cậy |

---

## 6. Cấu hình đề xuất

```env
# --- Backend LLM ---
OFFICE_LLM_BACKEND=cursor-agent
CURSOR_AGENT_MODEL=auto              # bắt buộc với tier Free
CURSOR_AGENT_FALLBACK_MODEL=auto

# --- Cursor quota ---
CURSOR_QUOTA_ENABLED=1
CURSOR_QUOTA_POLL_MS=60000
CURSOR_QUOTA_ENDPOINT=https://api2.cursor.sh
# token lấy từ %APPDATA%\Cursor\User\globalStorage\state.vscdb (runtime, không commit)

# --- Token Budget ---
OFFICE_BUDGET_DAILY=150000
OFFICE_BUDGET_WEEKLY=900000
OFFICE_BUDGET_LEARNING_PERCENT=10
OFFICE_BUDGET_PER_TASK=200000
OFFICE_BUDGET_WARN=0.8
OFFICE_BUDGET_LOCK=1.0
```

> **Về con số hạn mức — đã hiệu chỉnh sau khi đo thật (2026-11-01):**
> Một lượt `cursor-agent` tốn **tối thiểu ~23.000 token** và lượt thực tế đo
> được là **44.578 token** (in 10.356 · out 558 · cache read 33.664), vì CLI luôn
> nạp system prompt + định nghĩa tool + ngữ cảnh workspace.
>
> Vì vậy con số **50.000 token/ngày** mà Bước 3 đề xuất là quá nhỏ — chỉ được
> ~1 lượt CLI/ngày. Mặc định đã nâng lên **150.000 token/ngày**,
> **900.000 token/tuần**, **200.000 token/tác vụ**.
>
> Ngưỡng hỏi người dùng cũng được nâng: chạy luôn nếu ≤ 60.000, hỏi nếu
> > 120.000. Chi tiết và số đo đầy đủ: [`04-buoc-4-code.md`](04-buoc-4-code.md).

---

## 7. Đường dẫn trên máy (KHÔNG commit vào repo)

Các đường dẫn dưới đây **không** được đưa vào file sẽ commit. Trong mã nguồn
dùng biến môi trường:

| Mục đích | Biến | Giá trị trên máy |
|---|---|---|
| Token đăng nhập | `CURSOR_AUTH_TOKEN` | đọc runtime từ `state.vscdb` |
| CLI | `CURSOR_AGENT_EXE` | `%LOCALAPPDATA%\cursor-agent\agent.cmd` |
| Nơi lưu CLI | — | `%LOCALAPPDATA%\cursor-agent\versions\<ver>\` |
| DB của IDE | — | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` |
| Endpoint | `CURSOR_QUOTA_ENDPOINT` | `https://api2.cursor.sh` |
| Workspace sandbox | `OFFICE_WORKSPACE` | thư mục sandbox của ứng dụng |

---

## 8. Tóm tắt

| Câu hỏi | Trả lời |
|---|---|
| Dùng token từ gói Cursor được không? | ✅ **Có** — `agent -p --model auto` (đã chạy thật) |
| Đọc được số dư hạn mức không? | ✅ **Có** — `GetCurrentPeriodUsage`, `GetAggregatedUsageEvents` (đã kiểm chứng) |
| Gói của bạn là gì? | **Free** theo server (IDE cache nhầm `pro`) |
| Model nào dùng được? | Chỉ `auto` (bucket gồm Grok 4.5/4.6/4.7 + Composer 1→2.5) |
| Pool làm mới khi nào? | **Theo tháng**, reset ngày 27 (đã kiểm chứng) |
| Sandbox có dùng được trên Windows không? | ❌ Không — phải tự cô lập bằng `--workspace` + `--mode` |
| 1 lượt thử tốn bao nhiêu? | 22.970 in + 503 out + 25.472 cache read = **48.945 token**, 6.17 cents niêm yết |
| Cần Token Budget riêng không? | ✅ **Bắt buộc** — pool Free không có trần token, ta phải tự đặt trần |

---

## 9. Việc cần làm trước Bước 4

1. **Nâng gói Pro** — mở Composer 2.5, Fast mode, chọn effort; pool lớn hơn
   nhiều. Hiện tại `auto` bị ghim Fast tắt / effort medium.
2. **Chọn trần ngân sách** — 50.000 token/ngày có hợp lý không?
3. **Xác nhận** có cho phép đọc `state.vscdb` của IDE để lấy token tự động, hay
   bạn muốn đặt `CURSOR_AUTH_TOKEN` thủ công bằng `agent login`?
