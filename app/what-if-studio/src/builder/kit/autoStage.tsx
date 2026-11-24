import React from 'react';
import type {StageDef} from '../stages';
import {backgroundArtwork} from './autoArtwork';
import {LIES_SETS, liesArtwork} from './liesArtwork';
import {ADDONS} from './addonData';

// khung ve cua goi bo sung: toa do 0..1920 x 0..1080 nhu khung hinh, nen ve tran ra -300..2220 x -200..1300
const addonHref = (body: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-600 -400 3120 2100">' + body + '</svg>');

export function autoStage(name: string): StageDef {
  const add = ADDONS.sets[name];
  if (add) {
    const pick = (tod: string) => typeof add.svg === 'string' ? add.svg : ((add.svg as any)[tod] || add.svg.day || Object.values(add.svg)[0] || '');
    const onFloor = (u: number) => ({x: 300 + 1320 * u, y: 945, scale: 1});
    return {
      label: add.name || name, hint: add.hint || 'Bối cảnh bổ sung', actors: add.actors !== false, rim: 'popRim',
      back: c => <image x={-600} y={-400} width={3120} height={2100} href={addonHref(pick(c.shot.tod ?? (c.shot.night ? 'night' : 'day')))} />,
      place: u => ({x: 300 + 1320 * u, y: 763, scale: 1.3}),
      surface: onFloor, floor: onFloor, wide: () => [960, 540, 1],
    };
  }
  if (LIES_SETS.includes(name)) {
    const insert = name === 'lies_wristband';
    const onDeck = name === 'lies_yacht_deck';
    const left = onDeck ? 850 : 300;
    const right = onDeck ? 1580 : 1620;
    const floor = (u: number) => ({x: left + (right - left) * u, y: 945, scale: 1});
    return {
      label: name, hint: 'Bối cảnh Every Lie Came True', actors: !insert, rim: 'popRim',
      back: c => <image x={-600} y={-400} width={3120} height={2100}
        href={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(liesArtwork(name, {
          tod: c.shot.tod ?? (c.shot.night ? 'night' : 'day'),
          progress: c.k, effect: c.fx, board: c.shot.board,
        }))} />,
      place: u => ({x: left + (right - left) * u, y: 763, scale: 1.3}),
      surface: floor, floor, wide: () => [960, 540, 1],
    };
  }
  const href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(backgroundArtwork(name));
  const onFloor = (u: number) => ({ x: 300 + 1320 * u, y: 945, scale: 1 });
  return {
    label: name, hint: 'Bối cảnh tự dựng', actors: true, rim: 'popRim',
    back: () => <image x={-600} y={-400} width={3120} height={2100} href={href} />,
    place: u => ({x: 300 + 1320 * u, y: 763, scale: 1.3}),
    surface: onFloor, floor: onFloor, wide: () => [960, 540, 1],
  };
}
