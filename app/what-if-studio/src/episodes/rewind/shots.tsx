import React from 'react';
import {
  Hero, Cat, Mug, C, Pose, basePose, poseAt, kf, clamp, lerp, easeOut, easeIn, backOut, joints, toWorld, reachAngle, LEG_LEN, faceAt, LOOKS, HEAD,
  Foreground, camT, Sparkle, Tag, FocusRings, DizzyStars, TitleCard, walkPose, stepTop, hipGround,
  Study, Desk, Stairwell, Banister, Classroom, SchoolDesk, Rooftop, Kid, S3, Glow, rnd, ShotProps,
} from '../../engine';

/** Pip in look B, the dark hoodie (the cast sheet's options A, B, C are LOOKS.pip, LOOKS.pipHood, LOOKS.pipInk). */
const PIP = LOOKS.pipHood;

// The example episode, "What if you could rewind 10 seconds?" (the proof clip, built 21 Oct 2026). Twelve shots on
// four sets. Each shot is a pure function of its own clock t (frames), so the edit plays three of them backwards.

// ---------- SH1: the room, wide ----------
export const Sh1: React.FC<ShotProps> = ({ t }) => {
  const pose = poseAt(t, [
    { f: 0, p: { x: 960, y: 712, yaw: 0.5, armR: { a: 14, b: -6 }, look: 0.6 } },
    { f: 6, p: { armR: { a: 58, b: 0 } }, ease: easeOut },
    { f: 22, p: { armR: { a: 50, b: -4 } } },
  ]);
  const wob = t > 6 ? Math.sin((t - 6) * 1.4) * 6 * Math.exp(-(t - 6) / 8) : 0;
  return (
    <g transform={camT(990, 545, kf(t, [[0, 0.86], [22, 0.93]]))}>
      <Study t={t} id="sh1" veil={0.28} />
      <Hero look={PIP} pose={{ ...pose, ...faceAt(t, [[0, 'neutral']]) }} shadow={0} rimId="rimR" />
      <Desk x0={560} x1={1360} y={700} />
      <Foreground blur={10}>
        <path d="M -140 1220 L -140 860 Q -128 786 -30 786 L 236 786 Q 322 786 334 862 L 344 1220 Z" fill="#140F1A" />
        <path d="M 222 856 Q 368 846 388 932 L 398 1220 L 222 1220 Z" fill="#0F0B14" />
        <path d="M -60 790 Q 110 776 262 790" stroke="#FFB46A" strokeWidth={4} fill="none" opacity={0.35} />
        {[[1790, 1160, -150, -330], [1880, 1180, -40, -380], [1960, 1150, -210, -250], [1840, 1200, 90, -300]].map(([x, y, dx, dy], i) => (
          <path key={i} d={`M ${x} ${y} Q ${x + dx * 0.2} ${y + dy * 0.6} ${x + dx} ${y + dy} Q ${x + dx * 0.6} ${y + dy * 0.3} ${x} ${y} Z`} fill="#0E1610" />
        ))}
      </Foreground>
      <Mug x={1120 + clamp((t - 6) / 16) * 40} y={700} rot={wob} f={t} />
    </g>
  );
};

