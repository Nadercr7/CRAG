// Verification helper: node snap.mjs <out.png> [--scenario support] [--lang en] [--theme light] [--width 1440] [--height 900] [--step 2] [--t 1.5] [--controls 0|1] [--sel .vrm] [--reduced]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire("/opt/node-tools/")("playwright");
const HERE = dirname(fileURLToPath(import.meta.url));
const a = process.argv.slice(2);
const out = a[0];
const opt = (n, d) => { const i = a.indexOf("--" + n); return i >= 0 ? a[i + 1] : d; };
const scenario = opt("scenario", "support"), lang = opt("lang", "en"), theme = opt("theme", "light"), width = +opt("width", 1440), height = +opt("height", 900);
const step = opt("step", null), tt = +opt("t", 0), controls = opt("controls", "1"), sel = opt("sel", ".vrm"), reduced = a.includes("--reduced"), slide = a.includes("--slide");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: +opt("dpr", 2), colorScheme: theme, reducedMotion: reduced ? "reduce" : "no-preference" });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() !== "log") console.log("console." + m.type() + ":", m.text()); });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
const url = `file://${join(HERE, "demo.html")}?scenario=${scenario}&lang=${lang}&theme=${theme}&controls=${controls}${slide ? "&slide" : ""}`;
await page.goto(url);
await page.waitForTimeout(300);
if (step !== null) {
  await page.evaluate(([s, t2]) => { window.m.seek(+s, +t2); }, [step, tt]);
  await page.waitForTimeout(150);
}
const el = await page.$(sel);
const clip = opt("clip", null);
if (clip) { const bb = await el.boundingBox(); const [x, y, w, h] = clip.split(",").map(Number); await page.screenshot({ path: out, clip: { x: bb.x + x * bb.width, y: bb.y + y * bb.height, width: w * bb.width, height: h * bb.height } }); }
else await el.screenshot({ path: out });
await b.close();
