import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Hero, basePose, Pose, LOOKS, CastName, KitDefs, SetDefs, Study, FONT } from './engine';

// The cast sheet: every costume on the one rig, front and three-quarter, over a soft set so contrast is judged in
// place, plus a row of acting poses. Render it after adding or changing a look:
//   npx remotion still src/index.ts Cast out/cast.png

const Label: React.FC<{ x: number; y: number; text: string }> = ({ x, y, text }) => (
  <text x={x} y={y} textAnchor="middle" fontFamily={FONT.ui} fontSize={24} fill="#F6EFE3" letterSpacing={2}>
    {text}
  </text>
);
const P = (o: Partial<Pose>): Pose => ({ ...basePose, ...o });
const NAMES: Record<CastName, string> = { pip: 'PIP A', pipHood: 'PIP B (HERO)', pipInk: 'PIP C', mo: 'MO, FRIEND', sis: 'SISTER', mom: 'MUM', suit: 'THE SUIT' };

export const CastSheet: React.FC = () => {
  const cast = Object.keys(LOOKS) as CastName[];
  const row1 = 430;
  const row2 = 900;
  const poses: { name: string; p: Partial<Pose> }[] = [
    { name: 'thinking', p: { armR: { a: 120, b: 110 }, armL: { a: -10, b: -70 }, headTilt: 8, expr: 'worried', yaw: 0.2 } },
    { name: 'shrug', p: { armL: { a: 40, b: 80 }, armR: { a: 40, b: 80 }, headTilt: -10, expr: 'oops' } },
    { name: 'point', p: { armR: { a: 95, b: -5 }, armL: { a: 10, b: -8 }, look: 1, yaw: 0.35, expr: 'smug', handR: 'point' } },
    { name: 'cheer', p: { armL: { a: 135, b: 20 }, armR: { a: 135, b: 20 }, expr: 'happy', squash: -0.05 } },
    { name: 'shock', p: { armL: { a: 60, b: 40 }, armR: { a: 60, b: 40 }, expr: 'shock', yaw: -0.3, look: -0.6 } },
  ];
  return (
    <AbsoluteFill style={{ backgroundColor: '#14101C' }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <KitDefs />
        <SetDefs />
        <g filter="url(#blur10)">
          <Study t={0} id="cast" />
        </g>
        <rect width={1920} height={1080} fill="#0B0816" opacity={0.35} />
        {cast.map((c, i) => {
          const x = 150 + i * 270;
          const small = c === 'sis' ? 0.68 : 0.82;
          return (
            <g key={c}>
              <Hero look={LOOKS[c]} pose={P({ x, y: row1 + (0.82 - small) * 340, scale: small, yaw: i % 2 ? -0.35 : 0.35, look: i % 2 ? -0.5 : 0.5, expr: 'happy' })} shadow={0.6} />
              <Label x={x} y={row1 + 170} text={NAMES[c]} />
            </g>
          );
        })}
        {poses.map((q, i) => (
          <g key={q.name}>
            <Hero look={LOOKS.pipHood} pose={P({ x: 220 + i * 370, y: row2 - 40, scale: 0.72, ...q.p })} shadow={0.6} />
            <Label x={220 + i * 370} y={row2 + 110} text={q.name.toUpperCase()} />
          </g>
        ))}
      </svg>
    </AbsoluteFill>
  );
};
