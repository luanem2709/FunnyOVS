// Bo nhan vat "Doll 3D": nguoi go/bup be khop cau, dau tron mat cham, mu, khan quang co, ao khoac co cuc,
// tay chan ong tron co do bong (ve gia 3D bang gradient, khong vien den). Dung chung bo xuong (Pose, joints)
// voi engine nen moi tu the/chuyen dong cua bo Pop deu dung duoc. Mau sac doi theo bang mau (palette).
import React from 'react';
import { joints, turnWidth, LEG_LEN, Pose, HandKind } from '../../engine';
import { KID_CAST, KidLook, shadeHex } from './kid';

export type DollHat = 'none' | 'fedora' | 'bowler' | 'beanie' | 'cap' | 'tophat' | 'beret' | 'chef' | 'hardhat' | 'crown' | 'helmet' | 'police' | 'headband'
  | 'ninja' | 'army' | 'knight' | 'pirate' | 'cowboy' | 'wizard' | 'viking' | 'straw';
export type DollHair = 'none' | 'three' | 'short' | 'bob' | 'pony' | 'bun' | 'long' | 'afro' | 'twin' | 'mohawk' | 'antenna' | 'curly' | 'topknot' | 'wild';
export type DollCoat = 'coat' | 'sweater' | 'hoodie' | 'dress' | 'suit' | 'space' | 'robot' | 'apron' | 'pelt' | 'kimono' | 'armor' | 'robe' | 'stripe' | 'trench';

export type DollLook = {
  kit: 'doll';
  skin: string;
  coat: string;
  pants: string;
  shoe: string;
  scarf?: string;
  hat: DollHat;
  hatColor: string;
  band: string;
  hair: DollHair;
  hairColor: string;
  coatStyle: DollCoat;
  trim: string;
  buttons: boolean;
  glasses?: boolean;
  mustache?: boolean;
  beard?: boolean;
  bag?: string; // cap da cam o tay sau
  backpack?: string;
  cape?: string;
  tie?: string;
  blush?: boolean;
  headphones?: string;
  mask?: boolean;
  number?: string;
  headScale?: number;
  eyeR?: number; // ban kinh mat tron (bo Ink)
  eyepatch?: boolean; // bit mat cuop bien
  obi?: string; // dai lung kimono / that lung
  bareLegs?: boolean; // chan tran (nguoi tien su)
  ink?: boolean; // bo 'Ink': dau toi, mat trang to, vien den day + vien neon
};

/** Bang mau cho ca dan nhan vat: doi mot cho la ca tap doi mau. "goc" = giu mau rieng tung nhan vat. */
export type Palette = { label: string; coats: string[]; pants: string[]; scarves: string[]; hats: string[]; skins: string[]; shoes: string[] };
export const DOLL_PALETTES: Record<string, Palette> = {
  goc: { label: 'Màu gốc từng nhân vật', coats: [], pants: [], scarves: [], hats: [], skins: ['#EDBF9E', '#E2AE8A', '#F2CDB3', '#C98F68'], shoes: ['#2A2730'] },
  kem: { label: 'Kem & xanh than (cổ điển)', coats: ['#EFE6D6', '#C9A66B', '#DCCDB4', '#8C9A7A', '#E8D8BF', '#B9806A', '#F3EEE4'], pants: ['#26324D', '#2F2A33', '#3A4560', '#1F2838'], scarves: ['#3E8F8C', '#B4543C', '#D9A441', '#5468A8', '#7A4E8C'], hats: ['#344A6A', '#4B3A2E', '#2C2C34', '#5B6B4A'], skins: ['#EDBF9E', '#E2AE8A', '#F2CDB3', '#C98F68'], shoes: ['#1E1C22', '#3A2A20'] },
  keo: { label: 'Kẹo ngọt (rực rỡ)', coats: ['#FF6F9C', '#5BB8FF', '#FFC94A', '#9B7BFF', '#4FD6A0', '#FF8A4C'], pants: ['#3A3570', '#5A3E8A', '#24497A', '#4A2F5E'], scarves: ['#FFE066', '#FF5D8F', '#5CE1E6', '#B4F06A', '#FFFFFF'], hats: ['#FF4F7E', '#3A86FF', '#8338EC', '#FB5607'], skins: ['#F4C7A8', '#E8B08C', '#F8D7C0', '#CF9670'], shoes: ['#FFFFFF', '#2A2140'] },
  pastel: { label: 'Pastel nhẹ', coats: ['#F8C8DC', '#BDE0FE', '#CDEAC0', '#FFE5B4', '#D7C4F2', '#FFD6C9'], pants: ['#6D7BA6', '#8C7AA9', '#6A9A9A', '#9A8478'], scarves: ['#FFAFCC', '#A2D2FF', '#B9FBC0', '#FDE4A6'], hats: ['#E8A8C8', '#9CC3F0', '#B8A6E0', '#F2C6A0'], skins: ['#F6D3BD', '#EEC3A6', '#F9E0CF', '#D9AA88'], shoes: ['#FFFFFF', '#7A6A8A'] },
  bien: { label: 'Biển xanh', coats: ['#2EC4B6', '#3A86FF', '#90E0EF', '#0096C7', '#F1FAEE', '#48CAE4'], pants: ['#023E8A', '#1D3557', '#03045E', '#264653'], scarves: ['#FFB703', '#FB8500', '#F1FAEE', '#E63946'], hats: ['#1D3557', '#0077B6', '#F1FAEE', '#E9C46A'], skins: ['#EDBF9E', '#E2AE8A', '#F2CDB3', '#C98F68'], shoes: ['#F1FAEE', '#1D3557'] },
  hoanghon: { label: 'Hoàng hôn cam đỏ', coats: ['#FF6B6B', '#FFA94D', '#FFD43B', '#F783AC', '#E8590C', '#FFC9A9'], pants: ['#5F3DC4', '#862E9C', '#3B2A5E', '#5C2A3E'], scarves: ['#FFE8A3', '#7048E8', '#FFFFFF', '#2B8A3E'], hats: ['#C92A2A', '#5F3DC4', '#E67700', '#3B2A5E'], skins: ['#F0BE98', '#E0A57E', '#F6D0B4', '#C4875E'], shoes: ['#2B1D3A', '#5C2A3E'] },
  rung: { label: 'Rừng & đất', coats: ['#6A994E', '#A7C957', '#BC6C25', '#DDA15E', '#F2E8CF', '#7F5539'], pants: ['#283618', '#3D2B1F', '#386641', '#4A3B2A'], scarves: ['#E9C46A', '#BC4749', '#F2E8CF', '#6A994E'], hats: ['#606C38', '#7F5539', '#283618', '#BC6C25'], skins: ['#E8B996', '#D6A07A', '#F0CBAE', '#B9805A'], shoes: ['#3D2B1F', '#283618'] },
  neon: { label: 'Neon đêm', coats: ['#F72585', '#7209B7', '#4CC9F0', '#B5179E', '#4361EE', '#06D6A0'], pants: ['#14121F', '#1F1A3A', '#240046', '#10002B'], scarves: ['#4CC9F0', '#F72585', '#FFE066', '#06D6A0'], hats: ['#3A0CA3', '#14121F', '#F72585', '#4CC9F0'], skins: ['#F2C2A0', '#E0A882', '#F7D4BC', '#C88E66'], shoes: ['#4CC9F0', '#F72585'] },
  dat: { label: 'Đất sét trầm', coats: ['#C9ADA7', '#9A8C98', '#F2E9E4', '#B5838D', '#A3B18A', '#D6CCC2'], pants: ['#4A4E69', '#22223B', '#5E503F', '#3D405B'], scarves: ['#E5989B', '#6D6875', '#FFB4A2', '#81B29A'], hats: ['#4A4E69', '#5E503F', '#6D6875', '#22223B'], skins: ['#E9C2A6', '#DBAE8F', '#F2D5C2', '#C49577'], shoes: ['#22223B', '#5E503F'] },
};
export const PALETTE_IDS = Object.keys(DOLL_PALETTES);

// kieu rieng tung nhan vat trong bo Doll (mu, toc, ao, phu kien)
const EXTRA: Record<string, Partial<DollLook>> = {
  nam: { hat: 'fedora', scarf: '#3E8F8C', coatStyle: 'coat' },
  linh: { hat: 'beret', hair: 'long', coatStyle: 'coat' },
  tuan: { hat: 'cap', coatStyle: 'hoodie' },
  me: { hair: 'bun', coatStyle: 'apron' },
  bo: { hat: 'none', hair: 'short', coatStyle: 'sweater' },
  sep: { hat: 'bowler', coatStyle: 'suit', bag: '#6B4A32' },
  thay: { hair: 'none', coatStyle: 'coat' },
  em: { hair: 'twin', coatStyle: 'dress' },
  ba: { hair: 'bun', coatStyle: 'sweater', scarf: '#B4543C' },
  khoa: { hair: 'curly', coatStyle: 'hoodie' },
  alien: { hair: 'antenna', coatStyle: 'suit' },
  chi: { hair: 'long', coatStyle: 'coat', scarf: '#D9A441' },
  ong: { hat: 'fedora', coatStyle: 'sweater' },
  daigia: { hat: 'tophat', coatStyle: 'suit', bag: '#2A2730' },
  minh: { hair: 'short', coatStyle: 'sweater' },
  hung: { hair: 'mohawk', coatStyle: 'hoodie' },
  mai: { hair: 'long', coatStyle: 'dress', hat: 'beret' },
  trom: { hat: 'beanie', coatStyle: 'sweater' },
  gamethu: { hair: 'short', coatStyle: 'hoodie' },
  phihanh: { hat: 'helmet', coatStyle: 'space' },
  robot: { hair: 'antenna', coatStyle: 'robot' },
  // ---- 20 nhan vat theo phong cach doi thu (tu, tien su, Nhat co, noir, TV, chien binh, phieu luu)
  tunhan: { hat: 'none', hair: 'short', coatStyle: 'stripe', trim: '#1E1C2E', pants: '#2A2733' },
  quanguc: { hat: 'police', coatStyle: 'coat', tie: '#14151A' },
  tiensu: { hat: 'none', hair: 'wild', coatStyle: 'pelt', trim: '#6B4423', bareLegs: true },
  tiensu2: { hat: 'none', hair: 'long', coatStyle: 'pelt', trim: '#6B4423', bareLegs: true },
  barista: { hat: 'beanie', coatStyle: 'apron', trim: '#7A5233' },
  samurai: { hat: 'none', hair: 'topknot', coatStyle: 'kimono', obi: '#B8323C' },
  ninja: { hat: 'ninja', hatColor: '#1E1C2E', coatStyle: 'kimono', obi: '#B8323C' },
  lanhchua: { hat: 'none', hair: 'topknot', coatStyle: 'kimono', obi: '#2A2733' },
  thamtu: { hat: 'fedora', hatColor: '#4A3E30', band: '#1A1612', coatStyle: 'trench', obi: '#7A6040' },
  phatthanh: { hat: 'none', hair: 'short', coatStyle: 'suit' },
  binhsi: { hat: 'army', coatStyle: 'coat', obi: '#3A3220' },
  hiepsi: { hat: 'knight', hatColor: '#B8C0CC', coatStyle: 'armor' },
  cuopbien: { hat: 'pirate', hatColor: '#1E1C2E', band: '#F2C94C', coatStyle: 'coat', eyepatch: true, obi: '#F2C94C' },
  caoboi: { hat: 'cowboy', hatColor: '#8A5A2E', band: '#3A2418', coatStyle: 'trench', scarf: '#B8323C', obi: '#5A3A22' },
  phuthuy: { hat: 'wizard', hatColor: '#4A3A9A', band: '#F2C94C', coatStyle: 'robe', obi: '#F2C94C' },
  viking: { hat: 'viking', hatColor: '#9AA3B0', coatStyle: 'pelt', trim: '#5A3A22' },
  macarong: { hat: 'none', hair: 'short', coatStyle: 'suit', tie: '#B8323C' },
  sieunhan: { hat: 'none', hair: 'short', coatStyle: 'sweater', obi: '#F2C94C' },
  nongdan: { hat: 'straw', hatColor: '#E3C27A', band: '#B8323C', coatStyle: 'coat' },
  thamhiem: { hat: 'cowboy', hatColor: '#C9B38A', band: '#6B4A32', coatStyle: 'trench', obi: '#6B4A32' },
};
const HAT_OF: Record<string, DollHat> = { cap: 'cap', beanie: 'beanie', police: 'police', chef: 'chef', hardhat: 'hardhat', crown: 'crown', helmet: 'helmet', headband: 'headband' };
const HAIR_OF: Record<string, DollHair> = {
  tuft: 'short', spiky: 'short', side: 'short', swoop: 'short', curly: 'curly', afro: 'afro', mohawk: 'mohawk', bob: 'bob', pony: 'pony', bun: 'bun', long: 'long', twin: 'twin',
  antenna: 'antenna', bald: 'none', none: 'none',
};
const COAT_OF: Record<string, DollCoat> = {
  hoodie: 'hoodie', tee: 'sweater', suit: 'suit', dress: 'dress', labcoat: 'coat', jacket: 'coat', apron: 'apron', sweater: 'sweater', vest: 'coat', jersey: 'sweater',
  uniform: 'coat', stripe: 'stripe', spacesuit: 'space', robot: 'robot',
};
const CAST_IDS = Object.keys(KID_CAST);
const isWhite = (c: string) => /^#f[0-9a-f]f[0-9a-f]f[0-9a-f]$/i.test(c);

