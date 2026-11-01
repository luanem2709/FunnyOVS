/**
 * Quét asset GLB trong public/models → liệt kê model + animation có thật.
 *
 * Dùng để kiểm chứng trước khi viết code scene: không bịa tên file,
 * không bịa tên animation.
 *
 * Chạy:  npx tsx scripts/scan-assets.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODELS_DIR = path.join(ROOT, "public", "models");

/** Đọc header GLB rồi parse chunk JSON để lấy danh sách node/animation. */
interface GlbInfo {
  file: string;
  sizeKb: number;
  meshes: string[];
  animations: string[];
  materials: string[];
  /** Có chứa skinned mesh (nhân vật có rig) không. */
  hasSkeleton: boolean;
  error?: string;
}

function readGlbInfo(filePath: string): GlbInfo {
  const buf = fs.readFileSync(filePath);
  const result: GlbInfo = {
    file: path.relative(ROOT, filePath).replace(/\\/g, "/"),
    sizeKb: Math.round(buf.length / 1024),
    meshes: [],
    animations: [],
    materials: [],
    hasSkeleton: false,
  };

  try {
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("Không phải file GLB");
    const version = buf.readUInt32LE(4);
    if (version !== 2) throw new Error(`GLB version ${version} (chỉ hỗ trợ 2)`);
    const total = buf.readUInt32LE(8);

    let offset = 12;
    let json: any = null;
    while (offset < total) {
      const chunkLength = buf.readUInt32LE(offset);
      const chunkType = buf.readUInt32LE(offset + 4);
      if (chunkType === 0x4e4f534a) {
        // JSON chunk
        json = JSON.parse(buf.toString("utf8", offset + 8, offset + 8 + chunkLength));
      }
      offset += 8 + chunkLength;
    }
    if (!json) throw new Error("Không tìm thấy JSON chunk");

    for (const m of json.meshes ?? []) {
      const name = m.name || "(không tên)";
      const skinned = (m.primitives ?? []).some((p: any) => p.weights !== undefined);
      result.meshes.push(skinned ? `${name} [skinned]` : name);
      if (skinned) result.hasSkeleton = true;
    }
    for (const a of json.animations ?? []) result.animations.push(a.name || "(không tên)");
    for (const mat of json.materials ?? []) result.materials.push(mat.name || "(không tên)");
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(glb|gltf)$/i.test(entry.name)) out.push(p);
  }
  return out;
}

function main(): void {
  console.log(`\n=== Quét asset: ${MODELS_DIR} ===\n`);
  if (!fs.existsSync(MODELS_DIR)) {
    console.log("Chưa có thư mục public/models.");
    console.log("Hãy tải các gói Kenney (CC0) vào đây rồi chạy lại script này.\n");
    process.exit(0);
  }

  const files = walk(MODELS_DIR);
  if (files.length === 0) {
    console.log("Thư mục có tồn tại nhưng chưa có file .glb/.gltf nào.\n");
    process.exit(0);
  }

  const infos = files.map(readGlbInfo);

  // Gom theo thư mục con (thường là từng gói Kenney)
  const byPack = new Map<string, GlbInfo[]>();
  for (const i of infos) {
    const rel = path.dirname(i.file).replace(/\\/g, "/");
    const pack = rel.replace(/^public\/models\/?/, "") || "(gốc)";
    if (!byPack.has(pack)) byPack.set(pack, []);
    byPack.get(pack)!.push(i);
  }

  for (const [pack, list] of byPack) {
    console.log(`\n──────── ${pack} (${list.length} file) ────────`);
    for (const i of list) {
      console.log(`\n▸ ${path.basename(i.file)}  [${i.sizeKb} KB]`);
      if (i.error) {
        console.log(`  ✖ LỖI: ${i.error}`);
        continue;
      }
      if (i.hasSkeleton) console.log("  ✓ có skeleton (rig)");
      console.log(`  mesh (${i.meshes.length}):`);
      for (const m of i.meshes) console.log(`     - ${m}`);
      console.log(`  animation (${i.animations.length}):`);
      for (const a of i.animations) console.log(`     - ${a}`);
      if (i.animations.length === 0) console.log("     (không có)");
    }
  }

  // Tổng hợp animation để đối chiếu danh sách nhu cầu
  const allAnim = new Set<string>();
  for (const i of infos) for (const a of i.animations) allAnim.add(a);
  console.log(`\n\n=== Tất cả animation tìm thấy (${allAnim.size}) ===`);
  console.log([...allAnim].sort().join(", ") || "(không có)");

  const skinned = infos.filter((i) => i.hasSkeleton);
  console.log(`\n=== File có rig nhân vật (${skinned.length}) ===`);
  for (const s of skinned) console.log(`  - ${path.basename(s.file)}`);

  const failed = infos.filter((i) => i.error);
  if (failed.length) {
    console.log(`\n=== File lỗi (${failed.length}) ===`);
    for (const f of failed) console.log(`  - ${path.basename(f.file)}: ${f.error}`);
  }
  console.log();
}

main();
