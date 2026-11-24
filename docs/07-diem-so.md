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
- [x] B2 — Tự nhận khoá miễn phí từ biến môi trường: Groq, OpenRouter, Gemini, Cerebras, Mistral, NVIDIA NIM, SambaNova (test: ai.detect.env, aiCustom.catalog)
- [x] B3 — Router thử lần lượt nhiều nhà cung cấp, ngắt mạch khi lỗi liên tiếp, tôn trọng 429/Retry-After (test: ai.router.fallback)
- [x] B4 — Khoá API lưu file quyền 0600, không bao giờ trả về client (chỉ bản che) (test: ai.secrets)
- [x] B5 — Giao diện "Kết nối AI": trạng thái từng nhà cung cấp, kiểm thử, nhập khoá, khởi động OmniRoute (kiểm thủ công trong trình duyệt)
- [x] B6 — Mức dùng token của router được ghi vào sổ cái/ngân sách (test: ai.ledger)
- [x] B7 — Chọn model tự động theo danh sách `/models` khi model mặc định không tồn tại (test: ai.router.model)
- [x] B8 — Nút "+ Thêm API": thêm nguồn tuỳ chỉnh (mọi điểm cuối tương thích OpenAI) và dùng như mọi nguồn khác; khoá chỉ nằm ở kho khoá 0600, không ở `ai.json`/trạng thái/phản hồi/nhật ký (test: aiCustom.add; verify-ui)
- [x] B9 — Kiểm tra điểm cuối **thật** trước khi lưu (số model, thiếu/sai khoá, lỗi HTTP, đứt mạng, địa chỉ sai — mỗi kết quả có khoá i18n); đầu vào bị chặn: giao thức lạ, tài khoản trong URL, id trùng danh mục, vượt giới hạn (test: aiCustom.check, aiCustom.validate)
- [x] B10 — Sửa/xoá nguồn tuỳ chỉnh dọn sạch bản ghi + khoá + thứ tự; đổi sang địa chỉ khác thì khoá cũ KHÔNG tự theo sang (không rò khoá sang máy chủ lạ); nguồn dựng sẵn không sửa/xoá được (test: aiCustom.edit)
- [x] B11 — Gom như 9router: thứ tự ưu tiên người dùng sắp (áp cho cả nguồn dựng sẵn), chiến lược dự phòng/xoay vòng đều tải và tự dự phòng khi lỗi; một nguồn chậm/đứt mạng không làm chậm cuộc gọi AI (test: aiCustom.order)
- [x] B12 — Cổng 9router dùng chung mục OmniRoute (cùng `:20128/v1`), nút khởi động thử lần lượt `omniroute` rồi `9router` và báo lỗi nhắc cài cả hai; GitHub Models (đã ngừng) bị gỡ khỏi danh mục (test: aiCustom.gateway, aiCustom.catalog)

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

## N. Bố cục & đồ đạc chibi (v4)
- [x] N1 — Mọi bàn làm việc dựng từ một bộ đồ đạc chibi (bàn bo tròn mép màu phòng, ghế màu phòng — Giám đốc ghế lưng cao, màn hình có huy hiệu phòng, món đồ riêng theo từng người); cùng cao độ với màn hình hiển thị nên không lệch/không z-fighting (test: chibiRooms.workstation)
- [x] N2 — Mỗi phòng có bản sắc riêng: ốp chân tường + viền + tranh màu phòng nằm trọn trong phòng; thư viện có kệ sách rỗng với sách thật (test: chibiRooms.wainscot, chibiRooms.shelf)
- [x] N3 — Hộp bo tròn (không chỉ mục) gộp được cùng hộp/trụ/cầu thường (có chỉ mục) mà không làm mất mesh; hình học cache theo kích thước, hai mức chi tiết (test: chibiRooms.softBox, chibiRooms.merge)
- [x] N4 — Phòng tiện ích (họp, pantry, sảnh) và đồ đặc trưng từng phòng (sofa, quầy, tủ lạnh, tủ server…) cùng ngôn ngữ bo tròn mềm, vẫn khớp vùng chặn và điểm đứng/ngồi (test: facilities.layout, nav.reachability)
- [x] N5 — Ngân sách dựng hình vẫn đạt (I2) sau khi đổi toàn bộ đồ đạc và dựng vỏ toà nhà, ở cả hai mức chất lượng (verify-ui)
- [x] N6 — Mọi phòng nằm trong MỘT toà nhà liền: tường ngoài bao quanh cách phòng ≥ 2 m, cửa chính ở tường nam thẳng trước sảnh lễ tân, hai sân trong không đè phòng nào; lưới đường đi chặn tường ngoài, chừa cửa chính, từ sảnh đi ra cửa được (test: building.shell)