// ---------- SH2: high angle over the desk's front edge: the mug goes over and shrinks as it falls away ----------
const EDGE = 640;
const hand2 = (t: number) => ({ x: kf(t, [[0, 760], [5, 962], [12, 890]]), y: kf(t, [[0, 250], [5, 372], [12, 300]]) });
const mugHi = (t: number) => {
  if (t < 3) return { x: 1010, y: 470, r: 0, s: 1 };
  if (t < 9) {
    const p = easeOut((t - 3) / 6);
    return { x: lerp(1010, 1060, p), y: lerp(470, EDGE - 4, p), r: 0, s: 1 };
  }
  if (t < 13) {
    const p = (t - 9) / 4;
    return { x: 1060 + 12 * p, y: EDGE - 4 + 24 * p, r: 75 * easeIn(p), s: 1 };
  }
  const p = (t - 13) / 9;
  return { x: 1072 + 70 * p, y: EDGE + 20 + 60 * p + 360 * p * p, r: 75 + 190 * p, s: lerp(1, 0.4, p) };
};
/** The mug from above: a squat cylinder with the coffee showing; x, y is the middle of its base. */
const MugHi: React.FC<{ x: number; y: number; r: number; s: number; t: number }> = ({ x, y, r, s, t }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <ellipse cx={0} cy={0} rx={78} ry={40} fill="#D9D2C6" />
    <rect x={-78} y={-118} width={156} height={118} fill="#F4F1EA" />
    <path d="M -78 -64 Q 0 -28 78 -64 L 78 -40 Q 0 -4 -78 -40 Z" fill={C.orange} />
    <path d="M 74 -96 Q 136 -100 128 -56 Q 120 -22 74 -30" stroke="#F4F1EA" strokeWidth={20} fill="none" />
    <ellipse cx={0} cy={-118} rx={78} ry={40} fill="#E8E2D6" />
    <ellipse cx={0} cy={-116} rx={66} ry={32} fill="#5B3A26" />
    <ellipse cx={-14} cy={-122} rx={22} ry={8} fill="#8A5A3A" opacity={0.7} />
    <rect x={-78} y={-118} width={6} height={118} fill="#FFFFFF" opacity={0.5} />
    {r < 5
      ? [0, 1].map((i) => (
          <path key={i} d={`M ${-14 + i * 26} -150 q ${-12 + Math.sin(t / 6 + i) * 6} -20 ${Math.sin(t / 9 + i) * 4} -40 q ${12 + Math.sin(t / 5 + i * 2) * 6} -20 ${Math.sin(t / 8 + i) * 6} -40`} stroke="#fff" strokeWidth={6} fill="none" strokeLinecap="round" opacity={0.35 + 0.2 * Math.sin(t / 5 + i)} />
        ))
      : null}
  </g>
);
const grainX = (gx: number, y: number) => gx + (960 - gx) * ((EDGE - y) / (EDGE + 1600));
export const Sh2: React.FC<ShotProps> = ({ t }) => {
  const m = mugHi(t);
  const h = hand2(t);
  const onDesk = t < 13;
  return (
    <g transform={camT(960, kf(t, [[0, 520], [22, 560]]), kf(t, [[0, 1.0], [22, 1.05]]))}>
      {/* the floor far below, past the front edge, out of focus */}
      <g filter="url(#blur3)">
        <rect x={-400} y={EDGE} width={2720} height={900} fill="#2E2228" />
        {Array.from({ length: 40 }).map((_, i) => {
          const x = -500 + i * 72;
          return <path key={i} d={`M ${x} ${EDGE + 90} L ${960 + (x - 960) * 1.5} 1400`} stroke="#22181D" strokeWidth={3} />;
        })}
        <path d="M -400 1010 L 760 880 L 900 1400 L -400 1400 Z" fill="#4A2C3A" />
        <path d="M -400 1040 L 740 914 L 860 1400" stroke="#6A4252" strokeWidth={8} fill="none" />
        <rect x={-400} y={EDGE + 24} width={1640} height={70} fill="#33231F" />
        <rect x={1240} y={EDGE + 24} width={440} height={150} fill="#43302B" />
        {[0, 1, 2].map((k) => (
          <rect key={k} x={1256} y={EDGE + 32 + k * 46} width={408} height={38} rx={3} fill="#4E3832" />
        ))}
      </g>
      {/* the desk top: wood grain running away from us, things on it, the lamp's warm pool */}
      <rect x={-400} y={-400} width={2720} height={EDGE + 400} fill="#6B4B42" />
      {Array.from({ length: 30 }).map((_, i) => {
        const gx = -800 + i * 130;
        return <path key={i} d={`M ${gx} ${EDGE} L ${grainX(gx, -400)} -400`} stroke="#5C4038" strokeWidth={i % 3 ? 2 : 4} opacity={0.75} />;
      })}
      <Glow x={1080} y={430} r={620} o={0.32} />
      <g transform="rotate(-6 520 220)">
        <rect x={290} y={70} width={460} height={290} rx={16} fill="#24222E" />
        <rect x={290} y={58} width={460} height={20} rx={8} fill="#17151E" />
        <path d="M 300 60 L 740 60" stroke="#9FC0FF" strokeWidth={3} opacity={0.7} />
        {Array.from({ length: 5 }).map((_, r) =>
          Array.from({ length: 12 }).map((__, c) => <rect key={`k${r}-${c}`} x={318 + c * 34} y={100 + r * 30} width={28} height={24} rx={4} fill="#33313E" />),
        )}
        <rect x={440} y={262} width={160} height={78} rx={8} fill="#2C2A37" />
      </g>
      <Glow x={520} y={70} r={260} kind="cool" o={0.35} />
      <g transform="rotate(8 1380 330)">
        <rect x={1240} y={220} width={280} height={200} rx={6} fill="#EFE6D4" />
        {[0, 1, 2, 3, 4].map((k) => (
          <path key={k} d={`M 1262 ${262 + k * 30} L 1500 ${262 + k * 30}`} stroke="#B9C4D6" strokeWidth={3} />
        ))}
        <rect x={1300} y={380} width={190} height={12} rx={6} fill="#3E4A62" transform="rotate(-12 1395 386)" />
      </g>
      <rect x={760} y={540} width={86} height={86} fill="#E9C46A" transform="rotate(-10 803 583)" />
      <rect x={1470} y={520} width={150} height={10} rx={5} fill="#C0392B" transform="rotate(24 1545 525)" />
      <circle cx={1660} cy={110} r={56} fill="#1C1620" />
      <path d="M 1660 110 L 1760 -300" stroke="#1C1620" strokeWidth={14} />
      {/* the front edge, lit */}
      <rect x={-400} y={EDGE} width={2720} height={24} fill="#7A5747" />
      <rect x={-400} y={EDGE} width={2720} height={3} fill={S3.warm} opacity={0.7} />
      {onDesk ? <ellipse cx={m.x + 18} cy={m.y + 8} rx={96} ry={34} fill="#000" opacity={0.3} /> : null}
      {/* Pip's arm comes in from across the desk */}
      <g filter="url(#rimR)">
        <path d={`M ${h.x - 20} ${h.y - 24} Q ${h.x - 240} ${h.y - 220} ${h.x - 400} -260`} stroke={PIP.line} strokeWidth={66} fill="none" strokeLinecap="round" />
        <path d={`M ${h.x - 20} ${h.y - 24} Q ${h.x - 240} ${h.y - 220} ${h.x - 400} -260`} stroke={PIP.limb} strokeWidth={52} fill="none" strokeLinecap="round" />
        <circle cx={h.x} cy={h.y} r={42} fill={PIP.hand} stroke={PIP.line} strokeWidth={6} />
      </g>
      <g filter="url(#rimR)">
        <MugHi x={m.x} y={m.y} r={m.r} s={m.s} t={t} />
      </g>
      {t > 13
        ? [0, 1, 2, 3, 4].map((k) => (
            <ellipse key={k} cx={m.x - 40 + k * 22} cy={m.y - 90 * m.s - k * 26 * (1 + (t - 13) / 9)} rx={9 * m.s + 3} ry={12 * m.s + 3} fill="#6B4228" opacity={0.9} />
          ))
        : null}
    </g>
  );
};

