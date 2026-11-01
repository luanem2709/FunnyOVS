# Bước 1 — Phân tích 3 repo nguồn

> Ngày phân tích: 2026-11-01. Repo nguồn clone vào `references/` (chỉ đọc, không sửa).
> Mục đích: rút ý tưởng để dựng MỘT ứng dụng "Văn phòng 3D" mới, không sao chép code.

---

## 0. Tóm tắt điều hành

| Repo | Giấy phép | Kiểu | Vai trò trong dự án mới |
|---|---|---|---|
| **FounderOS** | MIT (rõ ràng) | Web app Next.js 2D, nhiều phòng ban | Nguồn ý tưởng về **mô hình phòng ban + router agent**. Không dùng code (đã chuyển sang Next.js/2D, không phù hợp 3D) |
| **Agent Zero** | MIT (rõ ràng) | Agent đa năng Python, chạy trong container Linux có Chromium | Nguồn ý tưởng về **agent có máy tính riêng + browser riêng + skills + knowledge**. Không dùng code (Python, kiến trúc quá lớn) |
| **My Office** | MIT (rõ ràng) | Văn phòng 3D three.js + server Node, đọc trạng thái Claude Code | Nguồn ý tưởng về **cảm giác "văn phòng 3D" + duyệt quyền ngay trong 3D + đọc hạn mức gói**. Không dùng code (đọc transcript Claude Code, không phải agent tự chạy) |

**Kết luận giấy phép:** cả 3 đều MIT → được phép lấy ý tưởng và, nếu muốn, tái sử dụng một phần code **với điều kiện giữ nguyên thông báo bản quyển**. Tuy nhiên bản thân "Văn phòng 3D" mới sẽ **viết lại từ đầu** (theo đúng yêu cầu), chỉ vay ý tưởng — tránh ràng buộc phụ thuộc và cấu trúc 3 repo.

---

## 1. FounderOS — "command center" cho doanh nghiệp một người

### 1.1 Làm gì
Gom toàn bộ mảnh vận hành của một công ty một người vào một chỗ: khách hàng, inbox, phễu bán hàng, mạng xã hội, tài chính, tri thức, và một **roster các agent AI** có phòng ban riêng. Bạn chỉ đặt hướng; các phòng ban và đội agent chạy trên cùng một "bức tranh vận hành".

Các route trong `app/` cho thấy mô hình phòng ban rất rõ:

```
app/inbox          → nhắn tin khách hàng (gmail, slack, whatsapp, imap)
app/funnel         → phễu bán hàng (attio, ghl, trakyo)
app/social         → mạng xã hội (beehiiv, zernio, campaigns)
app/finances       → tài chính (stripe, paypal, ngân hàng, báo cáo chi)
app/knowledge      → tri thức
app/skills         → kỹ năng (đọc SKILL.md của ~/.claude/skills)
app/agents         → bảng agent (roster, task lanes, run history, chat)
app/brain          → "brain" (memory, notes, graph)
app/workflows      → quy trình
app/tasks          → việc
app/brand-deals    → hợp đồng thương hiệu
app/trading        → giao dịch
app/compute        → compute
```

### 1.2 Kiến trúc chính
- **Next.js 14 App Router + React 18 + TypeScript**, Tailwind, `better-sqlite3` (DB file), `d3-force` (graph), `zod` (validate), `ai` (SDK Vercel AI), `lucide-react`.
- **Không có 3D.** Toàn bộ là dashboard 2D dạng "phòng ban".
- Mô hình dữ liệu: `lib/db.ts` + `lib/db-ext/*` mở rộng dần; các module nghiệp vụ là file phẳng trong `lib/` (~180 file).
- **Agent runtime** riêng: `lib/agents/runtime.ts` (Agent + AgentConfig), `lib/agents/chat.ts` (chat với tool của agent), `lib/agents/conductor.ts` (**router**), `lib/agents/activity.ts` (log hoạt động).
- **Router (Conductor)** là điểm đáng lấy: tin nhắn có thể ghi rõ đích `@<agentId|tên>`; nếu không thì **model tự chọn agent hợp nhất** trong roster; nếu model lỗi thì fallback sang chấm điểm theo trùng từ khóa (rất gọn, chạy được không cần API key). Router **không bao giờ throw** khi tên sai.
- **Knowledge index** (`lib/knowledge-index.ts`): đồ thị tri thức với **mỗi cạnh đều phải nêu bằng chứng** (link / owns / mention / similar). Cạnh yếu ("similar" theo TF-IDF) mặc định tắt.
- **Skills catalog** (`lib/skills-catalog.ts`): đọc `~/.claude/skills/<name>/SKILL.md`, parse frontmatter thuần, tải nội dung đầy đủ khi cần.
- **Usage guard** (`lib/usage-guard.ts`): cờ bật/tắt đọc transcript riêng tư; có "demo instance" gate để bản demo công khai không đụng dữ liệu người dùng.

