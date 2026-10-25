const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 900 } });
  await p.goto('http://localhost:8765/explain/guide/speaker-guide.html', { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const el = [...document.querySelectorAll('bdi.en')].find(e => e.textContent === '#s-12');
    const t = el.firstChild, out = [];
    for (let i = 0; i < t.length; i++) { const rg = document.createRange(); rg.setStart(t, i); rg.setEnd(t, i + 1); out.push([t.data[i], Math.round(rg.getBoundingClientRect().left)]); }
    return [getComputedStyle(el).direction, out];
  });
  console.log(JSON.stringify(r));
  await b.close();
})();
