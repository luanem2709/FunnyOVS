// Episode-specific vector scenery. All motion is deterministic from shot progress.
const OUTLINE = '#242339';
const COLORS = {
  day: {sky: '#b9e4ed', light: '#fff0b5', wall: '#e5cda6', floor: '#c8c4b5'},
  sunset: {sky: '#e7abb2', light: '#ffe3a1', wall: '#d7a58c', floor: '#bba6a0'},
  night: {sky: '#27374e', light: '#f7d780', wall: '#717f8c', floor: '#687481'},
  dawn: {sky: '#d6cadd', light: '#fff1c8', wall: '#d8bdaf', floor: '#beb9b8'},
};

export const LIES_SETS = [
  'lies_courtyard', 'lies_yacht_deck', 'lies_monster_booth',
  'lies_backstage', 'lies_donation_desk', 'lies_volunteer_room', 'lies_wristband',
];

const escapeText = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[character]);
const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const repeat = (count, draw) => Array.from({length: count}, (_, index) => draw(index)).join('');

function rect(x, y, width, height, fill, radius = 0, stroke = OUTLINE, lineWidth = 5) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${lineWidth}"/>`;
}
function path(d, fill, stroke = OUTLINE, width = 5) {
  return `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
function circle(x, y, radius, fill, stroke = OUTLINE, width = 5) {
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
}
function text(x, y, value, size = 28, fill = OUTLINE, anchor = 'middle') {
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="bold" font-size="${size}" text-anchor="${anchor}">${escapeText(value)}</text>`;
}
function group(x, y, scale, content, extra = '') {
  return `<g transform="translate(${x} ${y}) scale(${scale})" ${extra}>${content}</g>`;
}
function sky(palette, timeOfDay) {
  return rect(-600, -400, 3120, 2100, palette.sky, 0, 'none') +
    circle(1560, 135, timeOfDay === 'night' ? 47 : 70, palette.light, 'none') +
    (timeOfDay === 'night'
      ? repeat(36, i => circle((i * 277) % 2200 - 100, (i * 53) % 350, 2, '#f7eee1', 'none'))
      : repeat(3, i => group(i * 670 + 110, 90 + i * 54, 1,
        path('M0 45 Q-25 5 20 0 Q50-60 100-12 Q160-36 177 14 Q218 50 165 58 H20 Z', '#f6f5eb', 'none'))));
}
function school(palette) {
  return rect(-350, 305, 2620, 440, palette.wall) +
    rect(-350, 290, 2620, 36, '#788f95') +
    repeat(14, i => rect(-260 + i * 174, 370, 120, 138, '#668b9a', 4) +
      path(`M${-200 + i * 174} 370 v138 M${-260 + i * 174} 437 h120`, 'none', '#d5e0dd', 7)) +
    rect(760, 540, 400, 205, '#405768', 5) +
    rect(951, 540, 18, 205, '#dedcd2', 0, 'none') +
    rect(736, 515, 448, 44, '#f0dfb8', 5) + text(960, 547, 'COMMUNITY ARTS', 26) +
    rect(-600, 745, 3120, 955, palette.floor, 0, 'none') +
    path('M-600 745 H2520 M-400 1030 H2320', 'none', '#a29588', 3);
}
function bunting(y, colors = ['#ec836c', '#edc264', '#65b0b3']) {
  return path(`M-100 ${y} Q960 ${y + 120} 2020 ${y}`, 'none', OUTLINE, 4) +
    repeat(15, i => {
      const x = 40 + i * 130;
      const height = y + 58 * Math.sin((i + 1) / 16 * Math.PI);
      return path(`M${x} ${height} l70 4 -37 62 Z`, colors[i % colors.length], OUTLINE, 3);
    });
}
function golfCart(crushed) {
  return group(1520, crushed ? 690 : 644, .8,
    circle(30, 125, 29, '#363644') + circle(220, 125, 29, '#363644') +
    rect(0, 65, 250, 55, '#d5a056', 9) + rect(70, 32, 100, 35, '#84674e', 4) +
    path(crushed ? 'M35 65 L70 5 175 25 220 65' : 'M35 65 V-60 H220 V65', 'none') +
    path(crushed ? 'M36 8 L105-7 160 12 240 10' : 'M15-66 H240 V-51 H15Z', '#e9d2a4'));
}
function yacht() {
  return path('M220 500 H1740 L1605 654 Q1530 710 1380 710 H430 Q350 710 300 630 Z', '#fbf4df') +
    path('M270 580 H1670 L1640 620 H289 Z', '#388c99') +
    rect(360, 368, 1020, 125, '#faf2db', 18) +
    path('M620 370 V250 H1140 L1330 370 Z', '#f9f1db') +
    path('M670 270 H1117 L1250 355 H670 Z', '#548b9f') +
    repeat(6, i => rect(435 + i * 142, 395, 100, 50, '#588896', 13)) +
    repeat(5, i => circle(530 + i * 185, 655, 18, '#6a9aa6')) +
    path('M362 353 H1460 M392 353 V380 M590 353 V380 M1340 353 V403 M1450 353 V450', 'none', '#515763', 6) +
    path('M960 250 V120 L1140 172 960 202 Z', '#e7896b');
}
function courtyard(options, palette) {
  const mode = options.effect;
  const falling = mode > .5 && mode <= .75;
  const dissolving = mode > .75;
  const progress = clamp(options.progress);
  const opacity = dissolving ? 1 - progress : 1;
  const offset = falling ? -1100 * (1 - Math.min(1, progress / .65)) ** 2 : 0;
  const visible = mode > .1;
  const landed = visible && (!falling || progress >= .65) && (!dissolving || progress < .9);
  return sky(palette, options.tod) + school(palette) +
    golfCart(landed) + (visible ? group(0, offset, 1, yacht(), `opacity="${opacity}"`) : '') +
    (visible ? group(1615, 682 + offset, .8,
      path('M-150 0 H150 L108 60 H-108 Z', '#e8a05e') + rect(-30, -24, 60, 23, '#f3d9a5', 3),
      `opacity="${opacity}"`) : '') +
    (falling && progress > .65 && progress < .85
      ? repeat(8, i => circle(400 + i * 185, 730 + i % 2 * 12, 18 + i % 3 * 5, '#e3d9c2', 'none')) : '') +
    bunting(200) + rect(66, 677, 200, 91, '#f2ddab', 7) +
    text(166, 715, '24-HOUR', 23) + text(166, 747, 'ARTS FAIR', 23);
}
function piano(x, y, scale = 1) {
  return group(x, y, scale,
    path('M0 0 H320 Q400-160 270-225 H0Z', '#323b4d') +
    path('M10-15 H320 L275-220 H10Z', '#526076') +
    rect(-15, 0, 350, 75, '#2e3643', 5) + rect(-4, 13, 325, 32, '#fff0d5', 0, 'none') +
    repeat(22, i => path(`M${i * 14} 15 v29`, 'none', '#8a8e8b', 1.5)) +
    repeat(15, i => rect(i * 21 + 6, 12, 8, 20, '#303644', 0, 'none')) +
    path('M8 75 V210 M298 75 V210', 'none', '#343747', 17));
}
function microphone(x, y, scale = 1) {
  return group(x, y, scale, path('M0 0 V220 M-45 220 H45', 'none', OUTLINE, 8) +
    group(0, 0, 1, rect(-13, -55, 26, 65, '#596675', 13), 'transform-origin="0 0"'));
}
function deck(options, palette) {
  return sky(palette, options.tod) +
    rect(-600, 680, 3120, 1020, '#bf926c', 0, 'none') +
    repeat(10, i => path(`M-600 ${700 + i * 90} H2520`, 'none', '#9b735c', 3)) +
    rect(-250, 250, 600, 420, '#f6ead2', 26) +
    rect(-120, 320, 375, 230, '#547f90', 20) +
    path('M360 570 H2450 M360 655 H2450', 'none', '#eee8d7', 12) +
    repeat(13, i => path(`M${400 + i * 155} 570 V680`, 'none', '#e8dfce', 8)) +
    bunting(110) + piano(490, 665, .8) + microphone(1200, 540, .8) +
    rect(1400, 530, 140, 160, '#3e4a59', 8) + circle(1470, 618, 44, '#283343') +
    rect(760, 248, 760, 95, '#f2d29b', 9) + text(1140, 306, options.board || 'SUNRISE ARTS MARATHON', 33) +
    (options.tod === 'night' ? repeat(12, i => circle(240 + i * 140, 210, 8, '#ffe9b0', 'none')) : '');
}
function monster(options) {
  const dropped = options.effect > .5;
  const eyeDrop = dropped ? 240 * clamp(options.progress) : 0;
  return group(1140, 385, 1,
    path('M-125 330 L-95 70 Q-65-60 90-30 Q240-50 262 80 L290 330Z', '#69a6a2') +
    path('M-90 81 L-134 40 -76 25 -107-20 -31-6 10-65 56-24 130-66 152-18 239-32 220 13 278 39 232 65Z', '#72b6ad') +
    rect(-55, 130, 240, 110, '#263c47', 40) +
    path('M-30 135 l20 34 20-34 M40 135 l20 34 20-34 M110 135 l20 34 20-34', '#f5e5b8') +
    circle(128, 66, 42, '#fff2ce') + circle(130, 73, 13, OUTLINE) +
    circle(-5, 60 + eyeDrop, 42, '#fff2ce') + circle(0, 67 + eyeDrop, 13, OUTLINE) +
    path('M-121 330 H-20 V360 H-148Z M181 330 H288 L310 360 H181Z', '#7d9f84') +
    rect(-35, 270, 192, 52, '#e7c38e', 6) + text(61, 305, 'FEED ME!', 25));
}
function booth(options, palette) {
  return sky(palette, options.tod) + school(palette) +
    rect(810, 220, 850, 45, '#84664f', 4) +
    rect(830, 230, 20, 510, '#9c7254') + rect(1620, 230, 20, 510, '#9c7254') +
    path('M770 230 L900 110 H1550 L1690 230Z', '#df8b72') +
    rect(950, 250, 560, 74, '#f5e3b6', 6) + text(1230, 298, 'FEED THE SEA MONSTER', 28) +
    monster(options) +
    rect(868, 735, 670, 65, '#b18562', 8) +
    path('M900 800 V920 M1500 800 V920', 'none', '#755d4c', 18) +
    rect(1510, 638, 110, 95, '#dec18a', 5) + text(1565, 693, 'COINS', 18) +
    rect(175, 770, 210, 13, '#efdfb9', 2) +
    path('M200 770 l80-65 80 65Z M220 763 l60-47 60 47Z', '#bd8c60') +
    path('M222 743 h113', 'none', '#f3d8a2', 8);
}
function backstage(options, palette) {
  const damaged = options.effect > .5;
  return rect(-600, -400, 3120, 2100, '#424b5a', 0, 'none') +
    rect(-600, 730, 3120, 970, '#9b8879', 0, 'none') +
    path('M650-400 V540 L850 730 V-400Z', '#985a68') +
    path('M1800-400 V650 L1570 730 V-400Z', '#985a68') +
    rect(860, -100, 690, 830, palette.sky, 0, 'none') +
    path('M870 690 H1550', 'none', '#e1c69f', 22) + piano(1100, 620, .5) +
    rect(105, 400, 300, 220, '#525e6d', 14) +
    circle(250, 510, 70, '#333c4a') +
    path('M170 620 V735 M345 620 V735', 'none', OUTLINE, 12) +
    rect(1390, 760, 310, 120, '#b88b64', 8) +
    path('M1370 785 H1720 M1350 820 H1740 M1330 855 H1760', 'none', '#775e50', 12) +
    (damaged
      ? path('M350 800 Q650 1000 875 850 M965 850 Q1130 780 1390 875', 'none', OUTLINE, 10) +
        path('M876 850 l29-12 M965 850 l-25 17', 'none', '#ce8159', 5)
      : path('M350 800 Q650 1000 920 850 Q1130 780 1390 875', 'none', OUTLINE, 10)) +
    text(255, 323, 'BACKSTAGE', 35, '#f1ddbd');
}
function desk(options, palette) {
  return sky(palette, options.tod) + school(palette) +
    rect(1190, 405, 350, 230, '#334152', 12) +
    rect(1207, 423, 316, 185, options.effect > .5 ? '#b66d67' : '#688e91', 4) +
    text(1365, 475, 'SECURITY CAMERA', 22, '#f9eed8') +
    path('M1240 562 l45-35 50 35 50-35 45 35 50-35', 'none', '#ebdfbd', 5) +
    rect(1337, 637, 56, 54, '#384352', 4) +
    rect(1020, 690, 680, 55, '#b58d6a', 7) +
    path('M1060 745 V890 M1650 745 V890', 'none', '#6e5b50', 18) +
    rect(1037, 603, 120, 85, '#f3d8a1', 5) + text(1097, 639, 'ARTS', 20) + text(1097, 665, 'FUND', 20) +
    rect(1580, 657, 90, 32, '#f4e7d0', 2) +
    rect(730, 620, 130, 115, '#768b93', 17) + rect(720, 735, 150, 28, '#7a8b8e', 10) +
    path('M735 762 V900 M855 762 V900', 'none', '#465361', 10) +
    bunting(145);
}
function volunteerRoom(options, palette) {
  return rect(-600, -400, 3120, 2100, '#d5c8b5', 0, 'none') +
    rect(-600, 740, 3120, 960, '#b39e86', 0, 'none') +
    rect(180, 170, 430, 340, '#607b8a', 10) +
    rect(195, 185, 400, 310, palette.sky, 0, 'none') +
    path('M395 185 V495 M195 335 H595', 'none', '#ece0c7', 12) +
    circle(485, 256, 39, palette.light, 'none') +
    rect(1130, 140, 500, 310, '#a68d70', 8) +
    rect(1190, 205, 165, 150, '#ecddbd', 3) + rect(1400, 230, 150, 130, '#d3e0d7', 3) +
    text(1380, 182, 'VOLUNTEER ROOM', 26, '#fff2d1') +
    rect(1060, 650, 630, 44, '#987354', 6) +
    path('M1090 695 V860 M1650 695 V860', 'none', '#6c5748', 17) +
    rect(1200, 607, 240, 35, '#f4ead3', 3) +
    repeat(10, i => rect(1210 + i * 22, 613, 13, 13, i < Math.round(options.effect * 10) ? '#91af95' : '#e9dfc9', 2, '#8e8c7e', 2)) +
    circle(870, 270, 80, '#f6e9c9') + text(870, 281, options.board || '06:30', 31) +
    rect(1520, 586, 60, 59, '#ece3ce', 8) + path('M1580 602 Q1610 601 1599 628 L1580 628', 'none', '#ece3ce', 8);
}
function wristband(options) {
  const [timer = '23:59:00', rawCount = '0', listener = 'MAYA', state = 'CLAIMS LOCKED'] =
    (options.board || '23:59:00|0|MAYA|CLAIMS LOCKED').split('|');
  const count = Math.max(0, Math.min(10, Math.round(Number(rawCount) || 0)));
  const clearCount = Math.round(options.effect * count);
  const conflict = state.includes('CONFLICT');
  const color = conflict ? '#f48a76' : '#b7e4ce';
  return rect(-600, -400, 3120, 2100, '#ede3d0', 0, 'none') +
    rect(-500, 395, 2940, 265, '#d6b598', 120, '#b28e79', 7) +
    rect(575, -400, 770, 2100, '#3c5058', 105) +
    repeat(7, i => rect(890, 835 + i * 80, 140, 31, '#1f3039', 15, 'none')) +
    rect(486, 160, 948, 650, '#e0cfa8', 75) +
    rect(514, 188, 892, 594, '#1e343f', 56) +
    text(960, 285, 'TIME TO TELL THE TRUTH', 31, '#c7bda5') +
    text(960, 414, timer.slice(0, 12), 103, color) +
    repeat(10, i => rect(622 + i * 70, 465, 48, 51,
      i >= count ? '#304651' : i < clearCount ? '#8ac9ab' : '#d88867', 9, '#647a7c', 3)) +
    text(960, 577, `FIRST LISTENER  ${listener.slice(0, 18)}`, 29, '#e5dec6') +
    text(960, 652, state.slice(0, 28), 34, color) +
    text(960, 714, `${count - clearCount} / 10 UNCONFESSED`, 25, '#b7c8c5');
}

export function liesArtwork(name, input = {}) {
  if (!LIES_SETS.includes(name)) throw new Error(`Unknown episode set: ${name}`);
  const options = {
    tod: Object.hasOwn(COLORS, input.tod) ? input.tod : 'day',
    progress: clamp(input.progress),
    effect: clamp(input.effect),
    board: String(input.board || ''),
  };
  const palette = COLORS[options.tod];
  const draw = {
    lies_courtyard: courtyard, lies_yacht_deck: deck, lies_monster_booth: booth,
    lies_backstage: backstage, lies_donation_desk: desk,
    lies_volunteer_room: volunteerRoom, lies_wristband: wristband,
  }[name];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="3120" height="2100" viewBox="-600 -400 3120 2100">${draw(options, palette)}</svg>`;
}
