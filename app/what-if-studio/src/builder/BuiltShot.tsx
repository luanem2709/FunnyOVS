// Mot canh duoc ve tu du lieu ShotSpec: boi canh, nhan vat, do vat, may quay va chu tren man hinh.
import React from 'react';
import { camT, clamp, kf, lerp, easeInOut, easeOut, easeIn, Look, Pose, ShotProps } from '../engine';
import { STAGES, Place, Ctx } from './stages';
import { actorPose, lookFor, kidLookFor, dollLookFor, headOf, ActorView, CLASSIC_EXPR, MOTION } from './actors';
import { Doll, DollDefs, inkify } from './kit/doll';
import { Kid, PopDefs, KID_SIZE, KID_CAST, CROWD_IDS } from './kit/kid';
import { POP_STAGES, WeatherFx, TodWash, GRADES } from './kit/sets';
import { autoStage } from './kit/autoStage';
import { PropView } from './props';
import { UIView, Subtitle, TEXT_FONT } from './ui';
import { loadFont as loadLocalFont } from '@remotion/fonts';
import { loadFont as loadLuckiest } from '@remotion/google-fonts/LuckiestGuy';
import { loadFont as loadLilita } from '@remotion/google-fonts/LilitaOne';
import { loadFont as loadBaloo } from '@remotion/google-fonts/Baloo2';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
/** Font Google co san (tai luc dung hinh): ten -> [ho font, do dam, nghieng, ham tai]. */
const GFONTS: Record<string, [string, number, boolean, () => void]> = {
  luckiest: ['Luckiest Guy', 400, false, () => loadLuckiest('normal', { weights: ['400'], subsets: ['latin'] })],
  lilita: ['Lilita One', 400, false, () => loadLilita('normal', { weights: ['400'], subsets: ['latin'] })],
  baloo: ['Baloo 2', 800, true, () => loadBaloo('normal', { weights: ['800'], subsets: ['latin'] })],
  fredoka: ['Fredoka', 700, true, () => loadFredoka('normal', { weights: ['700'], subsets: ['latin'] })],
};
import { staticFile } from 'remotion';
const LOADED_FONTS = new Set<string>();
import type { Project, ShotSpec, ActorSpec } from './types';

const PUSH: Record<string, number> = { wide: 0.05, medium: 0.05, close: 0.05, xclose: 0.04, insert: 0.06 };

const placeFor = (stage: (typeof STAGES)[string], a: ActorSpec, i: number, n: number): Place => {
  const u = a.spot ?? (n <= 1 ? 0.5 : i / (n - 1));
  const p = stage.place(clamp(u));
  const size = a.size ?? KID_SIZE[(a.cast as string) ?? ""] ?? 1;
  if (size === 1) return p;
  const feet = p.y + 140 * p.scale;
  return { x: p.x, y: feet - 140 * p.scale * size, scale: p.scale * size };
};