/** Trang phuc bo Doll cho mot nhan vat (cast id cua bo Pop), theo bang mau. */
export const dollLook = (cast: string, K: KidLook, palette = 'goc', heroColor?: string, heroAccent?: string): DollLook => {
  const P = DOLL_PALETTES[palette] ?? DOLL_PALETTES.goc;
  const h = Math.max(0, CAST_IDS.indexOf(cast));
  const pick = (a: string[], k: number, d: string) => (a.length ? a[(h + k) % a.length] : d);
  const ex = EXTRA[cast] ?? {};
  const special = !isWhite(K.skin) && /^(alien|robot|zombie|macarong)$/.test(cast);
  const hatFromKid = HAT_OF[K.hairStyle];
  const goc = !P.coats.length;
  const L: DollLook = {
    kit: 'doll',
    skin: special ? K.skin : pick(P.skins, 0, '#EDBF9E'),
    coat: goc ? K.top : pick(P.coats, 0, K.top),
    pants: goc ? K.pants : pick(P.pants, 1, K.pants),
    shoe: goc ? (isWhite(K.shoe) ? '#2A2730' : K.shoe) : pick(P.shoes, 0, '#2A2730'),
    hat: hatFromKid ?? 'none',
    hatColor: goc ? (K.hatColor ?? shadeHex(K.top, 0.6)) : pick(P.hats, 2, '#344A6A'),
    band: goc ? K.trim : pick(P.scarves, 1, '#D9A441'),
    hair: HAIR_OF[K.hairStyle] ?? 'short',
    hairColor: K.hair,
    coatStyle: COAT_OF[K.topStyle] ?? 'coat',
    trim: goc ? K.trim : pick(P.scarves, 3, K.trim),
    buttons: true,
    glasses: K.glasses,
    mustache: K.mustache,
    beard: K.beard,
    backpack: K.backpack,
    cape: K.cape,
    tie: K.tie,
    blush: K.blush,
    headphones: K.headphones,
    mask: K.mask,
    number: K.number,
    ...ex,
  };
  if (L.hat === 'none' && hatFromKid) L.hat = hatFromKid;
  if (ex.scarf && !goc) L.scarf = pick(P.scarves, 0, ex.scarf);
  if (!goc && cast === 'trom') L.coat = '#F3EEE4';
  if (heroColor && /^#[0-9a-fA-F]{6}$/.test(heroColor)) {
    // mau kenh: bang mau goc -> ao; bang mau khac -> khan + day mu (giu mau ao theo bang mau)
    if (goc) L.coat = heroColor;
    else L.scarf = heroColor;
    L.band = heroColor;
  }
  if (heroAccent && /^#[0-9a-fA-F]{6}$/.test(heroAccent) && goc) L.trim = heroAccent;
  return L;
};

// ---------------------------------------------------------------- ve
type P = { x: number; y: number };
const gid = (c: string) => c.replace('#', '').toLowerCase();
const LIGHT = { x: -0.55, y: -0.83 }; // anh sang tu tren ben trai

/** Gradient cau (dau, tay, khop, nut ao) va gradient ngang (than ao) cho tung mau dung trong khung hinh. */
const Shade: React.FC<{ cols: string[] }> = ({ cols }) => (
  <defs>
    {Array.from(new Set(cols.filter(Boolean))).map((c) => (
      <React.Fragment key={c}>
        <radialGradient id={`ds${gid(c)}`} cx="0.42" cy="0.4" r="0.66" fx="0.34" fy="0.3">
          <stop offset="0" stopColor={shadeHex(c, 1.22)} />
          <stop offset="0.45" stopColor={c} />
          <stop offset="1" stopColor={shadeHex(c, 0.62)} />
        </radialGradient>
        <linearGradient id={`dl${gid(c)}`} x1="0" y1="0" x2="1" y2="0.15">
          <stop offset="0" stopColor={shadeHex(c, 1.14)} />
          <stop offset="0.38" stopColor={c} />
          <stop offset="0.82" stopColor={shadeHex(c, 0.78)} />
          <stop offset="1" stopColor={shadeHex(c, 0.6)} />
        </linearGradient>
      </React.Fragment>
    ))}
  </defs>
);
const sph = (c: string) => `url(#ds${gid(c)})`;
const lin = (c: string) => `url(#dl${gid(c)})`;

/** Ong tron (canh tay/chan) co vung sang va vung toi doc theo than ong. */
const Tube: React.FC<{ pts: P[]; w: number; c: string; joint?: boolean }> = ({ pts, w, c, joint = true }) => {
  const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  const segs = pts.slice(1).map((b, i) => {
    const a = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const n = Math.hypot(dx, dy) || 1;
    let nx = -dy / n;
    let ny = dx / n;
    if (nx * LIGHT.x + ny * LIGHT.y < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { a, b, nx, ny };
  });
  return (
    <g>
      <path d={d} stroke={shadeHex(c, 0.6)} strokeWidth={w + 2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} stroke={c} strokeWidth={w - 1} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {segs.map((s, i) => (
        <g key={i}>
          <path d={`M ${s.a.x - s.nx * w * 0.3} ${s.a.y - s.ny * w * 0.3} L ${s.b.x - s.nx * w * 0.3} ${s.b.y - s.ny * w * 0.3}`} stroke={shadeHex(c, 0.72)} strokeWidth={w * 0.32} strokeLinecap="round" opacity={0.75} />
          <path d={`M ${s.a.x + s.nx * w * 0.2} ${s.a.y + s.ny * w * 0.2} L ${s.b.x + s.nx * w * 0.2} ${s.b.y + s.ny * w * 0.2}`} stroke={shadeHex(c, 1.25)} strokeWidth={w * 0.22} strokeLinecap="round" opacity={0.55} />
        </g>
      ))}
      {joint && pts.length > 2 ? <circle cx={pts[1].x} cy={pts[1].y} r={w * 0.52} fill={sph(c)} /> : null}
    </g>
  );
};

export type DollExpr = string;
type Face = { eye: 'dot' | 'closed' | 'happy' | 'wide' | 'half' | 'x' | 'heart' | 'spiral' | 'star' | 'wink' | 'down'; brow?: 'angry' | 'sad' | 'up' | 'one' | 'flat'; mouth?: 'smile' | 'grin' | 'o' | 'frown' | 'flat' | 'wave' | 'open' | 'kiss' | 'smirk' | 'drool'; tint?: string; fx?: 'sweat' | 'tears' | 'anger' | 'hearts' | 'steam' | 'stars' | 'drop' };
const FACE: Record<string, Face> = {
  neutral: { eye: 'dot' },
  happy: { eye: 'happy', mouth: 'smile' },
  smug: { eye: 'half', brow: 'one', mouth: 'smirk' },
  shock: { eye: 'wide', brow: 'up', mouth: 'o', fx: 'drop' },
  worried: { eye: 'dot', brow: 'sad', mouth: 'wave', fx: 'drop' },
  oops: { eye: 'dot', brow: 'sad', mouth: 'flat', fx: 'sweat' },
  cool: { eye: 'dot', mouth: 'smirk' },
  dizzy: { eye: 'spiral', mouth: 'wave' },
  tired: { eye: 'half', mouth: 'flat' },
  angry: { eye: 'dot', brow: 'angry', mouth: 'frown', fx: 'anger' },
  love: { eye: 'heart', mouth: 'smile', fx: 'hearts' },
  cry: { eye: 'closed', brow: 'sad', mouth: 'open', fx: 'tears' },
  wow: { eye: 'star', brow: 'up', mouth: 'o' },
  sad: { eye: 'dot', brow: 'sad', mouth: 'frown' },
  laugh: { eye: 'happy', mouth: 'grin' },
  grin: { eye: 'happy', mouth: 'grin' },
  wink: { eye: 'wink', mouth: 'smile' },
  shy: { eye: 'down', mouth: 'smile' },
  embarrassed: { eye: 'happy', brow: 'sad', mouth: 'wave', fx: 'sweat' },
  scared: { eye: 'wide', brow: 'sad', mouth: 'wave', tint: '#5A6BFF', fx: 'sweat' },
  disgusted: { eye: 'half', brow: 'angry', mouth: 'wave', tint: '#7FC46A' },
  suspicious: { eye: 'half', brow: 'one', mouth: 'flat' },
  confused: { eye: 'dot', brow: 'one', mouth: 'wave' },
  bored: { eye: 'half', mouth: 'flat' },
  excited: { eye: 'star', brow: 'up', mouth: 'grin', fx: 'stars' },
  evil: { eye: 'half', brow: 'angry', mouth: 'grin', tint: '#3A2A5A' },
  sleepy: { eye: 'closed', mouth: 'o' },
  determined: { eye: 'dot', brow: 'angry', mouth: 'flat' },
  nervous: { eye: 'dot', brow: 'sad', mouth: 'wave', fx: 'sweat' },
  proud: { eye: 'happy', brow: 'up', mouth: 'smile', fx: 'stars' },
  crazy: { eye: 'spiral', mouth: 'grin' },
  sick: { eye: 'half', mouth: 'wave', tint: '#7FC46A' },
  pout: { eye: 'dot', brow: 'angry', mouth: 'kiss' },
  kiss: { eye: 'closed', mouth: 'kiss', fx: 'hearts' },
  rage: { eye: 'dot', brow: 'angry', mouth: 'open', tint: '#FF3B3B', fx: 'steam' },
  relieved: { eye: 'closed', mouth: 'smile', fx: 'sweat' },
  drool: { eye: 'happy', mouth: 'drool' },
  jealous: { eye: 'half', brow: 'angry', mouth: 'frown', tint: '#5AC46A' },
  surprised: { eye: 'wide', brow: 'up', mouth: 'o' },
  thinking: { eye: 'dot', brow: 'one', mouth: 'flat' },
};

const HY = -168; // tam dau
const HR = 52;
const INK = '#1C1820';

const Eyes: React.FC<{ f: Face; blink: number; look: number; yaw: number; t: number }> = ({ f, blink, look, yaw, t }) => {
  const ay = Math.min(1, Math.abs(yaw));
  const gap = 17 * (1 - 0.35 * ay);
  const cx = yaw * 26 + look * 4;
  const cy = HY - 4;
  const one = (sx: number, k: number) => {
    const x = cx + sx * gap;
    const shut = blink > 0.5 && f.eye !== 'closed' && f.eye !== 'happy';
    const hide = ay > 0.8 && Math.sign(sx) === -Math.sign(yaw);
    if (hide) return null;
    const e = f.eye === 'wink' ? (sx > 0 ? 'happy' : 'dot') : f.eye;
    if (shut || e === 'closed') return <path key={k} d={`M ${x - 7} ${cy + 1} Q ${x} ${cy + 5} ${x + 7} ${cy + 1}`} stroke={INK} strokeWidth={3.2} fill="none" strokeLinecap="round" />;
    if (e === 'happy') return <path key={k} d={`M ${x - 7} ${cy + 3} Q ${x} ${cy - 6} ${x + 7} ${cy + 3}`} stroke={INK} strokeWidth={3.4} fill="none" strokeLinecap="round" />;
    if (e === 'x') return <path key={k} d={`M ${x - 6} ${cy - 6} L ${x + 6} ${cy + 6} M ${x + 6} ${cy - 6} L ${x - 6} ${cy + 6}`} stroke={INK} strokeWidth={3.2} strokeLinecap="round" />;
    if (e === 'heart') return <path key={k} transform={`translate(${x} ${cy}) scale(${0.55 + 0.06 * Math.sin(t * 0.4)})`} d="M 0 10 C -22 -4 -12 -20 0 -9 C 12 -20 22 -4 0 10 Z" fill="#E8456A" />;
    if (e === 'spiral') return <path key={k} transform={`translate(${x} ${cy}) rotate(${t * 18 * sx})`} d="M 0 0 m -1 0 a 2 2 0 1 1 3 0 a 4 4 0 1 1 -7 0 a 6 6 0 1 1 11 0" stroke={INK} strokeWidth={2.2} fill="none" />;
    if (e === 'star') return (
      <g key={k}>
        <ellipse cx={x} cy={cy} rx={6.5} ry={8} fill={INK} />
        <path transform={`translate(${x + 1.5} ${cy - 2.5}) scale(0.32)`} d="M 0 -12 L 3 -3 L 12 0 L 3 3 L 0 12 L -3 3 L -12 0 L -3 -3 Z" fill="#FFFFFF" />
      </g>
    );
    const big = e === 'wide' ? 1.35 : 1;
    const dy = e === 'down' ? 4 : 0;
    return (
      <g key={k}>
        {e === 'wide' ? <ellipse cx={x} cy={cy} rx={9} ry={10.5} fill="#FFFFFF" opacity={0.9} /> : null}
        <ellipse cx={x + look * 1.5} cy={cy + dy} rx={4.6 * big * (1 - 0.3 * ay)} ry={6 * big} fill={INK} />
        <circle cx={x + look * 1.5 - 1.6} cy={cy + dy - 2.4} r={1.6 * big} fill="#FFFFFF" opacity={0.9} />
        {e === 'half' ? <path d={`M ${x - 8} ${cy - 2} L ${x + 8} ${cy - 2}`} stroke={INK} strokeWidth={3} strokeLinecap="round" /> : null}
      </g>
    );
  };
  const by = cy - 13;
  const brow = (sx: number, k: number) => {
    const x = cx + sx * gap;
    const b = f.brow;
    if (!b || (ay > 0.8 && Math.sign(sx) === -Math.sign(yaw))) return null;
    const tilt = b === 'angry' ? 14 * sx : b === 'sad' ? -14 * sx : b === 'one' ? (sx > 0 ? -12 : 0) : 0;
    const y = by - (b === 'up' ? 6 : b === 'one' && sx > 0 ? 5 : 0);
    return <path key={`b${k}`} transform={`rotate(${tilt} ${x} ${y})`} d={`M ${x - 8} ${y} L ${x + 8} ${y}`} stroke={INK} strokeWidth={3.2} strokeLinecap="round" opacity={0.85} />;
  };
  return (
    <g>
      {one(-1, 0)}
      {one(1, 1)}
      {brow(-1, 0)}
      {brow(1, 1)}
    </g>
  );
};

const Mouth: React.FC<{ f: Face; yaw: number; t: number; talk: number }> = ({ f, yaw, t, talk }) => {
  const x = yaw * 30;
  const y = HY + 22;
  if (talk > 0) {
    const o = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.9)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 0.37)));
    return <ellipse cx={x} cy={y + 1} rx={6 + 2 * o} ry={1.5 + 5.5 * o} fill="#5A2430" />;
  }
  switch (f.mouth) {
    case 'smile':
      return <path d={`M ${x - 8} ${y - 1} Q ${x} ${y + 6} ${x + 8} ${y - 1}`} stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />;
    case 'smirk':
      return <path d={`M ${x - 6} ${y + 1} Q ${x + 2} ${y + 3} ${x + 8} ${y - 3}`} stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />;
    case 'grin':
      return <path d={`M ${x - 11} ${y - 3} Q ${x} ${y - 1} ${x + 11} ${y - 3} Q ${x + 8} ${y + 11} ${x} ${y + 11} Q ${x - 8} ${y + 11} ${x - 11} ${y - 3} Z`} fill="#5A2430" stroke={INK} strokeWidth={2} />;
    case 'o':
      return <ellipse cx={x} cy={y + 2} rx={5} ry={6.5} fill="#5A2430" stroke={INK} strokeWidth={1.5} />;
    case 'open':
      return <ellipse cx={x} cy={y + 3} rx={8} ry={6} fill="#5A2430" stroke={INK} strokeWidth={1.5} />;
    case 'frown':
      return <path d={`M ${x - 8} ${y + 4} Q ${x} ${y - 3} ${x + 8} ${y + 4}`} stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />;
    case 'flat':
      return <path d={`M ${x - 6} ${y + 1} L ${x + 6} ${y + 1}`} stroke={INK} strokeWidth={2.8} strokeLinecap="round" />;
    case 'wave':
      return <path d={`M ${x - 9} ${y + 2} q 3 -3 6 0 q 3 3 6 0 q 3 -3 6 0`} stroke={INK} strokeWidth={2.4} fill="none" strokeLinecap="round" />;
    case 'kiss':
      return <path d={`M ${x - 2} ${y - 3} q 6 2 0 4 q 6 2 0 5`} stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />;
    case 'drool':
      return (
        <g>
          <path d={`M ${x - 9} ${y - 1} Q ${x} ${y + 9} ${x + 9} ${y - 1} Z`} fill="#5A2430" />
          <path d={`M ${x + 5} ${y + 3} q 2 ${8 + 3 * Math.sin(t * 0.2)} 0 ${12 + 3 * Math.sin(t * 0.2)}`} stroke="#8FD3FF" strokeWidth={4} strokeLinecap="round" fill="none" />
        </g>
      );
    default:
      return null;
  }

};


