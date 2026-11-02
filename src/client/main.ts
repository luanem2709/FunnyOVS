/**
 * Client 3D — văn phòng 9 phòng ban, nhân vật AI, màn hình hiển thị hoạt động,
 * hộp thoại xin quyền + xin duyệt ngay trong cảnh, thanh năng lượng token.
 */
import * as THREE from "three";
import {
  loadManifest,
  findCharacter,
  type Manifest,
  type ManifestAsset,
} from "./assets/manifest.js";
import { preloadAssets, peekAsset } from "./assets/loader.js";
import { setupLighting, screenGlowColor, applyTimeOfDay, type TimeOfDay } from "./assets/lighting.js";
import { setupRenderPipeline } from "./assets/renderPipeline.js";
import {
  QualityController,
  QUALITY_LABELS,
  type QualityLevel,
} from "./assets/quality.js";
import { furnishRoom } from "./assets/props.js";
import { skylineRing, distantSkyline, skyDome, setSkyMode } from "./assets/windows.js";
import { CameraRig } from "./assets/cameraRig.js";
import { WallCuller } from "./assets/wallCulling.js";
import { FocusManager } from "./assets/focusMode.js";
import { floorTextureFor, woodFloorTexture } from "./assets/floorTextures.js";
import { AMENITIES, NavGrid, Walker, bindAmenities } from "./assets/agentNav.js";
import { chibiAnimFor } from "./assets/characterFactory.js";
import { setChibiAnim, type ChibiAnim } from "./assets/chibi.js";
import { signatureProp, updateProps, wallChart } from "./assets/officeProps.js";
import { buildFurniture, deskLayout, propLayout, DESK_TOP_Y } from "./assets/roomBuilder.js";
import {
  BillboardLabel,
  makeRoomLabel,
  type LabelStatus,
} from "./assets/labels.js";
import { SpeechBubble } from "./assets/speechBubble.js";
import {
  createAgentVisual,
  applyAgentStatus,
  updateAgentVisual,
  AGENT_TINTS,
  type AgentVisual,
} from "./assets/characterFactory.js";
import type { AgentStatus as RigStatus } from "./assets/characterRig.js";

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
// `?capture=1` bật preserveDrawingBuffer để script kiểm thử đọc được ảnh canvas.
const CAPTURE_MODE = new URLSearchParams(location.search).has("capture");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: CAPTURE_MODE,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 220);
camera.position.set(0, 12, 18);

// Ánh sáng: nền sáng + hemisphere + bóng mềm (xem assets/lighting.ts)
const lights = setupLighting(scene);
const sunLight = lights.sun;

// Hậu kỳ render: bloom + SSAO + ACES tone mapping + IBL.
const pipeline = setupRenderPipeline(scene, camera, renderer);

// Bộ điều tiết chất lượng: tự hạ/nâng mức theo FPS (mục tiêu 60 fps).
const quality = new QualityController({ targetFps: 60 });
quality.onChange((level, settings) => {
  pipeline.applyQuality(level, settings);
  applyQualityToScene(settings);
  updateQualityUi(level);
});

// Cắt tường: làm mờ các bức tường chắn tầm nhìn camera.
const wallCuller = new WallCuller();

/**
 * Rig camera: bay mượt tới phòng, WASD để di chuyển, nút Toàn cảnh.
 * `target` là Vector3 tâm nhìn (đồng bộ mỗi khung hình từ rig) vì WallCuller
 * cần một Vector3.
 */
const camRig = new CameraRig(camera);
const target = new THREE.Vector3(0, 1, 0);
camRig.attachKeyboard();

// Chế độ tập trung: mờ các phòng khác khi người dùng chọn một phòng.
const focusManager = new FocusManager();

/** Group của từng phòng (dùng để cập nhật đồ đạc động). */
const roomGroups = new Map<string, THREE.Group>();

/** Đèn trần của từng phòng — chỉ bật đèn của phòng đang xem. */
const roomLamps = new Map<string, THREE.PointLight>();

/** Nhãn billboard của từng phòng (ẩn khi camera xa). */
const roomLabels = new Map<string, BillboardLabel>();

/**
 * Biểu đồ tường phòng Tài chính (dữ liệu thật từ ledger).
 * `null` nếu phòng chưa được dựng.
 */
let financeChart: { update: (v: { label: string; value: number }[]) => void } | null = null;

/**
 * Áp dụng mức chất lượng lên phần còn lại của cảnh:
 *  - Đèn bàn/màn hình phát sáng (tốn đèn) → tắt ở mức Thấp.
 *  - Kích thước bản đồ bóng → theo mức.
 */
function applyQualityToScene(settings: {
  emissiveLights: boolean;
  shadowMapSize: number;
}): void {
  for (const rec of agents.values()) {
    rec.screen.glow.visible = settings.emissiveLights;
  }
  for (const lamp of roomLamps.values()) {
    lamp.castShadow = false;
  }
  sunLight.shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize);
  // Ép three.js dựng lại bản đồ bóng khi kích thước thay đổi.
  if (sunLight.shadow.map) {
    sunLight.shadow.map.dispose();
    (sunLight.shadow as any).map = null;
  }
}

/** Cập nhật nút bấm + số FPS trên HUD. */
function updateQualityUi(level: QualityLevel): void {
  document.querySelectorAll<HTMLButtonElement>("#quality-widget button").forEach((b) => {
    const q = b.dataset.q;
    const active = q === "auto" ? quality.status.auto : !quality.status.auto && q === level;
    b.classList.toggle("active", active);
  });
}

/**
 * Lưới điều hướng cho nhân viên đi lại.
 * Tường phòng được thêm vào khi dựng phòng (xem buildRoom).
 */
const navGrid = new NavGrid(-26, -26, 26, 26);