// ---------- SH3: the floor, the smash ----------
const SHARDS3 = Array.from({ length: 14 }).map((_, i) => ({
  vx: (rnd(1, i) - 0.5) * 34,
  vy: 6 + rnd(2, i) * 16,
  s: 0.6 + rnd(3, i) * 0.9,
  r0: rnd(4, i) * 360,
  spin: (rnd(5, i) - 0.5) * 90,
  h: rnd(6, i) * 6,
}));
const DROPS = Array.from({ length: 12 }).map((_, i) => ({ vx: (rnd(7, i) - 0.5) * 26, vy: 10 + rnd(8, i) * 14, r: 2 + rnd(9, i) * 4 }));
export const Sh3: React.FC<ShotProps> = ({ t }) => {
  const falling = t < 2;
  const dt = Math.max(0, t - 2);
  return (
    <g transform={camT(960, 640, 1.0)}>
      <g filter="url(#blur10)">
        <Study t={t + 44} id="sh3" />
      </g>
      <rect x={-400} y={760} width={2720} height={700} fill="#3A2A2E" />
      {Array.from({ length: 14 }).map((_, i) => (
        <path key={i} d={`M ${960 + (i - 7) * 60} 760 L ${960 + (i - 7) * 420} 1300`} stroke="#22181D" strokeWidth={6} />
      ))}
      <rect x={-400} y={760} width={2720} height={700} fill="url(#g3fadeDown)" />
      <rect x={-400} y={756} width={2720} height={6} fill="#FFB36B" opacity={0.5} />
      {falling ? (
        <g transform="translate(960 0) scale(3) translate(-960 0)">
          <Mug x={960} y={lerp(-40, 283, t / 2)} rot={200 + t * 30} f={t} steam={0} />
        </g>
      ) : (
        <g transform="translate(960 850) scale(3) translate(-960 -850)">
          <ellipse cx={960} cy={856} rx={Math.min(150, 26 * dt)} ry={Math.min(26, 5 * dt)} fill="#5B3A26" />
          <ellipse cx={952} cy={853} rx={Math.min(90, 16 * dt)} ry={Math.min(12, 2.4 * dt)} fill="#8A5A3A" opacity={0.6} />
          {/* coffee splash: droplets thrown up and out */}
          {DROPS.map((d, i) => {
            const x = 960 + d.vx * dt;
            const y = 846 - d.vy * dt + 1.9 * dt * dt;
            return y < 858 ? <ellipse key={`d${i}`} cx={x} cy={y} rx={d.r} ry={d.r * 1.3} fill="#6B4228" /> : null;
          })}
          {SHARDS3.map((s, i) => {
            const x = 960 + s.vx * dt;
            const y = Math.min(856 - s.h, 846 - s.vy * dt + 2.2 * dt * dt);
            return <path key={i} transform={`translate(${x} ${y}) rotate(${s.r0 + dt * s.spin}) scale(${s.s})`} d="M -14 -10 L 12 -14 L 16 8 L -8 12 Z" fill={i % 4 === 0 ? C.orange : '#F4F1EA'} stroke={C.ink} strokeWidth={2.4} />;
          })}
        </g>
      )}
    </g>
  );
};