// ---------------------------------------------------------------- bo "Ink" (nguoi den mat to, vien neon)
const IK = '#0A070D';
const InkEyes: React.FC<{ f: Face; blink: number; look: number; yaw: number; t: number; er?: number; dark?: boolean }> = ({ f, blink, look, yaw, t, er, dark = true }) => {
  const ay = Math.min(1, Math.abs(yaw));
  const gap = (er ? er + 5 : 21) * (1 - 0.3 * ay);
  const cx = yaw * 24 + look * 4;
  const cy = HY - 10;
  const e0 = f.eye;
  const shock = e0 === 'wide';
  const rx = (er ? er * (shock ? 1.15 : 1) : shock ? 19 : 17) * (1 - 0.35 * ay);
  const ry = er ? er * (shock ? 1.15 : 1) : shock ? 23 : 21;
  const lineC = dark ? '#F4EEF8' : IK;
  const one = (sx: number, k: number) => {
    const x = cx + sx * gap;
    if (ay > 0.8 && Math.sign(sx) === -Math.sign(yaw)) return null;
    const e = e0 === 'wink' ? (sx > 0 ? 'happy' : 'dot') : e0;
    const shut = blink > 0.5 && e !== 'closed' && e !== 'happy';
    if (shut || e === 'closed') return <path key={k} d={`M ${x - rx} ${cy + 2} Q ${x} ${cy + 9} ${x + rx} ${cy + 2}`} stroke={lineC} strokeWidth={4} fill="none" strokeLinecap="round" />;
    if (e === 'happy') return <path key={k} d={`M ${x - rx} ${cy + 5} Q ${x} ${cy - 12} ${x + rx} ${cy + 5} Q ${x} ${cy - 3} ${x - rx} ${cy + 5} Z`} fill="#F4EEF8" stroke={IK} strokeWidth={2.5} strokeLinejoin="round" />;
    if (e === 'heart') return <path key={k} transform={`translate(${x} ${cy}) scale(${0.95 + 0.08 * Math.sin(t * 0.4)})`} d="M 0 12 C -24 -4 -13 -22 0 -10 C 13 -22 24 -4 0 12 Z" fill="#FF4F7B" stroke={IK} strokeWidth={2.5} />;
    if (e === 'x') return (
      <g key={k}>
        <ellipse cx={x} cy={cy} rx={rx} ry={ry} fill="#FFFFFF" stroke={IK} strokeWidth={3} />
        <path d={`M ${x - 7} ${cy - 7} L ${x + 7} ${cy + 7} M ${x + 7} ${cy - 7} L ${x - 7} ${cy + 7}`} stroke={IK} strokeWidth={3.5} strokeLinecap="round" />
      </g>
    );
    if (e === 'spiral') return (
      <g key={k}>
        <ellipse cx={x} cy={cy} rx={rx} ry={ry} fill="#FFFFFF" stroke={IK} strokeWidth={3} />
        <path transform={`translate(${x} ${cy}) rotate(${t * 18 * sx})`} d="M 0 0 m -1 0 a 2 2 0 1 1 3 0 a 4 4 0 1 1 -7 0 a 6 6 0 1 1 11 0" stroke={IK} strokeWidth={2.4} fill="none" />
      </g>
    );
    const pr = (er ? er / 17 : 1) * (shock ? 5 : e === 'star' ? 9.5 : 8.5);
    const px = x + look * 3 + yaw * 3;
    const py = cy + (e === 'down' ? 6 : 2);
    return (
      <g key={k}>
        <ellipse cx={x} cy={cy} rx={rx} ry={ry} fill="#FFFFFF" stroke={IK} strokeWidth={3} />
        <ellipse cx={px} cy={py} rx={pr * (1 - 0.25 * ay)} ry={pr * 1.18} fill={IK} />
        {e === 'star' ? <path transform={`translate(${px} ${py}) scale(0.4)`} d="M 0 -12 L 3 -3 L 12 0 L 3 3 L 0 12 L -3 3 L -12 0 L -3 -3 Z" fill="#FFE38A" /> : <circle cx={px - 2.2} cy={py - 3} r={2.2} fill="#FFFFFF" />}
        {e === 'half' ? <path d={`M ${x - rx - 1} ${cy - 2} L ${x + rx + 1} ${cy - 2} L ${x + rx + 1} ${cy - ry - 2} L ${x - rx - 1} ${cy - ry - 2} Z`} fill="#3A3044" stroke={IK} strokeWidth={3} /> : null}
      </g>
    );
  };
  const lid = (sx: number, k: number) => {
    const b = f.brow;
    if (!b || (ay > 0.8 && Math.sign(sx) === -Math.sign(yaw))) return null;
    const x = cx + sx * gap;
    const top = cy - ry;
    if (b === 'angry') return <path key={`l${k}`} d={`M ${x - rx - 3} ${top - 6 + (sx > 0 ? 12 : -2)} L ${x + rx + 3} ${top - 6 + (sx > 0 ? -2 : 12)}`} stroke={IK} strokeWidth={7} strokeLinecap="round" />;
    if (b === 'sad') return <path key={`l${k}`} d={`M ${x - rx - 2} ${top + (sx > 0 ? -6 : 6)} L ${x + rx + 2} ${top + (sx > 0 ? 6 : -6)}`} stroke={IK} strokeWidth={6} strokeLinecap="round" />;
    const y = top - (b === 'up' ? 12 : b === 'one' && sx > 0 ? 10 : 5);
    return <path key={`l${k}`} d={`M ${x - rx + 1} ${y + 3} Q ${x} ${y - 3} ${x + rx - 1} ${y + 3}`} stroke={IK} strokeWidth={6} fill="none" strokeLinecap="round" />;
  };
  return <g>{one(-1, 0)}{one(1, 1)}{lid(-1, 0)}{lid(1, 1)}</g>;
};

