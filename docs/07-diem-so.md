# Bảng chấm điểm hệ thống (mục tiêu 10/10)

> **Cách chấm:** mỗi nhóm có các tiêu chí **kiểm chứng được** (có test tự động hoặc đã kiểm thủ công trong trình duyệt/app và ghi rõ).
> Điểm nhóm = (số tiêu chí đạt ÷ tổng) × 10. Điểm tổng = trung bình các nhóm. Chạy `npm run score` để tính lại — tiêu chí chỉ được đánh dấu `[x]` khi đã kiểm chứng.
> Giới hạn của thước đo: 10/10 ở đây nghĩa là **đạt hết tiêu chí trong bảng này**, không phải "hoàn hảo tuyệt đối". Những thứ cần tiền/tài khoản/người thật (ký số, pháp lý, thanh toán, kiểm thử trên máy người khác) nằm ngoài bảng và được nêu ở `docs/06-san-sang-thi-truong.md`.
> Tích hợp với máy chủ thật bên ngoài (SMTP/IMAP/GitHub/nhà cung cấp AI) chỉ được kiểm bằng máy chủ giả trong test và LLM giả (`scripts/mock-llm.mjs`) khi chạy thử; điều đó được ghi ở bảng chứng cứ bên dưới.

## A. Điều phối thông minh
- [x] A1 — Giám đốc lập kế hoạch bằng LLM, kết quả được kiểm bằng schema (test: planner.mock)
- [x] A2 — LLM lỗi/trả sai định dạng/quá hạn thì tự quay về bộ định tuyến từ khoá (test: planner.fallback)
- [x] A3 — Kế hoạch và lời giao việc theo đúng ngôn ngữ người dùng (test: planner.lang)
- [x] A4 — Việc lỗi được thử lại một lần với người khác trong phòng; bản thất bại không làm cha báo lỗi nếu bản thử lại xong (test: dispatcher.retry)
- [x] A5 — Giám đốc viết báo cáo tổng hợp cuối cùng bằng LLM, có dự phòng khi LLM lỗi (test: dispatcher.summary)
- [x] A6 — Việc có phụ thuộc (`dependsOn`) chạy đúng thứ tự, kết quả bước trước được đưa vào bước sau (test: dispatcher.deps)
- [x] A7 — Giới hạn an toàn: tối đa số phòng/việc, không vòng phụ thuộc (test: planner.limits)

## B. Kết nối AI (API miễn phí / OmniRoute)
- [x] B1 — Tự dò OmniRoute (`:20128`), Ollama (`:11434`), LM Studio (`:1234`) (test: ai.detect.local)
- [x] B2 — Tự nhận khoá miễn phí từ biến môi trường: Groq, OpenRouter, Gemini, Cerebras, Mistral, GitHub Models (test: ai.detect.env)
- [x] B3 — Router thử lần lượt nhiều nhà cung cấp, ngắt mạch khi lỗi liên tiếp, tôn trọng 429/Retry-After (test: ai.router.fallback)
- [x] B4 — Khoá API lưu file quyền 0600, không bao giờ trả về client (chỉ bản che) (test: ai.secrets)
- [x] B5 — Giao diện "Kết nối AI": trạng thái từng nhà cung cấp, kiểm thử, nhập khoá, khởi động OmniRoute (kiểm thủ công trong trình duyệt)
- [x] B6 — Mức dùng token của router được ghi vào sổ cái/ngân sách (test: ai.ledger)
- [x] B7 — Chọn model tự động theo danh sách `/models` khi model mặc định không tồn tại (test: ai.router.model)

## C. Công cụ thật cho nhân viên
- [x] C1 — Đọc/ghi file trong workspace qua `GuardedFs` (có hỏi quyền) (test: tools.files)
- [x] C2 — `web_fetch` chặn SSRF (IP nội bộ, redirect, DNS), giới hạn dung lượng, bọc nội dung không tin cậy, phát hiện prompt injection (test: tools.web)
- [x] C3 — CRM cục bộ (liên hệ, giao dịch, hoạt động) bằng SQLite + REST + hiển thị trong giao diện (test: crm.store; kiểm thủ công giao diện)
- [x] C4 — Email: soạn nháp, gửi qua SMTP **chỉ sau khi người dùng duyệt**, đọc hộp thư qua IMAP (test: tools.email với máy chủ giả)
- [x] C5 — Lịch: tạo sự kiện, xuất `.ics` (test: tools.calendar)
- [x] C6 — GitHub: đọc/tạo issue, tạo cần duyệt (test: tools.github với fetch giả)
- [x] C7 — Cổng duyệt hành động: hết hạn, từ chối, chỉ duyệt đúng một lần (test: gate)
- [x] C8 — Bộ chạy agent kiểu ReAct: đọc JSON lỗi vẫn chạy, giới hạn bước, danh sách công cụ theo vai trò, cắt kết quả dài (test: executor)
- [x] C9 — Agent chạy việc thật qua router (không cần Cursor) trong `TaskRunner`, có ghi sổ cái (test: taskrunner.router)

