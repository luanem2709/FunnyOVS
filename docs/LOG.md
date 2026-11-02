# LOG — Nhật ký chu kỳ phát triển tự chủ

Mỗi chu kỳ phát triển tự chủ ghi một mục ở đây. Mục mới nhất ở trên cùng.

Quy ước ước tính token: `~<số>` = số token ước tính đã dùng trong chu kỳ đó.

---

## 2026-11-02 — Chu kỳ 8 (GĐ 3): 3D chuyên nghiệp — camera bay mượt, ngày/đêm, kệ sách, biểu đồ thật

**Nhánh:** `auto/nang-cap-3d-toan-quyen**

### Đã làm

| Hạng mục | Thay đổi | Kiểm chứng |
|----------|-----------|-------------|
| Camera bay mượt | `assets/cameraRig.ts` (mới): `flyTo()` nội suy ease-in-out, `focusRoom()`, `overview()`, WASD/arrow pan, hủy bay khi người dùng kéo chuột | `scripts/verify-camera.ts`: bay từ `tz=0` → `tz=-21` qua 5 mốc **liên tục** (0 → -4.15 → -13.26 → -19.8 → -21), không giật |
| Nút Toàn cảnh + Ngày/Đêm | `index.html` + `main.ts`: bay về góc toàn cảnh; `lighting.ts` có `applyTimeOfDay()` (2 profile), `windows.ts` có `setSkyMode()` đổi màu vòm trời | `scripts/verify-gd3.ts`: nền đổi `a9cdec` → `11182b`, sun `2.4 → 0.35`, hemi `1.25 → 0.5` |
| Kệ sách Thư viện | `officeProps.ts`: `tallBookshelf()` — khung 2.6m + 4 tầng + sách `InstancedMesh` (160 cuốn, màu seed ổn định) | 2 InstancedMesh, 160 instance trong phòng `library` |
| Biểu đồ tường Tài chính | `officeProps.ts`: `wallChart()` vẽ bar chart bằng `CanvasTexture`; `main.ts` nạp số liệu **thật** từ `GET /api/departments` (`spend.tokens` trong `token_ledger`) | ảnh `docs/shots/gd3-finance-chart.png` hiện đúng số: Giao việc 142470, Tự động 83765, Thư viện 43007… |
| Bong bóng thoại | `assets/speechBubble.ts` (mới): sprite bo góc + đuôi, tự tắt sau 3.2s; `announceResults()` báo 1 lần/tác vụ xong | 8 agent đều có bubble; màu xanh (xong) / đỏ (lỗi) |
| Nhân vật đứng khi chờ duyệt | `updateWalkers()`: `waiting`/`blocked` → `sit = false` (đứng), `wave` pose | — |
| Bộ điều tiết chất lượng | `assets/quality.ts` + `renderPipeline.ts`: SSAO, bloom, pixel ratio, bóng đổ theo 3 mức; HUD hiện FPS | HUD: `110 fps · Cao`; tự hạ mức khi FPS thấp |
| FPS hiển thị | Poll 500ms → `#quality-fps` | ✅ |

### Bài học (đã ghi vào code)

- **`dt` phải clamp trong camera rig.** Khi tab bị treo rồi quay lại, `dt` có thể vài giây → camera nhảy thẳng tới đích, mất cảm giác "bay mượt". Đã clamp `dt ≤ 0.05s`.
- **Ảnh chụp có thể gây ảo giác.** Ba lần chụp liên tiếp cùng góc cho ảnh tưởng như không có kệ sách. Cách kiểm chứng khách quan: **tô màu `InstancedMesh` thành đỏ rồi so hash ảnh** → `f670…` ≠ `4dfd…` ⇒ sách **có** hiển thị. Script `check-shelf-render.ts` đã xoá sau khi dùng; nguyên tắc giữ lại trong `docs/LOG.md`.
- **Layout HUD chồng panel phải.** Panel (`z-index: 20`) đè lên HUD (`z-index: 10`) ⇒ Playwright không bấm được nút "Đêm". Đã tách HUD thành 2 hàng `.hud-row`.

### Trạng thái kiểm chứng

- `tsc --noEmit`: sạch. `vitest run`: **74/74 pass**.
- `npm run build`: thành công (903 kB / 246 kB gzip).
- Ảnh: `docs/shots/gd3-overview.png`, `gd3-night.png`, `gd3-library.png`, `gd3-finance-chart.png`, `gd3-ai-servers.png`, `gd3-shelves.png`.

### Chưa làm (để GĐ 4/5)

- Mesh gộp / instancing tổng thể, LOD — hiện mới instancing cho sách + LED tủ server.
- Bong bóng thoại chỉ báo **kết quả tác vụ**, chưa báo trạng thái "chờ duyệt" (đã có nhân vật đứng + vẫy tay).

---

## 2026-11-02 — Chu kỳ 7 (GĐ 2): bộ test an toàn — tìm ra 2 lỗ hổng thật

**Nhánh:** `auto/nang-cap-3d-toan-quyen`

### Bộ test mới: `tests/safety-gd2.test.ts` (25 test)

