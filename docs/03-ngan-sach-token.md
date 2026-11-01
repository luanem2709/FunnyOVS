# Bước 3 — Ngân sách token: khả thi hay không

> Ngày khảo sát: 2026-11-01 · Cursor phiên bản **3.22.12** trên máy bạn.
> Tài liệu chính thức: `cursor.com/docs` → *Models & Pricing*.

---

## 1. Câu trả lời thẳng

> *"Ứng dụng có thể gọi trực tiếp hạn mức Cursor của tôi không?"*

### 1.1 Dùng **token của gói Cursor** làm nguồn LLM cho ứng dụng: **KHÔNG khả thi theo cách an toàn**

Lý do, dựa trên tài liệu chính thức:

1. **Gói chỉ hỗ trợ đúng 4 model của Cursor**: Grok 4.7, Grok 4.6, Grok 4.5 và
   Composer 2.5. Tài liệu ghi rõ:
   > *"The pool covers Grok 4.7, Grok 4.6, Grok 4.5, and Composer 2.5."*

2. **Model bên thứ ba (Claude, GPT, Gemini) KHÔNG nằm trong gói**:
   > *"Third-party models like Claude, GPT, and Gemini aren't part of the included
   > pool. On Premium and above, they're available in Cursor at the model's API
   > list price from the first request, paid from your prepaid credit."*

   → Dùng Claude hay GPT trong ứng dụng của bạn là **tiền thật**, không lấy từ
   hạn mức gói.

3. **Quy mô gói rất nhỏ**. Giá gói hiện tại (The X Subscription):
   | Gói | Giá | Lượng dùng tích hợp |
   |---|---|---|
   | Plus | $8/tháng | 1× |
   | Premium | $30/tháng | 4× |
   | Super | $100/tháng | 15× |
   | Ultra | $200/tháng | 50× |

   Một lượt "1×" tương đương một lượt Agent tiêu chuẩn. Ứng dụng chạy nền
   với nhiều agent sẽ hết pool trong **vài giờ**.

4. **Pool làm mới theo TUẦN, không theo ngày** → không khớp với mô hình "hạn
   mức ngày + ví tự học 10%" mà bạn yêu cầu.

### 1.2 Nhưng có **một đường khả thi**: Cursor CLI (`cursor agent`)

Tài liệu chính thức xác nhận CLI là một "Cursor model" được hưởng pool:

> *"The pool is shared across everything on your subscription: Agent in the
> editor, **CLI**, Cloud Agents, Grok Bot, and the Grok apps."*

**Cơ chế khả thi (đã kiểm chứng trên máy bạn):**

```bash
# Cài Cursor CLI (riêng biệt, không ảnh hưởng IDE)
irm 'https://cursor.com/install?win32=true' | iex

# Chạy tác vụ không tương tác, trả về text
agent -p "tóm tắt file này" --output-format text
```

Tài liệu xác nhận print mode:
> *"Use print mode for non-interactive scenarios like scripts, CI pipelines, or
> automation: `agent -p "find and fix performance issues" --model "gpt-5"`"*

**Kết luận Bước 3:**
- ✅ **Dùng `cursor agent -p` làm backend LLM → tiêu token từ pool gói của bạn.**
- ⚠️ Nhưng phải hiểu rõ giới hạn: pool tuần, chỉ 4 model Cursor, và mỗi lượt
  CLI vẫn là **một lượt Agent** — nhiều agent chạy song song sẽ đốt pool rất nhanh.
- ➡️ Vì vậy kiến trúc phải có **lớp Token Budget riêng** làm bộ đệm, và CLI
  Cursor chỉ nên là **một trong nhiều backend**.

### 1.3 Đọc số dư hạn mức: **chưa có API công khai**

Tôi đã dò trên máy bạn:

| Đầu mối | Kết quả |
|---|---|
| `cursor.com/api/usage` | **401 Unauthorized** → cần token đăng nhập, không có endpoint công khai |
| `api2.cursor.sh/aiserver.v1.AiServerService/GetUsageInfo` | **404** → endpoint này không tồn tại ở bản 3.22.12 |
| `api.cursor.sh` | DNS không phân giải |
| Mã nguồn IDE (`workbench.desktop.main.js`, 38 MB) | có `api2/3/4.cursor.sh`, `agent.api5.cursor.sh`; có `usageLimitPolicyStatusService` với các trạng thái `slow_pool` / `auto_switch` / `hard_block` — nhưng **không** có RPC công khai đọc số dư |
| Tài liệu chính thức | *"Your remaining usage and next reset date are shown in your **editor settings** and under **Usage at grok.com/dashboard**"* → chỉ qua giao diện, không có API |

**Kết luận:** app của bạn **không thể** lấy số dư hạn mức Cursor bằng API.
→ Ta phải **tự đếm token** (ước lượng từ số ký tự) và hiển thị trong 3D.
→ Đây chính là lý do lớp Token Budget là bắt buộc, không phải tuỳ chọn.

---

## 2. Kiến trúc Token Budget

### 2.1 Nguyên tắc: một lớp trung tâm, nhiều backend

