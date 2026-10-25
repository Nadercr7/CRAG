// Static art of the inspection line, drawn with the anatomy kit at build time.
// Returns depth-keyed items; the live runtime adds the moving things (slips, strips, cards, tools).
import * as k from "../vendor/iso-kit.mjs";
import * as G from "../vendor/lathe.mjs";
import * as Z from "./layout.mjs";

const { P } = Z;
const at = (p) => k.iso(p, P);
const depth = (x, y, z) => k.depthOf([x, y, z], P);
const fix = (n) => Math.round(n * 10) / 10;

let parts = 0;
const S = (paths, style) => {
  parts++;
  return k.solidSvg(paths, style);
};
const Ln = (d, style) => (d ? k.lineSvg(d, style) : "");
const Dt = (pts, style) => k.dotsSvg(pts, style);
const box = (plan, z0, z1, o = {}) =>
  S(k.slabOf(plan, z0, z1 - z0, P, o.steps ?? 3, o.bevel ?? 0.5), { tone: o.tone ?? "mid", crease: o.crease, inner: o.inner, className: o.className, lit: o.lit, halo: o.halo });
const post = (x, y, r, z0, z1, o = {}) => S(k.cylinder(x, y, r, z0, z1 - z0, P, o.steps ?? 20, o.bevel ?? 0), { tone: o.tone ?? "mid", crease: o.crease ?? "faint", className: o.className });
const screws = (pts, z, o = {}) => Dt(pts.map(([x, y]) => at([x, y, z])), { size: o.size ?? 0.45, tone: o.tone ?? "mid" });
const screwsFront = (pts, y) => Dt(pts.map(([x, z]) => at([x, y, z])), { size: 0.45, tone: "mid" });
const plane = (y) => k.sideMatrix([0, y], 0, P, "left"); // local (x, -z) on the face at depth y
const rightPlane = (x) => k.sideMatrix([0, x], 0, P, "right"); // unused helper kept for clarity
const frontPoly = (pts, y) => k.pathOf(pts.map(([x, z]) => at([x, y, z])), true);

const ctx = { th: null, topN: 8 };
const items = [];
const put = (id, key, svg, extra = {}) => items.push({ id, key, svg, ...extra });

let clipN = 0;
// A window cut into a face (normal +y) at depth y: recess walls, a glass back plane, content clipped to the opening.
function recess({ x0, x1, z0, z1, r = 2.2, depth = 2.6 }, y, content = "", glass = "vrm-glass") {
  const id = `__ID__c${clipN++}`;
  const ring = k.roundedPlan({ x: x0, y: z0, w: x1 - x0, d: z1 - z0, r }, 5);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const { sinA } = k.cameraOf(P);
  const tops = [];
  const sides = [[], [], [], []];
  ring.forEach(([ax, az], index) => {
    const [bx, bz] = ring[(index + 1) % ring.length];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    let [nx, nz] = [(bz - az) / length, -(bx - ax) / length];
    if (nx * (cx - (ax + bx) / 2) + nz * (cz - (az + bz) / 2) < 0) [nx, nz] = [-nx, -nz];
    if (nx <= 0 && nz <= 0) return;
    const quad = k.pathOf([at([ax, y, az]), at([bx, y, bz]), at([bx, y - depth, bz]), at([ax, y - depth, az])], true);
    if (nz >= nx) tops.push(quad);
    else sides[Math.min(3, Math.max(0, Math.floor(((nx * -sinA + 1) / 2) * 4)))].push(quad);
  });
  const shape = k.pathOf(k.roundedPlan({ x: x0, y: -z1, w: x1 - x0, d: z1 - z0, r }, 5), true);
  return [
    `<clipPath id="${id}"><path transform="${plane(y)}" d="${shape}"/></clipPath>`,
    `<g clip-path="url(#${id})">`,
    `<path class="iso-top" d="${tops.join("")}"/>`,
    ...sides.map((d, shade) => (d.length ? `<path class="iso-shade" data-shade="${shade}" d="${d.join("")}"/>` : "")),
    `<g transform="${plane(y - depth)}"><path class="${glass}" d="${shape}"/>${content}</g>`,
    `</g>`,
    `<g transform="${plane(y)}"><path class="iso-line" data-tone="lo" d="${shape}"/></g>`,
  ].join("");
}

// ---------------------------------------------------------------- table and base
function table() {
  const T = Z.TABLE;
  const out = [`<path class="iso-halo" d="${k.haloOf(T, -26, 26, P)}"/>`];
  const feet = [];
  for (const [x, y] of k.corners(T, 24)) feet.push([x, y]);
  feet.push([T.x + T.w / 2, T.y + 24], [T.x + T.w / 2, T.y + T.d - 24]);
  feet.sort((a, b) => depth(a[0], a[1], 0) - depth(b[0], b[1], 0));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 9, -26, 2, P, 24), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 7, -24, 8, P, 24), { tone: "mid" }));
  }
  out.push(box(k.insetPlan(T, 8), -16, -10, { tone: "lo", bevel: 0 }));
  out.push(S(k.slabOf(T, -10, 10, P, 8, 1.4), { tone: "mid", inner: Ln(k.sideSeam(T, -5, P, 8), { tone: "faint" }) }));
  out.push(Ln(k.planOutline(k.insetPlan(T, 5), 0, P), { tone: "lo" }));
  const sc = k.corners(T, 11);
  out.push(Ln(sc.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 14)).join(""), { tone: "lo" }), screws(sc, 0, { size: 0.5 }));
  // ruler strip along the front edge
  const strip = { x: T.x + 22, y: T.y + T.d - 17, w: T.w - 44, d: 7, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 4, strip.x + strip.w - 4, 5, 5, strip.y + 0.8, 0.6, [2, 3.6], P);
  out.push(Ln(t.minor, { tone: "lo" }), Ln(t.major, { tone: "mid" }));
  out.push(screws([[strip.x + 2, strip.y + 3.5], [strip.x + strip.w - 2, strip.y + 3.5]], 0.6, { size: 0.45 }));
  return out.join("");
}