## D. Bảo mật
- [x] D1 — Truy cập từ ngoài loopback bắt buộc token (test: auth.remote)
- [x] D2 — So sánh token hằng thời gian, cookie HttpOnly + SameSite=Strict, giới hạn thử sai (test: auth.bruteforce)
- [x] D3 — WebSocket cũng yêu cầu token khi truy cập từ ngoài (test: auth.ws)
- [x] D4 — Che khoá/token trong nhật ký, sự kiện và phản hồi API (test: redact)
- [x] D5 — Công cụ không thoát được sandbox: đường dẫn, SSRF, tên file email/lịch (test: tools.sandbox)
- [x] D6 — `npm audit --omit=dev` = 0 lỗ hổng (lệnh)
- [x] D7 — Có bật chế độ LAN rõ ràng (cấu hình + token), mặc định chỉ loopback (test: network.config)

## E. Đa ngôn ngữ toàn hệ thống
- [x] E1 — Thông báo duyệt (quyền, token, hành động) có khoá + biến, client dịch (test: i18n.server.approvals)
- [x] E2 — Lỗi tác vụ/Cursor/ngân sách có khoá + biến (test: i18n.server.errors)
- [x] E3 — Nghiệm thu của nút cha là dữ liệu có cấu trúc, client định dạng theo ngôn ngữ (test: dispatcher.review.structured)
- [x] E4 — Lỗi API trả `code` + client dịch (test: api.codes)
- [x] E5 — Prompt gửi LLM và câu trả lời mặc định theo ngôn ngữ người dùng (test: prompts.lang)
- [x] E6 — Từ điển vi/en đủ khoá cho cả chuỗi do server sinh (test: i18n.parity)
- [x] E7 — Không còn chữ tiếng Việt lọt vào giao diện tiếng Anh: nhãn "đang làm", lý do cần duyệt, dòng nhật ký trên bong bóng/màn hình bàn dịch theo khoá; quét DOM mọi tab sau khi chạy việc thật (test: labels.i18n; verify-ui)

## F. Nhân vật
- [x] F1 — Mỗi nhân viên có ngoại hình riêng, ổn định theo id (bảng persona), không trùng nhau (test: personas.unique)
- [x] F2 — Trang phục theo tầng (Giám đốc vest + cà vạt vàng, Trưởng phòng sơ mi + cà vạt, Nhân viên thường phục) và huy hiệu theo màu phòng (test: personas.tier)
- [x] F3 — Phản ứng khi nhận/giao việc (giơ tay, chỉ tay), không phá hành vi khác (test: behavior.react)
- [x] F4 — Họp: Giám đốc + trưởng phòng liên quan đi tới phòng họp rồi quay về khi việc được giao cho ≥2 phòng (test: behavior.meeting)
- [x] F5 — Biểu cảm/tư thế theo trạng thái (làm việc, chờ duyệt, bị chặn, xong việc) (test: behavior.mood)
- [x] F6 — Hành vi nhàn rỗi đa dạng, có giới hạn đồng thời, tắt được (đã có; test: behavior.idle)
- [x] F7 — Nhãn tên có chức danh/tầng, tự ẩn theo khoảng cách (đã có; kiểm thủ công)

## G. Cơ sở vật chất
- [x] G1 — Phòng họp (bàn dài, ghế, màn hình) với nav và chỗ ngồi (test: facilities.layout)
- [x] G2 — Pantry (máy cà phê, tủ lạnh, bàn) — hành động "cà phê" đi tới đây khi gần (test: behavior.pantry)
- [x] G3 — Sảnh lễ tân (quầy, logo công ty, ghế chờ)
- [x] G4 — Sàn riêng cho từng khu (gỗ, thảm, gạch) bằng texture sinh sẵn (kiểm thủ công)
- [x] G5 — Ban đêm đèn phòng/đèn bàn sáng lên (test: night.lights)
- [x] G6 — Mọi điểm đến (pantry, phòng họp, sảnh, đài phun nước, ghế) đều tới được từ mọi chỗ ngồi trong giới hạn đi bộ hoặc có phương án dự phòng (test: nav.reachability)
- [x] G7 — Các phòng không chồng nhau, mọi đồ đạc nằm trong phòng, phòng tiện ích không có chỗ ngồi (test: facilities.layout)

