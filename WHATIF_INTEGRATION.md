# What-If Studio — Tích hợp ShotBuilder vào FunnyOVS

> Tích hợp hoàn thành: 2026-11-24. TypeScript: ✅ pass. Render test: ✅ `B1.png` + `B2.png` xuất thành công.

## Cấu trúc sau tích hợp

```
gaa/FunnyOVS/
├── app/
│   └── what-if-studio/          ← ShotBuilder engine (Remotion)
│       ├── src/                 (React/TSX components hoạt hình)
│       ├── builder/             (render.mjs, ghepphim.pyc...)
│       ├── library/             (bối cảnh, nhân vật, đạo cụ)
│       ├── mau/                 (mẫu JSON + kịch bản)
│       ├── node_modules/        (Remotion đã cài ✅)
│       └── package.json
├── chatbot/
│   └── what-if-chatbot/         ← Tài liệu huấn luyện chatbot AI
│       ├── 1_HUONG_DAN_...txt
│       ├── 2_TAI_LIEU_KNOWLEDGE/
│       └── 3_CHO_KHACH/
├── src/
│   ├── client/office-3d/
│   │   ├── store/ui.ts          ← TABS thêm "whatif"
│   │   ├── i18n/dictionaries.ts ← 40+ key VI/EN cho What-If
│   │   ├── ui/WhatIfPanel.tsx   ← Tab mới trong FunnyOVS UI
│   │   ├── App.tsx              ← Import + route tab whatif
│   │   └── office3d.css         ← CSS cho WhatIfPanel
│   └── server/
│       └── routes/whatif.ts     ← REST API /api/whatif/*
└── workspace/
    └── whatif/                  ← Thư mục lưu dự án What-If
```

## Tab mới trong FunnyOVS

Mở app FunnyOVS → Tab **🎬 What-If** ở thanh bên trái (cạnh Org, AI, CRM, Log, Tổng quan).

## Luồng tạo clip (không tốn token AI)

```
Bước 1: Nhập kịch bản → "Sao chép lệnh cho AI chat"
   ↓
Bước 2: Dán vào ChatGPT/Gemini/Claude WEB (miễn phí)
        → Lưu JSON → "Mở file cảnh"
   ↓
Bước 3: "Tạo dự án" → "Dựng clip"
   ↓
Server gọi: builder/render.mjs → Remotion → Chrome headless → ảnh PNG
            + edge-tts (giọng đọc Python local)
            + ffmpeg (ghép video)
   ↓
Clip .mp4 xuất tại: app/what-if-studio/out/<slug>/<slug>.mp4
```

## API endpoints

| Endpoint | Method | Mô tả |
|---|---|---|
| `/api/whatif/state` | GET | Trạng thái jobs + danh sách dự án |
| `/api/whatif/projects` | POST | Tạo dự án mới (body: project, script, scenes) |
| `/api/whatif/render` | POST | Bắt đầu dựng (body: project, preview, scenes) |
| `/api/whatif/cancel` | POST | Huỷ job đang chạy |
| `/api/whatif/projects/:project/clip.mp4` | GET | Tải clip đã dựng |

## Chạy app

```powershell
# Dev mode (server + client cùng lúc)
cd c:\Users\Xiata\Desktop\gaa\FunnyOVS
npm run dev

# Chỉ server
npm run start
```

## Tiết kiệm token

| Bước | Dùng AI? | Token? |
|---|---|---|
| Viết kịch bản | Tùy chọn | 0 nếu tự viết |
| Tạo file cảnh JSON | Web chat miễn phí | **0 token API** |
| Giọng đọc (edge-tts) | Không | **0** |
| Render Remotion | Không — local | **0** |
| Ghép ffmpeg | Không — local | **0** |

> ✅ **Tổng: 0 token API** nếu dùng web chatbot miễn phí để tạo cảnh.
