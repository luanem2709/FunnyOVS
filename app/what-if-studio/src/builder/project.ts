// Bien mot Project (du lieu) thanh tap phim cho engine: timeline, cac canh, hieu ung sieu nang luc.
import type { Timeline, ShotMap, LookDef, Seg, ShotInfo, Fx } from '../engine';
import { makeShot } from './BuiltShot';
import { POWER_LOOKS } from './looks';
import type { Project } from './types';

export const FPS = 30;
export const shotFrames = (dur: number) => Math.max(6, Math.round((Number(dur) || 2) * FPS));
export const totalFrames = (p: Project) => (p.shots ?? []).reduce((a, s) => a + shotFrames(s.dur), 0);

export const buildEpisode = (p: Project): { timeline: Timeline; shots: ShotMap; looks: Record<string, LookDef> } => {
  const segments: Seg[] = [];
  const infos: ShotInfo[] = [];
  const fx: Fx[] = [];
  const shots: ShotMap = {};
  const looks: Record<string, LookDef> = {};
  let a = 0;
  (p.shots ?? []).forEach((s, i) => {
    const id = `B${i + 1}`;
    const len = shotFrames(s.dur);
    shots[id] = makeShot(s, p, i);
    let look: string | undefined;
    if (s.power && s.power.kind && s.power.kind !== 'none') {
      look = `${s.power.kind}:${s.power.label ?? ''}`;
      if (!looks[look]) looks[look] = POWER_LOOKS(s.power.kind, s.power.label);
    }
    segments.push({ shot: id, a, b: a + len, t0: s.reverse ? len : 0, t1: s.reverse ? 0 : len, look, line: s.line ?? '' });
    infos.push({ id, size: s.cam ?? 'wide', key: Math.round(len * 0.6), len, first: a, line: s.line ?? '' });
    if (s.flash) fx.push({ f: a, kind: 'flash' });
    if (s.shake) fx.push({ f: a, kind: 'shake', len: 10, amp: 14 });
    a += len;
  });
  const timeline: Timeline = { slug: p.slug || 'tap', title: p.title || '', fps: FPS, total: Math.max(1, a), segments, shots: infos, fx, audio: {} };
  return { timeline, shots, looks };
};
