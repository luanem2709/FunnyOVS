/**
 * Studio: dựng clip hoạt hình khối (kiểu Roblox) từ DỮ LIỆU — kiểu dùng chung server ↔ client và bộ kiểm tra dữ liệu (zod).
 *
 * Mẫu hiện có: `freelancer-8` — 8 cảnh dàn cảnh cố định (phòng trọ, ngoài trời, văn phòng) + tựa + kết. Agent KHÔNG viết mã dàn cảnh;
 * chỉ đổi 3 bộ dữ liệu: lời đọc (10 câu), shot list (cỡ cảnh/góc máy/chuyển động theo từng cảnh) và character bible (màu/tóc nhân vật).
 * Mọi dữ liệu được kiểm chặt (độ dài, số hữu hạn, toạ độ máy trong giới hạn, mỗi cảnh phải được phủ kín bởi các shot) trước khi ghi.
 */
import { z } from "zod";

export const STUDIO_TEMPLATE = "freelancer-8";
export const SCENE_NAMES = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"] as const;
export type SceneName = (typeof SCENE_NAMES)[number];
export const PROJECT_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
export const MAX_LINE_CHARS = 260;
export const SCRIPT_LINES = 10;

export const STUDIO_KINDS = ["script", "shots", "characters"] as const;
export type StudioKind = (typeof STUDIO_KINDS)[number];
/** Tên file dữ liệu trong thư mục dự án. */
export const KIND_FILE: Record<StudioKind, string> = { script: "loi-doc.json", shots: "shots.json", characters: "characters.json" };

const text = (max: number) => z.string().trim().min(1).max(max);
const vec3 = z.tuple([z.number().min(-1000).max(1000), z.number().min(-1000).max(1000), z.number().min(-1000).max(1000)]);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "màu phải dạng #RRGGBB");

/** Lời đọc: đúng 10 câu — [tựa, 8 cảnh, kết]. */
export const ScriptSchema = z.array(z.object({ text: text(MAX_LINE_CHARS) })).length(SCRIPT_LINES);

export const ShotSchema = z.object({
  id: z.string().regex(/^[0-9A-Za-z]{1,6}$/),
  scene: z.enum(SCENE_NAMES),
  f: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  size: text(60),
  angle: text(80),
  move: text(80),
  why: text(160),
  from: vec3,
  to: vec3.optional(),
  lookFrom: vec3,
  lookTo: vec3.optional(),
  fov: z.tuple([z.number().min(10).max(90), z.number().min(10).max(90)]).optional(),
});
export type Shot = z.infer<typeof ShotSchema>;

export const ShotsSchema = z
  .object({ aspect: text(60).optional(), axis: text(240).optional(), shots: z.array(ShotSchema).min(8).max(40) })
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    for (const s of v.shots) {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: `trùng id shot ${s.id}` });
      ids.add(s.id);
      if (!(s.f[0] < s.f[1])) ctx.addIssue({ code: "custom", message: `shot ${s.id}: f phải tăng (từ < đến)` });
    }
    // mỗi cảnh phải được phủ kín [0,1] bởi các shot liền nhau (không hở, không chồng) — nếu không máy quay sẽ nhảy/đứng hình
    for (const sc of SCENE_NAMES) {
      const list = v.shots.filter((s) => s.scene === sc).sort((a, b) => a.f[0] - b.f[0]);
      if (list.length === 0) { ctx.addIssue({ code: "custom", message: `cảnh ${sc} chưa có shot nào` }); continue; }
      if (Math.abs(list[0].f[0]) > 1e-6) ctx.addIssue({ code: "custom", message: `cảnh ${sc}: shot đầu phải bắt đầu ở 0` });
      if (Math.abs(list[list.length - 1].f[1] - 1) > 1e-6) ctx.addIssue({ code: "custom", message: `cảnh ${sc}: shot cuối phải kết thúc ở 1` });
      for (let i = 1; i < list.length; i++) if (Math.abs(list[i].f[0] - list[i - 1].f[1]) > 1e-6) ctx.addIssue({ code: "custom", message: `cảnh ${sc}: các shot phải liền nhau (hở/chồng giữa ${list[i - 1].id} và ${list[i].id})` });
    }
  });

const HAIR = z.enum(["short", "long", "bun", "cap"]);
const person = z.object({ ten: text(60).optional(), skin: hex, shirt: hex, sleeve: hex.optional(), pants: hex, hair: HAIR.optional(), hairColor: hex.optional(), backpack: hex.optional() });

export const CharactersSchema = z.object({
  hero: z.object({
    ten: text(120).optional(),
    kieu: z.literal("plush"),
    skin: hex,
    shirt: hex,
    pants: hex,
    co_dinh: z.array(text(120)).max(12).optional(),
    bien_the: z.object({ vest: z.object({ shirt: hex, sleeve: hex, pants: hex, tie: hex, collar: hex, ghi_chu: text(120).optional() }) }),
    cam_xuc: z.record(z.string().max(30), z.string().max(30)).optional(),
  }),
  mom: person.extend({ kieu: z.literal("blocky") }),
  student: person.extend({ kieu: z.literal("blocky") }),
  clients: z.object({ ten: text(60).optional(), kieu: z.literal("blocky"), mau_ao: z.array(hex).length(12), mau_da: z.array(hex).min(1).max(6), nguoi_cam_bien: text(120).optional() }),
});

export const SCHEMAS = { script: ScriptSchema, shots: ShotsSchema, characters: CharactersSchema } as const;

export type JobStatus = "queued" | "awaiting-approval" | "running" | "done" | "failed" | "cancelled";
export type JobStep = "approval" | "voice" | "timing" | "mix" | "render" | "encode" | "done";

export interface StudioJob {
  id: string;
  project: string;
  status: JobStatus;
  step: JobStep;
  /** 0..1 */
  progress: number;
  voice: boolean;
  preview: boolean;
  by: string;
  startedAt: string;
  finishedAt?: string;
  /** Đường dẫn tương đối của sản phẩm (video hoặc thư mục ảnh xem thử). */
  output?: string;
  /** Số ảnh xem thử (khi `preview`). */
  previewCount?: number;
  /** Lý do lỗi/huỷ: khoá i18n (`val.studio.*`) + biến. */
  error?: { key: string; vars?: Record<string, string | number>; detail?: string };
}

export interface StudioState {
  jobs: StudioJob[];
  projects: string[];
  /** Máy có đủ công cụ ngoài? (kiểm tra khi gọi, không bắt buộc cho việc xem trạng thái) */
  tools?: { ffmpeg: boolean; chrome: boolean; voice: boolean };
  at: string;
}