// Sàn chung — chỉ trải trong lòng vòng skyline (bán kính 26), không kéo dài
// vô hạn ra tới tầm ngắm: sàn trải xa sẽ bị fog hòa vào màu trời và làm cảnh
// trông trắng xóa.
const sharedFloorTex = woodFloorTexture(11);
sharedFloorTex.repeat.set(12, 12);
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(25.5, 64),
  new THREE.MeshStandardMaterial({
    color: 0xbfae94,
    map: sharedFloorTex,
    roughness: 0.9,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Vòng ngoại cảnh 360° — skyline thành phố bao quanh tầng văn phòng.
// Thay cho cửa sổ trên tường: giữ tầm nhìn luôn mở, có đường chân trời.
const skyline = skylineRing(26, 9);
skyline.position.set(3, 0, 0);
scene.add(skyline);

// Bầu trời: vòm gradient (shader) + 2 vòng skyline mờ ở xa → chiều sâu,
// không còn texture đốm tròn.
const skyDomeMesh = skyDome(120);
scene.add(skyDomeMesh);
const farCity = distantSkyline(26, 9, 21);
farCity.position.set(3, 0, 0);
scene.add(farCity);

// Hook cho script kiểm thử ảnh (không ảnh hưởng runtime).
(window as any).__threeInfo = {
  webgl2: renderer.capabilities.isWebGL2,
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  programs: renderer.info.programs?.length ?? 0,
  sceneChildren: scene.children.length,
};
(window as any).__captureFrame = (): { dataUrl: string; diag: unknown } => {
  pipeline.render(1 / 60);
  // Ảnh phải được chụp trước mọi thao tác đọc pixel: trên một số driver
  // (SwiftShader/ANGLE), `readPixels` xoá nội dung backbuffer, khiến
  // `toDataURL` trả về ảnh trắng.
  const dataUrl = canvas.toDataURL("image/png");
  // Đọc pixel thô từ một framebuffer phụ để không đụng backbuffer chính.
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const probe = gl.createFramebuffer();
  if (probe) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, probe);
    gl.readPixels(
      Math.floor(canvas.width / 2),
      Math.floor(canvas.height / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      px,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(probe);
  }
  return {
    dataUrl,
    diag: {
      contextLost: gl.isContextLost(),
      centerPixel: Array.from(px),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      sceneChildren: scene.children.length,
      camera: camera.position.toArray(),
      target: target.toArray(),
      background: (scene.background as THREE.Color | null)?.getHexString?.() ?? null,
      fog: scene.fog ? (scene.fog as THREE.Fog).color.getHexString() : null,
      agents: [...agents.values()].map((r) => {
        const box = new THREE.Box3().setFromObject(r.visual.root);
        const cbox = r.visual.chibi
          ? new THREE.Box3().setFromObject(r.visual.chibi.root)
          : null;
        let meshCount = 0;
        r.visual.chibi?.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshCount++;
        });
        return {
          id: r.state.id,
          name: r.state.name,
          animated: r.visual.animated,
          kind: r.visual.chibi ? "chibi" : r.visual.rig ? "glb" : "capsule",
          anim: r.visual.chibi?.anim ?? null,
          sit: r.visual.chibi?.sit ?? null,
          meshCount,
          bodyH: cbox
            ? [+cbox.min.y.toFixed(2), +cbox.max.y.toFixed(2)]
            : null,
          bodyW: cbox ? +(cbox.max.x - cbox.min.x).toFixed(2) : null,
        };
      }),
    },
  };
};

/** Đưa camera tới gần một agent (dùng cho kiểm thử ảnh). */
(window as any).__focusAgent = (id: string, camDist = 3.2): void => {
  const rec = agents.get(id);
  if (!rec) return;
  // Nhân vật quay mặt về +Z → camera đứng phía trước mặt.
  camRig.flyTo(
    {
      tx: rec.visual.root.position.x,
      tz: rec.visual.root.position.z,
      yaw: 0.4,
      pitch: 0.3,
      dist: camDist,
    },
    { duration: 0.4 },
  );
};

// Vật liệu dùng chung (tái sử dụng để giảm draw call — Phase 5)
// Bảng màu: tường kem, đồ gỗ ấm — hợp phong cách low-poly Kenney.
// Tường dùng tông hơi xám để không bị "cháy" dưới ánh sáng mạnh.
const MAT = {
  wall: new THREE.MeshStandardMaterial({ color: 0xd9d2c2, roughness: 0.94 }),
  desk: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.7 }),
  leg: new THREE.MeshStandardMaterial({ color: 0x5f4a33, roughness: 0.8 }),
  screen: new THREE.MeshStandardMaterial({ color: 0x1b2430, emissive: 0x2a3646 }),
  prop: new THREE.MeshStandardMaterial({ color: 0x6b7f8f, roughness: 0.8 }),
  accent: new THREE.MeshStandardMaterial({ color: 0x1f6feb, roughness: 0.5 }),
  /** Màu dùng cho vật thể dự phòng khi chưa có model Kenney. */
  propColor: 0xb0a08c,
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

/**
 * Trang trí đặc trưng cho từng phòng.
 * Dùng model Kenney thật (Furniture Kit) nếu manifest có, không thì hộp dự phòng.
 */
function buildProps(dept: Department): void {
  const { center, props } = dept;
  for (const p of props as string[]) {
    const placements = propLayout(p as never, dept.size.w, dept.size.d);
    if (!placements.length) continue;
    const group = new THREE.Group();
    group.position.set(center.x, 0, center.z);
    scene.add(group);
    buildFurniture(group, placements, manifest, MAT.propColor);
  }
}