const InkMouth: React.FC<{ f: Face; yaw: number; t: number; talk: number }> = ({ f, yaw, t, talk }) => {
  const x = yaw * 28;
  const y = HY + 26;
  const open = (w: number, h: number, smile = true) => (
    <g>
      <path d={smile ? `M ${x - w} ${y - 4} Q ${x} ${y} ${x + w} ${y - 4} Q ${x + w * 0.8} ${y + h} ${x} ${y + h} Q ${x - w * 0.8} ${y + h} ${x - w} ${y - 4} Z` : `M ${x - w} ${y + h * 0.6} Q ${x} ${y - h * 0.6} ${x + w} ${y + h * 0.6} Q ${x} ${y + h * 0.9} ${x - w} ${y + h * 0.6} Z`} fill="#3A0A16" stroke={IK} strokeWidth={3} strokeLinejoin="round" />
      {smile ? <path d={`M ${x - w * 0.8} ${y - 2} Q ${x} ${y + 3} ${x + w * 0.8} ${y - 2} L ${x + w * 0.7} ${y + 3} Q ${x} ${y + 7} ${x - w * 0.7} ${y + 3} Z`} fill="#FFFFFF" /> : null}
      {smile ? <ellipse cx={x + 2} cy={y + h - 5} rx={w * 0.5} ry={h * 0.22} fill="#FF6F91" /> : null}
    </g>
  );
  if (talk > 0) {
    const o = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.9)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 0.37)));
    return <g><ellipse cx={x} cy={y + 2} rx={8 + 3 * o} ry={2 + 8 * o} fill="#3A0A16" stroke={IK} strokeWidth={2.5} /><ellipse cx={x + 1} cy={y + 4 + 4 * o} rx={5} ry={2 + 2 * o} fill="#FF6F91" /></g>;
  }
  const line = (d: string) => <g><path d={d} stroke={IK} strokeWidth={5} fill="none" strokeLinecap="round" /><path d={d} stroke="#6B5A7A" strokeWidth={1.4} fill="none" strokeLinecap="round" transform="translate(0 3)" opacity={0.7} /></g>;
  switch (f.mouth) {
    case 'smile': return line(`M ${x - 11} ${y - 2} Q ${x} ${y + 8} ${x + 11} ${y - 2}`);
    case 'smirk': return line(`M ${x - 8} ${y + 1} Q ${x + 3} ${y + 4} ${x + 11} ${y - 4}`);
    case 'grin': return open(16, 20);
    case 'o': return <g><ellipse cx={x} cy={y + 3} rx={7} ry={9} fill="#3A0A16" stroke={IK} strokeWidth={3} /><ellipse cx={x} cy={y + 8} rx={4} ry={2.5} fill="#FF6F91" /></g>;
    case 'open': return open(14, 16, false);
    case 'frown': return line(`M ${x - 11} ${y + 5} Q ${x} ${y - 4} ${x + 11} ${y + 5}`);
    case 'flat': return line(`M ${x - 8} ${y + 1} L ${x + 8} ${y + 1}`);
    case 'wave': return line(`M ${x - 12} ${y + 2} q 4 -4 8 0 q 4 4 8 0 q 4 -4 8 0`);
    case 'kiss': return line(`M ${x - 2} ${y - 4} q 7 2 0 5 q 7 2 0 6`);
    case 'drool': return <g>{open(12, 14)}<path d={`M ${x + 7} ${y + 6} q 2 ${8 + 3 * Math.sin(t * 0.2)} 0 ${12 + 3 * Math.sin(t * 0.2)}`} stroke="#8FD3FF" strokeWidth={4} strokeLinecap="round" fill="none" /></g>;
    default: return null;
  }
};

/** Doi mot DollLook sang bo Ink: da toi bong, ao mau ruc, nhan vat chinh mac hoodie. */
export const INK_STYLES: Record<string, { skin: string; head: number; eye: number; heroHair: DollHair | 'keep' }> = {
  a: { skin: '#C8956A', head: 1.35, eye: 16, heroHair: 'three' },
  b: { skin: '#C08A5C', head: 1.35, eye: 19, heroHair: 'short' },
  c: { skin: '#D6A47A', head: 1.42, eye: 22, heroHair: 'none' },
};
export const inkify = (L: DollLook, isHero = false, cast = '', style = ''): DollLook => {
  const ST = INK_STYLES[style || 'a'];
  const keep = L.coatStyle === 'robot' || /^(alien|robot|zombie|macarong)$/.test(cast);
  const casual = ['fedora', 'beret', 'bowler', 'tophat'].includes(L.hat);
  const out: DollLook = { ...L, ink: true, skin: keep ? L.skin : ST ? ST.skin : '#2E2538', headScale: ST ? ST.head : 1, eyeR: ST ? ST.eye : undefined, blush: true, buttons: false };
  if (casual && !/^(thamtu|caoboi|thamhiem)$/.test(cast)) out.hat = 'none';
  if (isHero || cast === 'nam') {
    out.coatStyle = 'hoodie';
    out.scarf = undefined;
    out.pants = '#2A2733';
    if (ST && ST.heroHair !== 'keep') { out.hair = ST.heroHair; out.hairColor = '#3A2418'; }
  }
  if (cast === 'linh') {
    out.hair = 'long';
    out.hairColor = '#E8552C';
    out.coat = '#1FA39A';
    out.coatStyle = 'sweater';
    out.pants = '#2A2733';
    out.scarf = undefined;
  }
  return out;
};

