import React from 'react';
import {
  LightVeil, DrawOn,
  Hero, Pose, basePose, poseAt, faceAt, kf, clamp, easeOut, easeIn, rnd, settle, camT, LOOKS, LEG_LEN, HEAD, joints, toWorld, reachAngle,
  Kitchen, KitchenIsland, KITCHEN, islandTop, stand, Tabletop, Study, Desk, Stairwell, Rooftop, Schematic, SCH, Arrow, SchLabel, CountUp, PlantIcon,
  Cookie, CookieTop, CookieStack, Plate, PlateTop, Paper, PaperStack, Cat, Foreground, Marquee, PasteIn, Sparkle, TitleCard, Dial, Glow, ShotProps,
} from '../../engine';

// "What if you could copy and paste anything?" Fifteen shots on four sets (kitchen, study, stairwell, rooftop) and
// the schematic. The power: a selection box draws round the thing (COPY), then the copy pops in with a cyan ring
// (PASTE). Each shot is a pure function of its own clock t.

const PIP = LOOKS.pipHood;
const MO = LOOKS.mo;
const CYAN = '#7FD4FF';

// ---------- S1: medium, the kitchen island: Pip points at a cookie, the box draws round it ----------
const S1_STAND = stand(KITCHEN, 0.42, 0.4);
const S1_COOKIE = islandTop(0.6, 0.45);
export const S1: React.FC<ShotProps> = ({ t, len }) => {
  const base: Partial<Pose> = { x: S1_STAND.x, y: S1_STAND.y, scale: S1_STAND.scale, yaw: 0.5, look: 0.8, armL: { a: 12, b: -8 } };
  const p0 = { ...basePose, ...base };
  const aim = reachAngle(p0, { x: S1_COOKIE.x, y: S1_COOKIE.y - 30 });
  const pose = poseAt(t, [
    { f: 0, p: { ...base, armR: { a: 20, b: -10 }, headTilt: 0 } },
    { f: 4, p: { armR: { a: aim - 8, b: -4 }, handR: 'point', headTilt: 4 }, ease: easeOut },
    { f: 7, p: { armR: { a: aim + 3, b: 0 } } },
    { f: 10, p: { armR: { a: aim, b: 0 } } },
  ]);
  const face = faceAt(t, [[0, 'neutral'], [8, 'smug']]);
  return (
    <g transform={camT(kf(t, [[0, 990], [len, 1000]]), 600, kf(t, [[0, 1.85], [len, 1.95]]))}>
      <Kitchen t={t + 40} id="k1" />
      <Hero look={PIP} pose={{ ...pose, ...face, handR: t >= 4 ? 'point' : 'open' }} rimId="rimR" shadow={0} />
      <KitchenIsland />
      <Plate x={S1_COOKIE.x} y={S1_COOKIE.y} s={0.7} />
      <Cookie x={S1_COOKIE.x - 4} y={S1_COOKIE.y - 8} s={0.85} />
      <Marquee x={S1_COOKIE.x - 46} y={S1_COOKIE.y - 50} w={88} h={50} t={t - 8} color={CYAN} />
      <Foreground blur={10}>
        <path d="M 1260 1000 Q 1300 760 1420 700 Q 1380 820 1400 1000 Z" fill="#0E1610" />
        <path d="M 1330 1000 Q 1420 800 1560 760 Q 1480 860 1470 1000 Z" fill="#0C130E" />
      </Foreground>
    </g>
  );
};

