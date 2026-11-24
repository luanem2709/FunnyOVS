# K2 – FILE KỊCH BẢN .TXT VÀ FILE CẢNH .JSON CHO SHOT BUILDER

Cơ chế của tool (quan trọng): Shot Builder gửi file txt sang tool giọng (hoặc khách tự làm giọng), nhận về giọng + phụ đề SRT, rồi **tự khớp từng cảnh với SRT** bằng cách dò chữ trong trường `line` của mỗi cảnh. Vì vậy:
- **Ghép `line` của tất cả cảnh theo thứ tự phải ra đúng từng chữ của file txt** (không thiếu, không thêm, không đổi chữ, giữ số viết bằng chữ y hệt).
- **Không ghi `dur`** (thời lượng). Đọc nhanh hay chậm tool đều tự khớp.
- Cách an toàn nhất: viết JSON trước, rồi sinh file txt từ JSON (ghép `line` theo `sent`: các cảnh cùng `sent` nối bằng dấu cách thành 1 dòng). Nếu chạy được code: `python3 wi_tools.py tts <slug>_canh.json <slug>_tts.txt` và `python3 wi_tools.py check <slug>_canh.json`.

ID hợp lệ: **dùng danh sách trong file DANH_SACH_TOOL_SHOTBUILDER.txt khách gửi** (mỗi cặp ["id", "mô tả"], chỉ dùng phần id; `stageHints` giải thích từng bối cảnh, `fx2`, `board`). Danh sách cuối file này chỉ là dự phòng khi khách chưa gửi. Bối cảnh/đồ vật id bắt đầu bằng `x_` là gói bổ sung (K3).

`<slug>` = tên ngắn không dấu, chữ thường, nối bằng gạch dưới, vd. `pause_10_seconds`.

### File 1: `<slug>_tts.txt` – TTS sạch
- Mỗi câu một dòng. Không heading, không tên chương, không mốc thời gian, không chỉ dẫn cảnh, không ký hiệu markdown.
- Nhịp bằng dấu câu: `...` = ngừng dài trước cú đấm; `. ` giữa từng từ = nhấn từng chữ ("For three. Whole. Hours."); `,` = ngừng ngắn; `!`/`?` đúng cảm xúc. Không dùng dấu gạch ngang dài.
- Số, năm, đơn vị viết bằng chữ ("four hundred and thirty-eight days", "nineteen eighty-seven").
- Thoại nhân vật: nếu một giọng thì bỏ nhãn tên và viết "She says…" khi cần; nếu nhiều giọng thì giữ nhãn `NAME:` đầu dòng.
- **File txt phải ghép đúng từ các `line` trong JSON** (cùng chữ, cùng thứ tự).

### File 2: `<slug>_canh.json` – danh sách cảnh cho Shot Builder
Cấu trúc:
```json
{"title": "What if ...?", "kit": "pop", "grade": "pop", "palette": "goc", "motion": "muot",
 "hero": {"cast": "nam", "color": "#FF7A45", "accent": "#FFE3C8"},
 "shots": [ {shot}, ... ]}
```
`kit`: `pop` (người que đầu tròn), `doll` (người gỗ 3D có màu; khi đó thêm `palette`: goc, kem, keo, pastel, bien, hoanghon, rung, neon, dat) hoặc `ink` (người đầu đen mắt trắng to, viền đen dày + viền neon tím, quần áo màu rực; nhân vật chính mặc hoodie, linh tóc dài cam đỏ áo xanh ngọc). `grade`: pop, pastel, neon, warm, cool, retro, dark, none. `motion`: muot.

