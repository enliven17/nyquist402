// Builds the lifecycle figure: an isometric flow bench driven by scroll. Writes components/landing/lifecycleArt.ts.
// Run: node scripts/lifecycle-figure.mjs
// Three graduated columns (agent, escrow, seller) joined by two ducts with four valves:
// front duct: authorize (agent → escrow), capture (escrow → seller);
// back duct: release (escrow → agent, the void), refund (seller → escrow, passed on to the agent).
import { writeFileSync } from "node:fs";
import * as k from "./iso/iso-kit.mjs";

const WIDTH = 720;
const HEIGHT = 500;

const BASE = { x: -132, y: -58, w: 264, d: 120, r: 10 };
const BASE_H = 10;
const FOOT_H = 5;
const COLS = { agent: -90, escrow: 0, seller: 90 };
const COL = (cx) => ({ x: cx - 15, y: -15, w: 30, d: 30, r: 2 });
const COL_Z = 4;
const WIN = { w: 12, z0: 18, h: 40 }; // window bottom and height: h is 1.00
const COL_H = WIN.z0 + WIN.h + 10;
const LANES = { front: 34, back: -34 }; // duct centre lines
const DUCT_D = 8;
const DUCT_H = 6;
// Placed so each valve shows in a screen gap between columns (screen x follows x − y at 45°).
const VALVES = { authorize: [-22, "front"], capture: [68, "front"], release: [-68, "back"], refund: [22, "back"] };
const WHEEL_Z = 26;
const WHEEL_R = 8.5;

const P = k.fitProjection([...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), ...Object.values({ a: -90, b: 0, c: 90 }).flatMap((cx) => k.boxCorners(COL(cx), 0, COL_H + 6))], WIDTH, HEIGHT, { pad: 20, azimuth: 45 });
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth = ([x, y]) => k.depthOf([x, y, 0], P);

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`];
  for (const [x, y] of [...k.corners(BASE, 20)].sort((a, b) => depth(a) - depth(b))) {
    out.push(S(k.cylinder(x, y, 8, -BASE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(BASE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  const strip = { x: -118, y: 50, w: 236, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.6, 0.6, [1.8, 3.4], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  return out.join("");
}

// A duct along x on one lane, with flanges at its ends and a flow line on top (lit while its valve is open).
function duct(lane, x0, x1, flow) {
  const y = LANES[lane] - DUCT_D / 2;
  const out = [S(k.slabOf({ x: x0, y, w: x1 - x0, d: DUCT_D, r: 1 }, 0, DUCT_H, P, 3, 0.4), { tone: "mid" })];
  for (const x of [x0, x1 - 3]) out.push(S(k.slabOf({ x, y: y - 1.2, w: 3, d: DUCT_D + 2.4, r: 0.6 }, 0, DUCT_H + 1.2, P, 2, 0.3), { tone: "mid" }));
  if (flow) out.push(`<path class="flow" data-flow="${flow}" d="${k.lineOnTop([x0 + 4, LANES[lane]], [x1 - 4, LANES[lane]], DUCT_H, P)}"/>`);
  return out.join("");
}

// The short stub from a column face down to a lane.
function stub(cx, lane) {
  const y0 = lane === "front" ? 15 : LANES.back + DUCT_D / 2;
  const y1 = lane === "front" ? LANES.front - DUCT_D / 2 : -15;
  return S(k.slabOf({ x: cx - 4, y: y0, w: 8, d: y1 - y0, r: 0.8 }, 0, DUCT_H - 0.6, P, 2, 0.3), { tone: "mid" });
}

const spokesAt = (vx, vy, turn) => {
  const out = [];
  for (let i = 0; i < 3; i++) {
    const a = turn * 2 * Math.PI + (i * 2 * Math.PI) / 3;
    out.push(k.lineOnTop([vx + Math.cos(a) * 1.6, vy + Math.sin(a) * 1.6], [vx + Math.cos(a) * (WHEEL_R - 1.6), vy + Math.sin(a) * (WHEEL_R - 1.6)], WHEEL_Z + 1.8, P));
  }
  return out.join("");
};

function valve(name) {
  const [vx, lane] = VALVES[name];
  const vy = LANES[lane];
  const out = [];
  out.push(S(k.slabOf({ x: vx - 7, y: vy - 7, w: 14, d: 14, r: 1.6 }, 0, DUCT_H + 5, P, 3, 0.5), { tone: "mid" }));
  out.push(D(k.corners({ x: vx - 7, y: vy - 7, w: 14, d: 14, r: 1.6 }, 2.2).map(([x, y]) => at([x, y, DUCT_H + 5])), { size: 0.4 }));
  out.push(S(k.cylinder(vx, vy, 3.6, DUCT_H + 5, 5, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(vx, vy, 1.3, DUCT_H + 10, WHEEL_Z - DUCT_H - 10, P, 14), { tone: "mid", crease: "none" }));
  out.push(`<g class="wheel" data-valve="${name}">${S(k.cylinder(vx, vy, WHEEL_R, WHEEL_Z, 1.8, P, 40, 0.4), { tone: "hi", crease: "lo" })}${L(k.knurl(vx, vy, WHEEL_R, WHEEL_Z + 0.2, WHEEL_Z + 1.6, 36, P), { tone: "faint" })}${L(k.ring(vx, vy, WHEEL_R - 1.4, WHEEL_Z + 1.8, P, 40), { tone: "lo" })}<path class="iso-line" data-tone="mid" data-spokes="${name}" d="${spokesAt(vx, vy, 0)}"/>${L(k.ring(vx, vy, 1.6, WHEEL_Z + 1.8, P, 12), { tone: "mid" })}</g>`);
  // engraved name on the duct, in front of the valve
  const ty = lane === "front" ? vy + DUCT_D / 2 - 1.4 : vy + DUCT_D / 2 - 1.4;
  out.push(k.faceTextSvg(k.topMatrix([vx + 9, ty], DUCT_H, P, "x"), name.toUpperCase(), { size: 3, tone: "mid" }));
  return out.join("");
}

function column(name, cx) {
  const plan = COL(cx);
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(plan, 2), 0, COL_H, P)}" style="filter:blur(5px)"/>`];
  out.push(S(k.slabOf(k.insetPlan(plan, -3), 0, COL_Z, P, 4, 0.5), { tone: "mid" }));
  out.push(S(k.slabOf(plan, COL_Z, COL_H - COL_Z, P, 4, 0.6), { tone: "mid", inner: L(k.sideSeam(plan, COL_Z + 8, P, 4), { tone: "faint" }) }));
  out.push(S(k.slabOf(k.insetPlan(plan, -1.6), COL_H, 4, P, 4, 0.6), { tone: "mid" }));
  out.push(D(k.corners(plan, 3).map(([x, y]) => at([x, y, COL_H + 4])), { size: 0.45 }));
  out.push(k.faceTextSvg(k.topMatrix([plan.x + 4, plan.y + plan.d - 4], COL_H + 4, P, "x"), name.toUpperCase(), { size: 3.4, tone: "mid" }));
  // sight window on the front face (y = plan.y + plan.d), in that face's own plane
  const face = plan.y + plan.d;
  const wx = cx - WIN.w / 2;
  const m = k.sideMatrix([wx, face], WIN.z0, P, "left");
  out.push(`<g transform="${m}"><rect x="-1.4" y="${-WIN.h - 1.4}" width="${WIN.w + 2.8}" height="${WIN.h + 2.8}" rx="1" class="win-frame"/><rect x="0" y="${-WIN.h}" width="${WIN.w}" height="${WIN.h}" class="win-glass"/><rect x="0" y="0" width="${WIN.w}" height="0" class="win-fill" data-fill="${name}"/>${Array.from({ length: 11 }, (_, i) => `<path class="win-tick${i % 5 ? "" : " major"}" d="M${WIN.w + 2.6} ${(-i * WIN.h) / 10}H${WIN.w + (i % 5 ? 5 : 7)}"/>`).join("")}${name === "escrow" ? `<path class="win-ceiling" d="M-3 ${-WIN.h}H${WIN.w + 3}"/>` : ""}</g>`);
  if (name === "escrow") out.push(k.faceTextSvg(k.sideMatrix([wx + WIN.w + 2.4, face], WIN.z0 + WIN.h + 4, P, "left"), "MAX 1.00", { size: 2.6, tone: "mid" }));
  // value plate under the window
  const pm = k.sideMatrix([cx - 12, face], COL_Z + 12, P, "left");
  out.push(`<g transform="${pm}"><rect x="0" y="-8" width="24" height="8" rx="0.8" class="plate"/><text x="12" y="-2.3" class="plate-text" text-anchor="middle" data-value="${name}">0.00</text></g>`);
  return out.join("");
}

