import React from 'react';
import { rnd } from '../anim';
import { DuskSky, Sun } from '../kit';
import { S3 } from '../room';
import { Glow } from '../light';

// The rooftop at dusk: a big low sun (optionally a clock face), clouds lit from below, the city in three depths with
// lit windows, a water tower, our roof with string lights between two poles. The turn: `red` floods the sky and the
// city, `lightsOut` kills the string lights one by one, `blackout` turns the city's windows off in a sweep from the left (raise `cityLit`, about 2.5, so there's plenty to switch off).
// `low` lowers the camera (the city and roof drop in frame, the lights climb) for looking up at a character.
/** A sun with a clock face in it: hands that spin, and a crack that draws down it. */
export const SunClock: React.FC<{ x: number; y: number; r: number; t: number; spin: number; red: number; crack: number }> = ({ x, y, r, t, spin, red, crack }) => (
  <g>
    <Sun x={x} y={y} r={r} t={t} red={red} />
    {Array.from({ length: 12 }).map((_, i) => (
      <path key={i} d={`M 0 ${-r * 0.86} L 0 ${-r * 0.7}`} transform={`translate(${x} ${y}) rotate(${i * 30})`} stroke="#B8562E" strokeWidth={5} strokeLinecap="round" opacity={0.7} />
    ))}
    <path d={`M 0 0 L 0 ${-r * 0.62}`} transform={`translate(${x} ${y}) rotate(${-spin * 1.3})`} stroke="#8E3B22" strokeWidth={8} strokeLinecap="round" />
    <path d={`M 0 0 L 0 ${-r * 0.42}`} transform={`translate(${x} ${y}) rotate(${-spin * 0.2 + 120})`} stroke="#8E3B22" strokeWidth={10} strokeLinecap="round" />
    <circle cx={x} cy={y} r={8} fill="#8E3B22" />
    {crack > 0 ? (
      <path
        d={`M ${x + 20} ${y - r - 10} L ${x - 6} ${y - r * 0.5} L ${x + 26} ${y - r * 0.2} L ${x - 14} ${y + r * 0.25} L ${x + 18} ${y + r * 0.6} L ${x - 4} ${y + r + 10}`}
        stroke="#3A0610"
        strokeWidth={7}
        fill="none"
        strokeLinejoin="round"
        strokeDasharray={800}
        strokeDashoffset={800 * (1 - crack)}
      />
    ) : null}
  </g>
);

/** Is a window at x dark yet? The blackout sweeps from the left edge to the right, a little ragged. */
const dark = (x: number, blackout: number, q: number) => blackout > 0 && (x + 420) / 2760 < blackout * 1.18 - q * 0.18;

const CityLayer: React.FC<{ base: number; h: number; seed: number; color: string; lit: number; win: string; t: number; antennas?: boolean; blackout?: number }> = ({ base, h, seed, color, lit, win, t, antennas, blackout = 0 }) => {
  const out: React.ReactNode[] = [];
  let x = -420;
  let i = 0;
  while (x < 2340) {
    const bw = 70 + rnd(seed, i) * 130;
    const bh = h * (0.35 + rnd(seed + 1, i) * 0.65);
    const top = base - bh;
    out.push(<rect key={`b${i}`} x={x} y={top} width={bw + 1} height={bh + 400} fill={color} />);
    if (rnd(seed + 8, i) > 0.6) out.push(<rect key={`p${i}`} x={x + bw * 0.2} y={top - 14} width={bw * 0.5} height={14} fill={color} />);
    const cols = Math.floor((bw - 16) / 18);
    const rowsN = Math.floor((bh - 20) / 24);
    for (let c = 0; c < cols; c++) {
      for (let rr = 0; rr < rowsN; rr++) {
        const q = rnd(seed + 3, i * 97 + c * 13 + rr);
        if (q < lit && !dark(x + c * 18, blackout, rnd(seed + 9, i * 97 + c * 13 + rr))) out.push(<rect key={`w${i}-${c}-${rr}`} x={x + 10 + c * 18} y={top + 14 + rr * 24} width={9} height={12} fill={q < lit * 0.2 ? '#9FC0FF' : win} opacity={0.5 + q} />);
      }
    }
    if (antennas && rnd(seed + 5, i) > 0.72) {
      const ax = x + bw * 0.6;
      out.push(<path key={`a${i}`} d={`M ${ax} ${top} L ${ax} ${top - 70}`} stroke={color} strokeWidth={4} />);
      const on = Math.floor((t + i * 7) / 18) % 2 === 0 && !dark(ax, blackout, 0.5);
      out.push(<circle key={`al${i}`} cx={ax} cy={top - 72} r={4} fill="#FF4A4A" opacity={on ? 1 : 0.25} />);
      if (on) out.push(<Glow key={`ag${i}`} x={ax} y={top - 72} r={30} kind="red" o={0.7} />);
    }
    x += bw + 2;
    i++;
  }
  return <g>{out}</g>;
};

