/**
 * Client 3D — văn phòng với nhân vật AI, màn hình máy tính hiển thị nhật ký duyệt web,
 * Phòng Thư viện 3D, hộp thoại xin quyền trong cảnh, nút dừng khẩn cấp.
 */
import * as THREE from "three";

// ---------------- Types ----------------
interface AgentState {
  id: string;
  name: string;
  role: string;
  status: string;
  currentUrl?: string;
  currentTitle?: string;
  task?: string;
  position: { x: number; z: number };
  color: string;
  skills: number;
  learned: number;
}
interface BrowserLogEntry {
  id: number;
  ts: string;
  agentId: string;
  agentName: string;
  url: string;
  title: string;
  status: string;
  note?: string;
}
interface PermissionRequest {
  id: string;
  agentId: string;
  agentName: string;
  path: string;
  reason: string;
  purpose: string;
  createdAt: string;
  status: string;
}
interface Proposal {
  id: string;
  agentName: string;
  title: string;
  rationale: string;
  status: string;
  files: Array<{ path: string; content: string | null }>;
}

// ---------------- API ----------------
async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return (await res.json()) as T;
}

// ---------------- Toast ----------------
function toast(msg: string, kind: "info" | "warn" | "danger" = "info"): void {
  const host = document.getElementById("toast-host")!;
  const el = document.createElement("div");
  el.className = `toast ${kind === "info" ? "" : kind}`;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

// ---------------- Three.js scene ----------------
const canvas = document.getElementById("scene") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.Fog(0x0d1117, 18, 45);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 9, 15);
camera.lookAt(0, 1, 0);

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(6, 12, 8);
dir.castShadow = true;
scene.add(dir);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x161b22, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Bàn làm việc
function desk(x: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.12, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x30363d }),
  );
  top.position.y = 1.1;
  top.castShadow = true;
  g.add(top);
  for (const dx of [-1.3, 1.3]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 1.1, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x21262d }),
    );
    leg.position.set(dx, 0.55, 0);
    g.add(leg);
  }
  // Màn hình
  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.95, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0d1117, emissive: 0x101820 }),
  );
  screen.position.set(0, 1.7, -0.5);
  g.add(screen);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}

// Nhân vật
function makeAgent(color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 6, 12), mat);
  body.position.y = 0.95;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), mat);
  head.position.y = 1.85;
  head.castShadow = true;
  g.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const dx of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), eyeMat);
    eye.position.set(dx, 1.9, 0.26);
    g.add(eye);
  }
  return g;
}

// Phòng Thư viện 3D (góc phòng) — nơi hiển thị "nhìn lại" sau mỗi tác vụ
const library = new THREE.Group();
{
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x21262d });
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 0.6), shelfMat);
  shelf.position.set(0, 1.3, 0);
  library.add(shelf);
  const bookMat = new THREE.MeshStandardMaterial({ color: 0x4f9cf9 });
  for (let i = 0; i < 9; i++) {
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.3), bookMat);
    book.position.set(-2.4 + i * 0.6, 1.9, 0.34);
    library.add(book);
  }
  const label = makeSign("THƯ VIỆN TRI THỨC", 4.2, 0.5);
  label.position.set(0, 2.85, 0.2);
  library.add(label);
  library.position.set(-11, 0, -9);
  library.rotation.y = 0.5;
  scene.add(library);
}

function makeSign(text: string, w: number, h: number): THREE.Mesh {
  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 128;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#4f9cf9";
  ctx.font = "bold 44px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(cvs);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex }),
  );
  return mesh;
}

/** Màn hình máy tính: texture cập nhật với nội dung đang hiển thị (nhật ký duyệt web). */
class Screen {
  readonly mesh: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;

