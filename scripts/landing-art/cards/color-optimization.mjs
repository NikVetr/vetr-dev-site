// Palette Town: a recorded, real optimization trajectory, with fixed input circles and
// moving candidate squares in the app's OKLab view. No optimizer runs in the card builder.
// Provenance: 687995e20636732795822a1be8363d756032d30b, unchanged scientific-summary/example.json
// (seed 2026, random search, 12 restarts × 160 iterations, 48 trajectory samples).
// Regenerate in a checkout of that commit: optimizePalette(example.inputs, example.config,
// {onProgress: p => runs.push(p)}); retain runs[11].trajectory. The final hex colors must
// equal example.added. These are the winning restart's 31 actual retained states; the loop
// plays them forward, holds the result, then restarts. It does not imply real-time duration.
import { crc32, deflateSync } from 'node:zlib';
import { decodeColor, encodeColor, isInGamut, projectToGamut } from '../../../color-optimization/core/colorSpaces.js';
import { contrastColor } from '../../../color-optimization/core/metrics.js';
import { buildGamutProjectionBoundary, computeGamutExtent, smoothBoundary } from '../../../color-optimization/ui/gamutHull.js';
import { H, W, art, esc, flipbook, num, polyline } from '../svg.mjs';

const FIELD = 24;
const PERIOD = 7;
const INPUTS = ['#4477AA', '#CC6677'];
const ADDED = ['#284B00', '#660073', '#18D700'];
/** @type {{hex: string[], raw: {l: number, a: number, b: number}[]}[]} */
const TRACE = [
  {"hex":["#86597C","#4259E5","#D744FC"],"raw":[{"l":0.525335610592421,"a":0.07011809386312962,"b":-0.03257551812566817},{"l":0.5340305793600022,"a":0.0004739547148346901,"b":-0.21256549539975822},{"l":0.6710188281339557,"a":0.20323662529699504,"b":-0.17825869168154895}]},
  {"hex":["#86597C","#7E6B39","#D744FC"],"raw":[{"l":0.525335610592421,"a":0.07011809386312962,"b":-0.03257551812566817},{"l":0.5340305793600022,"a":0.0004739547148346901,"b":0.07251584607039496},{"l":0.6710188281339557,"a":0.20323662529699504,"b":-0.17825869168154895}]},
  {"hex":["#8A000F","#5D2083","#CA0094"],"raw":[{"l":0.39953204949075116,"a":0.14601123732948673,"b":0.07087079331965174},{"l":0.38835831664932624,"a":0.09914306576175613,"b":-0.12430861674667959},{"l":0.5592098385182117,"a":0.22963756601037355,"b":-0.0628774557401211}]},
  {"hex":["#784700","#7A3A72","#00CFAF"],"raw":[{"l":0.4446974900167633,"a":0.03985340752379618,"b":0.09040966689289476},{"l":0.45258750310160684,"a":0.1030899617460237,"b":-0.054732542744520996},{"l":0.7627167039488361,"a":-0.14197685805213173,"b":0.009118651527821542}]},
  {"hex":["#494300","#6F00CB","#AFBE00"],"raw":[{"l":0.375595809578064,"a":-0.0189678026412603,"b":0.07692318973430556},{"l":0.458727575928972,"a":0.1162095655864257,"b":-0.21878188480125105},{"l":0.7627167039488361,"a":-0.07354742654878899,"b":0.15659436917734415}]},
  {"hex":["#005700","#741457","#00D645"],"raw":[{"l":0.3971351016122553,"a":-0.1072170497438586,"b":0.08223732822224072},{"l":0.3861190968926946,"a":0.14050002815412466,"b":-0.04008969639144888},{"l":0.7627167039488361,"a":-0.19383766100238736,"b":0.13157763764069796}]},
  {"hex":["#384700","#6F0089","#00D700"],"raw":[{"l":0.3703239420494619,"a":-0.04711753984612166,"b":0.07614130273412534},{"l":0.3994540800215016,"a":0.14303895422107527,"b":-0.13157967555918276},{"l":0.7627167039488361,"a":-0.2059287279388901,"b":0.15795088962396164}]},
  {"hex":["#2C4C00","#6B0072","#00D700"],"raw":[{"l":0.378104918016478,"a":-0.06977062587246641,"b":0.07796562106361093},{"l":0.3751638505486255,"a":0.1440972766285602,"b":-0.09946611100735508},{"l":0.7627167039488361,"a":-0.2059299431006964,"b":0.15795182167404653}]},
  {"hex":["#005600","#6B006D","#24D600"],"raw":[{"l":0.3914856286340562,"a":-0.1056918261540245,"b":0.08106745539633164},{"l":0.3716638795029051,"a":0.14462499539482743,"b":-0.09249581734386564},{"l":0.7627167039488361,"a":-0.20006334172776047,"b":0.15791223032174062}]},
  {"hex":["#1E4E00","#611075","#1AD700"],"raw":[{"l":0.37446216500296303,"a":-0.08386199464445199,"b":0.07736628149429592},{"l":0.36932923127891215,"a":0.12201088311942587,"b":-0.10971004688490055},{"l":0.7627167039488361,"a":-0.20260772092561363,"b":0.15792487721684156}]},
  {"hex":["#104F00","#6A0072","#21D700"],"raw":[{"l":0.37359239968069213,"a":-0.09399408900145279,"b":0.07729220414223581},{"l":0.3729789169224054,"a":0.14242884293471603,"b":-0.10135836471931114},{"l":0.7627167039488361,"a":-0.20096871154533147,"b":0.1579133108740729}]},
  {"hex":["#214C00","#6D0069","#1FD700"],"raw":[{"l":0.371683309102694,"a":-0.08004359902479696,"b":0.07675937038536607},{"l":0.37243280826060265,"a":0.14695772725958867,"b":-0.08516258916448127},{"l":0.7627167039488361,"a":-0.2014253908374471,"b":0.1579190139769524}]},
  {"hex":["#2A4B00","#680077","#00D700"],"raw":[{"l":0.3730712663696894,"a":-0.06988481776870542,"b":0.07693843294653735},{"l":0.3733196026305705,"a":0.13893872988499212,"b":-0.1111422113269046},{"l":0.7627167039488361,"a":-0.20595346263934428,"b":0.15796986156624704}]},
  {"hex":["#035000","#650079","#00D700"],"raw":[{"l":0.37337055099640615,"a":-0.09959096167265835,"b":0.07730392969464672},{"l":0.3708737483149955,"a":0.13534912460650372,"b":-0.11670722997231003},{"l":0.7627167039488361,"a":-0.20594080846074958,"b":0.1579601555927943}]},
  {"hex":["#294B00","#660570","#3CD500"],"raw":[{"l":0.3729097690108596,"a":-0.07161681830300354,"b":0.0769232890663113},{"l":0.3674651226880539,"a":0.13579175351072303,"b":-0.1002741184276561},{"l":0.7627167039488361,"a":-0.19129571852253446,"b":0.15781248355127597}]},
  {"hex":["#304A00","#660173","#20D700"],"raw":[{"l":0.3726439783897406,"a":-0.061256604959894934,"b":0.07676201907284674},{"l":0.3671937187987699,"a":0.13725821951087902,"b":-0.10627728903823008},{"l":0.7627167039488361,"a":-0.20124376430343321,"b":0.15791633351864687}]},
  {"hex":["#2D4A00","#660073","#0CD700"],"raw":[{"l":0.3728139427565091,"a":-0.06601356215530119,"b":0.07684591731523027},{"l":0.3680416951519635,"a":0.13818096806530322,"b":-0.10651310758492538},{"l":0.7627167039488361,"a":-0.2047693904905326,"b":0.157952158033833}]},
  {"hex":["#284B00","#650075","#16D700"],"raw":[{"l":0.37299551130123154,"a":-0.072114421441135,"b":0.07694593203714972},{"l":0.3673995342563883,"a":0.13616837438695562,"b":-0.10979905225763925},{"l":0.7627167039488361,"a":-0.2032457570051569,"b":0.15793668395019878}]},
  {"hex":["#284B00","#660073","#19D700"],"raw":[{"l":0.3728171802121217,"a":-0.07225952416371678,"b":0.07691099338452823},{"l":0.3673022531661854,"a":0.13801469797132881,"b":-0.10627638887862645},{"l":0.7627167039488361,"a":-0.2027590906615817,"b":0.15793228813789695}]},
  {"hex":["#284B00","#660073","#1BD700"],"raw":[{"l":0.3728646391989841,"a":-0.07242766729354766,"b":0.07692242095474722},{"l":0.3677448803370919,"a":0.1379378366878361,"b":-0.10676868884404278},{"l":0.7627167039488361,"a":-0.2023877448957211,"b":0.15792829272293019}]},
  {"hex":["#284B00","#660073","#19D700"],"raw":[{"l":0.37287135321776704,"a":-0.07204340147349719,"b":0.07691983497760357},{"l":0.36732777690207946,"a":0.13751809474522614,"b":-0.10766597524687593},{"l":0.7627167039488361,"a":-0.20280218389323823,"b":0.15793250834445105}]},
  {"hex":["#284B00","#660073","#19D700"],"raw":[{"l":0.37286971501965077,"a":-0.07213944772609937,"b":0.07692048956020192},{"l":0.36733080809050506,"a":0.13773925757243843,"b":-0.1075095053652671},{"l":0.7627167039488361,"a":-0.20269861085801066,"b":0.15793145485786741}]},
  {"hex":["#284B00","#660073","#1AD700"],"raw":[{"l":0.3728788184933752,"a":-0.07236378134423244,"b":0.07692465986188424},{"l":0.3673496781266767,"a":0.13759780121788012,"b":-0.10747464519912042},{"l":0.7627167039488361,"a":-0.2026668440717791,"b":0.15793096523428796}]},
  {"hex":["#284B00","#660073","#19D700"],"raw":[{"l":0.37289342303911244,"a":-0.0723625854509542,"b":0.0769276312647289},{"l":0.36753777402163923,"a":0.13758861084123652,"b":-0.10740651416166375},{"l":0.7627167039488361,"a":-0.2027669100126389,"b":0.15793189847528044}]},
  {"hex":["#284B00","#660073","#18D700"],"raw":[{"l":0.3729147543119508,"a":-0.07253444197930808,"b":0.07693375909936906},{"l":0.36738104374585473,"a":0.1376018957458388,"b":-0.10757713286073178},{"l":0.7627167039488361,"a":-0.20286684244125552,"b":0.15793281119392244}]},
  {"hex":["#284B00","#660073","#19D700"],"raw":[{"l":0.37291458820845214,"a":-0.0725981767208963,"b":0.07693438149443466},{"l":0.36739977039264765,"a":0.13768043149372156,"b":-0.10744710576263261},{"l":0.7627167039488361,"a":-0.2027667021077314,"b":0.15793158690810327}]},
  {"hex":["#284B00","#660073","#18D700"],"raw":[{"l":0.37293085606694143,"a":-0.07241662648582708,"b":0.07693583540750737},{"l":0.36740603916095743,"a":0.13754996084796622,"b":-0.10767502348235058},{"l":0.7627167039488361,"a":-0.20290707174777178,"b":0.15793296541342627}]},
  {"hex":["#284B00","#660073","#19D700"],"raw":[{"l":0.37293284606056043,"a":-0.07254944259049889,"b":0.07693760973468},{"l":0.3674127250209358,"a":0.13755828761480138,"b":-0.10755703295941582},{"l":0.7627167039488361,"a":-0.2028514248895107,"b":0.15793236789847986}]},
  {"hex":["#284B00","#660073","#18D700"],"raw":[{"l":0.37293757170106323,"a":-0.07237924734866913,"b":0.07693682246359634},{"l":0.3674212089573354,"a":0.13757110265132577,"b":-0.10760413763435889},{"l":0.7627167039488361,"a":-0.202968114252159,"b":0.15793345706582373}]},
  {"hex":["#284B00","#660073","#18D700"],"raw":[{"l":0.37294485594216065,"a":-0.07242246325773471,"b":0.07693875570250852},{"l":0.36742492393223875,"a":0.1375130667469916,"b":-0.10765176719549457},{"l":0.7627167039488361,"a":-0.20293986759826393,"b":0.15793316334159335}]},
  {"hex":["#284B00","#660073","#18D700"],"raw":[{"l":0.3729370048465769,"a":-0.07239916587167572,"b":0.0769369117885772},{"l":0.3674227034319575,"a":0.1376178638810266,"b":-0.1076368366450009},{"l":0.7627167039488361,"a":-0.20289366561749617,"b":0.1579326735518044}]}
];