// ---------- S2: macro insert, high angle over the plate on the island: the copy pops in ----------
export const S2: React.FC<ShotProps> = ({ t, len }) => {
  const hand = { x: kf(t, [[0, 1300], [7, 1225], [11, 1210], [15, 1250]]), y: kf(t, [[0, 60], [7, 128], [11, 140], [15, 112]]) };
  return (
    <g transform={camT(960, kf(t, [[0, 520], [len, 540]]), kf(t, [[0, 1.0], [len, 1.06]]))}>
      <Tabletop edge={900} wood="#A89C8A" grain="#968A78" lip="#8E8474" kind="stone" floor="#2C2A30" floorLines="#232127" />
      {/* the pendant's pool of light on the stone, darker toward the edges */}
      <LightVeil id="s2veil" lights={[[930, 430, 760]]} o={0.55} />
      <Glow x={930} y={400} r={620} o={0.35} />
      {/* a glass of milk, a striped tea towel running out of frame, a jar */}
      <circle cx={1470} cy={660} r={96} fill="#000" opacity={0.3} />
      <circle cx={1460} cy={650} r={88} fill="#C9D6DE" opacity={0.9} />
      <circle cx={1460} cy={650} r={70} fill="#F6F4EE" />
      <path d="M 1420 610 A 50 50 0 0 1 1480 600" stroke="#FFFFFF" strokeWidth={8} fill="none" strokeLinecap="round" />
      <g transform="rotate(-14 240 160)">
        <rect x={-60} y={40} width={520} height={250} fill="#7A4A52" />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={-60} y={70 + i * 70} width={520} height={14} fill="#E9C46A" opacity={0.7} />
        ))}
      </g>
      <circle cx={360} cy={760} r={110} fill="#000" opacity={0.3} />
      <circle cx={350} cy={750} r={104} fill="#B98A5A" />
      <circle cx={350} cy={750} r={84} fill="#8A5A3A" />
      <PlateTop x={930} y={470} r={260} />
      <CookieTop x={820 - Math.max(0, settle(t - 12, 10, 1.6, 4))} y={440} r={100} rot={20 + settle(t - 12, 6, 1.6, 5)} />
      <PasteIn x={1050} y={520} t={t - 12} color={CYAN} ring={120}>
        <CookieTop x={1050} y={520} r={100} rot={20} />
      </PasteIn>
      <Sparkle x={1140} y={420} t={t - 15} s={1.6} />
      {/* Pip's arm comes in from the top right, pointing: the dark sleeve, the light mitten */}
      <g filter="url(#rimR)">
        <path d={`M ${hand.x + 40} ${hand.y - 40} Q ${hand.x + 160} ${hand.y - 220} ${hand.x + 380} -360`} stroke={PIP.line} strokeWidth={118} fill="none" strokeLinecap="round" />
        <path d={`M ${hand.x + 40} ${hand.y - 40} Q ${hand.x + 160} ${hand.y - 220} ${hand.x + 380} -360`} stroke={PIP.limb} strokeWidth={100} fill="none" strokeLinecap="round" />
        <g transform={`translate(${hand.x} ${hand.y}) rotate(40) scale(4.6)`}>
          <rect x={-4} y={10} width={8} height={24} rx={4} fill={PIP.hand} stroke={PIP.line} strokeWidth={2.4} />
          <path d="M -11 -2 Q -14 14 -6 18 L 7 18 Q 14 14 11 -2 Z" fill={PIP.hand} stroke={PIP.line} strokeWidth={2.6} strokeLinejoin="round" />
          <ellipse cx={-10} cy={6} rx={4.5} ry={7} fill={PIP.hand} stroke={PIP.line} strokeWidth={2.4} />
        </g>
      </g>
    </g>
  );
};

