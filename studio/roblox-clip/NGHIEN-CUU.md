# Công việc đầu tiên — "học" 3 clip rồi làm clip kiểu Roblox

Ba clip tham chiếu (chỉ **học cách kể**, không sao chép nội dung hay hình):

| Clip | Kênh | Chủ đề (theo tiêu đề) |
|---|---|---|
| `SSdIjdzBg0A` | Ngán Vcl | "Tại sao thật tệ khi làm thư ký của sếp?" |
| `O0FmGbjxBX0` | Lạnh Vcl | "Đàn ông đi xuất khẩu lao động ngoại tình như thế nào?" |
| `XUYh_75b1Mo` | Lạnh Vcl | "Tại sao người chơi tài xỉu lại ngu đến vậy?" |

Cách đọc: mình xem phụ đề tự động của từng clip trên YouTube (không tải video, không lưu lại lời thoại) và xem vài khung hình của clip 1.

## 1. Thể loại và công thức kể chuyện (rút ra từ 3 clip)

* **Series "Tại sao thật tệ khi…"**: truyện cảnh báo kể bằng **ngôi thứ hai ("Bạn…")**, dài khoảng 19–24 phút (≈ 3.800–5.600 từ), giọng đọc đều, phụ đề đốt vào hình.
* **Hình ảnh**: hoạt hình 2D phẳng, nhân vật tối giản trong căn phòng màu ấm, bong bóng thoại, phụ đề trắng viền đen ở đáy khung (quan sát ở clip 1).
* **Công thức lặp lại ở cả ba clip:**
  1. **Mở bằng một hình ảnh cụ thể + hoàn cảnh nhà** (clip 1: "ảnh cưới treo lệch"), hoặc **nói luôn điểm kết ngay câu đầu** (clip 3: "bắt đầu với 50.000 và kết thúc bằng 7 năm tù").
  2. **Đi theo mốc tuổi/năm** ("năm tám tuổi…", "năm 23 tuổi…", "khoảng một năm rưỡi sau…") để nhảy thời gian mà người nghe không lạc.
  3. **Đồ vật làm motif** quay lại nhiều lần (clip 1: áo sơ mi trắng cổ đứng, túi màu kem quai xích vàng) — đồ vật nói thay cảm xúc.
  4. **Câu nhắc lại (refrain)** nghe ấm lúc đầu, độc dần về sau (clip 1: "Ở đây anh lo").
  5. **Số liệu tăng dần** để thấy leo thang (clip 3: 50.000 → hàng triệu → hơn một tỷ).
  6. **Mỗi lựa chọn nhỏ là một lần "tự bước tiếp"** — lời bình nhấn mạnh trách nhiệm cá nhân (clip 2: "mỗi lần xoá tin nhắn là một lần biết mình sai").
  7. **Kết bằng vòng lặp/đảo vai**: nhân vật chính trở thành chính điều mình từng ghét (clip 1), hoặc một câu chốt rất ngắn từ người bị tổn thương (clip 2).
* **Nhịp**: câu ngắn, danh từ cụ thể, hầu như không giảng đạo lý — đạo lý nằm ở cảnh cuối.

## 2. Nhân vật Roblox: cấu tạo và cách mình dựng lại

