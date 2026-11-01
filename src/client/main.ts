/**
 * Client 3D — văn phòng 9 phòng ban, nhân vật AI, màn hình hiển thị hoạt động,
 * hộp thoại xin quyền + xin duyệt ngay trong cảnh, thanh năng lượng token.
 */
import * as THREE from "three";

// ---------------- Types ----------------
type AgentStatus =
  | "idle"
  | "working"
  | "researching"
  | "learning"
  | "waiting"
  | "blocked"
  | "stopped";

interface AgentState {
  id: string;
  name: string;
  role: string;
  department: string;
  status: AgentStatus;
  currentUrl?: string;
  currentTitle?: string;
  task?: string;
  position: { x: number; z: number };
  color: string;
  skills: number;
  learned: number;
  tokensUsed: number;
  tasksDone: number;
}

interface Department {
  id: string;
  name: string;
  short: string;
  leadId: string;
  center: { x: number; z: number };
  size: { w: number; d: number };
  floor: number;
  props: string[];
  agents: AgentState[];
  spend?: { department: string; tokens: number; cents: number; calls: number };
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
  createdAt: string;
  files: Array<{ path: string; content: string | null }>;
}

interface BudgetSnapshot {
  total: { used: number; limit: number; resetAt: string };
  learning: { used: number; limit: number; resetAt: string };
  weekly: { used: number; limit: number };
  ratio: number;
  warned: boolean;
  locked: boolean;
  quota?: {
    available: boolean;
    planName?: string;
    autoPercentUsed?: number;
    apiPercentUsed?: number;
    totalPercentUsed?: number;
    cycleEnd?: string;
    includedLimitZero?: boolean;
    error?: string;
    readAt: string;
  };
}

interface LedgerEntry {
  id: number;
  ts: string;
  taskId: string;
  department: string;
  agentId: string;
  agentName: string;
  model: string;
  backend: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costCents: number;
  wallet: string;
  cursorPercentUsed?: number;
  quotaSource: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

interface TaskRecord {
  id: string;
  title: string;
  prompt: string;
  agentId: string;
  agentName: string;
  department: string;
  status: string;
  createdAt: string;
  estimation?: { estimatedTokens: number; difficulty: string; suggestedModel: string };
  result?: string;
  error?: string;
  model?: string;
  tokens?: number;
  costCents?: number;
  wallet: string;
  approvalReason?: string;
}

// ---------------- API ----------------
interface ApiOptions extends Omit<RequestInit, "body"> {
  /** JSON sẽ được stringify tự động. */
  body?: unknown;
}

async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { body, ...rest } = opts;
  const res = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...rest,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as T;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(Math.round(n));
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
scene.fog = new THREE.Fog(0x0d1117, 26, 62);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 220);
camera.position.set(0, 12, 18);

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 0.85);
dir.position.set(10, 18, 12);
dir.castShadow = true;
dir.shadow.mapSize.set(1024, 1024);
dir.shadow.camera.left = -34;
dir.shadow.camera.right = 34;
dir.shadow.camera.top = 34;
dir.shadow.camera.bottom = -34;
scene.add(dir);

// Sàn chung
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(90, 90),
  new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.95 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Vật liệu dùng chung (tái sử dụng để giảm draw call — Phase 5)
const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: 0x1d222b, roughness: 0.9 }),
  desk: new THREE.MeshStandardMaterial({ color: 0x30363d, roughness: 0.7 }),
  leg: new THREE.MeshStandardMaterial({ color: 0x21262d, roughness: 0.8 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x0d1117, emissive: 0x101820 }),
  prop: new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.8 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x4f9cf9, roughness: 0.5 }),
};

const GEO = {
  deskTop: new THREE.BoxGeometry(3, 0.12, 1.6),
  deskLeg: new THREE.BoxGeometry(0.12, 1.1, 0.12),
  monitor: new THREE.BoxGeometry(1.6, 0.95, 0.06),
  body: new THREE.CapsuleGeometry(0.32, 0.9, 6, 12),
  head: new THREE.SphereGeometry(0.28, 16, 12),
  eye: new THREE.SphereGeometry(0.045, 8, 6),
  ring: new THREE.RingGeometry(0.42, 0.56, 24),
};

const STATUS_COLOR: Record<AgentStatus, number> = {
  idle: 0x8b949e,
  working: 0x3fb950,
  researching: 0x4f9cf9,
  learning: 0x8f7bf0,
  waiting: 0xd29922,
  blocked: 0xf85149,
  stopped: 0x484f58,
};

function makeSign(text: string, w: number, h: number, color = "#4f9cf9"): THREE.Sprite {
  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 128;
  const ctx = cvs.getContext("2d")!;
  ctx.fillStyle = "rgba(13,17,23,0.86)";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 124);
  ctx.fillStyle = color;
  ctx.font = "bold 40px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(cvs);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  spr.scale.set(w, h, 1);
  return spr;
}

