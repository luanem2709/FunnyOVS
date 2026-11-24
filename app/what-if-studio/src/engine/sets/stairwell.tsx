import React from 'react';
import { clamp, lerp } from '../anim';
import { S3, pts } from '../room';
import { WallTexture, SkyView, Glow, LightVeil, Dust } from '../light';

// The stairwell, seen side-on: 7 steps of 150 x 70 going down to the right from a landing at y 420, a lit doorway
// on the upper landing, an arched window at the bottom with the low sun, framed pictures, a hanging lantern.
// stepTop(x) is the tread under x; hipGround(x) is a smoothed version for walking hips.
export const SW = { top: 420, x0: 420, w: 150, h: 70, n: 7 };
const nose = (x: number) => (x < SW.x0 ? SW.top : x > SW.x0 + SW.w * SW.n ? SW.top + SW.h * SW.n : SW.top + ((x - SW.x0) * SW.h) / SW.w);
const stepY = (x: number) => {
  if (x < SW.x0) return SW.top;
  return SW.top + SW.h * Math.min(SW.n, Math.floor((x - SW.x0) / SW.w) + 1);
};

export const Stairwell: React.FC<{ t: number; id?: string }> = ({ t, id = 'stw' }) => {
  let saw = `M -400 ${SW.top} L ${SW.x0} ${SW.top}`;
  for (let i = 1; i <= SW.n; i++) {
    const x = SW.x0 + SW.w * (i - 1);
    saw += ` L ${x} ${SW.top + SW.h * i} L ${x + SW.w} ${SW.top + SW.h * i}`;
  }
  const dado = (x: number) => nose(x) - 150;
  const lantern = { x: 900, y: 150 };
  const sconces = [660, 1180];
  return (
    <g>
      <rect x={-400} y={-400} width={2800} height={1900} fill={S3.wall} />
      {Array.from({ length: 48 }).map((_, i) => (
        <rect key={`wp${i}`} x={-400 + i * 60} y={-400} width={22} height={1900} fill="#40364A" opacity={0.45} />
      ))}
      <WallTexture rect={[-400, -400, 2800, 1900]} />
      {/* the panelled lower wall follows the stairs, under a dado rail */}
      <path d={`M -400 ${dado(-400)} L ${SW.x0} ${dado(SW.x0)} L ${SW.x0 + SW.w * SW.n} ${dado(SW.x0 + SW.w * SW.n)} L 2400 ${dado(2400)} L 2400 1500 L -400 1500 Z`} fill="#2B2432" />
      {Array.from({ length: 24 }).map((_, i) => {
        const x = -360 + i * 120;
        return <path key={`pn${i}`} d={`M ${x} ${dado(x) + 26} L ${x} ${stepY(x) - 16}`} stroke="#231C29" strokeWidth={4} />;
      })}
      <path d={`M -400 ${dado(-400)} L ${SW.x0} ${dado(SW.x0)} L ${SW.x0 + SW.w * SW.n} ${dado(SW.x0 + SW.w * SW.n)} L 2400 ${dado(2400)}`} stroke="#4E4250" strokeWidth={12} fill="none" />
      <path d={`M -400 ${dado(-400) - 6} L ${SW.x0} ${dado(SW.x0) - 6} L ${SW.x0 + SW.w * SW.n} ${dado(SW.x0 + SW.w * SW.n) - 6} L 2400 ${dado(2400) - 6}`} stroke={S3.warm} strokeWidth={2} opacity={0.25} fill="none" />
      {/* the tall arched window at the bottom landing, the sun low in it */}
      <SkyView id={`${id}win`} clip="M 1330 600 L 1330 230 A 145 145 0 0 1 1620 230 L 1620 600 Z" box={{ x: 1330, y: 85, w: 290, h: 515 }} t={t} sun={{ x: 1530, y: 560 }} sunR={34} />
      <path d="M 1330 600 L 1330 230 A 145 145 0 0 1 1620 230 L 1620 600" stroke="#1E1824" strokeWidth={18} fill="none" />
      <path d="M 1475 90 L 1475 600 M 1330 330 L 1620 330 M 1330 465 L 1620 465" stroke="#1E1824" strokeWidth={8} />
      <rect x={1312} y={598} width={326} height={16} fill="#6A5056" />
      <path d="M 1312 598 L 1638 598" stroke={S3.warm} strokeWidth={2} opacity={0.6} />
      <circle cx={1530} cy={560} r={520} fill="url(#kitBloom)" opacity={0.42} />
      <path d="M 1330 230 L 1620 600 L 1050 1100 L 260 1100 Z" fill="url(#kitShaft)" opacity={0.75} />
      {/* framed pictures going down the wall, and two wall lights */}
      {[
        { x: 500, w: 120, h: 92, art: 0 },
        { x: 790, w: 100, h: 130, art: 1 },
        { x: 1050, w: 130, h: 96, art: 2 },
      ].map((f, i) => {
        const y = dado(f.x + f.w / 2) - 120 - f.h;
        return (
          <g key={`fr${i}`}>
            <rect x={f.x} y={y} width={f.w} height={f.h} fill="#1E1824" />
            <rect x={f.x + 9} y={y + 9} width={f.w - 18} height={f.h - 18} fill="#E6D4B6" />
            {f.art === 0 ? (
              <g>
                <rect x={f.x + 18} y={y + 18} width={f.w - 36} height={f.h - 36} fill="#E4A27A" />
                <circle cx={f.x + f.w / 2} cy={y + f.h * 0.55} r={12} fill="#FFE2B0" />
                <path d={`M ${f.x + 18} ${y + f.h - 18} L ${f.x + 46} ${y + f.h * 0.5} L ${f.x + 70} ${y + f.h - 30} L ${f.x + 86} ${y + f.h * 0.6} L ${f.x + f.w - 18} ${y + f.h - 18} Z`} fill="#6A3E5A" />
              </g>
            ) : f.art === 1 ? (
              <g>
                <rect x={f.x + 18} y={y + 18} width={f.w - 36} height={f.h - 36} fill="#4A5A7A" />
                <circle cx={f.x + f.w / 2 - 8} cy={y + f.h / 2 - 10} r={18} fill="#E9C46A" />
                <circle cx={f.x + f.w / 2 + 12} cy={y + f.h / 2 + 16} r={13} fill="#D9906A" />
              </g>
            ) : (
              <g>
                <rect x={f.x + 18} y={y + 18} width={f.w - 36} height={f.h - 36} fill="#9FC0D6" />
                <rect x={f.x + 18} y={y + f.h - 36} width={f.w - 36} height={18} fill="#4A6A8A" />
                <path d={`M ${f.x + 60} ${y + f.h - 36} L ${f.x + 60} ${y + 30} L ${f.x + 84} ${y + f.h - 40} Z`} fill="#F4EEE0" />
              </g>
            )}
          </g>
        );
      })}
      {sconces.map((x, i) => {
        const y = dado(x) - 300;
        return (
          <g key={`sc${i}`}>
            <rect x={x - 8} y={y} width={16} height={26} rx={5} fill="#2A2026" />
            <path d={`M ${x - 20} ${y + 6} L ${x + 20} ${y + 6} L ${x + 13} ${y - 30} L ${x - 13} ${y - 30} Z`} fill="#F2C08A" />
            <Glow x={x} y={y - 10} r={240} o={0.5} />
          </g>
        );
      })}
      {/* the upper landing: an open door with a lit room behind it */}
      <rect x={40} y={130} width={220} height={292} fill="#4A3C48" />
      <rect x={56} y={146} width={188} height={276} fill="#FFC98A" />
      <rect x={56} y={146} width={188} height={276} fill="url(#g3fadeDown)" opacity={0.6} />
      <rect x={180} y={240} width={40} height={182} fill="#E9A86A" opacity={0.7} />
      <polygon points="56,422 244,422 300,446 20,446" fill="#FFC98A" opacity={0.25} style={{ mixBlendMode: 'screen' }} />
      <Glow x={150} y={300} r={260} o={0.45} />
      {/* the hanging lantern in the stairwell */}
      <path d={`M ${lantern.x} -400 L ${lantern.x} ${lantern.y - 40}`} stroke="#120E16" strokeWidth={4} />
      <path d={`M ${lantern.x - 26} ${lantern.y - 40} L ${lantern.x + 26} ${lantern.y - 40} L ${lantern.x + 34} ${lantern.y + 30} L ${lantern.x - 34} ${lantern.y + 30} Z`} fill="#FFD7A0" />
      <path d={`M ${lantern.x - 26} ${lantern.y - 40} L ${lantern.x + 26} ${lantern.y - 40} L ${lantern.x + 34} ${lantern.y + 30} L ${lantern.x - 34} ${lantern.y + 30} Z M ${lantern.x} ${lantern.y - 40} L ${lantern.x} ${lantern.y + 30}`} stroke="#1C1620" strokeWidth={5} fill="none" />
      <path d={`M ${lantern.x - 40} ${lantern.y + 30} L ${lantern.x + 40} ${lantern.y + 30}`} stroke="#1C1620" strokeWidth={8} strokeLinecap="round" />
      <Glow x={lantern.x} y={lantern.y} r={300} o={0.55} />
      {/* the staircase: a panelled side, wooden treads with a runner, a lit nosing on each step */}
      <path d={`${saw} L 2400 ${SW.top + SW.h * SW.n} L 2400 1500 L -400 1500 Z`} fill="#3A2C35" />
      <path d={`M -400 ${SW.top + 34} L ${SW.x0} ${SW.top + 34} L ${SW.x0 + SW.w * SW.n} ${SW.top + SW.h * SW.n + 34} L 2400 ${SW.top + SW.h * SW.n + 34}`} stroke="#2A1F27" strokeWidth={26} fill="none" />
      {Array.from({ length: 6 }).map((_, i) => {
        const x = SW.x0 + 70 + i * 170;
        const y0 = nose(x + 80) + 70;
        return <rect key={`sp${i}`} x={x} y={y0} width={130} height={Math.max(60, 1000 - y0)} rx={4} fill="none" stroke="#2E232B" strokeWidth={5} />;
      })}
      {/* the stair's side is one piece: a sawtooth top, a stringer board along its underside */}
      <path d={`${saw} L 2400 ${SW.top + SW.h * SW.n} L 2400 ${SW.top + SW.h * SW.n + 110} L ${SW.x0 + SW.w * SW.n} ${SW.top + SW.h * SW.n + 110} L ${SW.x0} ${SW.top + 110} L -400 ${SW.top + 110} Z`} fill="#54403A" />
      <path d={`M -400 ${SW.top + 110} L ${SW.x0} ${SW.top + 110} L ${SW.x0 + SW.w * SW.n} ${SW.top + SW.h * SW.n + 110} L 2400 ${SW.top + SW.h * SW.n + 110}`} stroke="#3A2A28" strokeWidth={22} fill="none" />
      <path d={saw} stroke="#2E222A" strokeWidth={3} fill="none" />
      {Array.from({ length: SW.n }).map((_, i) => {
        const x = SW.x0 + SW.w * i;
        const y = SW.top + SW.h * (i + 1);
        return (
          <g key={`tr${i}`}>
            <polygon points={pts([{ x, y }, { x: x + SW.w, y }, { x: x + SW.w + 16, y: y - 16 }, { x: x + 16, y: y - 16 }])} fill="#6B4B42" />
            <polygon points={pts([{ x: x + 36, y: y - 4 }, { x: x + SW.w - 6, y: y - 4 }, { x: x + SW.w + 4, y: y - 12 }, { x: x + 44, y: y - 12 }])} fill="#6A3644" />
            <rect x={x} y={y} width={SW.w} height={8} fill="#7A5747" />
            <rect x={x} y={y} width={SW.w} height={2.5} fill={S3.warm} opacity={0.55} />
          </g>
        );
      })}
      <rect x={-400} y={SW.top} width={SW.x0 + 400} height={8} fill="#7A5747" />
      <rect x={-400} y={SW.top} width={SW.x0 + 400} height={2.5} fill={S3.warm} opacity={0.5} />
      <rect x={SW.x0 + SW.w * SW.n} y={SW.top + SW.h * SW.n} width={1000} height={8} fill="#7A5747" />
      {/* the bottom landing: shoes on a mat, a coat rack with a coat and an umbrella */}
      <rect x={1500} y={904} width={170} height={10} rx={4} fill="#4A2C3A" />
      <path d="M 1514 904 q 4 -18 30 -16 l 20 6 l 0 10 Z M 1580 904 q 4 -18 30 -16 l 20 6 l 0 10 Z" fill="#2A2232" />
      <path d="M 1676 910 L 1676 600 M 1650 610 L 1702 610" stroke="#2A2026" strokeWidth={8} strokeLinecap="round" />
      <path d="M 1660 616 Q 1630 700 1640 820 L 1700 820 Q 1704 700 1690 616 Z" fill="#4A5A6A" />
      <path d="M 1706 760 L 1716 900 M 1716 900 q 0 12 -12 12" stroke="#7A2E3A" strokeWidth={8} fill="none" strokeLinecap="round" />
      <path d="M 1694 700 Q 1712 690 1722 760 L 1700 770 Z" fill="#7A2E3A" />
      {/* the bottom landing: a console table with a lamp, a plant */}
      <ellipse cx={1870} cy={912} rx={170} ry={10} fill="#000" opacity={0.35} />
      <rect x={1720} y={758} width={300} height={14} fill="#5B4038" />
      <path d="M 1740 772 L 1736 910 M 1990 772 L 1994 910" stroke="#3A2826" strokeWidth={10} />
      <ellipse cx={1800} cy={756} rx={22} ry={6} fill="#2A2230" />
      <rect x={1794} y={690} width={12} height={66} fill="#2A2230" />
      <path d="M 1764 690 L 1836 690 L 1820 650 L 1780 650 Z" fill="#F2C08A" />
      <Glow x={1800} y={672} r={220} o={0.55} />
      <rect x={1900} y={716} width={40} height={42} fill="#8A5040" />
      <path d="M 1920 716 q -26 -40 -10 -80 q 10 30 10 80 M 1920 716 q 20 -46 44 -54 q -12 34 -44 54" fill="#4E7350" />
      <LightVeil
        id={`${id}veil`}
        lights={[[1475, 380, 820], [lantern.x, lantern.y, 480], [sconces[0], dado(sconces[0]) - 310, 330], [sconces[1], dado(sconces[1]) - 310, 330], [150, 290, 420], [1800, 672, 320]]}
        o={0.5}
      />
      <circle cx={1530} cy={560} r={380} fill="url(#kitBloom)" opacity={0.3} />
      <Glow x={lantern.x} y={lantern.y} r={280} o={0.35} />
      <Glow x={1800} y={672} r={170} o={0.3} />
      <Dust t={t} seed={13} x0={560} y0={260} w={1080} h={760} n={70} />
    </g>
  );
};

