/**
 * Cấu hình truy cập mạng: mặc định chỉ loopback. Bật LAN thì lắng nghe 0.0.0.0, chấp nhận Host là IP riêng/`.local`
 * và BẮT BUỘC token (xem auth.ts). Thay đổi có hiệu lực sau khi khởi động lại.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface NetworkConfig {
  lan: boolean;
}

export function readNetwork(dataDir: string): NetworkConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(dataDir, "network.json"), "utf8")) as Partial<NetworkConfig>;
    return { lan: raw.lan === true };
  } catch {
    return { lan: false };
  }
}

export function writeNetwork(dataDir: string, cfg: NetworkConfig): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "network.json"), JSON.stringify({ lan: cfg.lan === true }), "utf8");
}

/** Host kiểu IP riêng (RFC 1918) hoặc tên `.local`/`.lan` (có thể kèm cổng). */
export function isPrivateLanHost(host: string | undefined): boolean {
  if (!host) return false;
  const bare = host.toLowerCase().replace(/:\d{1,5}$/, "");
  if (/\.(local|lan)$/.test(bare)) return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(local|lan)$/.test(bare);
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(bare);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** Địa chỉ LAN của máy này để hiển thị cho người dùng (IPv4 riêng). */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal && isPrivateLanHost(i.address)) out.push(i.address);
    }
  }
  return out;
}
