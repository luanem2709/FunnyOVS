/**
 * Đường dẫn an toàn — chống path traversal (../), symlink, và chặn cứng thư mục hệ thống.
 *
 * Nguyên tắc: LUÔN chuẩn hóa (realpath) đường dẫn TRƯỚC khi kiểm tra quyền,
 * rồi kiểm tra lại lần nữa sau khi chuẩn hóa để tránh TOCTOU.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Thư mục làm việc duy nhất agent được phép chạm mặc định.
 * Đọc động từ env mỗi lần gọi để có thể thay đổi trong test/sandbox.
 */
export function workspaceRoot(): string {
  return path.resolve(process.env.OFFICE_WORKSPACE ?? path.join(process.cwd(), "workspace"));
}

/**
 * Các thư mục bị chặn cứng: hệ thống, nơi chứa bí mật, thư mục trình duyệt, kho mật khẩu.
 * Agent KHÔNG BAO GIỜ được cấp quyền cho các path nằm trong danh sách này
 * (kể cả khi người dùng bấm duyệt — cần bật thủ công qua `manualUnlock`).
 */
const HARD_BLOCKED_PATTERNS: RegExp[] = [
  /(^|[\\/])\.ssh([\\/]|$)/i,
  /(^|[\\/])\.gnupg([\\/]|$)/i,
  /(^|[\\/])\.aws([\\/]|$)/i,
  /(^|[\\/])\.azure([\\/]|$)/i,
  /(^|[\\/])\.kube([\\/]|$)/i,
  /(^|[\\/])\.docker([\\/]|$)/i,
  /(^|[\\/])\.npmrc([\\/]|$)/i,
  /(^|[\\/])\.netrc([\\/]|$)/i,
  /(^|[\\/])\.git-credentials([\\/]|$)/i,
  /(^|[\\/])AppData[\\/]Local[\\/]Google[\\/]Chrome/i,
  /(^|[\\/])AppData[\\/]Local[\\/]Microsoft[\\/]Edge/i,
  /(^|[\\/])AppData[\\/]Roaming[\\/]Mozilla/i,
  /(^|[\\/])AppData[\\/]Local[\\/]BraveSoftware/i,
  /(^|[\\/])AppData[\\/]Roaming[\\/]Mozilla/i,
  /(^|[\\/])Passwords?( |$)/i,
  /(^|[\\/])Keychains?([\\/]|$)/i,
  /(^|[\\/])Credentials([\\/]|$)/i,
  /(^|[\\/])\.env(\.[^\\/]*)?$/i,
  /(^|[\\/])id_rsa(\.pub)?$/i,
  /(^|[\\/])System32([\\/]|$)/i,
  /(^|[\\/])Windows([\\/]|$)/i,
  /(^|[\\/])Program Files([\\/]|$)/i,
  /(^|[\\/])Program Files \(x86\)([\\/]|$)/i,
  /(^|[\\/])Boot([\\/]|$)/i,
  /(^|[\\/])EFI([\\/]|$)/i,
  /(^|[\\/])etc([\\/]|$)/i,
  /(^|[\\/])\.cache[\\/]pwsh/i,
  /(^|[\\/])Credential Manager([\\/]|$)/i,
];

export interface PathCheck {
  ok: boolean;
  reason?: string;
  resolved?: string;
  code?: "outside_workspace" | "hard_blocked" | "not_found" | "invalid" | "symlink_escape";
}

/** Kiểm tra chuỗi path đầu vào có hợp lệ không (null byte, ký tự điều khiển). */
export function isValidPathInput(input: string): boolean {
  if (typeof input !== "string" || input.length === 0) return false;
  if (input.includes("\0")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(input)) return false;
  return true;
}

/** Chuẩn hóa path tuyệt đối (chưa resolve symlink). */
export function normalizePath(input: string): string {
  return path.resolve(workspaceRoot(), input);
}

/** Kiểm tra path có nằm trong một thư mục gốc cho trước hay không. */
export function isWithin(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  if (r === t) return true;
  const rel = path.relative(r, t);
  return rel.length > 0 && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/** Path có nằm trong danh sách chặn cứng không (kiểm tra trên cả dạng raw và resolved). */
export function isHardBlocked(target: string): boolean {
  const t = target.replace(/\\/g, "/");
  return HARD_BLOCKED_PATTERNS.some((re) => re.test(t));
}

/**
 * Chuẩn hóa + kiểm tra an toàn.
 * @param input đường dẫn do agent đưa (có thể tương đối so với workspace)
 * @param root  thư mục gốc được phép (mặc định workspace)
 */
export function checkPath(input: string, root: string = workspaceRoot()): PathCheck {
  if (!isValidPathInput(input)) return { ok: false, code: "invalid", reason: "Đường dẫn không hợp lệ." };

  const absolute = path.resolve(root, input);

  if (isHardBlocked(absolute)) {
    return {
      ok: false,
      code: "hard_blocked",
      reason: "Đường dẫn nằm trong vùng bị chặn cứng (hệ thống / bí mật / trình duyệt). Cần bật thủ công.",
    };
  }

  // Chuẩn hóa symlink: realpath trên phần tồn tại gần nhất (path.resolve sẽ không theo symlink)
  let realRoot = root;
  try {
    realRoot = fs.realpathSync.native(root);
  } catch {
    /* root chưa tồn tại — dùng nguyên bản */
  }

  const resolved = resolveExisting(absolute);
  if (isHardBlocked(resolved)) {
    return { ok: false, code: "hard_blocked", reason: "Đường dẫn sau khi chuẩn hóa nằm trong vùng bị chặn cứng." };
  }

  if (!isWithin(realRoot, resolved)) {
    return {
      ok: false,
      code: "outside_workspace",
      reason: "Đường dẫn nằm ngoài thư mục làm việc được cấp quyền.",
      resolved,
    };
  }

  // Chặn symlink chỉ điểm ra ngoài (đã được xử lý bởi isWithin trên resolved path)
  const linkTarget = checkSymlinkEscape(absolute, realRoot);
  if (linkTarget) {
    return { ok: false, code: "symlink_escape", reason: "Symlink trỏ ra ngoài vùng được phép.", resolved: linkTarget };
  }

  return { ok: true, resolved };
}

/** realpath phần tồn tại gần nhất + phần chưa tồn tại. */
export function resolveExisting(target: string): string {
  let current = path.resolve(target);
  const tail: string[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (fs.existsSync(current)) {
      try {
        const real = fs.realpathSync.native(current);
        return tail.length ? path.join(real, ...tail) : real;
      } catch {
        return path.join(current, ...tail);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return path.join(current, ...tail);
    tail.unshift(path.basename(current));
    current = parent;
  }
}

/** Nếu chính path là symlink và trỏ ra ngoài root → trả về target. */
function checkSymlinkEscape(absolute: string, realRoot: string): string | null {
  try {
    const st = fs.lstatSync(absolute);
    if (st.isSymbolicLink()) {
      const real = fs.realpathSync.native(absolute);
      if (!isWithin(realRoot, real)) return real;
    }
  } catch {
    /* không tồn tại */
  }
  return null;
}

/** Thư mục hệ thống bị chặn để hiển thị cho UI. */
export function listHardBlockedHints(): string[] {
  return [
    `${os.homedir()}\\.ssh`,
    `${os.homedir()}\\.gnupg`,
    `${os.homedir()}\\.aws`,
    "AppData\\Local\\Google\\Chrome",
    "AppData\\Roaming\\Mozilla",
    "Program Files",
    "Windows\\System32",
  ];
}