Mỗi `shot`:
| Trường | Ý nghĩa |
| --- | --- |
| `stt` | số thứ tự cảnh |
| `sent` | số thứ tự câu trong file TTS; các cảnh cùng `sent` ghép thành 1 dòng TTS |
| `line` | **đúng đoạn lời đọc của cảnh này** (một câu, hoặc một phần câu). Ghép tất cả `line` theo thứ tự = toàn bộ lời đọc |
| `prompt` | mô tả cảnh ngắn (EN) cho người đọc |
| `set` | bối cảnh (bảng dưới) |
| `cam` | wide, medium, close, xclose, insert |
| `move` | chuyển động máy (bảng dưới) – bỏ trống = đẩy máy nhẹ |
| `trans` | chuyển cảnh vào cảnh này: cut, whip, zoom, spin, flash, fade, glitch, slide, pushup, wipe, iris, circle, flip, dipwhite, blinds, shake, blur, slideleft, slidedown, shrink, swirl, split, diag, pixel, burn, heart, star, comic |
| `tod` | day, sunset, night, dawn |
| `weather` | rain, snow, leaves, confetti |
| `board` | chữ trên tấm bảng/biển gỗ của bối cảnh camp/beach (vd. "DAY 7") |
| `fx2` | 0–1, hiệu ứng riêng của bối cảnh (bảng dưới) |
| `crowd`, `crowdMood` | số người quần chúng (0–30) và tâm trạng |
| `actors` | tối đa 4: `cast, spot (0–1 trái→phải), to (0–1, đích khi đi/chạy), facing, pose, pose2, at (0–1 lúc đổi), expr, expr2, size` |
| `props` | tối đa 6: `type, spot, on (surface/floor), text, at, size` |
| `ui` | tối đa 6: `type, text, text2, accent, who (chỉ số diễn viên), at, from, to, x, y` |
| `sfx` | gợi ý âm thanh cho người dựng (không ảnh hưởng hình) |
| `dur` | KHÔNG ghi: tool tự tính theo SRT |

Ví dụ 4 cảnh (câu 2 tách 2 cảnh):
```json
{"stt": 1, "sent": 1, "line": "It's midnight, and a dinosaur skeleton is staring at you.", "prompt": "Hero frozen before a giant skeleton", "set": "studio", "tod": "night", "cam": "medium", "move": "zoom_in", "trans": "fade",
 "actors": [{"cast": "nam", "spot": 0.45, "facing": "front", "pose": "recoil", "expr": "scared"}], "ui": [{"type": "exclaim", "who": 0, "at": 0.3}], "sfx": "low drone"},
{"stt": 2, "sent": 2, "line": "Your crush is holding your arm.", "prompt": "Two-shot, she grabs his arm", "set": "studio", "tod": "night", "cam": "medium", "move": "two",
 "actors": [{"cast": "nam", "spot": 0.3, "facing": "right", "pose": "stand", "expr": "shy"}, {"cast": "linh", "spot": 0.7, "facing": "left", "pose": "hold", "expr": "nervous"}]},
{"stt": 3, "sent": 2, "line": "Very. Tightly.", "prompt": "Extreme close on hero blushing", "set": "studio", "tod": "night", "cam": "xclose",
 "actors": [{"cast": "nam", "facing": "front", "pose": "stand", "expr": "embarrassed"}], "ui": [{"type": "hearts", "who": 0}], "sfx": "heartbeat"},
{"stt": 4, "sent": 3, "line": "So, what if you and your crush were locked in a museum overnight?", "prompt": "Title card", "set": "burst", "cam": "wide", "trans": "flash",
 "actors": [{"cast": "nam", "spot": 0.35, "pose": "shrug", "expr": "oops"}, {"cast": "linh", "spot": 0.65, "facing": "left", "pose": "arms_crossed", "expr": "suspicious"}],
 "ui": [{"type": "title", "text": "WHAT IF YOU WERE LOCKED", "text2": "IN A MUSEUM OVERNIGHT?", "accent": "MUSEUM"}], "sfx": "title boom"}
```

### ID dự phòng (chỉ khi khách chưa gửi DANH_SACH; có DANH_SACH thì theo DANH_SACH)