| Nhóm | Nội dung | Kết quả |
|------|-----------|---------|
| G2-1 | **Junction Windows** (directory junction) trỏ ra ngoài workspace | ✅ bị chặn (đo thật trên Windows — junction tạo được không cần admin) |
| G2-2 | 12 vector bypass: `..`, `..\..`, mixed separator, dấu chấm cuối (Windows strip), khoảng trắng cuối, drive-relative `C:..`, `\\?\`, `\\.\NUL`, null byte, chuỗi rỗng, `\` gốc | ✅ tất cả bị chặn |
| G2-3 | Yêu cầu quyền: grant không lan sang thư mục anh em cùng tiền tố, không dùng chéo agent, `read` ≠ ghi ≠ xoá, vùng chặn cứng không thể xin quyền, log không ghi nội dung bí mật | ✅ |
| G2-4 | Prompt injection: 6 payload, marker bao trọn nội dung, **kiểm chứng bằng mock `ResearchEngine`** (spy `GuardedFs.writeFile`/`readFile` → 0 lần gọi) | ✅ |

Tổng: **111/111 test pass** (86 + 25 mới).

### 🔴 2 LỖ HỔNG THẬT tìm ra nhờ bộ test này

| # | Lỗ hổng | Mức | Sửa |
|---|---------|------|-----|
| 1 | **SSRF tới cloud metadata endpoint** — `evaluateUrl()` chỉ chặn `localhost`/`127.0.0.1`, nên `http://169.254.169.254/latest/meta-data/` (AWS/GCP/Azure) **được phép** ⇒ agent có thể đọc thông tin định danh/máy chủ của bạn | Cao | `policy.ts`: thêm `isBlockedAddress()` — 11 dải IPv4 (`0/8`, `10/8`, `100.64/10`, `127/8`, **`169.254/16`**, `172.16/12`, `192.0.0/24`, `192.168/16`, `198.18/15`, `224/4`, `240/4`) + IPv6 loopback/ULA + `numericHostToIp()` (chặn `2130706433`, `0x7f000001`, `127.1`) + tên host `.local/.internal/.lan/.home.arpa` + **giao thức `file:`/`javascript:`/`data:`/`ws:`** |
| 2 | **`normalizePath()` có thể thoát sandbox** — dùng `path.resolve(workspaceRoot(), input)` ⇒ `normalizePath("../x")` trả về đường dẫn **ngoài workspace**. Chưa ai gọi hàm này nên chưa lộ, nhưng là cái bẫy cho người viết tiếp theo | Trung bình | `pathGuard.ts`: `normalizePath()` giờ cắt mọi `..` và **luôn trả về đường dẫn nằm trong workspace** |

### Ghi chú hành vi (đã kiểm chứng, KHÔNG phải lỗi)

Grant được lưu theo **đường dẫn đã chuẩn hóa** (realpath), không theo đường dẫn qua junction. Nên:
- Đọc lại đúng file đã duyệt → **được phép** (đúng ý người dùng).
- Đọc file **khác** trong cùng thư mục qua cùng junction → **vẫn bị chặn** (grant không lan rộng).

### Kiểm chứng không chặn nhầm

`scripts/check-browser-policy.ts`: 5 site thật phải mở được (Wikipedia, DuckDuckGo lite, TechCrunch…) + 18 URL phải chặn ⇒ **OK, 0 sai**. Duyệt web thật vẫn chạy sau khi sửa (server reload bình thường, `/api/dispatch` OK).

### Bài học

1. **"Chặn localhost" không phải là "chặn mạng nội bộ".** Cloud metadata (`169.254.169.254`) là mạng nội bộ theo mọi định nghĩa, và là mục tiêu số 1 của SSRF. Phải chặn theo DẢI, không theo vài tên cụ thể.
2. **Một hàm "chuẩn hóa" phải thật sự chuẩn hóa an toàn.** `path.resolve(root, input)` nghe có vẻ đã giới hạn trong root, nhưng thực tế `..` vẫn thoát ra ngoài.
3. **Test bằng mock thuyết phục hơn test bằng spy.** Test "không có đường nào để thi hành" chỉ có giá trị nếu nó spy thật vào đường ghi file — `ResearchEngine` với browser giả + `GuardedFs` spy cho câu trả lời khẳng định.
4. **Vector bypass trên Windows nhiều hơn mình nghĩ:** dấu chấm cuối, khoảng trắng cuối, drive-relative `C:..`, `\\?\`, IP dạng số — tất cả đều đã được test và chặn.

### Token ước tính

`~8k` (chủ yếu suy nghĩ + viết test, không gọi LLM)

### Việc tiếp theo

- GĐ 3: ánh sáng môi trường, post-processing, bố cục liền mạch, pathfinding, công tắc chất lượng theo FPS.
- GĐ 4: Executor tách khỏi LLM + 3 cấp quyền.

---

## 2026-11-02 — Chu kỳ 6 (GĐ 1): sửa lỗi hiển thị & số liệu, nhãn 3D, bầu trời, chuỗi đầu-cuối

**Nhánh:** `auto/nang-cap-3d-toan-quyen`

### GĐ 1.1 — Số token trên thanh ngân sách KHÔNG khớp bảng chi tiêu: ĐÃ TÌM RA NGUYÊN NHÂN

Ba nguyên nhân độc lập, đều là **lỗi thật** (không phải số giả):

| # | Nguyên nhân | Bằng chứng | Nơi sửa |
|---|-----------|-----------|---------|
| 1 | **Panel phòng ban luôn hiện "0 token"** | `/api/state` gửi hằng `DEPARTMENTS` (tĩnh) **không kèm** `spend`; client lưu `rooms` từ đó ⇒ `dept.spend === undefined` ⇒ fallback `{tokens:0}` | `main.ts`: `/api/state` gắn `agents` + `spend` từ `ledger.totalsByDepartment()`; client có `setupRooms()` cập nhật lại `spend` mà không dựng lại phòng 3D; thêm poll `/api/departments` mỗi 5s |
| 2 | **Thanh "Hôm nay" bỏ sót ví học** | `TokenBudget.#used` chỉ tính ví chính; ví học nằm ở `#learningUsed`. ⇒ thanh hiện 153.2k trong khi ledger tổng 216.8k | `main.ts` (client): thanh "Hôm nay" hiện **tổng** `total.used + learning.used`; thêm dòng "Công việc X · Tự học Y (tự học nằm trong trần ngày)" |
| 3 | **Trần ngày có lỗ hổng (vượt tới 130%)** | `canSpend("normal")` so sánh `#used + amount > #dailyLimit` — không tính `#learningUsed`, dù `#isLearningLocked` lại tính cả hai ⇒ mâu thuẫn | `tokenBudget.ts`: thêm `#dayUsed()` = `#used + #learningUsed`; mọi phép so sánh trần ngày/tuần dùng tổng. **Siết chặt hơn, không nới lỏng.** |