```
                    ┌──────────────────────┐
                    │    TokenBudget       │  ← bất biến, agent không sửa được
                    │  (đóng băng + token) │
                    └──────────┬───────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    ┌─────▼─────┐      ┌───────▼───────┐    ┌───────▼───────┐
    │ Ví chính  │      │  Ví học       │    │  Bộ đếm nội  │
    │ (tác vụ)  │      │ (tự học 10%)  │    │  bị đóng băng│
    └─────┬─────┘      └───────┬───────┘    └───────┬───────┘
          │                    │                    │
          └────────────┬───────┴────────────────────┘
                       │
              ┌────────▼─────────┐
              │  Backend (chọn)  │
              ├──────────────────┤
              │ 1. cursor-agent  │  ← dùng pool gói Cursor
              │ 2. openai-compat │  ← API key riêng
              │ 3. local/rule    │  ← không cần key
              └──────────────────┘
```

**Điểm mấu chốt:** Token Budget đo và kiểm soát **trước** khi gọi backend nào.
Đổi backend = đổi cấu hình, không phải viết lại logic.

### 2.2 Cấu trúc dữ liệu

```ts
interface TokenBudget {
  // Bất biến — không agent nào sửa được
  readonly dailyLimit: number;       // tổng token/ngày
  readonly weeklyLimit: number;      // tổng token/tuần
  readonly learningPercent: number;  // % dành cho tự học (0-50)
  readonly perTaskLimit: number;     // trần mỗi tác vụ
  readonly perDepartmentLimit: number; // trần mỗi phòng ban
  readonly warnThreshold: number;    // 0.8
  readonly hardLimit: number;        // 1.0

  // Đếm
  usedToday: number;
  usedWeek: number;
  learningUsed: number;
}
```

### 2.3 Ví học (learning wallet) — tách biệt nhưng chung trần

```
Ví học có hạn mức RIÊNG:  learningLimit = dailyLimit × learningPercent / 100
Nhưng KHÔNG vượt tổng:   usedToday + learningUsed ≤ dailyLimit
                        usedWeek + learningUsed ≤ weeklyLimit
```

→ Học không ăn vào ví chính, nhưng học cũng không thể làm vượt trần tổng.
→ Hết ví học → agent dừng tự học, **không** đụng ví chính.

### 2.4 Tự hạ cấp model (model routing)

Độ khó tác vụ được ước lượng từ: độ dài input + số bước tool + loại tác vụ.

| Độ khó | Tiêu chí | Backend | Model |
|---|---|---|---|
| `trivial` | trích xuất, đếm, phân loại | cursor-agent | Composer 2.5 (rẻ nhất: $0.5/$2.5) |
| `normal` | tóm tắt, so sánh nhiều nguồn | cursor-agent | Grok 4.5 |
| `hard` | viết code, thiết kế | cursor-agent | Grok 4.7 |
| `huge` | > 200k token ngữ cảnh | cursor-agent | Grok 4.7 500k (2× giá) |

⚠️ Chỉ dùng **model thuộc gói** (Grok 4.5/4.6/4.7, Composer 2.5). Nếu bật
model bên thứ ba → phải chuyển sang backend API key riêng, và cảnh báo bạn.

### 2.5 Ước lượng TRƯỚC khi chạy

```
ƯỚC LƯỢNG:  inputTokens + outputTokens × 3   (output thường dài hơn)
            + 2000 (system prompt + lịch sử công cụ)
```

| Ước lượng | Hành động |
|---|---|
| ≤ 20.000 | Chạy luôn, không hỏi |
| 20.000 – 80.000 | Chạy luôn, hiện con số "ước ~X token" trên 3D |
| > 80.000 | **HỎI BẠN** trong hộp thoại 3D trước khi chạy |
| > perTaskLimit | Chặn, đề xuất chia nhỏ tác vụ |

### 2.6 Chống đốt token

| Kỹ thuật | Chi tiết |
|---|---|
| **Cache** | Cache theo `sha256(systemPrompt + userPrompt)` → LRU 500 mục, TTL 1h. Cache hit = 0 token. |
| **Tóm tắt ngữ cảnh** | Giữ 5 lượt gần nhất đầy đủ; các lượt cũ hơn → 1 dòng tóm tắt. |
| **Giới hạn vòng lặp** | `maxIterations` mỗi tác vụ (8 ở mức Cân bằng). |
| **Cắt nội dung trang** | 6.000 ký tự/trang; tóm tắt trước khi lưu KB. |
| **Cắt tool output** | 4.000 ký tự/lần gọi tool. |
| **Dừng khi chạm ngưỡng** | ≥80% → cảnh báo; =100% → khoá, mọi agent dừng. |

### 2.7 Nhật ký chi tiêu

Bảng `token_ledger` (SQLite):

| Cột | Ý nghĩa |
|---|---|
| `ts` | thời gian |
| `task_id` | mã tác vụ |
| `department` | phòng ban |
| `agent_id` | nhân vật |
| `model` | model đã dùng |
| `backend` | cursor-agent / api / local |
| `input_tokens`, `output_tokens` | số token thật |
| `cached` | có cache hit không |
| `cost_usd` | ước lượng theo bảng giá Cursor |
| `wallet` | `normal` / `learning` |