function buildRoom(dept: Department): void {
  const { center, size } = dept;

  // Toàn bộ nội dung phòng nằm trong một group để chế độ tập trung
  // (focus mode) có thể mờ phòng này đi khi người dùng xem phòng khác.
  const room = new THREE.Group();
  room.position.set(center.x, 0, center.z);
  scene.add(room);

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size.w, size.d),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTextureFor(dept.floor, hashSeed(dept.id)),
      roughness: 0.88,
    }),
  );
  // Lặp texture theo kích thước phòng để hoa văn không bị méo.
  const ft = floorMesh.material as THREE.MeshStandardMaterial;
  if (ft.map) ft.map.repeat.set(size.w / 4, size.d / 4);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = 0.01;
  floorMesh.receiveShadow = true;
  floorMesh.userData.department = dept.id;
  room.add(floorMesh);

  // Tường 3 mặt (mở mặt trước để nhìn vào) — thấp để không che tầm nhìn,
  // dùng vòng skyline 360° phía sau làm nền.
  // Mỗi tường có vật liệu riêng để có thể mờ dần khi chắn tầm nhìn camera.
  const wallH = 1.35;
  const wallT = 0.16;
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(size.w, wallH, wallT),
    MAT.wall.clone(),
  );
  back.position.set(0, wallH / 2, -size.d / 2);
  back.userData.department = dept.id;
  room.add(back);
  wallCuller.add(back, back.material as THREE.MeshStandardMaterial);

  for (const side of [-1, 1]) {
    const w = new THREE.Mesh(
      new THREE.BoxGeometry(wallT, wallH, size.d),
      MAT.wall.clone(),
    );
    w.position.set((side * size.w) / 2, wallH / 2, 0);
    w.userData.department = dept.id;
    room.add(w);
    wallCuller.add(w, w.material as THREE.MeshStandardMaterial);
  }

  // Nhãn phòng — billboard rõ nét: nền tối, chữ trắng đậm, tự ẩn khi xa.
  const roomLabel = makeRoomLabel(dept.name.toUpperCase(), Math.min(size.w * 0.78, 7.5));
  roomLabel.sprite.position.set(0, wallH + 0.75, -size.d / 2);
  room.add(roomLabel.sprite);
  roomLabels.set(dept.id, roomLabel);

  // Đèn trần nhẹ cho phòng (phát sáng màn hình + đồ đạc).
  //
  // Về hiệu năng: mỗi PointLight làm tăng chi phí shader của mọi vật liệu
  // trong cảnh. Với 9 phòng × 2 đèn (trần + sàn) cộng 8 đèn nhân vật + 8 đèn
  // màn hình thì tổng cộng 38 đèn → shader nặng, khó chạy mượt. Vì vậy:
  //   - Đèn trần phòng chỉ dùng vật liệu phát sáng (không phải đèn thật).
  //   - Đèn sàn giữ làm đèn thật (chỉ 1/phòng) → giữ được cảm giác ấm.
  //   - Đèn nhân vật + đèn màn hình giữ lại (phân biệt trạng thái).
  const lamp = new THREE.PointLight(0xffe9c4, 0.5, Math.max(size.w, size.d) * 0.8, 2);
  lamp.position.set(0, wallH + 0.9, 0);
  room.add(lamp);
  // Chỉ phòng đang xem mới bật đèn trần → giảm số đèn hoạt động.
  roomLamps.set(dept.id, lamp);

  // Cây xanh + đèn sàn cho phòng (port từ repo tham khảo).
  furnishRoom(room, size.w, size.d, hashSeed(dept.id));

  // Đồ đạc đặc trưng theo chức năng phòng (tủ server, quầy cà phê, bảng trực ca).
  const signature = signatureProp(dept.id, size.w, size.d);
  if (signature) room.add(signature);

  // Phòng Tài chính: biểu đồ tường với dữ liệu chi tiêu THẬT từ ledger.
  if (dept.id === "finance") {
    const chart = wallChart([]);
    chart.group.position.set(0, 2.0, -size.d / 2 + 0.2);
    room.add(chart.group);
    financeChart = chart;
  }

  // Đồ đạc trong phòng.
  for (const p of dept.props as string[]) {
    const placements = propLayout(p as never, size.w, size.d);
    if (!placements.length) continue;
    buildFurniture(room, placements, manifest, MAT.propColor);
  }

  focusManager.register(dept.id, room);
  roomGroups.set(dept.id, room);

  // Ghi tường vào lưới điều hướng để nhân viên không đi xuyên tường.
  // Mỗi phòng có tường ở 3 mặt (trừ mặt trước +Z là cửa).
  navGrid.addBlocker(center.x - size.w / 2, center.z - size.d / 2, center.x + size.w / 2, center.z - size.d / 2 + 0.16);
  navGrid.addBlocker(center.x - size.w / 2, center.z - size.d / 2, center.x - size.w / 2 + 0.16, center.z + size.d / 2);
  navGrid.addBlocker(center.x + size.w / 2 - 0.16, center.z - size.d / 2, center.x + size.w / 2, center.z + size.d / 2);
}

/** Hạt ngẫu nhiên ổn định từ chuỗi (để cây/đồ trang trí khác nhau theo phòng). */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Nhân vật: dùng model Kenney Animated Characters nếu có (có rig + animation),
 * không thì fallback về capsule. Mỗi agent một màu riêng.
 */
function makeAgent(
  index: number,
  status: AgentStatus,
  name: string,
): { visual: AgentVisual; label: BillboardLabel } {
  const tint = AGENT_TINTS[index % AGENT_TINTS.length];
  const visual = createAgentVisual(characterAsset, tint, status, index, name);
  // Nhãn tên riêng (billboard rõ nét) — quản lý bởi `labels.ts`.
  const nameTag = new BillboardLabel({ width: 2.3, height: 0.58, hideBeyond: 13 });
  nameTag.setSize(2.3, 0.58);
  // Nhân vật chibi ngồi: đầu ở cao độ ~1.4 → nhãn đặt CAO HƠN đỉnh đầu một
  // chút để không che mặt (mũi tên bị nhãn đè).
  nameTag.sprite.position.set(0, visual.chibi ? 2.12 : visual.animated ? 2.6 : 2.7, 0);
  visual.root.add(nameTag.sprite);
  visual.tag = nameTag.sprite;
  return { visual, label: nameTag };
}

/**
 * Màn hình máy tính: texture cập nhật với hoạt động đang hiển thị.
 * Gắn đúng vị trí màn hình trên bàn (cao độ DESK_TOP_Y + 0.43).
 */
