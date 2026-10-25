// Final stills: every step mid-motion, for the given scenarios, themes and widths -> shots/*.png (+ contact sheets).
// node capture.mjs [scenarios=support,missing] [themes=light,dark] [widths=1440,390]
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const { chromium } = createRequire("/opt/node-tools/")("playwright");
const HERE = dirname(fileURLToPath(import.meta.url));
const [sc = "support,missing", th = "light,dark", wd = "1440,390"] = process.argv.slice(2);
const IDS = ["ask", "search", "inspect", "decide", "trim", "weigh", "answer"];
const FRAC = [0.55, 0.62, 0.55, 0.45, 0.5, 0.6, 0.72];
mkdirSync(join(HERE, "shots"), { recursive: true });
const b = await chromium.launch();
for (const scenario of sc.split(","))
  for (const theme of th.split(","))
    for (const wtoken of wd.split(",")) {
      const slide = wtoken === "slide";
      const width = slide ? 1280 : Number(wtoken);
      const tag = slide ? "slide" : String(width);
      const ctx = await b.newContext({ viewport: { width, height: slide ? 720 : width < 600 ? 900 : 1000 }, deviceScaleFactor: width < 600 ? 2 : 1, colorScheme: theme });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => console.log("pageerror:", e.message));
      await page.goto(`file://${join(HERE, "demo.html")}?scenario=${scenario}&theme=${theme}&controls=1${slide ? "&slide" : ""}`);
      await page.waitForTimeout(400);
      const files = [];
      for (let i = 0; i < 7; i++) {
        await page.evaluate(([i2, f]) => window.m.seek(i2, window.m.duration(i2) * f), [i, FRAC[i]]);
        await page.waitForTimeout(80);
        const f = join(HERE, "shots", `${scenario}-${theme}-${tag}-${i + 1}-${IDS[i]}.png`);
        await (await page.$(slide ? ".page" : ".vrm")).screenshot({ path: f });
        files.push(f);
      }
      await ctx.close();
      const sheet = join(HERE, "shots", `sheet-${scenario}-${theme}-${tag}.png`);
      execFileSync("python3", ["-c", `
import sys
from PIL import Image
files=sys.argv[2:]; cols=int(sys.argv[1])
ims=[Image.open(f).convert("RGB") for f in files]
w=max(i.width for i in ims); h=max(i.height for i in ims)
rows=(len(ims)+cols-1)//cols
S=Image.new("RGB",(w*cols,h*rows),"white")
for k,im in enumerate(ims): S.paste(im,((k%cols)*w,(k//cols)*h))
S.save(${JSON.stringify(sheet)})
`, width < 600 ? "4" : "2", ...files]);
      console.log("wrote", sheet);
    }
await b.close();