### 1.3 Công nghệ
Next.js 14 · React 18 · TypeScript 5.6 · Tailwind 3 · better-sqlite3 · d3-force · zod · Vercel AI SDK · lucide-react · vitest

### 1.4 Bảng kế thừa / bỏ / viết lại

| Nên kế thừa (ý tưởng) | Nên bỏ | Nên viết lại |
|---|---|---|
| Mô hình **phòng ban** làm không gian 3D: mỗi phòng = 1 agent + 1 bộ công cụ + 1 mảng dữ liệu | Toàn bộ lớp dashboard 2D (route, layout, UI component) | **Router (Conductor)**: chọn agent theo model + fallback keyword, không throw |
| Roster agent có mô tả để router đọc | 180 file nghiệp vụ phẳng trong `lib/` (không mở rộng được) | **Bảng "bằng chứng" cho tri thức**: mọi kết luận phải có link nguồn |
| Task lane + run history (agent đang làm gì, đã làm gì) | Hệ thống connector 10+ dịch vụ (Slack, Stripe, Notion…) — quá nặng cho bản đầu | **Phòng Thư viện** (ghi chú / kỹ năng / bài học / nhìn lại) |
| Demo mode không đụng `data/` thật | `brain`, `lab`, `compute`, `trading` (module thừa, dễ phình) | **Trạng thái 3 mức tự động** thay vì cờ bật/tắt rời rạc |
| Guard đọc transcript riêng tư có cờ tắt rõ ràng | — | Mô hình **allowlist/blocklist** cho web + quyền thư mục |

---

## 2. Agent Zero — trợ lý đa năng trong máy ảnh có trình duyệt

### 2.1 Làm gì
Một agent tổng quát chạy **bên trong một container Linux riêng** (Docker) có Chromium, thư viện tài liệu, và bộ nhớ dài hạn. Agent "ngồi trước máy" như người: tự mở trình duyệt, tự tìm web, tự đọc/ghi file trong `workdir`, tự chia nhỏ việc và giao cho sub-agent.

Điểm cốt lõi: **tách agent khỏi máy người**. Mọi thứ agent làm đều nằm trong container với filesystem riêng.

### 2.2 Kiến trúc chính
- **Python** (asyncio) + LangChain (`ChatPromptTemplate`) cho lớp prompt. Entry point: `agent.py`, `initialize.py`, `preload.py`, `run_ui.py`.
- **Hệ prompt dạng file** trong `prompts/` (~90 file `.md`): phân tách rất mịn —
  - `agent.system.main.*` (role, solving, environment, behaviour, datetime, communication)
  - `agent.system.tool.*` (call_sub, wait, notify_user, parallel, scheduler, search_engine, skills, a2a_chat)
  - `agent.protocol.*` (instructions, projects/agents_md → đọc `AGENTS.md` của thư mục)
  - `fw.*` (framework: initial_message, summary, error, intervention, repeat, truncated, timeout)
  - Cơ chế **merge** prompt (`behaviour.merge.sys.md`, `behaviour.merge.msg.md`) → cho phép **tinh chỉnh prompt theo phiên bản và quay lại được**, đúng tinh thần Bước 3B.
- **Tools** trong `tools/`: `browser_open`, `browser_do`, `search_engine`, `knowledge_tool`, `document_query`, `skills_tool`, `call_subordinate`, `scheduler`, `notify_user`, `wait`, `parallel`, `response`, `vision_load`.
- **Browser manager** (`helpers/browser.py`): Playwright + Chromium, có `open`, `get_full_dom`, `get_clean_dom` (DOM đã lọc — rút tag rác), `click`, `fill`, `press`, `execute`, `screenshot`. Có xử lý `handle_request` (chặn tài nguyên), `inject_script_into_frames`.
  > Lưu ý: file này ở HEAD hiện tại bị **comment gần như toàn bộ** (328/385 dòng là comment) — có vẻ repo đang chuyển bản mã sang dạng khác (`.py` → `.py.dox.md` cho tài liệu, code thật ở nhánh khác). Đây chính là lý do không nên copy code.