## O. Kinh tế tự trị — giai đoạn 1 (v5)
- [x] O1 — Sổ cái kinh tế băm nối, không xoay vòng, không chứa bí mật; sửa/xoá/chèn/đổi thứ tự một dòng cũ bị `verify()` phát hiện và hiện cảnh báo (test: economy.ledger)
- [x] O2 — Cổng thanh toán CHỈ NHẬN tiền: x402 (chỉ địa chỉ công khai; khoá riêng, mạng chính, facilitator http, mạng lạ bị từ chối), Stripe (khoá live bị từ chối; chỉ chấp nhận phiên đã trả đúng số tiền/sản phẩm/chế độ), mock (test: economy.payment)
- [x] O3 — Xuất bản sản phẩm qua hộp duyệt; quét riêng tư (email, điện thoại, IP, bí mật, tên/công ty CRM); trần giá; tệp bị sửa sau khi duyệt thì không bán (test: economy.publish, economy.products)
- [x] O4 — Paywall: 402 kèm yêu cầu thanh toán → thanh toán → 200 + nội dung; chống phát lại (kể cả sau khởi động lại); thất bại không thu tiền; nội dung đổi → 409, dừng khẩn cấp → 503 và không thu (test: economy.paywall; verify-ui)
- [x] O5 — Cổng công khai RIÊNG chỉ có `/health` + 2 đường dẫn insights, chỉ GET, giới hạn tốc độ theo IP và toàn cục, không lộ API chính (test: economy.public; verify-ui)
- [x] O6 — Scout chỉ ĐỀ XUẤT: luôn qua hộp duyệt, hết hạn = từ chối, ghi sổ cái + nhật ký, không tự thực thi hay chi tiền; Phòng Tài chính vẫn không có `web_fetch` (test: economy.propose, tools.policy)
- [x] O7 — Vòng lặp: chu kỳ = doanh thu − (token quy ước + hạ tầng + chi phí ghi tay); lỗ N chu kỳ liên tiếp → tự tạm dừng Scout và báo; tiếp tục bật lại Scout đúng như trước; đề xuất tái đầu tư có ngưỡng và thời gian chờ, chỉ ghi quyết định (test: economy.loop)
- [x] O8 — Dừng khẩn cấp dừng cả EAL: 503 không thu tiền, không chu kỳ, từ chối xuất bản/đề xuất, từ chối hộp duyệt đang chờ (test: economy.*; verify-ui)
- [x] O9 — Hiển thị: bảng KPI 3D ở Phòng Tài chính + thẻ ở tab Tổng quan; sự kiện `economy.state`/`economy.event` hợp lệ trong schema chung; tóm tắt hộp duyệt được dịch vi/en (test: economy.events; verify-ui)
- [x] O10 — Mô phỏng 30 ngày chạy MÃ THẬT với dữ liệu giả, hạt giống cố định, nêu rõ giả định và giới hạn (`npm run economy:backtest` → `docs/economy-backtest.md`)

