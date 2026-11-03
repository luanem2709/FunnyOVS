# BÁO CÁO NÂNG CẤP TOÀN QUYỀN

**Dự án:** FunnyOVS — Văn phòng 3D cho AI Agents
**Nhánh:** `auto/nang-cap-3d-toan-quyen`
**Thời gian:** 6 giai đoạn (GĐ 1 → GĐ 6)

---

## Tóm tắt

| GĐ | Nội dung | Commit | Test |
|---|---|---|---|
| 1 | Sửa lỗi hiển thị và số liệu | `eec670e` | — |
| 2 | Bộ test an toàn | `c8dc7eb` | 57 |
| 3 | 3D chuyên nghiệp | `5ee7be5` | — |
| 4 | Executor và cấp quyền | `6be2599` | 106 |
| 5 | Cấp 3 "Toàn quyền" | `541e004` | 128 |
| 6 | Hoàn thiện | (commit này) | 199 |

**Tổng:** 199 test — tất cả đều pass. Mã nguồn ~13.800 dòng TypeScript (server + client), ~2.300 dòng test.

---

## GĐ 1 — Sửa lỗi hiển thị và số liệu

### Vấn đề
Số liệu trên HUD và trong cảnh 3D không hiển thị; nhãn 3D mờ khó đọc; bầu trời
phẳng; tác vụ đầu-cuối không nối được.

### Đã sửa
- Số liệu token/chi phí lấy từ ledger thật (SQLite), khôi phục lại sau khi
  server khởi động lại thay vì reset 0.
- Nhãn 3D dùng texture có độ phân giải cao + viền tương phản.
- Bầu trời dùng gradient nhiều tầng thay vì màu đơn.
- Chuỗi đầu-cuối tác vụ: `pending → running → done/failed` đúng thứ tự.

---

## GĐ 2 — Bộ test an toàn

Mục tiêu: viết test *trước*, phát hiện lỗ hổng thật, sửa, rồi mới tính là
"an toàn".

### 2 lỗ hổng thật được phát hiện & sửa

1. **SSRF tới cloud metadata** (`src/server/browser/policy.ts`)
   - `evaluateUrl()` chặn `localhost`/`127.0.0.1` nhưng **KHÔNG** chặn
     `169.254.169.254` (AWS/Azure/GCP metadata endpoint).
   - Sửa: thêm `METADATA_HOSTS` + `isBlockedAddress()` cho toàn dải
     link-local/loopback/private.

2. **`normalizePath()` thoát sandbox** (`src/server/sandbox/pathGuard.ts`)
   - Hàm cắt mọi phần `..` nhưng lại **nối lại** các phần còn lại vào workspace
     → `../secret.txt` biến thành `<workspace>/secret.txt`, tức là đọc được file
     ngoài sandbox mà không hề bị chặn.
   - Sửa: `normalizePath` giờ dùng `path.relative` và **cắt luôn** phần `..`
     thay vì nối lại.

### Bài học
Hai lỗi này đều là lỗi "logic đúng một nửa" — kiểm tra có, nhưng kết quả
sai. Test phải khẳng định **kết quả cuối cùng**, không chỉ khẳng định hàm
được gọi.

---

## GĐ 3 — 3D chuyên nghiệp

### Camera
- `CameraRig` (`src/client/assets/cameraRig.ts`): bay mượt giữa các phòng với
  easing `ease(t) = t < 0.5 ? 2t² : 1 − (−2t+2)²/2`.
- Chuẩn hóa góc quay `wrapAngle` để không xoay 360° khi bay qua điểm giữa.
- **Clamp timestep** `step = min(max(dt, 0), 0.05)` — tránh camera "teleport"
  khi tab bị ẩn (dt nhảy lên 0.4–1s).
- WASD/arrow keys để pan theo hướng yaw của camera; nút "Toàn cảnh" reset.

### Ánh sáng
- Ambient + soft shadows, bloom, SSAO.
- Bộ điều tiết chất lượng theo FPS: Low / Medium / High / Auto.
- Ngày/đêm: `applyTimeOfDay()` đổi cường độ sun (2.4 → 0.35), hemisphere
  (1.25 → 0.5), đèn phòng (0.5 → 1.15); `setSkyMode()` đổi gradient sky dome.

### Vật thể & dữ liệu thật
- `tallBookshelf()` — kệ sách 2.6m, 4 kệ, `InstancedMesh` 80–160 cuốn sách với
  màu ngẫu nhiên có seed cố định (tái lập được).
- `wallChart()` — biểu đồ cột vẽ trên `CanvasTexture` 640×360, cập nhật **số
  liệu thật** từ `/api/departments` (token theo phòng ban).
- `SpeechBubble` — bong bóng thoại trên đầu nhân vật khi tác vụ xong (TTL 3.2s).
- Nhân vật đứng dậy + vẫy tay khi trạng thái `waiting`/`blocked`.