// ---------- S3: wide, the kitchen: cookies paste themselves along the counters, Pip cheers ----------
const S3_STAND = stand(KITCHEN, 0.5, 0.4);
const COUNTER_COOKIES = Array.from({ length: 8 }).map((_, i) => ({ p: KITCHEN.P(0.04 + i * 0.07, 0.7, 0.075), at: 2 + i * 3, n: 3 + ((i * 5) % 4) }));
const ISLAND_COOKIES = Array.from({ length: 7 }).map((_, i) => ({ p: islandTop(0.31 + i * 0.065, 0.55), at: 5 + i * 3, n: 3 + ((i * 3) % 4) }));
export const S3: React.FC<ShotProps> = ({ t, len }) => {
  const pose = poseAt(t, [
    { f: 0, p: { x: S3_STAND.x, y: S3_STAND.y, scale: S3_STAND.scale, yaw: 0, armL: { a: 30, b: 20 }, armR: { a: 30, b: 20 } } },
    { f: 4, p: { squash: 0.06 } },
    { f: 9, p: { armL: { a: 150, b: 10 }, armR: { a: 150, b: 10 }, squash: -0.05 }, ease: easeOut },
    { f: 13, p: { armL: { a: 142, b: 16 }, armR: { a: 142, b: 16 }, squash: 0 } },
  ]);
  const cat = KITCHEN.P(0.86, 1, 0.66);
  return (
    <g transform={camT(960, kf(t, [[0, 560], [len, 570]]), kf(t, [[0, 0.98], [len, 1.03]]))}>
      <Kitchen t={t + 70} id="k3" veil={0.36} />
      {COUNTER_COOKIES.map((c, i) => (
        <PasteIn key={`c${i}`} x={c.p.x} y={c.p.y - 20} t={t - c.at} color={CYAN} ring={40}>
          <CookieStack x={c.p.x} y={c.p.y} n={c.n} s={0.68} />
        </PasteIn>
      ))}
      <Hero look={PIP} pose={{ ...pose, ...faceAt(t, [[0, 'happy']]) }} rimId="rimR" shadow={0} />
      <KitchenIsland />
      {ISLAND_COOKIES.map((c, i) => (
        <PasteIn key={`i${i}`} x={c.p.x} y={c.p.y - 20} t={t - c.at} color={CYAN} ring={50}>
          <CookieStack x={c.p.x} y={c.p.y} n={c.n} s={0.95} />
        </PasteIn>
      ))}
      <Cat x={cat.x} y={cat.y} mood={t > 6 ? 'alert' : 'sleep'} f={t} />
    </g>
  );
};

// ---------- S4: top-down over the study desk: the finished sheet gets selected ----------
export const S4: React.FC<ShotProps> = ({ t, len }) => {
  const hand = { x: kf(t, [[0, 1020], [6, 930], [10, 945]]), y: kf(t, [[0, -60], [6, 150], [10, 132]]) };
  return (
    <g transform={`translate(960 540) rotate(${-2 + t * 0.05}) scale(${1 + t * 0.002}) translate(-960 -540)`}>
      <Tabletop edge={1400} />
      <Glow x={1100} y={420} r={720} o={0.3} />
      {/* the laptop's corner, a pencil, a ruler, a sticky note */}
      <g transform="rotate(-8 200 140)">
        <rect x={-60} y={-80} width={520} height={330} rx={18} fill="#24222E" />
        {Array.from({ length: 4 }).map((_, r) =>
          Array.from({ length: 10 }).map((__, c) => <rect key={`k${r}-${c}`} x={-36 + c * 44} y={-50 + r * 40} width={36} height={32} rx={5} fill="#33313E" />),
        )}
      </g>
      <rect x={1420} y={820} width={300} height={14} rx={7} fill="#E9C46A" transform="rotate(-28 1570 827)" />
      <rect x={160} y={900} width={380} height={40} fill="#D9C8A8" transform="rotate(-10 350 920)" />
      <rect x={300} y={620} width={110} height={110} fill="#9BD3A8" transform="rotate(8 355 675)" />
      <Paper x={720} y={560} w={330} rot={-5} done grade="A+" />
      <Paper x={1220} y={560} w={330} rot={4} done={false} />
      <Marquee x={530} y={330} w={380} h={460} t={t - 6} color={CYAN} />
      {/* Pip's mitten, pointing, from the bottom right */}
      <g filter="url(#rimR)">
        <path d={`M ${hand.x + 50} ${hand.y - 60} L ${hand.x + 300} ${hand.y - 520}`} stroke={PIP.line} strokeWidth={128} strokeLinecap="round" />
        <path d={`M ${hand.x + 50} ${hand.y - 60} L ${hand.x + 300} ${hand.y - 520}`} stroke={PIP.limb} strokeWidth={110} strokeLinecap="round" />
        <g transform={`translate(${hand.x} ${hand.y}) rotate(28) scale(5)`}>
          <rect x={-4} y={10} width={8} height={24} rx={4} fill={PIP.hand} stroke={PIP.line} strokeWidth={2.2} />
          <path d="M -11 -2 Q -14 14 -6 18 L 7 18 Q 14 14 11 -2 Z" fill={PIP.hand} stroke={PIP.line} strokeWidth={2.4} strokeLinejoin="round" />
          <ellipse cx={10} cy={6} rx={4.5} ry={7} fill={PIP.hand} stroke={PIP.line} strokeWidth={2.2} />
        </g>
      </g>
    </g>
  );
};