**Số liệu là thật hay giả?** → **THẬT, nhưng hiển thị sai chỗ.** Không có dữ liệu giả nào trong đường chi tiêu:
- Dòng `quotaSource: "estimated"` = token ước lượng cho việc đọc web qua sandbox browser (chưa gọi LLM) → **ước lượng thật** của lượng nội dung đã đọc, KHÔNG phải số bịa. Đã ghi rõ nhãn `estimated` trên từng dòng.
- Dòng `quotaSource: "cli-usage"` = token thật do Cursor CLI báo (`usage` trong JSON) → số thật tuyệt đối.

**Kiểm chứng sau khi sửa (Windows, chạy thật):**
- Thanh ngân sách: `Hôm nay 47% 233.8k/500.0k` · `Công việc 166.8k · Tự học 67.1k`
- Ledger `totalsToday()`: `normal 166754 + learning 67052 = 233.806` ⇒ **khớp tuyệt đối**
- Panel "Phòng Giao việc": `45.5k token · 2 lượt · 0.0438 USD` ⇒ khớp đúng dòng ledger `department=dispatch` (45.486 token, 4.38 cents).

### GĐ 1.2 — Nhãn phòng & nhân vật (billboard rõ nét)

Mới: `src/client/assets/labels.ts` — `BillboardLabel` vẽ canvas 1024×256:
- Nền đậm `rgba(8,11,16,0.94)` + viền bo góc màu theo trạng thái, **chữ trắng đậm** 82px.
- **Biểu tượng trạng thái** (⚙ 🔍 📘 ⏳ ⛔ ●) + tên trạng thái tiếng Việt.
- **Thanh tiến độ** 0..1 dưới nhãn (đang làm 0.55 · chờ duyệt 0.9 · xong 1.0).
- **Tự ẩn khi xa** (>13 m với người, >34 m với phòng) + thu nhỏ dần theo khoảng cách ⇒ không đè lên nhau, không rối mắt ở chế độ toàn cảnh.
- Nhãn đặt **cao hơn đỉnh đầu** (2.12 m thay vì 1.78 m) ⇒ không che mặt nhân vật.
- `depthTest:false` + `renderOrder 900` ⇒ nhãn luôn nổi trên vật thể.

### GĐ 1.3 — Bầu trời: bỏ texture đốm tròn

- `drawCityscape()`: mây cũ là 22 hình tròn đặc → đổi thành 14 đám mây gồm nhiều **radial gradient** chồng nhau (alpha tăng dần về tâm) ⇒ mềm, không đốm.
- Bầu trời: gradient 5 chặng (`#2f6fb5 → #eef6fb`).
- Thêm **vòm trời shader** (`skyDome()`) — nội suy màu theo chiều cao, không texture ⇒ không vệt/đốm.
- Thêm **2 vòng skyline mờ** xa (`distantSkyline()`, alpha 0.4 / 0.26) + lớp sương mờ → chiều sâu, không cứng.

### GĐ 1.4 — Chuỗi đầu-cuối (chạy THẬT trên Windows)

`scripts/e2e-task.ts`: giao việc → `cursor agent -p` → kết quả → ledger.

Kết quả đo được:
```
status: done | backend: cursor-agent | model: auto
tokens: 96984 | costCents: 11.2168 | quotaSource: cli-usage | durationMs: 38856
usage thật: input 36122 · output 1726 · cacheRead 59136
ledger trước 166754+67052  →  sau 263738+67052   (+96984 = khớp chính xác)
result: "OK: 2" (đã liệt kê được tệp trong sandbox)
```

### Cờ Cursor CLI thật sự hoạt động (đo trên máy, `scripts/check-cursor-flags.ts`)

| Cờ | Kết quả |
|-----|---------|
| `-p` / `--print` | ✅ có `usage` + `result` |
| `--output-format json` | ✅ |
| `--output-format stream-json` | ✅ |
| `--stream-partial-output` | ✅ |
| `--model auto` | ✅ (gói Free chỉ cho phép `auto`) |
| `--mode plan` | ✅ (read-only) |
| `--mode ask` | ✅ (read-only) |
| `--trust` | ✅ |
| `--workspace <dir>` | ✅ |
| `--add-dir <dir>` | ✅ |
| `--auto-review` | ✅ parse OK |
| `--force` / `--yolo` | ✅ parse OK (**không dùng** — bật auto-approve mọi lệnh) |
| `--sandbox enabled` | ❌ **KHÔNG hoạt động trên Windows**: `Error: Sandbox mode is enabled but not available on this system. Sandbox requires macOS or Linux.` ⇒ ứng dụng **tự cô lập** (workspace riêng + HOME riêng), không dựa vào cờ này |
| `--sandbox disabled` | ✅ |
| `--list-models` | ✅ (275 dòng) |