  constructor(x: number, z: number) {
    const cvs = document.createElement("canvas");
    cvs.width = 512;
    cvs.height = 320;
    this.ctx = cvs.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(cvs);
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 0.9),
      new THREE.MeshBasicMaterial({ map: this.tex }),
    );
    this.mesh.position.set(x, 1.7, z - 0.47);
    this.drawIdle();
  }

  private drawIdle(): void {
    const c = this.ctx;
    c.fillStyle = "#0d1117";
    c.fillRect(0, 0, 512, 320);
    c.fillStyle = "#30363d";
    c.font = "20px sans-serif";
    c.textAlign = "center";
    c.fillText("Màn hình đã tắt", 256, 160);
    this.tex.needsUpdate = true;
  }

  drawBrowserLog(agent: AgentState, entries: BrowserLogEntry[]): void {
    const c = this.ctx;
    c.fillStyle = "#0d1117";
    c.fillRect(0, 0, 512, 320);
    // Header
    c.fillStyle = "#161b22";
    c.fillRect(0, 0, 512, 42);
    c.fillStyle = "#4f9cf9";
    c.font = "bold 20px sans-serif";
    c.textAlign = "left";
    c.fillText(`${agent.name} — ${agent.role}`, 12, 28);
    c.fillStyle = agent.status === "idle" ? "#8b949e" : "#3fb950";
    c.fillText(agent.status.toUpperCase(), 400, 28);

    // Nội dung trang hiện tại
    c.fillStyle = "#e6edf3";
    c.font = "bold 16px sans-serif";
    const title = agent.currentTitle || agent.task || "Đang rảnh";
    c.fillText(this.ellipsis(title, 40), 12, 68);
    c.fillStyle = "#4f9cf9";
    c.font = "13px monospace";
    c.fillText(this.ellipsis(agent.currentUrl ?? "—", 60), 12, 90);

    // Nhật ký
    c.font = "12px monospace";
    let y = 120;
    const recent = entries.filter((e) => e.agentId === agent.id).slice(0, 8);
    if (recent.length === 0) {
      c.fillStyle = "#8b949e";
      c.fillText("Chưa có lịch sử duyệt web", 12, y);
    }
    for (const e of recent) {
      c.fillStyle =
        e.status === "ok" ? "#3fb950" : e.status === "blocked" ? "#f85149" : "#d29922";
      c.fillText(`• ${this.ellipsis(e.title || e.url, 44)}`, 12, y);
      y += 18;
      if (y > 300) break;
    }
    this.tex.needsUpdate = true;
  }

  private ellipsis(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
}

// ---------------- Scene state ----------------
const agents = new Map<string, { state: AgentState; mesh: THREE.Group; screen: Screen }>();
let browserLogs: BrowserLogEntry[] = [];

function setupAgents(list: AgentState[]): void {
  for (const a of list) {
    if (agents.has(a.id)) continue;
    desk(a.position.x, a.position.z);
    const mesh = makeAgent(a.color);
    mesh.position.set(a.position.x, 0, a.position.z + 1.1);
    scene.add(mesh);
    const screen = new Screen(a.position.x, a.position.z);
    scene.add(screen.mesh);
    agents.set(a.id, { state: a, mesh, screen });
  }
}

// ---------------- Camera orbit ----------------
let yaw = 0;
let pitch = 0.55;
let dist = 16;
let dragging = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * 0.005;
  pitch = Math.max(0.15, Math.min(1.4, pitch + (e.clientY - lastY) * 0.005));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener("wheel", (e) => {
  dist = Math.max(6, Math.min(34, dist + e.deltaY * 0.02));
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape") closePanel();
});

function animate(): void {
  requestAnimationFrame(animate);
  const t = performance.now() / 1000;
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * dist,
    Math.sin(pitch) * dist,
    Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(0, 1, 0);
  for (const { mesh, state } of agents.values()) {
    // Nhân vật ngồi máy tính → dao động nhẹ khi làm việc
    const bob = state.status === "idle" ? 0 : Math.sin(t * 2.5) * 0.04;
    mesh.position.y = bob;
    mesh.rotation.y = Math.sin(t * 0.6 + mesh.position.x) * 0.12;
  }
  renderer.render(scene, camera);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------- Panels ----------------
const panel = document.getElementById("panel")!;
const panelTitle = document.getElementById("panel-title")!;
const panelBody = document.getElementById("panel-body")!;

function closePanel(): void {
  panel.classList.add("hidden");
}

document.getElementById("panel-close")!.addEventListener("click", closePanel);
document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
  tab.addEventListener("click", () => openPanel(tab.dataset.panel!));
});