class Screen {
  readonly mesh: THREE.Mesh;
  /** Đèn nhỏ trước màn hình — màu theo trạng thái agent. */
  readonly glow: THREE.PointLight;
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
      new THREE.PlaneGeometry(0.68, 0.4),
      new THREE.MeshBasicMaterial({ map: this.tex }),
    );
    // Màn hình nằm trên bàn. Panel của monitor hướng -Z sau khi xoay PI → đặc
    // texture ngay trước panel (z nhỏ hơn) để không bị vỏ màn hình che.
    this.mesh.position.set(x, DESK_TOP_Y + 0.43, z - 0.03);
    this.mesh.rotation.y = Math.PI;

    // Ánh sáng hắt ra từ màn hình: giúp nhân vật và mặt bàn có chiều sâu,
    // đồng thời phân biệt được ai đang bận (màu theo trạng thái).
    this.glow = new THREE.PointLight(0x9aa6b2, 0.35, 2.4, 2);
    this.glow.position.set(x, DESK_TOP_Y + 0.42, z + 0.12);
    this.drawIdle();
  }

  /** Đổi màu đèn theo trạng thái agent. */
  setStatus(status: string): void {
    this.glow.color.setHex(screenGlowColor(status));
    // Agent đang làm việc → màn hình sáng mạnh hơn.
    this.glow.intensity = status === "idle" ? 0.22 : 0.6;
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
  visual: AgentVisual;
  /** Nhãn billboard (tên + trạng thái + tiến độ). */
  label: BillboardLabel;
  screen: Screen;
  /** Máy trạng thái đi lại (đi nghỉ rồi quay lại bàn). */
  walker: Walker;
  /** Bong bóng thoại ngắn khi báo kết quả. */
  bubble: SpeechBubble;
}
const agents = new Map<string, AgentRecord>();
const rooms = new Map<string, Department>();
/** Manifest asset (do scan-assets.ts sinh) — null nếu chưa tải Kenney. */
let manifest: Manifest | null = null;
/** Asset nhân vật có rig — null nếu chưa có. */
let characterAsset: ManifestAsset | null = null;
/** Bảng alias clip nếu tên animation trong file không khớp (xem docs/ASSETS.md). */
let clipAliases: Record<string, string> = {};
let browserLogs: BrowserLogEntry[] = [];
let tasks: TaskRecord[] = [];
/** Id nhân viên đang tự chạy việc (từ /api/dispatch) — hiện badge "đang tự làm việc". */
let busyAgents: string[] = [];
let pendingApproval: { id: string; taskId: string; title: string; agentName: string; reason: string; estimation?: { estimatedTokens: number } } | null =
  null;

function setupRooms(list: Department[]): void {
  for (const d of list) {
    const existing = rooms.get(d.id);
    if (existing) {
      // Phòng đã dựng → chỉ cập nhật số liệu chi tiêu (phòng 3D giữ nguyên).
      existing.spend = d.spend;
      existing.agents = d.agents;
      continue;
    }
    rooms.set(d.id, d);
    buildRoom(d);
  }
  // Đã biết hết tường → nướng lưới điều hướng và gắn toạ độ các chỗ nghỉ.
  navGrid.bake();
  bindAmenities(AMENITIES, [...rooms.values()]);
  renderRoomNav();
  updateFinanceChart(list);
}

/**
 * Cập nhật biểu đồ tường phòng Tài chính bằng số liệu THẬT từ ledger.
 *
 * Nguồn: `GET /api/departments` trả `spend.tokens` cho từng phòng (đọc từ
 * bảng `token_ledger`). Không dùng số giả.
 */
function updateFinanceChart(list: Department[]): void {
  if (!financeChart) return;
  const rows = list
    .filter((d) => (d.spend?.tokens ?? 0) > 0)
    .map((d) => ({ label: d.short || d.name, value: d.spend!.tokens }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  // Không có phòng nào chi tiêu → hiển thị 0 để trục vẫn đúng.
  financeChart.update(rows.length ? rows : [{ label: "Chưa có", value: 0 }]);
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
      // Bay mượt vào phòng: gần hơn và thấp hơn để nhân vật chiếm nhiều
      // diện tích khung hình thay vì sàn trống.
      camRig.focusRoom(d.center.x, d.center.z, d.size.w);
      focusManager.focus(d.id);
      void openPanel("department", d.id);
    });
  });
}

function setupAgents(list: AgentState[]): void {
  let index = 0;
  for (const a of list) {
    if (agents.has(a.id)) continue;
    const { visual, label } = makeAgent(index++, a.status, a.name);
    visual.root.position.set(a.position.x, 0, a.position.z);
    // Nhân vật ngồi tại bàn, quay mặt về phía bàn (+Z) → thấy mặt từ camera mặc định.
    if (visual.chibi) visual.chibi.sit = true;
    scene.add(visual.root);
    const screen = new Screen(a.position.x + 0.52, a.position.z + 0.72);
    scene.add(screen.mesh);
    scene.add(screen.glow);
    screen.setStatus(a.status);
    // Mỗi nhân viên có máy trạng thái đi lại riêng.
    const walker = new Walker({ x: a.position.x, z: a.position.z }, {
      // Lệch pha để 8 nhân viên không đi cùng lúc.
      workMin: 14 + index * 4,
      workMax: 46 + index * 7,
    });
    // Bong bóng thoại: hiện trên đầu khi agent báo kết quả.
    const bubble = new SpeechBubble();
    visual.root.add(bubble.sprite);
    bubble.sprite.position.set(0, 2.35, 0);
    agents.set(a.id, { state: a, visual, label, screen, walker, bubble });
    updateAgentTag(a);
  }
}

/**
 * Dựng bàn + ghế + màn hình cho mỗi nhân vật.
 * Bàn đặt phía trước nhân vật (hướng -Z), nhân vật quay mặt về bàn.
 */