const rnd = (i: number, s = 1) => Math.abs(Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1;
const MOOD: Record<string, { poses: string[]; exprs: string[] }> = {
  idle: { poses: ['stand', 'relaxed', 'talk', 'look_around', 'arms_crossed', 'hands_hips', 'phone_ear'], exprs: ['neutral', 'neutral', 'happy', 'smug'] },
  watch: { poses: ['stand', 'relaxed', 'arms_crossed', 'think'], exprs: ['neutral', 'shock', 'neutral', 'wow'] },
  cheer: { poses: ['cheer', 'jump', 'fist_pump', 'victory', 'wave_both', 'clap'], exprs: ['happy', 'happy', 'wow'] },
  clap: { poses: ['clap', 'clap', 'clap', 'thumbs_up'], exprs: ['happy', 'happy', 'neutral'] },
  panic: { poses: ['panic', 'run', 'panic', 'hide'], exprs: ['shock', 'worried', 'shock'] },
  laugh: { poses: ['laugh', 'point_laugh', 'laugh', 'clap'], exprs: ['happy'] },
  walk: { poses: ['walk', 'walk', 'walk', 'phone_ear'], exprs: ['neutral', 'happy', 'neutral'] },
  talk: { poses: ['talk', 'talk', 'nod', 'laugh', 'shrug'], exprs: ['neutral', 'happy', 'smug'] },
  dance: { poses: ['dance', 'dance', 'bounce', 'clap'], exprs: ['happy', 'happy', 'wow'] },
  angry: { poses: ['shake_fist', 'stomp', 'arms_crossed', 'hands_hips'], exprs: ['angry', 'angry', 'oops'] },
};
const POP_EXTRAS = ['qc1', 'qc2', 'qc3', 'qc4', 'qc5', 'qc6', 'qc7', 'qc8', 'tuan', 'khoa', 'mai', 'minh', 'chi', 'hung', 'linh', 'gamethu'];
const CLASSIC_EXTRAS = ['mo', 'sis', 'mom', 'suit', 'pip', 'pipInk'];

/** Dam dong quan chung phia sau nhan vat chinh: hai hang, moi nguoi lech nhip, tu the theo tam trang. */
const Crowd: React.FC<{ n: number; mood: string; stage: (typeof STAGES)[string]; t: number; L: number; pop: boolean; hero?: Project['hero']; rim: string; avoid: number[]; palette?: string; ink?: boolean; inkStyle?: string }> = ({ n, mood, stage, t, L, pop, hero, rim, avoid, palette, ink, inkStyle }) => {
  const M = MOOD[mood] ?? MOOD.idle;
  const items = Array.from({ length: Math.min(30, Math.max(0, n)) }, (_, i) => {
    const row = i % 2;
    const u = clamp(((i * 0.618 + rnd(i, 3) * 0.15) % 1) * 1.2 - 0.1, -0.1, 1.1);
    const base = stage.place(clamp(u, 0, 1));
    const ext = u < 0 ? u * 900 : u > 1 ? (u - 1) * 900 : 0;
    const sc = base.scale * (row ? 0.56 : 0.68);
    const feet = base.y + 140 * base.scale - (row ? 150 : 85) * base.scale;
    const place = { x: base.x + ext + (rnd(i, 5) - 0.5) * 60, y: feet - 140 * sc, scale: sc };
    const pose = M.poses[Math.floor(rnd(i, 7) * M.poses.length)];
    const cast = pop ? POP_EXTRAS[Math.floor(rnd(i, 9) * POP_EXTRAS.length)] : CLASSIC_EXTRAS[i % CLASSIC_EXTRAS.length];
    const facing = mood === 'walk' || pose === 'run' ? (rnd(i, 11) > 0.5 ? 'right' : 'left') : (['right', 'left', 'front', 'right', 'left'] as const)[Math.floor(rnd(i, 13) * 5)];
    const to = pose === 'walk' || pose === 'run' ? { ...place, x: place.x + (facing === 'right' ? 1 : -1) * (pose === 'run' ? 700 : 300) * sc } : undefined;
    const a = { cast, pose, facing, expr: M.exprs[Math.floor(rnd(i, 17) * M.exprs.length)], to: undefined } as any;
    return { a, place, to, row, sc };
  }).filter((m) => !avoid.some((x) => Math.abs(x - m.place.x) < 90 * m.sc));
  items.sort((p, q) => q.row - p.row);
  return (
    <g style={{ filter: 'brightness(0.93) saturate(0.85)' }}>
      {items.map((m, i) => {
        const tt = t + Math.floor(rnd(i, 19) * 40);
        const pose = actorPose(m.a, m.place, tt, L + 40, undefined, m.to);
        return palette ? (
          <Doll key={i} L={ink ? inkify(dollLookFor(m.a, undefined, false, palette), false, m.a.cast, inkStyle) : dollLookFor(m.a, undefined, false, palette)} pose={pose as any} shadow={0.6} t={tt} talk={m.a.pose === 'talk' ? 1 : 0} />
        ) : pop ? (
          <Kid key={i} L={kidLookFor(m.a)} pose={pose as any} rimId={rim} shadow={0.6} t={tt} talk={m.a.pose === 'talk' ? 1 : 0} />
        ) : (
          <ActorView key={i} look={lookFor(m.a)} pose={{ ...pose, expr: (CLASSIC_EXPR[pose.expr as string] ?? pose.expr) as any }} rim={rim} shadow={0.6} />
        );
      })}
    </g>
  );
};

/** Canh tay nhan vat chinh dua vao khung tu goc tren ben phai (canh dac ta mat ban). */
const ArmIn: React.FC<{ look: Look; x: number; y: number; t: number; t0: number; pose: 'point' | 'open' }> = ({ look, x, y, t, t0, pose }) => {
  const k = easeOut(clamp((t - t0) / 8));
  const hx = lerp(x + 420, x, k);
  const hy = lerp(y - 620, y, k);
  const d = `M ${hx + 40} ${hy - 40} Q ${hx + 160} ${hy - 220} ${hx + 380} -360`;
  return (
    <g filter="url(#rimR)">
      <path d={d} stroke={look.line} strokeWidth={118} fill="none" strokeLinecap="round" />
      <path d={d} stroke={look.limb} strokeWidth={100} fill="none" strokeLinecap="round" />
      <g transform={`translate(${hx} ${hy}) rotate(40) scale(4.6)`}>
        {pose === 'point' ? <rect x={-4} y={10} width={8} height={24} rx={4} fill={look.hand} stroke={look.line} strokeWidth={2.4} /> : null}
        <path d="M -11 -2 Q -14 14 -6 18 L 7 18 Q 14 14 11 -2 Z" fill={look.hand} stroke={look.line} strokeWidth={2.6} strokeLinejoin="round" />
        <ellipse cx={-10} cy={6} rx={4.5} ry={7} fill={look.hand} stroke={look.line} strokeWidth={2.4} />
      </g>
    </g>
  );
};

const own = Object.prototype.hasOwnProperty;

export const makeShot = (shot: ShotSpec, project: Project, index: number): React.FC<ShotProps> => {
  // boi canh tu dung: ten khong co san -> tu ve nen theo ten (autoStage)
  const builtInPop = own.call(POP_STAGES, shot.set);
  const builtInClassic = own.call(STAGES, shot.set);
  const autoDef = !builtInPop && !builtInClassic && shot.set ? autoStage(shot.set) : null;
  const Shot: React.FC<ShotProps> = ({ t, len, f }) => {
    const isPopSet = builtInPop || !!autoDef;
    const stage = builtInPop ? POP_STAGES[shot.set] : builtInClassic ? STAGES[shot.set] : autoDef ?? STAGES.study;
    const doll = project.kit === 'doll' || project.kit === 'ink';
    const ink = project.kit === 'ink';
    const pop = (project.kit ?? 'classic') === 'pop' || doll;
    const palette = doll ? project.palette ?? 'goc' : undefined;
    MOTION.style = project.motion === 'giat' ? 'giat' : 'muot';
    const pf = (project as any).font as { family?: string; file?: string; google?: string } | undefined;
    const gf = pf?.google ? GFONTS[pf.google] : undefined;
    if (gf) {
      if (!LOADED_FONTS.has(gf[0])) {
        LOADED_FONTS.add(gf[0]);
        gf[3]();
      }
      TEXT_FONT.family = gf[0];
      TEXT_FONT.weight = gf[1];
      TEXT_FONT.italic = gf[2];
    } else if (pf && pf.family && pf.file) {
      if (!LOADED_FONTS.has(pf.family)) {
        LOADED_FONTS.add(pf.family);
        loadLocalFont({ family: pf.family, url: staticFile(pf.file) });
      }
      TEXT_FONT.family = pf.family;
      TEXT_FONT.weight = 400;
      TEXT_FONT.italic = false;
    } else {
      TEXT_FONT.family = '';
      TEXT_FONT.weight = 800;
      TEXT_FONT.italic = false;
    }
    const tod = shot.tod ?? (shot.night ? 'night' : undefined);
    const shotN = tod === 'night' && !isPopSet ? { ...shot, night: true } : shot;
    const L = Math.max(1, len);
    const k = clamp(t / L);
    const ctx: Ctx = { t: t + index * 37, k, len: L, shot: shotN, id: `b${index}`, fx: shot.fx2 ?? 0 };
    const actors = stage.actors ? shot.actors ?? [] : [];
    const n = actors.length;
    const placed = actors.map((a, i) => {
      const sitting = (a.pose === 'sit' || a.pose === 'sleep' || a.pose === 'lie') && !a.pose2;
      let place = sitting && stage.seat ? stage.seat(clamp(a.spot ?? (n <= 1 ? 0.5 : i / (n - 1)))) : placeFor(stage, a, i, n);
      if (sitting && stage.seat && a.pose !== 'sit') place = { ...place, y: place.y - 52 * place.scale };
      const to = a.to !== undefined && a.to !== null ? placeFor(stage, { ...a, spot: a.to }, i, n) : undefined;
      const pose = actorPose(a, place, t, L, stage.ground, to);
      // Nhan vat chinh = dien vien dau tien CHUA ghi cast, hoac ghi dung cast cua hero (vd 'nam'). Cast khac (chi, mai...) giu ve rieng.
      const isH = i === 0 && (!a.cast || a.cast === (project.hero?.cast ?? 'nam'));
      const look = lookFor(a, project.hero, isH);
      const kid = pop ? kidLookFor(a, project.hero, isH) : null;
      const dl0 = doll ? dollLookFor(a, project.hero, isH, palette) : null;
      const dl = dl0 && ink ? inkify(dl0, isH, a.cast ?? (i === 0 ? project.hero?.cast ?? 'nam' : ''), (project as any).inkStyle ?? '') : dl0;
      const cur = t >= Math.round(clamp(a.at ?? 0.35) * L) && a.pose2 ? a.pose2 : a.pose;
      const talk = cur === 'talk' || cur === 'laugh' ? 1 : 0;
      const stool = cur === 'sit' && !stage.seat;
      return { a, place, pose, look, kid, dl, talk, stool };
    });
    const main = placed[0];
    const props = shot.props ?? [];
    const propAt = (p: (typeof props)[number], i: number) => {
      const u = p.spot ?? (props.length <= 1 ? 0.5 : i / (props.length - 1));
      return p.on === 'floor' ? stage.floor(clamp(u)) : stage.surface(clamp(u));
    };

    // ---- may quay
    const cam = shot.cam ?? 'wide';
    let [cx, cy, z] = stage.wide(main?.place);
    if (main && (cam === 'medium' || cam === 'close' || cam === 'xclose')) {
      const p: Pose = main.pose;
      const s = p.scale;
      const head = headOf(p);
      const dir = p.yaw > 0.05 ? 1 : p.yaw < -0.05 ? -1 : 0;
      if (cam === 'medium') {
        z = 1080 / (560 * s);
        cx = p.x + dir * 70 * s;
        cy = p.y - (stage.mediumUp ?? 120) * s;
      } else if (cam === 'close') {
        z = 1080 / ((main.kid ? 360 : 330) * s);
        cx = head.x + dir * 40 * s;
        cy = head.y + (main.kid ? 52 : 40) * s;
      } else {
        z = 1080 / ((main.kid ? 290 : 250) * s);
        cx = head.x;
        cy = head.y + (main.kid ? 0 : 6) * s;
      }
    } else if (cam === 'insert' && props.length) {
      const pp = propAt(props[0], 0);
      z = stage.screen ? 1.25 : 3.0;
      cx = pp.x;
      cy = pp.y - 70 * pp.scale * (props[0].size ?? 1);
    }
    const mv = shot.move ?? 'none';
    if (mv === 'two' && placed.length > 1) {
      const xs = placed.map((m) => m.pose.x);
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const s0 = placed[0].pose.scale;
      z = Math.min(1080 / (520 * s0), 1920 / (hi - lo + 520 * s0));
      cx = (lo + hi) / 2;
      cy = placed[0].pose.y - 90 * s0;
    }
    if (mv === 'follow' && main) cx = main.pose.x + (main.pose.yaw > 0 ? 120 : main.pose.yaw < 0 ? -120 : 0) * main.pose.scale;
    let rot = 0;
    let push = shot.push ?? PUSH[cam] ?? 0.04;
    const zc = z;
    if (mv === 'zoom_in') push = 0.35;
    if (mv === 'zoom_out') push = 0;
    z = Math.max(z, 0.8) * (1 + push * easeInOut(k));
    if (mv === 'zoom_out') z = Math.max(zc, 0.8) * lerp(1.45, 1, easeOut(k));
    if (mv === 'crash') z = Math.max(zc, 0.8) * lerp(0.75, 1.08, easeOut(clamp(t / 6)));
    const span = 960 / z;
    if (mv === 'pan_left' || mv === 'pan_right') cx += (mv === 'pan_right' ? 1 : -1) * lerp(-0.22, 0.22, easeInOut(k)) * span;
    if (mv === 'tilt_up' || mv === 'tilt_down') cy += (mv === 'tilt_down' ? 1 : -1) * lerp(-0.25, 0.25, easeInOut(k)) * (540 / z);
    if (mv === 'whip') cx += lerp(-1.2, 0, easeOut(clamp(t / 7))) * span * 1.4;
    if (mv === 'handheld') {
      cx += (Math.sin(t * 0.21) * 9 + Math.sin(t * 0.53) * 4) / z;
      cy += (Math.cos(t * 0.17) * 7 + Math.sin(t * 0.47) * 3) / z;
      rot = Math.sin(t * 0.13) * 0.6;
    }
    if (mv === 'dutch') rot = 7;
    if (z > 1) {
      cx = clamp(cx, 960 / z - 200, 1920 - 960 / z + 200);
      cy = clamp(cy, 540 / z - 200, 1080 - 540 / z + 200);
    }
    const toScreen = (w: { x: number; y: number }) => ({ x: (w.x - cx) * z + 960, y: (w.y - cy) * z + 540 });

    const rim = shot.red && shot.red > 0.5 ? 'rimRed' : tod === 'night' || shot.night ? (pop ? 'popRimNight' : 'rimBlue') : tod === 'sunset' && pop ? 'popRimWarm' : pop && !isPopSet ? 'popRimWarm' : stage.rim;
    const shadow = stage.shadow ?? (stage.front ? 0 : 0.5);
    const blur = cam === 'xclose' ? 'url(#blur6)' : cam === 'close' ? 'url(#blur3)' : cam === 'insert' && !stage.screen ? 'url(#blur6)' : undefined;
    const grade = GRADES[project.grade ?? (pop ? 'pop' : 'none')] || undefined;
    const whipBlur = mv === 'whip' && t < 7 ? 'url(#popBlur7)' : undefined;
    const floorProps = props.map((p, i) => ({ p, i })).filter(({ p }) => p.on === 'floor');
    const topProps = props.map((p, i) => ({ p, i })).filter(({ p }) => p.on !== 'floor');
    const drawProp = ({ p, i }: { p: (typeof props)[number]; i: number }) => {
      const at = propAt(p, i);
      return <PropView key={`p${i}`} p={p} x={at.x} y={at.y} scale={at.scale} t={t} len={L} />;
    };
    const headScr = (ps: any) => {
      const h = headOf(ps);
      const c0 = toScreen(h);
      const top = toScreen({ x: h.x, y: h.y - 105 * (ps.scale ?? 1) });
      return { ...c0, r: Math.max(30, c0.y - top.y) };
    };
    const target = main ? headScr(main.pose) : props.length ? toScreen(propAt(props[0], 0)) : { x: 960, y: 480 };
    const handSpec = shot.hand;
    const handAt = handSpec ? stage.surface(clamp(handSpec.spot ?? 0.5)) : null;

    // ---- chuyen canh: hieu ung vao dau canh nay va ra cuoi canh (theo kieu cua canh sau)
    const tin = (shot as any).trans as string | undefined;
    const tnext = (project.shots[index + 1] as any)?.trans as string | undefined;
    const outT = L - t;
    let tx = 0;
    let tsc = 1;
    let trot = 0;
    let tblur = false;
    let flash = 0;
    let black = 0;
    let glitch = 0;
    // lia nhanh: phong to nhe de khong lo mep den, truot ngang + nhoe
    if (tin === 'whip' && t < 7) {
      const k = 1 - easeOut(t / 7);
      tx = k * 170;
      tsc = 1 + 0.2 * k;
      tblur = t < 5;
    }
    if (tnext === 'whip' && outT <= 4) {
      const k = (5 - outT) / 5;
      tx = -k * k * 170;
      tsc = 1 + 0.2 * k;
      tblur = outT <= 3;
    }
    if (tin === 'zoom' && t < 7) {
      tsc = lerp(1.35, 1, easeOut(t / 7));
      tblur = t < 3;
    }
    if (tnext === 'zoom' && outT < 3) tsc = lerp(1, 1.12, (3 - outT) / 3);
    if (tin === 'spin' && t < 8) {
      trot = lerp(-28, 0, easeOut(t / 8));
      tsc = lerp(1.45, 1, easeOut(t / 8));
      tblur = t < 4;
    }
    if (tin === 'flash' && t < 7) flash = 1 - t / 7;
    if (tin === 'fade' && t < 9) black = 1 - t / 9;
    if (tnext === 'fade' && outT < 9) black = Math.max(black, (9 - outT) / 9);
    if (tin === 'glitch' && t < 6) glitch = 1 - t / 6;
    if (tnext === 'glitch' && outT < 3) glitch = Math.max(glitch, (3 - outT) / 3);
    // ---- them kieu chuyen canh: truot, day len, gat mau, khep tron, vong mau, lat, chop trang, rem, rung, nhoe
    let ty = 0;
    let sx = 1;
    let white = 0;
    let irisR = -1;
    let discR = -1;
    let wipeA = -1;
    let wipeB = -1;
    let blinds = 0;
    const accent = ((project.hero as any)?.color as string) || '#FF7A45';
    const BGK = ['slide', 'pushup', 'flip', 'slideleft', 'slidedown', 'shrink', 'swirl'];
    const slideBg = BGK.includes(tin as string) || BGK.includes(tnext as string);
    let doors = 0;
    let diagA = -1;
    let pix = 0;
    let burn = 0;
    let heartR = -1;
    let starR = -1;
    let comic = 0;
    if (tin === 'slideleft' && t < 8) tx = -(1 - easeOut(t / 8)) * 1920;
    if (tnext === 'slideleft' && outT <= 6) tx = easeIn((6 - outT) / 6) * 1920;
    if (tin === 'slidedown' && t < 8) ty = -(1 - easeOut(t / 8)) * 1080;
    if (tnext === 'slidedown' && outT <= 6) ty = easeIn((6 - outT) / 6) * 1080;
    if (tin === 'shrink' && t < 8) tsc *= lerp(0.55, 1, easeOut(t / 8));
    if (tnext === 'shrink' && outT <= 6) tsc *= lerp(1, 0.55, easeIn((6 - outT) / 6));
    if (tin === 'swirl' && t < 10) {
      const e = easeOut(t / 10);
      trot += (1 - e) * -200;
      tsc *= lerp(0.15, 1, e);
    }
    if (tnext === 'swirl' && outT <= 7) {
      const e = easeIn((7 - outT) / 7);
      trot += e * 200;
      tsc *= lerp(1, 0.15, e);
    }
    if (tin === 'split' && t < 8) doors = 1 - easeOut(t / 8);
    if (tnext === 'split' && outT < 6) doors = Math.max(doors, easeIn((6 - outT) / 6));
    if (tin === 'diag' && t < 8) diagA = lerp(0, 2420, easeOut(t / 8));
    if (tnext === 'diag' && outT < 6) diagA = lerp(2420, 0, easeIn((6 - outT) / 6));
    if (tin === 'pixel' && t < 9) pix = 1 - t / 9;
    if (tnext === 'pixel' && outT < 7) pix = Math.max(pix, (7 - outT) / 7);
    if (tin === 'burn' && t < 10) burn = 1 - t / 10;
    if (tnext === 'burn' && outT < 7) burn = Math.max(burn, (7 - outT) / 7);
    if (tin === 'heart' && t < 11) heartR = 1500 * easeIn(t / 11);
    if (tnext === 'heart' && outT < 9) heartR = 1500 * easeOut(outT / 9);
    if (tin === 'star' && t < 11) starR = 1700 * easeIn(t / 11);
    if (tnext === 'star' && outT < 9) starR = 1700 * easeOut(outT / 9);
    if (tin === 'comic' && t < 8) comic = 1 - t / 8;
    if (tnext === 'comic' && outT < 6) comic = Math.max(comic, (6 - outT) / 6);
    const heartD = (cx: number, cy: number, r: number) => {
      const P = (x: number, y: number) => `${(cx + x * r).toFixed(1)} ${(cy + y * r).toFixed(1)}`;
      return `M${P(0, -0.35)} C${P(0.1, -0.75)} ${P(0.95, -0.75)} ${P(0.95, -0.2)} C${P(0.95, 0.25)} ${P(0.4, 0.55)} ${P(0, 0.9)} C${P(-0.4, 0.55)} ${P(-0.95, 0.25)} ${P(-0.95, -0.2)} C${P(-0.95, -0.75)} ${P(-0.1, -0.75)} ${P(0, -0.35)} Z`;
    };
    const starD = (cx: number, cy: number, r: number, rot: number) => {
      let d = '';
      for (let k = 0; k < 10; k++) {
        const ang = rot + (k * Math.PI) / 5 - Math.PI / 2;
        const rr = k % 2 ? r * 0.45 : r;
        d += `${k ? 'L' : 'M'}${(cx + Math.cos(ang) * rr).toFixed(1)} ${(cy + Math.sin(ang) * rr).toFixed(1)} `;
      }
      return d + 'Z';
    };
    if (tin === 'slide' && t < 8) tx = (1 - easeOut(t / 8)) * 1920;
    if (tnext === 'slide' && outT <= 6) tx = -easeIn((6 - outT) / 6) * 1920;
    if (tin === 'pushup' && t < 8) ty = (1 - easeOut(t / 8)) * 1080;
    if (tnext === 'pushup' && outT <= 6) ty = -easeIn((6 - outT) / 6) * 1080;
    if (tin === 'flip' && t < 7) sx = Math.max(0.001, easeOut(t / 7));
    if (tnext === 'flip' && outT <= 5) sx = Math.max(0.001, 1 - easeIn((5 - outT) / 5));
    if (tin === 'dipwhite' && t < 9) white = 1 - t / 9;
    if (tnext === 'dipwhite' && outT < 8) white = Math.max(white, (8 - outT) / 8);
    if (tin === 'iris' && t < 10) irisR = 1150 * easeIn(t / 10);
    if (tnext === 'iris' && outT < 8) irisR = 1150 * easeOut(outT / 8);
    if (tin === 'circle' && t < 8) discR = 1150 * (1 - easeOut(t / 8));
    if (tnext === 'circle' && outT < 7) discR = 1150 * easeIn((7 - outT) / 7);
    if (tin === 'wipe' && t < 7) { wipeA = 1920 * easeOut(t / 7); wipeB = 1920; }
    if (tnext === 'wipe' && outT < 6) { wipeA = 1920 * (1 - easeIn((6 - outT) / 6)); wipeB = 1920; }
    if (tin === 'blinds' && t < 9) blinds = 1 - easeOut(t / 9);
    if (tnext === 'blinds' && outT < 7) blinds = Math.max(blinds, easeIn((7 - outT) / 7));
    if (tin === 'shake' && t < 10) {
      const k = 1 - t / 10;
      tx += Math.sin(t * 2.7) * 34 * k;
      ty += Math.cos(t * 3.3) * 26 * k;
      trot += Math.sin(t * 1.9) * 2.2 * k;
      tsc = Math.max(tsc, 1 + 0.08 * k);
    }
    if (tin === 'blur' && t < 7) {
      tblur = true;
      tsc = Math.max(tsc, lerp(1.1, 1, t / 7));
      black = Math.max(black, 0.35 * (1 - t / 7));
    }
    if (tnext === 'blur' && outT < 5) tblur = true;
    const gx = glitch ? Math.round(Math.sin(t * 7.3) * 40 * glitch) : 0;
    const transT = `translate(${tx + gx} ${ty}) translate(960 540) rotate(${trot}) scale(${tsc * sx} ${tsc}) translate(-960 -540)`;
    const ic = target;
    return (
      <g>
        {slideBg ? <rect x={0} y={0} width={1920} height={1080} fill={accent} /> : null}
        <PopDefs />
        {doll ? <DollDefs /> : null}
        <g transform={transT} filter={tblur ? 'url(#popBlur7)' : undefined}>
        <g style={grade ? { filter: grade } : undefined}>
        <g transform={`rotate(${rot} 960 540)`} filter={whipBlur}>
        <g transform={camT(cx, cy, z)}>
          {blur ? <g filter={blur}>{stage.back(ctx)}</g> : stage.back(ctx)}
          {tod ? <TodWash tod={tod} classic={!isPopSet} /> : null}
          {floorProps.map(drawProp)}
          {shot.crowd ? <Crowd n={shot.crowd} mood={shot.crowdMood ?? 'idle'} stage={stage} t={t} L={L} pop={pop} hero={project.hero} rim={rim} avoid={placed.map((m) => m.place.x)} palette={palette} ink={ink} inkStyle={(project as any).inkStyle ?? ''} /> : null}
          {placed.filter((m) => m.stool).map((m, i) => (
            <g key={`st${i}`} transform={`translate(${m.place.x} ${m.place.y + 70 * m.place.scale}) scale(${m.place.scale})`}>
              <rect x={-58} y={0} width={116} height={22} rx={10} fill="#FF8A65" stroke="#1B1530" strokeWidth={4} />
              <path d="M -44 22 L -52 140 M 44 22 L 52 140 M -48 90 L 48 90" stroke="#1B1530" strokeWidth={8} strokeLinecap="round" />
            </g>
          ))}
          {[...placed].reverse().map((m, i) =>
            m.dl ? (
              <Doll key={`a${i}`} L={m.dl} pose={m.pose as any} shadow={shadow} t={t} talk={m.talk} />
            ) : m.kid ? (
              <Kid key={`a${i}`} L={m.kid} pose={m.pose as any} rimId={rim} shadow={shadow} t={t} talk={m.talk} />
            ) : (
              <ActorView key={`a${i}`} look={m.look} pose={{ ...m.pose, expr: (CLASSIC_EXPR[m.pose.expr as string] ?? m.pose.expr) as any }} rim={rim} shadow={shadow} />
            ),
          )}
          {stage.front ? <g style={tod === 'night' && isPopSet ? { filter: 'brightness(0.62) saturate(0.85)' } : undefined}>{stage.front(ctx, main?.place)}</g> : null}
          {topProps.map(drawProp)}
          {handSpec && handAt && main === undefined ? (
            <ArmIn look={(pop ? kidLookFor({}, project.hero, true) : lookFor({}, project.hero, true)) as any} x={handAt.x + 60} y={handAt.y - 120} t={t} t0={Math.round(clamp(handSpec.at ?? 0.15) * L)} pose={handSpec.pose ?? 'point'} />
          ) : null}
        </g>
        </g>
        </g>
        <WeatherFx kind={shot.weather} t={t} />
        {(shot.ui ?? []).map((u, i) => {
          const who = (u as any).who as number | undefined;
          const tg = who !== undefined && placed[who] ? headScr(placed[who].pose) : target;
          return <UIView key={`u${i}`} u={u} t={t} len={L} f={f} target={tg} k={k} pop={pop} />;
        })}
        {(project as any).subs && shot.line ? <Subtitle text={shot.line} t={t} /> : null}
        </g>
        {glitch > 0 ? (
          <g style={{ mixBlendMode: 'screen' }} opacity={glitch}>
            {[0, 1, 2, 3, 4].map((i) => {
              const y = ((i * 263 + Math.floor(t) * 137) % 1000) + 20;
              return <rect key={i} x={-40 + ((i * 97 + t * 50) % 80)} y={y} width={2000} height={18 + (i % 3) * 22} fill={['#FF2E88', '#2EE6FF', '#B6FF2E'][i % 3]} opacity={0.55} />;
            })}
          </g>
        ) : null}
        {flash > 0 ? <rect x={0} y={0} width={1920} height={1080} fill="#FFFFFF" opacity={flash} /> : null}
        {black > 0 ? <rect x={0} y={0} width={1920} height={1080} fill="#000000" opacity={Math.min(1, black)} /> : null}
        {white > 0 ? <rect x={0} y={0} width={1920} height={1080} fill="#FFFFFF" opacity={Math.min(1, white)} /> : null}
        {irisR >= 0 ? (
          <path fillRule="evenodd" fill="#000000"
            d={`M-10 -10H1930V1090H-10Z M${ic.x - irisR} ${ic.y} a${irisR} ${irisR} 0 1 0 ${2 * irisR} 0 a${irisR} ${irisR} 0 1 0 ${-2 * irisR} 0Z`} />
        ) : null}
        {discR > 0 ? (
          <g>
            <circle cx={960} cy={540} r={discR + 26} fill="#1B1530" />
            <circle cx={960} cy={540} r={discR} fill={accent} />
          </g>
        ) : null}
        {wipeA >= 0 && wipeB > wipeA ? (
          <g>
            <rect x={wipeA} y={-10} width={wipeB - wipeA + 10} height={1100} fill={accent} />
            <rect x={wipeA - 34} y={-10} width={34} height={1100} fill="#1B1530" />
          </g>
        ) : null}
        {doors > 0 ? (
          <g>
            <rect x={0} y={-10} width={960 * doors} height={1100} fill={accent} />
            <rect x={1920 - 960 * doors} y={-10} width={960 * doors} height={1100} fill={accent} />
            <rect x={960 * doors - 14} y={-10} width={14} height={1100} fill="#1B1530" />
            <rect x={1920 - 960 * doors} y={-10} width={14} height={1100} fill="#1B1530" />
          </g>
        ) : null}
        {diagA >= 0 && diagA < 2420 ? (
          <g>
            <polygon points={`${diagA},-10 2600,-10 2600,1090 ${diagA - 520},1090`} fill={accent} />
            <polygon points={`${diagA - 40},-10 ${diagA},-10 ${diagA - 520},1090 ${diagA - 560},1090`} fill="#1B1530" />
          </g>
        ) : null}
        {pix > 0 ? (
          <g fill="#1B1530">
            {Array.from({ length: 144 }, (_, k) => {
              const hh = Math.sin(k * 12.9898 + 4.1) * 43758.5453;
              const th = hh - Math.floor(hh);
              return pix > th ? <rect key={`px${k}`} x={(k % 16) * 120} y={Math.floor(k / 16) * 120} width={121} height={121} /> : null;
            })}
          </g>
        ) : null}
        {burn > 0 ? (
          <g>
            <defs>
              <radialGradient id="sbBurn" cx="0.78" cy="0.3" r="0.9">
                <stop offset="0" stopColor="#FFFFFF" />
                <stop offset="0.25" stopColor="#FFE08A" />
                <stop offset="0.55" stopColor="#FF8A3D" />
                <stop offset="1" stopColor="#B3261E" stopOpacity={0.2} />
              </radialGradient>
            </defs>
            <rect x={0} y={0} width={1920} height={1080} fill="url(#sbBurn)" opacity={Math.min(1, burn * 1.15)} />
          </g>
        ) : null}
        {heartR >= 0 ? <path fillRule="evenodd" fill="#1B1530" d={`M-10 -10H1930V1090H-10Z ${heartD(ic.x, ic.y, heartR)}`} /> : null}
        {starR >= 0 ? <path fillRule="evenodd" fill="#1B1530" d={`M-10 -10H1930V1090H-10Z ${starD(ic.x, ic.y, starR, t * 0.06)}`} /> : null}
        {comic > 0 ? (
          <g opacity={Math.min(1, comic * 1.2)}>
            <rect x={0} y={0} width={1920} height={1080} fill="#FFE3C8" />
            {Array.from({ length: 18 }, (_, k) => {
              const a0 = (k / 18) * Math.PI * 2 + t * 0.05;
              const a1 = a0 + Math.PI / 18;
              return <polygon key={`cr${k}`} fill={accent} points={`960,540 ${960 + Math.cos(a0) * 2400},${540 + Math.sin(a0) * 2400} ${960 + Math.cos(a1) * 2400},${540 + Math.sin(a1) * 2400}`} />;
            })}
          </g>
        ) : null}
        {blinds > 0 ? (
          <g fill="#000000">
            {Array.from({ length: 8 }, (_, i) => (
              <rect key={`bl${i}`} x={0} y={i * 135} width={1920} height={Math.min(136, 136 * blinds)} />
            ))}
          </g>
        ) : null}
      </g>
    );
  };
  return Shot;
};
