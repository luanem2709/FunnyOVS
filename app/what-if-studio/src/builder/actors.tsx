// Tu the dung san cho nhan vat, va cach tinh tu the tung khung hinh tu ActorSpec.
import React from 'react';
import { Hero, LOOKS, Look, Pose, basePose, poseAt, faceAt, walkPose, LEG_LEN, HEAD, clamp, lerp, easeOut, easeInOut, backOut } from '../engine';
import type { ActorSpec, Facing } from './types';
import type { Place } from './stages';
import { KID_CAST, KidLook, shadeHex } from './kit/kid';
import { dollLook, DollLook } from './kit/doll';

type L = { a: number; b: number };
type Preset = { F?: L; B?: L; legs?: [L, L]; tilt?: number; headTilt?: number; handF?: 'open' | 'point'; squash?: number; sway?: number; look?: number };

const NEUTRAL: Required<Omit<Preset, 'handF'>> & { handF: 'open' | 'point' } = {
  F: { a: 10, b: -8 },
  B: { a: 10, b: -8 },
  legs: [{ a: 5, b: 0 }, { a: -5, b: 0 }],
  tilt: 0,
  headTilt: 0,
  handF: 'open',
  squash: 0,
  sway: 0,
  look: 0,
};

/** Tu the tinh. F = canh tay phia truoc (theo huong nhin), B = canh tay con lai. */
export const POSES: Record<string, Preset> = {
  stand: {},
  relaxed: { F: { a: 16, b: -4 }, B: { a: 16, b: -4 } },
  point: { F: { a: 85, b: 0 }, handF: 'point', headTilt: 2, look: 0.6 },
  point_up: { F: { a: 160, b: 0 }, handF: 'point', headTilt: -6 },
  reach: { F: { a: 70, b: 0 }, tilt: 10, look: 0.8 },
  catch: { F: { a: 75, b: 10 }, B: { a: 40, b: 20 }, tilt: 24, sway: 10, look: 1 },
  hand_up: { F: { a: 160, b: -18 }, sway: 6 },
  arms_up: { F: { a: 150, b: 10 }, B: { a: 150, b: 10 }, headTilt: -6 },
  think: { F: { a: 28, b: 125 }, B: { a: 12, b: -6 }, headTilt: 8, look: 0.4 },
  shrug: { F: { a: 35, b: 75 }, B: { a: 35, b: 75 }, headTilt: -6 },
  hands_on_head: { F: { a: 135, b: 95 }, B: { a: 135, b: 95 }, tilt: -4, headTilt: -4 },
  facepalm: { F: { a: 40, b: 135 }, headTilt: 14, tilt: 6 },
  hold: { F: { a: 40, b: 80 }, B: { a: 30, b: 70 }, look: 0.5 },
  hunched: { F: { a: 4, b: -2 }, B: { a: 4, b: -2 }, tilt: 10, headTilt: 16, look: -0.2 },
  recoil: { F: { a: 60, b: 30 }, B: { a: 60, b: 30 }, tilt: -10, sway: -8 },
  tired: { F: { a: 2, b: 0 }, B: { a: 2, b: 0 }, tilt: 8, headTilt: 12 },
  lean_back: { tilt: -12, F: { a: 20, b: -6 }, B: { a: 20, b: -6 } },
  hands_hips: { F: { a: 38, b: -110 }, B: { a: 38, b: -110 }, headTilt: -4 },
  arms_crossed: { F: { a: 30, b: 118 }, B: { a: 26, b: 112 }, headTilt: -3, tilt: -2 },
  flex: { F: { a: 95, b: -100 }, B: { a: 95, b: -100 }, headTilt: -5, squash: 0.03 },
  phone_ear: { F: { a: 30, b: 150 }, headTilt: 10, look: 0.3 },
  salute: { F: { a: 120, b: 120 }, headTilt: -4 },
  bow: { tilt: 34, headTilt: 20, F: { a: 6, b: -4 }, B: { a: 6, b: -4 } },
  kneel: { legs: [{ a: 80, b: -150 }, { a: 10, b: -90 }], tilt: 4 },
  sit: { legs: [{ a: 88, b: -88 }, { a: 84, b: -84 }], F: { a: 30, b: 40 }, B: { a: 24, b: 30 } },
  cover_face: { F: { a: 30, b: 150 }, B: { a: 30, b: 150 }, headTilt: 12, tilt: 8 },
  shh: { F: { a: 20, b: 150 }, handF: 'point', headTilt: 6 },
  // dong (chuyen dong theo thoi gian)
  talk: {},
  wave: { F: { a: 150, b: 20 } },
  cheer: { F: { a: 150, b: 10 }, B: { a: 150, b: 10 } },
  jump: { F: { a: 150, b: 10 }, B: { a: 150, b: 10 } },
  walk: {},
  run: {},
  panic: { F: { a: 120, b: 60 }, B: { a: 120, b: 60 } },
  dance: {},
  clap: {},
  nod: {},
  shake_head: {},
  fist_pump: { F: { a: 150, b: 40 } },
  shiver: { F: { a: 30, b: 120 }, B: { a: 30, b: 120 }, tilt: 4 },
  spin: { F: { a: 90, b: 0 }, B: { a: 90, b: 0 } },
  fall: {},
  faint: {},
  float: { F: { a: 40, b: 10 }, B: { a: 40, b: 10 } },
  look_around: {},
  stomp: { F: { a: 40, b: 60 }, B: { a: 40, b: 60 } },
  sneak: { F: { a: 60, b: 70 }, B: { a: 40, b: 60 }, tilt: 14 },
  dash: {},
  typing: { F: { a: 60, b: 50 }, B: { a: 55, b: 50 }, tilt: 6, look: 0.6 },
  laugh: {},
};
export const POSE_IDS = Object.keys(POSES);
const DYN = new Set(['wave_both', 'bounce', 'shake_fist', 'sleep', 'lie', 'point_laugh', 'scratch_head', 'thumbs_up', 'sob', 'hug', 'high_five', 'push', 'punch', 'kick', 'throw', 'pray', 'beg', 'eat', 'drink', 'yawn', 'stretch', 'jumping_jacks', 'victory', 'hide', 'wipe_sweat', 'tap_foot', 'check_watch', 'peek', 'fly', 'moonwalk', 'crawl', 'talk', 'wave', 'cheer', 'jump', 'walk', 'run', 'panic', 'dance', 'clap', 'nod', 'shake_head', 'fist_pump', 'shiver', 'spin', 'fall', 'faint', 'float', 'look_around', 'stomp', 'sneak', 'dash', 'typing', 'laugh']);
export const isDyn = (n?: string) => DYN.has(n ?? '');

