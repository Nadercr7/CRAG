const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const out = '/home/user/crag/docs/explain/guide/shots/';
  const errs = [];
  for (const [w, h] of [[1440, 900], [390, 844]]) for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto('http://localhost:8765/explain/guide/speaker-guide.html', { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}.js .slide{opacity:1!important;transform:none!important}' });
    const sw = await p.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    console.log(w, scheme, 'scrollWidth', sw);
    await p.screenshot({ path: `${out}top-${w}-${scheme}.png` });
    for (const id of ['s-3', 's-11', 'sec-3', 'tough', 'glossary']) {
      await p.evaluate(i => document.getElementById(i).scrollIntoView(), id);
      await p.waitForTimeout(250);
      await p.screenshot({ path: `${out}${id}-${w}-${scheme}.png` });
    }
    await ctx.close();
  }
  console.log(errs);
  await b.close();
})();