const builtDeskRooms = new Set<string>();
function buildDesks(list: AgentState[]): void {
  for (const a of list) {
    const dept = rooms.get(a.department);
    if (!dept) continue;
    const key = `${dept.id}:${a.id}`;
    if (builtDeskRooms.has(key)) continue;
    builtDeskRooms.add(key);

    const layouts = deskLayout(1, dept.size.w)[0];
    const group = new THREE.Group();
    group.position.set(a.position.x, 0, a.position.z);
    scene.add(group);

    // Dùng chính vị trí agent làm gốc: bàn ở z = -0.95, ghế tại 0.
    const placements = [
      // Bàn ở phía trước (+Z): nhân vật ngồi quay mặt về bàn, tay gõ xuống mặt bàn.
      { ...layouts.desk, x: 0, z: 0.62 },
      // Ghế lùi về sau, lưng ghế ở -Z.
      { ...layouts.chair, x: 0, z: -0.12, rotY: 0 },
      // Màn hình đặt lệch sang bên phải để không che mặt nhân vật.
      { ...layouts.screen, x: 0.52, z: 0.72, rotY: Math.PI },
    ];
    buildFurniture(group, placements, manifest, MAT.propColor);

    // Chặn bàn + ghế trong lưới điều hướng để nhân viên không đi xuyên qua
    // khi ra vào bàn. Bàn ở z = +0.62, ghế ở z = -0.12 (tương đối tâm bàn).
    navGrid.addBlocker(
      a.position.x - 0.95,
      a.position.z + 0.62 - 0.5,
      a.position.x + 0.95,
      a.position.z + 0.62 + 0.5,
      0.05,
    );
  }
}

/**
 * Cập nhật nhãn 3D của nhân vật: tên + vai trò + biểu tượng trạng thái +
 * thanh tiến độ (dựa trên số tác vụ đã xong so với tổng đã giao).
 */
function updateAgentTag(a: AgentState): void {
  const rec = agents.get(a.id);
  if (!rec) return;
  const status = (a.status as LabelStatus) ?? "idle";
  // Tiến độ: nếu agent đang làm việc → 0.5 (đang xử lý), xong → 1.
  const progress =
    status === "working" || status === "researching" || status === "learning"
      ? 0.55
      : status === "waiting" || status === "blocked"
        ? 0.9
        : 1;
  const sub = a.role ? a.role : "";
  rec.label.update(a.name, sub, status, progress);
}

function applyStatus(a: AgentState): void {
  const rec = agents.get(a.id);
  if (!rec) return;
  const prev = rec.state;
  rec.state = a;
  applyAgentStatus(
    rec.visual,
    a.status as RigStatus,
    STATUS_COLOR[a.status] ?? STATUS_COLOR.idle,
    clipAliases,
  );
  // Đèn màn hình đổi màu theo trạng thái → phân biệt ai đang hoạt động.
  rec.screen.setStatus(a.status);
  // Nhân viên nhận việc mới (chuyển sang "working"/"researching") → bỏ chỗ
  // đang đi nghỉ và quay về bàn (vẫn đi bộ về, không dịch chuyển tức thì).
  if (
    prev.status !== a.status &&
    (a.status === "working" || a.status === "researching" || a.status === "learning")
  ) {
    const p = rec.visual.root.position;
    rec.walker.recall(p, navGrid);
  }
  updateAgentTag(a);
}

/** Hook kiểm thử: đổi trạng thái agent ngay trong scene. */
(window as any).__agents = agents;
// Hook kiểm thử: ép nhân viên đi ngay (để chụp ảnh kiểm tra đường đi).
(window as any).__forceWalk = (): void => {
  for (const rec of agents.values()) rec.walker.timer = 0;
};
// Hook kiểm thử: vị trí + phase hiện tại của nhân viên.
(window as any).__walkerInfo = (): unknown[] =>
  [...agents.values()].map((r) => ({
    id: r.state.id,
    phase: r.walker.phase,
    x: +r.visual.root.position.x.toFixed(2),
    z: +r.visual.root.position.z.toFixed(2),
    target: r.walker.target?.kind ?? null,
    pathLen: r.walker.path.length,
  }));
// Hook kiểm thử: thử tính đường từ bàn của nhân viên tới từng chỗ nghỉ.
(window as any).__navDebug = (): unknown[] => {
  const out: unknown[] = [];
  for (const rec of agents.values()) {
    const results = AMENITIES.map((am) => {
      const path = navGrid.findPath(rec.walker.home, { x: am.x, z: am.z });
      return { kind: am.kind, room: am.room, ok: !!path, len: path?.length ?? 0 };
    });
    out.push({ id: rec.state.id, home: rec.walker.home, results });
  }
  return out;
};
(window as any).__applyStatus = applyStatus;
(window as any).__scene = scene;
(window as any).__camera = camera;
/** Đặt camera thủ công (dùng cho ảnh toàn cảnh): targetX, targetZ, dist, pitch, yaw. */
(window as any).__setCamera = (
  tx: number,
  tz: number,
  d: number,
  p: number,
  yw: number,
): void => {
  camRig.set({ tx, tz, dist: d, pitch: p, yaw: yw });
  // Bỏ tập trung phòng để thấy toàn cảnh (và bật lại đèn phòng).
  focusManager.focus(null);
};
(window as any).__pipeline = pipeline;
(window as any).__renderer = renderer;
(window as any).__rooms = rooms;
(window as any).__roomGroups = roomGroups;
(window as any).__focusManager = focusManager;
(window as any).__THREE = THREE;
(window as any).__camRig = camRig;
(window as any).__lights = lights;

/** Hook kiểm thử: vật thể nào nằm ở giữa khung hình. */
(window as any).__pickCenter = (): string[] => {
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(0, 0), camera);
  return rc
    .intersectObjects(scene.children, true)
    .slice(0, 8)
    .map((h) => {
      const names: string[] = [];
      h.object.traverseAncestors((o) => {
        if (o.name) names.push(o.name);
      });
      const mesh = h.object as THREE.Mesh;
      const mat = mesh.material;
      const matType = Array.isArray(mat) ? (mat[0]?.type ?? "-") : (mat?.type ?? "-");
      const wp = new THREE.Vector3();
      h.object.getWorldPosition(wp);
      const geo = mesh.geometry as THREE.BufferGeometry;
      const params = (geo as any).parameters
        ? JSON.stringify((geo as any).parameters).slice(0, 90)
        : geo.type;
      const col =
        !Array.isArray(mat) && mat && (mat as THREE.MeshStandardMaterial).color
          ? "#" + (mat as THREE.MeshStandardMaterial).color.getHexString()
          : "-";
      return `${mesh.type}[${matType}] d=${h.distance.toFixed(2)} col=${col} wp=(${wp.x.toFixed(1)},${wp.y.toFixed(1)},${wp.z.toFixed(1)}) ${params} ${names.join("<")}`;
    });
};

