// Bo nhan vat rieng "Pop": nguoi que dau tron to, ao hoodie/ao phong/vest..., mat to co tron trang va con nguoi,
// nhieu kieu toc va phu kien. Dung chung bo xuong (Pose, joints) voi engine nen moi tu the/chuyen dong deu dung duoc.
import React from 'react';
import { joints, turnWidth, LEG_LEN, HEAD, Pose, HandKind } from '../../engine';
import { ADDONS } from './addonData';

export type Hair = 'tuft' | 'spiky' | 'cap' | 'beanie' | 'pony' | 'bun' | 'bald' | 'curly' | 'twin' | 'side' | 'long' | 'antenna' | 'none' | 'afro' | 'mohawk' | 'bob' | 'police' | 'chef' | 'hardhat' | 'crown' | 'headband' | 'helmet' | 'swoop';
export type Top = 'hoodie' | 'tee' | 'suit' | 'dress' | 'labcoat' | 'jacket' | 'apron' | 'sweater' | 'vest' | 'jersey' | 'uniform' | 'stripe' | 'spacesuit' | 'robot';
export type KidLook = {
  kit: 'pop';
  skin: string;
  skinShade: string;
  line: string;
  top: string; // mau ao chinh
  topShade: string;
  trim: string; // day mu, co ao, ca vat...
  pants: string;
  shoe: string;
  hair: string;
  hairStyle: Hair;
  topStyle: Top;
  hatColor?: string;
  glasses?: boolean;
  mustache?: boolean;
  backpack?: string; // mau balo
  beard?: boolean;
  headphones?: string; // mau tai nghe
  mask?: boolean; // mat na ke trom
  cape?: string; // mau ao choang
  number?: string; // so tren ao the thao
  tie?: string;
  blush?: boolean;
  // cho tuong thich voi engine (canh tay dua vao khung)
  hand: string;
  limb: string;
};

export const shadeHex = (hex: string, k: number) => {
  const n = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(n.slice(i, i + 2), 16) * k))));
  return '#' + v.map((x) => x.toString(16).padStart(2, '0')).join('');
};

const mk = (o: Partial<KidLook> & { top: string; hairStyle: Hair }): KidLook => ({
  kit: 'pop',
  skin: '#FFFFFF',
  skinShade: '#E4E6F2',
  line: '#1B1530',
  topShade: shadeHex(o.top, 0.8),
  trim: '#FFFFFF',
  pants: '#2F3550',
  shoe: '#FFFFFF',
  hair: '#2A2140',
  topStyle: 'hoodie',
  hand: o.skin ?? '#FFFFFF',
  limb: o.top,
  blush: true,
  ...o,
});