### Bài học

1. **"0" ở một bảng không phải lúc nào cũng là dữ liệu giả** — nhiều khi là *trường không được gửi*. `/api/state` gửi hằng tĩnh trong khi `/api/departments` gửi bản đầy đủ ⇒ client nhận `undefined` và hiển thị 0.
2. **Một bảng "hợp lệ" phải dùng cùng nguồn số liệu.** Thanh ngân sách lấy từ `TokenBudget`, bảng chi tiêu lấy từ `TokenLedger` — hai nơi phải cùng công thức, nếu không sẽ lệch.
3. **Ví con phải nằm TRONG trần cha.** `#isLearningLocked` tính cả hai ví nhưng `canSpend` thì không ⇒ lỗ hổng 130%. Cùng một khái niệm phải dùng cùng một cách tính.
4. **Cờ CLI phải đo, không tin tài liệu.** `--sandbox enabled` được ghi "không chạy trên Windows" trong code từ trước — lần này đo lại và xác nhận. Đồng thời phát hiện cần delay giữa các lượt gọi liên tiếp (gọi quá nhanh → `code=1` không có JSON).
5. **Nhãn 3D phải test bằng ảnh, không bằng mắt code.** Lần đầu nhãn đè đúng lên mặt nhân vật — chỉ thấy được sau khi chụp ảnh.

### Token ước tính

`~120k` (đo thật: 96.984 Cursor CLI + ~25k kiểm tra cờ CLI)

### Việc tiếp theo

- GĐ 2: bộ test an toàn (path traversal, junction/symlink Windows, prompt injection).
- GĐ 3: ánh sáng môi trường, post-processing, bố cục liền mạch, pathfinding.

---

## 2026-11-02 — Chu kỳ 5: "Vẫn đứng yên" — việc giả, ví cạn, không có nhịp độ

**Nhánh:** `auto/2026-11-02-van-phong-3d` (tiếp tối chu kỳ 4)

### Vấn đề

Sau chu kỳ 4, người dùng vẫn thấy văn phòng "không hoạt động". Điều tra lại cho thấy
**4 nguyên nhân mới**, lần này là lỗi *thiết kế* chứ không phải lỗi cấu hình:

| # | Nguyên nhân | Bằng chứng | Nơi sửa |
|---|-----------|-----------|---------|
| 1 | **5 nhân viên làm việc GIẢ** | `kind: "internal"` chỉ `setTimeout(2500)` rồi báo "Xong" → `Mai/Long/Huy/Thu/Ban` có `tokensUsed=0, tasksDone=0` | `main.ts`: mọi việc (kể cả "nội bộ") đều chạy thật qua sandbox browser → đọc web, ghi Thư viện tri thức, trừ token |
| 2 | **Không có bộ điều tiết nhịp độ** | 7 nhân viên × mỗi 90–180s ⇒ đốt sạch 150k token trong ~40 phút rồi đứng yên cả buổi | `workDispatcher.ts`: `governorIntervalMs()` — trải đều ngân sách còn lại ra các giờ làm việc còn lại, nhịp trong khoảng [1 phút, 8 phút] |
| 3 | **Trần ngày 150k quá chặt cho 8 agent** | 12:58 đã tiêu 92k/150k (61%) chỉ trong ~2 giờ → văn phòng "chết" giữa ngày | `config.ts`: trần ngày **500k**, tuần **2,5M**, `learningPercent` 30% (migration cho config cũ) |
| 4 | **Governor tính sai ví** | Trừ cả `learning.used` ra khỏi ví chính rồi lại chia cho 7 người ⇒ nhịp 24 phút/lần | `main.ts`: mỗi ví có nhịp riêng, mỗi vòng = cả văn phòng cùng nhận việc |

### Đã làm

| Hạng mục | Nội dung |
|---------|----------|
| Việc "nội bộ" chạy thật | Mỗi mục việc có `topic` + `maxSources` + `snippetChars` → `research.research()` thực sự duyệt web, đọc nội dung, ghi vào Thư viện, ghi ledger, cộng `tokensUsed` cho nhân viên |
| Governor ngân sách | `governorIntervalMs()` + `activeHoursLeft()` + `estimateItemCost()`/`estimateRoundCost()` — trải đều token còn lại ra giờ làm việc còn lại; hết token ⇒ `Infinity` ⇒ dừng (không tự tăng hạn mức) |
| Cắt ngắn nội dung | `researchEngine.ts` nhận `snippetChars` (mặc định 6000); việc tự động dùng 1800–2000 ký tự ⇒ mỗi lượt ~1–1,5k token thay vì ~6k |
| HUD | Thêm dòng "Tự động: N việc · M người đang làm · giao mỗi Xs · còn Y token" trong thanh ngân sách |
| API | `/api/dispatch` trả thêm `intervalMs`, `remainingTokens`, `remainingLearningTokens` |
| Migration config | `learningPercent: 10` → mặc định; `dailyTokenLimit: 150_000` → 500k; `weeklyTokenLimit: 900_000` → 2,5M (chỉ khi người dùng chưa tự đặt) |
| Script kiểm tra | `scripts/check-hud.ts` — đọc DOM thanh ngân sách + panel phòng, không cần WebGL |

### Kết quả