// ---------------------------------------------------------------- belt
function belt() {
  const B = Z.BELT;
  const out = [];
  const top = Z.BELT_TOP;
  // side guide rails (the front one has a gap where the sweeper pushes rejects off the belt)
  const gap = [Z.BIN.x - 4, Z.BIN.x + Z.BIN.w + 4];
  const rail = (y, x0, x1) => box({ x: x0, y, w: x1 - x0, d: 3.6, r: 1 }, 0, top + 4.5, { tone: "mid", bevel: 0.35 });
  out.push(rail(B.y - 3.6, B.x + 4, B.x + B.w - 4));
  const g2 = [Z.DROP.x - 17, Z.DROP.x + 17];
  out.push(rail(B.y + B.d, B.x + 4, g2[0]));
  out.push(rail(B.y + B.d, g2[1], gap[0]));
  out.push(rail(B.y + B.d, gap[1], B.x + B.w - 4));
  // belt body, rollers at the ends, support brackets
  out.push(S(k.slabOf(B, 0, top, P, 8, 0.6), { tone: "lo", crease: "faint" }));
  const id = `__ID__belt`;
  const ring = k.ringOf(B, 8);
  out.push(`<clipPath id="${id}"><path d="${k.pathOf(ring.map(([x, y]) => at([x, y, top])), true)}"/></clipPath>`);
  let ribs = "";
  for (let x = B.x + 12; x < B.x + B.w - 6; x += 11) ribs += k.lineOnTop([x, B.y], [x, B.y + B.d], top, P);
  out.push(`<g clip-path="url(#${id})">${Ln(ribs, { tone: "faint" })}</g>`);
  out.push(Ln(k.planOutline(k.insetPlan(B, 3), top, P, 8), { tone: "faint" }));
  for (const x of [B.x + B.w - 9]) {
    out.push(S(k.cylinder(x, B.y + B.d / 2, B.d / 2 - 1.4, top - 0.2, 0.6, P, 28), { tone: "mid", crease: "faint" }));
    out.push(Ln(k.ring(x, B.y + B.d / 2, 3.2, top + 0.4, P, 16), { tone: "mid" }));
  }
  // stands under the belt
  for (let x = B.x + 40; x < B.x + B.w - 20; x += 128) {
    out.push(box({ x, y: B.y + 6, w: 7, d: B.d - 12, r: 1 }, -0.5, 0, { tone: "lo", bevel: 0 }));
  }
  // end stop and the tray where the answer card rests
  const endX = B.x + B.w - 14;
  out.push(box({ x: endX, y: B.y - 2, w: 6, d: B.d + 4, r: 1.2 }, top, top + 13, { tone: "mid", bevel: 0.4 }));
  out.push(screws([[endX + 3, B.y + 4], [endX + 3, B.y + B.d - 4]], top + 13));
  const tray = { x: Z.STATIONS[4].toolX - 27, y: B.y + 3, w: 54, d: B.d - 6, r: 2 };
  out.push(S(k.slabOf(tray, top, 0.9, P, 4), { tone: "lo", crease: "none" }));
  out.push(Ln(k.planOutline(k.insetPlan(tray, 2), top + 0.9, P, 4), { tone: "faint" }));
  // brackets holding the belt to the table
  return out.join("");
}

// ---------------------------------------------------------------- the wall cabinets
const WINDOWS = {}; // window rectangles by station id, for the live code

function cabinetShell(st) {
  const { x0 } = st;
  const plan = { x: x0, y: Z.CAB_Y, w: Z.CAB_W, d: Z.CAB_FRONT - Z.CAB_Y, r: 3 };
  const out = [`<path class="iso-halo" d="${k.haloOf(plan, 0, 8, P)}"/>`];
  out.push(box(k.insetPlan(plan, 3), 0, 8, { tone: "lo", bevel: 0 }));
  out.push(S(k.slabOf(plan, 8, Z.CAB_TOP - 12 - 8, P, 3, 1), { tone: "mid", inner: Ln(k.sideSeam(plan, 52, P, 3), { tone: "faint" }) }));
  const cap = { x: x0 - 1.5, y: Z.CAB_Y - 1.5, w: Z.CAB_W + 3, d: Z.CAB_FRONT - Z.CAB_Y + 3, r: 3.4 };
  out.push(S(k.slabOf(cap, Z.CAB_TOP - 12, 12, P, 3, 1), { tone: "mid" }));
  out.push(Ln(k.planOutline(k.insetPlan(cap, 3), Z.CAB_TOP, P, 3), { tone: "faint" }));
  const roofScrews = k.corners(cap, 6);
  out.push(Ln(roofScrews.map(([x, y]) => k.ring(x, y, 1.6, Z.CAB_TOP, P, 12)).join(""), { tone: "lo" }), screws(roofScrews, Z.CAB_TOP, { size: 0.4 }));
  // vents: closed slots in the right face (normal +x)
  const vx = x0 + Z.CAB_W;
  let vents = "";
  for (let i = 0; i < 6; i++) {
    const y0 = Z.CAB_Y + 14 + i * 7.5;
    vents += k.pathOf([at([vx, y0, 22]), at([vx, y0 + 3.4, 22]), at([vx, y0 + 3.4, 70]), at([vx, y0, 70])], true);
  }
  out.push(Ln(vents, { tone: "lo" }));
  return out.join("");
}

function plate(st, number, key) {
  // header plate above the window: number badge and title (text set live), engraved
  const x0 = st.x0 + Z.WIN.dx;
  const z0 = 96;
  const z1 = 107;
  const y = Z.CAB_FRONT;
  const out = [];
  out.push(S(k.slabOf({ x: x0, y, w: Z.WIN.w, d: 0.9, r: 0.5 }, z0, z1 - z0, P, 2), { tone: "lo", crease: "none" }));
  out.push(`<g transform="${plane(y + 0.9)}">`);
  out.push(`<circle class="vrm-badge" data-ref="badge-${number}" cx="${x0 + 6}" cy="${-(z0 + z1) / 2}" r="4.4"/>`);
  out.push(`<text class="vrm-badge-n" x="${x0 + 6}" y="${-(z0 + z1) / 2 + 2.3}" text-anchor="middle" font-size="6.4">${number}</text>`);
  out.push(`<text class="vrm-plate" data-ref="plate-${key}" x="${x0 + 13}" y="${-(z0 + z1) / 2 + 2.6}" font-size="7.4"></text>`);
  out.push(`</g>`);
  return out.join("");
}

function windowRect(st, dx = Z.WIN.dx, w = Z.WIN.w, z0 = Z.WIN.z0, z1 = Z.WIN.z1) {
  return { x0: st.x0 + dx, x1: st.x0 + dx + w, z0, z1 };
}

const LOW = { z0: 12, z1: 30 }; // lower display strip on each cabinet

