/**
 * Mẫu ARIA tablist dùng chung: ←/→ chuyển mục (xoay vòng), Home/End về đầu/cuối.
 * Trả về mục cần chuyển tới, hoặc null nếu phím không liên quan (để giao diện không chặn các phím khác).
 */
export function stepKey<T>(list: readonly T[], current: T, key: string): T | null {
  const n = list.length;
  if (n === 0) return null;
  const i = Math.max(0, list.indexOf(current));
  switch (key) {
    case "ArrowRight":
      return list[(i + 1) % n];
    case "ArrowLeft":
      return list[(i - 1 + n) % n];
    case "Home":
      return list[0];
    case "End":
      return list[n - 1];
    default:
      return null;
  }
}