- `tsc --noEmit`: sạch. `vitest run`: **83/83 pass** (thêm 9 test cho governor).
- 8/8 nhân viên đều có `tokensUsed > 0` và `tasksDone > 0` (trước đó 5/8 bằng 0).
- HUD: `Hôm nay 31% · 153.2k/500.0k` · `Tự học 32%` · `Tự động: 7 việc · 0 người đang làm · giao mỗi 480s · còn 346.8k token`.
- Nhật ký hoạt động ghi rõ: `Xong: Nghiên cứu xu hướng mới — 1.211 token · 2 nguồn`.

### Bài học

1. **"Có việc" ≠ "có việc thật".** Một `setTimeout` giả vờ hoạt động tệ hơn là không có gì — người dùng thấy thanh token đứng yên và kết luận hệ thống chết. Mọi trạng thái "đang làm" phải kèm tiêu token thật và kết quả thật.
2. **Hạn mức + nhịp độ = hai vòng kiểm soát độc lập.** Chỉ có hạn mức thì văn phòng chết giữa ngày; chỉ có nhịp độ thì đốt sạch ví rồi cũng chết. Cần cả hai: hạn mức là mốc chặn cuối, governor là bộ điều tiết nhịp.
3. **Đừng trừ chồng hai ví.** Ví học là *phần* của trần ngày chứ không phải khoản trừ riêng — trừ chồng làm nhịp bị kéo dài gấp 7 lần.
4. **Số liệu là bằng chứng.** `tokensUsed=0` cho 5 nhân viên là đầu mối đã nói ngay vấn đề nằm ở "việc giả", không cần đoán.

### Token ước tính

`~150k` (đã tiêu thật: Cursor CLI 45.486 + nghiên cứu tự động ~105k)

### Việc tiếp theo

- Bỏ `setTimeout` giả còn sót lại (đã xử lý toàn bộ trong `runAutoWork`).
- Xem xét `InstancedMesh` cho lá cây/ghế/sách (BACKLOG 1.9).
- Bảng LED trong cảnh 3D hiển thị nhật ký token (BACKLOG 4.2).

---

## 2026-11-02 — Chu kỳ 4: Sửa "văn phòng đứng yên, không tiêu token"

**Nhánh:** `auto/2026-11-02-van-phong-3d` (tiếp tối chu kỳ 3)

### Vấn đề

Người dùng báo: *"sao k thấy nhận token và không thấy nó hoạt động vậy"*. Điều tra thực tế
cho thấy **5 nguyên nhân độc lập** cùng làm văn phòng "chết":

| # | Nguyên nhân | Bằng chứng | Nơi sửa |
|---|-----------|-----------|---------|
| 1 | **Timeout task quá ngắn (120s)** | Ledger: `Cursor CLI quá thời gian (120000ms)` — lượt đo thật mất 261s | `taskRunner.ts`: timeout 300s, cấu hình được qua `taskTimeoutMs` |
| 2 | **Ví học quá nhỏ so với chi phí 1 lượt CLI** | Hạn mức học = 10% × 150k = **15.000** token, nhưng 1 lượt Cursor CLI tốn tối thiểu **~22.800** → task tự học luôn fail "Không đủ hạn mức token" | `config.ts`: `learningPercent` 10 → 25 (mặc định); runtime config → 40 |
| 3 | **Sandbox browser crash server** | `browserType.launch: Pass userDataDir parameter to launchPersistentContext` — Playwright mới từ chối `--user-data-dir` trong `chromium.launch()` → **sập cả server**, mất WebSocket | `sandboxBrowser.ts`: bỏ cờ `--user-data-dir`, dùng `newContext()` |
| 4 | **Tìm kiếm web luôn trả 0 kết quả** | `html.duckduckgo.com` chặn bot bằng CAPTCHA ("select all squares containing a duck"); regex `result__a` không khớp HTML thật | `sandboxBrowser.ts`: dùng `lite.duckduckgo.com/lite/`, bóc link bằng DOM (`a[class*="result"]`), thêm User-Agent thật |
| 5 | **Chỉ có việc thủ công + tự học 30 phút/lần** | Không có cơ chế tự phân công → 8 nhân viên đứng yên suốt, thanh token không bao giờ nhúc nhích | `src/server/agents/workDispatcher.ts` (mới) + `main.ts` |

### Đã làm

| Hạng mục | Nội dung |
|---------|----------|
| Bộ phân công tự động | `workDispatcher.ts` — danh mục 7 việc thường nhật (mỗi nhân viên 1 việc), `pickNextWork`/`markDispatched`/`markFree`, tôn trọng thời gian chờ. Vòng lặp 15s trong `main.ts`. Mỗi mục có `wallet` riêng (`normal` = công việc, `learning` = tự học). |
| Ghi ledger cho việc nghiên cứu | `researchEngine.ts` trả về `tokensUsed`; `main.ts` ghi vào `token_ledger` + `registry.recordUsage()` → thanh năng lượng chạy, HUD đổi số. Trước đó việc nghiên cứu **tiêu token nhưng không ghi gì**. |
| Khôi phục số liệu sau restart | `tokenLedger.totalsByAgent()` + `main.ts` khôi phục `tokensUsed`/`tasksDone` của từng nhân viên (trước đó restart là mất số). |
| API dispatcher | `GET /api/dispatch` (nhân viên đang bận) + `POST /api/dispatch/run` (giao việc ngay). |
| Client | Badge "đang tự làm việc" + nút "Chạy tự động" trong panel phòng ban; hook `__setCamera` để chụp ảnh toàn cảnh; làm mới `/api/dispatch` mỗi 3s. |
| Script chẩn đoán | `scripts/peek-ledger.ts` (xem sổ token), `scripts/check-search.ts` (thử 6 engine tìm kiếm), `scripts/check-ddg.ts` + `check-regex.ts` ( soi HTML DDG), `scripts/shot-office.ts` (ảnh toàn cảnh + trạng thái agent). |
| Test | `tests/dispatcher.test.ts` — 6 test cho bộ phân công. |