async function openPanel(name: string): Promise<void> {
  panel.classList.remove("hidden");
  if (name === "browser") {
    panelTitle.textContent = "Nhật ký duyệt web (sandbox)";
    const logs = await api<BrowserLogEntry[]>("/api/browser/logs");
    browserLogs = logs;
    panelBody.innerHTML = logs.length
      ? logs
          .map(
            (l) => `<div class="item">
        <h4>${esc(l.title || "(không tiêu đề)")}</h4>
        <div><a href="#" onclick="return false">${esc(l.url)}</a></div>
        <div class="meta"><span class="badge ${l.status === "ok" ? "ok" : l.status === "blocked" ? "danger" : "warn"}">${l.status}</span>
        ${esc(l.agentName)} · ${new Date(l.ts).toLocaleString("vi-VN")}
        ${l.note ? "<br>" + esc(l.note) : ""}</div>
      </div>`,
          )
          .join("")
      : "<p>Chưa có lượt duyệt web nào.</p>";
  } else if (name === "library") {
    panelTitle.textContent = "Phòng Thư viện — Tri thức & Nhìn lại";
    const [entries, retros] = await Promise.all([
      api<any[]>("/api/kb"),
      api<any[]>("/api/kb/retrospectives"),
    ]);
    const noteHtml = entries
      .map(
        (e) => `<div class="item">
      <h4>${esc(e.title)}</h4>
      <div class="meta"><span class="badge info">${e.kind}</span>${e.fromWeb ? "<span class='badge warn'>từ web</span>" : ""}
      độ tin cậy ${(e.confidence * 100).toFixed(0)}% · ${new Date(e.createdAt).toLocaleString("vi-VN")}</div>
      <div style="margin-top:6px;white-space:pre-wrap">${esc(String(e.body).slice(0, 400))}</div>
      ${e.sources?.length ? `<div class="meta">Nguồn: ${e.sources.map((s: string) => `<a href="#" onclick="return false">${esc(s)}</a>`).join(", ")}</div>` : ""}
    </div>`,
      )
      .join("");
    const retroHtml = retros
      .map(
        (r) => `<div class="item">
      <h4>Nhìn lại — ${esc(r.agentName)}</h4>
      <div>👍 <b>Tốt:</b> ${esc(r.didWell)}</div>
      <div>👎 <b>Sai:</b> ${esc(r.didWrong)}</div>
      <div>➡️ <b>Lần sau:</b> ${esc(r.nextTime)}</div>
      <div class="meta">${new Date(r.createdAt).toLocaleString("vi-VN")}</div>
    </div>`,
      )
      .join("");
    panelBody.innerHTML =
      "<h3>Ghi chú & Kỹ năng</h3>" + (noteHtml || "<p>Chưa có.</p>") + "<h3>Nhìn lại</h3>" + (retroHtml || "<p>Chưa có.</p>");
  } else if (name === "permissions") {
    panelTitle.textContent = "Quyền truy cập";
    await renderPermissions();
  } else if (name === "proposals") {
    panelTitle.textContent = "Đề xuất thay đổi (cần bạn duyệt)";
    const list = await api<Proposal[]>("/api/proposals");
    panelBody.innerHTML = list.length
      ? list
          .map(
            (p) => `<div class="item">
        <h4>${esc(p.title)}</h4>
        <div>${esc(p.rationale)}</div>
        <div class="meta"><span class="badge ${p.status === "applied" ? "ok" : p.status === "pending" ? "warn" : "danger"}">${p.status}</span>
        ${esc(p.agentName)} · ${new Date(p.createdAt).toLocaleString("vi-VN")}</div>
        <div class="meta">${p.files.map((f) => esc(f.path)).join(", ")}</div>
        ${
          p.status === "pending"
            ? `<div class="row">
                <button class="act" onclick="applyProposal('${p.id}')">Duyệt & áp dụng</button>
                <button class="act ghost" onclick="rejectProposal('${p.id}')">Từ chối</button>
              </div>`
            : ""
        }
        ${
          p.status === "applied"
            ? `<div class="row"><button class="act danger" onclick="revertProposal('${p.id}')">Hoàn tác</button></div>`
            : ""
        }
      </div>`,
          )
          .join("")
      : "<p>Chưa có đề xuất nào.</p>";
  } else if (name === "settings") {
    panelTitle.textContent = "Cài đặt";
    const cfg = await api<any>("/api/config");
    const policy = await api<any>("/api/browser/policy");
    panelBody.innerHTML = `
      <h3>Chính sách trình duyệt</h3>
      <label>Allowlist (mỗi dòng một domain, rỗng = cho phép tất cả ngoài blocklist)</label>
      <textarea id="allowlist" rows="3">${esc(policy.allowlist.join("\n"))}</textarea>
      <label>Blocklist</label>
      <textarea id="blocklist" rows="4">${esc(policy.blocklist.join("\n"))}</textarea>
      <label>Ngân sách token ngày: ${cfg.dailyTokenLimit}</label>
      <input id="dailyLimit" type="number" value="${cfg.dailyTokenLimit}" />
      <label>Phần trăm dành cho tự học: ${cfg.learning.learningPercent}%</label>
      <input id="learningPercent" type="number" value="${cfg.learning.learningPercent}" />
      <label>Chủ đề tự học (mỗi dòng một chủ đề)</label>
      <textarea id="topics" rows="3">${esc(cfg.learning.topics.join("\n"))}</textarea>
      <div class="row"><button class="act" onclick="saveSettings()">Lưu</button></div>
      <h3>Bật thủ công vùng bị chặn cứng</h3>
      <input id="manualPath" placeholder="Đường dẫn tuyệt đối (ví dụ C:\\Users\\...\\.ssh)" />
      <div class="row"><button class="act ghost" onclick="manualUnlock()">Mở thủ công</button></div>
    `;
  }
}

