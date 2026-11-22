# NOTICE — Ghi nhận nguồn và giấy phép bên thứ ba

FunnyOVS (MIT, xem `LICENSE`) có dùng ý tưởng và một số đoạn mã đã được **viết lại / port** từ các dự án mã nguồn mở dưới đây.
Cả năm dự án đều dùng **giấy phép MIT**; theo điều kiện của giấy phép, thông báo bản quyền được giữ nguyên ở đây và ở đầu các file có mã port.

| Dự án | Bản quyền | Phần FunnyOVS dùng |
|---|---|---|
| [my-office](https://github.com/khanh020905/my-office) | Copyright (c) 2026 khanh020905 | **Mã port:** chibi rig (`src/client/assets/chibiRig.js`). **Ý tưởng:** bảng máy RAM/CPU (`src/server/office/machine.ts`), nhật ký/replay, cảnh "sống" của văn phòng. |
| [agent-office-3d](https://github.com/jefferysha0627/agent-office-3d) | Copyright (c) 2026 Jeffery Sha | **Ý tưởng cấu trúc:** bảng hành vi nhàn rỗi theo dữ liệu — xác suất, thời lượng, địa điểm (`IDLE_ACTIONS` trong `src/client/assets/behavior.ts`); nhãn đỏ khi cần xác nhận. Nội dung và mã viết lại. |
| [Agentes IA 3D](https://github.com/ederland/Agentes_IA_3D) | Copyright (c) 2026 Ederland Studio | **Mã port:** lưới điều hướng A* (`src/client/assets/navgrid.ts`, từ `app/src/office/navgrid.js`). **Ý tưởng:** trạng thái "chờ phê duyệt" của pipeline tác vụ. |
| [Hermes3D](https://github.com/iamlukethedev/Hermes3D) | Copyright (c) 2026 Luke The Dev | **Ý tưởng kiến trúc:** backend là nguồn sự thật, giao diện chỉ phản chiếu; lớp provider trung lập; mô hình trạng thái agent; chế độ dự phòng cho máy yếu (`src/shared/officeEntity.ts`, `office-3d/fallback`). Không copy mã hay asset. |
| [cubefarm](https://github.com/leonvanzyl/cubefarm) | Copyright (c) 2026 Leon van Zyl | **Ý tưởng:** quy trình issue → PR → QA trong phiên mới; hạn mức/pacing. Chưa hiện thực trong mã. Không copy mã hay asset. |

Phân tích chi tiết và lý do chọn từng phần: `docs/05-hop-nhat-5-repo.md`.

### Ý tưởng phân tầng công ty (Giám đốc → Trưởng phòng → Nhân viên)
Chỉ tham khảo **ý tưởng**, không sao chép mã (`src/server/org/*`, `src/client/office-3d/ui/OrgPanel.tsx` do FunnyOVS tự viết):

| Dự án | Giấy phép | Ý tưởng dùng |
|---|---|---|
| [1mancompany/OneManCompany](https://github.com/1mancompany/OneManCompany) | Apache-2.0 | Cây tác vụ: cấp trên tách việc rồi phân xuống, nghiệm thu ở mỗi cấp |
| [abh2050/agent-org-chart](https://github.com/abh2050/agent-org-chart) | không ghi giấy phép trong repo | Sơ đồ tổ chức là dữ liệu thuần; độ sâu giao việc bị chặn, không vòng lặp |
| [kevmurr57/knownow-office-agents](https://github.com/kevmurr57/knownow-office-agents) | không ghi giấy phép trong repo | Tách yêu cầu nhiều phòng thành từng phần; giao việc rõ ràng; việc tốn tiền/không đảo ngược trả về người |
| [tmege/agents-company](https://github.com/tmege/agents-company) | không ghi giấy phép trong repo | Chuỗi chỉ huy hub-and-spoke, không giao việc vòng tròn |

Ba dự án không ghi giấy phép được coi là "bảo lưu mọi quyền": FunnyOVS **không** copy mã hay nội dung của chúng.

## Dịch vụ AI bên ngoài (không đi kèm mã)
FunnyOVS **kết nối** (qua giao diện OpenAI-compatible) tới các dịch vụ do người dùng tự cài hoặc tự đăng ký: [OmniRoute](https://github.com/diegosouzapw/OmniRoute) (cổng gom nhiều nguồn AI, chạy cục bộ),
Ollama, LM Studio, Groq, Google Gemini, Cerebras, Mistral, OpenRouter, GitHub Models. **Không copy mã hay asset** của các dịch vụ này; điều khoản sử dụng của từng dịch vụ do người dùng chấp nhận khi tạo khoá.

## Sửa đổi trên mã port
`src/client/assets/chibiRig.js` (port từ my-office, MIT): thêm **cà vạt** cho áo sơ mi (`cfg.tie`), **huy hiệu** ngực màu phòng ban (`cfg.badge`), và đặt các chi tiết (cà vạt, ve áo, huy hiệu) **lên đúng bề mặt thân** (`torsoSurf`) để thấy được từ xa. Phần còn lại giữ nguyên.

## Đã loại có chủ đích
- **Firebase** (Agentes IA 3D), **Upstash Box** (cubefarm), **Minecraft/Mojang** (agent-office-3d): là dịch vụ ngoài hoặc cần đồng ý điều khoản bên thứ ba — không dùng.
- **Asset (GLB, font, PNG)** của năm dự án trên: **không copy**. Riêng 17 file GLB của Hermes3D không ghi nguồn gốc/giấy phép.

## Bộ Kenney Furniture Kit (tuỳ chọn, chưa đi kèm)
Mã của FunnyOVS tự nạp model từ `public/models/` nếu có (xem `npm run scan:assets`). Bộ [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)
dùng giấy phép **Creative Commons CC0** (không yêu cầu ghi nguồn, nhưng nên ghi). Hiện **chưa** đưa vào repo.

## Thư viện chạy (runtime)
React, React DOM, @react-three/fiber, Zustand, three, zod, express, ws, better-sqlite3, playwright-core, Electron, **nodemailer** (MIT, © Andris Reinman) và **imapflow** (MIT, © Postal Systems OÜ — email SMTP/IMAP thật): đều MIT hoặc tương đương;
xem `package.json` / `package-lock.json` để biết phiên bản.

---

## Văn bản giấy phép MIT (áp dụng cho từng dự án ở bảng trên, với dòng bản quyền tương ứng)

```
MIT License

Copyright (c) 2026 <chủ sở hữu nêu ở bảng trên>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