export const Rooftop: React.FC<{ t: number; sunX?: number; sunY?: number; clock?: boolean; spin?: number; red?: number; crack?: number; lightsOut?: number; blackout?: number; low?: number; cityLit?: number }> = ({
  t, sunX = 960, sunY = 640, clock = false, spin = 0, red = 0, crack = 0, lightsOut = 0, blackout = 0, low = 0, cityLit = 1,
}) => {
  const sag = (x: number) => 440 + 80 * (1 - Math.pow((x - 960) / 860, 2)) + Math.sin(t / 22 + x / 400) * 5 * (1 - Math.pow((x - 960) / 860, 2));
  const bulbs = Array.from({ length: 15 }).map((_, i) => 140 + i * 117);
  return (
    <g>
      <DuskSky id="roof3" horizonY={760} red={red} />
      {/* long clouds lit from below by the low sun */}
      <g filter="url(#blur6)" opacity={1 - red * 0.6}>
        {[
          [300, 260, 360, 26],
          [1320, 210, 420, 30],
          [820, 360, 300, 20],
          [1600, 400, 260, 18],
          [120, 440, 240, 16],
        ].map(([cx, cy, rx, ry], i) => (
          <g key={i} transform={`translate(${(t * 0.2 * (i % 2 ? 1 : -1)) % 60} 0)`}>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#6A3E6E" opacity={0.7} />
            <ellipse cx={cx + 10} cy={cy + ry * 0.5} rx={rx * 0.9} ry={ry * 0.45} fill="#F29A6A" opacity={0.55} />
          </g>
        ))}
      </g>
      {clock ? <SunClock x={sunX} y={sunY} r={170} t={t} spin={spin} red={red} crack={crack} /> : <Sun x={sunX} y={sunY} r={170} t={t} red={red} />}
      {[0, 1, 2, 3].map((i) => {
        const bx = ((200 + t * (1.1 + i * 0.15) + i * 420) % 2300) - 200;
        const by = 220 + i * 34 + Math.sin(t / 18 + i) * 10;
        const fl = Math.sin(t / 2.6 + i * 1.3) * 7;
        return <path key={`bird${i}`} d={`M ${bx - 13} ${by + fl * 0.4} Q ${bx - 6} ${by - 6 + fl} ${bx} ${by} Q ${bx + 6} ${by - 6 + fl} ${bx + 13} ${by + fl * 0.4}`} stroke="#2A1A30" strokeWidth={3.5} fill="none" strokeLinecap="round" opacity={0.85} />;
      })}
      {/* a low camera (low > 0): the city and the roof drop in frame, the lights climb */}
      <g transform={`translate(0 ${low})`}>
      {/* the city in three depths: hazy, middle, and the near blocks at the edges */}
      <CityLayer base={790} h={250} seed={21} color={red > 0.5 ? '#4A1A2A' : '#6A4A70'} lit={Math.min(0.9, 0.12 * cityLit)} win="#FFD0A0" t={t} blackout={blackout} />
      <rect x={-400} y={600} width={2720} height={240} fill="url(#kitShaft)" opacity={0.5} />
      <CityLayer base={806} h={200} seed={33} color={red > 0.5 ? '#2E0E1C' : '#3E2E52'} lit={Math.min(0.9, 0.22 * cityLit)} win="#FFC27A" t={t} antennas blackout={blackout} />
      {/* a water tower on a nearer roof */}
      <g fill={red > 0.5 ? '#1E0812' : '#2A2040'}>
        <path d="M 1510 700 L 1500 790 M 1590 700 L 1600 790 M 1550 700 L 1550 790" stroke={red > 0.5 ? '#1E0812' : '#2A2040'} strokeWidth={8} />
        <rect x={1494} y={620} width={112} height={84} rx={6} />
        <path d="M 1486 622 L 1550 584 L 1614 622 Z" />
      </g>
      <rect x={-400} y={170} width={560} height={700} fill="#21182C" />
      {Array.from({ length: 4 }).map((_, c) =>
        Array.from({ length: 9 }).map((__, rr) => {
          const q = rnd(51, c * 11 + rr);
          return q > 0.45 && !dark(-20 + c * 42, blackout, q) ? <rect key={`lb${c}${rr}`} x={-20 + c * 42} y={200 + rr * 62} width={26} height={38} fill={q > 0.85 ? '#9FC0FF' : '#FFC27A'} opacity={(0.55 + q * 0.4) * (1 - red * 0.6)} /> : null;
        }),
      )}
      <path d="M 160 170 L 160 870" stroke="#2E2440" strokeWidth={6} />
      <rect x={1770} y={260} width={600} height={620} fill="#1E1628" />
      {Array.from({ length: 3 }).map((_, c) =>
        Array.from({ length: 8 }).map((__, rr) => {
          const q = rnd(57, c * 11 + rr);
          return q > 0.5 && !dark(1800 + c * 44, blackout, q) ? <rect key={`rb${c}${rr}`} x={1800 + c * 44} y={290 + rr * 62} width={26} height={38} fill="#FFC27A" opacity={(0.5 + q * 0.4) * (1 - red * 0.6)} /> : null;
        }),
      )}
      {/* fire escape on the right block */}
      <path d="M 1770 420 L 1700 420 L 1770 520 L 1700 520 L 1770 620 L 1700 620 L 1770 720" stroke="#120C18" strokeWidth={5} fill="none" />
      {/* our roof: the parapet, then the deck coming toward us */}
      <rect x={-400} y={790} width={2720} height={34} fill={red > 0.5 ? '#1A0810' : '#2B2230'} />
      <rect x={-400} y={790} width={2720} height={3} fill={S3.warm} opacity={0.45 * (1 - red)} />
      <rect x={-400} y={824} width={2720} height={700} fill={red > 0.5 ? '#0E050C' : '#181220'} />
      {Array.from({ length: 70 }).map((_, i) => (
        <circle key={`gr${i}`} cx={-200 + rnd(61, i) * 2300} cy={840 + rnd(62, i) * 300} r={1.5 + rnd(63, i) * 3} fill="#2A2232" />
      ))}
      {/* a puddle on the deck holding the sky, plant pots on the parapet, a folding chair */}
      <ellipse cx={1180} cy={900} rx={190} ry={22} fill="#E0906A" opacity={0.25 * (1 - red)} />
      <ellipse cx={1180} cy={900} rx={150} ry={14} fill="#6A3E6E" opacity={0.3 * (1 - red)} />
      {[1100, 1180, 1250].map((x, i) => (
        <g key={`pot${i}`}>
          <path d={`M ${x - 20} 790 L ${x + 20} 790 L ${x + 15} 760 L ${x - 15} 760 Z`} fill="#8A5040" />
          <path d={`M ${x} 760 q -22 -30 -8 -58 q 8 26 8 58 M ${x} 760 q 18 -34 34 -38 q -8 24 -34 38`} fill={red > 0.5 ? '#1E0A10' : '#4E7350'} />
        </g>
      ))}
      <path d="M 1580 860 L 1640 760 M 1660 860 L 1600 760 M 1586 800 L 1656 800" stroke="#3A3444" strokeWidth={8} strokeLinecap="round" />
      <path d="M 1596 760 L 1652 752 L 1660 790 L 1604 798 Z" fill="#5A4A6A" />
      {/* rooftop clutter: an AC unit, vent pipes, a dish */}
      <rect x={240} y={730} width={230} height={110} rx={6} fill="#3A3444" />
      <path d="M 470 736 L 520 760 L 520 846 L 470 840 Z" fill="#2A2532" />
      <circle cx={355} cy={785} r={36} fill="#2A2532" />
      <path d="M 325 785 L 385 785 M 355 755 L 355 815" stroke="#3A3444" strokeWidth={6} />
      <rect x={240} y={730} width={230} height={3} fill={S3.warm} opacity={0.5} />
      <rect x={640} y={760} width={22} height={74} fill="#3A3444" />
      <ellipse cx={651} cy={760} rx={16} ry={5} fill="#4A4454" />
      <rect x={690} y={784} width={16} height={50} fill="#3A3444" />
      <path d="M 1430 840 L 1440 760" stroke="#3A3444" strokeWidth={8} />
      <path d="M 1400 740 Q 1440 700 1490 730 Q 1460 790 1400 740 Z" fill="#4A4454" />
      </g>
      <g transform={`translate(0 ${-low * 0.8})`}>
      {/* string lights between two poles: they go out one by one at the turn */}
      <path d={`M 140 ${860 + low * 1.8} L 140 430 M 1780 ${860 + low * 1.8} L 1780 430`} stroke="#120C18" strokeWidth={8} />
      <path d={`M 140 440 Q 960 ${440 + 160 + Math.sin(t / 22 + 2.4) * 10} 1780 440`} stroke="#120C18" strokeWidth={3} fill="none" />
      {bulbs.map((x, i) => {
        const y = sag(x) + 10;
        const out = lightsOut * bulbs.length > i;
        return (
          <g key={`bl${i}`}>
            <circle cx={x} cy={y} r={8} fill={out ? '#3A2A2A' : '#FFE2B0'} />
            {out ? null : <Glow x={x} y={y} r={46} o={0.8} />}
          </g>
        );
      })}
      </g>
      {red > 0 ? <rect x={-400} y={-400} width={2720} height={1900} fill="#16000A" opacity={0.42 * red} /> : null}
    </g>
  );
};