/** The near banister, in front of everything on the stairs, dark and a touch soft. */
export const Banister: React.FC = () => {
  const rail = (x: number) => nose(x) - 118;
  const posts: React.ReactNode[] = [];
  for (let x = 330; x < SW.x0 + SW.w * SW.n + 40; x += 75) {
    posts.push(<rect key={x} x={x - 5} y={rail(x)} width={10} height={stepY(x + 1) - rail(x)} fill="#140F1A" />);
  }
  const xa = 300;
  const xb = SW.x0 + SW.w * SW.n + 70;
  return (
    <g filter="url(#blur3)">
      {posts}
      <path d={`M ${xa} ${rail(xa)} L ${SW.x0} ${rail(SW.x0)} L ${SW.x0 + SW.w * SW.n} ${rail(SW.x0 + SW.w * SW.n)} L ${xb} ${rail(xb)}`} stroke="#1A131F" strokeWidth={18} fill="none" strokeLinecap="round" />
      <path d={`M ${xa} ${rail(xa) - 8} L ${SW.x0} ${rail(SW.x0) - 8} L ${SW.x0 + SW.w * SW.n} ${rail(SW.x0 + SW.w * SW.n) - 8} L ${xb} ${rail(xb) - 8}`} stroke={S3.warm} strokeWidth={3} opacity={0.5} fill="none" />
      <rect x={xb - 16} y={rail(xb) - 20} width={32} height={SW.top + SW.h * SW.n - rail(xb) + 20} fill="#1A131F" />
      <circle cx={xb} cy={rail(xb) - 28} r={18} fill="#1A131F" />
    </g>
  );
};


export const stepTop = (x: number) => {
  if (x < SW.x0) return SW.top;
  const i = Math.min(SW.n, Math.floor((x - SW.x0) / SW.w) + 1);
  return SW.top + SW.h * i;
};
/** A smoothed tread height for the hips, so walking down reads as steps, not a slide. */
export const hipGround = (x: number) => {
  const a = stepTop(x - 40);
  const b = stepTop(x + 40);
  const into = ((x + 40 - SW.x0) % SW.w) / 80;
  return a === b ? a : lerp(a, b, clamp(into));
};
