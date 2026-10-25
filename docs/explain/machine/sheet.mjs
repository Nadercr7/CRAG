// Verification helper: contact sheet of frozen moments.
// node sheet.mjs out.png "2:1.0,2:3.4,3:2" [--scenario support --lang en --theme light --width 1200 --cols 2 --sel .vrm-stage --dpr 1]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire("/opt/node-tools/")("playwright");
const HERE = dirname(fileURLToPath(import.meta.url));
const a = process.argv.slice(2);
const out = a[0], seq = a[1].split(",");
const opt = (n, d) => { const i = a.indexOf("--" + n); return i >= 0 ? a[i + 1] : d; };
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: +opt("width", 1200), height: +opt("height", 800) }, deviceScaleFactor: +opt("dpr", 1), colorScheme: opt("theme", "light") });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.text()); });
await page.goto(`file://${join(HERE, "demo.html")}?scenario=${opt("scenario", "support")}&lang=${opt("lang", "en")}&theme=${opt("theme", "light")}&controls=${opt("controls", "0")}`);
await page.waitForTimeout(300);
const files = [];
for (const [n, s] of seq.entries()) {
  const [i, t] = s.split(":");
  await page.evaluate(([i2, t2]) => window.m.seek(+i2, +t2), [i, t]);
  await page.waitForTimeout(60);
  const f = out.replace(/\.png$/, `-${n}.png`);
  await (await page.$(opt("sel", ".vrm-stage"))).screenshot({ path: f });
  files.push(f);
}
await b.close();
execFileSync("python3", ["-c", `
import sys
from PIL import Image, ImageDraw
files=sys.argv[2:]; cols=int(sys.argv[1])
ims=[Image.open(f) for f in files]
w,h=ims[0].size
rows=(len(ims)+cols-1)//cols
S=Image.new("RGB",(w*cols,h*rows),"white")
for i,im in enumerate(ims):
    S.paste(im,((i%cols)*w,(i//cols)*h))
S.save(${JSON.stringify(out)})
`, opt("cols", "2"), ...files]);
files.forEach((f) => execFileSync("rm", [f]));
console.log("wrote", out);