// ---------------- Camera orbit ----------------
let dragging = false;
let lastX = 0;
let lastY = 0;

/** Vị trí thế giới của các nhân vật (dùng để cắt tường chính xác hơn). */
function agentPositions(): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const { visual } of agents.values()) {
    const p = visual.root.position;
    // Chỉ lấy nhân vật trong cùng phòng đang xem, để tường mờ đúng chỗ.
    if (Math.abs(p.x - target.x) < 12 && Math.abs(p.z - target.z) < 12) {
      out.push(new THREE.Vector3(p.x, 1, p.z));
    }
  }
  return out;
}

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  camRig.beginUserControl();
});
addEventListener("pointerup", () => (dragging = false));
addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const s = camRig.state;
  s.yaw -= (e.clientX - lastX) * 0.005;
  s.pitch = Math.max(0.18, Math.min(1.35, s.pitch + (e.clientY - lastY) * 0.005));
  lastX = e.clientX;
  lastY = e.clientY;
});
canvas.addEventListener("wheel", (e) => {
  camRig.beginUserControl();
  const s = camRig.state;
  s.dist = Math.max(8, Math.min(48, s.dist + e.deltaY * 0.03));
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
          // Bay mượt tới phòng thay vì giật tức thời.
          camRig.focusRoom(dept.center.x, dept.center.z, dept.size.w);
          focusManager.focus(dept.id);
          void openPanel("department", dept.id);
        }
        return;
      }
      o = o.parent;
    }
  }
});

/**
 * Cập nhật đi lại cho tất cả nhân viên.
 *
 * Nhân viên đang làm việc thì ngồi tại bàn. Sau một khoảng ngẫu nhiên, họ đứng
 * dậy, đi tới một chỗ nghỉ (quầy cà phê, bảng trực ca, máy in, bình nước),
 * đứng lại ở đó một lúc rồi quay lại bàn. Animation đi kèm: `walk` khi đi,
 * `coffee`/`board`/`read` khi làm việc ở chỗ đến.
 */
function updateWalkers(): void {
  for (const rec of agents.values()) {
    const { walker, visual } = rec;
    const p = visual.root.position;
    // Truyền thẳng vector vị trí để `step()` cập nhật được toạ độ thật
    // (truyền object copy sẽ khiến nhân viên đứng yên tại chỗ).
    const { changed, facing } = walker.update(p, navGrid, AMENITIES);

    // Đang đi → xoay nhân vật theo hướng đi và dùng pose `walk`.
    if (facing !== null) {
      // Nhân vật mặt về +Z ở tư thế ngồi; khi đi cần xoay về hướng đi.
      visual.root.rotation.y = facing;
    }

    const walking = walker.phase === "walking" || walker.phase === "returning";
    if (visual.chibi) {
      // Ngồi khi đang làm việc; ĐỨNG lên khi chờ duyệt / bị chặn (cần người
      // dùng để ý thấy mình).
      const status = rec.state.status as AgentStatus;
      const mustStand = status === "waiting" || status === "blocked";
      visual.chibi.sit =
        !walking &&
        walker.phase !== "leaving" &&
        walker.phase !== "acting" &&
        !mustStand;
      if (walking) {
        setChibiAnim(visual.chibi, "walk");
      } else if (changed && walker.phase === "acting") {
        setChibiAnim(visual.chibi, errandAnim(walker.target?.kind));
      } else if (changed && walker.phase === "work") {
        // Quay lại bàn → trở về pose theo trạng thái công việc.
        setChibiAnim(visual.chibi, chibiAnimFor(status));
      }
    }

    // Khi ngồi lại bàn, phải đúng chỗ (đường về có thể lệch vài cm).
    if (walker.phase === "work") {
      p.x += (walker.home.x - p.x) * 0.25;
      p.z += (walker.home.z - p.z) * 0.25;
    }
  }
}

/** Animation phù hợp với loại việc nhân viên đi làm. */
function errandAnim(kind: string | undefined): ChibiAnim {
  switch (kind) {
    case "coffee":
      return "coffee" as ChibiAnim;
    case "board":
      return "board" as ChibiAnim;
    default:
      return "read";
  }
}

/** Mốc thời gian khung hình trước (để tính FPS). */
let lastFrameAt = 0;

function animate(): void {
  requestAnimationFrame(animate);
  const t = performance.now() / 1000;
  // dt thật để bộ điều tiết chất lượng đo FPS chính xác.
  const now = performance.now();
  const dt = lastFrameAt > 0 ? (now - lastFrameAt) / 1000 : 1 / 60;
  lastFrameAt = now;
  quality.sample(dt);
  // Camera: bay mượt / WASD / đặt vị trí — rig tự tính toạ độ camera.
  camRig.update(dt);
  target.set(camRig.state.tx, 1, camRig.state.tz);

  // Mờ các tường chắn giữa camera và phòng đang xem.
  wallCuller.update(camera, target, agentPositions());
  focusManager.update(1 / 60);

  // Chỉ phòng đang xem bật đèn trần → giảm số đèn hoạt động (shader rẻ hơn).
  // Ở chế độ toàn cảnh (focus = null) tắt hết đèn phòng, ánh sáng mặt trời
  // + hemisphere đủ để nhìn rõ.
  const focused = focusManager.current;
  for (const [id, lamp] of roomLamps) {
    lamp.visible = focused === id;
  }

  for (const rec of agents.values()) {
    const { visual, state } = rec;
    updateAgentVisual(visual, 1 / 60);
    // Bong bóng thoại: tự tắt sau vài giây.
    rec.bubble.update(1 / 60);
    // Nhãn 3D: ẩn khi camera xa + thu nhỏ dần (không đè lên nhau).
    rec.label.updateVisibility(camera);
    const ring = visual.ring;
    const pulse =
      state.status === "waiting" || state.status === "blocked"
        ? 0.6 + Math.abs(Math.sin(t * 3)) * 0.4
        : 0.85;
    (ring.material as THREE.MeshBasicMaterial).opacity = pulse;
  }

  // Nhân viên đi lại: làm việc ở bàn → đi nghỉ → quay lại bàn.
  updateWalkers();

  // Quạt tủ server quay, đồ đạc động.
  for (const room of roomGroups.values()) updateProps(room, t);

  // Nhãn phòng: ẩn/thu nhỏ theo khoảng cách camera.
  for (const label of roomLabels.values()) label.updateVisibility(camera);

  pipeline.render(1 / 60);
}
animate();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  // Composer phải cùng kích thước với renderer, nếu không bloom sẽ bị méo
  // và ảnh bị cắt khi đổi kích thước cửa sổ.
  pipeline.composer?.setPixelRatio(renderer.getPixelRatio());
  pipeline.composer?.setSize(innerWidth, innerHeight);
});

