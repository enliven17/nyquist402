// Builds the hero figure: an isometric coin escrow bench. Writes components/landing/heroArt.ts.
// Run: node scripts/hero-figure.mjs
// One coin is 0.10. The bench replays the testnet demo: hold 1.00, capture 0.60, release 0.40, refund 0.20.
import { writeFileSync } from "node:fs";
import * as k from "./iso/iso-kit.mjs";

const WIDTH = 720;
const HEIGHT = 470;

const COIN_R = 11;
const COIN_H = 2.2;
const BASE = { x: -140, y: -52, w: 280, d: 134, r: 10 };
const BASE_H = 10;
const FOOT_H = 5;

// Stations sit on one line; the rail runs in front of them.
const ST = {
  agent: { x: -92, y: -10, seat: 12, max: 12, label: "AGENT" },
  vault: { x: 0, y: -10, seat: 13, max: 10, label: "ESCROW" },
  seller: { x: 92, y: -10, seat: 11, max: 6, label: "SELLER" },
};
const PLINTH = (cx) => ({ x: cx - 30, y: -38, w: 60, d: 56, r: 4 });
const RAIL_Y = [42, 60];
const RAIL_X = [-126, 126];
const SLED = { x: -19, y: 38, w: 38, d: 30, r: 3 };
const SLED_TOP = 9;
const SLED_C = [0, 53];
const SLED_MAX = 10;
const CEIL_Z = ST.vault.seat + 10 * COIN_H;
const DIAL = { x: 20, y: 9, r: 8, z: 16, h: 4 };
const LOCK = { x: -17, y: 5, r: 4.5, z: 10, h: 6 };

const P = k.fitProjection(
  [...k.boxCorners(BASE, -BASE_H - FOOT_H, 0), [-92, -10, 58], [0, -10, 62], [92, -10, 58]],
  WIDTH,
  HEIGHT,
  { pad: 18, azimuth: 45 },
);

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const depth = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth(a) - depth(b));

function coin(cx, cy, z, i, hidden) {
  const c = k.cylinder(cx, cy, COIN_R, z, COIN_H, P, 28, 0.5);
  const seam = L(k.sideArc(cx, cy, COIN_R, z + COIN_H / 2, P, 28), { tone: "faint" });
  return `<g class="coin" data-i="${i}"${hidden ? ' style="display:none"' : ""}>${S(c, { tone: "hi", crease: "lo", inner: seam })}${L(k.ring(cx, cy, COIN_R - 2.4, z + COIN_H, P, 32), { tone: "faint" })}</g>`;
}
// Every stack is built full; the page shows the first `shown` coins. The rest pose is drawn on the server.
const stack = (cx, cy, z, n, part, shown = n) => `<g data-part="${part}">${Array.from({ length: n }, (_, i) => coin(cx, cy, z + i * COIN_H, i, i >= shown)).join("")}</g>`;