**set (bối cảnh):** street (vỉa hè, cửa hàng), park (cỏ, ghế đá – sit ngồi lên ghế), office (bàn máy tính, cửa sổ), gym (máy chạy bộ ở spot > 0.62; fx2 = chạy nhanh), market (kệ hàng, xe đẩy), hospital (giường, máy nhịp tim; fx2 > 0.5 = báo động đỏ), bus (sit = ngồi ghế), planet (hành tinh lạ), living (sofa, TV; sit = ngồi sofa), diner (bàn ăn nến, hẹn hò; spot < 0.5 trái bàn, > 0.5 phải bàn; hợp `move: two`), classroom2 (lớp học; `board` = chữ trên bảng), bedroom2 (giường; sit = ngồi giường), kitchen2 (bếp), burst (nền tia sáng – cảnh tiêu đề/phản ứng; fx2 = tốc độ xoay), beach (bãi biển đảo hoang, khúc gỗ ngồi; fx2 > 0.5 = bão + sét), jungle (rừng; fx2 = mắt sáng trong bụi), camp (lều + lửa trại, biển gỗ; `board` = chữ trên biển, trống = vạch đếm ngày), sea (bè giữa biển; fx2 = bão), cliff (đỉnh đồi nhìn biển; fx2 = tàu ở chân trời), plane (trong máy bay; fx2 = rung lắc, mặt nạ oxy, đèn đỏ), studio (phông nền 3D xanh, đèn rọi; fx2 = đèn rọi theo nhân vật), **mall** (hành lang trung tâm thương mại 2 tầng, thang cuốn; `board` = tên cửa hàng ở giữa; fx2 > 0.5 = cửa cuốn các cửa hàng kéo xuống), **entrance** (cửa kính chính + cửa cuốn thép, nhìn ra bãi xe; fx2: 1 đóng, 0.75 sập xuống trong cảnh, 0.4 kéo lên trong cảnh, 0 mở; `board` = biển trên cửa), **foodcourt** (khu ăn uống: quầy PIZZA/NOODLES/BURGERS/TACOS + màn hình LED lớn; `board` = chữ trên màn hình, "/" = xuống dòng, vd "OPENS IN/30 DAYS"; fx2 > 0.5 = màn hình tắt), **fountain** (sảnh đài phun nước; fx2 = băng dính vàng chia đôi sàn: 0.3 một vạch, 0.7 ba vạch; sit = ngồi trên thành đài; spot < 0.5 bên trái, > 0.5 bên phải), **store** (bên trong cửa hàng; `board` = tên, quyết định đồ bên trong: SHOES, PET STORE (lồng vẹt + bể cá), TOYS, ELECTRONICS (tường TV), MATTRESS (giường), LAMPS, BOOKS, FASHION (móc áo, gương, ma-nơ-canh), SPORTS (bóng, ván trượt)), **photobooth** (quầy chụp ảnh rèm đỏ; fx2 > 0 = đèn flash nháy 4 lần), **blackout** (mall mất điện: viền cửa hàng, biển EXIT, hàng ma-nơ-canh; fx2 0.3–0.6 = đèn pin theo nhân vật chính, > 0.7 = đèn khẩn cấp đỏ), **car** (trong xe hơi nhìn từ kính trước; spot < 0.5 = ghế lái có vô lăng, > 0.5 = ghế phụ; dùng pose sit; cây chạy qua cửa sổ; fx2 > 0.5 = radio bật, nốt nhạc bay), **lake** (cầu gỗ bên hồ câu cá; sit = ngồi mép cầu; fx2 > 0.2 = 2 cần câu + phao, > 0.8 = cần bên phải kéo lên chiếc ủng), **ward** (phòng bệnh 2 giường: spot < 0.5 giường trái cạnh poster mèo "HANG IN THERE", > 0.5 giường phải cạnh cửa sổ nhìn cây; sit/lie/sleep trên giường; `board` = số BPM trên màn hình nhịp tim, > 120 nháy đỏ; fx2 = rèm giữa 2 giường: 0 mở, 0.5 nửa, 1 kín), **hallway** (hành lang bệnh viện: cửa phòng có số, quầy y tá, máy bán hàng; `board` = số phòng cửa giữa; fx2 > 0.5 = ai ngồi (sit) thì ngồi xe lăn — đua xe lăn dùng move follow/pan + ui speed), **cafeteria** (căng tin trường: quầy phát đồ ăn + bàn dài phía trước, sit = ngồi bàn; `board` = bảng treo, mặc định LUNCH; fx2 0.3–0.8 = khay mì Ý bay qua, > 0.8 = mì Ý đổ dưới sàn), **schoolhall** (hành lang trường: dãy tủ khóa nhiều màu + bảng tin giữa; `board` = chữ bảng tin, mặc định SPRING DANCE; fx2 > 0.5 = một tủ mở, giấy bay), **dodgeball** (phòng thể dục: sàn gỗ, khán đài, rổ, bảng điểm; `board` = bảng điểm, "/" xuống dòng, vd HOME 3/AWAY 0; fx2 = số bóng bay qua 0–1), **frontyard** (sân trước nhà: thềm nhà, bãi cỏ, lối xe, đường phố phía sau; spot ≤ 0.7 trên cỏ, 0.7–1 bước ra giữa đường; fx2 0.1–0.4 = bóng đỏ nảy trên lối xe, 0.4–0.7 = bóng lăn ra đường, > 0.7 = xe hơi lao qua; `board` = số nhà), **library** (thư viện trường: kệ sách, bàn dài, ổ điện trên tường phải; `board` = biển LIBRARY; fx2 > 0.5 = dây sạc cắm ổ điện), **cinema** (rạp phim tối, ghế đỏ; `board` = chữ trên màn hình, "/" xuống dòng, trống = cảnh phim kinh dị; fx2 > 0.5 đèn pin soát vé, > 0.8 màn hình lóe trắng), **recital** (sân khấu: rèm đỏ, đàn piano, đèn rọi; `board` = tên chương trình; fx2 > 0.4 chỉ còn đèn rọi, > 0.8 nốt nhạc bay; không dùng crowd), **pillowfort** (pháo đài gối trong phòng khách, biển NO PHONES = `board`; fx2 > 0.5 ban đêm), **mirror** (gương lớn trên tường phòng ngủ, nhân vật đứng giữa gương; `board` = chữ trên giấy note vàng, "/" xuống dòng; fx2 > 0.5 = gương lấp lánh phép thuật), **promnight** (dạ hội trong phòng thể dục: đèn dây, quả cầu disco, băng rôn SPRING DANCE, đồng hồ lớn; `board` = giờ trên đồng hồ vd 11:59, 12:00 hiện màu đỏ; fx2 > 0.5 đèn nhấp nháy, > 0.8 tối hẳn + chớp), **jail** (nền đen, lồng sắt đỏ, nhân vật đứng trong lồng; fx2 > 0.5 = cửa mở; `board` = biển treo), **checkpath** (phòng trắng 3D, đường kính có ô dấu tích; fx2 0–1 = số ô sáng xanh/tiến độ; `board` = bảng nổi vd STEP 3), **cave** (hang đá tiền sử, lửa trại, ổ rơm, xương; sit = ngồi ổ rơm; fx2 = độ lớn lửa; `board` = hình vẽ trên vách), **cafe** (quán cà phê vỉa hè phác chì, bàn tròn; sit spot < 0.5 trái bàn, > 0.5 phải bàn; `board` = tên quán), **tatami** (phòng Nhật cửa giấy, chiếu, bàn thấp; `board` = chữ thư pháp; fx2 > 0.5 = hoàng hôn), **paper** (giấy kem vẽ tay, chữ viết tay lớn góc trái = `board`, dòng 2 màu đỏ; fx2 > 0.5 = mũi tên vẽ tay; hợp đoạn giải thích có nhân vật), **noirstreet** (phố đêm hổ phách, cửa kính tiệm sáng cam có xe đỏ; `board` = biển tiệm; fx2 > 0.5 = mưa; hợp bộ Ink), **crt** (màn hình camera an ninh trên nền đen, nhân vật nhỏ trong khung, nhãn CAM + giờ chạy; `board` = nhãn camera; fx2 > 0.5 = nhiễu), **chalkboard** (bảng phấn trên bàn đêm, chữ phấn lớn = `board`, "/" xuống dòng; KHÔNG nhân vật; fx2 > 0.5 = rung + đèn chớp), **oldtown** (phố cổ châu Âu, quán mái che đỏ, tháp sắt xa; `board` = biển quán), **schematic** (nền bản vẽ cho đoạn sự thật/khoa học – không nhân vật, dùng ui `count`/`label`/`gauge`), **tabletop** / **tabletop-top** (đặc tả đồ vật trên bàn – không nhân vật).

