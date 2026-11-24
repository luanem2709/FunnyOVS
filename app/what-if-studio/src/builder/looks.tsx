// Hieu ung khi sieu nang luc dang chay: mau phim, rung hinh, chip ten nang luc, dong ho dem nguoc.
import React from 'react';
import { LookDef, TapeLines, HudChip, Dial, FONT } from '../engine';

export const POWER_IDS = ['none', 'rewind', 'pause', 'copy', 'paste', 'skip', 'chip'];

export const POWER_LOOKS = (kind: string, label?: string): LookDef => {
  const name = (label || '').toUpperCase();
  switch (kind) {
    case 'rewind':
      return {
        grade: (lv) => `saturate(${1 - 0.45 * lv}) contrast(${1 + 0.1 * lv}) hue-rotate(${-14 * lv}deg)`,
        jitter: 5,
        Overlay: ({ f, p, n }) => {
          const secs = 10 * (1 - p);
          const read = `-${String(Math.floor(secs)).padStart(2, '0')}.${String(Math.floor((secs % 1) * 100)).padStart(2, '0')}`;
          return (
            <g>
              <TapeLines f={f} />
              <HudChip f={f} label={name || 'REWIND'} icon="rewind" />
              <Dial p={1 - p} readout={read} />
              <text x={1820} y={1010} textAnchor="end" fontFamily={FONT.ui} fontSize={28} fill="#F6EFE3" opacity={0.6}>
                {`TAKE ${n + 2}`}
              </text>
            </g>
          );
        },
      };
    case 'pause':
      return {
        grade: (lv) => `saturate(${1 - 0.6 * lv}) brightness(${1 - 0.05 * lv}) hue-rotate(${-20 * lv}deg)`,
        Overlay: ({ f }) => <HudChip f={f} label={name || 'PAUSED'} icon="pause" />,
      };
    case 'copy':
      return {
        grade: (lv) => `saturate(${1 - 0.12 * lv}) hue-rotate(${-8 * lv}deg) brightness(${1 + 0.04 * lv})`,
        Overlay: ({ f }) => <HudChip f={f} label={name || 'COPY'} icon="copy" />,
      };
    case 'paste':
      return { Overlay: ({ f }) => <HudChip f={f} label={name || 'PASTE'} icon="paste" /> };
    case 'skip':
      return {
        grade: (lv) => `saturate(${1 - 0.2 * lv}) contrast(${1 + 0.08 * lv})`,
        jitter: 3,
        Overlay: ({ f }) => <HudChip f={f} label={name || 'SKIP'} icon="skip" />,
      };
    default:
      return { Overlay: ({ f }) => <HudChip f={f} label={name || 'POWER'} icon="dot" /> };
  }
};