// ---- window contents, in window-local coordinates (u right, v down), wrapped to world coordinates
const wrap = (rect, inner) => `<g transform="translate(${rect.x0} ${-rect.z1})">${inner}</g>`;
const arcPath = (cx, cy, r, v0, v1, sweep = 270, start = -135) => {
  // arc from value v0 to v1 on a dial that sweeps `sweep` degrees from `start` (0 = up, clockwise)
  const pts = [];
  const n = Math.max(2, Math.ceil(Math.abs(v1 - v0) * 40));
  for (let i = 0; i <= n; i++) {
    const v = v0 + ((v1 - v0) * i) / n;
    const a = ((start + sweep * v) * Math.PI) / 180;
    pts.push(`${fix(cx + r * Math.sin(a))} ${fix(cy - r * Math.cos(a))}`);
  }
  return "M" + pts.join("L");
};
const dialTicks = (cx, cy, r, count, every, lens, sweep, start) => {
  let minor = "";
  let major = "";
  for (let i = 0; i <= count; i++) {
    const v = i / count;
    const a = ((start + sweep * v) * Math.PI) / 180;
    const l = i % every === 0 ? lens[1] : lens[0];
    const seg = `M${fix(cx + (r - l) * Math.sin(a))} ${fix(cy - (r - l) * Math.cos(a))}L${fix(cx + r * Math.sin(a))} ${fix(cy - r * Math.cos(a))}`;
    if (i % every === 0) major += seg;
    else minor += seg;
  }
  return { minor, major };
};
const L2 = (d, tone = "lo", extra = "") => `<path class="iso-line" data-tone="${tone}" d="${d}"${extra}/>`;

function contentFeeder(rect) {
  const h = rect.z1 - rect.z0;
  const w = rect.x1 - rect.x0;
  let s = "";
  // question card icon (left) and paragraph counter (right)
  s += `<g data-ref="feed-card" transform="translate(9 ${h / 2 - 11})"><rect class="vrm-card" x="0" y="0" width="26" height="22" rx="1.6"/><rect class="vrm-card-tab" x="0" y="0" width="26" height="4" rx="1.6"/>`;
  s += `<text class="vrm-glyph" x="13" y="17.2" text-anchor="middle" font-size="14">?</text></g>`;
  s += L2(`M40 ${h / 2}H52`, "mid") + L2(`M49 ${h / 2 - 3}L52.4 ${h / 2}L49 ${h / 2 + 3}`, "mid");
  s += `<text class="vrm-digits" data-ref="feed-count" x="${w - 7}" y="${h / 2 + 3.8}" text-anchor="end" font-size="15">--</text>`;
  s += `<text class="vrm-cap" data-ref="feed-cap" x="${w - 7}" y="${h - 3}" text-anchor="end" font-size="5.6"></text>`;
  return wrap(rect, s);
}

function contentGauge(rect) {
  const cx = 38;
  const cy = 30;
  const r = 20;
  const sweep = 270;
  const start = -135;
  let s = "";
  // state zones on the rim: Incorrect / Ambiguous / Correct
  const th = ctx.th;
  s += `<path class="vrm-zone vrm-z-reject" d="${arcPath(cx, cy, r + 3.4, 0, th.tau_lo, sweep, start)}"/>`;
  s += `<path class="vrm-zone vrm-z-hold" d="${arcPath(cx, cy, r + 3.4, th.tau_lo, th.tau_hi, sweep, start)}"/>`;
  s += `<path class="vrm-zone vrm-z-pass" d="${arcPath(cx, cy, r + 3.4, th.tau_hi, 1, sweep, start)}"/>`;
  s += `<circle class="vrm-face" cx="${cx}" cy="${cy}" r="${r + 1.4}"/>`;
  const t = dialTicks(cx, cy, r, 50, 5, [1.6, 3.6], sweep, start);
  s += L2(t.minor, "lo") + L2(t.major, "mid");
  const lab = (v, text) => {
    const a = ((start + sweep * v) * Math.PI) / 180;
    return `<text class="vrm-cap" x="${fix(cx + (r - 7) * Math.sin(a))}" y="${fix(cy - (r - 7) * Math.cos(a) + 2)}" text-anchor="middle" font-size="5.2">${text}</text>`;
  };
  s += lab(0, "0") + lab(0.5, "0.5") + lab(1, "1");
  s += `<g data-ref="g-needle" transform="translate(${cx} ${cy}) rotate(${start})"><path class="vrm-needle" d="M0 4.5L0 -${r - 2.6}"/></g>`;
  s += `<circle class="vrm-hub" cx="${cx}" cy="${cy}" r="2.1"/>`;
  s += `<text class="vrm-digits" data-ref="g-read" x="${cx}" y="${cy + 21}" text-anchor="middle" font-size="8.6">0.000</text>`;
  return wrap(rect, s);
}

function contentGate(rect) {
  const th = ctx.th;
  const u0 = 7;
  const u1 = 69;
  const bw = u1 - u0;
  const ux = (v) => fix(u0 + bw * v);
  let s = "";
  s += `<rect class="vrm-zone vrm-z-reject" x="${u0}" y="9" width="${fix(bw * th.tau_lo)}" height="6"/>`;
  s += `<rect class="vrm-zone vrm-z-hold" x="${ux(th.tau_lo)}" y="9" width="${fix(bw * (th.tau_hi - th.tau_lo))}" height="6"/>`;
  s += `<rect class="vrm-zone vrm-z-pass" x="${ux(th.tau_hi)}" y="9" width="${fix(bw * (1 - th.tau_hi))}" height="6"/>`;
  s += L2(`M${u0} 9H${u1}V15H${u0}Z`, "mid");
  for (const [v, txt] of [[th.tau_lo, th.tau_lo.toFixed(2)], [th.tau_hi, th.tau_hi.toFixed(2)]]) {
    s += L2(`M${ux(v)} 6.5V17.5`, "hi");
    s += `<text class="vrm-cap" x="${ux(v)}" y="25.4" text-anchor="middle" font-size="5.8">${txt}</text>`;
  }
  s += L2(`M${u0} 15V19`, "lo") + L2(`M${u1} 15V19`, "lo");
  s += `<text class="vrm-cap" x="${u0}" y="23" text-anchor="middle" font-size="5">0</text><text class="vrm-cap" x="${u1}" y="23" text-anchor="middle" font-size="5">1</text>`;
  s += `<g data-ref="t-marker" transform="translate(${u0} 0)"><path class="vrm-marker" d="M0 15.6L-3.2 21.6H3.2Z"/></g>`;
  // three lamps
  const lamps = [
    { id: "pass", u: 13, glyph: "M-3 0.2L-0.9 2.6L3.2 -2.6" },
    { id: "hold", u: 38, glyph: "M-3 1.4A3.3 3.3 0 1 0 -1.6 -2.2M-3.6 -2.6L-1.2 -2.7L-1.6 -0.3" },
    { id: "reject", u: 63, glyph: "M-2.6 -2.6L2.6 2.6M2.6 -2.6L-2.6 2.6" },
  ];
  for (const l of lamps) {
    s += `<g data-ref="t-lamp-${l.id}" class="vrm-lamp vrm-lamp-${l.id}" transform="translate(${l.u} 41)">`;
    s += `<circle class="vrm-lamp-glow" r="9.6"/><circle class="vrm-lamp-lens" r="6.6"/><path class="vrm-lamp-glyph" d="${l.glyph}"/></g>`;
    s += `<text class="vrm-cap vrm-lamp-word" data-ref="t-word-${l.id}" x="${l.u}" y="55.6" text-anchor="middle" font-size="4.7"></text>`;
  }
  return wrap(rect, s);
}