/** Dan nhan vat rieng cua bo Pop. Mau ao nhan vat chinh doi duoc theo kenh. */
export const KID_CAST: Record<string, KidLook> = {
  // nhan vat chinh: toc vuot nho, hoodie (mau doi duoc), quan xam xanh, giay trang de cam
  nam: mk({ top: '#FF7A45', trim: '#FFE3C8', hairStyle: 'tuft', pants: '#2F3550', shoe: '#FFFFFF' }),
  // ban gai: toc dai buoc mot ben, ao khoac tim
  linh: mk({ top: '#8C6CF0', trim: '#FFD6F0', hairStyle: 'pony', hair: '#3A2430', pants: '#2B2A44', shoe: '#FF8FB8', topStyle: 'jacket' }),
  // ban than: mu luoi trai doi nguoc, ao phong xanh
  tuan: mk({ top: '#2FB5A3', trim: '#FFFFFF', hairStyle: 'cap', hatColor: '#E8453C', pants: '#3B4A6B', shoe: '#F2C94C', topStyle: 'tee', backpack: '#F2C94C' }),
  // me: toc bui, ao tap de
  me: mk({ top: '#E86A8E', trim: '#FFF1E6', hairStyle: 'bun', hair: '#5A3226', pants: '#4A3A5A', shoe: '#7A4A5A', topStyle: 'apron' }),
  // bo: kinh, ria mep, ao so mi
  bo: mk({ top: '#4D7CC9', trim: '#FFFFFF', hairStyle: 'side', hair: '#2A2140', pants: '#3A3346', shoe: '#5A3A2A', topStyle: 'tee', glasses: true, mustache: true }),
  // sep / nguoi la: vest toi, ca vat do
  sep: mk({ top: '#2E3346', trim: '#D93A49', hairStyle: 'side', hair: '#17141A', pants: '#2E3346', shoe: '#14151A', topStyle: 'suit' }),
  // thay giao / bac si: ao blouse trang, kinh
  thay: mk({ top: '#F3F5FA', topShade: '#D6DBE8', trim: '#5AA9E6', hairStyle: 'bald', hair: '#6A6070', pants: '#3A4258', shoe: '#2A2A33', topStyle: 'labcoat', glasses: true }),
  // em nho: hai chom toc, vay vang (ve nho 0.75)
  em: mk({ top: '#FFC83D', trim: '#FF7AA2', hairStyle: 'twin', hair: '#3A2620', pants: '#FFFFFF', shoe: '#FF7AA2', topStyle: 'dress' }),
  // ba: toc bac bui, kinh, khan
  ba: mk({ top: '#9C7BB8', trim: '#F2E3C6', hairStyle: 'bun', hair: '#C9C6D6', pants: '#5A4A6A', shoe: '#5A4A6A', topStyle: 'jacket', glasses: true }),
  // ban hoc (nam) toc xoan
  khoa: mk({ top: '#5BC06B', trim: '#FFFFFF', hairStyle: 'curly', hair: '#2A1C18', skin: '#F3D9C2', skinShade: '#DDBFA6', hand: '#F3D9C2', pants: '#2F3550', shoe: '#E8453C', topStyle: 'hoodie' }),
  // nguoi ngoai hanh tinh
  alien: mk({ top: '#5A4FCF', trim: '#9BF6FF', hairStyle: 'antenna', skin: '#A6F29A', skinShade: '#7FD474', hand: '#A6F29A', hair: '#7FD474', pants: '#3A3478', shoe: '#9BF6FF', topStyle: 'suit', blush: false }),
  // nguoi gia toc dai (co gai lon / chi)
  chi: mk({ top: '#F06C5B', trim: '#FFFFFF', hairStyle: 'long', hair: '#5A2E22', pants: '#2F3550', shoe: '#FFFFFF', topStyle: 'tee' }),
  // ---- 20 nhan vat them
  ong: mk({ top: '#7A8C5A', trim: '#E8DCC0', hairStyle: 'bald', hair: '#D9D6E2', pants: '#4A4238', shoe: '#3A2A22', topStyle: 'sweater', glasses: true, beard: true }),
  bacsi: mk({ top: '#F3F5FA', topShade: '#D6DBE8', trim: '#3FBFA0', hairStyle: 'bun', hair: '#2A1C18', pants: '#3FBFA0', shoe: '#FFFFFF', topStyle: 'labcoat' }),
  yta: mk({ top: '#7FD3E8', trim: '#FFFFFF', hairStyle: 'bob', hair: '#3A2430', pants: '#7FD3E8', shoe: '#FFFFFF', topStyle: 'uniform' }),
  cogiao: mk({ top: '#C77DB8', trim: '#FFF1E6', hairStyle: 'long', hair: '#2A1C18', pants: '#3A3346', shoe: '#5A3A4A', topStyle: 'jacket', glasses: true }),
  canhsat: mk({ top: '#2E4A8C', trim: '#F2C94C', hairStyle: 'police', hatColor: '#1E2F5C', pants: '#1E2F5C', shoe: '#14151A', topStyle: 'uniform', tie: '#14151A' }),
  daubep: mk({ top: '#FFFFFF', topShade: '#DDE1EA', trim: '#E8453C', hairStyle: 'chef', hatColor: '#FFFFFF', pants: '#3A3346', shoe: '#14151A', topStyle: 'uniform', mustache: true, hair: '#2A1C18' }),
  congnhan: mk({ top: '#FF8A2A', trim: '#E8F25C', hairStyle: 'hardhat', hatColor: '#FFD23F', pants: '#3B4A6B', shoe: '#6A4A2A', topStyle: 'vest', beard: true, hair: '#4A2E22' }),
  vdv: mk({ top: '#E8453C', trim: '#FFFFFF', hairStyle: 'headband', hatColor: '#FFFFFF', hair: '#2A1C18', pants: '#1E2F5C', shoe: '#5AA9FF', topStyle: 'jersey', number: '10', skin: '#E9C3A0', skinShade: '#D1A985', hand: '#E9C3A0' }),
  gamethu: mk({ top: '#2E2A44', trim: '#6FFFB0', hairStyle: 'swoop', hair: '#6A4AE8', pants: '#1E1C2E', shoe: '#6FFFB0', topStyle: 'hoodie', headphones: '#6FFFB0' }),
  mai: mk({ top: '#FF7AB8', trim: '#FFFFFF', hairStyle: 'long', hair: '#F2C46A', pants: '#FFFFFF', shoe: '#FF7AB8', topStyle: 'dress' }),
  hung: mk({ top: '#3A3F5C', trim: '#E8453C', hairStyle: 'mohawk', hair: '#2A1C18', pants: '#2E3346', shoe: '#14151A', topStyle: 'jersey', number: '99' }),
  minh: mk({ top: '#F2E3B8', trim: '#4D7CC9', hairStyle: 'side', hair: '#2A1C18', pants: '#5A6078', shoe: '#5A3A2A', topStyle: 'sweater', glasses: true, tie: '#4D7CC9' }),
  daigia: mk({ top: '#1E1C2E', trim: '#F2C94C', hairStyle: 'swoop', hair: '#17141A', pants: '#1E1C2E', shoe: '#14151A', topStyle: 'suit' }),
  embe: mk({ top: '#9FE3FF', trim: '#FFFFFF', hairStyle: 'tuft', hair: '#3A2620', pants: '#FFFFFF', shoe: '#9FE3FF', topStyle: 'tee' }),
  robot: mk({ top: '#9AA3BC', trim: '#5AE8FF', hairStyle: 'antenna', skin: '#D6DBE8', skinShade: '#B9C0D2', hand: '#9AA3BC', hair: '#9AA3BC', pants: '#6A738C', shoe: '#5A6078', topStyle: 'robot', blush: false }),
  zombie: mk({ top: '#6A7A5A', trim: '#8A5A4A', hairStyle: 'spiky', hair: '#3A3A2A', skin: '#B4D69A', skinShade: '#94BA7A', hand: '#B4D69A', pants: '#4A4A5A', shoe: '#3A3A2A', topStyle: 'tee', blush: false }),
  vua: mk({ top: '#B8323C', trim: '#F2C94C', hairStyle: 'crown', hatColor: '#F2C94C', hair: '#6A4A3A', pants: '#4A2A4A', shoe: '#2A1C18', topStyle: 'jacket', beard: true, cape: '#B8323C' }),
  trom: mk({ top: '#FFFFFF', trim: '#1E1C2E', hairStyle: 'beanie', hatColor: '#1E1C2E', pants: '#1E1C2E', shoe: '#14151A', topStyle: 'stripe', mask: true }),
  thungan: mk({ top: '#3FB565', trim: '#FFFFFF', hairStyle: 'cap', hatColor: '#3FB565', hair: '#3A2620', pants: '#2F3550', shoe: '#FFFFFF', topStyle: 'apron', skin: '#F3D9C2', skinShade: '#DDBFA6', hand: '#F3D9C2' }),
  phihanh: mk({ top: '#F4F7FF', topShade: '#D6DBE8', trim: '#E8453C', hairStyle: 'helmet', hair: '#2A1C18', pants: '#F4F7FF', shoe: '#9AA3BC', topStyle: 'spacesuit', backpack: '#C9CEDA' }),
  // ---- 20 nhan vat theo phong cach doi thu (bo Ink/Doll co trang phuc rieng; bo Pop dung kieu gan nhat)
  tunhan: mk({ top: '#F4F2EE', topShade: '#D6DBE8', trim: '#1E1C2E', hairStyle: 'side', hair: '#2A1C18', pants: '#2A2733', shoe: '#14151A', topStyle: 'stripe' }),
  quanguc: mk({ top: '#3A4A3A', trim: '#F2C94C', hairStyle: 'police', hatColor: '#26301F', pants: '#26301F', shoe: '#14151A', topStyle: 'uniform', tie: '#14151A', mustache: true, hair: '#2A1C18' }),
  tiensu: mk({ top: '#B07A3E', trim: '#6B4423', hairStyle: 'spiky', hair: '#3A2418', pants: '#B07A3E', shoe: '#8A5A2E', topStyle: 'tee', beard: true, skin: '#E2AE8A', skinShade: '#C99470', hand: '#E2AE8A' }),
  tiensu2: mk({ top: '#C9A066', trim: '#6B4423', hairStyle: 'long', hair: '#4A2A18', pants: '#C9A066', shoe: '#8A5A2E', topStyle: 'dress', skin: '#E2AE8A', skinShade: '#C99470', hand: '#E2AE8A' }),
  barista: mk({ top: '#F4F2EE', topShade: '#D6DBE8', trim: '#7A5233', hairStyle: 'beanie', hatColor: '#7A5233', hair: '#3A2620', pants: '#2F3550', shoe: '#5A3A2A', topStyle: 'apron' }),
  samurai: mk({ top: '#3A4A7A', trim: '#E8E0CC', hairStyle: 'bun', hair: '#17141A', pants: '#2A2733', shoe: '#5A3A2A', topStyle: 'jacket', skin: '#F3D9C2', skinShade: '#DDBFA6', hand: '#F3D9C2' }),
  ninja: mk({ top: '#262435', trim: '#B8323C', hairStyle: 'beanie', hatColor: '#1E1C2E', pants: '#262435', shoe: '#14151A', topStyle: 'jacket', mask: true }),
  lanhchua: mk({ top: '#C9A23C', trim: '#7A1E24', hairStyle: 'bun', hair: '#5A5A66', pants: '#4A2A2A', shoe: '#2A1C18', topStyle: 'jacket', mustache: true, skin: '#F3D9C2', skinShade: '#DDBFA6', hand: '#F3D9C2' }),
  thamtu: mk({ top: '#B89A6A', trim: '#4A3E30', hairStyle: 'cap', hatColor: '#4A3E30', hair: '#2A1C18', pants: '#3A3346', shoe: '#2A1C18', topStyle: 'jacket' }),
  phatthanh: mk({ top: '#1F3A6B', trim: '#D93A49', hairStyle: 'swoop', hair: '#2A1C18', pants: '#1F2A44', shoe: '#14151A', topStyle: 'suit' }),
  binhsi: mk({ top: '#5A6A3A', trim: '#3A3220', hairStyle: 'helmet', hatColor: '#4A5A32', hair: '#2A1C18', pants: '#4A5A32', shoe: '#3A2A1A', topStyle: 'uniform', backpack: '#6A5A3A' }),
  hiepsi: mk({ top: '#A8B0BC', trim: '#B8323C', hairStyle: 'helmet', hatColor: '#B8C0CC', hair: '#2A1C18', pants: '#6A7280', shoe: '#4A505C', topStyle: 'vest', cape: '#B8323C' }),
  cuopbien: mk({ top: '#7A1E24', trim: '#F2C94C', hairStyle: 'beanie', hatColor: '#1E1C2E', hair: '#17141A', pants: '#2A2733', shoe: '#2A1C18', topStyle: 'jacket', beard: true }),
  caoboi: mk({ top: '#C9A066', trim: '#B8323C', hairStyle: 'cap', hatColor: '#8A5A2E', hair: '#5A3A22', pants: '#3B4A6B', shoe: '#6A4A2A', topStyle: 'vest', mustache: true }),
  phuthuy: mk({ top: '#4A3A9A', trim: '#F2C94C', hairStyle: 'bald', hair: '#E8E8F0', pants: '#3A2E7A', shoe: '#2A2140', topStyle: 'labcoat', beard: true, cape: '#3A2E7A' }),
  viking: mk({ top: '#7A5A3A', trim: '#5A3A22', hairStyle: 'helmet', hatColor: '#9AA3B0', hair: '#D9792C', pants: '#4A3A2A', shoe: '#3A2A1A', topStyle: 'vest', beard: true }),
  macarong: mk({ top: '#1E1C2E', trim: '#B8323C', hairStyle: 'swoop', hair: '#17141A', pants: '#1E1C2E', shoe: '#14151A', topStyle: 'suit', cape: '#7A1E24', skin: '#D8DCE8', skinShade: '#BCC1D2', hand: '#D8DCE8', blush: false }),
  sieunhan: mk({ top: '#2E5AC9', trim: '#F2C94C', hairStyle: 'side', hair: '#17141A', pants: '#2E5AC9', shoe: '#B8323C', topStyle: 'tee', cape: '#D93A49', mask: true }),
  nongdan: mk({ top: '#6A8A5A', trim: '#B8323C', hairStyle: 'cap', hatColor: '#E3C27A', hair: '#3A2620', pants: '#4A5A7A', shoe: '#5A3A2A', topStyle: 'jacket' }),
  thamhiem: mk({ top: '#C9B38A', trim: '#6B4A32', hairStyle: 'cap', hatColor: '#C9B38A', hair: '#5A3A22', pants: '#6A5A3A', shoe: '#5A3A2A', topStyle: 'jacket', backpack: '#6B4A32' }),
  // ---- quan chung (dam dong): mau va toc khac nhau
  qc1: mk({ top: '#5AA9FF', hairStyle: 'side', hair: '#2A1C18', pants: '#3A3346', topStyle: 'tee', blush: false }),
  qc2: mk({ top: '#F2C94C', hairStyle: 'bob', hair: '#5A2E22', pants: '#4A3A5A', topStyle: 'sweater', blush: false }),
  qc3: mk({ top: '#E86A8E', hairStyle: 'curly', hair: '#17141A', pants: '#2F3550', topStyle: 'jacket', skin: '#E9C3A0', skinShade: '#D1A985', hand: '#E9C3A0', blush: false }),
  qc4: mk({ top: '#7FD474', hairStyle: 'cap', hatColor: '#5A6078', pants: '#3B4A6B', topStyle: 'hoodie', blush: false }),
  qc5: mk({ top: '#B98CFF', hairStyle: 'long', hair: '#3A2430', pants: '#2B2A44', topStyle: 'tee', blush: false }),
  qc6: mk({ top: '#FF8A65', hairStyle: 'afro', hair: '#2A1C18', pants: '#3A3346', topStyle: 'stripe', skin: '#C99A72', skinShade: '#B08460', hand: '#C99A72', blush: false }),
  qc7: mk({ top: '#5ED3A8', hairStyle: 'bald', hair: '#6A6070', pants: '#4A4238', topStyle: 'sweater', glasses: true, blush: false }),
  qc8: mk({ top: '#9C7BB8', hairStyle: 'pony', hair: '#F2C46A', pants: '#2F3550', topStyle: 'jacket', blush: false }),
};
/** Co nguoi mac dinh (tre con nho hon). */
export const KID_SIZE: Record<string, number> = { em: 0.75, embe: 0.6, hung: 1.1, robot: 1.05 };
// nhan vat bo sung (goi bo sung library/bo_sung): ghep tu cac bo phan co san
{
  const HAIRS = ['tuft', 'spiky', 'cap', 'beanie', 'pony', 'bun', 'bald', 'curly', 'twin', 'side', 'long', 'antenna', 'none', 'afro', 'mohawk', 'bob', 'police', 'chef', 'hardhat', 'crown', 'headband', 'helmet', 'swoop'];
  const TOPS = ['hoodie', 'tee', 'suit', 'dress', 'labcoat', 'jacket', 'apron', 'sweater', 'vest', 'jersey', 'uniform', 'stripe', 'spacesuit', 'robot'];
  const hex = (v: any) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined);
  for (const [id, c] of Object.entries((ADDONS as any).casts || {}) as [string, any][]) {
    const L = (c && c.look) || {};
    const base = KID_CAST[c.base] || undefined;
    const o: any = {};
    for (const k of ['top', 'trim', 'pants', 'shoe', 'hair', 'skin', 'hatColor', 'backpack', 'headphones', 'cape', 'tie']) if (hex(L[k])) o[k] = hex(L[k]);
    for (const k of ['glasses', 'mustache', 'beard', 'mask', 'blush']) if (typeof L[k] === 'boolean') o[k] = L[k];
    if (typeof L.number === 'string') o.number = L.number.slice(0, 3);
    if (HAIRS.includes(L.hairStyle)) o.hairStyle = L.hairStyle;
    if (TOPS.includes(L.topStyle)) o.topStyle = L.topStyle;
    const top = o.top || base?.top || '#7A8CD9';
    KID_CAST[id] = base ? { ...base, ...o, topShade: shadeHex(top, 0.8), limb: top, hand: o.skin || base.hand } : mk({ top, hairStyle: o.hairStyle || 'tuft', ...o });
    const sz = Number(c.size);
    if (sz >= 0.5 && sz <= 1.3) KID_SIZE[id] = sz;
  }
}
export const CROWD_IDS = ['qc1', 'qc2', 'qc3', 'qc4', 'qc5', 'qc6', 'qc7', 'qc8'];
export const KID_IDS = Object.keys(KID_CAST);

export type KidExpr = 'neutral' | 'happy' | 'smug' | 'shock' | 'worried' | 'oops' | 'cool' | 'dizzy' | 'tired' | 'angry' | 'love' | 'cry' | 'wow' | 'sad'
  | 'laugh' | 'grin' | 'wink' | 'shy' | 'embarrassed' | 'scared' | 'disgusted' | 'suspicious' | 'confused' | 'bored' | 'excited' | 'evil' | 'sleepy'
  | 'determined' | 'nervous' | 'proud' | 'crazy' | 'sick' | 'pout' | 'kiss' | 'rage' | 'relieved' | 'drool' | 'jealous' | 'surprised' | 'thinking';