function deskAt(x: number, z: number, rotY = 0): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(GEO.deskTop, MAT.desk);
  top.position.y = 1.1;
  top.castShadow = true;
  g.add(top);
  for (const dx of [-1.3, 1.3]) {
    const leg = new THREE.Mesh(GEO.deskLeg, MAT.leg);
    leg.position.set(dx, 0.55, 0);
    g.add(leg);
  }
  const mon = new THREE.Mesh(GEO.monitor, MAT.screen);
  mon.position.set(0, 1.7, -0.5);
  g.add(mon);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  return g;
}

/** Trang trí đặc trưng cho từng phòng. */
function buildProps(dept: Department): void {
  const { center, props } = dept;
  for (const p of props) {
    const g = new THREE.Group();
    switch (p) {
      case "phone": {
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 0.9), MAT.prop);
        box.position.y = 0.7;
        g.add(box);
        break;
      }
      case "funnel": {
        for (let i = 0; i < 4; i++) {
          const c = new THREE.Mesh(
            new THREE.CylinderGeometry(1.4 - i * 0.28, 1.6 - i * 0.28, 0.35, 20, 1, true),
            new THREE.MeshStandardMaterial({ color: 0x3a332c, side: THREE.DoubleSide }),
          );
          c.position.set(0, 0.2 + i * 0.42, 0);
          g.add(c);
        }
        break;
      }
      case "content": {
        const board = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 0.12), MAT.accent);
        board.position.set(0, 2, -1);
        g.add(board);
        break;
      }
      case "chart": {
        for (let i = 0; i < 5; i++) {
          const b = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.6 + i * 0.35, 0.5),
            new THREE.MeshStandardMaterial({ color: i === 4 ? 0x43c59e : 0x2f3a44 }),
          );
          b.position.set(-1.2 + i * 0.62, (0.6 + i * 0.35) / 2, 0);
          g.add(b);
        }
        break;
      }
      case "router": {
        const hub = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), MAT.accent);
        hub.position.y = 1.4;
        g.add(hub);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const link = new THREE.Mesh(
            new THREE.BoxGeometry(1.6, 0.08, 0.08),
            new THREE.MeshStandardMaterial({ color: 0x8f7bf0 }),
          );
          link.position.set(Math.cos(a) * 0.8, 1.4, Math.sin(a) * 0.8);
          link.rotation.y = -a;
          g.add(link);
        }
        break;
      }
      case "terminal": {
        for (let i = 0; i < 3; i++) {
          const m = new THREE.Mesh(GEO.monitor, MAT.screen);
          m.position.set(-1.8 + i * 1.8, 1.8, 0);
          g.add(m);
          const stand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.2), MAT.leg);
          stand.position.set(-1.8 + i * 1.8, 0.9, 0);
          g.add(stand);
        }
        break;
      }
      case "books": {
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 0.6), MAT.prop);
        shelf.position.y = 1.3;
        g.add(shelf);
        const colors = [0x4f9cf9, 0x43c59e, 0xf7b32b, 0xef6f8e, 0x8f7bf0];
        for (let i = 0; i < 9; i++) {
          const book = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.62, 0.3),
            new THREE.MeshStandardMaterial({ color: colors[i % colors.length] }),
          );
          book.position.set(-2.4 + i * 0.6, 1.9, 0.34);
          g.add(book);
        }
        break;
      }
      case "roadmap": {
        const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 0.1), MAT.prop);
        board.position.set(0, 2.1, -2.2);
        g.add(board);
        break;
      }
      default:
        break;
    }
    g.position.set(center.x, 0, center.z - dept.size.d / 2 + 1.6);
    scene.add(g);
  }
}

function buildRoom(dept: Department): void {
  const { center, size } = dept;

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size.w, size.d),
    new THREE.MeshStandardMaterial({ color: dept.floor, roughness: 0.92 }),
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set(center.x, 0.01, center.z);
  floorMesh.receiveShadow = true;
  floorMesh.userData.department = dept.id;
  scene.add(floorMesh);

  // Tường 3 mặt (mở mặt trước để nhìn vào)
  const wallH = 2.4;
  const wallT = 0.16;
  const back = new THREE.Mesh(new THREE.BoxGeometry(size.w, wallH, wallT), MAT.wall);
  back.position.set(center.x, wallH / 2, center.z - size.d / 2);
  back.userData.department = dept.id;
  scene.add(back);

  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, size.d), MAT.wall);
    w.position.set(center.x + (side * size.w) / 2, wallH / 2, center.z);
    w.userData.department = dept.id;
    scene.add(w);
  }

  const sign = makeSign(dept.name.toUpperCase(), Math.min(size.w * 0.7, 6.5), 0.75);
  sign.position.set(center.x, wallH + 0.6, center.z - size.d / 2);
  scene.add(sign);

  buildProps(dept);
}