## H. Trải nghiệm & độ bền
- [x] H1 — Onboarding, Cài đặt, vi/en, responsive (đã có; kiểm thủ công)
- [x] H2 — Giao diện có tab Kết nối AI, CRM, Truy cập LAN (kiểm thủ công trong trình duyệt)
- [x] H3 — Dữ liệu bền: cây giao việc, CRM, lịch, email nháp sống sót sau khi khởi động lại (test: persistence)
- [x] H4 — `npm run typecheck`, `npm test`, `npm run build` đều sạch (lệnh)
- [x] H5 — Tài liệu cập nhật: kiến trúc, công cụ, kết nối AI, bảo mật LAN (đọc `docs/office-3d.md`)
- [x] H6 — Bản đóng gói chạy được và phục vụ trang `/office-3d/` + API (kiểm thủ công qua CDP)
- [x] H7 — Có kiểm tra trạng thái tổng thể `GET /api/health` (kết nối AI, DB, bộ nhớ) và hiển thị trong giao diện (test: health)
- [x] H8 — Bộ test và kịch bản kiểm không để lại thư mục tạm hay tiến trình mồ côi, kể cả khi kịch bản tự nó lỗi giữa chừng (lệnh: đếm `funnyovs-*` trong thư mục tạm trước/sau)

## I. Hiệu năng & độ bền (v2)
- [x] I1 — Tự hạ chất lượng đồ hoạ khi máy yếu (khung hình kéo dài), có tuỳ chọn Tự động/Cao/Thấp trong Cài đặt (test: quality.auto)
- [x] I2 — Ngân sách dựng hình đo được: số lệnh vẽ + số tam giác của cả cảnh dưới ngưỡng ghi trong tài liệu (kiểm bằng trình duyệt thật: verify-ui)
- [x] I3 — Mất kết nối rồi hồi phục: tắt server → hiện banner; bật lại → giao diện tự nối lại, dữ liệu khôi phục, không cần tải lại trang (verify-ui)

## J. Tiếp cận & chất lượng giao diện (v2)
- [x] J1 — Mọi nút/ô nhập/liên kết có tên truy cập được; `lang` của trang đổi theo ngôn ngữ; hộp thoại có role/aria-modal và bẫy focus (verify-ui)
- [x] J2 — Dùng được chỉ bằng bàn phím cho luồng chính: mở tab, giao việc, duyệt/từ chối yêu cầu, đóng hộp thoại (verify-ui)
- [x] J3 — Yêu cầu duyệt mới được thông báo cho trình đọc màn hình (vùng aria-live) và có thể duyệt bằng bàn phím (verify-ui)

- [x] J4 — Giảm chuyển động: theo `prefers-reduced-motion` của hệ điều hành, ép tay Đầy đủ/Giảm trong Cài đặt; khi giảm không có pháo giấy, xung, tờ giấy bay, không đi họp/nghỉ giải lao, camera nhảy thẳng, CSS tắt chuyển tiếp (test: motion; verify-ui)
- [x] J5 — Tương phản chữ đạt WCAG AA (4,5:1; chữ lớn 3:1) ở mọi tab và hộp Cài đặt, cả hai ngôn ngữ; bộ đo tự kiểm bắt được mẫu chữ kém (verify-ui)

## K. Vận hành thật (v2)
- [x] K1 — Nhật ký bảo mật chỉ-ghi-thêm: đặt/xoá khoá AI, đổi cấu hình email/GitHub, bật LAN, đổi mã, duyệt/từ chối hành động, gửi email; không bao giờ chứa bí mật (test: audit.log)
- [x] K2 — Sao lưu/khôi phục dữ liệu (CRM, lịch, email nháp, cây giao việc) ra một tệp JSON; khôi phục có kiểm tra schema và không ghi đè khi tệp hỏng (test: backup.roundtrip)
- [x] K3 — Lịch giao việc lặp lại (hằng ngày/tuần vào giờ đặt) lưu bền, tự giao cho Giám đốc đúng giờ, bỏ qua khi dừng khẩn cấp, có giao diện quản lý (test: schedule.tick; verify-ui)

