# Sẵn sàng thị trường — đánh giá thẳng thắn

> Ngày: 2026-11-21 · Phiên bản 0.3.0 · Phạm vi: app desktop Windows + giao diện `/office-3d/`.
> Tài liệu này tách rõ **việc đã làm trong mã**, **lỗi đã tìm và sửa**, và **việc chặn bán hàng mà mã không giải quyết được** (cần quyết định, tài khoản, tiền, hoặc người thật).

## 1. Kết luận ngắn

Sản phẩm đã **chạy được, có kiến trúc sạch, có test và đủ các lớp an toàn cơ bản**. Sau đợt nâng cấp thứ hai, bốn hạn chế kỹ thuật lớn của đợt đầu
**đã được giải quyết trong mã** (xem mục 2b): Giám đốc lập kế hoạch bằng LLM, công cụ thật (email/CRM/lịch/GitHub), xác thực token khi mở ra mạng LAN,
và thông báo do server sinh đã dịch được. Kết nối AI giờ là **tự động** (OmniRoute/Ollama/LM Studio hoặc khoá miễn phí) — không còn phụ thuộc Cursor.

Vẫn **chưa nên bán ngay** vì các chặn mà mã không giải quyết được (xem mục 3):

1. **Chưa ký số + chưa có kênh cập nhật** — Windows SmartScreen sẽ cảnh báo; không vá lỗi được cho khách đã cài.
2. **Chưa có giấy phép/thanh toán và văn bản pháp lý** (EULA, chính sách riêng tư).
3. **Chưa kiểm thử trên máy thật của người khác** (GPU yếu, màn hình khác, Windows khác) và chưa có e2e tự động trên bản cài.
4. **Tích hợp với dịch vụ thật bên ngoài** (SMTP/IMAP/GitHub/nhà cung cấp AI) mới được kiểm bằng máy chủ giả trong test và bằng LLM giả khi chạy thử (`scripts/mock-llm.mjs`) — cần thử với tài khoản thật của bạn.

## 2. Đã kiểm tra và sửa trong đợt này

| # | Phát hiện | Mức | Đã làm |
|---|---|---|---|
| 1 | Server không kiểm tra `Host`/`Origin`: trang web lạ có thể mở WebSocket tới `127.0.0.1:<cổng>` hoặc DNS-rebinding để đọc sự kiện/gọi API | **Cao** | `security/httpGuard.ts`: chặn Host không phải loopback (403), kiểm tra Origin khi nâng cấp WebSocket, thêm `X-Frame-Options`, `nosniff`, `Referrer-Policy`, CSP chặt cho `/office-3d/`. Có test. |
| 2 | Mặc định **bật** đọc token Cursor từ máy người dùng | **Cao** (riêng tư) | Mặc định **tắt**; bật bằng công tắc rõ ràng trong Cài đặt kèm giải thích. |
| 3 | `zod` có lỗ hổng DoS (npm audit: 1 high) | Trung bình | Nâng lên zod 4 → `npm audit`: **0 lỗ hổng**. |
| 4 | Cây giao việc nằm trong bộ nhớ, mất khi tắt app | Trung bình | Lưu `org.json` (ghi nguyên tử, gộp), nạp lại khi mở; nút đang chạy được đánh dấu "gián đoạn". |
| 5 | Quyết định quyền luôn báo "duyệt" dù bị từ chối (đọc sai trường) | Trung bình | Sửa + test. |
| 6 | Chữ tiếng Việt bị mã hoá hai lần trong 2 file bảo mật (nhật ký truy cập hiện chữ rác) | Thấp | Giải mã lại. |
| 7 | Bố cục chồng chéo: nhãn tên đè nhau, 17 người đi lại cùng lúc, sofa/đồ đạc vướng bàn | Trải nghiệm | Bàn trưởng phòng/nhân viên **cùng một hàng**, bỏ sofa khỏi phòng làm việc, thêm bình nước; **Phòng Giám đốc riêng** (phòng góc); tối đa 3 người đi lại cùng lúc, nhịp 1–2 phút, có công tắc tắt; nhãn/bong bóng tự ẩn khi thu nhỏ. |
| 8 | Giao diện chỉ có tiếng Việt, không có hướng dẫn lần đầu, không có Cài đặt | Thương mại | i18n **vi/en** (từ điển có test đủ khoá, khớp biến), onboarding, Cài đặt (ngôn ngữ, tên công ty, hoạt cảnh, nhãn, chất lượng đồ hoạ, riêng tư). |
| 9 | Thanh điều khiển chiếm nhiều chỗ, tràn ở cửa sổ hẹp | Trải nghiệm | Thanh đầu mới (tên công ty, trạng thái, mức tự động, dừng khẩn cấp); responsive; dock thu gọn được. |
| 10 | Electron: chưa khoá quyền trình duyệt, không nhớ cửa sổ, không có nhật ký lỗi | Trung bình | Từ chối mọi quyền web, chặn `<webview>`, nhớ vị trí/kích thước (kiểm tra còn nằm trong màn hình), nhật ký `userData/logs/main.log` + mục menu mở thư mục nhật ký, DevTools chỉ ở bản dev. |