// ---------- SH4: medium, the catch ----------
const SH4_KEYS = [
  { f: 0, p: { x: 860, y: 712, yaw: 0.45, look: 1, armL: { a: 14, b: -6 } } },
  { f: 2, p: { x: 846, tilt: -8, sway: -8 } },
  { f: 6, p: { x: 960, tilt: 24, sway: 14 }, ease: easeOut },
  { f: 8, p: { x: 972, tilt: 30, sway: 10 } },
  { f: 14, p: { x: 920, tilt: 0, yaw: 0.2, look: 0, sway: -6 } },
  { f: 18, p: { sway: 3 } },
  { f: 24, p: { x: 915, sway: 0 } },
];
const SH4_AIM = { x: 1170, y: 770 };
// where the hand is at the catch (t 6), so the falling mug lands exactly in it
const sh4Catch = (() => {
  const p6 = poseAt(6, SH4_KEYS);
  const p = { ...p6, armR: { a: reachAngle(p6, SH4_AIM), b: 0 } };
  const h = toWorld(p, joints(p).armR.end);
  return { x: h.x + 6, y: h.y + 34 };
})();
export const Sh4: React.FC<ShotProps> = ({ t }) => {
  const lunge = poseAt(t, SH4_KEYS);
  const fallP = clamp(t / 6);
  const fall = { x: lerp(sh4Catch.x + 24, sh4Catch.x, fallP), y: lerp(sh4Catch.y - 70, sh4Catch.y, fallP * fallP), r: 40 + 30 * fallP };
  let armR = { a: reachAngle(lunge, SH4_AIM), b: 0 };
  let mug = fall;
  if (t >= 6) {
    const k = easeOut(clamp((t - 6) / 8));
    const aim = reachAngle(poseAt(6, SH4_KEYS), SH4_AIM);
    armR = { a: lerp(aim, 28, k), b: lerp(0, 118, k) };
    const p2 = { ...lunge, armR };
    const hand = toWorld(p2, joints(p2).armR.end);
    mug = { x: hand.x + 6, y: hand.y + 34, r: lerp(70, 0, k) };
  }
  const squash = t >= 6 && t < 12 ? 0.09 * Math.sin(((t - 6) / 6) * Math.PI) : 0;
  const face = faceAt(t, [[0, 'shock'], [14, 'smug']]);
  return (
    <g transform={camT(kf(t, [[0, 1000], [24, 960]]), kf(t, [[0, 600], [24, 580]]), kf(t, [[0, 1.75], [24, 1.95]]))}>
      <Study t={t + 80} id="sh4" />
      <Hero look={PIP} pose={{ ...lunge, armR, squash, ...face }} shadow={0} rimId="rimR" />
      <Desk x0={520} x1={Math.round(sh4Catch.x) - 10} y={700} lamp={false} />
      <Mug x={mug.x} y={mug.y} rot={mug.r} f={t} steam={mug.r < 5 ? 1 : 0} />
      <Sparkle x={1040} y={470} t={t - 15} s={0.9} />
      <Foreground blur={10}>
        <rect x={440} y={800} width={220} height={40} rx={6} fill="#120D16" />
        <rect x={452} y={762} width={200} height={40} rx={6} fill="#17111C" />
        <rect x={446} y={724} width={190} height={40} rx={6} fill="#120D16" />
        <path d="M 452 724 L 636 724" stroke="#FFB46A" strokeWidth={3} opacity={0.4} />
        <path d="M 1640 900 Q 1520 700 1560 520 Q 1600 700 1700 880 Z" fill="#0E1610" />
      </Foreground>
    </g>
  );
};