**cast (nhân vật):** nam (nhân vật chính "you", nam), linh (crush nữ), tuan (bạn thân), khoa (bạn học), me (mẹ), bo (bố), em (em gái nhỏ), ba (bà), chi (chị), thay (thầy/nhà khoa học), sep (sếp/người lạ mặc vest), alien, ong (ông), bacsi (bác sĩ), yta (y tá), cogiao (cô giáo), canhsat (cảnh sát), daubep (đầu bếp), congnhan (công nhân), vdv (vận động viên), gamethu (game thủ), mai (hot girl/influencer), hung (kẻ bắt nạt), minh (mọt sách), daigia (đại gia), embe (em bé), robot, zombie, vua (vua), trom (kẻ trộm), thungan (thu ngân), phihanh (phi hành gia), ◆ tunhan (tù nhân áo sọc), quanguc (quản ngục), tiensu / tiensu2 (người tiền sử nam / nữ), barista (nhân viên quán cà phê), samurai, ninja, lanhchua (lãnh chúa Nhật), thamtu (thám tử noir), phatthanh (phát thanh viên TV), binhsi (binh sĩ), hiepsi (hiệp sĩ), cuopbien (cướp biển), caoboi (cao bồi), phuthuy (phù thủy), viking, macarong (ma cà rồng), sieunhan (siêu anh hùng), nongdan (nông dân nón rơm), thamhiem (nhà thám hiểm), qc1…qc8 (quần chúng). Diễn viên đầu tiên của cảnh là nhân vật chính nếu không ghi `cast`.

