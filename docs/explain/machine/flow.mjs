// Verification helper: drives the real controls (clicks, Space, auto mode, reduced motion) and prints the state.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const { chromium } = createRequire("/opt/node-tools/")("playwright");
const HERE = dirname(fileURLToPath(import.meta.url));
const b = await chromium.launch();
async function run(label, ctxOpts, fn) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, ...ctxOpts });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(`file://${join(HERE, "demo.html")}?scenario=support`);
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__ev = []; window.m.on("step", (e) => window.__ev.push("step:" + e.id)).on("done", (e) => window.__ev.push("done:" + e.id)); });
  console.log("--", label);
  await fn(page);
  console.log("errors:", errs.length ? errs : "none");
  await ctx.close();
}
const states = (page) => page.evaluate(() => [...document.querySelectorAll(".vrm-step")].map((b) => b.dataset.state[0] + (b.disabled ? "-" : "+")).join(" "));
await run("manual: click next pills; only the next is live", {}, async (page) => {
  console.log("initial", await states(page));
  await page.click('.vrm-step[data-i="0"]');
  await page.waitForTimeout(300);
  console.log("running", await states(page));
  await page.click('.vrm-step[data-i="3"]', { force: true, timeout: 500 }).catch(() => console.log("step 4 click refused (disabled): ok"));
  await page.waitForTimeout(2500);
  console.log("after ask", await states(page));
  await page.keyboard.press("Space");
  await page.waitForTimeout(3500);
  console.log("after space (search)", await states(page), await page.evaluate(() => JSON.stringify(window.m.getState())));
  await page.focus(".vrm");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(500);
  console.log("events", await page.evaluate(() => window.__ev.join(",")));
});
await run("auto mode runs through and loops", {}, async (page) => {
  await page.evaluate(() => window.m.setMode("auto"));
  await page.waitForTimeout(65000);
  console.log("events", await page.evaluate(() => window.__ev.join(",")));
});
await run("reduced motion: steps land instantly", { reducedMotion: "reduce" }, async (page) => {
  for (let i = 0; i < 7; i++) { await page.keyboard.press("Tab").catch(() => {}); await page.evaluate(() => window.m.next()); }
  console.log("state", await page.evaluate(() => JSON.stringify(window.m.getState())), await states(page));
  console.log("cards", await page.evaluate(() => document.querySelectorAll(".vrm-cmp li").length));
});
await run("scenario + language switching mid-run", {}, async (page) => {
  await page.click('.vrm-step[data-i="0"]'); await page.waitForTimeout(800);
  await page.click('[data-scn="missing"]'); await page.waitForTimeout(200);
  console.log("after scenario switch", await page.evaluate(() => JSON.stringify(window.m.getState())), await states(page));
  await page.evaluate(() => window.m.setLang("ar")); await page.waitForTimeout(200);
  console.log("dir", await page.evaluate(() => document.querySelector(".vrm").dir), await page.evaluate(() => document.querySelector(".vrm-hint-t").textContent));
  await page.evaluate(() => window.m.go(6)); await page.waitForTimeout(4500);
  console.log("go(6):", await page.evaluate(() => document.querySelector(".vrm-hint-t").textContent), await states(page));
  await page.evaluate(() => window.m.reset());
  console.log("reset", await states(page));
});
await b.close();
