/**
 * `document` giả tối thiểu để dựng đối tượng three.js có canvas (biển, bảng, texture sàn, nhân vật) ngay trong Node.
 * Ngữ cảnh 2D là Proxy: mọi hàm vẽ đều là no-op, `measureText` trả độ rộng ước lượng, `canvas` trỏ về canvas giả.
 * Chỉ dùng cho test — không có WebGL, nên không kiểm được hình ảnh, chỉ kiểm cấu trúc cảnh.
 */
export function installFakeDom(): void {
  const makeCanvas = (): Record<string, unknown> => {
    const canvas: Record<string, unknown> = { width: 0, height: 0, style: {} };
    const store: Record<string, unknown> = { canvas };
    const ctx = new Proxy(store, {
      get(t, k: string) {
        if (k in t) return t[k];
        if (k === "measureText") return (s: string) => ({ width: String(s).length * 8 });
        if (k === "createLinearGradient" || k === "createRadialGradient") return () => ({ addColorStop: () => undefined });
        return () => undefined;
      },
      set(t, k: string, v) {
        t[k] = v;
        return true;
      },
    });
    canvas.getContext = () => ctx;
    return canvas;
  };
  const g = globalThis as unknown as { document?: unknown };
  if (!g.document) g.document = { createElement: () => makeCanvas() };
}