const YAW: Record<Facing, number> = { right: 0.5, left: -0.5, front: 0, 'profile-right': 1, 'profile-left': -1 };

const toPose = (name: string | undefined, dir: number): Partial<Pose> => {
  const P = { ...NEUTRAL, ...(POSES[name ?? 'stand'] ?? {}) };
  const front = dir >= 0 ? 'armR' : 'armL';
  const back = dir >= 0 ? 'armL' : 'armR';
  return {
    [front]: P.F,
    [back]: P.B,
    legL: P.legs[0],
    legR: P.legs[1],
    tilt: P.tilt * (dir || 1),
    headTilt: P.headTilt * (dir || 1),
    handR: dir >= 0 ? P.handF : 'open',
    handL: dir >= 0 ? 'open' : P.handF,
    squash: P.squash,
    sway: P.sway,
    look: P.look * (dir || 1),
  } as Partial<Pose>;
};

const shade = (hex: string, k: number) => {
  const n = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(n.slice(i, i + 2), 16) * k))));
  return '#' + v.map((x) => x.toString(16).padStart(2, '0')).join('');
};

export const lookFor = (a: ActorSpec, hero?: { cast?: string; color?: string; accent?: string }, isHero = false): Look => {
  const castName = (classicCast(a.cast ?? (isHero ? hero?.cast : undefined)) ?? 'pipHood') as keyof typeof LOOKS;
  const base = LOOKS[castName] ?? LOOKS.pipHood;
  const color = a.color || (isHero && (!a.cast || a.cast === hero?.cast) ? hero?.color : undefined);
  const accent = a.accent || (isHero && (!a.cast || a.cast === hero?.cast) ? hero?.accent : undefined);
  const out: Look = { ...base };
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    out.jacket = color;
    out.jacketShade = shade(color, 0.8);
    if (base.limb === base.jacket) out.limb = color;
  }
  if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) out.accent = accent;
  return out;
};

const TO_KID: Record<string, string> = { pip: 'nam', pipHood: 'nam', pipInk: 'nam', mo: 'tuan', sis: 'em', mom: 'me', suit: 'sep' };
const TO_CLASSIC: Record<string, string> = { nam: 'pipHood', linh: 'sis', tuan: 'mo', khoa: 'mo', me: 'mom', ba: 'mom', chi: 'mom', bo: 'suit', sep: 'suit', thay: 'suit', em: 'sis', alien: 'pipInk' };
/** Bieu cam moi cua bo Pop doi sang bieu cam gan nhat khi ve bang bo cu. */
export const CLASSIC_EXPR: Record<string, string> = {
  angry: 'oops', love: 'happy', cry: 'worried', wow: 'shock', sad: 'worried', laugh: 'happy', grin: 'happy', wink: 'smug', shy: 'worried', embarrassed: 'oops',
  scared: 'shock', disgusted: 'oops', suspicious: 'smug', confused: 'worried', bored: 'tired', excited: 'happy', evil: 'smug', sleepy: 'tired',
  determined: 'smug', nervous: 'worried', proud: 'happy', crazy: 'dizzy', sick: 'tired', pout: 'oops', kiss: 'happy', rage: 'oops', relieved: 'happy',
  drool: 'happy', jealous: 'smug', surprised: 'shock', thinking: 'neutral',
};

/** Trang phuc bo Pop cho mot nhan vat (doi mau ao nhan vat chinh theo kenh). */
export const kidLookFor = (a: ActorSpec, hero?: { cast?: string; color?: string; accent?: string }, isHero = false): KidLook => {
  let name = (a.cast ?? (isHero ? hero?.cast : undefined) ?? 'nam') as string;
  name = TO_KID[name] ?? name;
  const base = KID_CAST[name] ?? KID_CAST.nam;
  const own = isHero && (!a.cast || a.cast === hero?.cast || TO_KID[a.cast] === name);
  const color = a.color || (own ? hero?.color : undefined);
  const accent = a.accent || (own ? hero?.accent : undefined);
  const out: KidLook = { ...base };
  if (color && /^#[0-9a-fA-F]{6}$/.test(color)) {
    out.top = color;
    out.topShade = shadeHex(color, 0.8);
    out.limb = color;
  }
  if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) out.trim = accent;
  return out;
};
/** Ten nhan vat bo Pop (dung chung cho bo Doll). */
export const kidCastOf = (a: ActorSpec, hero?: { cast?: string }, isHero = false) => {
  let name = (a.cast ?? (isHero ? hero?.cast : undefined) ?? 'nam') as string;
  name = TO_KID[name] ?? name;
  return KID_CAST[name] ? name : 'nam';
};
/** Trang phuc bo Doll 3D (theo bang mau cua tap). */
export const dollLookFor = (a: ActorSpec, hero?: { cast?: string; color?: string; accent?: string }, isHero = false, palette = 'goc'): DollLook => {
  const K = kidLookFor(a, hero, isHero);
  const name = kidCastOf(a, hero, isHero);
  const own = isHero && (!a.cast || a.cast === hero?.cast || TO_KID[a.cast] === name);
  return dollLook(name, K, palette, a.color || (own ? hero?.color : undefined), a.accent || (own ? hero?.accent : undefined));
};
export const classicCast = (n?: string) => (n ? TO_CLASSIC[n] ?? n : n);