### Kết quả

- `tsc --noEmit`: sạch.
- `vitest run`: **74/74 pass** (68 cũ + 6 mới).
- Task Cursor CLI thật: **status `done`**, 45.486 token, `quotaSource: cli-usage`, 18,4s.
- Tự động: `An` (nghiên cứu, ví chính) + `Tri` (tự học, ví học) chạy đều đặn; ledger đầy dần.
- Token hiển thị đúng trên HUD: `Hôm nay 35% · 53.0k/150.0k`, `Tự học 92%`, `Cursor Free: 24%`.

### Bài học

1. **"Không hoạt động" thường là nhiều lỗi chồng nhau, không phải một lỗi.** Phải đọc log ledger + gọi API + đọc code, cả 3 mới thấy đủ. Riêng task tự học đã che mất 3 lỗi khác vì luôn fail ở bước kiểm tra ngân sách.
2. **Lớp đóng băng (`TokenBudget`) không được sửa — nhưng cấu hình của nó thì được.** Sửa trực tiếp `#learningLimit` làm fail test an toàn (đúng, quy tắc). Sửa `learningPercent` trong `config.ts` mới là cách đúng, và test vẫn xanh.
3. **CAPTCHA chặn bot là loại lỗi âm thầm.** `html.duckduckgo.com` trả HTTP 200 + nội dung "chọn tất cả ô vuông có hình con vịt" → code cũ báo "không tìm thấy kết quả" như thể mạng hỏng. Phải **in ra nội dung trang** mới thấy. Bản `lite.duckduckgo.com` không chặn.
4. **Regex trên HTML thô là bằng chứng không đáng tin.** Thứ tự thuộc tính HTML thay đổi giữa các bản render → regex fail âm thầm. Bóc bằng DOM (`querySelectorAll`) luôn ổn định hơn.
5. **`--user-data-dir` trong `chromium.launch()` đã bị Playwright cấm.** Đây là loại lỗi làm sập tiến trình (không phải throw trong request) → mất WebSocket, client thấy `ECONNREFUSED` mà không hiểu vì sao server chết.

### Token ước tính

`~120k` (đã tiêu thật qua Cursor CLI: 45.486 token cho 1 task thử + ~77k token nghiên cứu tự động)

### Việc tiếp theo

- 1.4: test đầu-cuối chuỗi giao việc — **đã làm xong trong chu kỳ này** (task Cursor CLI chạy thật, ghi ledger, trừ ví, cập nhật HUD).
- 1.9: gộp mesh bằng `InstancedMesh` để giảm draw call.
- 4.4: hàng chờ pha cà phê · 4.5: nhân viên dừng lại nói chuyện.
- 3.9: vòng chuyển động ngày/đêm.
- Nâng `learningPercent` mặc định lên 25 đã sửa trong `config.ts`, nhưng file `.data/config.json` cũ vẫn ghi đè → cần migration khi đọc config.

---


**Nhánh:** `auto/2026-11-02-van-phong-3d` (tiếp nối chu kỳ 2)

### Đã làm

| Hạng mục | Nội dung |
|---------|----------|
| Đo hiệu năng | `scripts/perf.ts` — đo draw call, tam giác, geometry, texture, vật liệu, đèn, FPS (5 lần lấy trung vị). Đo bằng chuỗi `page.evaluate` vì hàm bị esbuild bọc bằng `__name` mà trang web không có. |
| Cache vật liệu | `roomBuilder.ts`: `FALLBACK_MAT_CACHE` (hộp dự phòng), `BOOK_MAT_CACHE` (sách), `TINTED_MAT_CACHE` (model đã sơn). `officeProps.ts`: `donutMaterial()`, `noteMaterial()`. |
| Cache geometry | `officeProps.ts`: `RBOX_GEO_CACHE` cho hộp bo góc. `props.ts`: `cachedGeo()` cho lá cây, chậu, vành, đất, thân, đèn sàn. |
| Giảm đèn | Đèn sàn (9) bỏ PointLight → dùng vật liệu phát sáng. Đèn trần phòng (9) chỉ bật ở phòng đang xem. Tổng 38 → 29 đèn. |
| Đường đi tránh bàn | Thêm blocker bàn vào `navGrid` (pad 0.05 m). `NavGrid.addBlocker()` nhận tham số `pad` riêng cho từng vật cản. |
| Về bàn khi nhận việc | `Walker.recall(pos, grid)` — nhân viên đang đi nghỉ mà nhận việc sẽ đi bộ về bàn (không dịch chuyển tức thì). `applyStatus()` gọi `recall()` khi chuyển sang `working`/`researching`/`learning`. |
| Test | `tests/nav.test.ts` giữ nguyên 13 test, vẫn pass sau khi thêm `pad`. |

### Kết quả

| Chỉ số | Trước | Sau |
|---------|-------|-----|
| Vật liệu duy nhất | 719 | 619 |
| Geometry | 1.235 | 802 |
| Đèn | 38 | 29 |
| Draw call | 1.371 | 1.371 (chưa đổi) |
| FPS (SwiftShader) | 74 (1 lần đo) | 48.5 trung vị (25–55) |

- `tsc --noEmit`: sạch.
- `vitest run`: **68/68 pass**.
- `scripts/check-walk.ts`: cả 8 nhân viên vẫn đi (9–12 m), tới chỗ nghỉ, quay lại bàn.

