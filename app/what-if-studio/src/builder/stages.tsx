// Cac boi canh dung san cua engine, kem cach dat nhan vat, do vat va goc may toan canh cho tung boi canh.
import React from 'react';
import {
  Study, Desk, STUDY, Classroom, SchoolDesk, Stairwell, Banister, hipGround, stepTop, Rooftop, Kitchen, KitchenIsland, KITCHEN,
  islandTop, Bedroom, BEDROOM, bedSit, BedDuvet, Schematic, Tabletop, stand, LEG_LEN, FONT, Glow, LightVeil, clamp, lerp, easeInOut,
} from '../engine';
import type { ShotSpec } from './types';

export type Place = { x: number; y: number; scale: number };
export type Ctx = { t: number; k: number; len: number; shot: ShotSpec; id: string; fx: number };

export type StageDef = {
  label: string; // ten hien trong giao dien
  actors: boolean; // co dat nhan vat duoc khong
  back: (c: Ctx) => React.ReactNode; // ve truoc nhan vat
  front?: (c: Ctx, hero?: Place) => React.ReactNode; // ve sau nhan vat (ban, lan can...)
  place: (u: number) => Place; // diem hong nhan vat tai vi tri u (0..1)
  ground?: number | ((x: number) => number); // mat dat duoi hong, cho dang di bo
  surface: (u: number) => Place; // mat dat do vat (ban, ke...)
  floor: (u: number) => Place;
  wide: (hero?: Place) => [number, number, number]; // may quay toan canh: tam x, tam y, zoom
  rim: string;
  shadow?: number; // bong duoi chan (0 khi chan bi ban che)
  mediumUp?: number; // trung canh: nang khung len bao nhieu (khi chan bi ban che)
  screen?: boolean; // do vat ve theo toa do man hinh (canh dac ta ban)
  seat?: (u: number) => Place; // cho ngoi (tu the sit): diem hong khi dung, ngoi se ha xuong 70
  hint: string;
};

const ramp = (c: Ctx) => c.fx * easeInOut(clamp(c.k));

const boardText = (s?: string) =>
  s ? (
    <g>
      {s.split('\n').slice(0, 3).map((ln, i, all) => (
        <text key={i} x={740} y={360 - (all.length - 1) * 55 + i * 110} textAnchor="middle" fontFamily={FONT.hand} fontSize={all.length > 1 ? 86 : 110} fill="#EDEFE6" opacity={0.92}>
          {ln}
        </text>
      ))}
    </g>
  ) : undefined;

const floorStand = (r: typeof STUDY, u0: number, u1: number, w: number) => (u: number) => stand(r, lerp(u0, u1, u), w);
const floorPt = (r: typeof STUDY, u0: number, u1: number, w: number, k = 1) => (u: number): Place => {
  const p = r.P(lerp(u0, u1, u), 1, w);
  return { x: p.x, y: p.y, scale: k * r.s(w) / r.s(0.4) };
};

