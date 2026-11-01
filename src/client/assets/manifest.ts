/**
 * Nạp manifest asset do `scripts/scan-assets.ts` sinh ra.
 *
 * Manifest nằm ở `public/models/manifest.json` → client đọc được trực tiếp
 * qua HTTP. Nhờ vậy client KHÔNG hard-code tên file: khi người dùng tải bộ
 * Kenney khác tên file, hệ thống vẫn tự tìm theo quy tắc.
 */
export interface ManifestAsset {
  /** Đường dẫn tương đối trong public/, ví dụ "models/furniture/desk.glb". */
  path: string;
  pack: string;
  sizeKb: number;
  meshes: string[];
  animations: string[];
  materials: string[];
  hasSkeleton: boolean;
}

export interface Manifest {
  generatedAt: string;
  count: number;
  assets: ManifestAsset[];
}

let cached: Manifest | null = null;

/** Nạp manifest (cache 1 lần). Trả về null nếu chưa có file. */
export async function loadManifest(): Promise<Manifest | null> {
  if (cached) return cached;
  try {
    const res = await fetch("/models/manifest.json", { cache: "no-cache" });
    if (!res.ok) return null;
    const json = (await res.json()) as Manifest;
    if (!json || !Array.isArray(json.assets)) return null;
    cached = json;
    return json;
  } catch {
    return null;
  }
}

/**
 * Chuẩn hoá tên file để so khớp: bỏ phần mở rộng, ký tự gạch dưới/gạch nối,
 * dấu cách → gộp thành chuỗi chữ thường không phân biệt.
 * Ví dụ "Desk_Small.glb" → "desksmall".
 */
export function normalizeName(name: string): string {
  return name
    .replace(/\.(glb|gltf)$/i, "")
    .replace(/[\s_\-.]+/g, "")
    .toLowerCase();
}

/**
 * Tìm file khớp một danh sách từ khoá.
 * Ưu tiên khớp chính xác, sau đó khớp chứa.
 */
export function findByKeywords(
  manifest: Manifest,
  keywords: string[],
  opts: { pack?: string; requireSkeleton?: boolean } = {},
): ManifestAsset | null {
  const pool = manifest.assets.filter((a) => {
    if (opts.pack && a.pack.toLowerCase() !== opts.pack.toLowerCase()) return false;
    if (opts.requireSkeleton && !a.hasSkeleton) return false;
    return true;
  });

  // 1) Khớp chính xác trên tên chuẩn hoá.
  for (const kw of keywords) {
    const target = normalizeName(kw);
    for (const a of pool) {
      const file = normalizeName(a.path.split("/").pop() ?? "");
      if (file === target) return a;
    }
  }

  // 2) Khớp chứa.
  for (const kw of keywords) {
    const target = normalizeName(kw);
    for (const a of pool) {
      const file = normalizeName(a.path.split("/").pop() ?? "");
      if (file.includes(target)) return a;
    }
  }

  return null;
}

/** Danh sách animation của asset. */
export function animationsOf(asset: ManifestAsset | null): string[] {
  return asset?.animations ?? [];
}

/** Tìm asset nhân vật có rig (ưu tiên gói "characters"). */
export function findCharacter(manifest: Manifest): ManifestAsset | null {
  const skinned = manifest.assets.filter((a) => a.hasSkeleton);
  if (!skinned.length) return null;
  // Ưu tiên gói characters, sau đó tên có chứa "character".
  return (
    skinned.find((a) => a.pack.toLowerCase().includes("character")) ??
    skinned.find((a) => normalizeName(a.path).includes("character")) ??
    skinned[0]
  );
}