/** Tu the cua mot nhan vat tai khung hinh t. */
// ============================================================ chuyen dong
// Di/chay theo quang duong (khong truot chan), tang/giam toc o dau va cuoi, chuyen tu the co blend,
// tho nhe khi dung yen, va bo dong tac dong.
export const LOCO = new Set(['walk', 'run', 'dash', 'sneak', 'fly', 'moonwalk', 'crawl']);
const STILL = new Set(['sleep', 'fall', 'faint', 'float', 'spin', 'fly', 'lie', 'crawl']);

/** Quang duong (0..1) theo thoi gian (0..1): tang toc - deu - giam toc. */
const travel = (u: number, r = 0.22) => {
  const v = 1 / (1 - r);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u < r) return (v * u * u) / (2 * r);
  if (u > 1 - r) return 1 - (v * (1 - u) * (1 - u)) / (2 * r);
  return v * (r / 2 + (u - r));
};
const speedOf = (u: number, r = 0.22) => (u <= 0 || u >= 1 ? 0 : u < r ? u / r : u > 1 - r ? (1 - u) / r : 1);
const smooth = (x: number) => x * x * (3 - 2 * x);
const backOut2 = (x: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
type L2 = { a: number; b: number };
const mixL = (A: L2, B: L2, w: number): L2 => ({ a: lerp(A.a, B.a, w), b: lerp(A.b, B.b, w) });
const blendPose = (A: Pose, B: Pose, w: number): Pose => {
  const ws = smooth(clamp(w));
  const wl = backOut2(clamp(w));
  return {
    ...(ws < 0.5 ? A : B),
    x: lerp(A.x, B.x, ws),
    y: lerp(A.y, B.y, ws),
    scale: lerp(A.scale, B.scale, ws),
    tilt: lerp(A.tilt, B.tilt, wl),
    spin: lerp(A.spin, B.spin, ws),
    headTilt: lerp(A.headTilt, B.headTilt, wl),
    armL: mixL(A.armL, B.armL, wl),
    armR: mixL(A.armR, B.armR, wl),
    legL: mixL(A.legL, B.legL, ws),
    legR: mixL(A.legR, B.legR, ws),
    yaw: lerp(A.yaw, B.yaw, ws),
    look: lerp(A.look, B.look, ws),
    squash: lerp(A.squash, B.squash, ws),
    sway: lerp(A.sway, B.sway, ws),
  };
};

// nua chu ky buoc chan (don vi the gioi, scale 1) theo kieu di
const STRIDE: Record<string, number> = { walk: 140, run: 200, dash: 220, sneak: 90, moonwalk: 90, crawl: 70, fly: 400 };

type MCtx = { a: ActorSpec; place: Place; toPlace?: Place; ground?: number | ((x: number) => number); len: number; dir: number; f1: number };

const locoWindow = (c: MCtx, which: 1 | 2): [number, number] => {
  const has2 = !!c.a.pose2;
  if (which === 1) return [0, has2 ? c.f1 : c.len];
  return [c.f1, c.len];
};

/** Vi tri tren duong di tai khung t. */
const where = (c: MCtx, t: number) => {
  const { place, toPlace } = c;
  if (!toPlace) return { x: place.x, y: place.y, scale: place.scale, u: 0, moving: false, fdir: (c.dir < 0 ? -1 : 1) as 1 | -1 };
  const n1 = LOCO.has(c.a.pose ?? '');
  const n2 = LOCO.has(c.a.pose2 ?? '');
  const [w0, w1] = n1 ? locoWindow(c, 1) : n2 ? locoWindow(c, 2) : [0, c.len];
  const u = clamp((t - w0) / Math.max(1, w1 - w0));
  const k = n1 || n2 ? travel(u) : 0;
  return {
    x: lerp(place.x, toPlace.x, k),
    y: lerp(place.y, toPlace.y, k),
    scale: lerp(place.scale, toPlace.scale, k),
    u,
    moving: (n1 || n2) && u > 0 && u < 1,
    fdir: (toPlace.x >= place.x ? 1 : -1) as 1 | -1,
  };
};

const locoPose = (name: string, c: MCtx, t: number): Pose => {
  const w = where(c, t);
  const sc = w.scale;
  const gy = c.ground !== undefined ? (typeof c.ground === 'number' ? c.ground : c.ground(w.x)) - LEG_LEN * sc : w.y;
  const inPlace = !c.toPlace;
  const travelDir = w.fdir;
  const faceDir: 1 | -1 = name === 'moonwalk' ? (-travelDir as 1 | -1) : travelDir;
  const dist = Math.abs(w.x - c.place.x);
  const rate = { walk: 0.32, run: 0.5, dash: 0.75, sneak: 0.2, moonwalk: 0.25, crawl: 0.2, fly: 0.1 }[name] ?? 0.32;
  const phase = inPlace ? t * rate : (dist / ((STRIDE[name] ?? 140) * sc)) * Math.PI + 0.4;
  const m = inPlace ? 1 : 0.2 + 0.8 * speedOf(w.u);
  const s = Math.sin(phase);
  const co = Math.cos(phase);
  const p: Pose = { ...basePose, x: w.x, y: gy, scale: sc, facing: faceDir, yaw: faceDir };
  const fd = faceDir;
  if (name === 'fly') {
    return {
      ...p,
      y: gy - 130 * sc + Math.sin(t * 0.15) * 8 * sc,
      spin: 72 * fd,
      armR: fd > 0 ? { a: 175, b: 0 } : { a: 20, b: 10 },
      armL: fd > 0 ? { a: 20, b: 10 } : { a: 175, b: 0 },
      legL: { a: -6 + 4 * Math.sin(t * 0.4), b: -6 },
      legR: { a: -10 - 4 * Math.sin(t * 0.4), b: -10 },
      sway: 18 * Math.sin(t * 0.3),
      handR: 'point',
      handL: 'point',
    };
  }
  if (name === 'crawl') {
    const F = fd > 0 ? 'armR' : 'armL';
    const Bk = fd > 0 ? 'armL' : 'armR';
    return {
      ...p,
      y: gy + 62 * sc,
      tilt: 58 * fd,
      headTilt: -40 * fd,
      [F]: { a: -10 + 22 * s, b: -10 },
      [Bk]: { a: 10 + 22 * s, b: 10 },
      legL: { a: 80 + 14 * s, b: -150 },
      legR: { a: 80 - 14 * s, b: -150 },
    } as Pose;
  }
  const amp = { walk: 30, run: 46, dash: 54, sneak: 20, moonwalk: 18 }[name] ?? 30;
  const knee = { walk: 50, run: 100, dash: 110, sneak: 40, moonwalk: 30 }[name] ?? 50;
  const run = name === 'run' || name === 'dash';
  const swing = run ? 55 : name === 'sneak' ? 0 : 26;
  const legPh = name === 'moonwalk' ? -1 : 1;
  const out: Pose = {
    ...p,
    legL: { a: legPh * amp * m * s, b: -Math.max(0, knee * m * Math.sin(phase + 1.3)) - (name === 'sneak' ? 30 : 0) },
    legR: { a: -legPh * amp * m * s, b: -Math.max(0, knee * m * Math.sin(phase + 1.3 + Math.PI)) - (name === 'sneak' ? 30 : 0) },
    armL: { a: swing * m * s * fd, b: run ? 85 : 14 + 12 * Math.abs(s) },
    armR: { a: swing * m * s * fd, b: run ? 85 : 14 + 12 * Math.abs(s) },
    y: gy - Math.abs(co) * (run ? 14 : 7) * m * sc + (name === 'sneak' ? 26 * sc : 0),
    tilt: (name === 'dash' ? 24 : run ? 12 : name === 'sneak' ? 14 : 4) * fd * (0.4 + 0.6 * m),
    headTilt: (run ? -6 * fd : 0) + 2 * Math.sin(phase * 2),
    sway: (run ? 16 : 8) * Math.sin(phase + 0.8),
    squash: run && Math.abs(co) < 0.2 ? 0.04 : 0,
  };
  if (name === 'sneak') {
    const fa = fd > 0 ? 'armR' : 'armL';
    const ba = fd > 0 ? 'armL' : 'armR';
    (out as any)[fa] = { a: 70 + 6 * s, b: 70 };
    (out as any)[ba] = { a: 40 - 6 * s, b: 80 };
    out.look = 0.6 * fd * Math.sin(t * 0.08);
  }
  if (name === 'moonwalk') out.tilt = -3 * fd;
  // dung lai cuoi duong: chan khep lai
  if (!inPlace && !w.moving && w.u >= 1) {
    return { ...out, legL: { a: 0, b: 0 }, legR: { a: 0, b: 0 }, armL: { a: 6, b: 8 }, armR: { a: 6, b: 8 }, tilt: 0, y: gy };
  }
  return out;
};

/** Dong tac tai cho (ts = so khung tu luc bat dau dong tac nay). */
const actionPose = (name: string, c: MCtx, t: number, ts: number): Pose => {
  const w = where(c, t);
  const sc = w.scale;
  const yaw = YAW[c.a.facing ?? 'right'] ?? 0.5;
  const dir = c.dir;
  const d = dir || 1;
  let pose: Pose = { ...basePose, x: w.x, y: w.y, scale: sc, yaw, facing: dir < 0 ? -1 : 1, ...toPose(name, dir) } as Pose;
  const F = dir >= 0 ? 'armR' : 'armL';
  const B = dir >= 0 ? 'armL' : 'armR';
  const FL = 'legR';
  const set = (o: Partial<Pose> & Record<string, any>) => {
    pose = { ...pose, ...o } as Pose;
  };
  const S = Math.sin;
  const ab = Math.abs;
  switch (name) {
    case 'talk': {
      // tay ra hieu theo nhip noi, dau gat nhe
      const g = S(ts / 7);
      set({ [F]: { a: 30 + 18 * ab(g), b: 50 + 30 * ab(S(ts / 4.3)) }, [B]: { a: 10 + 6 * S(ts / 9), b: 14 }, headTilt: 3 * S(ts / 5.5) * d, y: w.y - ab(S(ts / 5)) * 2 * sc });
      break;
    }
    case 'wave':
      set({ [F]: { a: 150, b: 20 + 30 * S(ts * 0.55) }, headTilt: 4 * d, tilt: -3 * d });
      break;
    case 'wave_both':
      set({ armL: { a: 150, b: 20 + 30 * S(ts * 0.55) }, armR: { a: 150, b: 20 + 30 * S(ts * 0.55 + 1) }, y: w.y - ab(S(ts * 0.3)) * 6 * sc });
      break;
    case 'cheer':
    case 'jump': {
      const per = name === 'jump' ? 18 : 12;
      const ph = (ts % per) / per;
      const air = ph < 0.65 ? Math.sin((ph / 0.65) * Math.PI) : 0;
      const land = ph >= 0.65 ? Math.sin(((ph - 0.65) / 0.35) * Math.PI) : 0;
      const hgt = name === 'jump' ? 80 : 22;
      set({
        armL: { a: 150 + 10 * S(ts * 0.7), b: 10 },
        armR: { a: 150 + 10 * S(ts * 0.7 + 1), b: 10 },
        y: w.y - air * hgt * sc + land * 6 * sc,
        squash: air > 0.05 ? -0.06 * air : 0.08 * land,
        legL: { a: air * 18, b: -air * 40 },
        legR: { a: -air * 8, b: -air * 30 },
        sway: 10 * S(ts * 0.6),
      });
      break;
    }
    case 'bounce': {
      const h = ab(S(ts * 0.42));
      set({ y: w.y - h * 16 * sc, armL: { a: 40 + 30 * h, b: 60 }, armR: { a: 40 + 30 * h, b: 60 }, squash: h < 0.15 ? 0.06 : -0.02, sway: 10 * S(ts * 0.42) });
      break;
    }
    case 'panic':
      set({ x: w.x + S(ts * 1.9) * 6 * sc, armL: { a: 150 + 20 * S(ts * 1.3), b: 40 + 30 * S(ts * 1.1) }, armR: { a: 150 + 20 * S(ts * 1.3 + 2), b: 40 + 30 * S(ts * 1.1 + 1) }, sway: 14 * S(ts * 1.4), y: w.y - ab(S(ts * 0.9)) * 8 * sc });
      break;
    case 'dance': {
      const b = S(ts * 0.36);
      const hop = ab(S(ts * 0.36));
      set({
        armL: { a: 100 + 55 * b, b: 40 - 40 * b },
        armR: { a: 100 - 55 * b, b: 40 + 40 * b },
        legL: { a: 22 * b, b: -26 * Math.max(0, b) },
        legR: { a: -22 * b, b: -26 * Math.max(0, -b) },
        tilt: 9 * b,
        headTilt: -10 * b,
        y: w.y - hop * 16 * sc,
        sway: 16 * b,
      });
      break;
    }
    case 'clap': {
      const cl = ab(S(ts * 0.45));
      set({ [F]: { a: 60, b: 50 + 40 * cl }, [B]: { a: -50, b: -50 - 40 * cl }, y: w.y - cl * 2 * sc });
      break;
    }
    case 'nod':
      set({ headTilt: d * 10 * Math.max(0, S(ts * 0.45)), look: 0.2 * d });
      break;
    case 'shake_head':
      set({ yaw: S(ts * 0.55) * 0.6, headTilt: S(ts * 0.55) * 4 });
      break;
    case 'fist_pump': {
      const k2 = ab(S(ts * 0.42));
      set({ [F]: { a: 110 + 50 * k2, b: 70 - 60 * k2 }, y: w.y - k2 * 10 * sc, tilt: -4 * d * k2 });
      break;
    }
    case 'shake_fist':
      set({ [F]: { a: 130, b: 70 + 25 * S(ts * 1.6) }, tilt: 4 * d, x: w.x + S(ts * 1.6) * 2 * sc });
      break;
    case 'shiver':
      set({ x: w.x + S(ts * 3.1) * 3 * sc, sway: 6 * S(ts * 2.7), armL: { a: 30, b: 125 + 4 * S(ts * 3) }, armR: { a: 30, b: 125 + 4 * S(ts * 3.3) }, tilt: 4 * d });
      break;
    case 'spin': {
      const sp = clamp(ts / Math.max(1, c.len * 0.7));
      const e = easeInOut(sp);
      const ang = e * Math.PI * 4;
      const yw = Math.cos(ang);
      set({ yaw: yw * d, facing: yw >= 0 ? 1 : -1, y: w.y - S(sp * Math.PI) * 30 * sc, armL: { a: 90 - 20 * S(sp * Math.PI), b: 0 }, armR: { a: 90 - 20 * S(sp * Math.PI), b: 0 } });
      break;
    }
    case 'fall':
    case 'faint': {
      const back = name === 'faint' ? -1 : 1;
      const pre = name === 'faint' ? 6 : 2; // ngat: lao dao truoc
      const tt = ts - pre;
      const wob = tt < 0 ? S(ts * 0.9) * 4 : 0;
      const kk = tt < 0 ? 0 : clamp(tt / 9) ** 2; // roi co gia toc
      const bounce = tt > 9 ? ab(S((tt - 9) * 0.55)) * Math.max(0, 1 - (tt - 9) / 12) * 14 : 0;
      set({
        spin: 88 * kk * back * d + wob,
        y: w.y + kk * 176 * sc - bounce * sc,
        armL: { a: 30 + 100 * kk, b: 20 },
        armR: { a: 30 + 100 * kk, b: 20 },
        legL: { a: 18 * kk, b: -10 },
        legR: { a: -8 * kk, b: -20 * kk },
        squash: tt > 8 && tt < 11 ? 0.05 : 0,
      });
      break;
    }
    case 'sleep':
    case 'lie': {
      const br = S(ts * 0.12);
      set({ spin: -88 * d, y: w.y + 178 * sc - br * 2 * sc, armL: { a: 20, b: 10 }, armR: { a: 20, b: 10 }, legL: { a: 6, b: 0 }, legR: { a: 0, b: -4 }, blink: name === 'sleep' ? 1 : 0 } as any);
      break;
    }
    case 'float': {
      const up = easeInOut(clamp(ts / 18));
      set({ y: w.y - (up * 90 + S(ts * 0.14) * 10) * sc, legL: { a: 10, b: -30 }, legR: { a: -6, b: -20 }, armL: { a: 50 + 6 * S(ts * 0.14), b: 10 }, armR: { a: 50 + 6 * S(ts * 0.14 + 1), b: 10 }, sway: 8 * S(ts * 0.14) });
      break;
    }
    case 'look_around': {
      const l = S(ts * 0.14);
      set({ yaw: l * 0.85, look: l, headTilt: 3 * l });
      break;
    }
    case 'stomp': {
      const st = (ts % 14) / 14;
      const up = st < 0.5 ? S(st * Math.PI * 2) : 0;
      set({ legL: { a: 50 * up, b: -70 * up }, squash: st > 0.5 && st < 0.62 ? 0.07 : 0, [F]: { a: 40, b: 70 }, [B]: { a: 40, b: 70 }, x: w.x + (st > 0.5 && st < 0.6 ? S(ts * 3) * 3 : 0) });
      break;
    }
    case 'typing':
      set({ [F]: { a: 62, b: 48 + 12 * S(ts * 1.7) }, [B]: { a: -40, b: -60 - 10 * S(ts * 1.9 + 1) }, tilt: 6 * d, look: 0.6 * d, headTilt: 4 * d });
      break;
    case 'laugh': {
      const h = ab(S(ts * 0.6));
      set({ tilt: -6 * d - 6 * h * d, headTilt: -10 * h * d, armL: { a: 30, b: 100 }, armR: { a: 30, b: 100 }, y: w.y - h * 6 * sc });
      break;
    }
    case 'point_laugh': {
      const h = ab(S(ts * 0.6));
      set({ [F]: { a: 85, b: 0 }, handR: dir >= 0 ? 'point' : 'open', handL: dir < 0 ? 'point' : 'open', [B]: { a: 30, b: 110 }, tilt: -5 * d - 6 * h * d, y: w.y - h * 5 * sc, headTilt: -8 * h * d });
      break;
    }
    case 'scratch_head':
      set({ [F]: { a: 150, b: 125 + 12 * S(ts * 0.9) }, headTilt: 8 * d, look: -0.4 * d, tilt: 2 * d });
      break;
    case 'thumbs_up':
      set({ [F]: { a: 55 + 4 * S(ts * 0.3), b: 105 }, handR: dir >= 0 ? 'point' : 'open', handL: dir < 0 ? 'point' : 'open', headTilt: -4 * d });
      break;
    case 'sob': {
      const h = ab(S(ts * 0.9));
      set({ armL: { a: 30, b: 150 }, armR: { a: 30, b: 150 }, tilt: 10 * d, headTilt: 14 * d, y: w.y + h * 4 * sc });
      break;
    }
    case 'hug':
      set({ [F]: { a: 80, b: 40 + 6 * S(ts * 0.3) }, [B]: { a: -70, b: -40 }, tilt: 6 * d, headTilt: 6 * d });
      break;
    case 'high_five': {
      const k2 = smooth(clamp(ts / 8));
      set({ [F]: { a: 120 + 40 * k2, b: 10 - 10 * k2 }, tilt: 6 * d * k2, y: w.y - k2 * 6 * sc });
      break;
    }
    case 'push':
      set({ [F]: { a: 85, b: 5 }, [B]: { a: -80, b: -5 }, tilt: 18 * d, legL: { a: -22, b: 0 }, legR: { a: 18, b: -16 }, x: w.x + S(ts * 0.3) * 3 * sc });
      break;
    case 'punch': {
      const ph = (ts % 10) / 10;
      const ext = ph < 0.35 ? S((ph / 0.35) * Math.PI * 0.5) : 1 - smooth((ph - 0.35) / 0.65);
      set({ [F]: { a: lerp(40, 92, ext), b: lerp(110, 0, ext) }, [B]: { a: 30, b: 120 }, tilt: 8 * d * ext, legL: { a: -14, b: 0 }, legR: { a: 16, b: -14 } });
      break;
    }
    case 'kick': {
      const ph = (ts % 16) / 16;
      const k2 = ph < 0.4 ? S((ph / 0.4) * Math.PI * 0.5) : 1 - smooth((ph - 0.4) / 0.6);
      set({ [FL]: { a: 95 * k2, b: -60 * (1 - k2) }, legL: { a: -10, b: 0 }, tilt: -12 * d * k2, armL: { a: 60, b: 30 }, armR: { a: 60, b: 30 } });
      break;
    }
    case 'throw': {
      const ph = clamp(ts / 14);
      const a1 = ph < 0.5 ? lerp(60, -40, smooth(ph / 0.5)) : lerp(-40, 150, easeOut((ph - 0.5) / 0.5));
      set({ [F]: { a: a1, b: ph < 0.5 ? 60 : 10 }, tilt: (ph < 0.5 ? -8 : 10) * d, legR: { a: 14, b: -10 } });
      break;
    }
    case 'pray':
      set({ [F]: { a: 40, b: 105 }, [B]: { a: -30, b: -120 }, headTilt: 8 * d, tilt: 3 * d });
      break;
    case 'beg':
      set({ [F]: { a: 40, b: 105 }, [B]: { a: -30, b: -120 }, headTilt: -10 * d, legs: undefined, legL: { a: 80, b: -150 }, legR: { a: 10, b: -90 }, y: w.y + 62 * sc + S(ts * 0.5) * 2 * sc } as any);
      break;
    case 'eat':
    case 'drink': {
      const ph = ab(S(ts * (name === 'eat' ? 0.35 : 0.18)));
      set({ [F]: { a: 30 + 20 * ph, b: 140 - 30 * (1 - ph) }, headTilt: name === 'drink' ? -12 * d * ph : 4 * d, y: w.y - (name === 'eat' ? ab(S(ts * 0.7)) * 2 * sc : 0) });
      break;
    }
    case 'yawn':
    case 'stretch': {
      const k2 = smooth(clamp(ts / 14));
      set({ armL: { a: lerp(10, 165, k2), b: 10 }, armR: { a: lerp(10, 165, k2), b: 10 }, tilt: 6 * S(ts * 0.15) * k2, y: w.y - k2 * 6 * sc, headTilt: name === 'yawn' ? -10 * d * k2 : 0 });
      break;
    }
    case 'jumping_jacks': {
      const k2 = ab(S(ts * 0.38));
      set({ armL: { a: lerp(15, 165, k2), b: 0 }, armR: { a: lerp(15, 165, k2), b: 0 }, legL: { a: -14 * k2, b: 0 }, legR: { a: 14 * k2, b: 0 }, y: w.y - k2 * 14 * sc, yaw: 0 });
      break;
    }
    case 'victory':
      set({ armL: { a: 145, b: 0 }, armR: { a: 145, b: 0 }, y: w.y - ab(S(ts * 0.35)) * 10 * sc, sway: 8 * S(ts * 0.35) });
      break;
    case 'hide':
      set({ armL: { a: 150, b: 100 }, armR: { a: 150, b: 100 }, y: w.y + 88 * sc, legL: { a: 70, b: -140 }, legR: { a: 64, b: -134 }, x: w.x + S(ts * 2.8) * 2 * sc, tilt: 18 * d });
      break;
    case 'wipe_sweat': {
      const ph = (ts % 20) / 20;
      set({ [F]: { a: 150, b: lerp(130, 95, smooth(ph)) }, headTilt: -6 * d, tilt: -2 * d });
      break;
    }
    case 'tap_foot': {
      const tp = Math.max(0, S(ts * 0.6));
      set({ [FL]: { a: 10, b: -14 * tp }, armL: { a: 30, b: 118 }, armR: { a: 26, b: 112 }, headTilt: -3 * d });
      break;
    }
    case 'check_watch':
      set({ [B]: { a: -60, b: -80 }, headTilt: 14 * d, look: 0.6 * d, tilt: 3 * d });
      break;
    case 'peek':
      set({ tilt: 26 * d, y: w.y + 8 * sc, armL: { a: 20, b: 20 }, armR: { a: 20, b: 20 }, look: 0.8 * d + 0.1 * S(ts * 0.1) });
      break;
    case 'facepalm':
      set({ [F]: { a: 40, b: 135 }, headTilt: 12 * d, tilt: 5 * d });
      break;
    case 'shrug': {
      const k2 = smooth(clamp(ts / 7));
      set({ armL: { a: lerp(10, 40, k2), b: lerp(10, -110, k2) }, armR: { a: lerp(10, 40, k2), b: lerp(10, -110, k2) }, headTilt: 8 * d * k2, y: w.y - 3 * k2 * sc });
      break;
    }
    default:
      break;
  }
  if (name === 'sit') pose = { ...pose, y: pose.y + 70 * sc };
  if (name === 'kneel') pose = { ...pose, y: pose.y + 62 * sc };
  // tho nhe va doi trong tam khi dung yen
  if (!STILL.has(name)) {
    const br = S(t * 0.1);
    pose = {
      ...pose,
      y: pose.y - (br * 0.5 + 0.5) * 2.2 * sc,
      headTilt: pose.headTilt + 1.4 * S(t * 0.06 + c.place.x),
      tilt: pose.tilt + 0.9 * S(t * 0.045 + c.place.x * 0.3),
      armL: { a: pose.armL.a + 1.6 * br, b: pose.armL.b + 2 * S(t * 0.08) },
      armR: { a: pose.armR.a + 1.6 * br, b: pose.armR.b + 2 * S(t * 0.08 + 1) },
    };
  }
  return pose;
};

const single = (name: string, c: MCtx, t: number, ts: number) => (LOCO.has(name) ? locoPose(name, c, t) : actionPose(name, c, t, ts));

const rawActorPose = (a: ActorSpec, place: Place, t: number, len: number, ground?: number | ((x: number) => number), toPlace?: Place): Pose => {
  const yaw = YAW[a.facing ?? 'right'] ?? 0.5;
  const dir = yaw > 0.05 ? 1 : yaw < -0.05 ? -1 : 0;
  const f1 = Math.round(clamp(a.at ?? 0.35) * len);
  const c: MCtx = { a, place, toPlace, ground, len, dir, f1 };
  const n1 = a.pose ?? 'stand';
  let pose = single(n1, c, t, t);
  if (a.pose2 && t >= f1) {
    const p2 = single(a.pose2, c, t, t - f1);
    const span = LOCO.has(a.pose2) || LOCO.has(n1) ? 6 : 8;
    pose = blendPose(pose, p2, (t - f1) / span);
  }
  const face = faceAt(t, (a.expr2 && a.expr2 !== a.expr ? [[0, a.expr ?? 'neutral'], [f1, a.expr2]] : [[0, a.expr ?? 'neutral']]) as any);
  const glasses = a.expr2 === 'cool' ? backOut(clamp((t - f1 - 2) / 6)) : a.expr === 'cool' ? 1 : 0;
  const sleeping = (t >= f1 && a.pose2 ? a.pose2 : n1) === 'sleep';
  const wg = where(c, t);
  const gy = (ground !== undefined ? (typeof ground === 'number' ? ground : ground(pose.x)) : wg.y + LEG_LEN * wg.scale);
  const out: Pose = { ...pose, ...face, glasses, blink: sleeping ? 1 : face.blink, groundY: gy } as Pose;
  if (a.glint) {
    out.glint = 1;
    out.glintColor = '#7FD4FF';
  }
  return out;
};

// ============================================================ bo chuyen dong muot (smooth motion)
// 1) Overlap / follow-through: canh tay tre 1-2 khung so voi than, khuyu tay tre hon vai -> dong tac "vung" tu nhien.
// 2) Dau tre sau than: than nghieng truoc, dau theo sau.
// 3) Chuyen dong phu (secondary): khan, day mu, ao choang, toc vang theo van toc bang lo xo tat dan (dung lai van con dung dua).
// 4) Lay da (anticipation): nhun nhe truoc khi doi sang dong tac moi (nhay, dam, nem... nhun manh hon).
// 5) Song dong khi dung yen: chuyen trong luong nhe, dau nghieng nhe, chop mat tu nhien theo nhip rieng tung nhan vat.
export const MOTION = { style: 'muot' as 'muot' | 'giat' };
const ANTIC = new Set(['jump', 'cheer', 'punch', 'kick', 'throw', 'victory', 'fist_pump', 'stomp', 'dash', 'run', 'high_five', 'push', 'jumping_jacks', 'fall', 'faint']);
const seedOf = (a: ActorSpec, place: Place) => {
  const s = `${a.cast ?? 'x'}${Math.round(place.x)}`;
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return h;
};

export const actorPose = (a: ActorSpec, place: Place, t: number, len: number, ground?: number | ((x: number) => number), toPlace?: Place): Pose => {
  const P = (k: number) => rawActorPose(a, place, Math.max(0, k), len, ground, toPlace);
  const p0 = P(t);
  if (MOTION.style === 'giat') return p0;
  const p1 = P(t - 1);
  const p2 = P(t - 2);
  const sc = Math.max(0.2, p0.scale);
  const f1 = Math.round(clamp(a.at ?? 0.35) * len);
  const cur = a.pose2 && t >= f1 ? a.pose2 : a.pose ?? 'stand';
  const still = !LOCO.has(cur) && !isDyn(cur);
  const seed = seedOf(a, place);
  // 1) tay: vai tre it, khuyu tre nhieu hon
  const arm = (k: 'armL' | 'armR') => ({
    a: 0.55 * p0[k].a + 0.3 * p1[k].a + 0.15 * p2[k].a,
    b: 0.42 * p0[k].b + 0.33 * p1[k].b + 0.25 * p2[k].b,
  });
  // 3) lo xo chuyen dong phu theo van toc ngang (mo phong 24 khung gan nhat)
  let sp = 0;
  let sv = 0;
  let px = P(t - 25).x;
  for (let k = t - 24; k <= t; k++) {
    const x = k === t ? p0.x : k === t - 1 ? p1.x : k === t - 2 ? p2.x : P(k).x;
    const v = (x - px) / sc;
    px = x;
    const target = clamp(-v * 1.6, -45, 45);
    sv = (sv + (target - sp) * 0.2) * 0.8;
    sp += sv;
  }
  // 2) dau tre sau than
  const dTilt = p0.tilt - p2.tilt;
  let headTilt = 0.6 * p0.headTilt + 0.28 * p1.headTilt + 0.12 * p2.headTilt - dTilt * 0.35 - sp * 0.08;
  let x = p0.x;
  let squash = p0.squash;
  let tilt = p0.tilt;
  // 5) song dong khi dung yen
  if (still && !STILL.has(cur)) {
    x += Math.sin(t * 0.035 + seed) * 2.2 * sc;
    headTilt += Math.sin(t * 0.05 + seed * 0.7) * 1.4;
  }
  // 4) lay da truoc khi doi dong tac
  if (a.pose2 && t < f1 && t >= f1 - 5 && !LOCO.has(a.pose2)) {
    const k = Math.sin(((t - (f1 - 5)) / 5) * Math.PI);
    const amt = ANTIC.has(a.pose2) ? 1 : 0.35;
    squash += 0.07 * amt * k;
    tilt -= 4 * amt * k * (p0.facing || 1);
  }
  // chop mat tu nhien (khong chop khi dang ngu / mat dang nham)
  let blink = p0.blink;
  if (blink < 0.5 && cur !== 'sleep') {
    const period = 84 + (seed % 60);
    const ph = (t + seed) % period;
    if (ph < 2) blink = 1;
    else if (ph < 3) blink = 0.6;
  }
  return { ...p0, x, tilt, squash, headTilt, armL: arm('armL'), armR: arm('armR'), sway: (p0.sway ?? 0) + sp, blink } as Pose;
};

/** Diem dau nhan vat trong the gioi (de nham may quay, dat vong sang, ngoi sao chong mat...). */
export const headOf = (p: Pose) => ({ x: p.x + (p.yaw || 0) * 12 * p.scale, y: p.y + HEAD.y * p.scale });

export const ActorView: React.FC<{ look: Look; pose: Pose; rim: string; shadow: number }> = ({ look, pose, rim, shadow }) => (
  <Hero look={look} pose={pose} rimId={rim} shadow={shadow} />
);