* **R6** (kiểu cổ điển): **6 khối** — đầu, thân, 2 tay, 2 chân; khớp xoay ở vai và hông, tay/chân là một khối thẳng. **R15**: 15 khối, thêm khuỷu, cổ tay, đầu gối, cổ chân, eo; chỉnh tỉ lệ được. (Nguồn: tài liệu Roblox Creator về thân hình nhân vật và vài hướng dẫn R6/R15; các hướng dẫn nêu nhân vật cổ điển cao khoảng 5 stud.)
* **Kích thước R6 quen thuộc** (từ kiến thức chung, *chưa* được trang tra cứu nào xác nhận lại): đầu ≈ 1 stud cao, thân 2×2×1, mỗi tay/chân 1×2×1 → tổng cao 5 stud. **Mình dùng đúng các tỉ lệ này.**
* **Mặt là decal** dán lên đầu (mắt chấm, miệng cong) — mình vẽ 6 biểu cảm: cười, phẳng, buồn, mệt, sốc, nhếch mép.
* **"Stud"**: các núm tròn trên mặt gạch/baseplate — dấu hiệu nhận ra thế giới Roblox/LEGO; mình rải stud lên sàn và cỏ.
* **Chuyển động R6**: đi bộ = tay/chân lắc đối nhau; ngồi = chân gập 90° ra trước; gõ phím = hai tay đưa ra trước; cúi đầu khi mệt.
* **Chat bubble** trắng bo góc phía trên đầu; **chip nhãn** góc trên (NĂM THỨ NHẤT…) thay cho thanh tiêu đề màn chơi.
* **Không dùng gì của Roblox**: không logo, không âm "oof", không asset/avatar thật — chỉ mượn **bố cục khối** của kiểu nhân vật; mọi hình dựng bằng code (three.js). Nếu đăng công khai, nên ghi rõ là clip "phong cách Roblox", không phải của Roblox.

## 3. Clip đã làm

* **Tên**: "Tại sao thật tệ khi làm FREELANCER?" — **truyện mới, không lấy lại cốt truyện của 3 clip**.
* **Độ dài**: 75 giây, 24 khung/giây, 1280×720, phụ đề tiếng Việt đốt vào hình, âm thanh tổng hợp (nền nhẹ, tiếng gõ phím, "ting" tin nhắn) — **chưa có giọng đọc**.
* **Áp dụng công thức**: ngôi "bạn" · mốc năm (NĂM THỨ NHẤT/HAI/BA) · motif **cốc cà phê chất đống** · refrain **"tuần sau anh trả"** (nghe như hứa → thành lời của chính nhân vật) · số liệu **12 khách, 9 người "tuần sau anh trả"** · **kết đảo vai**: người từng bị quỵt trở thành người nói câu đó.

| Giây | Cảnh | Ý chính |
|---|---|---|
| 0–3 | Tựa | "TẠI SAO THẬT TỆ KHI LÀM FREELANCER?" |
| 3–11 | Năm thứ nhất | Laptop cũ, "tự do" |
| 11–19 | 11 giờ đêm | Khách nhắn: làm gấp, tuần sau anh trả |
| 19–27 | Ba đêm thức | Nộp bài lúc bình minh, đổi lại một cái 👍 |
| 27–35 | Tuần sau | Khách biến mất, tin nhắn "đã xem" |
| 35–42 | Cuối tháng | Mẹ để lại hộp cơm còn ấm |
| 42–50 | Năm thứ hai | 12 khách, 9 người cầm biển "tuần sau anh trả" |
| 50–58 | Năm thứ ba | Cậu sinh viên xin làm cùng |
| 58–69 | Văn phòng nhỏ | "Gấp nhé, tuần sau anh trả." — bạn vừa nói câu đó |
| 69–75 | Chốt | "Vòng lặp không cần ác ý. Nó chỉ cần một người mệt." |

## 4. Giới hạn và bước tiếp

* **Mới 75 giây**, không phải 20 phút như 3 clip gốc; muốn dài hơn cần viết kịch bản dài (≈ 4.000 từ) và dựng thêm cảnh — cùng bộ khung này mở rộng được.
* **Chưa có giọng đọc**: máy chưa có giọng tiếng Việt cục bộ. Có thể dùng giọng online của Microsoft (edge-tts) — khi đó **văn bản kịch bản được gửi ra dịch vụ ngoài**, nên mình chưa làm nếu bạn chưa đồng ý.
* Nhân vật còn đơn giản (chưa có cầm nắm đồ, chưa có đổi trang phục theo năm ngoài vest ở cảnh cuối).

## 5. Chạy lại / chỉnh sửa

Từ thư mục `FunnyOVS`:

```powershell
node workspace/roblox-clip/audio.mjs                          # tạo audio.wav
node workspace/roblox-clip/render.mjs --frames 120,300,1150   # xem thử vài khung (frames-test/)
node workspace/roblox-clip/render.mjs                         # kết xuất đủ + ghép clip.mp4
```