- **Knowledge** trong `knowledge/`: `main/`, `solutions/` (kiến thức + lời giải đã biết).
- **Skills** trong `skills/`: `a0-create-agent`, `a0-create-plugin`, `a0-development`, `a0-manage-plugin`, `build-skill`, `scheduled-tasks` → **skill tự tạo và tự quản lý**.
- **Agents** trong `agents/`: `agent0`, `default`, `developer`, `hacker`, `researcher`, `tiny-local` → mỗi agent là một profile riêng.
- **Docker**: `docker/run/docker-compose.yml` chạy image `agent0ai/agent-zero:latest`, mount `./agent-zero:/a0`, port 50080, `host.docker.internal` để agent gọi được dịch vụ trên máy host. `usr/` chứa `agents/`, `knowledge/`, `plugins/`, `skills/`, `workdir/` → **thư mục làm việc riêng cho agent**.
- **Web UI** (`webui/`) — giao diện riêng, chạy qua `run_ui.py`.

### 2.3 Công nghệ
Python 3 · asyncio · LangChain Core · Playwright (Chromium) · Docker · FastAPI/uvicorn (webui) · Markdown-based prompt system

### 2.4 Bảng kế thừa / bỏ / viết lại

| Nên kế thừa (ý tưởng) | Nên bỏ | Nên viết lại |
|---|---|---|
| **Agent có máy tính riêng** (profile Chromium riêng, không dùng cookie/phiên của bạn) | Docker container đầy đủ (nặng, khó chạy trên laptop Windows, khó cho người không rành kỹ thuật) | **Playwright headless với `userDataDir` riêng + `storageState: undefined`** → cách nhẹ hơn nhiều, vẫn tách biệt tuyệt đối |
| `usr/workdir` là thư mục làm việc riêng | Hệ thống 90 file prompt + cơ chế merge phức tạp | **Prompt theo phiên bản, lưu JSON, có nút quay lại** (đơn giản, đủ đáp ứng Bước 3B-C) |
| Tool `skills_tool`, `knowledge_tool` (tách skill và kiến thức thành 2 loại) | `call_subordinate`, `a2a_chat`, `scheduler`, `parallel` (phức tạp, chưa cần) | **Thư viện Tri thức SQLite** với 3 loại: note / skill / lesson |
| `agents/` nhiều profile chuyên trách (researcher, developer…) | Toàn bộ lớp Python/LangChain | **Router nhẹ trong Node/TS**, tương thích mô hình OpenAI |
| `search_engine` là tool riêng | Docker/Xpra/jupyter desktop stack | **Tìm kiếm DuckDuckGo HTML** (không cần API key) |
| `knowledge/solutions` — lưu lời giải đã biết | — | Độ tin cậy + link nguồn + cờ "từ web" cho từng mục |

---

## 3. My Office — văn phòng 3D "thật" nhất

### 3.1 Làm gì
Văn phòng 3D chibi, mỗi **session Claude Code** là một nhân vật. Nhân vật đi tới thư viện khi đọc file, ngồi gõ khi sửa, ra phòng máy khi chạy lệnh, phóng tên lửa khi deploy. Bạn duyệt quyền **ngay trong cảnh 3D**. Đồng thời hiển thị hạn mức gói Cursor/Claude, token, context, RAM/CPU, và "cái gì đang ăn gói".

Đây là repo **gần với mục tiêu của bạn nhất** về mặt cảm giác và cơ chế duyệt.

### 3.2 Kiến trúc chính
Tách làm **hai chương trình trong một repo** (theo `docs/ARCHITECTURE.md`):

```
Claude Code ──hooks(curl, loopback)──> server/index.mjs ──SSE /stream──> trang (src/office)
                                    │                                    │
        ~/.claude/sessions, transcript  /api/*                       three.js
Claude Code ──OpenTelemetry(OTLP)────> /v1/metrics,/v1/logs      (src/office/*)
```