const back = [duct("back", -94, -14, "release"), duct("back", 14, 94, "refund"), stub(COLS.agent, "back"), stub(COLS.escrow, "back"), stub(COLS.seller, "back"), duct("back", -14, 14, "through"), valve("release"), valve("refund")];
const cols = Object.entries(COLS).map(([name, cx]) => column(name, cx));
const front = [stub(COLS.agent, "front"), stub(COLS.escrow, "front"), stub(COLS.seller, "front"), duct("front", -94, -14, "authorize"), duct("front", 14, 94, "capture"), valve("authorize"), valve("capture")];

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label: "A flow bench: three graduated columns for the agent, the escrow and the seller, joined by two ducts. Four valves, authorize, capture, release and refund, open one at a time as you scroll, and the levels in the sight windows show the 1.00 hold moving.",
  body: [base(), ...back, ...cols, ...front],
});

const model = {
  win: WIN,
  spokes: Object.fromEntries(Object.entries(VALVES).map(([name, [vx, lane]]) => [name, Array.from({ length: 24 }, (_, i) => spokesAt(vx, LANES[lane], i / 24 / 3))])),
};

writeFileSync(new URL("../components/landing/lifecycleArt.ts", import.meta.url), `// Generated by scripts/lifecycle-figure.mjs. Do not edit.\nexport const LIFE_SVG = ${JSON.stringify(svg)};\nexport const LIFE = ${JSON.stringify(model)} as const;\n`);
console.log(`wrote lifecycleArt.ts (${(svg.length / 1024).toFixed(0)} KB)`);