### Bài học

1. **Đo một lần là không đủ.** Cùng một cảnh cho FPS 74 rồi 27 rồi 48 ở ba lần đo liên tiếp — máy đang chạy song song nhiều thứ (dev server + tsx watch + Chrome). Phải đo 5 lần lấy trung vị mới nói được sự thật.
2. **Giảm draw call ≠ giảm vật liệu.** Cache geometry không giảm draw call (vẫn 1.371) vì draw call tính theo số mesh, không theo số buffer. Cache vật liệu mới giúp giảm **số shader program** (49) → biên dịch shader nhanh hơn, ít "chớp" khi đổi trạng thái.
3. **Đèn là chi phí lớn nhất trong Three.js.** Ba.js tính chi phí shader theo số đèn *đang hoạt động*. Bỏ 9 đèn sàn và tắt 8 đèn trần ở các phòng không xem → giảm 24% đèn mà gần như không mất gì về thị giác (đèn sàn dùng emissive vẫn thấy "sáng").
4. **Vật cản có lề riêng.** `pad` cho từng blocker cho phép tường phình 0.36 m (người không đi sát tường) còn bàn chỉ phình 0.05 m (vẫn tới được chỗ ngồi).

### Token ước tính

`~85k`

### Việc tiếp theo

- 1.9: gộp mesh bằng `InstancedMesh` (lá cây, ghế, sách) để giảm draw call.
- 4.4: hàng chờ pha cà phê.
- 4.5: nhân viên dừng lại nói chuyện.
- 1.4: test đầu-cuối chuỗi giao việc.
- 3.9: vòng chuyển động ngày/đêm.

---

## 2026-11-02 — Chu kỳ 2: Nhân viên đi lại + đồ đạc chi tiết

**Nhánh:** `auto/2026-11-02-van-phong-3d` (tiếp nối chu kỳ 1)

### Đã làm

| Hạng mục | Nội dung |
|---------|----------|
| Lưới điều hướng | `src/client/assets/agentNav.ts` — `NavGrid`: lưới ô 0.5 m, vật cản là tường phòng (phình thêm bán kính người 0.36 m), A* 8 hướng với heuristic Chebyshev, rút gọn đường bằng string pulling. |
| Máy trạng thái đi lại | `Walker` — 5 phase: `work` → `leaving` → `walking` → `acting` → `returning`. Tốc độ 1.15 m/s, thời gian ngồi ngẫu nhiên 18–55 s (lệch pha theo từng agent). |
| Chỗ nghỉ | `AMENITIES` — 11 chỗ trong 6 phòng: quầy cà phê (Tự động), bảng trực ca (Marketing), máy in (Khách hàng + Tự động), bình nước (5 phòng). Gắn toạ độ tuyệt đối qua `bindAmenities()`. |
| Tích hợp 3D | `main.ts` → `updateWalkers()`: nhân vật xoay theo hướng đi, đổi pose `walk` khi đi, `coffee`/`board`/`read` khi làm việc ở chỗ đến, ngồi lại đúng chỗ bàn khi về. |
| Đồ đạc chi tiết | `src/client/assets/officeProps.ts` — quầy cà phê (tủ + máy pha espresso + cốc + bánh), tủ server (LED `InstancedMesh` + quạt quay), vách kính, máy in, bảng trực ca ghim ý tưởng. Gắn theo chức năng phòng: AI → tủ server, Tự động → quầy cà phê, Marketing → bảng, Khách hàng → máy in. |
| Sửa lỗi hình ảnh | Bỏ `Fog` (hòa mọi vật vào màu trời → cảnh trắng xóa), giới hạn sàn chung trong vòng skyline (bán kính 25.5), bảng màu vật liệu đậm hơn. |
| Sửa lỗi resize | `composer.setSize` + `setPixelRatio` khi đổi kích thước cửa sổ. |
| Màn hình phát sáng | `Screen.setStatus()` — PointLight trước màn hình, màu theo trạng thái agent, cường độ cao hơn khi đang làm việc. |
| Test | `tests/nav.test.ts` — 13 test: chặn tường, phình vật cản, A* giữa 2 phòng, đường không đi qua ô chặn, đường kết thúc đúng đích, đích không tới được, `nearestFree`, đủ 5 phase, vị trí thay đổi, về đúng bàn, `reset()`. |

### Kết quả

- `tsc --noEmit`: sạch.
- `vitest run`: **68/68 pass** (nav 13, budget 23, safety 32).
- `scripts/check-walk.ts`: cả 8 nhân viên đều đi (dịch chuyển 1.8–7.6 m), tới chỗ nghỉ rồi quay lại bàn.
- Ảnh: `docs/shots/walk-check.png`.

### Bài học

1. **Truyền object copy vào hàm cập nhật vị trí → nhân viên đứng yên.** `walker.update({x, z}, ...)` nhận object mới mỗi khung hình nên `step()` sửa toạ độ trên object tạm, không phải trên `visual.root.position`. Phải truyền thẳng `THREE.Vector3`.
2. **`requestAnimationFrame` rất dễ mất khi sửa code bằng tìm–thay thế.** Một lần thay chuỗi đã xoá dòng `requestAnimationFrame(animate)` → cảnh đứng hình, nhân viên không chuyển động mà không có lỗi console nào. Bài học: sau mỗi lần sửa `animate()`, kiểm tra lại vòng lặp có tự gọi lại không.
3. **Đo đạc trước khi sửa tiếp.** `scripts/diag-nav.ts` cho thấy A* tìm được đường tới 11/11 chỗ nghỉ cho mọi nhân viên → biết ngay lỗi không nằm ở thuật toán tìm đường mà ở chỗ khác.
4. **Ảnh PNG hiển thị trong công cụ xem ảnh bị hạt/mờ.** Chuyển sang JPEG hoặc crop vùng cần xem mới kiểm tra được chi tiết thật.