const SC = 0.9;
const walkP = (x: number, phase: number, extra: Partial<Pose> = {}): Pose => walkPose(x, phase, hipGround, SC, extra);
const CATX = 800;

// ---------- SH5: wide, the trip ----------
const sh5Pose = (tIn: number): Pose => {
  if (tIn < 13) return { ...walkP(lerp(320, 700, tIn / 13), tIn * 0.6), ...faceAt(tIn, [[0, 'neutral']]) };
  // the beat where he knows: a two-frame hold, caught mid-step, before the fall
  if (tIn < 15) return { ...walkP(700, 13 * 0.6), tilt: 16, sway: 14, armL: { a: 70, b: 30 }, armR: { a: 60, b: 20 }, ...faceAt(tIn, [[0, 'shock']]) };
  const t = tIn - 2;
  const p = clamp((t - 13) / 23);
  const x = lerp(700, 1320, easeIn(p) * 0.4 + p * 0.6);
  const y0 = hipGround(700) - LEG_LEN * SC;
  const y = lerp(y0, 830, p * p) - Math.sin(p * Math.PI) * 50;
  return {
    ...basePose,
    x,
    y,
    scale: SC,
    yaw: 1,
    spin: t < 20 ? lerp(0, 40, (t - 13) / 7) : lerp(40, 420, (t - 20) / 16),
    armL: { a: 150, b: 20 },
    armR: { a: 150, b: 20 },
    legL: { a: 40, b: -60 },
    legR: { a: -30, b: -40 },
    ...faceAt(t, [[0, 'neutral'], [14, 'shock']]),
  };
};
export const Sh5: React.FC<ShotProps> = ({ t }) => {
  const pose = sh5Pose(t);
  return (
    <g transform={camT(clamp(pose.x + 80, 760, 1200) + (t >= 13 && t < 17 ? Math.sin(t * 3.1) * 7 : 0), clamp(pose.y - 60, 420, 640), 1.12)}>
      <Stairwell t={t} id="sh5" />
      <Cat x={CATX} y={stepTop(CATX)} mood={t >= 13 ? 'alert' : 'sleep'} f={t} />
      <Hero look={PIP} pose={pose} shadow={pose.spin === 0 ? 0.5 : 0} rimId="rimR" />
      <Banister />
    </g>
  );
};