/** Thong so mat cho tung bieu cam moi (L = mat trai man hinh, R = mat phai). */
type EyeCfg = {
  lid?: number; lidL?: number; lidR?: number; // mi tren sup xuong 0..1
  pr?: number; prL?: number; prR?: number; // co con nguoi
  size?: number; sizeL?: number; sizeR?: number; // co mat
  lookX?: number; lookY?: number; // huong nhin
  closed?: 'up' | 'down'; closedL?: 'up' | 'down'; closedR?: 'up' | 'down'; // nham mat (cung cong len = cuoi)
  squint?: boolean; jitter?: number; sparkle?: boolean; slant?: number; // mi nghieng (+ = gian, - = buon)
};
const EYES: Partial<Record<KidExpr, EyeCfg>> = {
  laugh: { squint: true },
  grin: { lid: 0.22, pr: 8.5 },
  wink: { closedL: 'up', lidR: 0.1 },
  shy: { lookX: 0.9, lookY: 5, lid: 0.25, pr: 7 },
  embarrassed: { lookX: -0.9, lookY: 3, pr: 6.5, size: 1.05 },
  scared: { size: 1.25, pr: 3.5, jitter: 1.5 },
  disgusted: { lidL: 0.55, lidR: 0.15, pr: 7, slant: 4 },
  suspicious: { lid: 0.55, lookX: 1, pr: 8, slant: 2 },
  confused: { sizeL: 0.85, sizeR: 1.15, pr: 7, lookY: -2 },
  bored: { lid: 0.55, lookY: 3, pr: 7.5 },
  excited: { size: 1.15, pr: 10, sparkle: true },
  evil: { lid: 0.38, pr: 5, slant: 9 },
  sleepy: { closed: 'down' },
  determined: { lid: 0.28, pr: 8, slant: 6 },
  nervous: { pr: 5.5, jitter: 2.5, size: 1.05 },
  proud: { closed: 'up' },
  crazy: { sizeL: 1.3, prL: 3, sizeR: 0.8, prR: 8 },
  sick: { lid: 0.45, pr: 6.5, lookY: 3 },
  pout: { lid: 0.2, lookX: -0.8, pr: 8, slant: 3 },
  kiss: { closed: 'down' },
  rage: { lid: 0.3, pr: 3.5, slant: 10, size: 1.1 },
  relieved: { closed: 'down' },
  drool: { size: 1.15, pr: 9.5, sparkle: true, lookY: -2 },
  jealous: { lid: 0.45, lookX: 1, pr: 6.5, slant: 5 },
  surprised: { size: 1.12, pr: 6.5 },
  thinking: { lidL: 0.4, lookX: 0.6, lookY: -5, pr: 7.5 },
};

type P = { x: number; y: number };
const HY = HEAD.y - 10; // tam dau (cao hon engine mot chut, dau to hon)
const HR = 76;