## L. Hiển thị việc trong cảnh (v2)
- [x] L1 — Bảng việc sống ở phòng Giao việc: các luồng việc đang chạy và trạng thái từng cấp, cập nhật theo thời gian thực, đúng ngôn ngữ (test: board.paint; ảnh chụp)
- [x] L2 — Việc đang chờ duyệt/lỗi hiện dấu hiệu trên bàn của người phụ trách (huy hiệu số việc mở), không che nhân vật (ảnh chụp)
- [x] L3 — Bảng việc đúng cả khi dữ liệu đến lệch (cha chưa kịp cập nhật danh sách con): server phát lại cha khi có con mới và client tính theo `parentId` (test: dispatcher.reemit, workboard.stale; verify-ui)

## M. Đầu ra công việc (v3)
- [x] M1 — Luồng việc đã kết thúc tải được thành báo cáo Markdown: đúng ngôn ngữ, có tóm tắt của Giám đốc và kết quả/lỗi từng người, nội dung do AI viết không phá cấu trúc, tên tệp an toàn (test: flowReport; verify-ui)

---

## Bảng chứng cứ (mỗi dấu `[x]` ở trên dựa vào đâu)

Lệnh kiểm tra lần cuối: `npm run typecheck` (sạch) · `npm test` (**366 test**, 24 file) · `npm run build` (sạch) · `npm audit --omit=dev` (0 lỗ hổng) ·
`npm run verify:ui` (107 bước giao diện, Chrome thật) · `npm run verify:desktop` (24 bước trên bản đóng gói chạy thật).

| Tiêu chí | Chứng cứ |
|---|---|
| A1–A3, A7 | `tests/dispatcher.test.ts` › "lập kế hoạch bằng LLM (A1, A2, A3, A7)" |
| A4, A5, A6 | `tests/dispatcher.test.ts` › "OrgDispatcher" (thử lại một lần, báo cáo tổng hợp, bước phụ thuộc) |
| B1, B2, B3, B7 | `tests/ai.test.ts` › các nhóm "(B1)", "(B2)", "(B3)", "(B7)" (fetch giả — không gọi mạng thật) |
| B4 | `tests/ai.test.ts` › "kho bí mật và che khoá (B4, D4)" |
| B5 | `scripts/verify-ui.mjs` (tab AI: trạng thái, kiểm thử, dán/xoá khoá, chấm sức khoẻ) + `tests/ai.test.ts` › "khởi động OmniRoute" (spawn giả) |
| B6 | `tests/integration.test.ts` › "agent chạy việc THẬT…" (sổ cái `router:mock`, `provider-usage`) |
| C1 | `tests/tools.test.ts` › "công cụ file qua GuardedFs (C1)" |
| C2 | `tests/tools.test.ts` › "chống SSRF (C2, D5)", "web_fetch, kb, quyền theo vai trò" |
| C3 | `tests/tools.test.ts` › "CRM…", "công cụ CRM qua LLM"; `tests/integration.test.ts` › REST CRM; `scripts/verify-ui.mjs` (tab CRM) |
| C4, C5, C6 | `tests/tools.test.ts` › "email có duyệt (C4)", "(C3, C5, H3)" (lịch + ICS), "GitHub (C6)" — máy chủ/`fetch` giả |
| C7, C8 | `tests/tools.test.ts` › "cổng duyệt hành động (C7)", "bộ chạy agent ReAct (C8)" |
| C9 | `tests/integration.test.ts` › "TaskRunner + router + công cụ (C9)" |
| D1–D3, D7 | `tests/auth.test.ts` (token ngoài loopback, cookie/chống dò, WebSocket, cấu hình LAN) |
| D4 | `tests/ai.test.ts` (redact), `tests/integration.test.ts` › "khoá/mật khẩu không bao giờ nằm trong phản hồi" |
| D5 | `tests/tools.test.ts` (SSRF, đường dẫn, header injection email, tên file) + `tests/safety.test.ts` |
| D6 | `npm audit --omit=dev` → 0 vulnerabilities |
| E1, E2, E6 | `tests/integration.test.ts` › "thông báo do server sinh đều có khoá và được dịch" (quét tĩnh mọi khoá `err./approval./log./task./prompt./perm./val./ai.*`), `tests/i18n.test.ts` |
| E3 | `tests/dispatcher.test.ts` › "nghiệm thu CÓ CẤU TRÚC từng cấp (E3)" |
| E4 | `tests/integration.test.ts` › "REST nghiệp vụ…" (mã `loopbackOnly`, `unknownProvider`, `val.*`…), `tests/ui-logic.test.ts` › "dịch lỗi API" |
| E5 | `tests/dispatcher.test.ts` (A3), `tests/integration.test.ts` › "agent tuân theo ngôn ngữ của người yêu cầu (E5)" |
| F1–F5 | `tests/characters.test.ts` (persona không trùng, trang phục theo tầng dựng thật vào rig, phản ứng, họp, pose có thật trong rig) |
| F6 | `tests/client.test.ts` › "hành vi nhàn rỗi (có lưới A*)" (giới hạn `MAX_AWAY`, công tắc tắt) |
| F7 | Ảnh chụp bằng `scripts/shot-ui.mjs` (nhãn có chức danh/tầng, tự nhỏ khi camera gần, ẩn khi xa) |
| G1, G2, G5, G6, G7 | `tests/facilities.test.ts` (bố cục, đường đi tới mọi điểm đến, pantry, đèn ban đêm) |
| G3, G4 | `tests/facilities.test.ts` (đồ trong sảnh, loại sàn) + ảnh chụp `scripts/shot-ui.mjs --room Lobby` (logo, quầy, ghế chờ, thảm/gỗ/gạch) |
| H1, H2, H7 | `scripts/verify-ui.mjs` (vi/en, tab AI/CRM, Cài đặt LAN/Email/GitHub, chấm sức khoẻ) + ảnh ở 420 px |
| H3 | `tests/integration.test.ts` › "dữ liệu bền qua khởi động lại (H3)", `tests/hardening.test.ts`, `tests/tools.test.ts` |
| H4 | các lệnh ở đầu bảng này |
| H5 | `docs/office-3d.md`, `README.md`, `NOTICE.md`, `docs/06-san-sang-thi-truong.md` |
| H6 | `node scripts/verify-desktop.mjs` (chạy `release/win-unpacked/FunnyOVS.exe` qua CDP, thư mục dữ liệu tạm) |

