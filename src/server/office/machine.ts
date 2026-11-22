/**
 * Đọc tình trạng máy (CPU, RAM, tiến trình nặng nhất) — chỉ ĐỌC, không bao giờ dừng/đóng tiến trình.
 * Ý tưởng "bảng máy" lấy từ my-office (MIT), viết lại gọn bằng `os` + một lệnh hệ thống có giới hạn thời gian.
 */
import os from "node:os";
import { execFile } from "node:child_process";

export interface MachineProcess {
  name: string;
  pid: number;
  memMb: number;
}

export interface MachineSample {
  host: string;
  platform: NodeJS.Platform;
  cpuPercent: number;
  ramUsedMb: number;
  ramTotalMb: number;
  ramPercent: number;
  uptimeSec: number;
  topProcesses: MachineProcess[];
  at: string;
}

interface CpuTimes {
  idle: number;
  total: number;
}

function cpuTimes(): CpuTimes {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const v of Object.values(c.times)) total += v;
    idle += c.times.idle;
  }
  return { idle, total };
}

/** % CPU đang bận giữa hai lần đo. */
export function cpuPercentBetween(a: CpuTimes, b: CpuTimes): number {
  const total = b.total - a.total;
  if (total <= 0) return 0;
  const idle = b.idle - a.idle;
  return Math.min(100, Math.max(0, Math.round((1 - idle / total) * 100)));
}

/** Phân tích đầu ra `tasklist /FO CSV /NH` (Windows). Mỗi dòng: "chrome.exe","1234","Console","1","123,456 K". */
export function parseTasklist(out: string): MachineProcess[] {
  const rows: MachineProcess[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^"([^"]+)","(\d+)","[^"]*","[^"]*","([\d.,\s]+)\s*K"/.exec(line.trim());
    if (!m) continue;
    const kb = Number(m[3].replace(/[^\d]/g, ""));
    rows.push({ name: m[1], pid: Number(m[2]), memMb: Math.round(kb / 1024) });
  }
  return rows;
}

/** Phân tích đầu ra `ps -axo pid=,rss=,comm=` (macOS/Linux). */
export function parsePs(out: string): MachineProcess[] {
  const rows: MachineProcess[] = [];
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    rows.push({ pid: Number(m[1]), memMb: Math.round(Number(m[2]) / 1024), name: m[3].split("/").pop() ?? m[3] });
  }
  return rows;
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      resolve(err ? "" : String(stdout)),
    );
  });
}

async function topProcesses(limit: number): Promise<MachineProcess[]> {
  const rows =
    process.platform === "win32"
      ? parseTasklist(await run("tasklist", ["/FO", "CSV", "/NH"]))
      : parsePs(await run("ps", ["-axo", "pid=,rss=,comm="]));
  return rows.sort((a, b) => b.memMb - a.memMb).slice(0, limit);
}

export class MachineProbe {
  private last: CpuTimes = cpuTimes();
  private timer: NodeJS.Timeout | null = null;
  private latest: MachineSample | null = null;

  get current(): MachineSample | null {
    return this.latest;
  }

  async sample(): Promise<MachineSample> {
    const now = cpuTimes();
    const cpuPercent = cpuPercentBetween(this.last, now);
    this.last = now;
    const total = os.totalmem();
    const used = total - os.freemem();
    const s: MachineSample = {
      host: os.hostname(),
      platform: process.platform,
      cpuPercent,
      ramUsedMb: Math.round(used / 1048576),
      ramTotalMb: Math.round(total / 1048576),
      ramPercent: Math.round((used / total) * 100),
      uptimeSec: Math.round(os.uptime()),
      topProcesses: await topProcesses(5),
      at: new Date().toISOString(),
    };
    this.latest = s;
    return s;
  }

  start(intervalMs: number, onSample: (s: MachineSample) => void): void {
    if (this.timer) return;
    const tick = (): void => {
      this.sample().then(onSample).catch(() => undefined);
    };
    tick();
    this.timer = setInterval(tick, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