const Eyes: React.FC<{ e: KidExpr; blink: number; look: number; yaw: number; L: KidLook; t: number }> = ({ e, blink, look, yaw, L, t }) => {
  const ink = L.line;
  const ay = Math.min(1, Math.abs(yaw));
  const farHidden = ay > 0.72;
  const farSide = yaw > 0 ? -1 : 1;
  const ey = HY - 2;
  const px = look * 6 + yaw * 4;
  const cfg = EYES[e];
  const lid0 = e === 'smug' || e === 'cool' ? 0.45 : e === 'tired' ? 0.6 : e === 'angry' ? 0.25 : 0;
  const one = (cx: number) => {
    if (farHidden && Math.sign(cx) === farSide) return null;
    if (cfg) {
      const sd = cx < 0 ? 'L' : 'R';
      const closed = (cfg as any)[`closed${sd}`] ?? cfg.closed;
      if (closed || blink >= 0.95) {
        const up = closed === 'up' && blink < 0.95;
        return <path d={up ? `M ${cx - 13} ${ey + 4} Q ${cx} ${ey - 13} ${cx + 13} ${ey + 4}` : `M ${cx - 13} ${ey} Q ${cx} ${ey + 9} ${cx + 13} ${ey}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />;
      }
      if (cfg.squint) return <path d={`M ${cx - 11} ${ey - 8} L ${cx + 5} ${ey} L ${cx - 11} ${ey + 8}`} transform={cx > 0 ? `translate(${2 * cx},0) scale(-1,1)` : undefined} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
      const sz = (cfg as any)[`size${sd}`] ?? cfg.size ?? 1;
      const lidv = (cfg as any)[`lid${sd}`] ?? cfg.lid ?? 0;
      const op = Math.max(0.06, 1 - Math.max(blink, lidv));
      const rx = 15 * sz;
      const ry = 19 * sz * op;
      const pr = (cfg as any)[`pr${sd}`] ?? cfg.pr ?? 8.5;
      const jx = cfg.jitter ? Math.sin(t * 2.7 + cx) * cfg.jitter : 0;
      const jy = cfg.jitter ? Math.cos(t * 3.1 + cx) * cfg.jitter * 0.6 : 0;
      const qx = cx + px + (cfg.lookX ?? 0) * 6 + jx;
      const qy = ey + 2 + (cfg.lookY ?? 0) + (lidv ? 4 : 0) + jy;
      const sl = (cfg.slant ?? 0) * (cx < 0 ? 1 : -1);
      return (
        <g>
          <ellipse cx={cx} cy={ey} rx={rx} ry={Math.max(2, ry)} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
          {ry > 5 ? <circle cx={Math.max(cx - rx + pr, Math.min(cx + rx - pr, qx))} cy={Math.max(ey - ry + pr, Math.min(ey + ry - pr, qy))} r={Math.min(pr, ry - 1)} fill={ink} /> : null}
          {ry > 7 ? <circle cx={qx + 3} cy={qy - 5} r={cfg.sparkle ? 4 : 2.6} fill="#FFFFFF" /> : null}
          {cfg.sparkle && ry > 7 ? <circle cx={qx - 3} cy={qy + 3} r={2} fill="#FFFFFF" /> : null}
          {lidv > 0 || sl ? <path d={`M ${cx - rx - 2} ${ey - ry + 1 - sl * 0.2} L ${cx + rx + 2} ${ey - ry + 1 + sl}`} stroke={ink} strokeWidth={5} strokeLinecap="round" /> : null}
          {e === 'sick' ? <path d={`M ${cx - 13} ${ey + 22} Q ${cx} ${ey + 28} ${cx + 13} ${ey + 22}`} stroke="#7FB06A" strokeWidth={4.5} fill="none" strokeLinecap="round" /> : null}
        </g>
      );
    }
    if (blink >= 0.95 || e === 'happy') {
      // mat cuoi: cung cong len; nham mat: cung cong xuong
      const up = e === 'happy' && blink < 0.95;
      return <path d={up ? `M ${cx - 13} ${ey + 4} Q ${cx} ${ey - 13} ${cx + 13} ${ey + 4}` : `M ${cx - 13} ${ey} Q ${cx} ${ey + 9} ${cx + 13} ${ey}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />;
    }
    if (e === 'oops') return <path d={`M ${cx - 11} ${ey - 8} L ${cx + 5} ${ey} L ${cx - 11} ${ey + 8}`} transform={cx > 0 ? `translate(${2 * cx},0) scale(-1,1)` : undefined} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    if (e === 'dizzy') {
      const r = t * 0.4;
      return <path transform={`rotate(${(r * 180) / Math.PI} ${cx} ${ey})`} d={`M ${cx} ${ey} m -2 0 a 2 2 0 1 1 4 0 a 5 5 0 1 1 -9 0 a 8 8 0 1 1 15 0 a 11 11 0 1 1 -21 0`} stroke={ink} strokeWidth={3.5} fill="none" strokeLinecap="round" />;
    }
    if (e === 'love') {
      const s = 1 + 0.12 * Math.sin(t * 0.5);
      return <path transform={`translate(${cx} ${ey}) scale(${s})`} d="M 0 10 C -22 -4 -12 -20 0 -9 C 12 -20 22 -4 0 10 Z" fill="#FF4D7A" stroke={ink} strokeWidth={3} />;
    }
    if (e === 'wow') {
      const s = 1 + 0.15 * Math.sin(t * 0.6);
      return <path transform={`translate(${cx} ${ey}) scale(${s})`} d="M 0 -16 L 4.5 -5 L 16 -5 L 7 2 L 10 14 L 0 7 L -10 14 L -7 2 L -16 -5 L -4.5 -5 Z" fill="#FFD23F" stroke={ink} strokeWidth={3} strokeLinejoin="round" />;
    }
    const big = e === 'shock';
    const rx = big ? 18 : 15;
    const open = Math.max(0.06, 1 - Math.max(blink, lid0));
    const lid = lid0;
    const ry = (big ? 22 : 19) * open;
    const pr = big ? 5 : e === 'worried' || e === 'cry' || e === 'sad' ? 7 : 8.5;
    return (
      <g>
        <ellipse cx={cx} cy={ey} rx={rx} ry={Math.max(2, ry)} fill="#FFFFFF" stroke={ink} strokeWidth={4} />
        {ry > 5 ? <circle cx={cx + px} cy={ey + (lid ? 4 : 2)} r={Math.min(pr, ry - 1)} fill={ink} /> : null}
        {ry > 7 ? <circle cx={cx + px + 3} cy={ey - 3} r={2.6} fill="#FFFFFF" /> : null}
        {lid > 0 ? <path d={`M ${cx - rx - 2} ${ey - ry + 1} L ${cx + rx + 2} ${ey - ry + (e === 'angry' ? (cx < 0 ? 5 : -5) : 1)}`} stroke={ink} strokeWidth={5} strokeLinecap="round" /> : null}
        {e === 'tired' ? <path d={`M ${cx - 13} ${ey + 22} Q ${cx} ${ey + 28} ${cx + 13} ${ey + 22}`} stroke="#9A86C2" strokeWidth={4.5} fill="none" strokeLinecap="round" /> : null}
      </g>
    );
  };
  const by = ey - 30;
  const brow: Partial<Record<KidExpr, string>> = {
    smug: `M -40 ${by + 4} L -14 ${by + 6} M 14 ${by} L 40 ${by - 6}`,
    shock: `M -40 ${by - 6} Q -27 ${by - 16} -14 ${by - 8} M 14 ${by - 8} Q 27 ${by - 16} 40 ${by - 6}`,
    worried: `M -40 ${by + 6} L -14 ${by - 4} M 14 ${by - 4} L 40 ${by + 6}`,
    sad: `M -40 ${by + 6} L -14 ${by - 4} M 14 ${by - 4} L 40 ${by + 6}`,
    cry: `M -40 ${by + 6} L -14 ${by - 4} M 14 ${by - 4} L 40 ${by + 6}`,
    angry: `M -40 ${by - 6} L -12 ${by + 8} M 12 ${by + 8} L 40 ${by - 6}`,
    oops: `M -40 ${by} L -14 ${by + 4} M 14 ${by + 4} L 40 ${by}`,
    tired: `M -40 ${by + 6} Q -27 ${by + 2} -14 ${by + 4} M 14 ${by + 4} Q 27 ${by + 2} 40 ${by + 6}`,
    laugh: `M -40 ${by - 4} Q -27 ${by - 14} -14 ${by - 6} M 14 ${by - 6} Q 27 ${by - 14} 40 ${by - 4}`,
    grin: `M -40 ${by} Q -27 ${by - 8} -14 ${by - 2} M 14 ${by - 2} Q 27 ${by - 8} 40 ${by}`,
    wink: `M -40 ${by + 4} L -14 ${by + 2} M 14 ${by - 4} Q 27 ${by - 12} 40 ${by - 6}`,
    shy: `M -40 ${by + 4} L -14 ${by - 2} M 14 ${by - 2} L 40 ${by + 4}`,
    embarrassed: `M -40 ${by + 6} L -14 ${by - 4} M 14 ${by - 4} L 40 ${by + 6}`,
    scared: `M -42 ${by + 2} Q -30 ${by - 16} -14 ${by - 12} M 14 ${by - 12} Q 30 ${by - 16} 42 ${by + 2}`,
    disgusted: `M -40 ${by + 8} L -14 ${by + 4} M 14 ${by - 10} Q 27 ${by - 16} 40 ${by - 8}`,
    suspicious: `M -40 ${by + 2} L -14 ${by + 8} M 14 ${by - 6} L 40 ${by - 2}`,
    confused: `M -40 ${by - 12} Q -27 ${by - 20} -14 ${by - 12} M 14 ${by + 4} L 40 ${by + 2}`,
    bored: `M -40 ${by + 6} L -14 ${by + 6} M 14 ${by + 6} L 40 ${by + 6}`,
    excited: `M -40 ${by - 8} Q -27 ${by - 18} -14 ${by - 10} M 14 ${by - 10} Q 27 ${by - 18} 40 ${by - 8}`,
    evil: `M -42 ${by - 10} L -12 ${by + 10} M 12 ${by + 10} L 42 ${by - 10}`,
    sleepy: `M -40 ${by + 8} Q -27 ${by + 4} -14 ${by + 6} M 14 ${by + 6} Q 27 ${by + 4} 40 ${by + 8}`,
    determined: `M -40 ${by - 2} L -12 ${by + 8} M 12 ${by + 8} L 40 ${by - 2}`,
    nervous: `M -40 ${by + 4} L -14 ${by - 6} M 14 ${by - 6} L 40 ${by + 4}`,
    proud: `M -40 ${by - 4} Q -27 ${by - 12} -14 ${by - 6} M 14 ${by - 6} Q 27 ${by - 12} 40 ${by - 4}`,
    crazy: `M -46 ${by - 14} Q -30 ${by - 26} -12 ${by - 14} M 14 ${by + 6} L 40 ${by + 10}`,
    sick: `M -40 ${by + 6} L -14 ${by} M 14 ${by} L 40 ${by + 6}`,
    pout: `M -40 ${by} L -14 ${by + 6} M 14 ${by + 6} L 40 ${by}`,
    kiss: `M -40 ${by - 2} Q -27 ${by - 10} -14 ${by - 4} M 14 ${by - 4} Q 27 ${by - 10} 40 ${by - 2}`,
    rage: `M -44 ${by - 12} L -10 ${by + 12} M 10 ${by + 12} L 44 ${by - 12}`,
    relieved: `M -40 ${by + 2} Q -27 ${by - 8} -14 ${by - 2} M 14 ${by - 2} Q 27 ${by - 8} 40 ${by + 2}`,
    drool: `M -40 ${by - 6} Q -27 ${by - 14} -14 ${by - 8} M 14 ${by - 8} Q 27 ${by - 14} 40 ${by - 6}`,
    jealous: `M -40 ${by + 4} L -14 ${by + 8} M 14 ${by + 8} L 40 ${by + 4}`,
    surprised: `M -40 ${by - 10} Q -27 ${by - 18} -14 ${by - 10} M 14 ${by - 10} Q 27 ${by - 18} 40 ${by - 10}`,
    thinking: `M -40 ${by + 4} L -14 ${by + 6} M 14 ${by - 10} Q 27 ${by - 18} 40 ${by - 10}`,
  };
  return (
    <g>
      {one(-27)}
      {one(27)}
      {brow[e] ? <path d={brow[e]} stroke={ink} strokeWidth={6.5} fill="none" strokeLinecap="round" /> : null}
    </g>
  );
};

const Mouth: React.FC<{ e: KidExpr; ink: string; t: number; talk: number }> = ({ e, ink, t, talk }) => {
  const y = HY + 36;
  const tongue = '#FF6F7D';
  if (talk > 0.01 && (e === 'neutral' || e === 'smug' || e === 'worried')) {
    const o = 4 + 10 * Math.abs(Math.sin(t * 0.9)) * talk;
    return <ellipse cx={0} cy={y + 2} rx={12} ry={o} fill={ink} />;
  }
  switch (e) {
    case 'happy':
    case 'love':
      return (
        <g>
          <path d={`M -24 ${y - 6} Q 0 ${y + 30} 24 ${y - 6} Z`} fill={ink} />
          <path d={`M -11 ${y + 9} Q 0 ${y + 2} 11 ${y + 9} Q 6 ${y + 16} 0 ${y + 16} Q -6 ${y + 16} -11 ${y + 9} Z`} fill={tongue} />
        </g>
      );
    case 'wow':
    case 'shock':
      return (
        <g>
          <ellipse cx={0} cy={y + 6} rx={e === 'wow' ? 15 : 12} ry={e === 'wow' ? 18 : 16} fill={ink} />
          <ellipse cx={0} cy={y + 15} rx={7} ry={5} fill={tongue} />
        </g>
      );
    case 'smug':
    case 'cool':
      return <path d={`M -14 ${y + 4} Q 6 ${y + 10} 20 ${y - 8}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />;
    case 'worried':
    case 'dizzy':
      return <path d={`M -18 ${y + 6} Q -9 ${y - 4} 0 ${y + 6} Q 9 ${y + 16} 18 ${y + 6}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />;
    case 'oops':
      return (
        <g>
          <rect x={-22} y={y - 6} width={44} height={20} rx={8} fill="#FFFFFF" stroke={ink} strokeWidth={5} />
          <path d={`M -11 ${y - 4} L -11 ${y + 12} M 0 ${y - 4} L 0 ${y + 12} M 11 ${y - 4} L 11 ${y + 12}`} stroke={ink} strokeWidth={2.5} />
        </g>
      );
    case 'angry':
      return (
        <g>
          <path d={`M -22 ${y + 10} Q 0 ${y - 8} 22 ${y + 10} Z`} fill="#FFFFFF" stroke={ink} strokeWidth={5} strokeLinejoin="round" />
          <path d={`M -10 ${y + 2} L -10 ${y + 9} M 0 ${y} L 0 ${y + 9} M 10 ${y + 2} L 10 ${y + 9}`} stroke={ink} strokeWidth={2.5} />
        </g>
      );
    case 'cry':
    case 'sad':
      return (
        <g>
          <path d={`M -18 ${y + 12} Q 0 ${y - 8} 18 ${y + 12}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      );
    case 'tired':
      return <path d={`M -12 ${y + 6} Q 0 ${y + 2} 12 ${y + 6}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />;
    case 'laugh': {
      const o = 1 + 0.12 * Math.abs(Math.sin(t * 0.9));
      return (
        <g transform={`translate(0 ${y}) scale(1 ${o}) translate(0 ${-y})`}>
          <path d={`M -30 ${y - 8} Q 0 ${y + 42} 30 ${y - 8} Z`} fill={ink} />
          <path d={`M -24 ${y - 6} L 24 ${y - 6} L 22 ${y} L -22 ${y} Z`} fill="#FFFFFF" />
          <path d={`M -13 ${y + 16} Q 0 ${y + 8} 13 ${y + 16} Q 7 ${y + 26} 0 ${y + 26} Q -7 ${y + 26} -13 ${y + 16} Z`} fill={tongue} />
        </g>
      );
    }
    case 'grin':
    case 'evil':
    case 'crazy': {
      const w = e === 'evil' ? 34 : 30;
      const lift = e === 'evil' ? -12 : -4;
      return (
        <g>
          <path d={`M ${-w} ${y + lift} Q 0 ${y + 30} ${w} ${y + lift} Q 0 ${y + 10} ${-w} ${y + lift} Z`} fill="#FFFFFF" stroke={ink} strokeWidth={5} strokeLinejoin="round" />
          {[-18, -9, 0, 9, 18].map((x) => <path key={x} d={`M ${x} ${y + lift / 2 + 4} L ${x} ${y + 15 + (Math.abs(x) > 12 ? -4 : 0)}`} stroke={ink} strokeWidth={2.5} />)}
          {e === 'crazy' ? <path d={`M 10 ${y + 14} Q 16 ${y + 34} 26 ${y + 26} L 22 ${y + 12} Z`} fill={tongue} stroke={ink} strokeWidth={3} /> : null}
        </g>
      );
    }
    case 'wink':
    case 'proud':
      return (
        <g>
          <path d={`M -20 ${y - 2} Q 2 ${y + 16} 24 ${y - 6}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />
          {e === 'wink' ? <path d={`M 4 ${y + 6} Q 12 ${y + 20} 20 ${y + 4}`} fill={tongue} stroke={ink} strokeWidth={3} /> : null}
        </g>
      );
    case 'shy':
      return <path d={`M -10 ${y + 6} Q -5 ${y + 2} 0 ${y + 6} Q 5 ${y + 10} 10 ${y + 6}`} stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round" />;
    case 'embarrassed':
    case 'nervous': {
      const wv = e === 'nervous' ? Math.sin(t * 1.5) * 2 : 0;
      return <path d={`M -24 ${y + 4 + wv} Q -16 ${y - 4} -8 ${y + 4} Q 0 ${y + 12 - wv} 8 ${y + 4} Q 16 ${y - 4} 24 ${y + 4 + wv}`} stroke={ink} strokeWidth={5.5} fill="none" strokeLinecap="round" />;
    }
    case 'scared': {
      const ch = Math.sin(t * 3.5) * 2;
      return (
        <g>
          <path d={`M -22 ${y + ch} Q -11 ${y - 8} 0 ${y + ch} Q 11 ${y - 8} 22 ${y + ch} L 20 ${y + 20} Q 0 ${y + 26} -20 ${y + 20} Z`} fill={ink} />
          <path d={`M -18 ${y + 2} L 18 ${y + 2}`} stroke="#FFFFFF" strokeWidth={5} />
        </g>
      );
    }
    case 'disgusted':
      return (
        <g>
          <path d={`M -22 ${y + 6} Q -8 ${y - 4} 8 ${y + 4} Q 18 ${y + 8} 24 ${y - 2}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />
          <path d={`M -4 ${y + 4} Q -6 ${y + 26} 6 ${y + 26} Q 16 ${y + 24} 12 ${y + 6} Z`} fill={tongue} stroke={ink} strokeWidth={3.5} strokeLinejoin="round" />
        </g>
      );
    case 'suspicious':
    case 'jealous':
      return <path d={`M -14 ${y + 6} L 16 ${y + 2}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" transform={e === 'jealous' ? `translate(0 2)` : `translate(8 0)`} />;
    case 'confused':
    case 'thinking':
      return e === 'confused' ? (
        <path d={`M -18 ${y + 6} q 6 -8 12 0 q 6 8 12 0 q 6 -8 12 0`} stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round" />
      ) : (
        <path d={`M 2 ${y + 6} Q 12 ${y + 2} 22 ${y + 4}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />
      );
    case 'bored':
      return <path d={`M -16 ${y + 6} L 16 ${y + 6}`} stroke={ink} strokeWidth={6} strokeLinecap="round" />;
    case 'excited':
    case 'drool':
      return (
        <g>
          <path d={`M -26 ${y - 6} Q 0 ${y + 34} 26 ${y - 6} Z`} fill={ink} />
          <path d={`M -12 ${y + 11} Q 0 ${y + 4} 12 ${y + 11} Q 6 ${y + 19} 0 ${y + 19} Q -6 ${y + 19} -12 ${y + 11} Z`} fill={tongue} />
          {e === 'drool' ? (
            <g>
              <path d={`M 14 ${y + 4} Q 18 ${y + 30 + 8 * Math.abs(Math.sin(t * 0.2))} 22 ${y + 4}`} fill="#BFE8FF" stroke={ink} strokeWidth={2.5} />
            </g>
          ) : null}
        </g>
      );
    case 'sleepy':
      return <ellipse cx={0} cy={y + 6} rx={7 + Math.sin(t * 0.12) * 1.5} ry={8 + Math.sin(t * 0.12) * 2} fill={ink} />;
    case 'determined':
      return <path d={`M -16 ${y + 8} Q 0 ${y + 2} 16 ${y + 8}`} stroke={ink} strokeWidth={6.5} fill="none" strokeLinecap="round" />;
    case 'sick':
      return <path d={`M -18 ${y + 8} q 6 -6 12 0 q 6 6 12 0 q 6 -6 12 0`} stroke={ink} strokeWidth={5} fill="none" strokeLinecap="round" />;
    case 'pout':
      return <ellipse cx={-4} cy={y + 6} rx={7} ry={6} fill="none" stroke={ink} strokeWidth={5} />;
    case 'kiss':
      return <path transform={`translate(-2 ${y + 6}) scale(0.9)`} d="M 0 8 C -16 -2 -10 -14 0 -6 C 10 -14 16 -2 0 8 Z" fill="#FF5A7A" stroke={ink} strokeWidth={3.5} />;
    case 'rage': {
      const o = 16 + 4 * Math.abs(Math.sin(t * 1.2));
      return (
        <g>
          <path d={`M -28 ${y - 6} L 28 ${y - 6} L 22 ${y + o} L -22 ${y + o} Z`} fill={ink} strokeLinejoin="round" />
          <path d={`M -24 ${y - 3} L 24 ${y - 3}`} stroke="#FFFFFF" strokeWidth={6} />
          <path d={`M -18 ${y + o - 3} L 18 ${y + o - 3}`} stroke="#FFFFFF" strokeWidth={5} />
        </g>
      );
    }
    case 'relieved':
      return <path d={`M -16 ${y + 2} Q 0 ${y + 12} 16 ${y + 2}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />;
    case 'surprised':
      return <ellipse cx={0} cy={y + 6} rx={8} ry={10} fill={ink} />;
    default:
      return <path d={`M -12 ${y + 2} Q 0 ${y + 8} 12 ${y + 2}`} stroke={ink} strokeWidth={6} fill="none" strokeLinecap="round" />;
  }
};

const HairBack: React.FC<{ L: KidLook; yaw: number; sway: number }> = ({ L, yaw, sway }) => {
  const s = L.hairStyle;
  const h = L.hair;
  if (s === 'pony')
    return (
      <g transform={`rotate(${sway * 0.8} ${-yaw * 40 + 60} ${HY - 40})`}>
        <path d={`M ${60 - yaw * 40} ${HY - 50} q 46 10 40 70 q -6 50 -30 70 q 8 -40 -10 -80 Z`} fill={h} stroke={L.line} strokeWidth={4.5} strokeLinejoin="round" />
        <circle cx={62 - yaw * 40} cy={HY - 46} r={9} fill={L.trim} stroke={L.line} strokeWidth={3.5} />
      </g>
    );
  if (s === 'long')
    return <path d={`M -82 ${HY - 10} Q -96 ${HY + 110} -60 ${HY + 128} L 60 ${HY + 128} Q 96 ${HY + 110} 82 ${HY - 10} Z`} fill={h} stroke={L.line} strokeWidth={4.5} strokeLinejoin="round" />;
  if (s === 'bun') return <circle cx={-yaw * 30} cy={HY - HR - 8} r={28} fill={h} stroke={L.line} strokeWidth={4.5} />;
  if (s === 'afro') return <circle cx={-yaw * 10} cy={HY - 22} r={HR + 30} fill={h} stroke={L.line} strokeWidth={4.5} />;
  if (s === 'bob') return <path d={`M -86 ${HY - 20} Q -96 ${HY + 60} -70 ${HY + 66} L 70 ${HY + 66} Q 96 ${HY + 60} 86 ${HY - 20} Z`} fill={h} stroke={L.line} strokeWidth={4.5} strokeLinejoin="round" />;
  return null;
};

const HairFront: React.FC<{ L: KidLook; yaw: number; sway: number }> = ({ L, yaw, sway }) => {
  const s = L.hairStyle;
  const h = L.hair;
  const ln = L.line;
  const sh = -yaw * 16;
  const top = HY - HR;
  switch (s) {
    case 'tuft':
      return (
        <path
          transform={`translate(${sh} 0) rotate(${sway * 0.4} 0 ${top})`}
          d={`M -18 ${top + 6} q 4 -30 30 -34 q -10 12 -6 22 q 10 -14 26 -12 q -16 8 -16 26 Z`}
          fill={h}
          stroke={ln}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      );
    case 'spiky':
      return <path transform={`translate(${sh} 0)`} d={`M -60 ${top + 34} L -52 ${top - 8} L -30 ${top + 10} L -14 ${top - 22} L 4 ${top + 6} L 22 ${top - 20} L 36 ${top + 10} L 58 ${top - 6} L 62 ${top + 34} Q 0 ${top + 14} -60 ${top + 34} Z`} fill={h} stroke={ln} strokeWidth={4} strokeLinejoin="round" />;
    case 'cap': {
      const c = L.hatColor ?? L.trim;
      return (
        <g transform={`translate(${sh * 0.6} 0)`}>
          <path d={`M -74 ${top + 44} Q -76 ${top - 6} 0 ${top - 8} Q 76 ${top - 6} 74 ${top + 44} Q 0 ${top + 30} -74 ${top + 44} Z`} fill={c} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />
          {/* luoi trai huong theo mat */}
          <path d={`M ${-58 + yaw * 50} ${top + 40} Q ${yaw * 60} ${top + 34} ${58 + yaw * 70} ${top + 40} Q ${64 + yaw * 90} ${top + 52} ${yaw * 60} ${top + 54} Q ${-56 + yaw * 40} ${top + 54} ${-58 + yaw * 50} ${top + 40} Z`} fill={shadeHex(c, 0.78)} stroke={ln} strokeWidth={4} strokeLinejoin="round" />
          <circle cx={0} cy={top - 6} r={6} fill={shadeHex(c, 0.8)} stroke={ln} strokeWidth={3} />
        </g>
      );
    }
    case 'beanie': {
      const c = L.hatColor ?? L.trim;
      return (
        <g transform={`translate(${sh * 0.6} 0)`}>
          <path d={`M -76 ${top + 46} Q -80 ${top - 16} 0 ${top - 18} Q 80 ${top - 16} 76 ${top + 46} Z`} fill={c} stroke={ln} strokeWidth={4.5} />
          <rect x={-80} y={top + 34} width={160} height={24} rx={10} fill={shadeHex(c, 0.82)} stroke={ln} strokeWidth={4.5} />
          <circle cx={0} cy={top - 22} r={14} fill={c} stroke={ln} strokeWidth={4} />
        </g>
      );
    }
    case 'pony':
    case 'long':
      return <path transform={`translate(${sh} 0)`} d={`M -80 ${top + 74} Q -86 ${top - 6} 0 ${top - 6} Q 86 ${top - 6} 80 ${top + 74} Q 66 ${top + 30} 30 ${top + 22} Q 4 ${top + 40} -30 ${top + 22} Q -64 ${top + 30} -80 ${top + 74} Z`} fill={h} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />;
    case 'bun':
      return <path transform={`translate(${sh} 0)`} d={`M -78 ${top + 58} Q -82 ${top - 4} 0 ${top - 4} Q 82 ${top - 4} 78 ${top + 58} Q 50 ${top + 20} 0 ${top + 22} Q -50 ${top + 20} -78 ${top + 58} Z`} fill={h} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />;
    case 'side':
      return <path transform={`translate(${sh} 0)`} d={`M -74 ${top + 44} Q -78 ${top - 4} 6 ${top - 6} Q 78 ${top - 2} 74 ${top + 44} Q 62 ${top + 16} 22 ${top + 14} L 14 ${top + 4} L 6 ${top + 16} Q -50 ${top + 16} -74 ${top + 44} Z`} fill={h} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />;
    case 'bald':
      return (
        <g>
          <path d={`M -76 ${HY + 6} q -6 -26 8 -38 q 6 18 4 38 Z M 76 ${HY + 6} q 6 -26 -8 -38 q -6 18 -4 38 Z`} fill={h} stroke={ln} strokeWidth={4} strokeLinejoin="round" />
          <path d={`M -30 ${top + 14} q 20 -8 40 -4`} stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" opacity={0.7} />
        </g>
      );
    case 'curly':
      return (
        <g transform={`translate(${sh} 0)`}>
          {[-160, -135, -110, -90, -70, -45, -20].map((deg, k) => {
            const a = (deg * Math.PI) / 180;
            return <circle key={k} cx={Math.cos(a) * 66} cy={HY + Math.sin(a) * 66} r={26} fill={h} stroke={ln} strokeWidth={4} />;
          })}
          <path d={`M -64 ${HY - 30} Q 0 ${HY - 90} 64 ${HY - 30} Q 0 ${HY - 56} -64 ${HY - 30} Z`} fill={h} />
        </g>
      );
    case 'twin':
      return (
        <g transform={`translate(${sh} 0)`}>
          {[-1, 1].map((sd) => (
            <g key={sd} transform={`rotate(${sway * 0.6} ${sd * 60} ${top + 30})`}>
              <path d={`M ${sd * 56} ${top + 26} q ${sd * 40} -30 ${sd * 50} -4 q ${sd * -6} 18 ${sd * -34} 22 Z`} fill={h} stroke={ln} strokeWidth={4} strokeLinejoin="round" />
              <circle cx={sd * 58} cy={top + 28} r={8} fill={L.trim} stroke={ln} strokeWidth={3} />
            </g>
          ))}
          <path d={`M -70 ${top + 50} Q -74 ${top - 2} 0 ${top - 4} Q 74 ${top - 2} 70 ${top + 50} Q 40 ${top + 22} 0 ${top + 30} Q -40 ${top + 22} -70 ${top + 50} Z`} fill={h} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />
        </g>
      );
    case 'afro':
      return <path transform={`translate(${sh * 0.5} 0)`} d={`M -70 ${top + 40} Q -60 ${top + 10} -20 ${top + 18} Q 0 ${top + 4} 20 ${top + 18} Q 60 ${top + 10} 70 ${top + 40} Q 80 ${top - 10} 0 ${top - 14} Q -80 ${top - 10} -70 ${top + 40} Z`} fill={h} />;
    case 'mohawk':
      return (
        <g transform={`translate(${sh} 0) rotate(${sway * 0.3} 0 ${top})`}>
          <path d={`M -14 ${top + 8} L -22 ${top - 30} L -6 ${top - 14} L 0 ${top - 46} L 8 ${top - 14} L 22 ${top - 32} L 16 ${top + 8} Z`} fill={h} stroke={ln} strokeWidth={4} strokeLinejoin="round" />
          <path d={`M -60 ${HY - 30} q 8 -10 18 -12 M 60 ${HY - 30} q -8 -10 -18 -12`} stroke={h} strokeWidth={6} strokeLinecap="round" opacity={0.6} />
        </g>
      );
    case 'bob':
      return <path transform={`translate(${sh} 0)`} d={`M -82 ${top + 70} Q -86 ${top - 6} 0 ${top - 6} Q 86 ${top - 6} 82 ${top + 70} L 64 ${top + 70} Q 60 ${top + 30} 40 ${top + 26} L -50 ${top + 30} Q -62 ${top + 40} -64 ${top + 70} Z`} fill={h} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />;
    case 'swoop':
      return <path transform={`translate(${sh} 0)`} d={`M -74 ${top + 46} Q -80 ${top - 8} 10 ${top - 10} Q 70 ${top - 8} 80 ${top + 30} Q 40 ${top + 4} -10 ${top + 30} Q -50 ${top + 26} -74 ${top + 46} Z`} fill={h} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />;
    case 'police':
    case 'chef':
    case 'hardhat':
    case 'crown':
    case 'headband':
    case 'helmet': {
      const c = L.hatColor ?? L.trim;
      if (s === 'helmet')
        return (
          <g>
            <circle cx={0} cy={HY} r={HR + 24} fill="#BFE8FF" opacity={0.35} stroke={ln} strokeWidth={5} />
            <path d={`M -60 ${HY - 60} Q -40 ${HY - 88} 0 ${HY - 92}`} stroke="#FFFFFF" strokeWidth={10} fill="none" strokeLinecap="round" opacity={0.8} />
          </g>
        );
      if (s === 'headband')
        return (
          <g transform={`translate(${sh} 0)`}>
            <path d={`M -74 ${top + 44} Q -78 ${top - 4} 0 ${top - 6} Q 78 ${top - 4} 74 ${top + 44} Q 0 ${top + 24} -74 ${top + 44} Z`} fill={h} stroke={ln} strokeWidth={4.5} />
            <path d={`M -78 ${top + 48} Q 0 ${top + 28} 78 ${top + 48}`} stroke={c} strokeWidth={16} fill="none" />
            <path d={`M -78 ${top + 48} Q 0 ${top + 28} 78 ${top + 48}`} stroke={ln} strokeWidth={3} fill="none" opacity={0.4} />
          </g>
        );
      if (s === 'crown')
        return (
          <g transform={`translate(${sh * 0.6} 0)`}>
            <path d={`M -54 ${top + 20} L -60 ${top - 36} L -30 ${top - 6} L 0 ${top - 46} L 30 ${top - 6} L 60 ${top - 36} L 54 ${top + 20} Z`} fill={c} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />
            <circle cx={0} cy={top + 2} r={8} fill="#E8453C" stroke={ln} strokeWidth={3} />
          </g>
        );
      if (s === 'chef')
        return (
          <g transform={`translate(${sh * 0.6} 0)`}>
            <rect x={-54} y={top - 10} width={108} height={40} fill={c} stroke={ln} strokeWidth={4.5} />
            <path d={`M -58 ${top - 6} Q -84 ${top - 60} -40 ${top - 70} Q -20 ${top - 104} 10 ${top - 84} Q 50 ${top - 104} 64 ${top - 60} Q 84 ${top - 30} 58 ${top - 6} Z`} fill={c} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />
          </g>
        );
      if (s === 'hardhat')
        return (
          <g transform={`translate(${sh * 0.6} 0)`}>
            <path d={`M -70 ${top + 40} Q -72 ${top - 22} 0 ${top - 24} Q 72 ${top - 22} 70 ${top + 40} Z`} fill={c} stroke={ln} strokeWidth={4.5} />
            <rect x={-92} y={top + 32} width={184} height={16} rx={8} fill={c} stroke={ln} strokeWidth={4.5} />
            <path d={`M 0 ${top - 22} L 0 ${top + 30}`} stroke={ln} strokeWidth={4} opacity={0.5} />
          </g>
        );
      return (
        <g transform={`translate(${sh * 0.6} 0)`}>
          <path d={`M -66 ${top + 34} L -80 ${top - 8} Q 0 ${top - 40} 80 ${top - 8} L 66 ${top + 34} Z`} fill={c} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />
          <path d={`M -70 ${top + 34} Q ${yaw * 50} ${top + 30} 70 ${top + 34} Q ${60 + yaw * 50} ${top + 52} 0 ${top + 52} Q ${-60 + yaw * 50} ${top + 52} -70 ${top + 34} Z`} fill="#14151A" stroke={ln} strokeWidth={4} />
          <path d={`M -10 ${top + 2} L 0 ${top - 10} L 10 ${top + 2} L 0 ${top + 14} Z`} fill="#F2C94C" stroke={ln} strokeWidth={2.5} />
        </g>
      );
    }
    case 'antenna':
      return (
        <g transform={`translate(${sh * 0.5} 0)`}>
          {[-1, 1].map((sd) => (
            <g key={sd} transform={`rotate(${sd * 12 + sway} ${sd * 26} ${top + 6})`}>
              <path d={`M ${sd * 26} ${top + 6} L ${sd * 34} ${top - 44}`} stroke={ln} strokeWidth={5} strokeLinecap="round" />
              <circle cx={sd * 34} cy={top - 48} r={10} fill={L.trim} stroke={ln} strokeWidth={4} />
            </g>
          ))}
        </g>
      );
    default:
      return null;
  }
};

/** Ve mot nhan vat Pop tai tu the pose. talk: 0..1 mieng mo dong theo loi noi. */
export const Kid: React.FC<{ pose: Pose & { expr: any }; L: KidLook; rimId?: string; shadow?: number; t?: number; talk?: number }> = ({ pose, L, rimId = 'popRim', shadow = 1, t = 0, talk = 0 }) => {
  const j = joints(pose);
  const ln = L.line;
  const e = (pose.expr as KidExpr) ?? 'neutral';
  const limb = (o: { root: P; mid: P; end: P }, w: number, col: string) => {
    const d = `M ${o.root.x} ${o.root.y} L ${o.mid.x} ${o.mid.y} L ${o.end.x} ${o.end.y}`;
    return (
      <g>
        <path d={d} stroke={ln} strokeWidth={w + 9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d={d} stroke={col} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  };
  const shoe = (o: { root: P; mid: P; end: P }) => {
    const x = o.end.x + pose.facing * 10;
    const y = o.end.y + 4;
    return (
      <g>
        <path d={`M ${x - 26} ${y + 8} Q ${x - 26} ${y - 14} ${x - 2} ${y - 14} Q ${x + 26} ${y - 12} ${x + 28} ${y + 8} Z`} fill={L.shoe} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" />
        <path d={`M ${x - 27} ${y + 4} L ${x + 28} ${y + 4}`} stroke={ln} strokeWidth={3} opacity={0.6} />
      </g>
    );
  };
  const hand = (o: { mid: P; end: P }, side: 1 | -1, kind: HandKind) => {
    const ang = (Math.atan2(o.end.x - o.mid.x, o.end.y - o.mid.y) * 180) / Math.PI;
    return (
      <g transform={`translate(${o.end.x} ${o.end.y}) rotate(${-ang})`}>
        {kind === 'point' ? (
          <g>
            <rect x={-5} y={12} width={10} height={26} rx={5} fill={L.hand} stroke={ln} strokeWidth={4} />
            <circle cx={0} cy={8} r={15} fill={L.hand} stroke={ln} strokeWidth={4.5} />
          </g>
        ) : (
          <g>
            <ellipse cx={side * 13} cy={2} rx={6} ry={10} transform={`rotate(${side * -30} ${side * 13} 2)`} fill={L.hand} stroke={ln} strokeWidth={4} />
            <circle cx={0} cy={10} r={16} fill={L.hand} stroke={ln} strokeWidth={4.5} />
          </g>
        )}
      </g>
    );
  };
  const kw = turnWidth(pose.yaw);
  const st = L.topStyle;
  const sleeve = st === 'labcoat' ? L.top : L.top;
  const legCol = st === 'dress' ? L.skin : L.pants;
  const torso = (
    <g transform={`rotate(${pose.tilt}) translate(${pose.yaw * 6} 0) scale(${kw} 1)`}>
      {L.backpack ? <rect x={-40 - pose.yaw * 30} y={-108} width={80} height={96} rx={20} fill={L.backpack} stroke={ln} strokeWidth={4.5} transform={`translate(${-pose.yaw * 26} 0)`} /> : null}
      {st === 'dress' ? (
        <path d="M -40 -114 Q 0 -124 40 -114 L 58 14 Q 0 26 -58 14 Z" fill={L.top} stroke={ln} strokeWidth={5} strokeLinejoin="round" />
      ) : st === 'labcoat' ? (
        <path d="M -46 -114 Q 0 -126 46 -114 L 50 26 Q 0 32 -50 26 Z" fill={L.top} stroke={ln} strokeWidth={5} strokeLinejoin="round" />
      ) : (
        <path d="M -48 -114 Q 0 -126 48 -114 L 46 6 Q 0 16 -46 6 Z" fill={L.top} stroke={ln} strokeWidth={5} strokeLinejoin="round" />
      )}
      <path d="M 14 -118 Q 34 -116 48 -114 L 46 6 Q 30 12 16 13 Z" fill={L.topShade} opacity={0.6} />
      {st === 'hoodie' ? (
        <g>
          {/* tui kangaroo va day mu */}
          <path d="M -28 -34 L 28 -34 L 36 2 L -36 2 Z" fill={L.topShade} stroke={ln} strokeWidth={3.5} strokeLinejoin="round" opacity={0.9} />
          <path d={`M -12 -112 L ${-14 + pose.sway * 0.4} -76 M 12 -112 L ${14 + pose.sway * 0.4} -76`} stroke={L.trim} strokeWidth={5} strokeLinecap="round" />
        </g>
      ) : null}
      {st === 'tee' ? <path d="M -20 -118 Q 0 -102 20 -118" stroke={L.trim} strokeWidth={6} fill="none" strokeLinecap="round" /> : null}
      {st === 'jacket' ? (
        <g>
          <path d="M 0 -116 L 0 10" stroke={ln} strokeWidth={3.5} />
          <path d="M -22 -118 L -4 -96 L 0 -116 L 4 -96 L 22 -118" fill={L.trim} stroke={ln} strokeWidth={3.5} strokeLinejoin="round" />
        </g>
      ) : null}
      {st === 'suit' ? (
        <g>
          <path d="M -24 -118 L 0 -56 L 24 -118 Z" fill="#F2F0EA" />
          <path d="M -7 -114 L 7 -114 L 9 -100 L 5 -64 L 0 -56 L -5 -64 L -9 -100 Z" fill={L.trim} />
          <path d="M -26 -118 L 0 -56 M 26 -118 L 0 -56" stroke={ln} strokeWidth={4} />
        </g>
      ) : null}
      {st === 'labcoat' ? (
        <g>
          <path d="M -22 -118 L 0 -70 L 22 -118" fill="none" stroke={ln} strokeWidth={4} strokeLinejoin="round" />
          <path d="M 0 -70 L 0 28" stroke={ln} strokeWidth={3.5} />
          <rect x={14} y={-60} width={20} height={16} rx={3} fill={L.trim} stroke={ln} strokeWidth={3} />
        </g>
      ) : null}
      {st === 'apron' ? (
        <g>
          <path d="M -26 -96 L 26 -96 L 32 10 L -32 10 Z" fill={L.trim} stroke={ln} strokeWidth={4} strokeLinejoin="round" />
          <path d="M -26 -96 L -36 -116 M 26 -96 L 36 -116" stroke={ln} strokeWidth={4} />
          <rect x={-14} y={-50} width={28} height={20} rx={4} fill="none" stroke={ln} strokeWidth={3} />
        </g>
      ) : null}
      {st === 'dress' ? <path d="M -30 -118 Q 0 -100 30 -118" stroke={L.trim} strokeWidth={7} fill="none" strokeLinecap="round" /> : null}
      {st === 'sweater' ? (
        <g>
          <path d="M -24 -118 L 0 -90 L 24 -118" fill="#FFFFFF" stroke={ln} strokeWidth={3.5} strokeLinejoin="round" />
          {L.tie ? <path d="M -5 -112 L 5 -112 L 6 -94 L 0 -88 L -6 -94 Z" fill={L.tie} /> : null}
          <path d="M -44 -20 L 44 -20 M -44 -8 L 44 -8" stroke={L.topShade} strokeWidth={6} />
        </g>
      ) : null}
      {st === 'vest' ? (
        <g>
          <path d="M -30 -116 L -20 6 M 30 -116 L 20 6" stroke={L.trim} strokeWidth={14} />
          <path d="M -46 -50 L 46 -50" stroke={L.trim} strokeWidth={12} />
          <path d="M 0 -116 L 0 10" stroke={ln} strokeWidth={3} opacity={0.5} />
        </g>
      ) : null}
      {st === 'jersey' ? (
        <g>
          <path d="M -20 -118 Q 0 -100 20 -118" stroke={L.trim} strokeWidth={7} fill="none" strokeLinecap="round" />
          <path d="M -46 -100 L -46 4 M 46 -100 L 46 4" stroke={L.trim} strokeWidth={6} />
          <text x={0} y={-36} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight={800} fontSize={44} fill={L.trim} stroke={ln} strokeWidth={2} paintOrder="stroke">
            {L.number ?? '7'}
          </text>
        </g>
      ) : null}
      {st === 'uniform' ? (
        <g>
          <path d="M -22 -118 L 0 -98 L 22 -118" fill={L.trim} stroke={ln} strokeWidth={3.5} strokeLinejoin="round" />
          {L.tie ? <path d="M -6 -100 L 6 -100 L 7 -66 L 0 -58 L -7 -66 Z" fill={L.tie} /> : null}
          <rect x={14} y={-84} width={20} height={14} rx={3} fill={L.trim} stroke={ln} strokeWidth={3} />
          <path d="M 0 -98 L 0 8" stroke={ln} strokeWidth={3} opacity={0.5} />
          {[-70, -46, -22].map((y) => <circle key={y} cx={-8} cy={y} r={3.5} fill={ln} opacity={0.6} />)}
        </g>
      ) : null}
      {st === 'stripe' ? (
        <g>
          {[-104, -82, -60, -38, -16].map((y) => <path key={y} d={`M -46 ${y} L 46 ${y}`} stroke={L.trim} strokeWidth={10} />)}
        </g>
      ) : null}
      {st === 'spacesuit' ? (
        <g>
          <rect x={-26} y={-86} width={52} height={40} rx={8} fill="#C9CEDA" stroke={ln} strokeWidth={3.5} />
          <circle cx={-10} cy={-66} r={5} fill="#E8453C" />
          <circle cx={8} cy={-66} r={5} fill="#5AE8FF" />
          <path d="M -46 -10 L 46 -10" stroke={L.trim} strokeWidth={8} />
        </g>
      ) : null}
      {st === 'robot' ? (
        <g>
          <rect x={-30} y={-92} width={60} height={50} rx={8} fill="#2E3346" stroke={ln} strokeWidth={3.5} />
          {[0, 1, 2].map((i) => <rect key={i} x={-22 + i * 16} y={-80} width={10} height={10 + ((i * 7) % 12)} fill={L.trim} />)}
          {[-108, -20].map((y) => [-38, 38].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r={3.5} fill={ln} opacity={0.6} />))}
        </g>
      ) : null}
      {st === 'jacket' && L.tie ? <path d="M -5 -112 L 5 -112 L 6 -80 L 0 -74 L -6 -80 Z" fill={L.tie} /> : null}
    </g>
  );
  const ay = Math.min(1, Math.abs(pose.yaw));
  const cheek =
    e === 'shy' || e === 'embarrassed' || e === 'kiss'
      ? 1
      : L.blush && (e === 'happy' || e === 'love' || e === 'oops' || e === 'wow' || e === 'laugh' || e === 'excited' || e === 'proud' || e === 'wink' || e === 'drool')
        ? 0.7
        : L.blush && e !== 'sick' && e !== 'scared' && e !== 'rage'
          ? 0.25
          : 0;
  const TINT: Partial<Record<KidExpr, [string, number, number]>> = {
    // mau, do dam, phan tren cua mat (0 = ca mat, 1 = chi tran)
    rage: ['#FF3B3B', 0.38, 0],
    sick: ['#7FC46A', 0.32, 0],
    scared: ['#5A6BFF', 0.3, 0.5],
    jealous: ['#5AC46A', 0.28, 0.45],
    embarrassed: ['#FF5A7A', 0.2, 0],
    evil: ['#3A2A5A', 0.3, 0.55],
    nervous: ['#7F8CFF', 0.14, 0.5],
  };
  const tint = TINT[e];
  const angry = e === 'angry';
  const head = (
    <g transform={`rotate(${pose.tilt}) rotate(${pose.headTilt} 0 ${HY + 50})`}>
      <HairBack L={L} yaw={pose.yaw} sway={pose.sway} />
      {st === 'hoodie' ? <path d={`M -64 ${HY + 46} Q -78 ${HY + 86} -40 ${HY + 98} L 40 ${HY + 98} Q 78 ${HY + 86} 64 ${HY + 46} Z`} fill={L.top} stroke={ln} strokeWidth={4.5} strokeLinejoin="round" /> : null}
      <circle cx={0} cy={HY} r={HR} fill={L.skin} stroke={ln} strokeWidth={5.5} />
      <path d={`M 18 ${HY + 70} A ${HR} ${HR} 0 0 0 ${74} ${HY + 18} A 84 84 0 0 1 18 ${HY + 70} Z`} fill={L.skinShade} opacity={0.9} />
      {angry ? <circle cx={0} cy={HY} r={HR - 3} fill="#FF4D4D" opacity={0.18} /> : null}
      {tint ? (
        <g>
          <defs>
            <linearGradient id={`tn${e}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={tint[0]} stopOpacity={tint[1]} />
              <stop offset={tint[2] ? tint[2] : 1} stopColor={tint[0]} stopOpacity={tint[2] ? 0 : tint[1]} />
            </linearGradient>
          </defs>
          <circle cx={0} cy={HY} r={HR - 3} fill={`url(#tn${e})`} />
        </g>
      ) : null}
      {e === 'scared' || e === 'jealous' ? [-34, -20, -6, 8, 22, 36].map((x) => <path key={x} d={`M ${x} ${HY - 70 + Math.abs(x) * 0.25} L ${x} ${HY - 38}`} stroke={e === 'scared' ? '#3A44C8' : '#3A8A4A'} strokeWidth={3.5} opacity={0.6} />) : null}
      <HairFront L={L} yaw={pose.yaw} sway={pose.sway} />
      {L.headphones ? (
        <g>
          <path d={`M -74 ${HY} Q -78 ${HY - 100} 0 ${HY - 100} Q 78 ${HY - 100} 74 ${HY}`} stroke={L.line} strokeWidth={12} fill="none" />
          <path d={`M -74 ${HY} Q -78 ${HY - 100} 0 ${HY - 100} Q 78 ${HY - 100} 74 ${HY}`} stroke={L.headphones} strokeWidth={6} fill="none" />
          {[-1, 1].map((sd) => (Math.abs(pose.yaw) > 0.72 && sd === (pose.yaw > 0 ? -1 : 1) ? null : <rect key={sd} x={sd * (78 - Math.abs(pose.yaw) * 10) - 14} y={HY - 26} width={28} height={50} rx={12} fill={L.headphones} stroke={L.line} strokeWidth={4} />))}
        </g>
      ) : null}
      <g transform={`translate(${pose.yaw * 34} 0) scale(${1 - 0.3 * ay} 1)`}>
        {cheek > 0 ? (
          <g opacity={cheek}>
            <ellipse cx={-44} cy={HY + 26} rx={13} ry={7} fill="#FF8FA3" />
            <ellipse cx={44} cy={HY + 26} rx={13} ry={7} fill="#FF8FA3" />
          </g>
        ) : null}
        {L.mask ? <path d={`M -64 ${HY - 16} Q 0 ${HY - 26} 64 ${HY - 16} L 64 ${HY + 14} Q 0 ${HY + 4} -64 ${HY + 14} Z`} fill="#1E1C2E" opacity={0.92} /> : null}
        <Eyes e={e} blink={pose.blink} look={pose.look} yaw={pose.yaw} L={L} t={t} />
        {L.glasses ? (
          <g fill="none" stroke={ln} strokeWidth={4.5}>
            <circle cx={-27} cy={HY - 2} r={21} />
            <circle cx={27} cy={HY - 2} r={21} />
            <path d={`M -6 ${HY - 4} L 6 ${HY - 4}`} />
          </g>
        ) : null}
        {L.beard ? <path d={`M -60 ${HY + 20} Q -56 ${HY + 74} 0 ${HY + 80} Q 56 ${HY + 74} 60 ${HY + 20} Q 40 ${HY + 50} 0 ${HY + 52} Q -40 ${HY + 50} -60 ${HY + 20} Z`} fill={L.hair} stroke={ln} strokeWidth={3.5} strokeLinejoin="round" /> : null}
        {L.mustache ? <path d={`M -26 ${HY + 30} Q -12 ${HY + 18} 0 ${HY + 28} Q 12 ${HY + 18} 26 ${HY + 30} Q 12 ${HY + 34} 0 ${HY + 30} Q -12 ${HY + 34} -26 ${HY + 30} Z`} fill={L.hair} stroke={ln} strokeWidth={3} /> : null}
        <Mouth e={e} ink={ln} t={t} talk={talk} />
        {e === 'cry'
          ? [-27, 27].map((cx) => {
              const ph = (t * 0.25 + (cx > 0 ? 0.5 : 0)) % 1;
              return (
                <g key={cx}>
                  <path d={`M ${cx - 8} ${HY + 14} Q ${cx - 12} ${HY + 50} ${cx - 6} ${HY + 70} L ${cx + 6} ${HY + 70} Q ${cx + 12} ${HY + 50} ${cx + 8} ${HY + 14} Z`} fill="#7FD3FF" opacity={0.85} />
                  <circle cx={cx + (cx > 0 ? 10 : -10)} cy={HY + 20 + ph * 70} r={6} fill="#7FD3FF" opacity={1 - ph} />
                </g>
              );
            })
          : null}
        {e === 'shy' || e === 'embarrassed' ? (
          <g stroke="#E8456A" strokeWidth={3} opacity={0.8}>
            {[-52, -44, -36, 36, 44, 52].map((x) => <path key={x} d={`M ${x} ${HY + 20} l -5 12`} />)}
          </g>
        ) : null}
        {e === 'laugh' ? [-1, 1].map((sd) => <path key={sd} d={`M ${sd * 44} ${HY + 4} q ${sd * 10} 10 ${sd * 4} 20 q ${sd * -8} -6 ${sd * -4} -20 Z`} fill="#8FD3FF" stroke={ln} strokeWidth={2.5} />) : null}
        {e === 'nervous' || e === 'embarrassed' || e === 'relieved' ? (
          <path transform={`translate(${e === 'relieved' ? -70 : 66} ${HY - 40 + (e === 'relieved' ? ((t * 1.2) % 30) : 0)})`} d="M 0 0 q 8 14 0 22 q -8 -8 0 -22 Z" fill="#8FD3FF" stroke={ln} strokeWidth={2.5} />
        ) : null}
        {e === 'nervous' ? <path transform={`translate(-68 ${HY - 30})`} d="M 0 0 q 7 12 0 19 q -7 -7 0 -19 Z" fill="#8FD3FF" stroke={ln} strokeWidth={2.5} /> : null}
        {e === 'rage'
          ? [-1, 1].map((sd) => {
              const p = (t * 0.06 + (sd > 0 ? 0.5 : 0)) % 1;
              return <circle key={sd} cx={sd * (70 + p * 30)} cy={HY - 70 - p * 50} r={10 + p * 16} fill="#FFFFFF" opacity={0.8 * (1 - p)} stroke={ln} strokeWidth={2} />;
            })
          : null}
        {e === 'rage' || e === 'determined' ? <path d={`M 52 ${HY - 62} l 10 10 m 0 -10 l -10 10`} stroke="#E8453C" strokeWidth={5} strokeLinecap="round" /> : null}
        {e === 'proud' || e === 'excited' ? [[-80, -60], [84, -50]].map(([x, y2], k) => (
          <path key={k} transform={`translate(${x} ${HY + y2}) scale(${0.8 + 0.3 * Math.abs(Math.sin(t * 0.3 + k))})`} d="M 0 -12 L 3 -3 L 12 0 L 3 3 L 0 12 L -3 3 L -12 0 L -3 -3 Z" fill="#FFD23F" stroke={ln} strokeWidth={2} />
        )) : null}
        {e === 'kiss' ? <path transform={`translate(${46 + ((t * 0.8) % 30)} ${HY + 24 - ((t * 0.8) % 30)}) scale(0.7)`} d="M 0 10 C -22 -4 -12 -20 0 -9 C 12 -20 22 -4 0 10 Z" fill="#FF4D7A" stroke={ln} strokeWidth={3} /> : null}
        {e === 'shock' || e === 'oops' || e === 'worried' ? <path d={`M 66 ${HY - 40} q 8 14 0 22 q -8 -8 0 -22 Z`} fill="#8FD3FF" stroke={ln} strokeWidth={2.5} /> : null}
        {angry ? <path d={`M 52 ${HY - 62} l 10 10 m 0 -10 l -10 10 M 60 ${HY - 70} l 0 6 M 46 ${HY - 56} l 6 0`} stroke="#E8453C" strokeWidth={5} strokeLinecap="round" /> : null}
        {pose.glasses > 0.01 ? (
          <g opacity={pose.glasses} transform={`translate(0 ${(1 - pose.glasses) * -70})`}>
            <path d={`M -66 ${HY - 14} L 66 ${HY - 14}`} stroke={ln} strokeWidth={7} strokeLinecap="round" />
            <path d={`M -58 ${HY - 16} L -6 ${HY - 16} L -10 ${HY + 10} Q -32 ${HY + 22} -54 ${HY + 10} Z`} fill="#10121F" stroke={ln} strokeWidth={3} />
            <path d={`M 6 ${HY - 16} L 58 ${HY - 16} L 54 ${HY + 10} Q 32 ${HY + 22} 10 ${HY + 10} Z`} fill="#10121F" stroke={ln} strokeWidth={3} />
            <path d={`M -46 ${HY + 2} L -30 ${HY - 12} M 18 ${HY + 2} L 34 ${HY - 12}`} stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.85} />
          </g>
        ) : null}
        {pose.glint && pose.glint > 0.01 && pose.blink < 0.95
          ? [-27, 27].map((cx) => (
              <g key={`g${cx}`} opacity={Math.min(1, pose.glint ?? 0)}>
                <circle cx={cx} cy={HY - 2} r={22} fill={pose.glintColor ?? '#7FD4FF'} opacity={0.25} />
                <ellipse cx={cx} cy={HY - 2} rx={12} ry={15} fill={pose.glintColor ?? '#7FD4FF'} />
                <circle cx={cx + 3} cy={HY - 6} r={3} fill="#fff" />
              </g>
            ))
          : null}
      </g>
    </g>
  );
  const near = pose.yaw < 0;
  return (
    <g>
      {shadow > 0
        ? (() => {
            const gy = (pose as any).groundY ?? pose.y + LEG_LEN * pose.scale;
            const air = Math.max(0, gy - (pose.y + LEG_LEN * pose.scale)) / (200 * pose.scale);
            const lying = Math.min(1, Math.abs(pose.spin) / 80);
            const f = Math.max(0.35, 1 - air * 0.6);
            return <ellipse cx={pose.x} cy={gy + 10 * pose.scale} rx={(74 + 60 * lying) * pose.scale * f} ry={13 * pose.scale * f} fill="#1B1530" opacity={0.22 * shadow * f} />;
          })()
        : null}
      <g transform={`translate(${pose.x} ${pose.y}) scale(${pose.scale}) rotate(${pose.spin} 0 -90)`} filter={rimId ? `url(#${rimId})` : undefined}>
        <g transform={`translate(0 ${LEG_LEN}) scale(${1 + 0.6 * pose.squash} ${1 - pose.squash}) translate(0 ${-LEG_LEN})`}>
          {L.cape ? (
            <path
              transform={`rotate(${pose.tilt})`}
              d={`M -44 -116 Q ${-70 - pose.yaw * 40 - pose.sway * 0.6} 20 ${-60 - pose.yaw * 60 - pose.sway} 70 L ${60 - pose.yaw * 60 - pose.sway} 70 Q ${70 - pose.yaw * 40 - pose.sway * 0.6} 20 44 -116 Z`}
              fill={L.cape}
              stroke={ln}
              strokeWidth={4.5}
              strokeLinejoin="round"
            />
          ) : null}
          {near ? <>{limb(j.legR, 17, legCol)}{shoe(j.legR)}{limb(j.legL, 17, legCol)}{shoe(j.legL)}</> : <>{limb(j.legL, 17, legCol)}{shoe(j.legL)}{limb(j.legR, 17, legCol)}{shoe(j.legR)}</>}
          {near ? <>{limb(j.armR, 17, sleeve)}{hand(j.armR, -1, pose.handR)}</> : <>{limb(j.armL, 17, sleeve)}{hand(j.armL, 1, pose.handL)}</>}
          {torso}
          {near ? <>{limb(j.armL, 17, sleeve)}{hand(j.armL, 1, pose.handL)}</> : <>{limb(j.armR, 17, sleeve)}{hand(j.armR, -1, pose.handR)}</>}
          {head}
        </g>
      </g>
    </g>
  );
};

/** Bo loc vien sang mem cho bo Pop (khong mau cam hoang hon). */
export const PopDefs: React.FC = () => (
  <defs>
    <filter id="popRim" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx={0} dy={6} stdDeviation={0.01} floodColor="#1B1530" floodOpacity={0.18} />
    </filter>
    <filter id="popRimNight" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx={3} dy={-1} stdDeviation={1.6} floodColor="#9FC0FF" floodOpacity={0.9} />
    </filter>
    <filter id="popRimWarm" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx={4} dy={-1} stdDeviation={1.6} floodColor="#FFB15A" floodOpacity={0.9} />
    </filter>
    <filter id="popBlur3" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation={3} />
    </filter>
    <filter id="popBlur7" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation={7} />
    </filter>
  </defs>
);
