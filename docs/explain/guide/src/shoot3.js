const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const out = '/home/user/crag/docs/explain/guide/shots/';
  for (const [w,h,scheme] of [[1440,900,'light'],[390,844,'light'],[390,844,'dark']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8765/explain/guide/speaker-guide.html', { waitUntil: 'networkidle' });
    await p.addStyleTag({ content: 'html{scroll-behavior:auto!important}.js .slide{opacity:1!important;transform:none!important}' });
    for (const sel of ['.five-num', '.keys', '.split']) {
      await p.evaluate(s => document.querySelector(s).scrollIntoView({block:'center'}), sel);
      await p.waitForTimeout(150);
      await p.screenshot({ path: `${out}${sel.slice(1)}-${w}-${scheme}.png` });
    }
    await p.evaluate(() => document.querySelector('#sec-1 .handoff').scrollIntoView({block:'center'}));
    await p.screenshot({ path: `${out}handoff-${w}-${scheme}.png` });
    if (w === 1440) {
      await p.evaluate(() => document.getElementById('s-8').scrollIntoView());
      await p.click('#s-8 .thumb-btn');
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${out}lightbox-${w}-${scheme}.png` });
      await p.keyboard.press('Escape');
      await p.click('#theme');
      const t = await p.evaluate(() => document.documentElement.getAttribute('data-theme'));
      console.log('toggled theme ->', t);
      await p.emulateMedia({ media: 'print' });
      await p.pdf({ path: out + 'print.pdf', format: 'A4' });
    }
    await ctx.close();
  }
  await b.close();
})();