## P. Studio dựng clip (v5)
- [x] P1 — Dữ liệu mẫu của kit qua bộ kiểm tra; shot list phải phủ kín từng cảnh s1–s8 liền mạch (hở/chồng/thiếu cảnh/trùng id/toạ độ quá lớn bị từ chối); lời đọc đúng 10 câu, không rỗng, không quá dài (test: studio.schema)
- [x] P2 — Dữ liệu chỉ ghi trong `<workspace>/studio/<dự-án>/`: tên dự án và đường dẫn bị kiểm (`../`, ký tự lạ bị từ chối), ghi nguyên tử, lời đọc chứa thứ giống khoá/bí mật không được lưu (test: studio.save)
- [x] P3 — Gửi lời đọc ra dịch vụ giọng online LUÔN qua hộp duyệt; từ chối/hết hạn/huỷ thì không chạy bước giọng; giọng đã tạo (cùng văn bản + giọng) dùng lại không cần duyệt, sửa một câu thì phải duyệt lại (test: studio.voice; verify-ui)
- [x] P4 — Một việc một lúc, chạy nền, tiến độ theo bước/khung hình, huỷ giữa chừng dừng cả cây tiến trình, bước lỗi báo rõ và che bí mật (test: studio.jobs)
- [x] P5 — Dừng khẩn cấp: không lưu, không dựng, huỷ việc đang chạy và hộp duyệt đang chờ (test: studio.jobs; verify-ui)
- [x] P6 — Công cụ agent `studio_save/render/status` theo đặc quyền tối thiểu (chỉ Marketing và Automation Lab), lỗi dữ liệu trả thông báo dễ hiểu thay vì ném lỗi (test: studio.tools)
- [x] P7 — REST: ghi/dựng/huỷ chỉ từ chính máy (`loopbackOnly`), đọc trạng thái dùng được từ xa; chỉ phục vụ clip mp4 và ảnh xem thử của dự án hợp lệ (test: studio.rest)
- [x] P8 — Hiển thị: thẻ Studio ở tab Tổng quan (dự án, xem thử, dựng, tiến độ, huỷ, xem clip), sự kiện `studio.state` hợp lệ trong schema chung, chuỗi vi/en đầy đủ (test: studio.i18n; verify-ui)
- [x] P9 — Kết xuất THẬT: xem thử bằng Chrome (10 ảnh) và dựng video đầy đủ (H.264 + AAC, 74,6 s) bằng bộ chạy thật, không dùng giả lập (`scripts/studio-e2e.mts`; verify-ui)
- [x] P10 — Bản đóng gói có kit + three tối thiểu và chạy được kết xuất thật bên trong app (verify:desktop)

---

## Bảng chứng cứ (mỗi dấu `[x]` ở trên dựa vào đâu)