// ---------- SH6: top-down, the floor at the foot of the stairs ----------
const LandingFloor: React.FC = () => (
  <g>
    <defs>
      <clipPath id="sh6light">
        <path d="M 1150 180 L 1720 300 L 1560 980 L 990 860 Z" />
      </clipPath>
    </defs>
    {Array.from({ length: 26 }).map((_, i) => {
      const y = -400 + i * 74;
      return (
        <g key={i}>
          <rect x={-400} y={y} width={2720} height={74} fill={['#4E3833', '#47322D', '#4B3631'][i % 3]} />
          <path d={`M -400 ${y} L 2320 ${y}`} stroke="#2E211E" strokeWidth={3} />
          {[0, 1, 2].map((k) => {
            const jx = -200 + ((i * 397 + k * 811) % 2400);
            return <path key={k} d={`M ${jx} ${y} L ${jx} ${y + 74}`} stroke="#2E211E" strokeWidth={3} />;
          })}
        </g>
      );
    })}
    <ellipse cx={240} cy={1000} rx={440} ry={310} fill="#4A2C3A" />
    <ellipse cx={240} cy={1000} rx={386} ry={266} fill="none" stroke="#6A4252" strokeWidth={10} />
    {/* sun from the arched window lands on the floor, crossed by the window bars */}
    <g filter="url(#blur16)">
      <path d="M 1150 180 L 1720 300 L 1560 980 L 990 860 Z" fill="#FFB46A" opacity={0.22} style={{ mixBlendMode: 'screen' }} />
    </g>
    <g clipPath="url(#sh6light)" filter="url(#blur6)">
      <path d="M 1435 240 L 1275 920 M 1100 420 L 1660 540 M 1050 640 L 1610 760" stroke="#2A1E1C" strokeWidth={20} opacity={0.3} />
    </g>
    {/* the bottom step across the top of frame, its runner, the shadow under its nosing */}
    <rect x={-400} y={-400} width={2720} height={500} fill="#6B4B42" />
    <rect x={700} y={-400} width={520} height={500} fill="#6A3644" />
    <rect x={-400} y={96} width={2720} height={8} fill={S3.warm} opacity={0.5} />
    <rect x={-400} y={104} width={2720} height={60} fill="#000" opacity={0.28} />
  </g>
);
export const Sh6: React.FC<ShotProps> = ({ t }) => {
  const p = clamp(t / 3);
  const landed = t >= 3;
  const x = landed ? 960 : lerp(900, 960, p);
  const y = landed ? 620 : lerp(40, 620, easeIn(p));
  const rot = landed ? -24 : lerp(-260, -24, p);
  const pose: Pose = {
    ...basePose,
    x: 0,
    y: 0,
    scale: 1.25,
    squash: landed && t < 8 ? 0.12 * (1 - (t - 3) / 5) : 0,
    armL: { a: 110, b: 20 },
    armR: { a: 100, b: -16 },
    legL: { a: -24, b: 4 },
    legR: { a: 28, b: 8 },
    ...faceAt(t, [[0, 'shock'], [4, 'dizzy']]),
  };
  const th = (rot * Math.PI) / 180;
  const head = { x: x + 150 * Math.sin(th), y: y - 150 * Math.cos(th) };
  const peek = clamp((t - 10) / 4);
  return (
    <g transform={`translate(960 540) rotate(${t * 0.15}) scale(${1 + t * 0.003}) translate(-960 -540)`}>
      <LandingFloor />
      {peek > 0 ? (
        <g transform={`translate(1380 ${60 + 44 * peek})`}>
          <path d="M -46 -10 L -36 -62 L -12 -30 Z M 46 -10 L 36 -62 L 12 -30 Z" fill="#3A3E57" />
          <ellipse cx={0} cy={0} rx={50} ry={40} fill="#3A3E57" />
          <circle cx={-16} cy={4} r={9} fill="#E8D86A" />
          <circle cx={16} cy={4} r={9} fill="#E8D86A" />
          <circle cx={-16} cy={4} r={3.5} fill="#111" />
          <circle cx={16} cy={4} r={3.5} fill="#111" />
        </g>
      ) : null}
      <g filter="url(#g3drop)">
        <g transform={`translate(${x} ${y}) rotate(${rot}) translate(0 70)`}>
          <Hero look={PIP} pose={pose} shadow={0} rimId="rimR" />
        </g>
      </g>
      <DizzyStars x={head.x} y={head.y} t={t >= 5 ? t : -1} />
    </g>
  );
};

// ---------- SH7: medium, the big step over the cat ----------
export const Sh7: React.FC<ShotProps> = ({ t }) => {
  let pose: Pose;
  if (t < 7) {
    pose = { ...walkP(lerp(560, 640, clamp(t / 4)), Math.min(t, 4) * 0.6, { headTilt: kf(t, [[3, 0], [7, 18]]), look: 0.6 }) };
  } else if (t < 27) {
    const p = (t - 7) / 20;
    const lift = Math.sin(p * Math.PI);
    pose = {
      ...walkP(lerp(640, 905, easeOut(p)), 0, { headTilt: 10 }),
      y: lerp(hipGround(640), hipGround(905), p) - LEG_LEN * SC - lift * 30,
      legR: { a: 20 + 75 * lift, b: -85 * lift },
      legL: { a: -12 - 10 * lift, b: -10 },
      armL: { a: 70 * lift, b: 30 },
      armR: { a: -50 * lift, b: 20 },
    };
  } else {
    pose = walkP(lerp(905, 1060, (t - 27) / 19), (t - 27) * 0.6, { headTilt: -4 });
  }
  const squash = t >= 27 && t < 32 ? 0.08 * Math.sin(((t - 27) / 5) * Math.PI) : t >= 4 && t < 7 ? 0.06 * Math.sin(((t - 4) / 3) * Math.PI) : 0;
  const face = faceAt(t, [[0, 'neutral'], [6, 'smug']]);
  return (
    <g transform={camT(kf(t, [[0, 700], [46, 960]]), kf(t, [[0, 400], [7, 420], [27, 560], [46, 640]]), 1.75)}>
      <Stairwell t={t + 194} id="sh7" />
      <Cat x={CATX} y={stepTop(CATX)} mood={t >= 32 ? 'peek' : 'sleep'} f={t} />
      <Hero look={PIP} pose={{ ...pose, squash, ...face }} shadow={0.4} rimId="rimR" />
      <Banister />
    </g>
  );
};

