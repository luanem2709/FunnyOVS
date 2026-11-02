# NEEDS_APPROVAL — Việc cần người dùng duyệt

Các mục dưới đây **chưa** được thực hiện vì nằm ngoài phạm vi tự chủ.
Khi nào có thể, ghi vào đây kèm lý do và các lựa chọn khả thi.

---

## 1. Merge nhánh `auto/*` vào `main`

- **Trạng thái:** Chờ duyệt.
- **Lý do:** Chế độ tự chủ cấm merge vào `main`, xóa nhánh, force push hay sửa lịch sử git.
- **Nhánh hiện tại:** `auto/2026-11-02-van-phong-3d`
- **Lựa chọn cho người dùng:**
  1. `git merge auto/2026-11-02-van-phong-3d` vào `main` rồi `git push origin main`.
  2. Xem diff trước: `git diff main..auto/2026-11-02-van-phong-3d --stat`.
  3. Giữ nguyên nhánh để tôi tiếp tục làm thêm.

## 2. Đổi hạn mức token / mở thêm quyền cho agent

- **Trạng thái:** Chờ duyệt.
- **Lý do:** Cấm thuộc nhóm "tăng hạn mức token, mở thêm quyền cho agent, bật mức Tự chủ cao".
- **Ghi chú:** Chu kỳ này dùng `~95k` token. Nếu muốn tôi tiếp tục chạy liên tục, cần nới hạn mức.

## 3. Thư viện tri thức: ghi bài học tự động

- **Trạng thái:** Chờ duyệt.
- **Lý do:** Chưa rõ cơ chế lưu trữ (file JSON/SQLite hay API nội bộ) và quyền ghi.
- **Lựa chọn cho người dùng:**
  1. Dùng file `data/knowledge/*.md` trong repo (đơn giản, review được bằng git).
  2. Dùng SQLite cùng cơ sở dữ liệu với nhật ký token.
  3. Bỏ qua, chỉ ghi bài học vào `docs/LOG.md`.

## 4. Đổi tên/thương hiệu "FunnyOVS" cho khớp `my-office`

- **Trạng thái:** Chờ duyệt.
- **Lý do:** Đây là thay đổi thương hiệu + nội dung, ảnh hưởng UI và tài liệu.
- **Ghi chú:** Người dùng có nói "viết giống repo my-office" — hiện tại tôi mới port *kỹ thuật/ý tưởng*, chưa sao chép nguyên văn giao diện hay nội dung. Cần xác nhận mức độ "giống" mong muốn:
  1. Giống về *cảm giác* (ánh sáng, góc camera, tông màu) — đang làm theo hướng này.
  2. Giống cả *bố cục màn hình* (sidebar, panel, thanh điều hướng) — cần đọc `my-office/src/office/ui/*` để port.
  3. Chỉ cần giống *phong cách 3D*, giữ nguyên UI hiện tại.
