import { simulateCvdHex } from "../core/cvd.js";

// Small helper for manual inspection:
//   node tools/cvd_fixture.mjs
// Optionally set CVD_SEVERITY=0.7 and CVD_MODEL=legacy|machado2009.

const severity = Math.max(0, Math.min(1, Number(process.env.CVD_SEVERITY ?? "1")));
const model = process.env.CVD_MODEL || undefined;

const swatches = [
  "#000000",
  "#FFFFFF",
  "#777777",
  "#FF0000",
  "#00FF00",
  "#0000FF",
  "#00FFFF",
  "#FF00FF",
  "#FFFF00",
  "#123456",
  "#E67E22",
  "#2ECC71",
];

const types = ["deutan", "protan", "tritan"];

console.log(`severity=${severity} model=${model || "(default)"}`);
for (const t of types) {
  console.log(`\n${t}`);
  for (const hex of swatches) {
    const sim = simulateCvdHex(hex, { type: t, severity, model });
    console.log(`${hex} -> ${sim}`);
  }
}