function base() {
  const out = [`<path class="iso-halo" d="${k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(BASE, 22))) {
    out.push(S(k.cylinder(x, y, 8, -BASE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6.2, -BASE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.4), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(BASE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(BASE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.55 }));
  // front ruler: one major tick per coin column spacing
  const strip = { x: -126, y: 70, w: 150, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 4, 5, strip.y + 0.8, 0.6, [2, 3.8], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(D([at([strip.x + 2, strip.y + 3.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 3.5, 0.6])], { size: 0.45 }));
  // label plate
  const plate = { x: 40, y: 66, w: 82, d: 12, r: 1.5 };
  out.push(S(k.slabOf(plate, 0, 0.8, P, 3, 0.3), { tone: "mid", crease: "none" }));
  out.push(k.faceTextSvg(k.topMatrix([plate.x + 5, plate.y + 7.6], 0.8, P, "x"), "X402 AUTH-CAPTURE", { size: 4.2, tone: "mid" }));
  out.push(D([at([plate.x + 2.2, plate.y + 6, 0.8]), at([plate.x + plate.w - 2.2, plate.y + 6, 0.8])], { size: 0.45 }));
  // dock plates from each plinth to the rail
  for (const s of Object.values(ST)) {
    const dock = { x: s.x - 12, y: 18, w: 24, d: 22, r: 1.5 };
    out.push(S(k.slabOf(dock, 0, 0.8, P, 3), { tone: "lo", crease: "none" }));
    for (const y of [23, 29, 35]) out.push(L(k.onTop([[s.x - 6, y], [s.x, y + 3], [s.x + 6, y]], 0.8, P), { tone: "mid" }));
  }
  return out.join("");
}

function plinth(cx, h) {
  const plan = PLINTH(cx);
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(plan, 3), 0, h, P)}" style="filter:blur(5px)"/>`];
  out.push(S(k.slabOf(plan, 0, h, P, 6, 0.8), { tone: "mid", inner: L(k.sideSeam(plan, 3, P, 6), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(plan, 3.5), h, P, 6), { tone: "faint" }));
  out.push(D(k.corners(plan, 4).map(([x, y]) => at([x, y, h])), { size: 0.45 }));
  return out.join("");
}

function post(x, y, z0, z1) {
  return S(k.cylinder(x, y, 1.8, z0, z1 - z0, P, 16), { tone: "mid", crease: "none" }) + S(k.cylinder(x, y, 2.6, z1, 2, P, 18), { tone: "mid" });
}

// A coin tube: back post, stack, slot for coins landing in it, front posts.
function tube(s, part, plinthH, n) {
  const posts = [225, 105, 345].map((a) => [s.x + 14.5 * Math.cos((a * Math.PI) / 180), s.y + 14.5 * Math.sin((a * Math.PI) / 180)]);
  const top = s.seat + s.max * COIN_H + 5;
  const [back, ...front] = byDepth(posts);
  return {
    back: plinth(s.x, plinthH) + S(k.cylinder(s.x, s.y, 15, plinthH, s.seat - plinthH, P, 40, 0.6), { tone: "mid", crease: "lo" }) + post(back[0], back[1], s.seat, top),
    stack: stack(s.x, s.y, s.seat, n, part),
    front: front.map(([x, y]) => post(x, y, s.seat, top)).join(""),
  };
}

function agent() {
  const s = ST.agent;
  const t = tube(s, "agent", 8, s.max);
  const label = k.faceTextSvg(k.topMatrix([s.x - 24, 13], 8, P, "x"), s.label, { size: 3.6, tone: "mid" });
  return { back: t.back + label, stack: t.stack, front: t.front };
}

function seller() {
  const s = ST.seller;
  const plan = PLINTH(s.x);
  const back = plinth(s.x, 7) + S(k.cylinder(s.x, s.y, 17, 7, 4, P, 44, 0.6), { tone: "mid", crease: "lo" }) + L(k.ring(s.x, s.y, 14.5, 11, P, 40), { tone: "faint" });
  const guide = [s.x - 12, s.y - 14];
  const label = k.faceTextSvg(k.topMatrix([plan.x + 6, 13], 7, P, "x"), s.label, { size: 3.6, tone: "mid" });
  return { back: back + post(guide[0], guide[1], 11, 30) + label, stack: stack(s.x, s.y, s.seat, s.max, "seller", 0), front: "" };
}

function vault() {
  const s = ST.vault;
  const h = 10;
  const out = [plinth(s.x, h)];
  out.push(S(k.cylinder(s.x, s.y, 15, h, s.seat - h, P, 40, 0.6), { tone: "mid", crease: "lo" }));
  // height ruler: one tick per coin, a major tick every 5, on the face toward the viewer
  const ruler = { x: -27, y: -14, w: 6, d: 8, r: 0.8 };
  const rTop = CEIL_Z + 10;
  out.push(S(k.slabOf(ruler, h, rTop - h, P, 2, 0.4), { tone: "mid" }));
  const face = ruler.x + ruler.w;
  const minor = [], major = [];
  for (let i = 0; i <= 10; i++) {
    const z = s.seat + i * COIN_H;
    (i % 5 ? minor : major).push(k.segment([face, ruler.y + ruler.d, z], [face, ruler.y + ruler.d - (i % 5 ? 2.4 : 4.4), z], P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  out.push(k.faceTextSvg(k.sideMatrix([face, ruler.y + ruler.d - 0.8], CEIL_Z + 4.6, P, "right"), "1.00", { size: 2.3, tone: "mid" }));
  return { back: out.join(""), stack: stack(s.x, s.y, s.seat, s.max, "vault", 0) };
}

// The ceiling: a blue bar at max_amount over the vault column, carried by the ruler.
function ceiling() {
  const bar = { x: -21, y: -12.5, w: 36, d: 4, r: 1 };
  return `<g class="ceil">${S(k.slabOf(bar, CEIL_Z + 0.6, 2, P, 2, 0.3), { tone: "hi", crease: "lo" })}</g>` + D([at([bar.x + bar.w - 2, bar.y + 2, CEIL_Z + 2.6])], { size: 0.5 });
}

function vaultFront() {
  const out = [];
  // consent lock: a knurled key cylinder; its slot turns when the seller signs
  out.push(S(k.cylinder(LOCK.x, LOCK.y, LOCK.r + 1.4, 10, 1.2, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(LOCK.x, LOCK.y, LOCK.r, LOCK.z + 1.2, LOCK.h - 1.2, P, 28), { tone: "mid" }));
  out.push(L(k.knurl(LOCK.x, LOCK.y, LOCK.r, LOCK.z + 1.6, LOCK.z + LOCK.h - 0.6, 28, P), { tone: "lo" }));
  // dial: reads what the vault holds, 0 to 1.00 over 270°
  const block = { x: DIAL.x - 7, y: DIAL.y - 7, w: 14, d: 14, r: 1.5 };
  out.push(S(k.slabOf(block, 10, DIAL.z - 10, P, 3, 0.5), { tone: "mid" }));
  out.push(S(k.cylinder(DIAL.x, DIAL.y, DIAL.r, DIAL.z, DIAL.h, P, 48, 0.6), { tone: "hi", crease: "lo" }));
  const top = DIAL.z + DIAL.h;
  out.push(L(k.ring(DIAL.x, DIAL.y, DIAL.r - 1.4, top, P, 48), { tone: "lo" }));
  const ticks = k.radialTicks(DIAL.x, DIAL.y, DIAL.r - 1.8, 20, 5, top, [0.9, 2], P, -0.75 * Math.PI, 1.5 * Math.PI);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(L(k.ring(DIAL.x, DIAL.y, 1, top, P, 12), { tone: "mid" }));
  out.push(k.faceTextSvg(k.topMatrix([-27, 16.2], 10, P, "x"), "CONSENT", { size: 2.6, tone: "lo" }));
  return out.join("");
}

const needleAt = (share) => {
  const a = -0.75 * Math.PI + share * 1.5 * Math.PI;
  const top = DIAL.z + DIAL.h + 0.2;
  return k.lineOnTop([DIAL.x - Math.sin(a) * 2, DIAL.y + Math.cos(a) * 2], [DIAL.x + Math.sin(a) * (DIAL.r - 2.4), DIAL.y - Math.cos(a) * (DIAL.r - 2.4)], top, P);
};
const slotAt = (turn) => {
  const a = turn * Math.PI;
  const top = LOCK.z + LOCK.h;
  return k.lineOnTop([LOCK.x - Math.cos(a) * 2.8, LOCK.y - Math.sin(a) * 2.8], [LOCK.x + Math.cos(a) * 2.8, LOCK.y + Math.sin(a) * 2.8], top, P);
};

function rails() {
  const out = [];
  for (const y of RAIL_Y) {
    out.push(S(k.slabOf({ x: RAIL_X[0], y, w: RAIL_X[1] - RAIL_X[0], d: 4, r: 1 }, 0, 3, P, 3, 0.4), { tone: "mid" }));
    out.push(D([RAIL_X[0] + 8, -46, 46, RAIL_X[1] - 8].map((x) => at([x, y + 2, 3])), { size: 0.4 }));
  }
  return out.join("");
}

function stops() {
  return [RAIL_X[0] - 6, RAIL_X[1]].map((x) => S(k.slabOf({ x, y: RAIL_Y[0] - 3, w: 6, d: RAIL_Y[1] - RAIL_Y[0] + 10, r: 1.2 }, 0, 8, P, 3, 0.5), { tone: "mid" }) + D([at([x + 3, RAIL_Y[0] + 1, 8]), at([x + 3, RAIL_Y[1] + 3, 8])], { size: 0.45 })).join("");
}

function sled() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(SLED, 2), 3, 0.1, P)}" style="filter:blur(4px)"/>`];
  for (const x of [SLED.x + 5, SLED.x + SLED.w - 9]) for (const y of RAIL_Y) out.push(S(k.slabOf({ x, y: y - 1, w: 4, d: 6, r: 1 }, 3, 1.6, P, 2), { tone: "lo", crease: "none" }));
  out.push(S(k.slabOf(SLED, 4.4, SLED_TOP - 4.4, P, 5, 0.6), { tone: "mid", inner: L(k.sideSeam(SLED, 6.4, P, 5), { tone: "faint" }) }));
  out.push(L(k.ring(SLED_C[0], SLED_C[1], COIN_R + 1.6, SLED_TOP, P, 36), { tone: "lo" }));
  out.push(D(k.corners(SLED, 3.2).map(([x, y]) => at([x, y, SLED_TOP])), { size: 0.4 }));
  const knob = [SLED.x + SLED.w - 6, SLED.y + SLED.d + 3];
  out.push(S(k.slabOf({ x: knob[0] - 1.6, y: SLED.y + SLED.d - 1, w: 3.2, d: 3.4, r: 0.8 }, 5, 3, P, 2), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(knob[0], knob[1] + 0.6, 3, 4.4, 5, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(knob[0], knob[1] + 0.6, 3, 4.6, 9.2, 16, P), { tone: "lo" }));
  return out.join("") + stack(SLED_C[0], SLED_C[1], SLED_TOP, SLED_MAX, "carry", 0);
}

const A = agent(), V = vault(), Sl = seller();
const body = [
  base(),
  A.back, A.stack, `<g data-slot="agent"></g>`, A.front,
  V.back, V.stack, `<g data-slot="vault"></g>`, ceiling(), vaultFront(),
  `<path data-part="needle" class="iso-line" data-tone="lit" data-free="start" d="${needleAt(0)}" style="stroke-width:1"/>`,
  `<path data-part="slot" class="iso-line" data-tone="hi" d="${slotAt(0)}" style="stroke-width:1"/>`,
  Sl.back, Sl.stack, `<g data-slot="seller"></g>`,
  rails(), stops(),
  `<g data-part="sled">${sled()}</g>`,
  `<g data-slot="top">${stack(0, 0, 0, SLED_MAX, "fly", 0)}</g>`,
];

const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "An escrow bench. A sled on a rail carries coins between three stations: the agent's coin tube, the escrow vault with a height ruler and a blue ceiling bar at 1.00, and the seller's tray. The agent holds 1.00 in the vault, the seller captures 0.60, 0.40 returns to the agent, and the seller later refunds 0.20.",
  body,
});

const vec = (v) => k.axisVector(P, v).map((n) => Math.round(n * 10000) / 10000);
const model = {
  ex: vec([1, 0, 0]),
  ey: vec([0, 1, 0]),
  ez: vec([0, 0, 1]),
  coinH: COIN_H,
  sled: { c: SLED_C, top: SLED_TOP },
  stations: Object.fromEntries(Object.entries(ST).map(([key, s]) => [key, { x: s.x, y: s.y, seat: s.seat, max: s.max }])),
  needles: Array.from({ length: 61 }, (_, i) => needleAt(i / 60)),
  slots: Array.from({ length: 13 }, (_, i) => slotAt(i / 12)),
};

writeFileSync(
  new URL("../components/landing/heroArt.ts", import.meta.url),
  `// Generated by scripts/hero-figure.mjs. Do not edit.\nexport const HERO_SVG = ${JSON.stringify(svg)};\nexport const HERO = ${JSON.stringify(model)} as const;\n`,
);
console.log(`wrote heroArt.ts (${(svg.length / 1024).toFixed(0)} KB)`);
