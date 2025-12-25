let rng = Math.random;

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function setRandomSeed(seed) {
  if (!Number.isFinite(seed)) {
    rng = Math.random;
    return;
  }
  rng = mulberry32(Math.floor(seed));
}

export function random() {
  return rng();
}

export function randomNormal(mean = 0, sd = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function randomNormalArray(len, mean = 0, sd = 1) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(randomNormal(mean, sd));
  return out;
}