// ---------- S5: medium, the study: a finished stack pops onto the desk; Pip leans back, smug ----------
export const S5: React.FC<ShotProps> = ({ t, len }) => {
  const pose = poseAt(t, [
    { f: 0, p: { x: 900, y: 712, yaw: 0.4, look: 0.7, armL: { a: 14, b: -6 }, armR: { a: 50, b: 30 } } },
    { f: 18, p: { tilt: 3 } },
    { f: 25, p: { tilt: -11, headTilt: -6, armL: { a: 160, b: 120 }, armR: { a: 160, b: 120 }, look: 0.2 }, ease: easeOut },
    { f: 30, p: { tilt: -8 } },
  ]);
  const face = faceAt(t, [[0, 'happy'], [24, 'smug']]);
  return (
    <g transform={camT(kf(t, [[0, 990], [len, 970]]), 590, kf(t, [[0, 1.8], [len, 1.9]]))}>
      <Study t={t + 120} id="st5" />
      <Hero look={PIP} pose={{ ...pose, ...face }} rimId="rimR" shadow={0} />
      <Desk x0={560} x1={1360} y={700} lamp={false} />
      <PasteIn x={1110} y={680} t={t - 12} color={CYAN} ring={90}>
        <PaperStack x={1110} y={698} n={9} w={200} />
      </PasteIn>
      <Sparkle x={1190} y={600} t={t - 16} s={0.9} />
      <Foreground blur={10}>
        <path d="M 1500 1000 Q 1380 800 1430 600 Q 1470 800 1580 980 Z" fill="#0E1610" />
      </Foreground>
    </g>
  );
};

// ---------- S6: over Pip's shoulder: Mo waves on the landing, the box selects him ----------
const LANDING = 420;
const MO_X = 300;
const moPose = (x: number, extra: Partial<Pose> = {}): Pose => ({ ...basePose, x, y: LANDING - LEG_LEN * 0.9, scale: 0.9, ...extra });
export const S6: React.FC<ShotProps> = ({ t, len }) => {
  const wave = Math.sin(t / 3) * 14;
  const mo = poseAt(t, [{ f: 0, p: { ...moPose(MO_X), yaw: 0.25, look: 0.6, armR: { a: 150 + wave, b: 20 }, armL: { a: 10, b: -8 } } }]);
  return (
    <g transform={camT(kf(t, [[0, 330], [len, 320]]), 270, kf(t, [[0, 1.55], [len, 1.62]]))}>
      <Stairwell t={t + 200} id="sw6" />
      <Hero look={MO} pose={{ ...mo, armR: { a: 150 + wave, b: 20 }, ...faceAt(t, [[0, 'happy']]) }} rimId="rimL" shadow={0.5} />
      <Marquee x={MO_X - 92} y={50} w={184} h={380} t={t - 10} color={CYAN} />
      {/* Pip's hooded head and shoulder, close and dark, in the lower right */}
      <Foreground blur={10}>
        <path d="M 520 680 Q 540 470 660 440 Q 790 410 840 520 Q 900 560 960 700 Z" fill="#14121C" />
        <circle cx={700} cy={400} r={120} fill="#1A1724" />
        <path d="M 580 380 Q 600 260 700 260 Q 800 260 820 380" stroke="#FFB46A" strokeWidth={5} fill="none" opacity={0.35} />
      </Foreground>
    </g>
  );
};