## 2b. Đợt nâng cấp thứ hai — bốn hạn chế đã đóng

| Hạn chế cũ | Giờ | Chứng cứ |
|---|---|---|
| Giám đốc tách việc bằng từ khoá | Lập kế hoạch bằng **LLM** (kiểm bằng schema zod, nhiều bước, `dependsOn`, thử lại với người khác, báo cáo tổng hợp bằng LLM); tự quay về từ khoá khi LLM lỗi/không có | `src/server/org/planner.ts`, `dispatcher.ts`; `tests/dispatcher.test.ts` |
| Không có công cụ thật | 19 công cụ theo vai trò: file (qua `GuardedFs`), `web_fetch` chống SSRF, tri thức, **CRM SQLite**, **email SMTP/IMAP** (gửi chỉ sau khi bạn duyệt), **lịch + .ics**, **GitHub**; bộ chạy ReAct độc lập nhà cung cấp | `src/server/agent/*`, `crm/store.ts`; `tests/tools.test.ts` |
| API cục bộ không xác thực | Bật LAN là **cấu hình rõ ràng**; máy khác **bắt buộc token** (so sánh hằng thời gian, cookie HttpOnly + SameSite=Strict, giới hạn thử sai, WebSocket cũng kiểm); thao tác nhạy cảm chỉ từ chính máy | `security/auth.ts`, `network.ts`; `tests/auth.test.ts` |
| Thông báo server còn tiếng Việt khi chọn English | Server gửi `key + vars`; client dịch. Gồm duyệt, lỗi tác vụ/Cursor/ngân sách/AI/xác thực, nghiệm thu có cấu trúc, kiểm tra dữ liệu, trạng thái kết nối AI. Có quét tĩnh: mọi khoá dùng trong mã đều tồn tại ở cả hai ngôn ngữ | `shared/messages.ts`, `shared/aiErrors.ts`; `tests/integration.test.ts`, `tests/ui-logic.test.ts` |
| Phụ thuộc Cursor | Tự dò **OmniRoute / Ollama / LM Studio** + nhận khoá miễn phí (Groq, Gemini, Cerebras, Mistral, OpenRouter `:free`, GitHub Models) từ biến môi trường hoặc ô dán khoá; router dự phòng, ngắt mạch, 429/Retry-After; Cursor chỉ còn là tuỳ chọn | `src/server/ai/*`; `tests/ai.test.ts` |

Ngoài ra: tab **AI / CRM** và mục **Mạng LAN, Email, GitHub** trong Cài đặt; chỉ báo sức khoẻ `GET /api/health`; **phòng họp, pantry, sảnh lễ tân**; mỗi nhân viên một ngoại hình riêng, trang phục theo tầng; họp khi Giám đốc chia việc cho ≥ 2 phòng.

## 2c. Đợt nâng cấp thứ ba — vận hành, hiệu năng, tiếp cận, việc hiện trong cảnh