const Hat: React.FC<{ L: DollLook; yaw: number }> = ({ L, yaw }) => {
  const c = L.hatColor;
  const top = HY - HR;
  const bx = yaw * 6;
  const s = 0;
  switch (L.hat) {
    case 'fedora':
    case 'bowler':
    case 'tophat': {
      const h = L.hat === 'tophat' ? 62 : 38;
      const w = L.hat === 'tophat' ? 40 : 44;
      return (
        <g>
          <ellipse cx={bx} cy={top + 22} rx={L.hat === 'bowler' ? 62 : 74} ry={13} fill={shadeHex(c, 0.72)} />
          <ellipse cx={bx} cy={top + 19} rx={L.hat === 'bowler' ? 60 : 72} ry={11} fill={lin(c)} />
          {L.hat === 'bowler' ? (
            <path d={`M ${bx - w} ${top + 18} Q ${bx - w} ${top - 30} ${bx} ${top - 30} Q ${bx + w} ${top - 30} ${bx + w} ${top + 18} Z`} fill={sph(c)} />
          ) : (
            <path d={`M ${bx - w} ${top + 18} L ${bx - w + 4} ${top + 18 - h} Q ${bx} ${top + 8 - h - (L.hat === 'fedora' ? 0 : 6)} ${bx + w - 4} ${top + 18 - h} L ${bx + w} ${top + 18} Z`} fill={lin(c)} />
          )}
          {L.hat === 'fedora' ? <path d={`M ${bx - 14} ${top + 22 - h} Q ${bx} ${top + 30 - h} ${bx + 14} ${top + 22 - h}`} stroke={shadeHex(c, 0.6)} strokeWidth={4} fill="none" strokeLinecap="round" /> : null}
          <path d={`M ${bx - w + 1} ${top + 10} Q ${bx} ${top + 15} ${bx + w - 1} ${top + 10} L ${bx + w} ${top + 18} Q ${bx} ${top + 23} ${bx - w} ${top + 18} Z`} fill={L.band} />
        </g>
      );
    }
    case 'beanie':
      return (
        <g>
          <path d={`M ${-HR - 2} ${HY - 6} Q ${-HR} ${top - 22} 0 ${top - 24} Q ${HR} ${top - 22} ${HR + 2} ${HY - 6} Z`} fill={sph(c)} />
          <path d={`M ${-HR - 3} ${HY - 10} Q 0 ${HY - 2} ${HR + 3} ${HY - 10} L ${HR + 3} ${HY - 24} Q 0 ${HY - 16} ${-HR - 3} ${HY - 24} Z`} fill={lin(shadeHex(c, 0.85))} />
          <circle cx={0} cy={top - 26} r={11} fill={sph(L.band)} />
        </g>
      );
    case 'cap':
    case 'police':
      return (
        <g>
          <path d={`M ${-HR} ${HY - 12} Q ${-HR} ${top - 14} 0 ${top - 16} Q ${HR} ${top - 14} ${HR} ${HY - 12} Z`} fill={sph(c)} />
          <path d={`M ${yaw * 30 - 10} ${HY - 16} Q ${yaw * 40 + 30 * (yaw >= 0 ? 1 : -1)} ${HY - 22} ${yaw * 48 + 60 * (yaw >= 0 ? 1 : -1)} ${HY - 8} Q ${yaw * 36 + 20} ${HY - 4} ${yaw * 30 - 10} ${HY - 8} Z`} fill={shadeHex(c, 0.75)} />
          {L.hat === 'police' ? <circle cx={yaw * 30} cy={top + 6} r={8} fill={sph('#F2C94C')} /> : <circle cx={0} cy={top - 15} r={5} fill={shadeHex(c, 0.7)} />}
        </g>
      );
    case 'beret':
      return <ellipse cx={-10 + yaw * 6} cy={top + 2} rx={HR + 8} ry={18} transform={`rotate(-10 0 ${top})`} fill={sph(c)} />;
    case 'chef':
      return (
        <g>
          <rect x={-40} y={top - 12} width={80} height={26} rx={6} fill={lin('#F4F2EE')} />
          {[-28, 0, 28].map((x) => <circle key={x} cx={x} cy={top - 30} r={26} fill={sph('#F7F5F1')} />)}
        </g>
      );
    case 'hardhat':
      return (
        <g>
          <ellipse cx={0} cy={HY - 18} rx={HR + 14} ry={9} fill={shadeHex(c, 0.75)} />
          <path d={`M ${-HR + 2} ${HY - 18} Q ${-HR} ${top - 18} 0 ${top - 20} Q ${HR} ${top - 18} ${HR - 2} ${HY - 18} Z`} fill={sph(c)} />
          <path d={`M -6 ${top - 19} L -6 ${HY - 20} M 6 ${top - 19} L 6 ${HY - 20}`} stroke={shadeHex(c, 0.8)} strokeWidth={4} />
        </g>
      );
    case 'crown':
      return <path d={`M -34 ${top + 10} L -38 ${top - 26} L -18 ${top - 8} L 0 ${top - 34} L 18 ${top - 8} L 38 ${top - 26} L 34 ${top + 10} Z`} fill={lin('#F2C94C')} stroke={shadeHex('#F2C94C', 0.6)} strokeWidth={2} />;
    case 'headband':
      return <path d={`M ${-HR - 1} ${HY - 22} Q 0 ${HY - 12} ${HR + 1} ${HY - 22} L ${HR} ${HY - 36} Q 0 ${HY - 26} ${-HR} ${HY - 36} Z`} fill={lin(L.band)} />;
    case 'ninja':
      return (
        <g>
          <path d={`M ${-HR - 6} ${HY + 4} Q ${-HR - 8} ${top - 12} 0 ${top - 14} Q ${HR + 8} ${top - 12} ${HR + 6} ${HY + 4} L ${HR + 4} ${HY - 18} Q 0 ${HY - 26} ${-HR - 4} ${HY - 18} Z`} fill={lin(c)} />
          <path d={`M ${-HR - 6} ${HY + 6} Q 0 ${HY + 2} ${HR + 6} ${HY + 6} L ${HR + 2} ${HY + 50} Q 0 ${HY + 58} ${-HR - 2} ${HY + 50} Z`} fill={lin(c)} />
          <path d={`M ${-HR - 4} ${HY - 22} Q 0 ${HY - 30} ${HR + 4} ${HY - 22}`} stroke={L.obi ?? '#B8323C'} strokeWidth={7} fill="none" />
          <path d={`M ${-HR - 2} ${HY - 22} q ${-18 - s} 6 ${-30 - s} 22 M ${-HR - 2} ${HY - 20} q ${-12 - s} 14 ${-18 - s} 32`} stroke={L.obi ?? '#B8323C'} strokeWidth={6} fill="none" strokeLinecap="round" />
        </g>
      );
    case 'army':
      return (
        <g>
          <ellipse cx={0} cy={HY - 16} rx={HR + 12} ry={10} fill={shadeHex(c, 0.7)} />
          <path d={`M ${-HR - 4} ${HY - 16} Q ${-HR - 2} ${top - 22} 0 ${top - 24} Q ${HR + 2} ${top - 22} ${HR + 4} ${HY - 16} Z`} fill={sph(c)} />
          <path d={`M -34 ${top - 8} L 34 ${top - 8}`} stroke={shadeHex(c, 0.7)} strokeWidth={3} opacity={0.6} />
        </g>
      );
    case 'knight':
      return (
        <g>
          <path d={`M ${-HR - 8} ${HY + 34} L ${-HR - 8} ${HY - 10} Q ${-HR - 6} ${top - 20} 0 ${top - 22} Q ${HR + 6} ${top - 20} ${HR + 8} ${HY - 10} L ${HR + 8} ${HY + 34} L ${HR - 8} ${HY + 34} L ${HR - 10} ${HY - 22} Q 0 ${HY - 30} ${-HR + 10} ${HY - 22} L ${-HR + 8} ${HY + 34} Z`} fill={sph(c)} />
          <rect x={yaw * 26 - 4} y={HY - 26} width={8} height={36} rx={3} fill={shadeHex(c, 0.75)} />
          <path d={`M 0 ${top - 22} Q ${-10 - s} ${top - 52} ${-30 - s * 2} ${top - 58} Q ${-8} ${top - 40} 0 ${top - 22} Z`} fill="#D93A49" />
        </g>
      );
    case 'pirate':
      return (
        <g>
          <path d={`M ${-HR - 26} ${HY - 18} Q ${-HR - 10} ${top - 34} 0 ${top - 30} Q ${HR + 10} ${top - 34} ${HR + 26} ${HY - 18} Q 0 ${HY - 4} ${-HR - 26} ${HY - 18} Z`} fill={lin(c)} />
          <path d={`M ${-HR - 24} ${HY - 19} Q 0 ${HY - 6} ${HR + 24} ${HY - 19}`} stroke={L.band} strokeWidth={4} fill="none" />
          <circle cx={yaw * 16} cy={top - 2} r={9} fill="#F4F2EE" />
          <path d={`M ${yaw * 16 - 9} ${top + 10} l 18 -6 M ${yaw * 16 + 9} ${top + 10} l -18 -6`} stroke="#F4F2EE" strokeWidth={4} strokeLinecap="round" />
        </g>
      );
    case 'cowboy':
    case 'straw': {
      const straw = L.hat === 'straw';
      return (
        <g>
          <path d={straw ? `M ${-HR - 44} ${HY - 10} Q 0 ${HY - 32} ${HR + 44} ${HY - 10} Q 0 ${HY + 2} ${-HR - 44} ${HY - 10} Z` : `M ${-HR - 36} ${HY - 34} Q ${-HR - 20} ${HY - 12} 0 ${HY - 14} Q ${HR + 20} ${HY - 12} ${HR + 36} ${HY - 34} Q ${HR + 10} ${HY - 22} 0 ${HY - 24} Q ${-HR - 10} ${HY - 22} ${-HR - 36} ${HY - 34} Z`} fill={lin(c)} />
          <path d={straw ? `M ${-HR + 6} ${HY - 22} Q ${-HR + 8} ${top - 22} 0 ${top - 24} Q ${HR - 8} ${top - 22} ${HR - 6} ${HY - 22} Z` : `M ${-HR + 4} ${HY - 22} L ${-HR + 10} ${top - 30} Q ${-14} ${top - 36} 0 ${top - 22} Q ${14} ${top - 36} ${HR - 10} ${top - 30} L ${HR - 4} ${HY - 22} Z`} fill={lin(c)} />
          <path d={`M ${-HR + 5} ${HY - 26} Q 0 ${HY - 20} ${HR - 5} ${HY - 26}`} stroke={L.band} strokeWidth={8} fill="none" />
          {straw ? [-40, -20, 0, 20, 40].map((x) => <path key={x} d={`M ${x * 1.6} ${HY - 14} L ${x * 0.5} ${top - 14}`} stroke={shadeHex(c, 0.8)} strokeWidth={2} opacity={0.5} />) : null}
        </g>
      );
    }
    case 'wizard':
      return (
        <g>
          <ellipse cx={0} cy={HY - 22} rx={HR + 30} ry={12} fill={shadeHex(c, 0.7)} />
          <path d={`M ${-HR + 4} ${HY - 24} Q ${-12} ${top - 60} ${18 - s} ${top - 110} Q ${36 - s * 1.4} ${top - 112} ${44 - s * 1.6} ${top - 96} Q ${30 - s} ${top - 100} ${22 - s} ${top - 88} Q ${20} ${top - 40} ${HR - 4} ${HY - 24} Z`} fill={lin(c)} />
          <path d={`M ${-HR + 6} ${HY - 26} Q 0 ${HY - 20} ${HR - 6} ${HY - 26}`} stroke={L.band} strokeWidth={6} fill="none" />
          {[[-8, top - 30], [12, top - 62], [-4, top - 4]].map(([x, y], k) => <path key={k} transform={`translate(${x} ${y}) scale(${0.55 + 0.1 * (k - 1)})`} d="M 0 -12 L 3 -3 L 12 0 L 3 3 L 0 12 L -3 3 L -12 0 L -3 -3 Z" fill={L.band} />)}
        </g>
      );
    case 'viking':
      return (
        <g>
          {[-1, 1].map((sd) => <path key={sd} d={`M ${sd * (HR - 6)} ${HY - 34} Q ${sd * (HR + 30)} ${HY - 40} ${sd * (HR + 30)} ${top - 50} Q ${sd * (HR + 14)} ${HY - 52} ${sd * (HR - 16)} ${HY - 50} Z`} fill="#EDE3C8" stroke="#B8A880" strokeWidth={2} />)}
          <path d={`M ${-HR - 4} ${HY - 16} Q ${-HR - 2} ${top - 22} 0 ${top - 24} Q ${HR + 2} ${top - 22} ${HR + 4} ${HY - 16} Z`} fill={sph(c)} />
          <path d={`M ${-HR - 4} ${HY - 18} L ${HR + 4} ${HY - 18}`} stroke={shadeHex(c, 0.65)} strokeWidth={8} />
          <path d={`M 0 ${top - 22} L 0 ${HY - 20}`} stroke={shadeHex(c, 0.65)} strokeWidth={6} />
        </g>
      );
    case 'helmet':
      return (
        <g>
          <circle cx={0} cy={HY} r={HR + 18} fill="#DCE6F5" opacity={0.28} />
          <circle cx={0} cy={HY} r={HR + 18} fill="none" stroke="#F4F7FF" strokeWidth={6} />
          <path d={`M -40 ${HY - 50} Q -20 ${HY - 66} 8 ${HY - 62}`} stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" opacity={0.8} fill="none" />
        </g>
      );
    default:
      return null;
  }
};