- **Server**: Node.js ESM thuần, **không build step**. `server/index.mjs` nhận hook, đọc `~/.claude/sessions/*.json`, đẩy sự kiện qua SSE, giữ yêu cầu duyệt quyền, ghi log xem lại, trang PIN điện thoại. Chỉ loopback + allow-list chống DNS rebinding.
- **Cảnh 3D**: `src/office/` chia module theo `core`, `scene`, `world`, `people`, `life`, `ui`, `interact`, `net`, `demo`, `replay` → **three.js thuần, không React Three Fiber**.
- **Frontend**: Next.js 16 App Router + React 19, nhưng phần lớn UI là React component tĩnh; cảnh 3D là JS module thuần.
- **Hooks** (`hooks/hooks.json`): 13 hook Claude Code đẩi event qua `curl` tới `127.0.0.1:4310`; hook đồng bộ `/hook/permission` (timeout 50s) và `/hook/question` để **chờ bạn duyệt trong 3D**; hook `/hook/loop` chạy đồng bộ với timeout **0,3s** để không bao giờ làm chậm Claude Code (nếu văn phòng tắt → bỏ qua).
- **Duyệt trong 3D**: yêu cầu quyền hiện thẻ ngay trên trang đang xem; **trang không được nhìn hoặc 45s không ai bấm → hỏi như bình thường**.
- **An toàn**: `redact.mjs` che chuỗi giống mật khẩu/token/khoá API trước khi lưu; bộ nhận OTEL **từ chối mọi thứ đến từ web/wifi/tunnel**, chỉ đọc JSON ≤4MB, chỉ giữ tổng chi phí; nút tắt kiểm tra PID **và giờ khởi động** trước khi kill.
- **Ngắt vòng lặp kẹt**: cùng lệnh lỗi y hệt 3 lần → lần 4 bị chặn, agent được nhắc đổi cách.
- **Hạn mức gói**: đọc đăng nhập Claude Code trong Keychain, gọi địa chỉ hạn mức mỗi 2 phút, cảnh báo 80%/95%.
- **Hiệu năng**: gộp vật tĩnh theo vật liệu → giảm ~3.300 xuống ~1.100 lần vẽ/khung; 60fps khi xoay camera, 30fps khi yên, 10fps khi cửa sổ ở sau; bóng đổ vẽ lại theo khung khi có người đi.

### 3.3 Công nghệ
Next.js 16 · React 19 · three.js 0.160 · Node ESM server · SSE · Claude Code Hooks · OpenTelemetry (OTLP/HTTP JSON) · Playwright (e2e) · node:test

### 3.4 Bảng kế thừa / bỏ / viết lại

| Nên kế thừa (ý tưởng) | Nên bỏ | Nên viết lại |
|---|---|---|
| **Duyệt quyền ngay trong cảnh 3D** bằng thẻ ngay trên trang đang nhìn; timeout 45s → hỏi như bình thường | Toàn bộ thế giới mô phỏng (đời sống cty, thành phố Việt Nam, chibi chi tiết) — quá lớn, không phục vụ mục tiêu | **Hộp thoại xin quyền thư mục** (4 lựa chọn: 1 lần / chỉ đọc / đọc+ghi / từ chối) |
| **Màn hình trên bàn hiện đúng việc agent đang làm** (code, terminal, trình duyệt, hộp thoại) | Gắn vào Claude Code qua hooks (dự án mới có agent riêng, không cần hook) | **Texture động trên màn hình 3D** vẽ nhật ký duyệt web thật |
| **Hạn mức gói hiển thị trong văn phòng** + cảnh báo 80/95% | Đọc Keychain / transcript Claude Code | **Token Budget riêng** do ta kiểm soát (xem Bước 3) |
| **Nhắt vòng lặp kẹt** (3 lần lỗi giống nhau → chặn) | Đồng hồ bộ nhập, bảng kế hoạch, chat nhóm, phim lại, nhiệt độ… | **Giới hạn vòng lặp/thời gian/số trang** cho mỗi tác vụ |
| **Bảng kế hoạch** (việc của tôi + việc của agent) | Chế độ điện thoại, Cloudflare tunnel, PIN | **Bảng tiến độ tác vụ** trong phòng Giao việc |
| Nguyên tắc "hook phải **không bao giờ** làm chậm Claude Code" | toàn bộ mảng "quản lý máy Mac" (RAM, dev server, trophy) | **Dừng khẩn cấp** + 3 mức tự động |
| Tối ưu hiệu năng gộp vật liệu, shadow theo khung | — | Ngân sách token theo tác vụ + nhật ký chi tiêu |

---

## 4. Điểm chung & khác biệt