// ---------- S7: two-shot: a second Mo pops in; they turn and stare at each other ----------
export const S7: React.FC<ShotProps> = ({ t, len }) => {
  const turn = clamp((t - 15) / 5);
  const mo1 = poseAt(t, [
    { f: 0, p: { ...moPose(330), yaw: 0.25, look: 0.6, armR: { a: 140, b: 20 } } },
    { f: 14, p: {} },
    { f: 19, p: { yaw: -0.55, look: -1, armR: { a: 40, b: 40 }, armL: { a: 40, b: 40 } }, ease: easeOut },
  ]);
  const mo2 = poseAt(t, [
    { f: 0, p: { ...moPose(110), yaw: 0.25, look: 0.6, armR: { a: 140, b: 20 } } },
    { f: 14, p: {} },
    { f: 19, p: { yaw: 0.55, look: 1, armR: { a: 40, b: 40 }, armL: { a: 40, b: 40 } }, ease: easeOut },
  ]);
  const f1 = faceAt(t, [[0, 'happy'], [16, 'shock']]);
  return (
    <g transform={camT(kf(t, [[0, 230], [len, 225]]), 270, kf(t, [[0, 1.6], [len, 1.66]]))}>
      <Stairwell t={t + 241} id="sw7" />
      <Hero look={MO} pose={{ ...mo1, ...f1 }} rimId="rimL" shadow={0.5} />
      <PasteIn x={110} y={250} t={t - 11} color={CYAN} ring={140}>
        <Hero look={MO} pose={{ ...mo2, ...f1 }} rimId="rimR" shadow={0.5} />
      </PasteIn>
      {turn > 0 ? <Sparkle x={220} y={70} t={t - 17} s={0.7} /> : null}
    </g>
  );
};

// ---------- S8: close-up: Pip, uneasy; both Mos soft behind him, staring ----------
export const S8: React.FC<ShotProps> = ({ t, len }) => {
  const sc = 3.6 * (1 + 0.04 * clamp(t / len));
  const head = { x: 1180, y: 560 };
  const pose: Pose = { ...basePose, x: head.x, y: head.y - HEAD.y * sc, scale: sc, yaw: -0.3, look: -0.7, armL: { a: 14, b: -6 }, armR: { a: 14, b: -6 }, headTilt: kf(t, [[0, 0], [10, -6]]), ...faceAt(t, [[0, 'oops'], [16, 'worried']]) };
  return (
    <g>
      <g filter="url(#blur16)">
        <g transform="translate(420 -40) scale(1.9)">
          <Stairwell t={t + 266} id="sw8" />
          <Hero look={MO} pose={{ ...moPose(60), yaw: 0.6, look: 1, armL: { a: 30, b: 30 }, armR: { a: 30, b: 30 }, expr: 'shock' }} rimId="rimR" shadow={0} />
          <Hero look={MO} pose={{ ...moPose(-130), yaw: 0.6, look: 1, armL: { a: 30, b: 30 }, armR: { a: 30, b: 30 }, expr: 'shock' }} rimId="rimR" shadow={0} />
        </g>
      </g>
      <rect x={0} y={0} width={1920} height={1080} fill="#07040C" opacity={0.25} />
      <Hero look={PIP} pose={pose} rimId="rimL" shadow={0} />
    </g>
  );
};