/** Nhân vật: thân + đầu + mắt + vòng trạng thái + nhãn tên. */
function makeAgent(color: string): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const body = new THREE.Mesh(GEO.body, mat);
  body.position.y = 0.95;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(GEO.head, mat);
  head.position.y = 1.85;
  head.castShadow = true;
  g.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const dx of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(GEO.eye, eyeMat);
    eye.position.set(dx, 1.9, 0.26);
    g.add(eye);
  }

  const ring = new THREE.Mesh(
    GEO.ring,
    new THREE.MeshBasicMaterial({ color: STATUS_COLOR.idle, transparent: true, opacity: 0.85 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  g.add(ring);

  const nameTag = makeSign("", 2.2, 0.4, "#e6edf3");
  nameTag.position.set(0, 2.5, 0);
  g.add(nameTag);

  g.userData.ring = ring;
  g.userData.tag = nameTag;
  return g;
}

/** Màn hình máy tính: texture cập nhật với hoạt động đang hiển thị. */
class Screen {
  readonly mesh: THREE.Mesh;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private lastKey = "";

  constructor(x: number, z: number) {
    const cvs = document.createElement("canvas");
    cvs.width = 512;
    cvs.height = 320;
    this.ctx = cvs.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(cvs);
    this.tex.minFilter = THREE.LinearFilter;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.55, 0.9),
      new THREE.MeshBasicMaterial({ map: this.tex }),
    );
    this.mesh.position.set(x, 1.7, z - 0.47);
    this.drawIdle();
  }

  drawIdle(): void {
    const c = this.ctx;
    c.fillStyle = "#0d1117";
    c.fillRect(0, 0, 512, 320);
    c.fillStyle = "#30363d";
    c.font = "20px sans-serif";
    c.textAlign = "center";
    c.fillText("Màn hình đã tắt", 256, 160);
    this.tex.needsUpdate = true;
  }

  /** Vẽ nội dung; chỉ redraw khi nội dung thay đổi (tiết kiệm GPU — Phase 5). */
  draw(agent: AgentState, entries: BrowserLogEntry[], task?: TaskRecord): void {
    const recent = entries.filter((e) => e.agentId === agent.id).slice(0, 7);
    const key = [
      agent.status,
      agent.currentTitle ?? "",
      agent.currentUrl ?? "",
      agent.task ?? "",
      recent.map((e) => e.title || e.url).join("|"),
      task?.status ?? "",
      task?.tokens ?? "",
    ].join("::");
    if (key === this.lastKey) return;
    this.lastKey = key;

    const c = this.ctx;
    c.fillStyle = "#0d1117";
    c.fillRect(0, 0, 512, 320);

    c.fillStyle = "#161b22";
    c.fillRect(0, 0, 512, 42);
    c.fillStyle = "#4f9cf9";
    c.font = "bold 20px sans-serif";
    c.textAlign = "left";
    c.fillText(`${agent.name} — ${agent.role}`, 12, 28);
    c.fillStyle = `#${STATUS_COLOR[agent.status].toString(16).padStart(6, "0")}`;
    c.textAlign = "right";
    c.fillText(agent.status.toUpperCase(), 500, 28);

    c.textAlign = "left";
    c.fillStyle = "#e6edf3";
    c.font = "bold 16px sans-serif";
    c.fillText(this.ell(agent.currentTitle || agent.task || "Đang rảnh", 40), 12, 68);

    c.fillStyle = "#4f9cf9";
    c.font = "13px monospace";
    c.fillText(this.ell(agent.currentUrl ?? "—", 60), 12, 90);

    let y = 120;
    if (task && task.status !== "done" && task.status !== "failed") {
      c.fillStyle = "#d29922";
      c.font = "13px monospace";
      c.fillText(`▸ ${this.ell(task.title, 44)}`, 12, y);
      y += 20;
      if (task.estimation) {
        c.fillStyle = "#8b949e";
        c.fillText(
          `  ước ~${fmt(task.estimation.estimatedTokens)} tok · ${task.estimation.difficulty}`,
          12,
          y,
        );
        y += 20;
      }
    }

    c.font = "12px monospace";
    for (const e of recent) {
      c.fillStyle = e.status === "ok" ? "#3fb950" : e.status === "blocked" ? "#f85149" : "#d29922";
      c.fillText(`• ${this.ell(e.title || e.url, 44)}`, 12, y);
      y += 18;
      if (y > 300) break;
    }
    if (recent.length === 0 && !task) {
      c.fillStyle = "#8b949e";
      c.fillText("Chưa có hoạt động nào", 12, y);
    }

    this.tex.needsUpdate = true;
  }

  private ell(s: string, n: number): string {
    return s.length > n ? s.slice(0, n - 1) + "…" : s;
  }
}

// ---------------- Scene state ----------------
interface AgentRecord {
  state: AgentState;
  mesh: THREE.Group;
  screen: Screen;
}
const agents = new Map<string, AgentRecord>();
const rooms = new Map<string, Department>();
let browserLogs: BrowserLogEntry[] = [];
let tasks: TaskRecord[] = [];
let pendingApproval: { id: string; taskId: string; title: string; agentName: string; reason: string; estimation?: { estimatedTokens: number } } | null =
  null;

function setupRooms(list: Department[]): void {
  for (const d of list) {
    if (rooms.has(d.id)) continue;
    rooms.set(d.id, d);
    buildRoom(d);
  }
  renderRoomNav();
}