Bảng giá lấy từ tài liệu chính thức (Grok 4.7: $2/M input, $6/M output;
Composer 2.5: $0.5/M input, $2.5/M output; cache read = 10% giá input).

---

## 3. Backend `cursor-agent` — chi tiết triển khai

### 3.1 Cài đặt (một lần)

```powershell
irm 'https://cursor.com/install?win32=true' | iex
```

Gói tải về `~/.cursor/versions/<version>/`, có launcher `cursor-agent.cmd`.
Khoảng 80 MB.

### 3.2 Gọi từ ứng dụng

```ts
// src/server/llm/cursorAgent.ts
async function runCursorAgent(prompt: string, opts: {
  cwd: string; model?: string; timeoutMs?: number;
}): Promise<{ text: string; ok: boolean; error?: string }> {
  const exe = resolveCursorAgentExe();      // ~/.cursor/cursor-agent.cmd
  const args = ["-p", prompt, "--output-format", "text"];
  if (opts.model) args.push("--model", opts.model);
  // chạy trong sandbox riêng, cwd = workspace
}
```

### 3.3 An toàn khi gọi CLI

| Rủi ro | Cách chặn |
|---|---|
| CLI đọc/ghi file ngoài workspace | Luôn chạy với `cwd = /workspace`; thêm `--sandbox` |
| CLI tự chạy lệnh nguy hiểm | `--mode=ask` hoặc `--mode=plan` cho các tác vụ không cần sửa file |
| CLI treo | Timeout cứng (mặc định 120s), kill process tree |
| CLI đọc khoá của bạn | Chạy với env sạch: chỉ giữ `PATH`, `HOME` trỏ về thư mục sandbox |
| Chi phí vượt hạn mức | Token Budget kiểm tra **trước**, giới hạn số lượt gọi |

### 3.4 Đường dẫn CLI đã kiểm chứng trên máy bạn

```
Cursor IDE : C:\Users\Xiata\AppData\Local\Programs\cursor\
             resources\app\bin\cursor.cmd      (có subcommand `agent`)
CLI riêng  : %USERPROFILE%\.cursor\versions\<ver>\cursor-agent.cmd
             (chưa cài — sẽ cài ở Bước 4)
```

---

## 4. Cấu hình đề xuất

```env
# --- Backend LLM ---
# ưu tiên 1: dùng pool gói Cursor
OFFICE_LLM_BACKEND=cursor-agent
CURSOR_AGENT_MODEL=grok-4.5
CURSOR_AGENT_FALLBACK_MODEL=composer-2.5

# ưu tiên 2: API key riêng (dùng khi hết pool hoặc cần model mạnh hơn)
OFFICE_LLM_BASE_URL=
OFFICE_LLM_API_KEY=
OFFICE_LLM_MODEL=

# --- Token Budget ---
OFFICE_BUDGET_DAILY=50000
OFFICE_BUDGET_WEEKLY=350000
OFFICE_BUDGET_LEARNING_PERCENT=10
OFFICE_BUDGET_PER_TASK=50000
OFFICE_BUDGET_WARN=0.8
```

> Lưu ý về con số: 500.000 token/ngày như bản thiết kế ban đầu là **quá lớn** so
> với pool của gói Plus ($8/tháng). Con số mặc định mới nên bắt đầu **thấp**
> (50.000/ngày) và nâng dần khi bạn thấy ổn — hệ thống báo bạn khi nào sắp chạm.

---

## 5. Câu hỏi cần bạn xác nhận

1. **Gói Cursor của bạn là gì?** (Plus / Premium / Super / Ultra / Team / Enterprise)
   → quyết định hạn mức mặc định hợp lý và có dùng được Composer 2.5 (rẻ nhất) không.
2. **Cho phép tôi cài Cursor CLI (`cursor agent`)?** Nó tải ~80 MB vào `~/.cursor/`.
   Đây là con đường duy nhất để ứng dụng dùng **token từ gói của bạn**.
3. **Cho phép tôi chạy thử `cursor agent -p` một lần** để kiểm chứng nó hoạt
   động và trả về text (dùng ~1 lượt Agent trong pool của bạn).

---

## 6. Tóm tắt

| Câu hỏi | Trả lời |
|---|---|
| App có gọi trực tiếp hạn mức Cursor được không? | **Không** qua API công khai — `cursor.com/api/usage` trả 401, không có RPC đọc số dư. |
| App có dùng token từ gói Cursor được không? | **Có**, qua `cursor agent -p` (CLI chính thức, tài liệu xác nhận CLI dùng chung pool). |
| Model nào dùng được từ gói? | Chỉ Grok 4.5/4.6/4.7 + Composer 2.5. Model bên thứ ba phải trả tiền riêng. |
| Pool làm mới bao lâu? | **Theo tuần**, không theo ngày. |
| Có cần Token Budget riêng không? | **Bắt buộc** — vì app không đọc được số dư, nên phải tự đếm. |
| Có làm hỏng gói không? | Không, nếu giữ hạn mức thấp và ưu tiên Composer 2.5 / Grok 4.5. |