// ---------- S9: the title, wide on the roof at dusk; Pip among his towers of cookies ----------
const ROOF_FEET = 840;
export const S9: React.FC<ShotProps> = ({ t, len }) => {
  const pose = poseAt(t, [
    { f: 0, p: { x: 960, y: ROOF_FEET - LEG_LEN * 0.62, scale: 0.62, yaw: 0, armL: { a: 20, b: 6 }, armR: { a: 20, b: 6 } } },
    { f: 18, p: {} },
    { f: 24, p: { armL: { a: 150, b: 10 }, armR: { a: 150, b: 10 } }, ease: easeOut },
  ]);
  return (
    <g transform={camT(960, kf(t, [[0, 520], [len, 545]]), kf(t, [[0, 1.0], [len, 1.07]]))}>
      <Rooftop t={t} sunX={960} sunY={690 - 40 * easeOut(clamp(t / 40))} />
      {[[760, 6], [820, 9], [1110, 7], [1180, 11], [700, 4], [1240, 5]].map(([x, n], i) => (
        <CookieStack key={i} x={x} y={ROOF_FEET + 4} n={n} s={0.75} />
      ))}
      <Hero look={PIP} pose={{ ...pose, ...faceAt(t, [[0, 'happy']]) }} rimId="rimR" shadow={0.6} />
      <TitleCard t={t} lines={['WHAT IF YOU COULD', 'COPY AND PASTE ANYTHING?']} accent="ANYTHING" accentT={42} size={88} y={170} />
    </g>
  );
};

// ---------- S10: medium, low angle on the roof: he stops mid-bite and looks at the cookie ----------
const s10Pose = (t: number) =>
  poseAt(t, [
    { f: 0, p: { x: 900, y: 790, scale: 1.8, yaw: 0.3, look: 0.4, armL: { a: 16, b: 6 }, armR: { a: 140, b: 115 }, headTilt: 4 } },
    { f: 8, p: { armR: { a: 118, b: 100 }, look: 0.9, headTilt: 10 }, ease: easeOut },
  ]);
export const S10: React.FC<ShotProps> = ({ t, len }) => {
  const pose = s10Pose(t);
  const j = joints(pose);
  const h = toWorld(pose, j.armR.end);
  return (
    <g transform={camT(960, 540, kf(t, [[0, 1.0], [len, 1.05]]))}>
      <Rooftop t={t + 66} sunX={1250} sunY={560} low={260} />
      <Hero look={PIP} pose={{ ...pose, ...faceAt(t, [[0, 'happy'], [6, 'neutral']]) }} rimId="rimR" shadow={0} />
      <Cookie x={h.x + 6} y={h.y + 30} s={2.2} rot={-14} bite={1} seed={10} />
    </g>
  );
};

