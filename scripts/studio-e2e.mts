// Chạy thật StudioService + runner thật (không giả): xem thử rồi dựng video không giọng trong workspace tạm.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ActionGate } from "../src/server/agent/gate.js";
import { AuditLog } from "../src/server/security/audit.js";
import { StudioService } from "../src/server/studio/service.js";
import { createRunner, findKitDir } from "../src/server/studio/runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const kit = findKitDir(path.join(here, "..", "src", "server"))!;
const ws = fs.mkdtempSync(path.join(os.tmpdir(), "studio-e2e-"));
const full = process.argv.includes("--full");
const s = new StudioService({ workspace: () => ws, kitDir: kit, gate: new ActionGate(), audit: new AuditLog(path.join(ws, "audit.log")), emergency: () => false, runner: createRunner(kit), onState: () => undefined });
console.log("kit:", kit, "tools:", await s.tools(true));
s.create("e2e");
const job = await s.start("e2e", { preview: !full });
const t0 = Date.now();
const tick = setInterval(() => console.log(`  ${s.job(job.id)!.status}/${s.job(job.id)!.step} ${(s.job(job.id)!.progress * 100).toFixed(0)}%`), 5000);
await s.idle();
clearInterval(tick);
console.log(JSON.stringify(s.job(job.id), null, 1), `${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log("ws:", ws);