async function renderPermissions(): Promise<void> {
  const data = await api<any>("/api/permissions");
  const grants = data.state.grants
    .map(
      (g: any) => `<div class="item">
    <h4>${esc(g.path)}</h4>
    <div class="meta"><span class="badge ${g.mode === "readwrite" ? "warn" : "info"}">${g.mode}</span>
    agent: ${esc(g.agentId)} · ${new Date(g.grantedAt).toLocaleString("vi-VN")}</div>
    <div class="row"><button class="act danger" onclick="revokeGrant('${g.id}')">Thu hồi</button></div>
  </div>`,
    )
    .join("");
  const logs = data.logs
    .slice(0, 40)
    .map(
      (l: any) => `<div class="item">
    <div class="meta"><span class="badge ${l.allowed ? "ok" : "danger"}">${l.action}</span>
    ${esc(l.agentName)} · ${new Date(l.ts).toLocaleTimeString("vi-VN")}</div>
    <div style="word-break:break-all">${esc(l.path)}</div>
    ${l.detail ? `<div class="meta">${esc(l.detail)}</div>` : ""}
  </div>`,
    )
    .join("");
  panelBody.innerHTML =
    `<div class="row" style="margin-bottom:12px"><button class="act danger" onclick="revokeAll()">Thu hồi tất cả quyền</button></div>
     <h3>Quyền đang cấp</h3>${grants || "<p>Chưa có quyền nào.</p>"}
     <h3>Nhật ký truy cập</h3>${logs || "<p>Chưa có log.</p>"}`;
}

// ---------------- Permission dialog (in 3D scene) ----------------
const permDialog = document.getElementById("perm-dialog")!;

function showPermissionDialog(req: PermissionRequest): void {
  permDialog.classList.remove("hidden");
  permDialog.innerHTML = `
    <h3>🔐 Xin quyền truy cập</h3>
    <div><b>${esc(req.agentName)}</b> (${esc(req.agentId)}) cần <b>${esc(req.reason)}</b></div>
    <div class="path">${esc(req.path)}</div>
    <div>Mục đích: ${esc(req.purpose || "(không rõ)")}</div>
    <div class="perm-actions">
      <button class="act" onclick="decidePerm('${req.id}','once')">Cho phép một lần</button>
      <button class="act ghost" onclick="decidePerm('${req.id}','read')">Cho phép thư mục này, chỉ đọc</button>
      <button class="act ghost" onclick="decidePerm('${req.id}','readwrite')">Cho phép đọc và ghi</button>
      <button class="act danger" onclick="decidePerm('${req.id}','deny')">Từ chối</button>
    </div>`;
}

async function decidePerm(id: string, mode: string): Promise<void> {
  await api("/api/permissions/decide", { method: "POST", body: { requestId: id, mode } });
  permDialog.classList.add("hidden");
  toast("Đã xử lý yêu cầu quyền: " + mode);
}

// ---------------- Emergency stop ----------------
const emergencyBtn = document.getElementById("emergency")!;
emergencyBtn.addEventListener("click", async () => {
  const r = await api<{ emergencyStop: boolean }>("/api/emergency-stop", { method: "POST" });
  emergencyBtn.classList.toggle("armed", r.emergencyStop);
  toast(
    r.emergencyStop ? "ĐÃ DỪNG KHẨN CẤP — toàn bộ agent tạm dừng." : "Đã tiếp tục hoạt động.",
    r.emergencyStop ? "danger" : "info",
  );
});

