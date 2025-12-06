export function randomNormal(mean = 0, sd = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function randomNormalArray(len, mean = 0, sd = 1) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(randomNormal(mean, sd));
  return out;
}