### Chứng cứ cho tiêu chí v2 đã đạt

| Tiêu chí | Chứng cứ |
|---|---|
| I1 | `tests/quality.test.ts` (giám sát khung hình: không hạ oan khi khởi động/đứng hình thoáng qua, hạ đúng một lần khi chậm kéo dài; mặc định "Tự động") |
| I2 | `node scripts/verify-ui.mjs`: mức Cao ≤ 1.800 lệnh vẽ và ≤ 1.000.000 tam giác (đo: 1.564 / 858.780); mức Thấp ≤ 450.000 và < 55% mức Cao (đo: 337.284) · `tests/characters.test.ts` › "mức chi tiết hình học" |
| K1 | `tests/audit.test.ts` (6) + `tests/integration.test.ts` › "nhật ký bảo mật (K1)" · hiển thị ở Cài đặt (`scripts/verify-ui.mjs`) |
| K2 | `tests/backup.test.ts` (7) + `tests/integration.test.ts` › "sao lưu qua REST (K2)" · tải tệp thật, đổi dữ liệu, khôi phục trong trình duyệt thật (`scripts/verify-ui.mjs`) |
| K3 | `tests/schedule.test.ts` (10) + `tests/integration.test.ts` › "việc lặp lại qua REST (K3)" · tạo/chạy ngay/tạm dừng/xoá trong trình duyệt thật (`scripts/verify-ui.mjs`) |
| I3 | `scripts/verify-ui.mjs` › "Hỗn loạn": giết máy chủ thật → biểu ngữ "Connection lost" + chấm Offline, giao diện không sập (vẫn bấm được tab), khởi động lại cùng dữ liệu → tự nối lại không cần tải lại trang, dữ liệu còn nguyên, bảng CRM tải lại; lần chết thứ hai bấm *Retry now* nối lại trong ~0,1 s; không có lỗi JS chưa bắt. Bắt được lỗi thật: biểu ngữ đè lên các tab (đã sửa) |
| J1 | `scripts/a11y-audit.mjs` chạy trên 5 tab + hộp Cài đặt × 2 ngôn ngữ: tên truy cập, `lang`, hộp thoại (role/aria-modal/tên), tabindex, id trùng, ảnh/canvas, vùng aria-live, từng tablist (tên, aria-controls, một tab trong thứ tự Tab). Bắt được lỗi thật: thanh mục con CRM sai chuẩn tablist (đã sửa) |
| J2 | `scripts/verify-ui.mjs` › "Bàn phím": ←/→/Home/End đổi tab, Tab tới ô giao việc trong 2 lần, `Ctrl+Enter` giao việc → thông báo + luồng mới; Enter mở Cài đặt, Tab/Shift+Tab 70 lần không rơi ra ngoài, Esc đóng và trả focus · `tests/ui-logic.test.ts` › "tiếp cận" |
| J3 | `scripts/verify-ui.mjs` › "Duyệt": yêu cầu quyền thật → vùng `aria-live="assertive"` đọc "Needs your approval: …" kèm tên; từ đầu trang Tab tới nút duyệt trong 1 lần, Enter → thẻ biến mất, máy chủ ghi nhận, đọc lại tệp được phép (200) |
| J4 | `tests/motion.test.ts` (bảng quyết định, đọc media query an toàn, cài đặt) · `scripts/verify-ui.mjs` › "Giảm chuyển động": hệ điều hành yêu cầu giảm → `data-motion=reduced`, cảnh 3D biết, CSS tắt chuyển tiếp; chọn *Full* trong Cài đặt thắng ưu tiên hệ điều hành. Bắt được lỗi thật: khối `@media` cũ chặn nút ép tay (đã sửa) |
| J5 | `scripts/verify-ui.mjs` › "Tương phản": 12 lượt đo (5 tab + hộp Cài đặt × vi/en), mỗi lượt vài chục đến vài trăm đoạn chữ; bước tự kiểm chứng minh bộ đo bắt được mẫu xấu |
| L1 | `tests/workboard.test.ts` (tổng hợp luồng, vẽ bảng vi/en, chỉ vẽ lại khi đổi, thanh tiến độ đúng tỉ lệ) · `scripts/verify-ui.mjs` › "Bảng việc": LLM giả chậm → luồng `running` hiện trên bảng ngay khi giao việc, khoá nội dung chứa tiêu đề, sang `done` khi nghiệm thu xong · ảnh chụp Phòng Giao việc |
| L2 | `tests/workboard.test.ts` › "huy hiệu" (đếm đúng người, ưu tiên lỗi > chờ duyệt > mở, tự hết hạn, "9+") · `scripts/verify-ui.mjs` › "Huy hiệu": Giám đốc có huy hiệu lúc mở việc, 4 bàn cùng có huy hiệu khi việc chia xuống, tắt hết khi xong · ảnh chụp phòng Bán hàng (huy hiệu cạnh màn hình, không che người) |
| L3 | `tests/dispatcher.test.ts` › "mỗi lần cha có thêm con, cha được phát lại…" · `tests/workboard.test.ts` › "cha chưa kịp cập nhật childIds" · bắt được khi chạy thật: bảng ghi "0/0" suốt lúc việc đang chạy |
| E7 | `tests/ui-logic.test.ts` › "nhãn do server sinh được dịch…" (`taskLabel`, `approvalReasonLabel`, `logLine`), `tests/office.test.ts` (metadata mang khoá) · `scripts/verify-ui.mjs` quét `innerText` của cả 5 tab sau khi chạy việc thật (trừ tên người). Bắt được lỗi thật: nhãn "Đang lập kế hoạch: …" của Giám đốc còn tiếng Việt |
| H8 | Trước/sau `npm test` và `npm run verify:ui` không còn thư mục `funnyovs-*` nào (trước đó bộ test để rò hơn 1.300 thư mục) · `scripts/verify-ui.mjs` bọc mọi bước trong `try/finally` |
| M1 | `tests/flowReport.test.ts` (6): cấu trúc báo cáo vi/en, lỗi dịch theo ngôn ngữ, nội dung do AI viết được trích dẫn nên không phá tiêu đề/khối mã, bản thay thế bị bỏ, tên tệp an toàn (bỏ dấu, không `../`) · `scripts/verify-ui.mjs` › "Báo cáo": bấm *Download report* trong Chrome thật → tệp `.md` đúng tên, nội dung có tiêu đề, trạng thái, tóm tắt Giám đốc, kết quả từng người |

## Điều thước đo này KHÔNG nói

Đạt 10/10 ở bảng trên nghĩa là mọi tiêu chí đã kiểm chứng — **không** có nghĩa hoàn hảo. Còn nằm ngoài bảng: thử SMTP/IMAP/GitHub/khoá AI **thật** của bạn, ký số + cập nhật tự động,
pháp lý/thanh toán, kiểm thử trên máy người khác, đo hiệu năng trên GPU yếu, trình đọc màn hình. Xem `docs/06-san-sang-thi-truong.md`.