**facing:** right, left, front, profile-right, profile-left.

**pose (tư thế/động tác):** đứng: stand, relaxed, hands_hips, arms_crossed, think, shrug, hold, hunched, lean_back, tired · nói/chỉ: talk, point, point_up, reach, catch, hand_up, phone_ear, shh, salute, bow · cảm xúc: arms_up, cheer, jump, bounce, victory, fist_pump, thumbs_up, clap, laugh, point_laugh, dance, flex, hands_on_head, facepalm, cover_face, recoil, panic, shiver, sob, scratch_head, wipe_sweat, nod, shake_head, shake_fist, stomp, tap_foot, check_watch, yawn, stretch, pray, beg, kneel, hide, peek, look_around · tương tác: wave, wave_both, hug, high_five, push, punch, kick, throw, eat, drink, typing · thân thể: sit, sleep, lie, fall, faint, float, spin, jumping_jacks · **di chuyển (cần `to`)**: walk, run, dash, sneak, crawl, moonwalk, fly.

**expr (biểu cảm):** neutral, happy, smug, shock, worried, oops, cool, dizzy, tired, angry, love, cry, wow, sad, laugh, grin, wink, shy, embarrassed, scared, disgusted, suspicious, confused, bored, excited, evil, sleepy, determined, nervous, proud, crazy, sick, pout, kiss, rage, relieved, drool, jealous, surprised, thinking.

**props (đồ vật):** mug, cat, phone, phone_call, book, books, paper, papers, alarm, laptop, pizza, pizzabox, cookie, cookies, plate, plate_top, cookie_top, calendar, paperball, coins, coconut, fish, crab, bottle, banana, shell, spear, sign, cage, bone, campfire, coffee, notebook, pen, tablet, katana, play_button, camera, sleep_mask, price_tag, letter, lamp, chair, dog, box, clapper, bulb, sticky_note, gift, basketball, umbrella, trophy, ticket, backpack, flashlight, key, money, cactus (`text` dùng cho notebook/play_button/price_tag/letter/box/clapper/sticky_note/ticket; lamp/flashlight `text: off` = tắt) (`text` ≤ 16 ký tự cho phone/alarm/sign/calendar/paper).

**ui (chữ & hiệu ứng trên màn hình):**
- `title` – thẻ tiêu đề lớn (`text`, `text2`, `accent` = từ được tô màu). Dùng cho title drop, đặt trên set `burst`.
- `toast` – băng chữ trên cùng giữa màn hình: "DAY 7", "+1 SPEAR", "38 / 100". ≤ 18 ký tự.
- `tag` – nhãn cạnh nhân vật (`text` ≤ 14, `mark`: x / check).
- `count` – số chạy từ 0 đến `to`, `text` = đơn vị ≤ 18 ký tự. Dùng trên `schematic`/`burst`; nếu có nhân vật thì đặt `y: 230`.
- `gauge` (thanh từ `from` đến `to`, 0–1, `text` = nhãn), `dial` (đồng hồ số `from`→`to`), `chip` (nhãn nhỏ góc trên trái), `label` (nhãn trên bản vẽ `schematic`), `float` (chữ bay lên "+1").
- Gắn vào nhân vật (`who` = chỉ số diễn viên): `bubble` (lời thoại ≤ 32 ký tự), `thought`, `question`, `exclaim`, `hearts`, `sweat`, `anger`, `idea`, `zzz`, `music`, `money`, `speed`, `sparkle`, `dizzy`, `rings`, `pow` (chữ nổ truyện tranh ≤ 8 ký tự: "BEEP!", "CRACK!").
- `at` (0–1) = lúc xuất hiện trong cảnh, dùng để chữ hiện đúng lúc giọng đọc nhắc tới.

**move (máy quay):** zoom_in (chậm, căng thẳng), zoom_out (lộ cảnh), crash (zoom giật – sốc), pan_left / pan_right, tilt_up / tilt_down, dutch (nghiêng – bất an), handheld (rung tay – hỗn loạn), whip (lia), follow (theo người đi), two (khung hai người – đối thoại/lãng mạn).

