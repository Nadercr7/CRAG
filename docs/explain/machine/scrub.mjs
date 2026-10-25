// Verification helper: scrub every step of a scenario frame by frame and report jumps of moving parts.
// node scrub.mjs [scenario] [fps]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire("/opt/node-tools/")("playwright");
const HERE = dirname(fileURLToPath(import.meta.url));
const scenario = process.argv[2] || "support", fps = +(process.argv[3] || 60);
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1200, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(`file://${join(HERE, "demo.html")}?scenario=${scenario}&controls=0`);
await page.waitForTimeout(300);
const res = await page.evaluate(async ([fps2]) => {
  const out = [];
  const m = window.m;
  const root = document.querySelector(".vrm");
  const moving = () => [...root.querySelectorAll(".vrm-slip, .vrm-strip, .vrm-ticket, .vrm-qcard, .vrm-acard, [data-ref=tool-gauge], [data-ref=tool-press], [data-ref=tool-output], [data-ref=tool-gate], [data-ref=tool-sweep], [data-ref=scale-pan], .vrm-drawer > g")];
  const pos = (n) => { const r = n.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const posOld = (n) => { const t = n.getAttribute("transform") || ""; const mm = t.match(/translate\(([-\d.]+) ([-\d.]+)\)/); const disp = getComputedStyle(n.closest("g[style*='display']") || n).display; return mm ? [+mm[1], +mm[2]] : [0, 0]; };
  for (let s = 0; s < 7; s++) {
    const dur = m.duration(s);
    let prev = null;
    let worst = { d: 0 };
    for (let t = 0; t <= dur + 1e-9; t += 1 / fps2) {
      m.seek(s, t);
      const cur = moving().map((n) => ({ n, p: pos(n), vis: n.getBoundingClientRect().width > 0 }));
      const pm = prev ? new Map(prev.map((x) => [x.n, x])) : null;
      if (prev) cur.forEach((c, i) => { const q = pm.get(c.n); if (q && c.vis && q.vis) { const d = Math.hypot(c.p[0] - q.p[0], c.p[1] - q.p[1]); if (d > worst.d) worst = { d, t: +t.toFixed(3), cls: c.n.getAttribute("class") || c.n.getAttribute("data-ref") || c.n.tagName, i }; } });
      prev = cur;
    }
    out.push({ step: s, dur: +dur.toFixed(2), worst });
  }
  return out;
}, [fps]);
for (const r of res) console.log(`step ${r.step} dur ${r.dur}s  worst per-frame move ${r.worst.d.toFixed(1)} units at t=${r.worst.t} (${r.worst.cls})`);
await b.close();