function contentPress(rect) {
  // rows are created live from the trace; keep the frame and the tau_keep tick here
  const th = ctx.th;
  let s = "";
  s += `<g data-ref="p-rows"></g>`;
  s += `<path class="iso-line" data-tone="lo" d="M${fix(12 + 58 * th.tau_keep)} 2V56" stroke-dasharray="1.2 1.6"/>`;
  return wrap(rect, s);
}

function contentCounter(rect) {
  const h = rect.z1 - rect.z0;
  let s = "";
  s += `<text class="vrm-cap" data-ref="c-cap" x="5" y="5.2" font-size="4.8"></text>`;
  s += `<text class="vrm-digits vrm-dim" data-ref="c-a" x="22" y="${h - 3}" text-anchor="end" font-size="10">0</text>`;
  s += `<path class="vrm-strike" d="M5 ${h - 6.2}H23"/>`;
  s += L2(`M27 ${h - 6}H36M33.4 ${h - 8.6}L36.4 ${h - 6}L33.4 ${h - 3.4}`, "hi");
  s += `<text class="vrm-digits" data-ref="c-f" x="${rect.x1 - rect.x0 - 12}" y="${h - 3}" text-anchor="end" font-size="10.5">0</text>`;
  return wrap(rect, s);
}

function contentScale(rect) {
  const cx = 38;
  const cy = 41;
  const r = 25;
  const th = ctx.th;
  const sweep = 180;
  const start = -90;
  let s = "";
  s += `<path class="vrm-zone vrm-z-abstain" d="${arcPath(cx, cy, r + 3, 0, th.tau_abstain, sweep, start)}"/>`;
  s += `<path class="vrm-zone vrm-z-pass" d="${arcPath(cx, cy, r + 3, th.tau_abstain, 1, sweep, start)}"/>`;
  s += `<path class="vrm-face" d="${arcPath(cx, cy, r + 1.2, 0, 1, sweep, start)}Z"/>`;
  const t = dialTicks(cx, cy, r, 40, 4, [1.8, 3.8], sweep, start);
  s += L2(t.minor, "lo") + L2(t.major, "mid");
  const a = ((start + sweep * th.tau_abstain) * Math.PI) / 180;
  s += `<path class="vrm-redline" d="M${fix(cx + 6 * Math.sin(a))} ${fix(cy - 6 * Math.cos(a))}L${fix(cx + (r + 4.6) * Math.sin(a))} ${fix(cy - (r + 4.6) * Math.cos(a))}"/>`;
  s += `<text class="vrm-cap vrm-line-lab" x="${fix(cx + (r + 5.2) * Math.sin(a)) - 0.5}" y="${fix(cy - (r + 5.2) * Math.cos(a)) - 0.2}" text-anchor="end" font-size="5">${th.tau_abstain.toFixed(2)}</text>`;
  s += `<g data-ref="s-needle" transform="translate(${cx} ${cy}) rotate(${start})"><path class="vrm-needle" d="M0 3.4L0 -${r - 2}"/></g>`;
  s += `<circle class="vrm-hub" cx="${cx}" cy="${cy}" r="2.4"/>`;
  s += `<text class="vrm-digits" data-ref="s-read" x="${cx}" y="9.6" text-anchor="middle" font-size="8">0.000</text>`;
  s += `<text class="vrm-cap" data-ref="s-lo" x="4" y="53.4" font-size="5.2"></text><text class="vrm-cap" data-ref="s-hi" x="72" y="53.4" text-anchor="end" font-size="5.2"></text>`;
  return wrap(rect, s);
}

function contentOutput(rect) {
  // the stamped card is built live; this is the empty cradle
  let s = `<rect class="vrm-cradle" x="5" y="5" width="66" height="48" rx="2.4"/>`;
  s += `<g data-ref="o-card"></g>`;
  return wrap(rect, s);
}

function contentPips(rect, n, ref) {
  const w = rect.x1 - rect.x0;
  const h = rect.z1 - rect.z0;
  const pw = Math.min(7.6, (w - 14) / n - 1.6);
  let s = `<text class="vrm-cap" data-ref="${ref}-cap" x="5" y="5.2" font-size="4.8"></text>`;
  s += `<g data-ref="${ref}">`;
  for (let i = 0; i < n; i++) s += `<rect class="vrm-pip" data-i="${i}" x="${fix(5 + i * (pw + 1.6))}" y="${h - 9.5}" width="${fix(pw)}" height="6.4" rx="1"/>`;
  s += "</g>";
  return wrap(rect, s);
}

function contentRead(rect, ref, big = 10) {
  const w = rect.x1 - rect.x0;
  const h = rect.z1 - rect.z0;
  return wrap(rect, `<text class="vrm-cap" data-ref="${ref}-cap" x="5" y="5.2" font-size="4.8"></text><text class="vrm-digits" data-ref="${ref}" x="${w - 6}" y="${h - 3}" text-anchor="end" font-size="${big}">--</text>`);
}