**crowdMood:** idle, watch, cheer, clap, laugh, talk, dance, panic, angry, walk.

### Quy tắc dựng cảnh sinh động (áp cho mọi JSON)
1. **Mỗi câu ≥ 1 cảnh; câu > 10 từ hoặc có 2 hành động → tách 2 cảnh** (cùng `sent`, `line` là 2 nửa câu). Mục tiêu 2–3,5 giây/cảnh; 30 giây đầu ≤ 2,5 giây/cảnh.
2. **Góc máy xoay vòng:** không quá 3 cảnh liền cùng `set` + `cam`. Nhịp mẫu: wide (thiết lập) → medium (hành động) → close (phản ứng) → xclose (cú đấm/cảm xúc mạnh).
3. **close/xclose chỉ 1 diễn viên.** Hai người nói chuyện: `medium` + `move: two`, spot 0.3 và 0.7, mặt nhìn nhau (right/left). Ba–bốn người: `wide`.
4. **Biểu cảm khớp từng câu**, đổi giữa cảnh bằng `expr2` + `at` khi câu có cú bẻ ("…and it works." → `expr: worried`, `expr2: wow`, `at: 0.6`).
5. **Động tác trong câu dùng `pose2`** ("Then she slaps you" → `pose: stand`, `pose2: push`, `at: 0.4`). Đi/chạy luôn có `spot` và `to`.
6. **Chữ trên màn hình** cho mọi con số quan trọng, mốc ngày (`toast` hoặc `board`), thước đo (`toast` "SPEARS: 38/100"), lời thoại then chốt (`bubble`), sự thật (`schematic` + `count`/`label`). Khoảng 1 ui mỗi 2 cảnh.
7. **Chuyển cảnh 20–30% số cảnh**, đúng chỗ: `fade`/`iris`/`dipwhite` khi nhảy ngày/sang đêm, `whip`/`slide`/`wipe`/`split` khi đổi bối cảnh, `flash` vào cảnh tiêu đề, `glitch`/`pixel` vào/ra `schematic`, `zoom`/`shake`/`comic` cho cú sốc, `heart` cho khoảnh khắc lãng mạn. Còn lại để trống (cắt thẳng). Cảnh 1: `fade`.
8. **Máy quay chuyển động 30–50% số cảnh**: crash cho sốc, zoom_in cho căng thẳng/bí mật, handheld cho hỗn loạn, follow cho đi/chạy, two cho đối thoại, zoom_out khi lộ quy mô (hòn đảo, đám đông).
9. **Thời gian trong ngày liên tục:** đã sang `night` thì các cảnh sau cùng bối cảnh giữ `night` cho đến khi kịch bản nói sáng.
10. **Đám đông** (`crowd` 8–20 + `crowdMood`) cho cảnh làng, lớp học, sân vận động, phản ứng tập thể.
11. **Cảnh im lặng** (không `line`) chỉ được đặt ở cuối video.
12. `sfx` ghi ngắn cho cảnh có tiếng động hoặc chuyển cảnh (whoosh, boom, alarm, heartbeat).
13. **Dùng bối cảnh/đồ vật/nhân vật bổ sung** (`x_...`) như id thường: `"set": "x_rooftop"`, `"props": [{"type": "x_hourglass", "spot": 0.6}]`. Nhân vật bổ sung: `"cast": "x_maya"`. Nhớ giao kèm file cai_dat_shot_builder.bat (K3).
14. Mỗi câu có số/mốc ngày/luật quan trọng → hiện chữ (`toast`, `count`, `label`, `board`). Cảnh dừng thời gian/siêu năng lực: dùng `power` nếu DANH_SACH có (`{"kind": "pause", "label": "PAUSED"}`) và `"glint": true` cho nhân vật.

### Kiểm tra trước khi giao
- `line` ghép lại = file txt (từng chữ). Không có `dur`.
- Không id lạ ngoài DANH_SACH và gói bổ sung của tập.
- close/xclose ≤ 1 diễn viên; không quá 3 cảnh liền cùng set + cam; chuyển cảnh 20–30%.
- Nếu chạy được code: `wi_tools.py check` không còn LỖI.

Xem ví dụ hoàn chỉnh: VI_DU_kich_ban_tts.txt + VI_DU_canh.json (2 phút, 64 cảnh).
