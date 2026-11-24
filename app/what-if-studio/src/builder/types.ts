// Du lieu mot tap phim lam bang Shot Builder: moi canh la mot ShotSpec, khong can viet code.
import type { CastName, Expr } from '../engine';

export type Facing = 'right' | 'left' | 'front' | 'profile-right' | 'profile-left';

export type ActorSpec = {
  cast?: CastName | string; // bo Pop: nam, linh, tuan, me, bo, sep, thay, em, ba, khoa, alien, chi; bo cu: pip, mo, sis, mom, suit
  color?: string; // mau ao rieng (hex), de trong = theo trang phuc
  accent?: string; // mau phu (day mu, khuy...), de trong = theo trang phuc
  spot?: number; // vi tri ngang trong boi canh, 0 (trai) .. 1 (phai)
  to?: number; // neu co: di/chay toi vi tri nay trong luc canh chay
  facing?: Facing;
  pose?: string; // tu the dau canh (xem POSES)
  pose2?: string; // tu the doi sang giua canh
  expr?: Expr | string; // bieu cam dau canh (bo Pop co them: angry, love, cry, wow, sad)
  expr2?: Expr | string; // bieu cam doi sang giua canh
  at?: number; // luc doi (0..1 cua do dai canh), mac dinh 0.35
  size?: number; // he so to nho, mac dinh 1
  glint?: boolean; // mat sang len (dung khi dung sieu nang luc)
};

export type PropSpec = {
  type: string; // mug, cat, phone, book, books, paper, papers, alarm, laptop, pizza, pizzabox, cookie, cookies, plate, calendar, paperball, coins
  spot?: number; // 0..1 doc theo mat ban / san
  on?: 'surface' | 'floor';
  size?: number;
  text?: string; // chu tren do vat (dong ho bao thuc, nguoi goi, diem bai...)
  mood?: 'sleep' | 'alert' | 'peek'; // cho con meo
  at?: number; // neu co: do vat hien ra (pop) tai thoi diem nay (0..1)
  dy?: number; // nang len/ha xuong (don vi the gioi)
};

export type UISpec = {
  type: 'title' | 'tag' | 'toast' | 'float' | 'sparkle' | 'rings' | 'dizzy' | 'dial' | 'gauge' | 'chip' | 'count' | 'label' | 'bubble' | 'thought' | 'question' | 'exclaim' | 'hearts' | 'speed' | 'pow' | 'zzz' | 'music' | 'money' | 'idea' | 'sweat' | 'anger';
  text?: string;
  text2?: string;
  accent?: string; // tu duoc to vang trong dong tieu de thu hai
  x?: number; // toa do man hinh 0..1920 (de trong = canh dau nhan vat chinh / vi tri mac dinh)
  y?: number; // 0..1080
  at?: number; // 0..1: luc xuat hien
  mark?: 'x' | 'check';
  from?: number;
  to?: number;
  icon?: 'rewind' | 'pause' | 'copy' | 'paste' | 'dot' | 'skip';
  who?: number; // bong thoai/dau ? cua nhan vat thu may (0 = nhan vat chinh)
};

export type Power = { kind: 'none' | 'rewind' | 'pause' | 'copy' | 'paste' | 'skip' | 'chip'; label?: string };

export type ShotSpec = {
  id: string;
  dur: number; // giay
  line?: string; // cau thoai canh nay minh hoa (chi de ghi chu va xuat danh sach)
  set: string; // xem STAGES
  night?: boolean;
  tod?: 'day' | 'sunset' | 'night' | 'dawn'; // gio trong ngay (bo Pop)
  crowd?: number; // so nguoi quan chung phia sau (0-30)
  crowdMood?: 'idle' | 'cheer' | 'clap' | 'panic' | 'laugh' | 'walk' | 'talk' | 'dance' | 'angry' | 'watch';
  weather?: 'none' | 'rain' | 'snow' | 'leaves' | 'confetti';
  trans?: 'cut' | 'whip' | 'zoom' | 'spin' | 'flash' | 'fade' | 'glitch' | 'slide' | 'pushup' | 'wipe' | 'iris' | 'circle' | 'flip' | 'dipwhite' | 'blinds' | 'shake' | 'blur' | 'slideleft' | 'slidedown' | 'shrink' | 'swirl' | 'split' | 'diag' | 'pixel' | 'burn' | 'heart' | 'star' | 'comic';
  move?: 'none' | 'pan_left' | 'pan_right' | 'tilt_up' | 'tilt_down' | 'zoom_in' | 'zoom_out' | 'crash' | 'dutch' | 'handheld' | 'whip' | 'follow' | 'two';
  red?: number; // 0..1 troi do (doan chuyen bien)
  fx2?: number; // 0..1 hieu ung rieng cua boi canh: rooftop = mat dien, study = ke sach bay, classroom = ca lop cuoi
  board?: string; // chu phan tren bang (classroom)
  cam?: 'wide' | 'medium' | 'close' | 'xclose' | 'insert';
  push?: number; // day may vao (0..0.3)
  actors?: ActorSpec[];
  props?: PropSpec[];
  ui?: UISpec[];
  power?: Power;
  reverse?: boolean; // phat nguoc canh
  flash?: boolean;
  shake?: boolean;
  hand?: { spot?: number; pose?: 'point' | 'open'; at?: number }; // canh tay chinh dua vao khung (canh tabletop)
};

export type Project = {
  title: string;
  slug: string;
  kit?: 'pop' | 'classic' | 'doll' | 'ink'; // bo hinh: pop = bo rieng moi, doll = nguoi go 3D co mau, classic = bo cua skill goc
  palette?: string; // bang mau bo Doll: goc, kem, keo, pastel, bien, hoanghon, rung, neon, dat
  motion?: 'muot' | 'giat'; // muot = bo chuyen dong muot (mac dinh), giat = kieu cu
  grade?: string; // bang mau ca tap: none, pop, pastel, neon, warm, cool, retro, dark
  hero?: { cast?: CastName | string; color?: string; accent?: string };
  shots: ShotSpec[];
};
