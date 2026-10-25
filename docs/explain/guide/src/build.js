const fs = require('fs');
const C = require('./content.js');
const SCR = require('./screens.js');
const OUT = '/home/user/crag/docs/explain/guide/speaker-guide.html';

const fmt = (s) => String(s)
  .replace(/#([^#]+)#/g, '<bdi class="n" dir="ltr">$1</bdi>')
  .replace(/\{([^}]+)\}/g, '<bdi class="en" lang="en" dir="ltr">$1</bdi>');
const nb = (x) => `<bdi class="n" dir="ltr">${x}</bdi>`;
const rngH = (r) => String(r).replace(/\d+/g, nb);
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const tocItems = [
  ['intro', 'مقدمة', null],
  ...C.sections.map((s) => [s.n === 'A' ? 'sec-a' : 'sec-' + s.n, s.n === 'A' ? 'ملحق' : String(s.n), s.n === 'A' ? null : s.en]),
  ['tough', 'أسئلة صعبة', null],
  ['glossary', 'مصطلحات', null]
];

let h = '';
const a = (x) => (h += x + '\n');

a(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verified RAG: دليل المتحدث</title>
<meta name="description" content="دليل بالعامية المصرية لتقديم شرايح Verified RAG: إيه على كل شريحة، تقول إيه، وأسئلة ممكن تتسأل.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="guide.css">
</head>
<body>
<a class="skip" href="#intro">تخطّى للمحتوى</a>
<header class="bar" id="bar">
  <div class="bar-in">
    <button class="theme" id="theme" type="button" aria-label="تبديل الوضع بين فاتح وغامق" title="فاتح / غامق"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg></button>
    <nav class="toc" aria-label="أقسام الدليل">`);
tocItems.forEach(([id, label, en]) => {
  a(`      <a href="#${id}" data-t="${id}"><b>${label}</b>${en ? `<span lang="en" dir="ltr">${en}</span>` : ''}</a>`);
});
a(`    </nav>
  </div>
</header>

<main class="wrap">
<section class="intro" id="intro">
  <p class="kicker">دليل المتحدث</p>
  <h1><bdi lang="en">Verified RAG</bdi></h1>
  <p class="lede">الصفحة دي بتشرح اللي في الشرايح بشكل أبسط، عشان كل واحد يفهم هيطلع يقدّم إيه. كل شريحة: اللي عليها، وتقول إيه، وإيه اللي بيظهر لما تدوس Next، وسؤال ممكن يتسأل. في الآخر أسئلة صعبة من الدكتور ومعاها ردود صريحة، وقاموس صغير.</p>

  <h2>${fmt('المشروع في #5# سطور')}</h2>
  <ol class="five">`);
C.fiveLines.forEach((l) => a(`    <li>${fmt(l)}</li>`));
a(`  </ol>

  <h2>${fmt('الشرايح متقسّمة على #7# متحدثين')}</h2>
  <p class="note">${fmt('القسم بتاع كل متحدث في الجدول. متحدث #1# بيبدأ، ومتحدث #7# بيقفّل ويفتح الأسئلة. الملحق مفيش متحدث له.')}</p>
  <ul class="split">`);
C.sectionsTable.forEach((s) => {
  const id = s.n === 'A' ? 'sec-a' : 'sec-' + s.n;
  a(`    <li><a href="#${id}"><span class="who">${s.n === 'A' ? 'الملحق' : 'متحدث ' + nb(s.n)}</span><span class="en" lang="en" dir="ltr">${s.en}</span><span class="rng">شرايح ${rngH(s.slides)}</span><span class="wh">${fmt(s.what)}</span></a></li>`);
});
a(`  </ul>

  <h2>اختصارات الـ deck</h2>
  <dl class="keys">`);
C.keys.forEach((k) => {
  a(`    <div><dt>${k.k.map((x) => `<kbd>${x}</kbd>`).join(' ')}</dt><dd>${fmt(k.d)}</dd></div>`);
});
a(`  </dl>
  <p class="note">${fmt(C.keysNote)}</p>

  <h2>الأرقام الخمسة اللي كل واحد لازم يحفظها</h2>
  <div class="five-num">`);
C.fiveNumbers.forEach((n, i) => {
  a(`    <div class="fn"><span class="idx">${i + 1}</span><b class="mono" dir="ltr">${n.v}</b><p>${fmt(n.c)}</p></div>`);
});
a(`  </div>
</section>`);

const unit = (s) => s; // placeholder
C.sections.forEach((sec) => {
  const id = sec.n === 'A' ? 'sec-a' : 'sec-' + sec.n;
  const nums = sec.slides;
  const rng = nums.length > 1 ? `${nums[0]} إلى ${nums[nums.length - 1]}` : `${nums[0]}`;
  a(`
<section class="sec" id="${id}" aria-labelledby="${id}-h">
  <header class="sec-head">
    <span class="mark"><b>${sec.n}</b></span>
    <div>
      <p class="who">${sec.n === 'A' ? 'ملحق' : 'متحدث ' + nb(sec.n)} · شرايح ${rngH(rng)}</p>
      <h2 id="${id}-h"><span lang="en" dir="ltr">${sec.en}</span></h2>
      <p class="ar">${fmt(sec.ar)}</p>
    </div>
  </header>`);
  nums.forEach((n) => {
    const s = C.slides[n];
    const img = `../slides/shots/${pad(n)}-${s.id}-1920-light.png`;
    a(`
  <article class="slide" id="s-${n}">
    <div class="s-top">
      <span class="s-num"><bdi class="n" dir="ltr">${pad(n)}</bdi></span>
      <h3 class="s-title" lang="en" dir="ltr">${esc(s.title)}</h3>
    </div>
    <div class="s-body">
      <figure class="thumb"><button type="button" class="thumb-btn" aria-label="تكبير لقطة الشريحة ${n}"><img src="${img}" width="1920" height="1080" loading="lazy" alt="لقطة من الشريحة ${n}: ${esc(s.title)}"></button></figure>
      <div class="s-screen">
        <h4>إيه اللي على السلايد</h4>
        <p>${fmt(SCR[n] || s.screen)}</p>
      </div>
    </div>
    <div class="blk say">
      <h4>تقول إيه</h4>
      <ul>${s.say.map((t) => `<li>${fmt(t)}</li>`).join('')}</ul>
    </div>`);
    if (s.steps && s.steps.length) {
      a(`    <div class="blk steps">
      <h4>لو دوست <bdi lang="en">Next</bdi> هيحصل إيه</h4>
      <ol>${s.steps.map((t) => `<li>${fmt(t)}</li>`).join('')}</ol>
    </div>`);
    }
    if (s.qa && s.qa.length) {
      a(`    <div class="blk qa">
      <h4>سؤال ممكن يتسأل</h4>
      ${s.qa.map((x) => `<div class="qa-i"><p class="q">${fmt(x.q)}</p><p class="a">${fmt(x.a)}</p></div>`).join('')}
    </div>`);
    }
    a(`  </article>`);
  });
  if (sec.handoff) {
    const nxt = sec.n === 7 ? 'الأسئلة' : 'متحدث ' + (sec.n + 1);
    a(`  <div class="handoff"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H5M11 6l-6 6 6 6"/></svg><p><b>${sec.n === 7 ? 'الخطوة اللي بعدها' : 'تسليم لـ' + nxt}</b>${fmt(sec.handoff)}</p></div>`);
  }
  a(`</section>`);
});

