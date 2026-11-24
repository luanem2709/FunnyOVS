# Studio kit — dựng clip bằng dữ liệu (không tốn token lúc kết xuất)

Một clip = vài file dữ liệu nhỏ + bộ kết xuất xác định (three.js trong Chrome + ffmpeg). Không gọi mô hình khi kết xuất.

| File | Vai trò |
|---|---|
| `loi-doc.json` | Lời đọc từng cảnh (nguồn của giọng, phụ đề, timeline) |
| `characters.json` | **Character bible** — nguồn duy nhất cho ngoại hình nhân vật (lưu lại, dùng lại mọi clip) |
| `shots.json` | Shot list điện ảnh: cỡ cảnh, góc máy, chuyển động, tiêu cự, vị trí máy, ý đồ |
| `synth.py` | Giọng đọc (edge-tts — **gửi lời đọc ra dịch vụ online của Microsoft**), bỏ qua câu đã có |
| `timing.mjs` | Độ dài giọng đọc → timeline (`timing.json`) |
| `mix.mjs` | Trộn giọng + nền + tiếng gõ + "ting" theo timeline |
| `render.mjs`, `scene.js`, `index.html` | Dàn cảnh, máy quay, phụ đề, kết xuất từng khung → `clip-co-giong.mp4` |
| `gen-docs.mjs` | Sinh `DAO-DIEN.md` (shot list, floor plan, continuity) từ dữ liệu |

Dùng trong app: thẻ **Studio dựng clip** (tab Tổng quan) hoặc công cụ agent `studio_save` / `studio_render` / `studio_status` — xem [`docs/studio.md`](../docs/studio.md).

Chạy tay từ thư mục gốc FunnyOVS (cần `ffmpeg`, Chrome, `python -m pip install edge-tts`); `--project` là thư mục chứa 3 file dữ liệu (mặc định: chính thư mục kit):

```powershell
python -X utf8 studio/roblox-clip/synth.py studio/roblox-clip
node studio/roblox-clip/timing.mjs
node studio/roblox-clip/mix.mjs
node studio/roblox-clip/render.mjs
node studio/roblox-clip/gen-docs.mjs
```

Ghi chú: dàn cảnh từng cảnh (`scene1…scene8` trong `scene.js`) hiện viết tay cho truyện mẫu; chưa có thư viện cảnh ghép từ JSON. Nghiên cứu và nguồn tham khảo: `roblox-clip/NGHIEN-CUU.md`.