const Hair: React.FC<{ L: DollLook; yaw: number; sway: number; back: boolean }> = ({ L, yaw, sway, back }) => {
  const c = L.hairColor;
  if (L.hat !== 'none' && L.hat !== 'headband' && L.hat !== 'crown' && L.hat !== 'helmet' && L.hair !== 'long' && L.hair !== 'pony' && L.hair !== 'twin') return null;
  const top = HY - HR;
  const s = sway * 0.5;
  if (back) {
    if (L.hair === 'long') return <path d={`M ${-HR - 4} ${HY - 4} Q ${-HR - 14 - s} ${HY + 70} ${-60 - s} ${HY + 96} L ${60 - s} ${HY + 96} Q ${HR + 14 - s} ${HY + 70} ${HR + 4} ${HY - 4} Z`} fill={lin(c)} />;
    if (L.hair === 'pony') return <path d={`M ${-yaw * 40 - 10} ${HY - 30} Q ${-yaw * 70 - 30 - s} ${HY + 10} ${-yaw * 60 - 16 - s * 1.4} ${HY + 60} Q ${-yaw * 50 + 4} ${HY + 14} ${-yaw * 40 + 12} ${HY - 26} Z`} fill={lin(c)} />;
    if (L.hair === 'twin') return <g>{[-1, 1].map((sd) => <ellipse key={sd} cx={sd * (HR + 10) - s * 0.4} cy={HY + 14} rx={13} ry={26} transform={`rotate(${sd * 12 + s} ${sd * (HR + 10)} ${HY - 6})`} fill={sph(c)} />)}</g>;
    if (L.hair === 'bun') return <circle cx={-yaw * 30} cy={top + 2} r={22} fill={sph(c)} />;
    if (L.hair === 'afro') return <circle cx={0} cy={HY - 12} r={HR + 18} fill={sph(c)} />;
    return null;
  }
  if (L.hair === 'three')
    return (
      <g fill="none" stroke="#120C10" strokeWidth={4.5} strokeLinecap="round">
        {[-1, 0, 1].map((k) => {
          const bx = yaw * 22 + k * 12;
          const by = top + 3 + Math.abs(k) * 2;
          const sw = s * 1.6 + k * 10;
          return <path key={k} d={`M ${bx} ${by + 2} Q ${bx + k * 4 + sw * 0.3} ${by - 13} ${bx + k * 10 + sw * 0.6 + 5} ${by - 19 + Math.abs(k) * 4}`} />;
        })}
      </g>
    );
  if (L.hair === 'topknot' && (L.hat === 'none' || L.hat === 'headband'))
    return (
      <g>
        <path d={`M ${-HR - 2} ${HY - 4} Q ${-HR - 4} ${HY - 34} ${-HR + 14} ${HY - 40} L ${HR - 14} ${HY - 40} Q ${HR + 4} ${HY - 34} ${HR + 2} ${HY - 4} Q ${HR - 6} ${HY - 26} ${HR - 18} ${HY - 30} L ${-HR + 18} ${HY - 30} Q ${-HR + 6} ${HY - 26} ${-HR - 2} ${HY - 4} Z`} fill={sph(c)} />
        <path d={`M ${yaw * 10 - 7} ${top + 2} L ${yaw * 10 - 5} ${top - 10} L ${yaw * 10 + 5} ${top - 10} L ${yaw * 10 + 7} ${top + 2} Z`} fill={L.band} />
        <ellipse cx={yaw * 10 - s} cy={top - 18} rx={13} ry={10} fill={sph(c)} />
      </g>
    );
  if (L.hair === 'wild' && L.hat === 'none')
    return (
      <g>
        <path d={`M ${-HR - 10} ${HY + 10} L ${-HR - 22} ${HY - 18} L ${-HR - 6} ${HY - 30} L ${-HR - 14} ${top - 14} L ${-22} ${top - 4} L ${-14 - s} ${top - 34} L ${4} ${top - 10} L ${20 - s} ${top - 36} L ${28} ${top - 6} L ${HR + 10} ${top - 18} L ${HR + 4} ${HY - 30} L ${HR + 22} ${HY - 18} L ${HR + 10} ${HY + 10} Q ${HR - 4} ${HY - 22} ${yaw * 20} ${HY - 26} Q ${-HR + 4} ${HY - 22} ${-HR - 10} ${HY + 10} Z`} fill={sph(c)} />
      </g>
    );
  switch (L.hair) {
    case 'short':
    case 'curly':
    case 'mohawk':
    case 'bob':
    case 'long':
    case 'pony':
    case 'bun':
    case 'twin':
    case 'afro': {
      if (L.hat !== 'none' && L.hat !== 'headband') return null;
      const low = L.hair === 'bob' || L.hair === 'long' ? HY + 18 : HY - 6;
      return (
        <g>
          <path d={`M ${-HR - 2} ${low} Q ${-HR - 6} ${top - 10} ${yaw * 8} ${top - 8} Q ${HR + 6} ${top - 10} ${HR + 2} ${low} Q ${HR - 6} ${HY - 24} ${yaw * 20 + 18} ${HY - 30} Q ${yaw * 20 - 10} ${HY - 22} ${-HR + 8} ${HY - 22} Z`} fill={sph(c)} />
          {L.hair === 'curly' ? [-30, -10, 10, 30].map((x) => <circle key={x} cx={x} cy={top - 4 + Math.abs(x) * 0.25} r={13} fill={sph(c)} />) : null}
          {L.hair === 'mohawk' ? <path d={`M -8 ${top + 4} L -6 ${top - 34} L 6 ${top - 30} L 8 ${top + 4} Z`} fill={lin(c)} /> : null}
        </g>
      );
    }
    case 'antenna':
      return (
        <g>
          <path d={`M -10 ${top + 4} Q ${-18 - s} ${top - 26} ${-22 - s} ${top - 40} M 10 ${top + 4} Q ${18 - s} ${top - 26} ${22 - s} ${top - 40}`} stroke={shadeHex(c, 0.8)} strokeWidth={4} fill="none" strokeLinecap="round" />
          <circle cx={-22 - s} cy={top - 42} r={7} fill={sph('#FFD23F')} />
          <circle cx={22 - s} cy={top - 42} r={7} fill={sph('#FFD23F')} />
        </g>
      );
    default:
      return null;
  }
};