function station(st, index) {
  const { x0 } = st;
  const out = [cabinetShell(st)];
  const win = windowRect(st);
  const numberOf = { gauge: 3, gate: 4, press: 5, scale: 6, output: 7 }[st.id];
  out.push(plate(st, numberOf, st.id));
  const content = { gauge: contentGauge, gate: contentGate, press: contentPress, scale: contentScale, output: contentOutput }[st.id](win);
  out.push(recess(win, Z.CAB_FRONT, content));
  WINDOWS[st.id] = win;
  // lower display strip
  const low = windowRect(st, Z.WIN.dx, Z.WIN.w, LOW.z0, LOW.z1);
  const lowContent = {
    gauge: () => contentPips(low, ctx.topN, "g-pips"),
    gate: () => contentRead(low, "t-read", 10),
    press: () => contentCounter(low),
    scale: () => contentRead(low, "s-line", 10),
    output: () => contentRead(low, "o-cite", 9),
  }[st.id]();
  out.push(recess(low, Z.CAB_FRONT, lowContent, "vrm-glass", ));
  // front furniture: screws, a knob pair and a seam line, all rooted on the face
  const kn = G.frameAlong([x0 + 98, Z.CAB_FRONT, 21], [0, 1, 0]);
  out.push(S(G.disc(0, 2, 5.2, kn, P, {}), { tone: "mid", crease: "faint" }));
  out.push(S(G.disc(2, 3.4, 3.6, kn, P, {}), { tone: "hi", crease: "faint" }));
  out.push(Ln(k.pathOf([at([x0 + 98 - 3.6, Z.CAB_FRONT + 3.4, 21]), at([x0 + 98 + 3.6, Z.CAB_FRONT + 3.4, 21])]), { tone: "mid", free: true }));
  const frontScrews = [[x0 + 4, 100], [x0 + Z.CAB_W - 4, 100], [x0 + 4, 12], [x0 + Z.CAB_W - 4, 12], [x0 + 4, 60], [x0 + Z.CAB_W - 4, 60]];
  out.push(screwsFront(frontScrews, Z.CAB_FRONT));
  out.push(Ln(k.pathOf([at([x0 + 3, Z.CAB_FRONT, 33]), at([x0 + Z.CAB_W - 3, Z.CAB_FRONT, 33])]), { tone: "faint" }));
  out.push(Ln(k.pathOf([at([x0 + 3, Z.CAB_FRONT, 95.4]), at([x0 + Z.CAB_W - 3, Z.CAB_FRONT, 95.4])]), { tone: "faint" }));
  put(`cab-${st.id}`, 100 + index, out.join(""));
}

// ---------------------------------------------------------------- arms and tools
function arm(st) {
  const tx = st.toolX;
  const out = [];
  const beam = { x: tx - 8, y: Z.CAB_FRONT - 1, w: 16, d: Z.BELT_Y + 5 - Z.CAB_FRONT + 1, r: 2 };
  out.push(S(k.slabOf(beam, 80, 14, P, 3, 0.6), { tone: "mid" }));
  const col = { x: tx - 5, y: Z.BELT_Y - 5, w: 10, d: 10, r: 1.6 };
  out.push(S(k.slabOf(col, 50, 30, P, 3, 0.5), { tone: "mid" }));
  out.push(Ln(k.sideSeam(col, 66, P, 3), { tone: "faint" }));
  out.push(screws([[tx, Z.CAB_FRONT + 9], [tx, Z.CAB_FRONT + 28]], 94, { size: 0.45 }));
  put(`arm-${st.id}`, 1000 + depth(tx, Z.BELT_Y, 66) - 6, out.join(""));
}