/** Thanh điều hướng tới từng phòng ban. */
function renderRoomNav(): void {
  const nav = document.getElementById("room-nav");
  if (!nav) return;
  nav.innerHTML = [...rooms.values()]
    .map(
      (d) =>
        `<button class="room-btn" data-room="${esc(d.id)}" title="${esc(d.name)}">${esc(d.short)}</button>`,
    )
    .join("");
  nav.querySelectorAll<HTMLButtonElement>(".room-btn").forEach((b) => {
    b.addEventListener("click", () => {
      const d = rooms.get(b.dataset.room!);
      if (!d) return;
      target.set(d.center.x, 1, d.center.z);
      dist = Math.max(12, Math.min(24, d.size.w));
      void openPanel("department", d.id);
    });
  });
}

function setupAgents(list: AgentState[]): void {
  for (const a of list) {
    if (agents.has(a.id)) continue;
    deskAt(a.position.x, a.position.z - 1.1);
    const mesh = makeAgent(a.color);
    mesh.position.set(a.position.x, 0, a.position.z);
    scene.add(mesh);
    const screen = new Screen(a.position.x, a.position.z - 1.1);
    scene.add(screen.mesh);
    agents.set(a.id, { state: a, mesh, screen });
    updateAgentTag(a);
  }
}

function updateAgentTag(a: AgentState): void {
  const rec = agents.get(a.id);
  if (!rec) return;
  const tag = rec.mesh.userData.tag as THREE.Sprite;
  const label = a.name;
  if (tag.userData.label === label) return;
  tag.userData.label = label;
  // Vẽ lại sprite tên (texture nhỏ, cập nhật hiếm).
  const canvasEl = (tag.material as THREE.SpriteMaterial).map?.image as HTMLCanvasElement | undefined;
  if (!canvasEl) return;
  const ctx = canvasEl.getContext("2d")!;
  ctx.clearRect(0, 0, 512, 128);
  ctx.fillStyle = "rgba(13,17,23,0.86)";
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = "#e6edf3";
  ctx.font = "bold 44px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 256, 66);
  ((tag.material as THREE.SpriteMaterial).map as THREE.CanvasTexture).needsUpdate = true;
}

function applyStatus(a: AgentState): void {
  const rec = agents.get(a.id);
  if (!rec) return;
  rec.state = a;
  const ring = rec.mesh.userData.ring as THREE.Mesh;
  (ring.material as THREE.MeshBasicMaterial).color.setHex(STATUS_COLOR[a.status] ?? STATUS_COLOR.idle);
  updateAgentTag(a);
}

// ---------------- Camera orbit ----------------
let yaw = 0;
let pitch = 0.62;
let dist = 24;
let dragging = false;
let lastX = 0;
let lastY = 0;
let target = new THREE.Vector3(0, 1, 0);

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lastX) * 0.005;
  pitch = Math.max(0.18, Math.min(1.35, pitch + (e.clientY - lastY) * 0.005));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener("wheel", (e) => {
  dist = Math.max(8, Math.min(48, dist + e.deltaY * 0.03));
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closePanel();
    hideDialogs();
  }
});

// Click chọn phòng / nhân vật
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
canvas.addEventListener("click", (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  for (const h of hits) {
    let o: any = h.object;
    while (o) {
      if (o.userData?.department) {
        const dept = rooms.get(o.userData.department);
        if (dept) {
          target.set(dept.center.x, 1, dept.center.z);
          void openPanel("department", dept.id);
        }
        return;
      }
      o = o.parent;
    }
  }
});

function animate(): void {
  requestAnimationFrame(animate);
  const t = performance.now() / 1000;
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
    Math.sin(pitch) * dist,
    target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
  );
  camera.lookAt(target.x, 1, target.z);

  for (const { mesh, state } of agents.values()) {
    const bob = state.status === "idle" || state.status === "stopped" ? 0 : Math.sin(t * 2.5) * 0.05;
    mesh.position.y = bob;
    mesh.rotation.y = Math.sin(t * 0.6 + mesh.position.x) * 0.14;
    const ring = mesh.userData.ring as THREE.Mesh;
    const pulse = state.status === "waiting" || state.status === "blocked" ? 0.6 + Math.abs(Math.sin(t * 3)) * 0.4 : 0.85;
    (ring.material as THREE.MeshBasicMaterial).opacity = pulse;
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
  tab.addEventListener("click", () => void openPanel(tab.dataset.panel!));
});