| Mảng | Đã làm | Chứng cứ |
|---|---|---|
| Vận hành thật | **Nhật ký bảo mật** chỉ-ghi-thêm (không bao giờ chứa bí mật); **sao lưu/khôi phục** ra một tệp JSON (không có khoá/mật khẩu; kiểm schema, nhập trong một giao dịch, luôn giữ bản sao trước khi khôi phục); **việc lặp lại** hằng ngày/tuần, chạy bù một lần khi mở lại, bỏ qua khi dừng khẩn cấp | `security/audit.ts`, `backup/backup.ts`, `schedule/scheduler.ts`; `tests/audit.test.ts`, `backup.test.ts`, `schedule.test.ts`, `integration.test.ts` |
| Hiệu năng | Chất lượng đồ hoạ **Tự động/Cao/Thấp** (tự hạ khi khung hình chậm kéo dài, báo cho người dùng); **ngân sách dựng hình đo được** trong Chrome thật (lệnh vẽ, tam giác) | `lib/autoQuality.ts`; `tests/quality.test.ts`; `scripts/verify-ui.mjs` |
| Độ bền | Trang không trắng khi một khung lỗi (`ErrorBoundary`); phản hồi lạ của máy chủ không làm vỡ giao diện; **máy chủ chết giữa chừng → biểu ngữ → tự nối lại, dữ liệu còn, không có lỗi JS** | `tests/ui-logic.test.ts`; `scripts/verify-ui.mjs` (giết và khởi động lại máy chủ thật) |
| Tiếp cận | `lang` đúng ngôn ngữ, tên truy cập cho mọi điều khiển, hộp thoại có bẫy focus, tab theo mẫu ARIA, luồng chính chỉ bằng bàn phím (`Ctrl+Enter` giao việc), yêu cầu duyệt được đọc to (`aria-live`) và duyệt bằng Enter, **giảm chuyển động** theo hệ điều hành | `scripts/a11y-audit.mjs`; `scripts/verify-ui.mjs`; `tests/motion.test.ts` |
| Việc hiện trong cảnh | **Bảng việc sống** ở phòng Giao việc (luồng đang chạy, trạng thái, tiến độ, người đang làm) và **huy hiệu số việc mở** trên bàn từng người | `assets/workboard.ts`; `tests/workboard.test.ts`; `scripts/verify-ui.mjs` (LLM giả chậm để bắt lúc đang chạy) |
| Đầu ra | Mỗi luồng việc đã kết thúc **tải về thành báo cáo Markdown** (tiêu đề, trạng thái, tóm tắt Giám đốc, kết quả/lỗi từng người; theo ngôn ngữ đang chọn; sinh ngay trên máy) | `ui/flowReport.ts`; `tests/flowReport.test.ts`; `scripts/verify-ui.mjs` |
| Đa ngôn ngữ | Nhãn "đang làm", lý do cần duyệt và dòng nhật ký trên bong bóng/màn hình bàn giờ dịch theo khoá (trước đó vẫn hiện tiếng Việt khi chọn English) | `i18n/index.ts`; `tests/ui-logic.test.ts`; quét DOM mọi tab trong `scripts/verify-ui.mjs` |

**Lỗi thật mà các kiểm tra mới bắt được** (và đã sửa): biểu ngữ mất kết nối **đè lên các tab** nên không bấm được trong lúc mất kết nối · thanh mục con của CRM sai chuẩn tablist ·
máy chủ chỉ phát lại nút cha khi *trạng thái* cha đổi nên client giữ danh sách con cũ (bảng việc hiện "0/0" dù việc đã chia xuống) · nhãn việc của Giám đốc ("Đang lập kế hoạch: …") còn tiếng Việt khi chọn English ·
bộ test để rò hơn 1.300 thư mục tạm (tự dọn từ nay) · kịch bản kiểm giao diện để rơi máy chủ/Chrome khi tự nó lỗi giữa chừng (nay luôn dọn).

## 3. Chặn bán hàng — cần quyết định hoặc nguồn lực bên ngoài

### 3.1 Phụ thuộc Cursor — đã gỡ khỏi đường chính
Đường chính giờ là **bộ kết nối AI** (`AiHub`): app tự dò dịch vụ chạy trên máy và nhận khoá miễn phí của khách, không đọc token của ứng dụng khác.
Cursor CLI/đọc hạn mức vẫn có nhưng là **tuỳ chọn nâng cao, tắt mặc định**. Việc còn lại là pháp lý: hỏi ý kiến trước khi quảng bá tính năng đọc hạn mức Cursor.

### 3.2 Ký số, cập nhật, nền tảng
- **Ký mã Windows** (chứng chỉ OV/EV, có phí hằng năm) — nếu không, SmartScreen cảnh báo "ứng dụng không xác định". Cấu hình `electron-builder` đã sẵn chỗ, chỉ thiếu chứng chỉ.
- **Tự cập nhật** (`electron-updater` + nơi lưu bản phát hành như GitHub Releases/S3). `latest.yml` đã được sinh sẵn nhưng chưa có máy chủ cập nhật và chưa có mã trong app.
- **macOS/Linux**: chưa build. macOS cần tài khoản Apple Developer (notarization) và build lại `better-sqlite3` theo từng hệ điều hành.
- Trình duyệt sandbox cần Chrome/Edge cài sẵn: nên có hướng dẫn hoặc bundle Chromium (phình dung lượng ~150 MB).