File: `scene.js` (cảnh, nhân vật, kịch bản/phụ đề), `index.html`, `render.mjs`, `audio.mjs`. Thư mục `workspace/` nằm ngoài git.

## 6. Cập nhật: nhân vật chính theo avatar của bạn + skill `roblox-style-video`

**Skill** ([yuzhang-zhong/roblox-style-video](https://github.com/yuzhang-zhong/roblox-style-video), giấy phép MIT): bộ hướng dẫn + script để tạo prompt/storyboard cho video kiểu Roblox. Mình đọc `SKILL.md` và áp dụng các quy tắc hình khối của nó (không cài skill vào máy, không chạy script của nó):

| Quy tắc của skill | Trong clip |
|---|---|
| Thân 2×2×1, tay/chân 1×2×1 sát nhau, không hở đùi | Giữ nguyên ở các nhân vật phụ (R6) |
| Đầu hình thùng, bo cong trên/dưới, không núm trên đỉnh | Đầu nhân vật phụ dựng bằng hình tròn xoay có bo (trước là hình trụ thẳng) |
| Mặt là decal 2D phẳng, không mũi 3D | Mọi nhân vật dùng decal mặt |
| Tay là khối đặc, không ngón người, không "càng" LEGO | Tay là khối đặc |
| Vật liệu SmoothPlastic/WoodPlanks/Concrete/Grass, **không rải stud lên sàn** | **Đã bỏ stud**: sàn gỗ ván, sàn bê tông, bãi cỏ phẳng |
| Chat bubble trắng bo góc, không logo Roblox | Giữ nguyên, không có logo/âm thanh của Roblox |
| Phong cách mặc định `chibi-plush` (đầu to, vinyl bóng) | Dùng cho nhân vật chính |

**Avatar tham chiếu** (hồ sơ công khai bạn gửi; mình đọc qua API công khai của Roblox và xem ảnh thumbnail 420×420 trong trình duyệt, không tải về): kiểu **R15**, thân hình **Mini Plush** (đầu to, thân/chân tay nhỏ tròn), tóc **Messy Manhwa Hair** đen rối, **vương miện xanh** nghiêng, **cánh + tim xanh** làm hào quang, áo thun đen/quần đen/giày trắng, mặt đầu động "Blue Angel Glow" (mắt đen sáng xanh, má ửng xanh).

**Nhân vật chính "Bạn" trong clip giờ là bản dựng lại của avatar đó:** đầu cầu to (≈ 1,9 so với thân 1,2), thân/tay/chân tròn nhỏ, tóc đen rối nhiều chùm nhọn, vương miện xanh nghiêng trái, cánh xám nhạt vỗ nhẹ, tim xanh bay quanh, áo thun + quần ngắn đen, giày trắng, mặt có má ửng xanh và mắt có điểm sáng xanh (6 biểu cảm). Cảnh cuối, chính nhân vật này mặc vest + cà vạt đỏ — cùng một người, đổi vai.
**Chưa giống:** hình dạng đúng của từng món UGC (mình dựng bằng khối cơ bản), viền hào quang xanh ngọc, mặt động có hoạt hình riêng.

## 7. Học từ OpenMontage (`D:\AI Không khó\OpenMontage-main`) và nâng cấp quy trình

**Đã đọc:** `README.md`, skill **camera-cinematography** (`SKILL.md`, 8 file tham chiếu: góc máy, cỡ cảnh, chuyển động, bố cục, floor plan, continuity, bảng quyết định, đồng bộ nhân vật; 4 mẫu; 1 ví dụ), `skills/creative/cinematic.md`, `skills/meta/voice-performance-director.md`, `skills/core/subtitle-sync.md`, `skills/meta/checkpoint-protocol.md`, danh sách `pipeline_defs/`.
**Giấy phép:** OpenMontage là **AGPL-3.0**. Mình chỉ học ý tưởng và tự viết lại bằng code/ngôn ngữ của mình, **không chép nguyên văn**; nếu muốn chép file của họ vào FunnyOVS thì phải kiểm tra tương thích giấy phép trước.

| Bài học | Áp dụng trong clip |
|---|---|
| Quy trình 7 bước: hiểu ý → **character bible** → **shot list** → bố cục → **floor plan + trục 180°** → **continuity** → rà soát | `characters.json`, `shots.json`, `DAO-DIEN.md` (sinh tự động từ dữ liệu) |
| Chọn góc máy theo **ý đồ cảm xúc** (bảng quyết định), không theo thích | Mỗi shot có cột `why`: cô đơn/yếu thế = góc cao, choáng ngợp = góc thấp, twist = cận cảnh phản ứng, đồng cảm = ngang tầm mắt 3/4 |
| Nhịp Wide → Medium → Close-up; chuyển động phải có lý do | 20 shot cho 8 cảnh: dolly in/out, truck theo người, static khi cần im lặng, insert cho đồ vật motif |
| Giữ trục 180°, khớp hướng nhìn, screen direction | Máy luôn ở phía trước nhân vật; cảnh 7: sinh viên nhìn phải, bạn quay trái; mẹ và sinh viên đi trái→phải |
| Headroom/lookspace, khung **2.39:1**, **24 fps** (cinematic.md) | Letterbox 1280×536 giữa hai dải đen 92 px, phụ đề nằm trong dải đen |
| "Thay tính từ cảm xúc bằng nguyên nhân thị giác" (đừng ghi "cinematic") | Shot ghi **số**: cỡ cảnh, góc, chuyển động, tiêu cự (fov), vị trí máy |
| Subtitle-sync: cue ngắn, thời gian bám lời đọc | Cue ≤ 7 từ, thời lượng chia theo độ dài chữ **trong đúng khoảng giọng đọc**, tô vàng cụm khoá |
| Voice-performance: dùng **im lặng** làm cấu trúc, dừng trước cú đảo | Mỗi cảnh = 0,7 s mở + giọng + 0,8 s đóng; cảnh cuối để im sau câu thoại cho khoảnh khắc "nhận ra" |
| Checkpoint theo giai đoạn, chạy lại từ giai đoạn lỗi | Mỗi giai đoạn ra một file: `loi-doc.json` → `voice/*.mp3` → `timing.json` → render → `clip-co-giong.mp4`; `synth.py` **bỏ qua câu đã có** nên sửa một câu chỉ tổng hợp lại câu đó |

### Khớp giọng với hình
Trước: cảnh dài cố định, giọng đặt theo mốc đoán → lệch. **Giờ:** độ dài từng câu giọng (đo bằng ffprobe) quyết định độ dài từng cảnh (`timing.mjs`), tổng clip **76,3 giây**; tin nhắn, bong bóng thoại, mặt nhân vật và tiếng "ting" được đặt theo mốc **trong câu** (vd. "tuần sau anh trả" hiện đúng lúc giọng nói tới đó); shot đổi theo tỉ lệ cảnh.

### Hướng tới mục tiêu "văn phòng AI thay một studio, nhanh hơn, ít token"
* **Nhân vật được lưu và đồng bộ:** `characters.json` là nguồn duy nhất — sửa màu/trang phục ở đó là mọi cảnh đổi theo; nhân vật chính (avatar plush của bạn) dùng lại ở mọi clip sau.
* **Ít token:** làm clip mới = viết 3 file JSON nhỏ (lời đọc, shot list, nhân vật) thay vì sinh mã; **kết xuất bằng code, không tốn token mô hình**; giọng đã tổng hợp được dùng lại (không gọi lại dịch vụ nếu câu không đổi).
* **Chưa làm / hạn chế:** dàn cảnh từng cảnh (`scene1…scene8`) vẫn là mã viết tay riêng cho truyện này — chưa có "thư viện cảnh" để ghép từ JSON; chưa nối vào ứng dụng (công cụ `studio_render` cho agent, hộp duyệt trước khi gửi lời đọc ra dịch vụ giọng online); chưa dùng chỉ dẫn biểu cảm (SSML) cho giọng đọc.