async function openPanel(name: string, arg?: string): Promise<void> {
  panel.classList.remove("hidden");
  switch (name) {
    case "browser": {
      panelTitle.textContent = "Nhật ký duyệt web (sandbox)";
      const logs = await api<BrowserLogEntry[]>("/api/browser/logs");
      browserLogs = logs;
      panelBody.innerHTML = logs.length
        ? logs
            .map(
              (l) => `<div class="item">
        <h4>${esc(l.title || "(không tiêu đề)")}</h4>
        <div><a href="#" onclick="return false">${esc(l.url)}</a></div>
        <div class="meta"><span class="badge ${l.status === "ok" ? "ok" : l.status === "blocked" ? "danger" : "warn"}">${esc(l.status)}</span>
        ${esc(l.agentName)} · ${new Date(l.ts).toLocaleString("vi-VN")}
        ${l.note ? "<br>" + esc(l.note) : ""}</div>
      </div>`,
            )
            .join("")
        : "<p>Chưa có lượt duyệt web nào.</p>";
      break;
    }

    case "library": {
      panelTitle.textContent = "Phòng Thư viện — Tri thức & Nhìn lại";
      const [entries, retros] = await Promise.all([
        api<any[]>("/api/kb"),
        api<any[]>("/api/kb/retrospectives"),
      ]);
      const noteHtml = entries
        .map(
          (e) => `<div class="item">
      <h4>${esc(e.title)}</h4>
      <div class="meta"><span class="badge info">${esc(e.kind)}</span>${e.fromWeb ? "<span class='badge warn'>từ web</span>" : ""}
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
        "<h3>Ghi chú & Kỹ năng</h3>" +
        (noteHtml || "<p>Chưa có.</p>") +
        "<h3>Nhìn lại</h3>" +
        (retroHtml || "<p>Chưa có.</p>");
      break;
    }

    case "activity": {
      panelTitle.textContent = "Nhật ký hoạt động";
      const list = await api<any[]>("/api/activity?limit=150");
      panelBody.innerHTML = list.length
        ? list
            .map(
              (e) => `<div class="item">
        <div class="meta"><span class="badge ${
          e.level === "danger" ? "danger" : e.level === "warn" ? "warn" : "info"
        }">${esc(e.kind)}</span>
        ${esc(e.actor)} · ${new Date(e.ts).toLocaleTimeString("vi-VN")}</div>
        <div>${esc(e.message)}</div>
        ${e.detail ? `<div class="meta">${esc(e.detail)}</div>` : ""}
      </div>`,
            )
            .join("")
        : "<p>Chưa có hoạt động nào.</p>";
      break;
    }

    case "permissions":
      panelTitle.textContent = "Quyền truy cập";
      await renderPermissions();
      break;

    case "proposals": {
      panelTitle.textContent = "Đề xuất thay đổi (cần bạn duyệt)";
      const list = await api<Proposal[]>("/api/proposals");
      panelBody.innerHTML = list.length
        ? list
            .map(
              (p) => `<div class="item">
        <h4>${esc(p.title)}</h4>
        <div>${esc(p.rationale)}</div>
        <div class="meta"><span class="badge ${p.status === "applied" ? "ok" : p.status === "pending" ? "warn" : "danger"}">${esc(p.status)}</span>
        ${esc(p.agentName)} · ${new Date(p.createdAt ?? Date.now()).toLocaleString("vi-VN")}</div>
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
      break;
    }

    case "tasks": {
      panelTitle.textContent = "Tác vụ & nhật ký chi tiêu token";
      const [taskList, ledger] = await Promise.all([
        api<TaskRecord[]>("/api/tasks"),
        api<{ entries: LedgerEntry[]; totals: any }>("/api/budget/ledger?limit=60"),
      ]);
      tasks = taskList;

      const taskHtml = taskList.length
        ? taskList
            .map(
              (t) => `<div class="item">
        <h4>${esc(t.title)}</h4>
        <div class="meta"><span class="badge ${
          t.status === "done"
            ? "ok"
            : t.status === "failed" || t.status === "rejected"
              ? "danger"
              : t.status === "awaiting-approval"
                ? "warn"
                : "info"
        }">${esc(t.status)}</span>
        ${esc(t.agentName)} · ${esc(t.department)} · ${new Date(t.createdAt).toLocaleTimeString("vi-VN")}</div>
        ${
          t.estimation
            ? `<div class="meta">ước ~${fmt(t.estimation.estimatedTokens)} token · ${esc(t.estimation.difficulty)} · model ${esc(t.estimation.suggestedModel)}</div>`
            : ""
        }
        ${t.tokens ? `<div class="meta">thực tế ${fmt(t.tokens)} token · ${((t.costCents ?? 0) / 100).toFixed(4)} USD · ${esc(t.model ?? "")}</div>` : ""}
        ${t.error ? `<div style="color:#f85149">${esc(t.error)}</div>` : ""}
        ${t.result ? `<div style="white-space:pre-wrap;margin-top:6px">${esc(String(t.result).slice(0, 500))}</div>` : ""}
      </div>`,
            )
            .join("")
        : "<p>Chưa có tác vụ nào.</p>";

      const ledgerHtml = ledger.entries.length
        ? ledger.entries
            .map(
              (e) => `<div class="item">
        <div class="meta"><span class="badge ${e.ok ? "ok" : "danger"}">${esc(e.quotaSource)}</span>
        ${esc(e.agentName)} · ${esc(e.model)} · ${esc(e.wallet)} · ${new Date(e.ts).toLocaleTimeString("vi-VN")}</div>
        <div>in ${fmt(e.inputTokens)} · out ${fmt(e.outputTokens)} · cache ${fmt(e.cacheReadTokens)} = <b>${fmt(e.totalTokens)}</b> token</div>
        <div class="meta">${(e.costCents / 100).toFixed(4)} USD · ${e.durationMs}ms${e.cursorPercentUsed != null ? ` · Cursor ${e.cursorPercentUsed}%` : ""}</div>
      </div>`,
            )
            .join("")
        : "<p>Chưa có lượt chi tiêu nào.</p>";

      panelBody.innerHTML = `<h3>Tác vụ</h3>${taskHtml}<h3>Nhật ký chi tiêu token</h3>${ledgerHtml}`;
      break;
    }

    case "department": {
      const dept = rooms.get(arg ?? "");
      if (!dept) break;
      panelTitle.textContent = dept.name;
      const agentsHere = dept.agents ?? [];
      const spend = dept.spend ?? { tokens: 0, cents: 0, calls: 0 };
      panelBody.innerHTML = `
        <div class="item">
          <div class="meta">Chi tiêu hôm nay: <b>${fmt(spend.tokens)}</b> token · ${spend.calls} lượt · ${(spend.cents / 100).toFixed(4)} USD</div>
        </div>
        ${agentsHere
          .map(
            (a) => `<div class="item">
          <h4>${esc(a.name)} <span class="badge info">${esc(a.status)}</span></h4>
          <div>${esc(a.role)}</div>
          <div class="meta">${fmt(a.tokensUsed)} token · ${a.tasksDone} tác vụ · ${a.learned} bài học</div>
          ${a.task ? `<div>${esc(a.task)}</div>` : ""}
          <div class="row">
            <button class="act" onclick="assignTask('${a.id}','${esc(dept.id)}')">Giao việc</button>
          </div>
        </div>`,
          )
          .join("")}
        <h3>Giao việc cho phòng này</h3>
        <label>Yêu cầu</label>
        <textarea id="taskPrompt" rows="4" placeholder="Ví dụ: Tóm tắt 5 bài về xu hướng SEO 2026 và lưu vào Thư viện"></textarea>
        <div class="row">
          <button class="act" onclick="submitTask('${esc(dept.id)}')">Gửi</button>
          <button class="act ghost" onclick="openPanel('tasks')">Xem nhật ký chi tiêu</button>
        </div>`;
      break;
    }

    case "settings": {
      panelTitle.textContent = "Cài đặt";
      const [cfg, policy, llm, quota] = await Promise.all([
        api<any>("/api/config"),
        api<any>("/api/browser/policy"),
        api<any>("/api/llm/status"),
        api<any>("/api/quota"),
      ]);
      panelBody.innerHTML = `
      <h3>Backend LLM</h3>
      <div class="item">
        <div class="meta"><span class="badge ${llm.cursorCli ? "ok" : "danger"}">Cursor CLI ${llm.cursorCli ? "đã cài" : "chưa có"}</span>
        <span class="badge ${llm.cursorAuth.authenticated ? "ok" : "danger"}">${llm.cursorAuth.authenticated ? "đã đăng nhập" : "chưa đăng nhập"}</span>
        <span class="badge info">model ${esc(llm.model)}</span></div>
        <div class="meta">Nguồn token: ${esc(llm.cursorAuth.source)}${llm.cursorAuth.expiresAt ? " · hết hạn " + new Date(llm.cursorAuth.expiresAt).toLocaleString("vi-VN") : ""}</div>
        ${
          quota.available
            ? `<div class="meta">Gói: <b>${esc(quota.plan?.planName ?? "?")}</b> · đã dùng ${quota.totalPercentUsed ?? 0}% · chu kỳ tới ${quota.cycleEnd ? new Date(quota.cycleEnd).toLocaleDateString("vi-VN") : "?"}</div>`
            : `<div class="meta" style="color:#d29922">Không đọc được hạn mức: ${esc(quota.error ?? "không rõ")}</div>`
        }
        <div class="meta">Nâng cấp: ${esc(quota.plan?.upgradeTier ?? "?")} ${esc(quota.plan?.upgradePrice ?? "")}</div>
      </div>
      <h3>Chính sách trình duyệt</h3>
      <label>Allowlist (mỗi dòng một domain, rỗng = cho phép tất cả ngoài blocklist)</label>
      <textarea id="allowlist" rows="3">${esc(policy.allowlist.join("\n"))}</textarea>
      <label>Blocklist</label>
      <textarea id="blocklist" rows="4">${esc(policy.blocklist.join("\n"))}</textarea>
      <h3>Ngân sách token</h3>
      <label>Trần ngày: ${cfg.dailyTokenLimit}</label>
      <input id="dailyLimit" type="number" value="${cfg.dailyTokenLimit}" />
      <label>Trần tuần: ${cfg.weeklyTokenLimit}</label>
      <input id="weeklyLimit" type="number" value="${cfg.weeklyTokenLimit}" />
      <label>Trần mỗi tác vụ: ${cfg.perTaskTokenLimit}</label>
      <input id="perTaskLimit" type="number" value="${cfg.perTaskTokenLimit}" />
      <label>Phần trăm dành cho tự học: ${cfg.learning.learningPercent}%</label>
      <input id="learningPercent" type="number" value="${cfg.learning.learningPercent}" />
      <label>Chủ đề tự học (mỗi dòng một chủ đề)</label>
      <textarea id="topics" rows="3">${esc(cfg.learning.topics.join("\n"))}</textarea>
      <div class="row"><button class="act" onclick="saveSettings()">Lưu</button></div>
      <h3>Bật thủ công vùng bị chặn cứng</h3>
      <input id="manualPath" placeholder="Đường dẫn tuyệt đối (ví dụ C:\\Users\\...\\.ssh)" />
      <div class="row"><button class="act ghost" onclick="manualUnlock()">Mở thủ công</button></div>
    `;
      break;
    }
  }
}

