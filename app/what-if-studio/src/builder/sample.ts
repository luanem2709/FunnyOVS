// Tap mau lam bang Shot Builder (khong viet code): "What if you could pause time?"
import type { Project } from './types';

export const SAMPLE: Project = {
  title: 'What if you could pause time?',
  slug: 'pause-time',
  hero: { cast: 'pipHood', color: '#2F6F73', accent: '#F2B84B' },
  shots: [
    { id: 's1', dur: 2.2, line: 'Your coffee slides off the desk.', set: 'study', cam: 'wide', actors: [{ spot: 0.45, facing: 'right', pose: 'relaxed', pose2: 'reach', expr: 'neutral', expr2: 'shock', at: 0.55 }], props: [{ type: 'mug', spot: 0.78 }] },
    { id: 's2', dur: 1.6, line: 'Your coffee slides off the desk.', set: 'tabletop', cam: 'wide', props: [{ type: 'mug', spot: 0.55 }], hand: { spot: 0.55, pose: 'open', at: 0.3 } },
    { id: 's3', dur: 1.8, line: 'You tap your wrist.', set: 'study', cam: 'close', actors: [{ spot: 0.45, facing: 'right', pose: 'stand', pose2: 'hold', expr: 'shock', expr2: 'smug', at: 0.4 }] },
    { id: 's4', dur: 2.4, line: 'The whole world stops.', set: 'study', cam: 'medium', power: { kind: 'pause', label: 'PAUSED' }, actors: [{ spot: 0.45, facing: 'right', pose: 'point', expr: 'happy', glint: true }], props: [{ type: 'mug', spot: 0.78, dy: 60 }] },
    { id: 's5', dur: 3.0, line: 'What if you could pause time?', set: 'rooftop', cam: 'wide', actors: [{ spot: 0.5, facing: 'front', pose: 'stand', pose2: 'cheer', expr: 'happy', at: 0.6 }], ui: [{ type: 'title', text: 'What if you could pause time?', accent: 'PAUSE' }] },
    { id: 's6', dur: 2.0, line: 'Pop quiz? Pause.', set: 'classroom', cam: 'medium', board: '7 x 8 = ?', actors: [{ spot: 0.5, facing: 'left', pose: 'stand', pose2: 'hand_up', expr: 'worried', expr2: 'happy', at: 0.45 }], ui: [{ type: 'tag', text: '56', mark: 'check', at: 0.5 }] },
    { id: 's7', dur: 1.8, line: 'Every answer, every time.', set: 'classroom', cam: 'xclose', power: { kind: 'pause', label: 'PAUSED' }, actors: [{ spot: 0.5, facing: 'left', pose: 'stand', expr: 'happy', expr2: 'cool', at: 0.3 }], ui: [{ type: 'rings', at: 0.35 }] },
    { id: 's8', dur: 2.2, line: 'Infinite snacks.', set: 'kitchen', cam: 'wide', actors: [{ spot: 0.5, facing: 'front', pose: 'cheer', expr: 'happy' }], props: [{ type: 'cookies', spot: 0.2, at: 0.2 }, { type: 'cookies', spot: 0.8, at: 0.4 }] },
    { id: 's9', dur: 2.6, line: 'But your heart keeps beating: about 100,000 times a day.', set: 'schematic', cam: 'wide', ui: [{ type: 'count', to: 100000, y: 560 }, { type: 'label', text: 'heartbeats a day', y: 700, at: 0.2 }] },
    { id: 's10', dur: 2.0, line: 'Paused or not, you still get older.', set: 'bedroom-bed', cam: 'close', board: '03:00', actors: [{ spot: 0.5, facing: 'right', pose: 'tired', expr: 'tired' }] },
    { id: 's11', dur: 2.6, line: "And the world won't wait forever.", set: 'rooftop-low', cam: 'wide', red: 1, shake: true, actors: [{ spot: 0.5, facing: 'front', pose: 'stand', pose2: 'recoil', expr: 'worried', expr2: 'shock', at: 0.4 }] },
  ],
};