### Token ước tính

`~78k`

### Việc tiếp theo

- 4.6: `walker.reset()` khi agent nhận việc mới.
- 4.7: đường đi tránh bàn/ghế.
- 4.4: hàng chờ pha cà phê.
- 1.5: đo hiệu năng (draw call, FPS).
- 1.4: test đầu-cuối chuỗi giao việc.

---

## 2026-11-02 — Chu kỳ 1: Nâng cấp 3D theo `references/my-office`

**Nhánh:** `auto/2026-11-02-van-phong-3d` (không commit vào `main`)

### Đã làm

| Hạng mục | Nội dung |
|---------|----------|
| Hậu kỳ render | `src/client/assets/renderPipeline.ts` — RenderPass → UnrealBloom → OutputPass, MSAA 4×, ACES tone mapping, IBL từ `RoomEnvironment`. Tự phát hiện SwiftShader (không GPU) → bỏ hậu kỳ, giảm pixel ratio, tắt bóng. |
| Cây xanh & đèn sàn | `src/client/assets/props.ts` — `potPlant` (monstera/snake/bush/tree) + `floorLamp`, port từ `my-office/src/office/world/terrace.js` và `world/furniture/plants-lamps.js`. |
| Ngoại cảnh 360° | `src/client/assets/windows.ts` — skyline thành phố vẽ bằng canvas, dán lên vòng hình trụ bao quanh tầng văn phòng. Port từ `my-office/src/office/world/windows.js`. |
| Texture sàn | `src/client/assets/floorTextures.ts` — sàn ván gỗ (có vân) và sàn gạch văn phòng, chọn theo độ sáng màu sàn của phòng. |
| Chế độ tập trung phòng | `src/client/assets/focusMode.ts` — khi chọn một phòng, các phòng khác mờ dần (opacity → 0) nên không còn che tầm nhìn camera. Xử lý riêng vật liệu dùng chung giữa các phòng. |
| Cắt tường | `src/client/assets/wallCulling.ts` — mờ dần các bức tường nằm giữa camera và vùng nhìn, dựa trên bounding box (không dùng raycast đơn điểm vì tường thường lệch bên). |
| Tường thấp + sàn có texture | Tường phòng hạ từ 3.2 m → 1.35 m; sàn phòng và sàn chung dùng texture thay vì màu phẳng. |
| Ánh sáng | `src/client/assets/lighting.ts` — giảm ambient 0.45 → 0.12, tăng hemisphere/sun, giảm fill. |
| Camera khi chọn phòng | `main.ts` — `dist` 9–14, `pitch` 0.52, `yaw` 0.12 (nhìn chính diện để thấy mặt nhân vật quay +Z). |

### Kết quả

- `tsc --noEmit`: sạch.
- `vitest run`: **55/55 pass** (`tests/budget.test.ts` 23, `tests/safety.test.ts` 32).
- Ảnh kiểm thử: `docs/shots/up13.png` (phòng Giao việc) — thấy bàn, ghế, cây xanh, skyline 360°, nhân vật chibi.

### Bài học (quan trọng)

1. **Ảnh "trắng" không phải lúc nào cũng là lỗi render.** Trong chu kỳ này rất lâu tưởng cảnh bị rửa trắng. Thực tế:
   - `gl.readPixels()` trên SwiftShader/ANGLE **xoá nội dung backbuffer**, khiến `canvas.toDataURL()` trả về ảnh trắng. Phải chụp `toDataURL()` **trước**, và đọc pixel qua FBO phụ.
   - `scene.background` + sàn phẳng + tường kem chiếm phần lớn khung hình → ảnh *trông* trắng dù có nội dung. Dùng lưới phân loại màu + crop vùng cần xem mới phân biệt được.
2. **ACES tone mapping + IBL cộng dồn** với bộ đèn sẵn có (30 đèn) → cháy sáng. `environmentIntensity` phải rất nhẹ (0.1), exposure ~0.95.
3. **Văn phòng nhiều phòng xếp lưới**: camera toàn cảnh luôn bị phòng khác và tường che. Cần *focus mode* (mờ ẩn phòng khác) chứ không chỉ raycast cắt tường.
4. **Đo trước khi sửa**: script chẩn đoán (`scripts/diag-scene.ts`, `grid-pick.ts`, `isolate-render.ts`, `tune-lighting2.ts`) giúp cô lập nguyên nhân thay vì đoán mò. Ba lần sửa liên tiếp cùng một lỗi là đã vượt giới hạn "3 lần" → chuyển sang cô lập bằng đo đạc.

### Token ước tính

`~95k` (chu kỳ đầu, nhiều thời gian chẩn đoán ảnh)

### Việc tiếp theo

- 3.5 / 3.6: tăng tương phản vật liệu, chỉnh góc camera để nhân vật không bị bàn che.
- 1.6: `composer.setSize` khi resize cửa sổ.
- 1.4: test đầu-cuối chuỗi giao việc.
- 3.7: màn hình phát sáng theo trạng thái agent.

---

## 2026-11-01 — Chu kỳ 0 (tiền đề)

- Tích hợp chibi rig 3D (`assets/chibiRig.js`, `assets/chibi.ts`) từ `references/my-office`.
- Commit `6357af2`, đẩy `origin/main`.