### 4.1 Điểm chung (cả 3 đều có)
1. **Agent không chạy trong app; app chỉ quan sát và điều khiển.**
   - FounderOS: app gọi agent qua `lib/agents/chat.ts`.
   - Agent Zero: agent là tiến trình riêng trong container.
   - My Office: app đọc transcript của tiến trình Claude Code.
2. **Tách "sự kiện" khỏi "giao diện"** — server đẩy event, client vẽ.
3. **Có bảng quyền/duyệt** ở tầng giao diện.
4. **Có tri thức lâu dài** (memory/knowledge/skills).

### 4.2 Khác biệt then chốt
| | FounderOS | Agent Zero | My Office | **Cần của bạn** |
|---|---|---|---|---|
| Agent tự quyết định & tự làm | ✗ (cần người gọi) | ✓ | ✗ (chỉ quan sát) | **✓** |
| Cảnh 3D | ✗ | ✗ | ✓ | **✓** |
| Tự lên mạng | ✗ | ✓ | ✗ | **✓ (sandbox)** |
| Tự học & tự cải tiến | ✗ | ✓ (skills) | ✗ | **✓** |
| Quyền truy cập thư mục | ✗ | ✗ (toàn quyền trong container) | ✗ | **✓ (bắt buộc)** |
| Dùng hạn mức gói sẵn có | ✗ | ✗ | ✓ (đọc Anthropic) | **tự quản lý** |

**Khoảng trống cần lấp:** không repo nào có **cả** tự chủ + 3D + sandbox web + hệ quyền thư mục. Đó chính là giá trị của dự án mới.

---

## 5. Rủi ro kỹ thuật khi ghép 3 nguồn lại

| # | Rủi ro | Mức độ | Vì sao | Cách xử lý trong dự án mới |
|---|---|---|---|---|
| R1 | **Nguồn hạn mức token không khả dụng** | 🔴 Cao | my-office đọc endpoint hạn mức **chưa có trong tài liệu Anthropic** ("địa chỉ này chưa có trong tài liệu nên có thể đổi"). Agent Zero/FounderOS đều cần API key riêng. | **Không phụ thuộc hạn mức Cursor.** Dự án có Token Budget **do ta sở hữu**, đo bằng cách đếm token ước lượng. Nếu muốn dùng Cursor CLI/headless thì phải **kiểm chứng** bằng tài liệu chính thức, không giả định. |
| R2 | **Ba stack khác nhau** (Next.js/2D · Python/Docker · Node/three.js) | 🟠 Trung bình | Không thể chạy cả ba trong một app; chi phí vận hành cao. | Chọn **một stack duy nhất**: Node + TypeScript + three.js thuần (theo hướng my-office), Express + SQLite. Viết lại phần ý tưởng. |
| R3 | **Rò rỉ dữ liệu cá nhân** | 🔴 Cao | Agent Zero chạy với quyền rộng trong container; my-office đọc `~/.claude` (transcript chứa mật khẩu, khóa API). | **Sandbox trình duyệt riêng** (profile riêng, không `storageState`) + **allowlist/blocklist** + **quyền thư mục theo từng lần** + chặn cứng `.ssh`/`.env`/thư mục trình duyệt. |
| R4 | **Prompt injection từ trang web** | 🔴 Cao | Agent đọc web = đọc nội dung do kẻ xấu kiểm soát. | Bọc nội dung web trong marker `UNTRUSTED_WEB_CONTENT`; phát hiện mẫu lệnh ẩn; **cảnh báo người dùng, không thi hành**; không có API "thực thi nội dung trang". |
| R5 | **Chi phí token vô hạn** | 🟠 Trung bình | Cả 3 repo đều có thể chạy vòng lặp dài. | Token Budget có ví riêng cho học tự chạy, cảnh báo 80%, khóa 100%, nhật ký theo tác vụ, giới hạn vòng lặp/thời gian/trang. |
| R6 | **Agent tự sửa mã → hỏng app** | 🔴 Cao | Bước 3B-C yêu cầu agent "tự phát triển". | Agent **chỉ tạo đề xuất (diff)**, người dùng duyệt mới áp dụng, có nút **Hoàn tác**. Lớp Token Budget / quy tắc an toàn / cơ chế xin quyền là **bất biến**. |
| R7 | **Chrome/Playwright không cài sẵn trên máy người** | 🟡 Thấp–TB | Playwright cần browser riêng. | Dùng **Chrome đã có sẵn** qua `executablePath` (đã tìm thấy `C:\Program Files\Google\Chrome\Application\chrome.exe`), fallback sang Edge; `playwright-core` không tải browser. |
| R8 | **Hiệu năng 3D trên laptop thường** | 🟡 Thấp–TB | my-office gặp vấn đề này và phải tối ưu nặng. | Gộp vật liệu, giới hạn tối đa ~1.000 draw call, shadow theo khung, giảm pixel ratio, có chế độ "danh sách" khi WebGL yếu. |
| R9 | **Bảo trì 3 nguồn** | 🟡 Thấp–TB | Theo dõi 3 repo = gánh nặng bảo trì. | **Không phụ thuộc runtime** vào repo nào. Chỉ giữ `references/` để đối chiếu, không có import nào trỏ vào đó. |
| R10 | **Phụ thuộc bên ngoài dừng hoạt động** | 🟡 Thấp | my-office dựa vào Claude Code hooks; FounderOS dựa vào connector bên thứ ba. | Thiết kế lớp provider: LLM qua OpenAI-compatible base URL (`.env`), không bắt buộc; mọi chức năng chạy được ở chế độ **rule-based** khi không có key. |