---

## GĐ 4 — Executor và cấp quyền

### Ranh giới kiến trúc (điểm cốt lõi)

```
LLM ──đề xuất──▶ JSON hành động ──parse có kiểu──▶ Executor
                                                      │
                            kiểm tra quyền ◀─────────┤
                            kiểm tra taint ◀─────────┤
                            chặn việc khó hoàn tác ◀─┤
                            chống vòng lặp ◀─────────┤
                            ghi nhật ký ◀───────────┘
```

**LLM không bao giờ** gọi trực tiếp `child_process`, `fs`, hay bất kỳ hành động
máy nào. Kể cả khi bị prompt-injection, LLM chỉ tạo được JSON — không chạm
được vào máy.

### Thành phần

| File | Vai trò |
|---|---|
| `src/server/executor/actionSchema.ts` | 14 loại hành động có kiểu (zod): `run_command`, `read_file`, `write_file`, `list_dir`, `delete_file`, `move_to_trash`, `open_app`, `click`, `type_text`, `key_press`, `screenshot`, `search_files`, `http_request`, `wait`. Mọi tham số bị ràng buộc độ dài/kiểu. |
| `src/server/executor/executor.ts` | Cổng thực thi: parse → kiểm tra quyền → dispatch → ghi log → chống lặp. |
| `src/server/executor/planner.ts` | Tách LLM: chỉ **đề xuất**, không import module thực thi nào. |
| `src/server/executor/actionLoop.ts` | Vòng lặp đề xuất → thực thi → phản hồi → lặp, có giới hạn. |
| `src/server/executor/powerShell.ts` | Timeout cứng + `taskkill /T /F` (giết **cả cây tiến trình**). |
| `src/server/executor/actionLog.ts` | Nhật ký **chỉ ghi thêm** + chuỗi hash SHA-256. |
| `src/server/executor/loopGuard.ts` | Giới hạn bước/thời gian/token + dừng khi lỗi lặp 3 lần. |

### Ba tầng quyền

| Tầng | Cho phép | Chặn |
|---|---|---|
| **1 — Sandbox** (mặc định) | Đọc/ghi trong workspace | Chạy lệnh, điều khiển máy, ghi ra ngoài |
| **2 — Được cấp** | + Chạy lệnh, ghi file, HTTP | Vẫn hỏi lại việc khó hoàn tác |
| **3 — Toàn quyền** | + Chuột/bàn phím/mở app | Vẫn hỏi lại việc khó hoàn tác |

### Nhật ký chỉ ghi thêm

- Mỗi hành động ghi 1 dòng JSON vào `.data/action-log.jsonl` — **không có API
  xóa/sửa**.
- Chuỗi hash liên kết (`prevHash` → `hash`) phát hiện được nếu ai đó sửa file
  cũ: `verifyChain()` trả về `brokenAt`.
- Nội dung nhạy cảm (`write_file.content`, `type_text.text`) **không** ghi vào
  log — chỉ ghi độ dài.

### Timeout cứng + kill cây tiến trình

Windows không có process group như POSIX. `powershell.exe -Command "npm run dev"`
sinh tiến trình con (`node.exe`); nếu chỉ kill cha thì con vẫn giữ cổng và các
lần chạy sau đều lỗi "port in use". Vì vậy dùng `taskkill /PID <pid> /T /F`
(`/T` = giết cây, `/F` = ép buộc).

Đã chứng minh bằng test: lệnh spawn tiến trình `node` con ngủ 60s, timeout 2s
→ sau khi kill, số tiến trình `node.exe` không tăng.

### Chống vòng lặp

Đếm chữ ký `(loại hành động + tham số chuẩn hóa + lỗi)`. Cùng một lỗi lặp 3
lần → dừng. Hành động **thành công** lặp lại vẫn OK (đọc cùng file nhiều lần
là hợp lệ).

### 2 lỗ hổng thật phát hiện qua test

1. **`checkPathPermission` fail-open** (`executor.ts`)
   - Khi đường dẫn nằm ngoài workspace và không có callback kiểm tra quyền,
     code cũ **cho qua**. Đây là lỗ hổng "thiếu kiểm tra = cho phép".
   - Sửa: **fail-closed** — không có cơ chế kiểm tra thì chặn.

2. **Cụm xác nhận Cấp 3 so sánh case-insensitive** (`permissionLevel.ts`)
   - `phrase.toUpperCase() !== "TOAN QUYEN"` ⇒ nhập `"toan quyen"` là vào được.
     Xác nhận 2 bước mất hết ý nghĩa.
   - Sửa: so sánh **nguyên văn** (`phrase.trim() !== "TOAN QUYEN"`).

### API

