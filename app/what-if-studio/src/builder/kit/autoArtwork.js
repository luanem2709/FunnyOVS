// Self-contained, deterministic background art. Camera, actors, props and weather are separate layers.
const outline = '#31303e';
const rect = (x,y,w,h,fill,r=0) => '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+r+'" fill="'+fill+'"/>';
const path = (d,fill) => '<path d="'+d+'" fill="'+fill+'"/>';
const circle = (cx,cy,r,fill) => '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+fill+'"/>';
const panel = (x,y,w,h,fill) => rect(x,y,w,h,outline,10)+rect(x+7,y+7,w-14,h-14,fill,6);
const row = (n,draw) => Array.from({length:n},(_,i)=>draw(i)).join('');
const palettes = [
 ['#d2e6db','#719eac','#dea378','#b2715d'],['#d3ddef','#6e92a9','#d8b071','#866776'],
 ['#eadfc9','#88a8a3','#cc8d67','#826953'],['#dcd6e9','#8c91ae','#dda281','#916e86']
];
function windowPane(x,y,w,h,p){
 return panel(x,y,w,h,p[1])+path('M'+(x+8)+' '+(y+h-9)+'l'+(w*.28)+' '+(-h*.32)+' '+(w*.18)+' '+(h*.18)+' '+(w*.23)+' '+(-h*.31)+' '+(w*.26)+' '+(h*.31)+'v'+(h*.14)+'z',p[0])+rect(x+w/2-5,y+7,10,h-14,outline)+rect(x+6,y+h/2-4,w-12,8,outline);
}
function room(p){
 return rect(-600,-400,3120,2100,p[0])+rect(-600,745,3120,930,p[2])+rect(-600,735,3120,17,p[3])+
 row(6,i=>path('M'+(i*475-290)+' 754l'+(i*83-190)+' 640h4z',p[3]));
}
function doorway(p){
 return room(p)+windowPane(75,205,330,320,p)+panel(605,66,690,688,'#594959')+
 rect(625,85,650,652,'#ffe0ad')+rect(646,310,595,43,'#f4bc84')+
 panel(985,175,160,122,'#94b5b0')+rect(658,565,595,163,'#c3816b')+
 row(4,i=>panel(680+i*139,581,125,117,'#efbd8b'))+
 path('M630 84L854 177V694L630 738Z','#966b59')+path('M654 138L827 207V412L654 390Z','#c09073')+
 circle(813,473,12,'#e5bd68')+rect(1278,101,16,639,outline)+panel(1390,270,136,175,'#f5ce8b')+
 path('M1420 395l45-78 37 78z','#748e8d')+
 path('M1140 900l280-12 92 50-300 17z',outline)+row(9,i=>path('M'+(1170+29*i)+' 907l32 21 10-1-31-21z','#bf9b80'));
}
function cassette(x,y){
 return panel(x,y,300,152,'#465161')+panel(x+21,y+17,258,90,'#efcc91')+circle(x+76,y+61,24,outline)+circle(x+220,y+61,24,outline)+
 circle(x+76,y+61,9,'#e9d8b8')+circle(x+220,y+61,9,'#e9d8b8')+rect(x+110,y+53,76,14,'#836b67')+row(5,i=>rect(x+52+i*41,y+117,31,16,'#e7e1c9',3));
}
function workshop(p){
 return room(p)+windowPane(125,130,320,275,p)+panel(751,130,842,355,'#b58e73')+
 row(72,i=>circle(783+(i%18)*44,163+Math.floor(i/18)*85,4,'#796658'))+
 row(5,i=>rect(845+i*139,205,12,111,'#4a5460',5)+rect(838+i*139,298,27,56,i%2?p[2]:'#729496',7))+
 rect(560,620,1160,37,outline,6)+rect(578,652,36,110,p[3])+panel(1320,654,355,109,p[3])+
 cassette(865,465)+path('M701 607l53-179 12 3-50 180z',outline)+path('M705 438q46-93 112 0z','#c99051');
}
function street(p,h){
 return rect(-600,-400,3120,2200,p[1])+row(12,i=>{
 const x=i*240-460,top=150+(h+i*73)%190;
 return panel(x,top,225,820-top,i%2?p[0]:p[2])+row(6,j=>rect(x+30+(j%3)*60,top+40+Math.floor(j/3)*88,42,62,p[1],2));
 })+rect(-600,760,3120,950,'#878895')+rect(-600,795,3120,20,p[0])+row(10,i=>rect(i*315-480,975,160,12,'#f2dba6'));
}
function landscape(p,h,water){
 return rect(-600,-400,3120,2100,p[0])+circle(330+h%1100,160,76,'#ffe3a0')+
 path('M-600 590Q-180 190 300 499T1150 411T2550 329V1180H-600Z',p[1])+
 path('M-600 655Q160 390 610 600T1500 532T2550 492V1190H-600Z','#759887')+
 rect(-600,705,3120,990,water?'#689eaf':'#99ad83')+
 (water?row(23,i=>rect((i*219)%2310-200,759+(i*39)%254,72+i%5*12,5,'#aed5cd',2)):
 row(12,i=>{const x=i*237-330,y=510+(i*17+h)%90;return rect(x,y,19,132,'#79695c')+circle(x+9,y-4,47,'#658b76')+circle(x-14,y+6,30,'#7fa389');}));
}
function interior(p,h,industrial){
 const shift=h%110;
 return room(p)+windowPane(95+shift,150,404,300,p)+panel(1005-shift,190,576,300,industrial?'#889591':'#aa907b')+
 (industrial?row(5,i=>panel(1035+i*90-shift,232,61,112,p[0])+circle(1066+i*90-shift,385,10,i%2?'#c8a86f':'#83ae9a')):
 row(24,i=>rect(1035+(i%12)*43-shift,220+Math.floor(i/12)*121+ i%3*10,30,86-i%3*10,[p[0],p[1],p[2]][i%3],3)))+
 panel(1110-shift,583,560,148,p[3])+rect(1124-shift,722,24,38,outline)+rect(1614-shift,722,24,38,outline);
}
export function backgroundArtwork(name){
 const id=String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/đ/g,'d');
 let hash=2166136261;
 for(const c of id) hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
 const p=palettes[hash%palettes.length];
 let shape;
 if(/threshold|doorway|doorstep|porch|nguong.?cua|hien.?nha/.test(id)) shape=doorway(p);
 else if(/workroom|workshop|xuong|tape.?room/.test(id)) shape=workshop(p);
 else if(/lake|river|sea|beach|harbor|ocean|song|bien|cang/.test(id)) shape=landscape(p,hash,true);
 else if(/forest|trail|mountain|garden|farm|meadow|vuon|rung|nui|field/.test(id)) shape=landscape(p,hash,false);
 else if(/street|avenue|city|alley|station|plaza|duong|pho|ngo/.test(id)) shape=street(p,hash);
 else shape=interior(p,hash,/factory|lab|engine|machine|plant|may|tram/.test(id));
 return '<svg xmlns="http://www.w3.org/2000/svg" width="3120" height="2100" viewBox="-600 -400 3120 2100">'+shape+'</svg>';
}