---

## 6. Quyết định kiến trúc sơ bộ (chốt để sang Bước 2)

```
Next.js 16 · React 19 · three.js 0.160 (thuần, không R3F)
Node.js ESM server (Express) · WebSocket (thay cho SSE) · better-sqlite3
TypeScript thuần (không React Three Fiber) để giữ nhẹ và tránh phụ thuộc
```

Lý do chọn: (1) `my-office` chứng minh three.js thuần + Node server là stack chạy được cho đúng bài toán này; (2) WebSocket thay SSE vì cần truyềi cả hai chiều (duyệt quyền, chat); (3) SQLite đủ dùng cho tri thức + quyền + nhật ký.

---

## 7. Việc cần bạn kiểm tra

1. **Hạn mức Cursor** — có thể ứng dụng gọi trực tiếp hạn mức gói Cursor của bạn không (qua Cursor CLI / headless agent), hay bắt buộc dùng API key riêng? Tôi **không bịa** khả năng này. Tôi sẽ tra tài liệu Cursor ở Bước 3; nếu chưa rõ, cần bạn xác nhận.
2. **Nhà cung cấp LLM** — bạn muốn dùng API key nào (OpenAI / Anthropic / OpenAI-compatible proxy)? Ảnh hưởng lớn tới Bước 3.
3. **Chrome trên máy** — xác nhận được dùng Chrome headless với profile riêng (đã tìm thấy Chrome tại `C:\Program Files\Google\Chrome\Application\chrome.exe`).

---

## 8. Phụ lục — bản đồ file quan trọng

**FounderOS**
- `lib/agents/conductor.ts` — router chọn agent (⭐ ý tưởng kế thừa)
- `lib/agents/runtime.ts`, `chat.ts`, `activity.ts` — vòng đời agent
- `lib/knowledge-index.ts` — tri thức có bằng chứng
- `lib/skills-catalog.ts` — đọc SKILL.md
- `lib/usage-guard.ts` — cờ bảo vệ dữ liệu riêng tư
- `lib/paths.ts`, `lib/db.ts`, `lib/stores.ts` — đường dẫn & lưu trữ

**Agent Zero**
- `prompts/agent.system.*`, `prompts/fw.*` — hệ prompt phân tách + cơ chế merge
- `helpers/browser.py` — Playwright manager (mã đang bị comment ở HEAD)
- `tools/` — browser_open, search_engine, knowledge_tool, skills_tool
- `agents/` — profile agent chuyên trách
- `docker/run/docker-compose.yml` — cô lập bằng container
- `usr/` — thư mục riêng: agents, knowledge, plugins, skills, workdir

**My Office**
- `server/index.mjs` — hook intake, SSE, duyệt quyền
- `server/otel.mjs`, `usage.mjs` — đọc hạn mức & chi phí
- `server/redact.mjs` — che bí mật
- `server/loops.mjs` — ngắt vòng lặp kẹt
- `src/office/` — cảnh 3D (core, scene, world, people, life, ui, interact, net, demo, replay)
- `hooks/hooks.json` — 13 hook Claude Code
- `docs/ARCHITECTURE.md` — bản đồ module