a(`
<section class="sec tough" id="tough" aria-labelledby="tough-h">
  <header class="sec-head">
    <span class="mark"><b>؟</b></span>
    <div>
      <h2 id="tough-h">أسئلة صعبة، وردود صريحة</h2>
      <p class="ar">لو حد سألك واحد منهم وانت مش متأكد، قول اللي في الرد. الردود بتقول الحدود زي ما هي.</p>
    </div>
  </header>
  <ol class="tq">`);
C.tough.forEach((t, i) => {
  a(`    <li id="q-${i + 1}"><p class="q"><bdi class="n qn" dir="ltr">${i + 1}</bdi>${fmt(t.q)}</p><p class="a">${fmt(t.a)}</p></li>`);
});
a(`  </ol>
</section>

<section class="sec gloss" id="glossary" aria-labelledby="glossary-h">
  <header class="sec-head">
    <span class="mark"><b>Aa</b></span>
    <div>
      <h2 id="glossary-h">قاموس صغير</h2>
      <p class="ar">المصطلحات زي ما بتتقال في الشرايح.</p>
    </div>
  </header>
  <dl class="gl">`);
C.glossary.forEach(([t, d]) => {
  a(`    <div><dt lang="en" dir="ltr">${t}</dt><dd>${fmt(d)}</dd></div>`);
});
a(`  </dl>
</section>
<footer class="foot"><p>الأرقام كلها من الشرايح ومن <bdi lang="en">results/report.md</bdi>. اللقطات من <bdi lang="en">docs/explain/slides/shots</bdi>.</p></footer>
</main>

<dialog id="lb" aria-label="لقطة مكبّرة"><button type="button" class="lb-x" aria-label="إغلاق">×</button><img alt=""></dialog>
<script src="guide.js"></script>
</body>
</html>`);

fs.writeFileSync(OUT, h);
console.log('written', OUT, h.length);
