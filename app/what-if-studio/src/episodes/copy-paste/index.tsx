import React from 'react';
import { defineEpisode, Timeline, LookDef, HudChip } from '../../engine';
import timeline from './timeline.json';
import { S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 } from './shots';

// The power's two looks. COPY: the picture cools a touch while the selection is live, a COPY chip blinks.
// PASTE: a PASTE chip; the copy's pop and cyan ring are drawn in the shot (PasteIn), the flash is an fx cue.
const copyLook: LookDef = {
  grade: (lv) => `saturate(${1 - 0.12 * lv}) hue-rotate(${-8 * lv}deg) brightness(${1 + 0.04 * lv})`,
  Overlay: ({ f }) => <HudChip f={f} label="COPY" icon="copy" />,
};
const pasteLook: LookDef = {
  Overlay: ({ f }) => <HudChip f={f} label="PASTE" icon="paste" />,
};

export const copyPaste = defineEpisode('CopyPaste', {
  timeline: timeline as Timeline,
  shots: { S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15 },
  looks: { copy: copyLook, paste: pasteLook },
});