// ---------- S11: macro insert: the cookie in his mitten; its outline flickers like an unstable copy ----------
const BigCookie: React.FC<{ x: number; y: number; id: string }> = ({ x, y, id }) => (
  <g>
    {/* seen from three-quarters above: the top face squashed, the baked edge below it, a bite out of the right */}
    <defs>
      <mask id={id}>
        <rect x={x - 400} y={y - 300} width={800} height={600} fill="#fff" />
        <circle cx={x + 250} cy={y - 60} r={80} fill="#000" />
        <circle cx={x + 200} cy={y - 140} r={60} fill="#000" />
      </mask>
    </defs>
    <g mask={`url(#${id})`}>
      <ellipse cx={x} cy={y + 34} rx={280} ry={150} fill="#9A6234" />
      <g transform={`translate(${x} ${y}) scale(1 0.52)`}>
        <CookieTop x={0} y={0} r={280} rot={10} />
      </g>
    </g>
  </g>
);
export const S11: React.FC<ShotProps> = ({ t, len }) => {
  const g = Math.floor(t / 2);
  const jx = (rnd(g, 1) - 0.5) * 22;
  const jy = (rnd(g, 2) - 0.5) * 10;
  const on = rnd(g, 3) > 0.4;
  const c = { x: 940, y: 520 };
  return (
    <g transform={camT(960, 540, kf(t, [[0, 1.0], [len, 1.08]]))}>
      <g filter="url(#blur16)">
        <g transform="translate(-700 -500) scale(1.9)">
          <Rooftop t={t + 93} sunX={1100} sunY={560} low={200} />
        </g>
      </g>
      <rect x={-400} y={-400} width={2720} height={1880} fill="#07040C" opacity={0.25} />
      {/* the mitten from below, its fingers under the cookie */}
      <g filter="url(#rimR)">
        <path d="M 1180 1400 Q 1080 1060 1000 820" stroke={PIP.line} strokeWidth={190} fill="none" strokeLinecap="round" />
        <path d="M 1180 1400 Q 1080 1060 1000 820" stroke={PIP.limb} strokeWidth={164} fill="none" strokeLinecap="round" />
        <ellipse cx={960} cy={700} rx={230} ry={120} fill={PIP.hand} stroke={PIP.line} strokeWidth={10} />
      </g>
      <g opacity={on ? 0.45 : 0.15} style={{ mixBlendMode: 'screen' }}>
        <g transform={`translate(${jx + 14} ${jy})`}>
          <BigCookie x={c.x} y={c.y} id="s11ghost" />
        </g>
      </g>
      <BigCookie x={c.x} y={c.y} id="s11bite" />
      {/* the thumb on top at the left, three fingertips curling over the right edge */}
      <g filter="url(#rimR)">
        <ellipse cx={720} cy={560} rx={60} ry={96} fill={PIP.hand} stroke={PIP.line} strokeWidth={10} transform="rotate(30 720 560)" />
        {[[1150, 600, -20], [1185, 660, -35], [1170, 722, -50]].map(([x, y, r], i) => (
          <ellipse key={i} cx={x} cy={y} rx={46} ry={34} fill={PIP.hand} stroke={PIP.line} strokeWidth={9} transform={`rotate(${r} ${x} ${y})`} />
        ))}
      </g>
      {on ? <rect x={600 + jx} y={330 + jy} width={680} height={400} fill="none" stroke={CYAN} strokeWidth={7} strokeDasharray="26 16" opacity={0.9} /> : null}
      <rect x={600 - jx * 0.6} y={330} width={680} height={400} fill="none" stroke="#FF5A6A" strokeWidth={4} strokeDasharray="26 16" opacity={on ? 0.4 : 0} />
    </g>
  );
};

