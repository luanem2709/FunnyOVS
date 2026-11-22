/** Kiểm tra trình duyệt có tạo được ngữ cảnh WebGL không (để chọn giữa cảnh 3D và bảng dự phòng). */
export function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Có ép dùng bảng dự phòng không (`?fallback=1`) — tiện cho kiểm thử và máy yếu. */
export function forceFallback(): boolean {
  return new URLSearchParams(location.search).get("fallback") === "1";
}
