/**
 * Sinh DAO-DIEN.md (shot list, character bible, floor plan, continuity sheet) TỪ shots.json + characters.json + timing.json,
 * nên tài liệu không bao giờ lệch với thứ đã dựng.   node workspace/roblox-clip/gen-docs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const kit = path.dirname(fileURLToPath(import.meta.url));
const here = path.resolve(process.argv.includes("--project") ? process.argv[process.argv.indexOf("--project") + 1] : kit);
const J = (f) => JSON.parse(fs.readFileSync(path.join(here, f), "utf8"));
const shots = J("shots.json");
const chars = J("characters.json");
const tm = J("timing.json");
const L = [];

L.push("# Đạo diễn: shot list, character bible, floor plan, continuity", "");
L.push("> Sinh tự động bởi `gen-docs.mjs` từ `shots.json`, `characters.json`, `timing.json` — sửa dữ liệu rồi chạy lại, đừng sửa tay file này.", "");
L.push("Phương pháp học từ skill *camera-cinematography* trong OpenMontage (xem `NGHIEN-CUU.md` §7): đi theo 7 bước — ý tưởng → character bible → shot list (cỡ cảnh + góc máy + chuyển động theo ý đồ cảm xúc) → bố cục (1/3, headroom, lookspace) → floor plan + trục 180° → continuity → rà soát.", "");

L.push("## 1. Ý tưởng", "");
L.push(`Truyện cảnh báo ngôi "bạn": người làm freelancer bị khách quỵt "tuần sau anh trả", rồi chính mình nói câu đó với người mới. Khung **${shots.aspect}**, 24 khung/giây, dài **${tm.total.toFixed(1)} giây**, nhịp cảnh do **độ dài giọng đọc thật** quyết định (\`timing.json\`).`, "");

L.push("## 2. Character bible", "");
L.push("| Nhân vật | Kiểu | Nhận dạng cố định |", "|---|---|---|");
L.push(`| ${chars.hero.ten} | ${chars.hero.kieu} | ${chars.hero.co_dinh.join("; ")} |`);
L.push(`| Bạn — cảnh 8 (cùng người, đổi vai) | plush | vest ${chars.hero.bien_the.vest.shirt} + cà vạt đỏ ${chars.hero.bien_the.vest.tie}, vẫn giữ vương miện/tóc/cánh |`);
L.push(`| ${chars.mom.ten} | ${chars.mom.kieu} | áo hồng ${chars.mom.shirt}, tóc búi |`);
L.push(`| ${chars.student.ten} | ${chars.student.kieu} | áo xanh lá ${chars.student.shirt}, balô cam ${chars.student.backpack} |`);
L.push(`| ${chars.clients.ten} | ${chars.clients.kieu} | 12 áo màu khác nhau; ${chars.clients.nguoi_cam_bien} cầm biển "TUẦN SAU ANH TRẢ" |`, "");
L.push(`Cảm xúc của nhân vật chính → mặt (decal): ${Object.entries(chars.hero.cam_xuc).map(([k, v]) => `${k} = \`${v}\``).join(", ")}.`, "");

L.push("## 3. Shot list", "");
L.push("| # | Cảnh | Thời gian | Cỡ cảnh | Góc máy | Chuyển động | Ý đồ (vì sao chọn) |", "|---|---|---|---|---|---|---|");
for (const s of shots.shots) {
  const [a, b] = tm.scenes[s.scene];
  const t0 = a + (b - a) * s.f[0];
  const t1 = a + (b - a) * s.f[1];
  L.push(`| ${s.id} | ${s.scene} | ${t0.toFixed(1)}–${t1.toFixed(1)} s | ${s.size} | ${s.angle} | ${s.move} | ${s.why} |`);
}
L.push("", `**Nhịp tăng dần cảm xúc:** mỗi cảnh đi Wide → Medium → Close-up (hoặc ngược lại khi cô lập nhân vật); cắt cứng trong cảnh, mờ đen 0,3 giây giữa các cảnh.`, "");

L.push("## 4. Floor plan (nhìn từ trên xuống, đơn vị stud)", "");
L.push("```text");
L.push("PHÒNG TRỌ (cảnh 1–5, 7)                         z = -9  tường sau (cửa sổ, áp phích, lịch)");
L.push("  x:-13 ............................ +13");
L.push("  [cây]      [cửa sổ]                    [GIƯỜNG x≈8.5, z≈-3.4]");
L.push("         BẠN (x=-3, z=0.3) quay mặt +z (về phía máy)");
L.push("         BÀN (x=-3, z=2.5) + LAPTOP (z=2.1, màn hình quay về phía bạn, lưng về máy)");
L.push("  mẹ đi vào: x -14 → -6, z=3.9 (trái→phải) | sinh viên: x -18 → -9.5, z=6 (trái→phải)");
L.push("  MÁY QUAY: luôn ở z > 0 (phía trước nhân vật), nửa x>0 cho cảnh 1–5, 7 → KHÔNG BAO GIỜ vượt trục");
L.push("");
L.push("VĂN PHÒNG (cảnh 8, dời z = -200)");
L.push("  sinh viên ngồi bàn (x=-6, z=0.2) | BẠN đứng sau (x=-1.5, z=-2.2) quay mặt về +z | máy ở z > 0");
L.push("```", "");
L.push("**Trục 180°:** cảnh 7 trục = đường nối sinh viên (trái) ↔ bạn (phải). Sinh viên nhìn **sang phải**, bạn quay **sang trái**: shot ngược 7C khớp hướng nhìn với 7B, máy không bao giờ qua trục.", "");

L.push("## 5. Continuity sheet", "");
L.push("| Cảnh | Giờ/ánh sáng | Cốc cà phê (motif) | Trang phục bạn | Ghi chú |", "|---|---|---|---|---|");
L.push("| s1 | ngày, sáng | 1 | áo thun đen | bong bóng \"TỰ DO\" chỉ ở đầu cảnh |");
L.push("| s2 | đêm, đèn bàn + ánh màn hình | 2 | giống s1 | tin nhắn hiện đúng lúc giọng đọc nhắc tới |");
L.push("| s3 | ngày–đêm lặp 3 lần → bình minh | 2→6 | giống s1 | gục dần: đầu cúi, mặt `tired` |");
L.push("| s4 | ngày | 6 | giống s1 | 3 tin nhắn, \"Đã xem\" lần lượt |");
L.push("| s5 | hoàng hôn | 6 | giống s1 | hộp cơm đặt ở (−5.4, 3.2, 3.0) và **còn đó** ở s7 |");
L.push("| s6 | hoàng hôn, ngoài trời | — | giống s1 (nhỏ, tiền cảnh) | 12 khách, 9 biển |");
L.push("| s7 | đêm | 6 | giống s1 | hộp cơm vẫn trên bàn; bạn quay sang trái |");
L.push("| s8 | ngày, văn phòng | 4 | **vest + cà vạt đỏ** | cùng nhân vật, đổi vai |", "");

L.push("## 6. Rà soát 10 lỗi continuity", "");
L.push("| Lỗi | Cách xử lý trong clip |", "|---|---|");
L.push("| Đổi tay cầm đạo cụ | không có đạo cụ cầm tay đổi tay (hộp cơm do mẹ đặt xuống, không cầm lại) |");
L.push("| Trang phục/tóc đổi | mọi cảnh lấy từ `characters.json`; chỉ đổi vest ở cảnh 8 có chủ đích |");
L.push("| Ánh sáng/màu đổi | mỗi cảnh một chế độ ánh sáng ghi ở bảng trên |");
L.push("| Đảo hướng nhìn/di chuyển | trái→phải ở s5, s7; trục 180° giữ nguyên |");
L.push("| Đạo cụ tự dời | hộp cơm, cốc: vị trí cố định theo toạ độ trong mã |");
L.push("| Thiết bị quay lọt khung / phản chiếu / logo | cảnh dựng bằng code: không có; không dùng logo Roblox |");
L.push("| Đồng hồ sai giờ | không có đồng hồ trong cảnh |");
L.push("| Tiếng nền đổi đột ngột | nền pad liên tục, hạ 50% dưới giọng đọc |", "");

fs.writeFileSync(path.join(here, "DAO-DIEN.md"), L.join("\n") + "\n");
console.log("đã tạo DAO-DIEN.md");
