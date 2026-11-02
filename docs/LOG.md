# LOG — Nhật ký chu kỳ phát triển tự chủ

Mỗi chu kỳ phát triển tự chủ ghi một mục ở đây. Mục mới nhất ở trên cùng.

Quy ước ước tính token: `~<số>` = số token ước tính đã dùng trong chu kỳ đó.

---

## 2026-11-02 — Chu kỳ 3: Tối ưu hiệu năng + hoàn thiện đi lại

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