```
GET  /api/executor/schema           14 loại hành động + nhãn 3 tầng quyền
GET  /api/executor/level             cấp quyền hiện tại + đếm ngược + taint
POST /api/executor/level/request-full  bước 1 xác nhận Cấp 3
POST /api/executor/level/confirm-full  bước 2 (chọn thời lượng)
POST /api/executor/level/disable-full  tắt Cấp 3
POST /api/executor/level/granted       nâng lên Cấp 2
POST /api/executor/taint                đánh dấu / xóa cờ nhiễm
GET  /api/executor/log                 nhật ký + trạng thái chuỗi hash
POST /api/executor/run                  chạy 1 hành động
POST /api/executor/plan                 LLM đề xuất hành động
POST /api/executor/loop                 vòng lặp đề xuất → thực thi
```

### UI

Tab **"Executor & xem lại"**: cấp quyền hiện tại + đếm ngược, xác nhận 2 bước,
màn hình xem lại toàn bộ hành động (kèm trạng thái chuỗi hash).

---

## GĐ 5 — Cấp 3 "Toàn quyền"

### Xác nhận 2 bước

1. Nhập **nguyên văn** `TOAN QUYEN` (có khoảng trắng). Sai hoa/thường, thiếu
   khoảng trắng, thêm ký tự → từ chối.
2. Chọn thời lượng: 15 phút / 60 phút / không hết hạn.

Sau thời lượng, tự hạ về Sandbox. Nút **DỪNG KHẨN CẤP** cũng hạ quyền ngay.

### Luôn hỏi lại việc khó hoàn tác

Kể cả ở Cấp 3, các việc sau **vẫn phải** hỏi:

- Xóa hàng loạt (`Remove-Item`, `rm`, `rmdir`)
- Format / `diskpart` / `clear-disk`
- Registry (`reg add`, `reg delete`, `hkey_`)
- Tường lửa / antivirus / quyền hệ thống (`netsh advfirewall`, `set-mppreference`,
  `set-executionpolicy`)
- Đổi mật khẩu / tài khoản (`net user`, `passwd`, `set-password`)
- Thanh toán (`payment`, `paypal`, `stripe`, `checkout`)
- Gửi tin / email / đăng bài (`sendmail`, `smtp`, webhook)
- Gửi dữ liệu ra ngoài (`curl`, `Invoke-WebRequest`, `scp`, `azcopy`)
- Cài driver / phần mềm hệ thống (`install`, `msiexec`, `dism`)

### Đánh dấu nhiễm (taint)

Khi phiên đã đọc nội dung không tin cậy (web, file ngoài), mọi hành động nguy
hiểm phải hỏi lại — kể cả khi đã ở Cấp 2/3. Đọc `read_file` / `http_request`
được đánh dấu là nguồn nhiễm.

### Thùng rác thay vì xóa hẳn

`TrashBin` (`src/server/executor/trashBin.ts`):
- File bị "xóa" được chuyển vào `<workspace>/.trash/<timestamp>__<tên>`.
- Manifest `index.jsonl` ghi lại đường dẫn gốc → **khôi phục được**.
- Khôi phục khi chỗ đến đã tồn tại → tự đổi tên (`a (khôi phục 1).txt`), không
  ghi đè.
- Dọn rác thật là hành động riêng, phải xác nhận.

### Lớp trừu tượng chuột/bàn phím + overlay

`src/server/executor/inputController.ts`:
- `InputController` — hợp đồng độc lập thư viện.
- `GuardedInputController` — bọc controller thật: bật "đèn báo" (overlay)
  trước mỗi thao tác, cho phép **abort** ngay lập tức.
- `RecordingInputController` — **mặc định**: chỉ ghi lại, KHÔNG đụng máy thật.
- `PowerShellInputController` — cài thật qua `user32.dll`, bật bằng
  `OFFICE_INPUT_REAL=1`.

UI: overlay đỏ toàn màn hình với nút **✋ HỦY KHẨN CẤP** hiện khi Executor đang
thao tác. Nút Dừng khẩn cấp tổng cũng hủy thao tác đang chạy.

---

## GĐ 6 — Hoàn thiện

### Tự học trong ngân sách

`src/server/learning/learningEngine.ts` — trước khi học, engine quyết định:

1. **Ví học còn bao nhiêu** → học mấy chủ đề, đọc mấy nguồn (độ sâu 2–5 nguồn
   tùy ngân sách còn lại).
2. **Chủ đề nào nên học**: ưu tiên chưa học lần nào → học lâu rồi nhất →
   bỏ chủ đề hỏng.
3. **Chủ đề hỏng 3 lần liên tiếp** → tạm dừng, không lãng phí token nữa.
   Người dùng có thể bỏ tạm dừng.
4. **Không bao giờ vượt** `learningPercent` của hạn mức ngày.