function tools() {
  const st = Object.fromEntries(Z.STATIONS.map((s) => [s.id, s]));
  // probe over the gauge: collar, rod, sprung tip (built at the belt centre, lifted by translate)
  {
    const { toolX: x } = st.gauge;
    const y = Z.BELT_Y;
    const out = [];
    out.push(S(k.cylinder(x, y, 4.4, 41, 8, P, 22, 0.4), { tone: "mid" }));
    out.push(Ln(k.knurl(x, y, 4.4, 41.4, 48.6, 18, P), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 1.9, 24, 17, P, 16), { tone: "hi", crease: "none" }));
    out.push(Ln(k.sideArc(x, y, 1.9, 32, P, 10), { tone: "faint" }));
    out.push(S(k.cylinder(x, y, 3.3, 19.5, 4.5, P, 18), { tone: "hi", lit: true }));
    out.push(S(k.cylinder(x, y, 1.1, 17.6, 1.9, P, 12), { tone: "hi", lit: true }));
    put("tool-gauge", 1000 + depth(x, y, 40) + 1, `<g data-ref="tool-gauge">${out.join("")}</g>`);
  }
  // press: ram on the arm, platen below; the anvil sits in the belt
  {
    const { toolX: x } = st.press;
    const y = Z.BELT_Y;
    const anvil = { x: x - 20, y: y - 14, w: 40, d: 28, r: 2 };
    put("anvil", 1000 + depth(x, y, 8) - 8, S(k.slabOf(anvil, Z.BELT_TOP, 1.8, P, 3, 0.3), { tone: "mid" }) + Ln(k.planOutline(k.insetPlan(anvil, 2.6), Z.BELT_TOP + 1.8, P, 3), { tone: "faint" }));
    const out = [];
    out.push(S(k.cylinder(x, y, 3.2, 40, 11, P, 18), { tone: "hi", crease: "none" }));
    out.push(Ln(k.sideArc(x, y, 3.2, 46, P, 10), { tone: "faint" }));
    const platen = { x: x - 15, y: y - 11, w: 30, d: 22, r: 2 };
    out.push(S(k.slabOf(platen, 30, 8, P, 3, 0.5), { tone: "hi", lit: true }));
    out.push(Ln(k.planOutline(k.insetPlan(platen, 2.4), 38, P, 3), { tone: "faint" }));
    let teeth = "";
    for (let i = 0; i < 5; i++) teeth += k.rise([x - 11 + i * 5.5, y + 11], 30, 38, P);
    out.push(Ln(teeth, { tone: "lo" }));
    put("tool-press", 1000 + depth(x, y, 40) + 1, `<g data-ref="tool-press">${out.join("")}</g>`);
    // sweeper paddle: a plate on a back rail that pushes rejected sentences off the belt
    const sx = Z.BIN.x + Z.BIN.w / 2;
    const sw = [];
    sw.push(S(k.slabOf({ x: sx - 1.8, y: Z.BELT_Y - 17 + 2, w: 3.6, d: 12, r: 1 }, Z.BELT_TOP, 6, P, 2, 0.3), { tone: "hi", lit: true }));
    put("tool-sweep", 1000 + depth(sx, Z.BELT_Y - 8, 8) + 1, `<g data-ref="tool-sweep">${sw.join("")}</g>`);
    // sweeper track on the far side of the belt
    const track = { x: sx - 12, y: Z.BELT.y - 9, w: 24, d: 5, r: 1 };
    put("sweep-track", 1000 + depth(sx, Z.BELT.y - 6, 4) - 3, S(k.slabOf(track, 0, 10, P, 2, 0.4), { tone: "mid" }) + screws([[sx - 7, track.y + 2.5], [sx + 7, track.y + 2.5]], 10));
  }
  // gate: boom barrier across the belt on two posts
  {
    const { toolX: x } = st.gate;
    const y0 = Z.BELT.y - 6;
    const y1 = Z.BELT.y + Z.BELT.d + 4;
    const back = [];
    back.push(box({ x: x - 4, y: y0 - 2, w: 8, d: 8, r: 1.2 }, 0, 40, { tone: "mid", bevel: 0.5 }));
    back.push(Ln(k.sideSeam({ x: x - 4, y: y0 - 2, w: 8, d: 8, r: 1.2 }, 22, P, 3), { tone: "faint" }));
    put("gate-post-back", 1000 + depth(x, y0 + 2, 20), back.join(""));
    const front = [];
    front.push(box({ x: x - 4, y: y1 - 6, w: 8, d: 8, r: 1.2 }, 0, 40, { tone: "mid", bevel: 0.5 }));
    front.push(Ln(k.sideSeam({ x: x - 4, y: y1 - 6, w: 8, d: 8, r: 1.2 }, 22, P, 3), { tone: "faint" }));
    front.push(post(x, y1 - 2, 1.4, 40, 44, { tone: "hi" }));
    put("gate-post-front", 1000 + depth(x, y1 - 2, 20) + 14, front.join(""));
    const bar = [];
    const plan = { x: x - 2.2, y: y0 + 4, w: 4.4, d: y1 - y0 - 8, r: 1.4 };
    bar.push(S(k.slabOf(plan, 0, 4.2, P, 3, 0.4), { tone: "hi", lit: true }));
    // red/white style chevrons as short stripes across the boom (ink only)
    let stripes = "";
    for (let yy = plan.y + 5; yy < plan.y + plan.d - 3; yy += 6.4) stripes += k.lineOnTop([x - 2.2, yy], [x + 2.2, yy + 3], 4.2, P);
    bar.push(Ln(stripes, { tone: "lo" }));
    put("tool-gate", 1000 + depth(x, Z.BELT_Y, 22) + 6, `<g data-ref="tool-gate">${bar.join("")}</g>`);
  }
  // scale: weigh pan with a frame under it
  {
    const { toolX: x } = st.scale;
    const y = Z.BELT_Y;
    const frame = { x: x - 28, y: y - 20, w: 56, d: 40, r: 3 };
    const base = [];
    base.push(S(k.slabOf(frame, Z.BELT_TOP - 0.2, 1.8, P, 4, 0.4), { tone: "mid" }));
    base.push(screws(k.corners(frame, 3.6), Z.BELT_TOP + 1.6, { size: 0.4 }));
    base.push(Ln(k.planOutline(k.insetPlan(frame, 1.4), Z.BELT_TOP + 1.6, P, 4), { tone: "faint" }));
    put("scale-frame", 1000 + depth(x, y, 8) - 8, base.join(""));
    const pan = { x: x - 22, y: y - 14, w: 44, d: 28, r: 2.4 };
    const out = [];
    out.push(S(k.slabOf(pan, Z.BELT_TOP + 1.6, 2.2, P, 4, 0.5), { tone: "hi", lit: true }));
    out.push(Ln(k.planOutline(k.insetPlan(pan, 2.6), Z.BELT_TOP + 3.8, P, 4), { tone: "faint" }));
    put("scale-pan", 1000 + depth(x, y, 12) - 7, `<g data-ref="scale-pan">${out.join("")}</g>`);
  }
  // stamp over the output tray
  {
    const { toolX: x } = st.output;
    const y = Z.BELT_Y;
    const out = [];
    out.push(S(k.cylinder(x, y, 3, 52, 28, P, 18), { tone: "mid", crease: "none" }));
    out.push(Ln(k.sideArc(x, y, 3, 62, P, 10), { tone: "faint" }));
    out.push(S(k.cylinder(x, y, 5.6, 50, 4, P, 22, 0.3), { tone: "hi" }));
    const head = { x: x - 16, y: y - 11, w: 32, d: 22, r: 2.4 };
    out.push(S(k.slabOf(head, 40, 10, P, 3, 0.5), { tone: "hi", lit: true }));
    out.push(Ln(k.planOutline(k.insetPlan(head, 3), 50, P, 3), { tone: "faint" }));
    put("tool-output", 1000 + depth(x, y, 52) + 1, `<g data-ref="tool-output">${out.join("")}</g>`);
    // ink pad beside the tray, on the table in front of the belt
  }
}