### 3.3 Giấy phép, thanh toán, pháp lý
- Chưa có cơ chế bán: khoá bản quyền, đăng ký, dùng thử, hoá đơn. Chọn mô hình trước (mua một lần / thuê bao / miễn phí + trả tiền cho tính năng nhóm).
- Cần văn bản: **EULA**, **Chính sách riêng tư**, tuyên bố miễn trừ về nội dung do AI tạo, thông báo bên thứ ba (đã có `NOTICE.md`; nên sinh tự động danh sách giấy phép thư viện khi build).
- Nếu bán ở EU: GDPR (dữ liệu nằm cục bộ giúp nhiều, nhưng nêu rõ dữ liệu nào gửi tới nhà cung cấp LLM).

### 3.4 Chất lượng chưa chứng minh được
- **e2e tự động**: `scripts/verify-ui.mjs` (Chrome thật, máy chủ cách ly, LLM giả: giao diện, a11y, bàn phím, sao lưu, ngân sách dựng hình, bảng việc sống, máy chủ chết rồi hồi phục) và `scripts/verify-desktop.mjs` (chạy bản đóng gói `FunnyOVS.exe` thật qua CDP). Chưa có e2e trên **máy khác** hay **bản cài** (installer) sạch. Hơn 350 test đơn vị/tích hợp.
- **Hiệu năng**: có ngân sách dựng hình đo được và chế độ Tự động tự hạ khi máy yếu (kiểm bằng logic + GPU phần mềm), nhưng **chưa đo trên GPU yếu/laptop pin thật**.
- **Hỗ trợ tiếp cận**: các bảng, hộp thoại, tab, hộp duyệt đã được quét tự động và thử bằng bàn phím (xem 2c); có giảm chuyển động. Cảnh 3D (canvas) thì trình đọc màn hình không đọc được — các bảng bên cạnh là đường thay thế. **Chưa kiểm bằng trình đọc màn hình thật** (NVDA/JAWS/VoiceOver).

### 3.5 Sản phẩm còn mỏng ở đâu
- Tích hợp thật chỉ kiểm bằng máy chủ giả; cần thử với hộp thư, repo và khoá AI thật của bạn trước khi tin.
- Đầu ra việc: đã có **báo cáo Markdown** tải về cho từng luồng; chưa có PDF/Word và chưa có mẫu báo cáo tuỳ biến. Việc lặp lại đã có (hằng ngày/tuần).
- Danh sách công cụ cố định theo vai trò; chưa có cách thêm công cụ từ bên ngoài (plugin/MCP).
- Chưa có đánh giá bảo mật độc lập (pentest) cho sandbox trình duyệt, công cụ web và quyền thư mục — là điểm bán chính nên đáng đầu tư.

## 4. Lộ trình gợi ý

| Giai đoạn | Mục tiêu | Việc chính |
|---|---|---|
| **0–30 ngày** (đóng chặn kỹ thuật) | Bản beta kín an toàn để cho người lạ dùng | e2e Playwright trên bản cài cho luồng giao việc/duyệt/dừng khẩn cấp; ký số + `electron-updater`; EULA + Chính sách riêng tư; thử trên ≥5 máy khác nhau; thử tích hợp thật (SMTP/IMAP/GitHub/khoá AI) |
| **30–60 ngày** (giá trị cốt lõi) | Làm "công ty thật" có ích | Báo cáo PDF/Word + mẫu tuỳ biến (Markdown đã có); cách thêm công cụ ngoài (MCP); đo hiệu năng trên máy yếu thật (lịch lặp, tự hạ chất lượng đã có) |
| **60–90 ngày** (ra mắt) | Bán được | Mô hình giá + khoá bản quyền; trang giới thiệu + tài liệu tiếng Anh/Việt; telemetry **opt-in** + báo lỗi; build macOS; pentest bên ngoài |

## 5. Danh sách kiểm trước khi phát hành
- [ ] `npm audit --omit=dev` = 0, `npm test` xanh, `npm run build` sạch
- [ ] Bản cài chạy trên máy Windows sạch (không có Node/Chrome dev), gỡ cài đặt sạch
- [ ] Cursor quota **tắt** mặc định; không có token/khoá nào trong repo hay bản cài
- [ ] `NOTICE.md` đủ và khớp phiên bản thư viện thực tế
- [ ] Ký số bản cài + bản portable
- [ ] Văn bản pháp lý hiển thị trong app lần đầu chạy
- [x] Kịch bản server sập đã thử tự động (`verify-ui`: giết/khởi động lại máy chủ, tự nối lại, dữ liệu còn)
- [ ] Kịch bản mất mạng thật và WebGL mất ngữ cảnh đã thử tay