// ---------- SH8: over the shoulder, the wrong answer ----------
export const Sh8: React.FC<ShotProps> = ({ t }) => {
  const pose = poseAt(t, [
    // he faces the board, so the hand that goes up is the near one (screen-left), clear of his hood
    { f: 0, p: { x: 1260, y: 760, yaw: -0.35, armL: { a: 10, b: -8 } } },
    { f: 2, p: {} },
    { f: 6, p: { armL: { a: 160, b: -18 }, sway: 10 }, ease: easeOut },
    { f: 9, p: { armL: { a: 150, b: -12 }, sway: -4 } },
    { f: 13, p: { sway: 0 } },
    { f: 25, p: {} },
    { f: 35, p: { armL: { a: 12, b: -8 }, headTilt: -8 } },
  ]);
  const face = faceAt(t, [[0, 'neutral'], [3, 'happy'], [25, 'oops']]);
  const laugh = t >= 27;
  return (
    <g transform={camT(kf(t, [[0, 1010], [53, 1050]]), kf(t, [[0, 540], [53, 530]]), kf(t, [[0, 1.7], [53, 1.8]]))}>
      <Classroom t={t + 240} solved={false} laugh={laugh ? 1 : 0} />
      <Hero look={PIP} pose={{ ...pose, ...face }} shadow={0} rimId="rimL" />
      <SchoolDesk x={1260} />
      <Tag x={1100} y={430} t={t - 13} text="54" mark="x" markT={12} />
      {/* over the shoulder: a classmate huge, dark and out of focus, filling the left third under the sum; a second shoulder at the right edge */}
      <Foreground blur={16}>
        <Kid x={653} y={1027} s={2.9} look={{ hair: 'curly', hairC: '#120E18', top: '#1E1A28' }} laugh={laugh ? 1 : 0} t={t} />
        <Kid x={1600} y={1060} s={2.2} look={{ hair: 'short', hairC: '#140F1A', top: '#241C2A' }} laugh={laugh ? 1 : 0} t={t + 5} />
      </Foreground>
    </g>
  );
};

// ---------- SH9: extreme close-up, the genius: his face fills the frame, the board soft behind, a classmate soft in front ----------
export const Sh9: React.FC<ShotProps> = ({ t }) => {
  const face = faceAt(t, [[0, 'happy'], [14, 'cool']]);
  const glasses = backOut(clamp((t - 10) / 6));
  const sc = 4.3 * (1 + 0.05 * kf(t, [[0, 0], [36, 1]]));
  const head = { x: 1000, y: 600 };
  const yaw = 0.22;
  const pose: Pose = { ...basePose, x: head.x, y: head.y - HEAD.y * sc, scale: sc, yaw, look: 0.25, armL: { a: 14, b: -6 }, armR: { a: 14, b: -6 }, glasses, ...face };
  const lens = { x: head.x + yaw * 30 * sc, y: head.y - 4 * sc };
  const ringT = t - 15;
  return (
    <g>
      {/* the classroom behind, very soft: the board fills the back, the answer shows beside his head */}
      <g filter="url(#blur16)">
        <g transform="translate(-590 -452) scale(2.2)">
          <Classroom t={t + 326} solved={t >= 8} id="cls9" />
        </g>
      </g>
      <rect x={0} y={0} width={1920} height={1080} fill="#07040C" opacity={0.22} />
      <Hero look={PIP} pose={pose} shadow={0} rimId="rimL" />
      <FocusRings x={lens.x} y={lens.y} t={ringT} />
      <Sparkle x={lens.x + 150} y={lens.y - 40} t={t - 15} s={2.6} />
      {/* a classmate's head and shoulder in the near foreground, and a pencil, both out of focus */}
      <Foreground blur={16}>
        <Kid x={1760} y={1320} s={3.2} look={{ hair: 'curly', hairC: '#1E1418', top: '#3A4A5A' }} />
        <rect x={60} y={980} width={420} height={34} rx={17} fill="#E9C46A" transform="rotate(-14 270 997)" />
      </Foreground>
      <g transform="translate(330 180) scale(1.35) translate(-330 -180)">
        <Tag x={330} y={180} t={t - 1} text="56" mark="check" markT={7} />
      </g>
    </g>
  );
};