// ---------------- Automation level ----------------
document.querySelectorAll<HTMLButtonElement>("#levels button").forEach((b) => {
  b.addEventListener("click", async () => {
    document.querySelectorAll("#levels button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    await api("/api/automation-level", { method: "POST", body: { level: b.dataset.level } });
    toast("Chế độ tự động: " + b.textContent);
  });
});

// ---------------- Budget widget ----------------
function renderBudget(b: any): void {
  const el = document.getElementById("budget-widget")!;
  const pct = Math.round((b.total.used / Math.max(1, b.total.limit)) * 100);
  const lpct = Math.round((b.learning.used / Math.max(1, b.learning.limit)) * 100);
  el.innerHTML = `Token hôm nay <b>${pct}%</b> (${b.total.used}/${b.total.limit}) · Tự học <b>${lpct}%</b> (${b.learning.used}/${b.learning.limit})`;
}

// ---------------- WebSocket ----------------
function connectWs(): void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = async (ev) => {
    const { event, data } = JSON.parse(ev.data);
    switch (event) {
      case "state": {
        const st = data as any;
        setupAgents(st.agents);
        setupAgents((await api<AgentState[]>("/api/agents")) ?? []);
        break;
      }
      case "agent:update": {
        const a = data as AgentState;
        const rec = agents.get(a.id);
        if (rec) rec.state = a;
        break;
      }
      case "browser:log": {
        browserLogs.unshift(data as BrowserLogEntry);
        break;
      }
      case "permission:request":
        showPermissionDialog(data as PermissionRequest);
        break;
      case "permission:decided":
        toast("Yêu cầu quyền đã được xử lý.", "info");
        break;
      case "injection":
        toast(
          `⚠ Phát hiện prompt injection tại ${(data as any).url} — đã bỏ qua, không làm theo.`,
          "danger",
        );
        break;
      case "budget":
        renderBudget(data);
        break;
      case "emergency":
        emergencyBtn.classList.toggle("armed", (data as any).emergencyStop);
        break;
      case "config": {
        const c = data as any;
        document.querySelectorAll<HTMLButtonElement>("#levels button").forEach((b) => {
          b.classList.toggle("active", b.dataset.level === c.automationLevel);
        });
        break;
      }
    }
  };
  ws.onclose = () => setTimeout(connectWs, 2000);
}

// ---------------- Global helpers (called from inline onclick) ----------------
const win = window as any;
win.decidePerm = decidePerm;
win.applyProposal = async (id: string) => {
  const r = await api<any>(`/api/proposals/${id}/apply`, { method: "POST" });
  toast(r.ok ? "Đã áp dụng đề xuất." : "Không áp dụng được: " + r.error, r.ok ? "info" : "danger");
  openPanel("proposals");
};
win.rejectProposal = async (id: string) => {
  await api(`/api/proposals/${id}/reject`, { method: "POST" });
  toast("Đã từ chối đề xuất.");
  openPanel("proposals");
};
win.revertProposal = async (id: string) => {
  const r = await api<any>(`/api/proposals/${id}/revert`, { method: "POST" });
  toast(r.ok ? "Đã hoàn tác." : "Không hoàn tác được: " + r.error, r.ok ? "info" : "danger");
  openPanel("proposals");
};
win.revokeGrant = async (grantId: string) => {
  await api("/api/permissions/revoke", { method: "POST", body: { grantId } });
  toast("Đã thu hồi quyền.");
  renderPermissions();
};
win.revokeAll = async () => {
  await api("/api/permissions/revoke-all", { method: "POST" });
  toast("Đã thu hồi toàn bộ quyền.");
  renderPermissions();
};
win.manualUnlock = async () => {
  const p = (document.getElementById("manualPath") as HTMLInputElement).value;
  const r = await api<any>("/api/permissions/manual-unlock", { method: "POST", body: { path: p } });
  toast(r.message, "warn");
};
win.saveSettings = async () => {
  const lines = (id: string) =>
    (document.getElementById(id) as HTMLTextAreaElement).value
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  await api("/api/browser/policy", {
    method: "PUT",
    body: { allowlist: lines("allowlist"), blocklist: lines("blocklist") },
  });
  await api("/api/budget", {
    method: "POST",
    body: {
      dailyLimit: Number((document.getElementById("dailyLimit") as HTMLInputElement).value),
      learningPercent: Number((document.getElementById("learningPercent") as HTMLInputElement).value),
    },
  });
  const cfg = await api<any>("/api/config");
  await api("/api/config", {
    method: "PUT",
    body: { learning: { ...cfg.learning, topics: lines("topics") } },
  });
  toast("Đã lưu cài đặt.");
};

function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

// ---------------- Boot ----------------
(async function boot(): Promise<void> {
  const state = await api<any>("/api/state");
  setupAgents(state.agents);
  renderBudget(state.budget);
  document.querySelectorAll<HTMLButtonElement>("#levels button").forEach((b) => {
    b.classList.toggle("active", b.dataset.level === state.config.automationLevel);
  });
  if (state.pendingRequests?.length) showPermissionDialog(state.pendingRequests[0]);
  connectWs();
  setInterval(async () => {
    const logs = await api<BrowserLogEntry[]>("/api/browser/logs");
    browserLogs = logs;
    for (const { state: a, screen } of agents.values()) {
      screen.drawBrowserLog(a, logs);
    }
  }, 2000);
})();