/**
 * An RGB PNG of `n` × `n` pixels, as a data URI.
 * @param {number} n
 * @param {number[][]} rgb  rows of [r, g, b, r, g, b, ...]
 */
function png(n, rgb) {
  // Each row filtered with "Sub" (the difference from the pixel to its left), which suits a field.
  const raw = Buffer.alloc(n * (3 * n + 1));
  rgb.forEach((row, y) => {
    const o = y * (3 * n + 1);
    raw[o] = 1;
    row.forEach((v, i) => { raw[o + 1 + i] = (v - (i >= 3 ? row[i - 3] : 0) + 256) % 256; });
  });
  const chunk = (/** @type {string} */ type, /** @type {Buffer} */ data) => {
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const file = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  return `data:image/png;base64,${file.toString('base64')}`;
}


export async function build() {
  const space = 'oklab', gamut = 'srgb';
  if (JSON.stringify(TRACE.at(-1)?.hex) !== JSON.stringify(ADDED)) throw new Error('color-optimization: recorded trace does not reach its verified palette');
  const range = computeGamutExtent(space, gamut, 1.1);
  const maxA = Math.max(Math.abs(range.min.a), Math.abs(range.max.a));
  const maxB = Math.max(Math.abs(range.min.b), Math.abs(range.max.b));
  const side = 136, px = W - 10 - side, py = (H - side) / 2, half = side / 2;
  const toXY = (/** @type {{a: number, b: number}} */ v) => [px + half + v.a / maxA * half, py + half - v.b / maxB * half];
  const projected = TRACE.map((step) => step.raw.map((v) => projectToGamut(v, space, gamut, space)));
  const inputs = INPUTS.map((hex) => projectToGamut(decodeColor(hex, space), space, gamut, space));
  for (const v of [...inputs, ...projected.flat()]) {
    if (![v.l, v.a, v.b].every(Number.isFinite) || Math.abs(v.a) > maxA || Math.abs(v.b) > maxB) throw new Error('color-optimization: a recorded color lies outside the app view');
  }

  const boundary = smoothBoundary(buildGamutProjectionBoundary(space, gamut, range, true, {l:'l', x:'a', y:'b'})
    .map((/** @type {{a: number, b: number}} */ v) => {const [x,y] = toXY(v); return {x,y};}), 1);
  const outline = polyline(boundary.filter((/** @type {unknown} */ _, /** @type {number} */ i) => i % 4 === 0)
    .map((/** @type {{x: number, y: number}} */ {x,y}) => [x,y]), true);
  const fieldL = range.min.l + 0.75 * (range.max.l - range.min.l);
  const field = Array.from({length: FIELD}, (_, yi) => Array.from({length: FIELD}, (_, xi) => {
    const v = {l: fieldL, a: ((xi + 0.5) / FIELD * 2 - 1) * maxA, b: (1 - (yi + 0.5) / FIELD * 2) * maxB};
    const hex = encodeColor(isInGamut(v, space, gamut) ? v : projectToGamut(v, space, gamut, space), space);
    return [1,3,5].map((i) => parseInt(hex.slice(i,i+2), 16));
  }).flat());

  const sw = {w:70, h:28, gap:6}, sx = [10,88], sy = py + half - (3 * sw.h + 2 * sw.gap - 14) / 2;
  /** @param {string} hex @param {number} column @param {number} row */
  const swatch = (hex, column, row) => {
    const x = sx[column], y = sy + row * (sw.h + sw.gap);
    return `<rect class="swatch" x="${x}" y="${num(y)}" width="${sw.w}" height="${sw.h}" rx="3" fill="${hex}"/><text class="hex" x="${x+sw.w-4}" y="${num(y+sw.h/2)}" fill="${contrastColor(hex)}">${esc(hex)}</text>`;
  };
  /** @param {{l:number, a:number, b:number}} v @param {string} hex @param {boolean} fixed */
  const marker = (v, hex, fixed) => {
    const [x,y] = toXY(v), l = Math.min(Math.max((v.l-range.min.l)/(range.max.l-range.min.l),0),1), size=(6+12*l)*0.6;
    const paint = `fill="${hex}" stroke="${contrastColor(hex)}"`;
    return fixed ? `<circle class="marker" cx="${num(x)}" cy="${num(y)}" r="${num(size/2)}" ${paint}/>`
      : `<rect class="marker" x="${num(x-size/2)}" y="${num(y-size/2)}" width="${num(size)}" height="${num(size)}" ${paint}/>`;
  };
  const frames = TRACE.map((step,k) => {
    const trails = step.hex.map((_,i) => `<path class="trail" d="${polyline(projected.slice(0,k+1).map((row)=>toXY(row[i])))}" stroke="${ADDED[i]}"/>`).join('');
    const candidates = projected[k].map((v,i)=>({v,i})).sort((a,b)=>b.v.l-a.v.l).map(({v,i})=>marker(v,step.hex[i],false)).join('');
    return `<g data-step="${k}">${trails}${step.hex.map((hex,i)=>swatch(hex,1,i)).join('')}${candidates}</g>`;
  });
  // Keep the finished palette as the still image, and pause there across the loop's seam.
  const last = frames.at(-1);
  if (!last) throw new Error('color-optimization: empty recorded trajectory');
  const book = flipbook('color-optimization', [...Array(4).fill(last), ...frames, ...Array(6).fill(last)], PERIOD);
  const headY=sy-7;
  const heads = `<circle cx="${sx[0]+2.6}" cy="${num(headY)}" r="2.6"/><text x="${sx[0]+8}" y="${num(headY)}">input</text>`
    + `<rect x="${sx[1]}" y="${num(headY-2.5)}" width="5" height="5"/><text x="${sx[1]+8}" y="${num(headY)}">optimize</text>`;
  let grid='';
  for(let k=1;k<8;k++)grid+=`M${num(px+k*side/8)} ${py}v${side}M${px} ${num(py+k*side/8)}h${side}`;
  return art({
    name:'color-optimization', period:PERIOD, frames:book.frames,
    defs:`<clipPath id="color-optimization-gamut"><path d="${outline}"/></clipPath>`,
    body:`
<g class="heads">${heads}</g>
<rect class="plot" x="${px}" y="${py}" width="${side}" height="${side}"/><path class="grid" d="${grid}"/>
<image class="field" href="${png(FIELD,field)}" x="${px}" y="${py}" width="${side}" height="${side}" preserveAspectRatio="none" clip-path="url(#color-optimization-gamut)"/>
<path class="outline" d="${outline}"/>
${INPUTS.map((hex,i)=>swatch(hex,0,i)+marker(inputs[i],hex,true)).join('')}
${book.body}`,
    css:`${book.css}
& text {font-family:ui-sans-serif,system-ui,sans-serif;dominant-baseline:central;}
& .heads text {fill:var(--art-muted);font-size:8px;}
& .heads circle, & .heads rect {fill:none;stroke:var(--art-muted);stroke-width:0.9;}
& .swatch {stroke:var(--art-ink);stroke-opacity:0.15;stroke-width:0.8;}
& .hex {font-size:8.5px;font-weight:600;text-anchor:end;}
& .plot {fill:var(--surface);stroke:var(--art-line);stroke-width:1;}
& .grid {fill:none;stroke:var(--art-line);stroke-width:0.5;}
& .outline {fill:none;stroke:var(--art-ink);stroke-width:1.2;stroke-linejoin:round;}
& .marker {stroke-width:0.8;}
& .trail {fill:none;stroke-width:0.9;stroke-opacity:0.7;stroke-linecap:round;stroke-linejoin:round;}`,
    loop:book.loop,
  });
}