// ---------------- Panels ----------------
const panel = document.getElementById("panel")!;
const panelTitle = document.getElementById("panel-title")!;
const panelBody = document.getElementById("panel-body")!;
/** Panel đang mở (loại + tham số) — để làm mới được khi số liệu thay đổi. */
let panelKind = "";
let panelArg: string | undefined;

function closePanel(): void {
  panel.classList.add("hidden");
  panelKind = "";
  panelArg = undefined;
}

document.getElementById("panel-close")!.addEventListener("click", closePanel);
document.querySelectorAll<HTMLButtonElement>(".tab").forEach((tab) => {
  tab.addEventListener("click", () => void openPanel(tab.dataset.panel!));
});

async function openPanel(name: string, arg?: string): Promise<void> {
  panel.classList.remove("hidden");
  panelKind = name;
  panelArg = arg;
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
      const busy = new Set(busyAgents);
      panelBody.innerHTML = `
        <div class="item">
          <div class="meta">Chi tiêu hôm nay: <b>${fmt(spend.tokens)}</b> token · ${spend.calls} lượt · ${(spend.cents / 100).toFixed(4)} USD</div>
        </div>
        ${agentsHere
          .map(
            (a) => `<div class="item">
          <h4>${esc(a.name)} <span class="badge ${a.status === "idle" ? "info" : "ok"}">${esc(a.status)}</span>${busy.has(a.id) ? '<span class="badge warn">đang tự làm việc</span>' : ""}</h4>
          <div>${esc(a.role)}</div>
          <div class="meta">${fmt(a.tokensUsed)} token · ${a.tasksDone} tác vụ · ${a.learned} bài học</div>
          ${a.task ? `<div>${esc(a.task)}</div>` : ""}
          <div class="row">
            <button class="act" onclick="assignTask('${a.id}','${esc(dept.id)}')">Giao việc</button>
            <button class="act ghost" onclick="runAutoWork('${a.id}')">Chạy tự động</button>
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

// ---------------- Chất lượng đồ hoạ ----------------
document.querySelectorAll<HTMLButtonElement>("#quality-widget button").forEach((b) => {
  b.addEventListener("click", () => {
    const q = b.dataset.q;
    if (q === "auto") {
      quality.setAuto(true);
      updateQualityUi(quality.current);
      toast("Chất lượng: tự động theo FPS (mục tiêu 60).");
      return;
    }
    quality.setManual(q as QualityLevel);
    updateQualityUi(q as QualityLevel);
    toast("Chất lượng: " + (QUALITY_LABELS[q as QualityLevel] ?? q) + " (tắt tự động).");
  });
});
updateQualityUi(quality.current);

// ---------------- Góc nhìn: Toàn cảnh + Ngày/Đêm ----------------
document.getElementById("btn-overview")?.addEventListener("click", () => {
  camRig.overview();
  focusManager.focus(null);
  toast("Góc nhìn toàn cảnh văn phòng.");
});

/** Chế độ thời gian hiện tại (ban ngày). */
let timeOfDay: TimeOfDay = "day";
document.getElementById("btn-daynight")?.addEventListener("click", () => {
  timeOfDay = timeOfDay === "day" ? "night" : "day";
  applyTimeOfDay(lights, timeOfDay, roomLamps.values(), scene);
  setSkyMode(skyDomeMesh, timeOfDay);
  const btn = document.getElementById("btn-daynight")!;
  btn.textContent = timeOfDay === "day" ? "🌙 Đêm" : "☀️ Ngày";
  btn.classList.toggle("active", timeOfDay === "night");
  // Đèn màn hình sáng hơn về đêm → màn hình nổi bật trong phòng tối.
  for (const rec of agents.values()) {
    rec.screen.glow.intensity =
      timeOfDay === "night"
        ? rec.state.status === "idle"
          ? 0.5
          : 1.1
        : rec.state.status === "idle"
          ? 0.22
          : 0.6;
  }
  toast(timeOfDay === "night" ? "Chế độ ban đêm." : "Chế độ ban ngày.");
});

// ---------------- Thanh năng lượng token ----------------
/** Thông tin bộ phân công tự động (cập nhật mỗi 3s từ /api/dispatch). */
let dispatchStats: { dispatched: number; busy: string[]; intervalMs: number; remainingTokens: number } = {
  dispatched: 0,
  busy: [],
  intervalMs: 15_000,
  remainingTokens: 0,
};
/** Snapshot ngân sách cuối cùng để vẽ lại khi có thay đổi dispatch. */
let lastBudget: BudgetSnapshot | null = null;

function renderBudget(b: BudgetSnapshot): void {
  lastBudget = b;
  const el = document.getElementById("budget-widget")!;
  // Ví học là một PHẦN của trần ngày (xem TokenBudget.#isLearningLocked:
  // tổng ví chính + ví học phải ≤ trần ngày). Vì vậy thanh "Hôm nay" phải
  // hiện TỔNG (công việc + tự học) để khớp với tổng trong nhật ký chi tiêu.
  const dayUsed = b.total.used + b.learning.used;
  const dayLimit = b.total.limit;
  const pct = Math.round((dayUsed / Math.max(1, dayLimit)) * 100);
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
      <span class="muted">${fmt(dayUsed)}/${fmt(dayLimit)}</span>
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
      <span class="muted">${fmt(b.learning.used)}/${fmt(b.learning.limit)}</span>
    </div>
    <div class="muted quota">Công việc ${fmt(b.total.used)} · Tự học ${fmt(b.learning.used)} (tự học nằm trong trần ngày)</div>
    ${quotaTxt ? `<div class="muted quota">${esc(quotaTxt)}${q?.cycleEnd ? " · reset " + new Date(q.cycleEnd).toLocaleDateString("vi-VN") : ""}</div>` : ""}
    <div class="muted auto-line" id="auto-line">${autoLineHtml()}</div>`;
}

/** Dòng trạng thái tự động: số việc đã giao, ai đang bận, nhịp giao tiếp theo. */
function autoLineHtml(): string {
  const busy = dispatchStats.busy.length;
  const every = Math.round(dispatchStats.intervalMs / 1000);
  return `Tự động: ${dispatchStats.dispatched} việc · ${busy} người đang làm · giao mỗi ${every}s · còn ${fmt(dispatchStats.remainingTokens)} token`;
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
        buildDesks(st.agents ?? []);
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

/** Yêu cầu nhân viên tự nhận việc ngay (không cần viết prompt). */
win.runAutoWork = async (agentId: string) => {
  try {
    await api("/api/dispatch/run", { method: "POST", body: { agentId } });
    toast("Đã giao việc tự động — nhân viên đang làm việc.", "info");
    busyAgents = [...new Set([...busyAgents, agentId])];
  } catch (e) {
    toast("Không giao được việc: " + (e as Error).message, "danger");
  }
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

/**
 * Bong bóng báo kết quả: khi một tác vụ chuyển sang "done"/"failed", agent
 * tương ứng hiện bong bóng ngắn trên đầu trong ~3 giây.
 *
 * Chỉ báo một lần mỗi tác vụ (dùng id tác vụ đã thấy) để không spam.
 */
const announcedTasks = new Set<string>();

function announceResults(taskList: TaskRecord[]): void {
  for (const t of taskList) {
    if (t.status !== "done" && t.status !== "failed") continue;
    if (announcedTasks.has(t.id)) continue;
    announcedTasks.add(t.id);
    const rec = agents.get(t.agentId);
    if (!rec) continue;
    const ok = t.status === "done";
    const text = ok
      ? `Xong: ${t.title}`
      : `Lỗi: ${t.title}`;
    rec.bubble.show(text, ok ? "#3fb950" : "#f85149");
    // Nhân vật vẫy tay / cười khi báo kết quả tốt.
    if (rec.visual.chibi) {
      setChibiAnim(rec.visual.chibi, ok ? "toast" : "sweat");
    }
  }
  // Dọn id cũ để không giữ vô hạn (giữ 500 tác vụ gần nhất).
  if (announcedTasks.size > 500) {
    const keep = taskList.slice(-200).map((t) => t.id);
    for (const id of [...announcedTasks]) {
      if (!keep.includes(id)) announcedTasks.delete(id);
    }
  }
}

/** Nạp asset Kenney (nếu có) trước khi dựng cảnh. */
async function loadAssets(): Promise<void> {
  manifest = await loadManifest();
  if (!manifest || !manifest.assets.length) {
    console.info("[assets] Chưa có manifest.json — dùng mô hình dự phòng. Chạy `npm run scan:assets` sau khi tải Kenney.");
    return;
  }
  characterAsset = findCharacter(manifest);
  console.info(
    `[assets] ${manifest.assets.length} model · nhân vật: ${characterAsset?.path ?? "(không có rig)"}`,
  );
  if (characterAsset) {
    console.info(`[assets] animation nhân vật: ${characterAsset.animations.join(", ") || "(không có)"}`);
  }
  // Nạp trước toàn bộ model để tránh hiện tượng "pop-in" khi người dùng xoay camera.
  const paths = manifest.assets.map((a) => a.path);
  await preloadAssets(paths, (done, total) => {
    if (done === 0 || done === total) {
      console.info(`[assets] Đã nạp ${done}/${total} model.`);
    }
  });
}

(async function boot(): Promise<void> {
  await loadAssets();

  const state = await api<any>("/api/state");
  setupRooms(state.departments ?? []);
  setupAgents(state.agents ?? []);
  buildDesks(state.agents ?? []);
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
      announceResults(taskList);
    } catch {
      /* server đang khởi động lại */
    }
  }, 2000);

  // Làm mới trạng thái phân công tự động (nhân viên đang bận) + ngân sách.
  setInterval(async () => {
    try {
      const d = await api<{
        busy: string[];
        dispatched: number;
        intervalMs: number;
        remainingTokens: number;
      }>("/api/dispatch");
      busyAgents = d.busy ?? [];
      dispatchStats = {
        dispatched: d.dispatched ?? 0,
        busy: busyAgents,
        intervalMs: d.intervalMs ?? 15_000,
        remainingTokens: d.remainingTokens ?? 0,
      };
      // Vẽ lại dòng trạng thái tự động trong thanh ngân sách.
      const line = document.getElementById("auto-line");
      if (line) line.innerHTML = autoLineHtml();
    } catch {
      /* ignore */
    }
  }, 3000);

  // Làm mới số liệu chi tiêu theo phòng ban (ledger đổi liên tục) để panel
  // phòng khớp với thanh ngân sách.
  setInterval(async () => {
    try {
      const depts = await api<Department[]>("/api/departments");
      setupRooms(depts);
      if (panelKind === "department") {
        await openPanel("department", panelArg);
      }
    } catch {
      /* ignore */
    }
  }, 5000);

  // Hiển thị FPS + mức chất lượng hiện tại (cập nhật 2 lần/giây).
  setInterval(() => {
    const fpsEl = document.getElementById("quality-fps");
    if (!fpsEl) return;
    const st = quality.status;
    fpsEl.textContent = `${st.fps} fps · ${QUALITY_LABELS[st.level]}`;
    fpsEl.style.color = st.fps < 30 ? "#f85149" : st.fps < 50 ? "#d29922" : "";
  }, 500);
})();