// ---------------------------------------------------------------- feeder, funnel, drawer
function feeder() {
  const F = Z.FEEDER;
  const out = [`<path class="iso-halo" d="${k.haloOf(F, 0, 8, P)}"/>`];
  out.push(box(k.insetPlan(F, 3), 0, 8, { tone: "lo", bevel: 0 }));
  out.push(S(k.slabOf(F, 8, Z.FEEDER_TOP - 8, P, 3, 1), { tone: "mid", inner: Ln(k.sideSeam(F, 36, P, 3), { tone: "faint" }) }));
  const cap = { x: F.x - 1.5, y: F.y - 1.5, w: F.w + 3, d: F.d + 3, r: 3.4 };
  out.push(S(k.slabOf(cap, Z.FEEDER_TOP, 5, P, 3, 0.8), { tone: "mid" }));
  const rs = k.corners(cap, 6);
  out.push(Ln(rs.map(([x, y]) => k.ring(x, y, 1.6, Z.FEEDER_TOP + 5, P, 12)).join(""), { tone: "lo" }), screws(rs, Z.FEEDER_TOP + 5, { size: 0.4 }));
  // exit opening on the right face (normal +x) where the belt and the drawer emerge
  const fx = F.x + F.w;
  const D = Z.DRAWER;
  out.push(`<path class="vrm-well" d="${k.pathOf([at([fx, D.y0 - 3, 6]), at([fx, D.y1 + 3, 6]), at([fx, D.y1 + 3, 36]), at([fx, D.y0 - 3, 36])], true)}"/>`);
  out.push(Ln(k.pathOf([at([fx, D.y0 - 3, 6]), at([fx, D.y1 + 3, 6]), at([fx, D.y1 + 3, 36]), at([fx, D.y0 - 3, 36])], true), { tone: "lo" }));
  // window on the front
  const win = { x0: F.x + 9, x1: F.x + F.w - 9, z0: 40, z1: 72 };
  out.push(recess(win, Z.FEEDER_FRONT, contentFeeder(win)));
  WINDOWS.feeder = win;
  // lower front: label plate with the number badge and two knobs
  const lp = { x: F.x + 9, y: Z.FEEDER_FRONT, w: F.w - 18, d: 0.9, r: 0.5 };
  out.push(S(k.slabOf(lp, 14, 14, P, 2), { tone: "lo", crease: "none" }));
  out.push(`<g transform="${plane(Z.FEEDER_FRONT + 0.9)}">`);
  out.push(`<circle class="vrm-badge" data-ref="badge-1" cx="${F.x + 18}" cy="-21" r="4.6"/><text class="vrm-badge-n" x="${F.x + 18}" y="-18.7" text-anchor="middle" font-size="6.4">1</text>`);
  out.push(`<circle class="vrm-badge" data-ref="badge-2" cx="${F.x + 31}" cy="-21" r="4.6"/><text class="vrm-badge-n" x="${F.x + 31}" y="-18.7" text-anchor="middle" font-size="6.4">2</text>`);
  out.push(`<text class="vrm-plate" data-ref="plate-feed" x="${F.x + 38}" y="-18.4" font-size="7.4"></text>`);
  out.push(`</g>`);
  out.push(screwsFront([[F.x + 4, 6], [F.x + F.w - 4, 6], [F.x + 4, 74], [F.x + F.w - 4, 74], [F.x + 4, 38], [F.x + F.w - 4, 38]], Z.FEEDER_FRONT));
  out.push(Ln(k.pathOf([at([F.x + 3, Z.FEEDER_FRONT, 36.6]), at([F.x + F.w - 3, Z.FEEDER_FRONT, 36.6])]), { tone: "faint" }));
  // vents on the left face are hidden; add a pair of grab handles on the front plate
  const hd = G.frameAlong([F.x + 8, Z.FEEDER_FRONT, 9], [0, 1, 0]);
  out.push(S(G.disc(0, 1.6, 2, hd, P, {}), { tone: "mid", crease: "none" }));
  put("feeder", 90, out.join(""));
}

function funnel() {
  const f = Z.FUNNEL;
  const F = G.frameAlong([f.cx, f.cy, f.z0], [0, 0, 1]);
  const prof = [[0, f.neck], [f.neckTo - f.z0, f.neck], [f.neckTo - f.z0 + 2, f.neck + 2, 1], [f.rim - f.z0 - 6, f.rTop - 5, 1], [f.rim - f.z0, f.rTop, 1]];
  // outer funnel: a neck then a widening bowl, as one smooth turned body
  const body = G.lathe([[0, 0], [0, f.neck], [f.neckTo - f.z0, f.neck], [f.neckTo - f.z0, f.neck + 0.6], ...Array.from({ length: 11 }, (_, i) => {
    const t = i / 10;
    const s = f.neckTo - f.z0 + (f.rim - f.neckTo) * t;
    const r = f.neck + 0.6 + (f.rTop - f.neck - 0.6) * (1 - Math.pow(1 - t, 1.7));
    return [s, r, 1];
  })], F, P, { smooth: true, rims: "none" });
  void prof;
  const rimF = G.frameAlong([f.cx, f.cy, f.rim], [0, 0, 1]);
  const lip = G.ringBand(0, f.top - f.rim, f.rTop - 0.4, f.rTop + 2.6, rimF, P, {});
  const back = [];
  back.push(S(body, { tone: "mid", crease: "none" }));
  const mouth = k.pathOf(k.circleRing(f.cx, f.cy, f.rTop - 0.2, 56).map(([x, y]) => at([x, y, f.rim + 8])), true);
  back.push(S(lip, { tone: "mid", crease: "faint" }));
  back.push(`<path class="vrm-hole" d="${mouth}"/>`);
  back.push(Ln(k.ring(f.cx, f.cy, f.rTop - 0.2, f.rim + 8, P, 56), { tone: "mid" }));
  // seams on the bowl and a band at the neck
  back.push(Ln(G.arcOf(G.frameAlong([f.cx, f.cy, f.neckTo + 14], [0, 0, 1]), 0, 22, P, {}), { tone: "faint" }));
  const neckBand = G.ringBand(0, 3, f.neck, f.neck + 2.2, G.frameAlong([f.cx, f.cy, f.neckTo - 6], [0, 0, 1]), P, {});
  back.push(S(neckBand, { tone: "mid", crease: "faint" }));
  // four legs from the feeder roof to the bowl
  put("funnel", 1000 + depth(f.cx, f.cy, 100) - 40, back.join(""));
  // bowl supports: four small struts drawn as slim posts
  const struts = [];
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    struts.push([f.cx + dx * (f.neck + 16), f.cy + dy * (f.neck + 16)]);
  }
  void struts;
}

// clip for things sliding into the funnel mouth: everything above the near half of the opening
function funnelClip() {
  const f = Z.FUNNEL;
  const pts = k.circleRing(f.cx, f.cy, f.rTop - 0.4, 72).map(([x, y]) => at([x, y, f.rim + 8]));
  // the near half of the ellipse: points with larger depth
  const near = k.circleRing(f.cx, f.cy, f.rTop - 0.4, 72).filter(([x, y]) => (x - f.cx) * k.towardViewer(P)[0] + (y - f.cy) * k.towardViewer(P)[1] > 0).map(([x, y]) => at([x, y, f.rim + 8]));
  near.sort((a, b) => a[0] - b[0]);
  const left = near[0];
  const right = near[near.length - 1];
  const poly = [[left[0], -400], ...near, [right[0], -400]];
  void pts;
  return `<clipPath id="__ID__funnel"><path d="${k.pathOf(poly, true)}"/></clipPath>`;
}