// ---------- SH10: the title ----------
export const Sh10: React.FC<ShotProps> = ({ t }) => {
  const spin = t < 21 ? t * 3 : 63 + (t - 21) * 30 * Math.exp(-(t - 21) / 22);
  const sunY = 690 - 50 * easeOut(clamp((t - 21) / 25));
  const pose = poseAt(t, [
    { f: 0, p: { x: 960, y: 770 - 0, scale: 0.62, yaw: 0, armL: { a: 20, b: 6 }, armR: { a: 20, b: 6 } } },
    { f: 21, p: {} },
    { f: 27, p: { armL: { a: 150, b: 10 }, armR: { a: 150, b: 10 } }, ease: easeOut },
  ]);
  return (
    <g transform={camT(960, kf(t, [[0, 520], [94, 560]]), kf(t, [[0, 1.0], [94, 1.1]]))}>
      <Rooftop clock t={t} sunY={sunY} spin={spin} red={0} crack={0} />
      <Hero look={PIP} pose={{ ...pose, y: 820 - LEG_LEN * 0.62, ...faceAt(t, [[0, 'happy']]) }} shadow={0.6} rimId="rimR" />
      <TitleCard t={t} lines={['WHAT IF YOU COULD', 'REWIND 10 SECONDS?']} accent="10" accentT={34} />
    </g>
  );
};

// ---------- SH11: low angle, "sounds amazing": looking up at him against the sky ----------
export const Sh11: React.FC<ShotProps> = ({ t }) => {
  const pose = poseAt(t, [
    { f: 0, p: { x: 900, y: 790, scale: 1.8, yaw: 0.15, armL: { a: 20, b: 6 }, armR: { a: 150, b: 30 } } },
    { f: 29, p: { armR: { a: 160, b: 20 } } },
  ]);
  return (
    <g transform={camT(960, 540, kf(t, [[0, 1.0], [29, 1.03]]))}>
      <Rooftop clock t={t + 94} sunX={1050} sunY={520} spin={300} red={0} crack={0} low={260} />
      <Hero look={PIP} pose={{ ...pose, ...faceAt(t, [[0, 'happy']]) }} shadow={0} rimId="rimR" />
      <Sparkle x={620} y={380} t={t} s={1.5} />
      <Sparkle x={1240} y={300} t={t - 5} s={1.1} />
      <Sparkle x={1160} y={640} t={t - 10} s={0.9} />
    </g>
  );
};

// ---------- SH12: low angle, the turn: the sun cracks above him, the lights go out, a slow push in ----------
export const Sh12: React.FC<ShotProps> = ({ t }) => {
  const red = easeOut(clamp(t / 12));
  const crack = clamp((t - 18) / 10);
  const shake = t >= 18 && t < 40 ? Math.sin(t * 2.7) * 9 * (1 - (t - 18) / 22) : 0;
  const pose = poseAt(t, [
    { f: 0, p: { x: 840, y: 800, scale: 1.9, yaw: -0.2, armL: { a: 18, b: 6 }, armR: { a: 18, b: 6 }, look: 0.6 } },
    { f: 18, p: { look: 1, headTilt: 4 } },
    { f: 75, p: { headTilt: 0 } },
  ]);
  return (
    <g transform={camT(kf(t, [[0, 940], [75, 900]]) + shake, kf(t, [[0, 540], [75, 470]]), kf(t, [[0, 1.0], [18, 1.08], [75, 1.35]]))}>
      <Rooftop clock t={t + 123} sunX={1180} sunY={470} spin={300} red={red} crack={crack} lightsOut={clamp((t - 20) / 30)} low={260} />
      <Hero look={PIP} pose={{ ...pose, ...faceAt(t, [[0, 'happy'], [2, 'worried'], [18, 'shock']]) }} shadow={0} rimId={red > 0.5 ? 'rimRed' : 'rimR'} />
    </g>
  );
};