async function renderPermissions(): Promise<void> {
  const data = await api<any>("/api/permissions");
  const grants = data.state.grants
    .map(
      (g: any) => `<div class="item">
    <h4>${esc(g.path)}</h4>
    <div class="meta"><span class="badge ${g.mode === "readwrite" ? "warn" : "info"}">${esc(g.mode)}</span>
    agent: ${esc(g.agentId)} · ${new Date(g.grantedAt).toLocaleString("vi-VN")}</div>
    <div class="row"><button class="act danger" onclick="revokeGrant('${g.id}')">Thu hồi</button></div>
  </div>`,
    )
    .join("");
  const logs = data.logs
    .slice(0, 40)
    .map(
      (l: any) => `<div class="item">
    <div class="meta"><span class="badge ${l.allowed ? "ok" : "danger"}">${esc(l.action)}</span>
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

// ---------------- Hộp thoại trong cảnh 3D ----------------
const permDialog = document.getElementById("perm-dialog")!;
const approvalDialog = document.getElementById("approval-dialog")!;

function hideDialogs(): void {
  permDialog.classList.add("hidden");
  approvalDialog.classList.add("hidden");
}

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

/** Hộp thoại xin duyệt tác vụ tốn nhiều token — hiện ngay trong cảnh 3D. */
function showApprovalDialog(req: NonNullable<typeof pendingApproval>): void {
  pendingApproval = req;
  approvalDialog.classList.remove("hidden");
  approvalDialog.innerHTML = `
    <h3>🧮 Cần bạn duyệt trước khi chạy</h3>
    <div><b>${esc(req.agentName)}</b> muốn chạy: <b>${esc(req.title)}</b></div>
    <div class="path">${esc(req.reason)}</div>
    ${
      req.estimation
        ? `<div>Ước lượng: <b>${fmt(req.estimation.estimatedTokens)}</b> token</div>`
        : ""
    }
    <div class="perm-actions">
      <button class="act" onclick="decideApproval('${req.taskId}','approve')">Cho chạy</button>
      <button class="act danger" onclick="decideApproval('${req.taskId}','reject')">Từ chối</button>
    </div>`;
}

async function decidePerm(id: string, mode: string): Promise<void> {
  await api("/api/permissions/decide", { method: "POST", body: { requestId: id, mode } });
  permDialog.classList.add("hidden");
  toast("Đã xử lý yêu cầu quyền: " + mode);
}

async function decideApproval(taskId: string, action: "approve" | "reject"): Promise<void> {
  await api(`/api/tasks/${taskId}/${action}`, { method: "POST" });
  approvalDialog.classList.add("hidden");
  pendingApproval = null;
  toast(action === "approve" ? "Đã duyệt, tác vụ đang chạy." : "Đã từ chối tác vụ.");
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

// ---------------- Thanh năng lượng token ----------------
function renderBudget(b: BudgetSnapshot): void {
  const el = document.getElementById("budget-widget")!;
  const pct = Math.round((b.total.used / Math.max(1, b.total.limit)) * 100);
  const lpct = Math.round((b.learning.used / Math.max(1, b.learning.limit)) * 100);
  const wpct = Math.round((b.weekly.used / Math.max(1, b.weekly.limit)) * 100);
  const q = b.quota;
  const quotaTxt = q?.available
    ? `Cursor ${q.planName ?? "?"}: ${q.totalPercentUsed ?? 0}%`
    : q?.error
      ? "Cursor: không đọc được hạn mức"
      : "";
  el.classList.toggle("warn", pct >= 80 && pct < 100);
  el.classList.toggle("danger", pct >= 100 || b.locked);
  el.innerHTML = `
    <div class="bar-row">
      <span>Hôm nay</span>
      <div class="bar"><i style="width:${Math.min(100, pct)}%"></i></div>
      <b>${pct}%</b>
      <span class="muted">${fmt(b.total.used)}/${fmt(b.total.limit)}</span>
    </div>
    <div class="bar-row">
      <span>Tuần</span>
      <div class="bar"><i style="width:${Math.min(100, wpct)}%"></i></div>
      <b>${wpct}%</b>
    </div>
    <div class="bar-row">
      <span>Tự học</span>
      <div class="bar learn"><i style="width:${Math.min(100, lpct)}%"></i></div>
      <b>${lpct}%</b>
    </div>
    ${quotaTxt ? `<div class="muted quota">${esc(quotaTxt)}${q?.cycleEnd ? " · reset " + new Date(q.cycleEnd).toLocaleDateString("vi-VN") : ""}</div>` : ""}`;
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
        setupRooms(st.departments ?? []);
        setupAgents(st.agents ?? []);
        break;
      }
      case "agent:update":
        applyStatus(data as AgentState);
        break;
      case "browser:log":
        browserLogs.unshift(data as BrowserLogEntry);
        break;
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
        renderBudget(data as BudgetSnapshot);
        break;
      case "quota":
        // snapshot hạn mức mới — HUD sẽ cập nhật ở lần budget kế tiếp.
        break;
      case "task:update": {
        const t = data as TaskRecord;
        const i = tasks.findIndex((x) => x.id === t.id);
        if (i >= 0) tasks[i] = t;
        else tasks.unshift(t);
        break;
      }
      case "task:approval":
        showApprovalDialog(data as any);
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

// ---------------- Global helpers (gọi từ inline onclick) ----------------
const win = window as any;

win.decidePerm = decidePerm;
win.decideApproval = decideApproval;

win.assignTask = async (agentId: string, department: string) => {
  await openPanel("department", department);
  const ta = document.getElementById("taskPrompt") as HTMLTextAreaElement | null;
  if (ta) ta.dataset.agentId = agentId;
  toast("Đã chọn nhân vật — viết yêu cầu rồi bấm Gửi.");
};

win.submitTask = async (department: string) => {
  const ta = document.getElementById("taskPrompt") as HTMLTextAreaElement | null;
  const prompt = ta?.value.trim() ?? "";
  if (!prompt) {
    toast("Hãy nhập yêu cầu trước.", "warn");
    return;
  }
  const agentId = ta?.dataset.agentId || (rooms.get(department)?.agents?.[0]?.id ?? "minh");
  const r = await api<TaskRecord>("/api/tasks", {
    method: "POST",
    body: { title: prompt.slice(0, 60), prompt, agentId, department },
  });
  toast(
    r.status === "awaiting-approval"
      ? "Tác vụ cần bạn duyệt (xem hộp thoại trong cảnh 3D)."
      : "Đã gửi tác vụ.",
    r.status === "awaiting-approval" ? "warn" : "info",
  );
  if (ta) ta.value = "";
  void openPanel("tasks");
};

win.applyProposal = async (id: string) => {
  const r = await api<any>(`/api/proposals/${id}/apply`, { method: "POST" });
  toast(r.ok ? "Đã áp dụng đề xuất." : "Không áp dụng được: " + r.error, r.ok ? "info" : "danger");
  void openPanel("proposals");
};
win.rejectProposal = async (id: string) => {
  await api(`/api/proposals/${id}/reject`, { method: "POST" });
  toast("Đã từ chối đề xuất.");
  void openPanel("proposals");
};
win.revertProposal = async (id: string) => {
  const r = await api<any>(`/api/proposals/${id}/revert`, { method: "POST" });
  toast(r.ok ? "Đã hoàn tác." : "Không hoàn tác được: " + r.error, r.ok ? "info" : "danger");
  void openPanel("proposals");
};
win.revokeGrant = async (grantId: string) => {
  await api("/api/permissions/revoke", { method: "POST", body: { grantId } });
  toast("Đã thu hồi quyền.");
  void renderPermissions();
};
win.revokeAll = async () => {
  await api("/api/permissions/revoke-all", { method: "POST" });
  toast("Đã thu hồi toàn bộ quyền.");
  void renderPermissions();
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
      weeklyLimit: Number((document.getElementById("weeklyLimit") as HTMLInputElement).value),
      perTaskLimit: Number((document.getElementById("perTaskLimit") as HTMLInputElement).value),
      learningPercent: Number((document.getElementById("learningPercent") as HTMLInputElement).value),
    },
  });
  const cfg = await api<any>("/api/config");
  await api("/api/config", {
    method: "PUT",
    body: { learning: { ...cfg.learning, topics: lines("topics") } },
  });
  toast("Đã lưu cài đặt.");
  void openPanel("settings");
};

// ---------------- Boot ----------------
(async function boot(): Promise<void> {
  const state = await api<any>("/api/state");
  setupRooms(state.departments ?? []);
  setupAgents(state.agents ?? []);
  tasks = state.tasks ?? [];
  renderBudget(state.budget);
  document.querySelectorAll<HTMLButtonElement>("#levels button").forEach((b) => {
    b.classList.toggle("active", b.dataset.level === state.config.automationLevel);
  });
  if (state.pendingRequests?.length) showPermissionDialog(state.pendingRequests[0]);
  if (state.approvals?.length) showApprovalDialog(state.approvals[0]);
  connectWs();

  // Vẽ màn hình: 2 giây/lần, chỉ khi có thay đổi.
  setInterval(async () => {
    try {
      const logs = await api<BrowserLogEntry[]>("/api/browser/logs");
      browserLogs = logs;
      const taskList = await api<TaskRecord[]>("/api/tasks");
      tasks = taskList;
      for (const { state: a, screen } of agents.values()) {
        const t = taskList.find((x) => x.agentId === a.id && x.status === "running");
        screen.draw(a, logs, t);
      }
    } catch {
      /* server đang khởi động lại */
    }
  }, 2000);
})();