### Tìm kiếm tri thức có xếp hạng

`GET /api/kb/search?q=...` chấm điểm:
- Khớp ở tiêu đề (10 điểm) > body (3 điểm)
- Khớp đúng từ có ranh giới từ (+6 / +2)
- Khớp nguyên cụm từ (+15 tiêu đề / +5 body)
- Nhân với độ tin cậy, giảm dần theo tuổi

### Giao diện

Tab **Phòng Thư viện** nay có: ô tìm kiếm tri thức, khu vực **Tự học trong
ngân sách** (số phiên, % ví học đã dùng, tiến độ từng chủ đề, nút "Học ngay
1 phiên" / "Xem kế hoạch").

---

## Bảng an toàn tổng hợp

| Lớp | Cơ chế |
|---|---|
| LLM | Chỉ sinh JSON; không có đường tắt tới máy |
| Schema | Zod — kiểu + ràng buộc độ dài mọi tham số |
| Đường dẫn | `realpath` chuẩn hóa, chặn `..`, symlink escape, vùng chặn cứng |
| Quyền | 3 tầng + hộp thoại 4 lựa chọn + xác nhận 2 bước cho Cấp 3 |
| Taint | Nội dung web là dữ liệu, không phải mệnh lệnh |
| Lệnh | Timeout cứng + kill cây tiến trình + `-NoProfile` |
| Vòng lặp | Dừng khi lỗi lặp 3 lần / vượt bước / vượt thời gian / vượt token |
| Nhật ký | Chỉ ghi thêm + chuỗi hash + không lưu nội dung nhạy cảm |
| Xóa | Thùng rác + khôi phục được |
| Ngân sách | Ví học riêng + trần ngày/tuần/tác vụ |
| Dừng khẩn cấp | Kill tiến trình + hủy thao tác + hạ quyền Cấp 3 |

---

## Bộ test

```
npm test
```

| File | Nội dung |
|---|---|
| `tests/safety.test.ts` | 32 — sandbox, path traversal, symlink, prompt injection |
| `tests/safety-gd2.test.ts` | 25 — lỗ hổng GĐ 2 + leo thang grant |
| `tests/executor-gd4.test.ts` | 42 — schema, 3 tầng quyền, log, chống lặp |
| `tests/powershell-timeout.test.ts` | 7 — timeout cứng + kill cây tiến trình |
| `tests/full-control-gd5.test.ts` | 22 — xác nhận 2 bước, thùng rác, overlay |
| `tests/learning-gd6.test.ts` | 17 — ngân sách học, chọn chủ đề, tìm kiếm |
| `tests/budget.test.ts` | 26 — token budget + ledger SQLite |
| `tests/dispatcher.test.ts` | 15 — điều phối giao việc |
| `tests/nav.test.ts` | 13 — đường đi trong 3D |

**Tổng: 199 test — tất cả pass.**

Mọi test chạy trong thư mục tạm của Vitest, **không** đụng Cấp 3 thật, **không**
mở app, **không** gõ phím thật.

---

## Quy trình kiểm thử thủ công đã thực hiện

1. Khởi động server, kiểm tra `/api/executor/level` → `sandbox`.
2. `run_command` ở Cấp 1 → bị chặn (`need_grant`).
3. `read_file` trong workspace → OK.
4. `run_command` ở Cấp 2 → chạy được, `stdout` trả về đúng.
5. Xác nhận Cấp 3 sai cụm (`toan quyen`) → từ chối, vẫn ở bước 1.
6. Xác nhận đúng (`TOAN QUYEN`) → sang bước 2, chọn 15 phút → `full`, đếm
   ngược chạy.
7. Tắt Cấp 3 → về `sandbox`.
8. Đánh dấu taint → `run_command` tạo yêu cầu duyệt (hộp thoại 4 lựa chọn).
9. Xóa file → vào thùng rác, file gốc biến mất; khôi phục → file về đúng chỗ
   với nội dung nguyên vẹn.
10. Kiểm tra chuỗi hash nhật ký: `chain.ok === true`.

---

## Ghi chú về giới hạn

- **Driver điều khiển máy mặc định là `RecordingInputController`** — chỉ ghi
  lại, không thao tác thật. Bật thật bằng `OFFICE_INPUT_REAL=1` (chỉ nên dùng
  ở Cấp 3).
- **Cấp 3 không bật sẵn** và không có API bật không cần xác nhận.
- Executor chưa được nối vào vòng lặp tự động của `TaskRunner` — hiện chạy
  được qua `/api/executor/loop` (có Planner thật) nhưng `TaskRunner` vẫn gọi
  Cursor CLI trực tiếp. Bước nối tiếp: cho `TaskRunner` gọi `planActions` +
  `Executor` thay vì chỉ gọi CLI.