Lệnh kiểm tra lần cuối: `npm run typecheck` (sạch) · `npm test` (**477 test**, 29 file) · `npm run build` (sạch) · `npm audit --omit=dev` (0 lỗ hổng) ·
`npm run verify:ui` (153 bước giao diện, Chrome thật) · `npm run verify:desktop` (29 bước trên bản đóng gói chạy thật, gồm dựng xem thử Studio).

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
| I2 | `node scripts/verify-ui.mjs`: mức Cao ≤ 1.800 lệnh vẽ và ≤ 1.000.000 tam giác (đo sau khi đổi đồ đạc chibi: 1.324 / 932.908); mức Thấp ≤ 450.000 và < 55% mức Cao (đo: 390.036 ≈ 42% mức Cao) · `tests/characters.test.ts` › "mức chi tiết hình học" |
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
| B8–B12 | `tests/aiCustom.test.ts` (18): "kiểm tra đầu vào của nguồn tuỳ chỉnh", "thêm nguồn tuỳ chỉnh và dùng nó như mọi nguồn khác" (khoá chỉ ở kho khoá, không ở trạng thái/`ai.json`), "sửa và xoá" (đổi địa chỉ thì khoá cũ bị xoá), "gom nhiều nguồn như 9router: thứ tự ưu tiên và xoay vòng" (kể cả nguồn chậm không làm chậm cuộc gọi), "kiểm tra điểm cuối trước khi lưu", "cổng gom OmniRoute / 9router", "nguồn miễn phí dựng sẵn" · `tests/integration.test.ts` (REST `/api/ai/custom*`, `/api/ai/order`, `/api/ai/strategy`: `loopbackOnly`, nhật ký không có khoá) · `scripts/verify-ui.mjs` › "Thêm API" (mở biểu mẫu, chọn mẫu, kiểm tra, lưu, thẻ nguồn tuỳ chỉnh, mũi tên thứ tự, đổi chiến lược, sửa, xoá — Chrome thật) |
| N6 | `tests/facilities.test.ts` › "toà nhà liền" (5): phòng trong toà nhà, cửa chính trước sảnh, sân trong không đè phòng, lưới A* (tường chặn/cửa thông/đường từ sảnh ra cửa), dựng vỏ < 60 mesh và nằm trong nền lát · ảnh `docs/shots/v4-building.png`, `v4-entrance.png` |
| N1–N5 | `tests/chibiRooms.test.ts` (9): softBox cache/kẹp bán kính/hai mức chi tiết, `mergeStatic` không mất mesh khi trộn hình có/không chỉ mục, `bakeGroup`, bàn làm việc (hằng số khớp màn hình hiển thị, ≤ 16 lệnh vẽ, ngân sách tam giác hai mức, món đồ riêng đa dạng giữa 17 người, ghế Giám đốc cao hơn), ghế, kệ sách có sách, ốp tường trong phòng · `tests/facilities.test.ts` (đường đi, vùng chặn) · `scripts/verify-ui.mjs` bước ngân sách I2 · ảnh chụp từng phòng `docs/shots/v4-*.png` bằng `scripts/shot-ui.mjs --room …` |
| O1–O9 | `tests/economyBoard.test.ts` (5 test: bảng KPI vẽ đủ số liệu và cơ hội chờ duyệt, chỉ vẽ lại khi đổi) · `tests/economy.test.ts` (45 test: sổ cái, rail x402/Stripe/mock với `fetch` giả, sản phẩm/riêng tư, xuất bản, paywall, đề xuất, chu kỳ, chính sách tiếp tục/tái đầu tư, cổng công khai, REST, sự kiện) · `scripts/verify-ui.mjs` nhóm "Kinh tế" (21 bước: thẻ + bảng KPI 3D, hộp duyệt xuất bản, 402/200/phát lại, cổng riêng không lộ API chính, chu kỳ + hộp duyệt tái đầu tư, dừng khẩn cấp, nhật ký) · `tests/tools.test.ts` (đặc quyền tối thiểu) |
| O10 | `docs/economy-backtest.md` (sinh bởi `scripts/economy-backtest.ts`) |
| P1–P8 | `tests/studio.test.ts` (22 test: dữ liệu mẫu + schema, lưu/kiểm/bí mật, việc dựng với runner giả, hộp duyệt giọng, công cụ agent + chính sách, REST, i18n) · `scripts/verify-ui.mjs` nhóm "Studio" (10 bước: thẻ, tạo dự án, xem thử THẬT 10 ảnh, hộp duyệt trước khi gửi lời đọc, từ chối không tạo giọng, tên dự án thoát thư mục, dừng khẩn cấp, nhật ký) |
| P9 | `scripts/studio-e2e.mts` (bộ chạy thật: xem thử 3 s; video đầy đủ H.264+AAC 74,6 s trong 47 s) |
| P10 | `scripts/verify-desktop.mjs` (kit + three có trong bản cài; xem thử chạy thật trong app đóng gói) |

## Điều thước đo này KHÔNG nói

Đạt 10/10 ở bảng trên nghĩa là mọi tiêu chí đã kiểm chứng — **không** có nghĩa hoàn hảo. Còn nằm ngoài bảng: thử SMTP/IMAP/GitHub/khoá AI **thật** của bạn, ký số + cập nhật tự động,
pháp lý/thanh toán — kể cả **một giao dịch testnet/Stripe test THẬT của lớp kinh tế (EAL)** (cần ví/khoá của bạn, xem `docs/economy-layer.md`) —, kiểm thử trên máy người khác, đo hiệu năng trên GPU yếu, trình đọc màn hình. Xem `docs/06-san-sang-thi-truong.md`.