export const STAGES: Record<string, StageDef> = {
  study: {
    label: 'Phong lam viec (sau ban)',
    hint: 'Nhan vat dung sau ban, do vat dat tren ban. night = ban dem, fx2 = sach bay khoi ke.',
    actors: true,
    back: (c) => <Study t={c.t} id={c.id} night={!!c.shot.night} shelf={1 - ramp(c)} veil={c.shot.cam === 'wide' ? 0.3 : 0.44} />,
    front: () => <Desk x0={560} x1={1360} y={700} />,
    mediumUp: 180,
    place: (u) => ({ x: lerp(700, 1220, u), y: 712, scale: 1 }),
    surface: (u) => ({ x: lerp(640, 1300, u), y: 700, scale: 1 }),
    floor: floorPt(STUDY, 0.2, 0.8, 0.8, 1.6),
    wide: () => [990, 545, 0.9],
    rim: 'rimR',
  },
  room: {
    label: 'Phong lam viec (dung giua phong)',
    hint: 'Cung phong lam viec nhung khong co ban o giua, nhan vat dung tren san.',
    actors: true,
    back: (c) => <Study t={c.t} id={c.id} night={!!c.shot.night} shelf={1 - ramp(c)} veil={0.3} />,
    place: floorStand(STUDY, 0.3, 0.75, 0.5),
    surface: floorPt(STUDY, 0.3, 0.75, 0.5),
    floor: floorPt(STUDY, 0.3, 0.75, 0.5),
    wide: () => [980, 545, 0.92],
    rim: 'rimR',
  },
  classroom: {
    label: 'Lop hoc',
    hint: 'Nhan vat o ban hoc phia truoc ben phai. board = chu tren bang (xuong dong de them dong). fx2 > 0.5 = ca lop cuoi.',
    actors: true,
    back: (c) => <Classroom t={c.t} id={c.id} laugh={c.fx > 0.5 ? 1 : 0} board={boardText(c.shot.board)} />,
    front: (_c, hero) => <SchoolDesk x={hero ? hero.x : 1260} />,
    mediumUp: 190,
    place: (u) => ({ x: lerp(1060, 1460, u), y: 760, scale: 1 }),
    surface: (u) => ({ x: lerp(1110, 1410, u), y: 750, scale: 0.8 }),
    floor: (u) => ({ x: lerp(900, 1500, u), y: 990, scale: 1 }),
    wide: () => [960, 520, 1.0],
    rim: 'rimL',
  },
  stairwell: {
    label: 'Cau thang',
    hint: 'Cau thang di xuong ben phai. Dung "to" de nhan vat di/chay xuong cau thang.',
    actors: true,
    back: (c) => <Stairwell t={c.t} id={c.id} />,
    front: () => <Banister />,
    place: (u) => {
      const x = lerp(430, 1300, u);
      return { x, y: hipGround(x) - LEG_LEN * 0.9, scale: 0.9 };
    },
    ground: hipGround,
    surface: (u) => {
      const x = lerp(430, 1300, u);
      return { x, y: stepTop(x), scale: 0.9 };
    },
    floor: (u) => {
      const x = lerp(430, 1300, u);
      return { x, y: stepTop(x), scale: 0.9 };
    },
    wide: (h) => [h ? clamp(h.x + 80, 760, 1200) : 960, h ? clamp(h.y - 60, 420, 640) : 540, 1.12],
    rim: 'rimR',
  },
  rooftop: {
    label: 'San thuong luc hoang hon',
    hint: 'Nhan vat nho giua thanh pho. red = troi do, fx2 = thanh pho mat dien dan. Hop voi canh tieu de.',
    actors: true,
    back: (c) => (
      <Rooftop t={c.t} sunX={960} sunY={660} red={c.shot.red ?? 0} blackout={ramp(c)} lightsOut={clamp(ramp(c) * 1.4 - 0.4)} cityLit={c.fx > 0 ? 2.5 : 1} />
    ),
    place: (u) => ({ x: lerp(640, 1280, u), y: 820 - LEG_LEN * 0.62, scale: 0.62 }),
    ground: 820,
    surface: (u) => ({ x: lerp(640, 1280, u), y: 820, scale: 0.7 }),
    floor: (u) => ({ x: lerp(640, 1280, u), y: 820, scale: 0.7 }),
    wide: () => [960, 540, 1.04],
    rim: 'rimR',
  },
  'rooftop-low': {
    label: 'San thuong, may thap nhin len',
    hint: 'Goc may thap nhin len nhan vat tren nen troi. red = troi do.',
    actors: true,
    back: (c) => <Rooftop t={c.t} sunX={1080} sunY={540} red={c.shot.red ?? 0} low={260} lightsOut={ramp(c)} />,
    place: (u) => ({ x: lerp(760, 1160, u), y: 790, scale: 1.8 }),
    ground: 790 + LEG_LEN * 1.8,
    surface: (u) => ({ x: lerp(700, 1220, u), y: 1040, scale: 1.8 }),
    floor: (u) => ({ x: lerp(700, 1220, u), y: 1040, scale: 1.8 }),
    wide: () => [960, 540, 1.0],
    rim: 'rimR',
  },
  kitchen: {
    label: 'Nha bep',
    hint: 'Nhan vat dung sau dao bep, do vat dat tren mat dao. red = anh sang do.',
    actors: true,
    back: (c) => <Kitchen t={c.t} id={c.id} red={c.shot.red ?? 0} veil={c.shot.cam === 'wide' ? 0.36 : 0.5} />,
    front: () => <KitchenIsland />,
    mediumUp: 170,
    place: floorStand(KITCHEN, 0.3, 0.7, 0.4),
    surface: (u) => {
      const p = islandTop(lerp(0.3, 0.7, u), 0.5);
      return { x: p.x, y: p.y, scale: 1 };
    },
    floor: floorPt(KITCHEN, 0.2, 0.8, 0.85, 1.5),
    wide: () => [960, 560, 1.0],
    rim: 'rimR',
  },
  bedroom: {
    label: 'Phong ngu (ban dem, dung)',
    hint: 'Phong ngu ban dem, nhan vat dung tren san. board = chu tren dong ho bao thuc.',
    actors: true,
    back: (c) => <Bedroom t={c.t} id={c.id} clock={c.shot.board || '03:00'} lamp={1 - ramp(c)} />,
    place: floorStand(BEDROOM, 0.5, 0.85, 0.6),
    surface: floorPt(BEDROOM, 0.5, 0.85, 0.6),
    floor: floorPt(BEDROOM, 0.5, 0.85, 0.6),
    wide: () => [960, 540, 1.0],
    rim: 'rimR',
  },
  'bedroom-bed': {
    label: 'Phong ngu (ngoi tren giuong)',
    hint: 'Nhan vat ngoi tren giuong, chan trong chan. fx2 = den ngu tat dan.',
    actors: true,
    back: (c) => <Bedroom t={c.t} id={c.id} duvet={false} clock={c.shot.board || '03:00'} lamp={1 - ramp(c)} />,
    front: () => <BedDuvet knees={0.6} />,
    place: (u) => bedSit(lerp(0.12, 0.3, u)),
    surface: floorPt(BEDROOM, 0.5, 0.85, 0.6),
    floor: floorPt(BEDROOM, 0.5, 0.85, 0.6),
    wide: () => [900, 560, 1.15],
    rim: 'rimR',
  },
  schematic: {
    label: 'Ban ve khoa hoc (doan su that)',
    hint: 'Nen ban ve xanh dam cho doan giai thich khoa hoc. Dung chu "count" va "label".',
    actors: false,
    back: (c) => <Schematic t={c.t} id={c.id} />,
    place: (u) => ({ x: lerp(600, 1320, u), y: 820 - LEG_LEN * 0.8, scale: 0.8 }),
    surface: (u) => ({ x: lerp(500, 1420, u), y: 700, scale: 1.4 }),
    floor: (u) => ({ x: lerp(500, 1420, u), y: 820, scale: 1.4 }),
    wide: () => [960, 540, 1.0],
    rim: 'rimR',
  },
  tabletop: {
    label: 'Dac ta mat ban (nhin cheo tu tren)',
    hint: 'Can canh do vat tren ban. Do vat dat theo vi tri ngang; dung "hand" de dua canh tay vao.',
    actors: false,
    screen: true,
    back: (c) => (
      <g>
        <Tabletop edge={900} />
        <LightVeil id={`${c.id}v`} lights={[[960, 430, 760]]} o={0.5} />
        <Glow x={980} y={420} r={640} o={0.3} />
      </g>
    ),
    place: (u) => ({ x: lerp(500, 1420, u), y: 620, scale: 1 }),
    surface: (u) => ({ x: lerp(480, 1440, u), y: 700, scale: 3.6 }),
    floor: (u) => ({ x: lerp(480, 1440, u), y: 700, scale: 3.6 }),
    wide: () => [960, 540, 1.0],
    rim: 'rimR',
  },
  'tabletop-top': {
    label: 'Mat ban nhin thang tu tren xuong',
    hint: 'Goc tu tren xuong. Hop voi do vat ve tu tren: paper, papers, pizza, cookie, plate, phone.',
    actors: false,
    screen: true,
    back: (c) => (
      <g>
        <Tabletop edge={1400} />
        <LightVeil id={`${c.id}v`} lights={[[1000, 460, 820]]} o={0.45} />
        <Glow x={1100} y={420} r={720} o={0.3} />
      </g>
    ),
    place: (u) => ({ x: lerp(500, 1420, u), y: 620, scale: 1 }),
    surface: (u) => ({ x: lerp(480, 1440, u), y: 600, scale: 3.2 }),
    floor: (u) => ({ x: lerp(480, 1440, u), y: 600, scale: 3.2 }),
    wide: () => [960, 540, 1.0],
    rim: 'rimR',
  },
};

export const STAGE_IDS = Object.keys(STAGES);
