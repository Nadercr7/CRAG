const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8765/explain/guide/speaker-guide.html', { waitUntil: 'networkidle' });
  await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}.js .slide{opacity:1!important;transform:none!important}' });
  const el = await p.$('.five li:nth-child(5)');
  await el.screenshot({ path: 'z1.png' });
  await (await p.$('#s-21')).screenshot({ path: 'z2.png' });
  await b.close();
})();