// ---------- S12: schematic: 1 cookie, 30 g, E = mc2, then the joules counting up ----------
export const S12: React.FC<ShotProps> = ({ t, len }) => (
  <g transform={`translate(960 540) scale(${kf(t, [[0, 1], [len, 1.05]])}) translate(-960 -540)`}>
    <Schematic t={t} id="sch12" />
    <PasteIn x={470} y={400} t={t + 3} color={SCH.live} ring={150}>
      <CookieTop x={470} y={400} r={140} rot={15} />
    </PasteIn>
    <SchLabel x={470} y={620} t={t - 6} text="1 COOKIE · 30 g" size={48} />
    <Arrow x0={660} y0={400} x1={800} y1={400} t={t - 10} />
    <SchLabel x={1080} y={435} t={t - 13} text="E = mc²" size={120} />
    <SchLabel x={1080} y={505} t={t - 18} text="mass × (speed of light)²" size={30} color={SCH.dim} />
    <DrawOn d="M 1330 400 L 1440 400" t={t - 22} dur={6} />
    {t > 26 ? <path d="M 1510 320 L 1460 410 L 1500 410 L 1470 490" stroke={SCH.live} strokeWidth={10} fill="none" strokeLinejoin="round" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 12px ${SCH.glow})` }} /> : null}
    <CountUp x={960} y={820} t={t - 24} to={2.7e15} dur={30} size={96} />
    <SchLabel x={960} y={900} t={t - 28} text="JOULES OF ENERGY" size={38} color={SCH.dim} />
  </g>
);

// ---------- S13: schematic: every power plant on Earth lights up; the dial runs past ten minutes ----------
const KINDS: ('tower' | 'wind' | 'solar' | 'dam' | 'factory')[] = ['tower', 'wind', 'solar', 'dam', 'factory'];
export const S13: React.FC<ShotProps> = ({ t }) => {
  const mins = 12.7 * easeIn(clamp((t - 14) / 66)) ** 0.6;
  const read = `${String(Math.floor(mins)).padStart(2, '0')}:${String(Math.floor((mins % 1) * 60 + 0.01)).padStart(2, '0')}`;
  return (
    <g>
      <Schematic t={t + 62} id="sch13" />
      <SchLabel x={620} y={160} t={t - 2} text="EVERY POWER PLANT ON EARTH" size={50} />
      {Array.from({ length: 15 }).map((_, i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        const order = (col * 3 + row * 7) % 15;
        return <PlantIcon key={i} x={220 + col * 200} y={330 + row * 230} kind={KINDS[(i + row) % 5]} on={clamp((t - 4 - order * 3) / 6)} t={t} s={0.95} />;
      })}
      <Dial x={1500} y={500} r={210} p={mins / 12.7} readout={read} size={92} />
      <SchLabel x={1500} y={800} t={t - 10} text="MINUTES, FOR ONE COOKIE" size={36} color={SCH.dim} />
      <SchLabel x={1500} y={220} t={t - 72} text="OVER 10 MINUTES" size={50} color={SCH.live} />
    </g>
  );
};

// ---------- S14: close-up: "That's real." Pip, worried, the light starting to turn ----------
export const S14: React.FC<ShotProps> = ({ t, len }) => {
  const sc = 6.6 * (1 + 0.04 * clamp(t / len));
  const head = { x: 960, y: 720 };
  const red = 0.35 * clamp(t / len);
  const pose: Pose = { ...basePose, x: head.x, y: head.y - HEAD.y * sc, scale: sc, yaw: 0.12, look: 0.1, armL: { a: 14, b: -6 }, armR: { a: 14, b: -6 }, ...faceAt(t, [[0, 'worried']]) };
  return (
    <g>
      <g filter="url(#blur16)">
        <g transform="translate(-600 -560) scale(2)">
          <Rooftop t={t + 200} sunX={980} sunY={600} red={red} low={180} />
        </g>
      </g>
      <rect x={0} y={0} width={1920} height={1080} fill="#07040C" opacity={0.22} />
      <Hero look={PIP} pose={pose} rimId={t > len * 0.6 ? 'rimRed' : 'rimR'} shadow={0} />
    </g>
  );
};

// ---------- S15: wide, low angle: the city goes dark in a sweep toward him, the string lights die, the sky goes red ----------
export const S15: React.FC<ShotProps> = ({ t, len }) => {
  const red = easeOut(clamp(t / 14));
  const pose = poseAt(t, [
    { f: 0, p: { x: 960, y: 905 - LEG_LEN * 1.1, scale: 1.1, yaw: -0.15, look: -0.6, armL: { a: 40, b: 70 }, armR: { a: 40, b: 70 } } },
    { f: 30, p: { look: 0.4, headTilt: 4 } },
    { f: 60, p: { look: -0.2, headTilt: 0 } },
  ]);
  return (
    <g transform={camT(kf(t, [[0, 960], [len, 950]]), kf(t, [[0, 520], [len, 500]]), kf(t, [[0, 1.0], [len, 1.18]]))}>
      <Rooftop t={t + 230} sunX={1180} sunY={600} red={red} blackout={clamp((t - 8) / 40)} lightsOut={clamp((t - 48) / 20)} low={40} cityLit={2.6} />
      <CookieStack x={1130} y={910} n={8} s={0.95} />
      <CookieStack x={790} y={910} n={6} s={0.95} />
      <Hero look={PIP} pose={{ ...pose, ...faceAt(t, [[0, 'worried'], [26, 'shock']]) }} rimId="rimRed" shadow={0} />
    </g>
  );
};