/** Nhan vat Doll 3D. sway = do vang cua khan/day mu/ao choang (bo chuyen dong tu tinh tu van toc). */
export const Doll: React.FC<{ pose: Pose & { expr: any }; L: DollLook; shadow?: number; t?: number; talk?: number }> = ({ pose, L, shadow = 1, t = 0, talk = 0 }) => {
  const j = joints(pose);
  const f = FACE[(pose.expr as string) ?? 'neutral'] ?? FACE.neutral;
  const kw = turnWidth(pose.yaw);
  const yaw = pose.yaw;
  const ay = Math.min(1, Math.abs(yaw));
  const sway = pose.sway ?? 0;
  const st = L.coatStyle;
  const sleeve = st === 'apron' || st === 'dress' ? L.coat : L.coat;
  const legCol = st === 'dress' || L.bareLegs ? L.skin : L.pants;
  const cols = [L.skin, L.coat, L.pants, L.shoe, L.hatColor, L.band, L.hairColor, L.trim, L.scarf ?? '', L.bag ?? '', L.backpack ?? '', shadeHex(L.coat, 0.85), '#F7F5F1', '#F4F2EE', '#F2C94C', '#FFD23F', '#DCE6F5', '#2A2730'];

  const arm = (o: { root: P; mid: P; end: P }) => <Tube pts={[o.root, o.mid, o.end]} w={20} c={sleeve} />;
  const leg = (o: { root: P; mid: P; end: P }) => <Tube pts={[o.root, o.mid, o.end]} w={st === 'dress' ? 15 : 22} c={legCol} joint={st !== 'dress'} />;
  const shoe = (o: { root: P; mid: P; end: P }) => {
    const fd = pose.facing;
    const x = o.end.x + fd * 9;
    const y = o.end.y + 6;
    const ang = Math.max(-35, Math.min(35, ((Math.atan2(o.end.x - o.mid.x, o.end.y - o.mid.y) * 180) / Math.PI) * 0.35));
    return (
      <g transform={`rotate(${-ang} ${o.end.x} ${o.end.y})`}>
        <path d={`M ${x - 22 * fd} ${y + 7} Q ${x - 24 * fd} ${y - 12} ${x - 2 * fd} ${y - 11} Q ${x + 22 * fd} ${y - 9} ${x + 26 * fd} ${y + 4} Q ${x + 24 * fd} ${y + 9} ${x} ${y + 9} Z`} fill={sph(L.shoe)} />
        <path d={`M ${x - 22 * fd} ${y + 6} L ${x + 25 * fd} ${y + 6}`} stroke={shadeHex(L.shoe, 0.55)} strokeWidth={3} />
      </g>
    );
  };
  const hand = (o: { mid: P; end: P }, kind: HandKind, bag?: string) => {
    const a = (Math.atan2(o.end.x - o.mid.x, o.end.y - o.mid.y) * 180) / Math.PI;
    return (
      <g transform={`translate(${o.end.x} ${o.end.y}) rotate(${-a})`}>
        {bag ? (
          <g transform={`rotate(${a}) translate(0 14)`}>
            <path d="M -10 0 Q -10 -12 0 -12 Q 10 -12 10 0" stroke={shadeHex(bag, 0.6)} strokeWidth={5} fill="none" />
            <rect x={-34} y={0} width={68} height={50} rx={7} fill={lin(bag)} />
            <path d="M -34 14 L 34 14" stroke={shadeHex(bag, 0.6)} strokeWidth={2.5} />
            <rect x={-5} y={10} width={10} height={9} rx={2} fill="#E8C66A" />
          </g>
        ) : null}
        {kind === 'point' ? <rect x={-4.5} y={8} width={9} height={24} rx={4.5} fill={L.skin} /> : null}
        <circle cx={0} cy={6} r={kind === 'point' ? 12 : 13.5} fill={sph(L.skin)} />
      </g>
    );
  };

  // than ao (xoay theo do nghieng, hep lai khi quay nghieng)
  const hem = st === 'coat' || st === 'suit' ? 26 : st === 'dress' || st === 'robe' ? 40 : st === 'trench' ? 44 : st === 'kimono' ? 30 : st === 'pelt' ? 22 : 8;
  const flare = st === 'dress' || st === 'robe' ? 66 : st === 'coat' || st === 'trench' ? 50 : st === 'kimono' ? 54 : st === 'pelt' ? 52 : 46;
  const bodyPath = `M -44 -116 Q -52 -112 -50 -96 L -44 -20 Q ${-flare} ${hem - 6} ${-flare + 4} ${hem} Q 0 ${hem + 10} ${flare - 4} ${hem} Q ${flare} ${hem - 6} 44 -20 L 50 -96 Q 52 -112 44 -116 Q 0 -126 -44 -116 Z`;
  const bx = yaw * 12;
  const torso = (
    <g transform={`rotate(${pose.tilt}) translate(${yaw * 6} 0)`}>
      {L.backpack ? <rect x={-36 - yaw * 34} y={-108} width={72} height={90} rx={22} fill={lin(L.backpack)} /> : null}
      <g transform={`scale(${kw} 1)`}>
        <path d={bodyPath} fill={lin(L.coat)} />
        {/* bong do vung co va day ao */}
        <path d="M -40 -116 Q 0 -100 40 -116 Q 0 -124 -40 -116 Z" fill={shadeHex(L.coat, 0.7)} opacity={0.5} />
        <path d={`M ${-flare + 6} ${hem - 2} Q 0 ${hem + 8} ${flare - 6} ${hem - 2}`} stroke={shadeHex(L.coat, 0.65)} strokeWidth={4} fill="none" opacity={0.6} />
      </g>
      <g transform={`translate(${bx} 0) scale(${kw} 1)`}>
      {st === 'coat' || st === 'suit' ? (
        <g>
          <path d={`M ${-2} -112 L ${4} ${hem + 2}`} stroke={shadeHex(L.coat, 0.66)} strokeWidth={2.4} opacity={0.8} />
          <path d={`M ${-26} -116 L ${-4} -78 L ${-2} -112 Z M ${24} -116 L ${6} -80 L ${2} -112 Z`} fill={shadeHex(L.coat, st === 'suit' ? 0.72 : 0.86)} />
          {st === 'suit' ? <path d={`M ${-10} -116 L ${0} -84 L ${10} -116 Z`} fill="#F4F2EE" /> : null}
          {(L.tie || st === 'suit') ? <path d={`M ${-4} -112 L ${4} -112 L ${5} -86 L ${0} -80 L ${-5} -86 Z`} fill={L.tie ?? L.trim} /> : null}
          {L.buttons ? [-72, -46, -20].map((y) => <circle key={y} cx={9} cy={y} r={3.8} fill={sph(shadeHex(L.coat, 0.42))} />) : null}
        </g>
      ) : null}
      {st === 'sweater' ? (
        <g>
          <path d={`M ${-22} -118 Q ${0} -104 ${22} -118`} stroke={shadeHex(L.coat, 0.75)} strokeWidth={7} fill="none" strokeLinecap="round" />
          <path d={`M -42 -6 L 42 -6`} stroke={shadeHex(L.coat, 0.78)} strokeWidth={8} />
          {L.number ? <text x={0} y={-44} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight={800} fontSize={38} fill={L.trim} opacity={0.9}>{L.number}</text> : null}
          {L.tie ? <path d={`M ${-4} -112 L ${4} -112 L ${5} -90 L ${0} -84 L ${-5} -90 Z`} fill={L.tie} /> : null}
        </g>
      ) : null}
      {st === 'hoodie' ? (
        <g>
          <path d={`M ${-26} -40 L ${26} -40 L ${32} -6 L ${-32} -6 Z`} fill={shadeHex(L.coat, 0.86)} />
          <path d={`M ${-10} -114 L ${-12 + sway * 0.4} -78 M ${10} -114 L ${12 + sway * 0.4} -78`} stroke={L.trim} strokeWidth={4} strokeLinecap="round" />
        </g>
      ) : null}
      {st === 'stripe' ? (
        <g>
          {[-100, -76, -52, -28, -4].map((y) => <path key={y} d={`M -50 ${y} L 50 ${y}`} stroke={L.trim} strokeWidth={11} opacity={0.92} />)}
        </g>
      ) : null}
      {st === 'pelt' ? (
        <g>
          <path d={`M -44 -116 L 30 -116 L 50 -30 L -50 -30 Z`} fill={L.coat} opacity={0} />
          <path d={`M -56 ${hem - 4} l 10 14 l 10 -12 l 10 14 l 10 -12 l 10 14 l 10 -12 l 10 14 l 10 -12 l 10 14 l 10 -12 l 10 12`} stroke={shadeHex(L.coat, 0.6)} strokeWidth={5} fill={L.coat} strokeLinejoin="round" />
          <path d={`M 18 -126 L 48 -126 L 50 -96 Z`} fill={L.skin} />
          {[[-20, -86], [14, -60], [-26, -34], [22, -12], [-4, -100]].map(([x, y], k) => <ellipse key={k} cx={x} cy={y} rx={8} ry={6} fill={L.trim} opacity={0.75} />)}
          <path d={`M -40 -24 L 40 -24`} stroke={shadeHex(L.coat, 0.55)} strokeWidth={7} />
        </g>
      ) : null}
      {st === 'kimono' ? (
        <g>
          <path d={`M -26 -118 L 14 -56 M 26 -118 L -10 -60`} stroke={L.trim === L.coat ? '#F4F2EE' : L.trim} strokeWidth={9} strokeLinecap="round" />
          <rect x={-48} y={-58} width={96} height={20} rx={4} fill={L.obi ?? '#B8323C'} />
          <path d={`M 10 -38 l 10 22 M 18 -40 l 16 18`} stroke={L.obi ?? '#B8323C'} strokeWidth={6} strokeLinecap="round" />
          <path d={`M 2 -38 L 2 ${hem}`} stroke={shadeHex(L.coat, 0.65)} strokeWidth={3} />
        </g>
      ) : null}
      {st === 'armor' ? (
        <g>
          <path d={`M -38 -110 Q 0 -96 38 -110 L 34 -40 Q 0 -30 -34 -40 Z`} fill={shadeHex(L.coat, 1.12)} stroke={shadeHex(L.coat, 0.6)} strokeWidth={3} />
          {[-1, 1].map((sd) => <ellipse key={sd} cx={sd * 46} cy={-112} rx={18} ry={12} fill={shadeHex(L.coat, 0.9)} stroke={shadeHex(L.coat, 0.6)} strokeWidth={2} />)}
          <path d={`M 0 -92 L 0 -50 M -16 -74 L 16 -74`} stroke={L.trim === L.coat ? '#B8323C' : L.trim} strokeWidth={8} strokeLinecap="round" />
          {[-28, -10].map((y) => <path key={y} d={`M -42 ${y} Q 0 ${y + 8} 42 ${y}`} stroke={shadeHex(L.coat, 0.6)} strokeWidth={3} fill="none" />)}
        </g>
      ) : null}
      {st === 'robe' ? (
        <g>
          <path d={`M -14 -118 L 0 -96 L 14 -118`} stroke={L.obi ?? L.trim} strokeWidth={6} fill="none" strokeLinejoin="round" />
          <path d={`M 0 -96 L 0 ${hem}`} stroke={L.obi ?? L.trim} strokeWidth={5} />
          <path d={`M -46 -36 Q 0 -26 46 -36`} stroke={L.obi ?? L.trim} strokeWidth={8} fill="none" />
          {[[-24, -70], [26, 6], [-30, 14]].map(([x, y], k) => <path key={k} transform={`translate(${x} ${y}) scale(0.5)`} d="M 0 -12 L 3 -3 L 12 0 L 3 3 L 0 12 L -3 3 L -12 0 L -3 -3 Z" fill={L.obi ?? '#F2C94C'} />)}
        </g>
      ) : null}
      {st === 'trench' ? (
        <g>
          <path d={`M ${-30} -118 L ${-6} -70 L ${-4} -112 Z M ${30} -118 L ${8} -72 L ${4} -112 Z`} fill={shadeHex(L.coat, 0.78)} />
          <path d={`M -2 -110 L 6 ${hem}`} stroke={shadeHex(L.coat, 0.62)} strokeWidth={3} />
          <rect x={-48} y={-46} width={96} height={12} rx={3} fill={L.obi ?? shadeHex(L.coat, 0.6)} />
          <rect x={-6} y={-48} width={14} height={16} rx={2} fill="none" stroke="#E8C66A" strokeWidth={3} />
          {[-88, -64].map((y) => <circle key={y} cx={16} cy={y} r={4} fill={shadeHex(L.coat, 0.45)} />)}
        </g>
      ) : null}
      {st === 'coat' && L.obi ? <rect x={-46} y={-34} width={92} height={10} rx={3} fill={L.obi} /> : null}
      {st === 'sweater' && L.obi ? <path d={`M -16 -88 L 0 -100 L 16 -88 L 0 -60 Z`} fill={L.obi} stroke={shadeHex(L.obi, 0.6)} strokeWidth={3} /> : null}
      {st === 'apron' ? <path d={`M ${-26} -98 L ${26} -98 L ${34} 14 L ${-34} 14 Z`} fill={lin(L.trim === L.coat ? '#F4F2EE' : L.trim)} opacity={0.95} /> : null}
      {st === 'dress' ? <path d={`M ${-28} -116 Q ${0} -102 ${28} -116`} stroke={L.trim} strokeWidth={6} fill="none" strokeLinecap="round" /> : null}
      {st === 'space' ? (
        <g>
          <rect x={-24} y={-86} width={48} height={36} rx={8} fill={lin('#C9CEDA')} />
          <circle cx={-9} cy={-68} r={5} fill={sph('#E8453C')} />
          <circle cx={9} cy={-68} r={5} fill={sph('#5AE8FF')} />
        </g>
      ) : null}
      {st === 'robot' ? (
        <g>
          <rect x={-28} y={-90} width={56} height={46} rx={8} fill={lin('#2E3346')} />
          {[0, 1, 2].map((i) => <rect key={i} x={-20 + i * 15} y={-78} width={9} height={8 + ((i * 7 + Math.floor(t / 6)) % 14)} fill={L.trim} />)}
        </g>
      ) : null}
      </g>
    </g>
  );

  // khan quang co: vong quanh co + hai duoi khan vang theo sway
  const scarf = L.scarf ? (
    <g transform={`rotate(${pose.tilt})`}>
      <path d={`M ${yaw * 8 - 30} -122 Q ${yaw * 8} -104 ${yaw * 8 + 30} -122`} stroke={shadeHex(L.scarf, 0.7)} strokeWidth={17} fill="none" strokeLinecap="round" />
      <path d={`M ${yaw * 8 - 30} -124 Q ${yaw * 8} -108 ${yaw * 8 + 30} -124`} stroke={L.scarf} strokeWidth={13} fill="none" strokeLinecap="round" />
      <path d={`M ${yaw * 8 - 24} -127 Q ${yaw * 8} -114 ${yaw * 8 + 24} -127`} stroke={shadeHex(L.scarf, 1.25)} strokeWidth={3.5} fill="none" strokeLinecap="round" opacity={0.6} />
      {(() => {
        const ox = yaw * 8 + 12 + yaw * 10;
        const sw = -sway * 1.6;
        const tail = (dx: number, len: number, k: number) => (
          <path key={k} d={`M ${ox + dx} -116 Q ${ox + dx + sw * 0.4} ${-116 + len * 0.5} ${ox + dx + sw} ${-116 + len}`} stroke={k ? shadeHex(L.scarf!, 0.85) : L.scarf} strokeWidth={12} fill="none" strokeLinecap="round" />
        );
        return yaw < -0.3 ? null : (
          <g>
            {tail(8, 44, 1)}
            {tail(0, 58, 0)}
          </g>
        );
      })()}
    </g>
  ) : null;

  const tint = f.tint;
  const head = (
    <g transform={`rotate(${pose.tilt}) rotate(${pose.headTilt} 0 ${HY + 46}) translate(0 ${HY + 58}) scale(${L.headScale ?? 1}) translate(0 ${-(HY + 58)})`}>
      {/* co */}
      <rect x={-11 + yaw * 4} y={HY + 36} width={22} height={24} rx={8} fill={lin(L.skin)} />
      <circle cx={0} cy={HY} r={HR} fill={sph(L.skin)} />
      {tint ? <circle cx={0} cy={HY} r={HR - 1} fill={tint} opacity={0.22} /> : null}
      <g transform={`translate(${0} 0)`}>
        {L.blush !== false ? <g opacity={f.mouth === 'smile' || f.mouth === 'grin' || f.eye === 'down' || f.eye === 'heart' ? 0.55 : 0.22}>
          <ellipse cx={yaw * 24 - 30 * (1 - 0.3 * ay)} cy={HY + (L.ink ? 16 : 12)} rx={L.ink ? 11 : 9} ry={L.ink ? 6 : 5} fill={L.ink ? '#FF4F7B' : '#FF8C94'} />
          <ellipse cx={yaw * 24 + 30 * (1 - 0.3 * ay)} cy={HY + (L.ink ? 16 : 12)} rx={L.ink ? 11 : 9} ry={L.ink ? 6 : 5} fill={L.ink ? '#FF4F7B' : '#FF8C94'} />
        </g> : null}
        {L.mask ? <path d={`M -50 ${HY - 16} Q 0 ${HY - 24} 50 ${HY - 16} L 50 ${HY + 6} Q 0 ${HY} -50 ${HY + 6} Z`} fill="#1E1C2E" opacity={0.92} /> : null}
        {L.ink ? <InkEyes f={f} blink={pose.blink} look={pose.look} yaw={yaw} t={t} er={L.eyeR} dark={!L.eyeR} /> : <Eyes f={f} blink={pose.blink} look={pose.look} yaw={yaw} t={t} />}
        {/* mui cau nho */}
        {L.ink ? null : <circle cx={yaw * 36} cy={HY + 7} r={6.5} fill={sph(shadeHex(L.skin, 0.94))} />}
        {L.mustache ? <path d={`M ${yaw * 30 - 18} ${HY + 18} Q ${yaw * 30 - 8} ${HY + 10} ${yaw * 30} ${HY + 16} Q ${yaw * 30 + 8} ${HY + 10} ${yaw * 30 + 18} ${HY + 18} Q ${yaw * 30} ${HY + 22} ${yaw * 30 - 18} ${HY + 18} Z`} fill={sph(L.hairColor)} /> : null}
        {L.beard ? <path d={`M -44 ${HY + 14} Q -40 ${HY + 56} ${yaw * 20} ${HY + 60} Q 40 ${HY + 56} 44 ${HY + 14} Q 30 ${HY + 34} ${yaw * 20} ${HY + 36} Q -30 ${HY + 34} -44 ${HY + 14} Z`} fill={sph(L.hairColor)} /> : null}
        {L.ink ? <InkMouth f={f} yaw={yaw} t={t} talk={talk} /> : <Mouth f={f} yaw={yaw} t={t} talk={talk} />}
        {L.eyepatch ? (
          <g>
            <path d={`M ${-HR + 2} ${HY - 34} L ${HR - 4} ${HY + 4}`} stroke="#14121A" strokeWidth={4} />
            <ellipse cx={yaw * 24 + ((L.eyeR ?? 16) + 5) * (1 - 0.3 * ay)} cy={HY - 10} rx={(L.eyeR ?? 16) + 6} ry={(L.eyeR ?? 18) + 6} fill="#14121A" />
          </g>
        ) : null}
        {L.glasses ? (
          <g fill="none" stroke="#2A2730" strokeWidth={3}>
            <circle cx={yaw * 26 - 17} cy={HY - 4} r={13} />
            <circle cx={yaw * 26 + 17} cy={HY - 4} r={13} />
            <path d={`M ${yaw * 26 - 4} ${HY - 5} L ${yaw * 26 + 4} ${HY - 5}`} />
          </g>
        ) : null}
        {pose.glasses > 0.01 ? (
          <g opacity={pose.glasses} transform={`translate(${yaw * 26} ${(1 - pose.glasses) * -60})`}>
            <path d={`M -44 ${HY - 10} L 44 ${HY - 10}`} stroke="#14121A" strokeWidth={5} strokeLinecap="round" />
            <path d={`M -38 ${HY - 12} L -4 ${HY - 12} L -7 ${HY + 6} Q -22 ${HY + 14} -36 ${HY + 6} Z M 4 ${HY - 12} L 38 ${HY - 12} L 36 ${HY + 6} Q 22 ${HY + 14} 7 ${HY + 6} Z`} fill="#10121F" />
            <path d={`M -30 ${HY} L -20 ${HY - 8} M 12 ${HY} L 22 ${HY - 8}`} stroke="#fff" strokeWidth={3} strokeLinecap="round" opacity={0.8} />
          </g>
        ) : null}
        {pose.glint && pose.glint > 0.01 && pose.blink < 0.95
          ? [-1, 1].map((sx) => <circle key={sx} cx={yaw * 26 + sx * 17} cy={HY - 4} r={11} fill={pose.glintColor ?? '#7FD4FF'} opacity={0.55 * Math.min(1, pose.glint ?? 0)} />)
          : null}
      </g>
      <Hair L={L} yaw={yaw} sway={sway} back={false} />
      <Hat L={L} yaw={yaw} />
      {L.headphones ? (
        <g>
          <path d={`M -54 ${HY} Q -56 ${HY - 72} 0 ${HY - 72} Q 56 ${HY - 72} 54 ${HY}`} stroke={L.headphones} strokeWidth={7} fill="none" />
          {[-1, 1].map((sd) => <ellipse key={sd} cx={sd * (54 - ay * 8)} cy={HY + 2} rx={11} ry={18} fill={sph(L.headphones!)} />)}
        </g>
      ) : null}
      {/* hieu ung quanh dau */}
      {f.fx === 'sweat' || f.fx === 'drop' ? <path transform={`translate(${46 - yaw * 10} ${HY - 34 + (f.fx === 'sweat' ? (t * 0.8) % 16 : 0)})`} d="M 0 0 q 7 12 0 19 q -7 -7 0 -19 Z" fill="#8FD3FF" /> : null}
      {f.fx === 'tears'
        ? [-1, 1].map((sx) => {
            const ph = (t * 0.25 + (sx > 0 ? 0.5 : 0)) % 1;
            return <circle key={sx} cx={yaw * 26 + sx * 20} cy={HY + 4 + ph * 50} r={4.5} fill="#7FD3FF" opacity={1 - ph} />;
          })
        : null}
      {f.fx === 'anger' ? <path d={`M 40 ${HY - 52} l 9 9 m 0 -9 l -9 9 M 47 ${HY - 59} l 0 5 M 33 ${HY - 45} l 5 0`} stroke="#E8453C" strokeWidth={4} strokeLinecap="round" /> : null}
      {f.fx === 'steam'
        ? [-1, 1].map((sd) => {
            const p = (t * 0.06 + (sd > 0 ? 0.5 : 0)) % 1;
            return <circle key={sd} cx={sd * (52 + p * 26)} cy={HY - 56 - p * 40} r={8 + p * 12} fill="#FFFFFF" opacity={0.75 * (1 - p)} />;
          })
        : null}
      {f.fx === 'hearts' ? <path transform={`translate(${44 + ((t * 0.8) % 26)} ${HY - 20 - ((t * 0.8) % 26)}) scale(0.6)`} d="M 0 10 C -22 -4 -12 -20 0 -9 C 12 -20 22 -4 0 10 Z" fill="#FF4D7A" /> : null}
      {f.fx === 'stars'
        ? [[-66, -40], [66, -30]].map(([x, y], k) => (
            <path key={k} transform={`translate(${x} ${HY + y}) scale(${0.7 + 0.3 * Math.abs(Math.sin(t * 0.3 + k))})`} d="M 0 -12 L 3 -3 L 12 0 L 3 3 L 0 12 L -3 3 L -12 0 L -3 -3 Z" fill="#FFD23F" />
          ))
        : null}
    </g>
  );

  const near = yaw < 0;
  const gy = (pose as any).groundY ?? pose.y + LEG_LEN * pose.scale;
  const air = Math.max(0, gy - (pose.y + LEG_LEN * pose.scale)) / (200 * pose.scale);
  const lying = Math.min(1, Math.abs(pose.spin) / 80);
  const sf = Math.max(0.35, 1 - air * 0.6);
  const backArm = near ? 'R' : 'L';
  const bagOn = (side: 'L' | 'R') => (L.bag && side === backArm ? L.bag : undefined);
  return (
    <g>
      <Shade cols={cols} />
      {shadow > 0 ? (
        <g>
          <ellipse cx={pose.x} cy={gy + 10 * pose.scale} rx={(80 + 60 * lying) * pose.scale * sf} ry={16 * pose.scale * sf} fill="#0E0C18" opacity={0.18 * shadow * sf} filter="url(#dollSoft)" />
          <ellipse cx={pose.x} cy={gy + 10 * pose.scale} rx={(44 + 40 * lying) * pose.scale * sf} ry={7 * pose.scale * sf} fill="#0E0C18" opacity={0.28 * shadow * sf} />
        </g>
      ) : null}
      <g transform={`translate(${pose.x} ${pose.y}) scale(${pose.scale}) rotate(${pose.spin} 0 -90)`} filter={L.ink ? "url(#inkRim)" : "url(#dollRim)"}>
        <g transform={`translate(0 ${LEG_LEN}) scale(${1 + 0.6 * pose.squash} ${1 - pose.squash}) translate(0 ${-LEG_LEN})`}>
          {L.cape ? (
            <path
              transform={`rotate(${pose.tilt})`}
              d={`M -44 -116 Q ${-70 - yaw * 40 - sway * 0.6} 20 ${-60 - yaw * 60 - sway} 70 L ${60 - yaw * 60 - sway} 70 Q ${70 - yaw * 40 - sway * 0.6} 20 44 -116 Z`}
              fill={lin(L.cape)}
            />
          ) : null}
          <g transform={`rotate(${pose.tilt}) rotate(${pose.headTilt} 0 ${HY + 46})`}>
            <Hair L={L} yaw={yaw} sway={sway} back />
          </g>
          {near ? <>{arm(j.armR)}{hand(j.armR, pose.handR, bagOn('R'))}</> : <>{arm(j.armL)}{hand(j.armL, pose.handL, bagOn('L'))}</>}
          {near ? <>{leg(j.legR)}{shoe(j.legR)}{leg(j.legL)}{shoe(j.legL)}</> : <>{leg(j.legL)}{shoe(j.legL)}{leg(j.legR)}{shoe(j.legR)}</>}
          {torso}
          {scarf}
          {near ? <>{arm(j.armL)}{hand(j.armL, pose.handL, bagOn('L'))}</> : <>{arm(j.armR)}{hand(j.armR, pose.handR, bagOn('R'))}</>}
          {head}
        </g>
      </g>
    </g>
  );
};

/** Bo loc cho bo Doll: bong mem duoi chan va bong do nhe tach nhan vat khoi nen. */
export const DollDefs: React.FC = () => (
  <defs>
    <filter id="dollSoft" x="-50%" y="-200%" width="200%" height="500%">
      <feGaussianBlur stdDeviation="9" />
    </filter>
    <filter id="inkRim" x="-25%" y="-25%" width="150%" height="150%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="3.5" result="o1" />
      <feFlood floodColor="#0A070D" />
      <feComposite in2="o1" operator="in" result="outline" />
      <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="o2" />
      <feGaussianBlur in="o2" stdDeviation="3.5" result="o2b" />
      <feFlood floodColor="#B455FF" floodOpacity="0.9" />
      <feComposite in2="o2b" operator="in" result="glow" />
      <feMerge><feMergeNode in="glow" /><feMergeNode in="outline" /><feMergeNode in="SourceGraphic" /></feMerge>
    </filter>
    <filter id="dollRim" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="#0E0C18" floodOpacity="0.22" />
    </filter>
  </defs>
);