// drawer clip: the cross-section of the opening, swept toward +x on screen
function drawerClip() {
  const D = Z.DRAWER;
  const F = Z.FEEDER;
  const fx = F.x + F.w;
  const c = [[fx, D.y0 - 2, 7], [fx, D.y1 + 2, 7], [fx, D.y1 + 2, 40], [fx, D.y0 - 2, 40]].map((p) => at(p));
  const far = c.map(([x, y]) => [x + 400 * Math.sin((Z.AZIMUTH * Math.PI) / 180), y + 400 * Math.cos((Z.AZIMUTH * Math.PI) / 180) * Math.sin((Z.ELEVATION * Math.PI) / 180)]);
  // convex hull of c and far
  const all = [...c, ...far];
  const hull = hullOf(all);
  return `<clipPath id="__ID__drawer"><path d="${k.pathOf(hull, true)}"/></clipPath>`;
}
function hullOf(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// ---------------------------------------------------------------- return rail
function rail() {
  const R = Z.RAIL;
  const z = R.z;
  const out = [];
  const bar = (plan, z0 = z, z1 = z + 5) => box(plan, z0, z1, { tone: "mid", bevel: 0.4, steps: 2 });
  // back run, left run, front run (to the funnel)
  const back = { x: R.left - 2.5, y: R.back - 2.5, w: R.fromX - R.left + 5, d: 5, r: 1 };
  const left = { x: R.left - 2.5, y: R.back - 2.5, w: 5, d: R.front - R.back + 5, r: 1 };
  const front = { x: R.left - 2.5, y: R.front - 2.5, w: Z.FUNNEL.cx - R.left + 2.5 + 8, d: 5, r: 1 };
  put("rail-back", 1000 + depth((R.left + R.fromX) / 2, R.back, z) - 100, bar(back) + Ln(k.lineOnTop([R.left + 2.5, R.back], [R.fromX - 2.5, R.back], z + 5, P), { tone: "faint" }));
  const posts = [
    [R.left, R.back, 0, 20],
    [R.fromX, R.back, Z.CAB_TOP, 20],
    [Z.STATIONS[0].x0 + 70, R.back, Z.CAB_TOP, 0],
  ];
  for (const [x, y, z0] of posts) {
    const p = box({ x: x - 4, y: y - 4, w: 8, d: 8, r: 1.2 }, z0, z, { tone: "mid", bevel: 0.4 });
    put(`rail-post-${x}`, 1000 + depth(x, y, z0 + 6) - 2, p + screws([[x, y]], z - 0.01, { size: 0.4 }));
  }
  put("rail-left", 1000 + depth(R.left, (R.back + R.front) / 2, z) - 70, bar(left));
  const frontPost = box({ x: R.left - 4, y: R.front - 4, w: 8, d: 8, r: 1.2 }, 0, z, { tone: "mid", bevel: 0.4 });
  put("rail-front-post", 1000 + depth(R.left, R.front, 40), frontPost + Ln(k.sideSeam({ x: R.left - 4, y: R.front - 4, w: 8, d: 8, r: 1.2 }, 90, P, 2), { tone: "faint" }));
  put("rail-front", 1000 + depth(R.left + 30, R.front, z) + 80, bar(front) + Ln(k.lineOnTop([R.left + 2.5, R.front], [Z.FUNNEL.cx + 5, R.front], z + 5, P), { tone: "faint" }));
  // end plate over the funnel
  void out;
}

// ---------------------------------------------------------------- front zone: reject bin and ticket slot
function bin() {
  const B = Z.BIN;
  const back = [];
  back.push(`<path class="iso-halo" d="${k.haloOf(B, 0, 6, P)}"/>`);
  back.push(S(k.slabOf(B, 0, 3, P, 3, 0.4), { tone: "lo", crease: "none" }));
  put("bin-back", 1000 + depth(B.x + B.w / 2, B.y + B.d / 2, 6) - 3, back.join(""));
  const front = [];
  const wall = 2.6;
  // two side walls and the front wall, open top; the near walls only (the far one is behind the belt rail)
  front.push(box({ x: B.x, y: B.y + B.d - wall, w: B.w, d: wall, r: 0.8 }, 0, B.h, { tone: "mid", bevel: 0.4 }));
  front.push(box({ x: B.x + B.w - wall, y: B.y, w: wall, d: B.d - wall, r: 0.8 }, 0, B.h, { tone: "mid", bevel: 0.4 }));
  front.push(Ln(k.sideSeam({ x: B.x, y: B.y + B.d - wall, w: B.w, d: wall, r: 0.8 }, 11, P, 2), { tone: "faint" }));
  // label plate on the front wall (text set live)
  const lx = B.x + 8;
  front.push(S(k.slabOf({ x: lx, y: B.y + B.d, w: B.w - 16, d: 0.9, r: 0.5 }, 5, 11, P, 2), { tone: "lo", crease: "none" }));
  front.push(`<g transform="${plane(B.y + B.d + 0.9)}"><path class="vrm-x" d="M${lx + 5} -13.4l4 4m0 -4l-4 4"/><text class="vrm-plate" data-ref="bin-label" x="${lx + 13}" y="-8.4" font-size="6.6"></text></g>`);
  front.push(screwsFront([[B.x + 3.4, 17], [B.x + B.w - 3.4, 17]], B.y + B.d));
  put("bin-front", 1000 + depth(B.x + B.w / 2, B.y + B.d, 12) + 2, front.join(""));
}

function beacons() {
  const st = Z.STATIONS[1];
  const out = [];
  const z = Z.CAB_TOP;
  const base = box({ x: st.x0 + 14, y: 36, w: 64, d: 20, r: 3 }, z, z + 4, { tone: "lo", bevel: 0.4 });
  out.push(base);
  const lamps = [["pass", 26], ["hold", 46], ["reject", 66]];
  const res = [];
  for (const [id, dx] of lamps) {
    res.push(`<g class="vrm-beacon" data-ref="beacon-${id}" data-lamp="${id}">${S(k.cylinder(st.x0 + dx, 46, 7.4, z + 4, 10, P, 24, 0.5), { tone: "mid" })}${Ln(k.sideArc(st.x0 + dx, 46, 7.4, z + 9, P, 12), { tone: "faint" })}</g>`);
  }
  // order: back to front by depth (all share y), left to right
  put("beacons", 1000 + depth(st.x0 + 46, 46, z + 8) - 50, out.join("") + res.join(""));
}

export function buildArt(thresholds, topN) {
  ctx.th = thresholds;
  ctx.topN = topN;
  items.length = 0;
  parts = 0;
  clipN = 0;
  put("table", -1000, table());
  put("belt", 200, belt());
  feeder();
  funnel();
  Z.STATIONS.forEach(station);
  Z.STATIONS.forEach((s) => {
    if (["gauge", "press", "output"].includes(s.id)) arm(s);
  });
  tools();
  rail();
  bin();
  beacons();
  const defs = funnelClip() + drawerClip();
  items.sort((a, b) => a.key - b.key);
  return { items, defs, parts, windows: WINDOWS };
}
export { at, depth, plane };
