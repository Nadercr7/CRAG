// Builds ../explainer.html from the two content files. Run: node docs/explain/explainer/src/gen.mjs
// The prose lives in content-en.mjs and content-ar.mjs; both call the same helpers so the structure
// of the two halves cannot drift. Interactive figures are placeholders that explainer.js fills at runtime
// from window.VRAG_DATA.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { en } from "./content-en.mjs";
import { ar } from "./content-ar.mjs";

const here = dirname(fileURLToPath(import.meta.url));

// --- helpers handed to the content files -----------------------------------------------------------
export const h = {
  // bound number: JS overwrites the text from VRAG_DATA; the fallback is the number quoted in results/report.md
  n: (path, f, fallback) => `<b class="num" data-n="${path}" data-f="${f}">${fallback}</b>`,
  fig: (name, caption, label) =>
    `<figure class="fig fig-${name}" data-fig="${name}">` +
    `<div class="fig-body" role="group" aria-label="${label}"></div>` +
    `<figcaption>${caption}</figcaption></figure>`,
  term: (txt) => `<span class="en" lang="en" dir="ltr">${txt}</span>`,
  station: ({ id, n, title, say, lead1, analogy, body, lead2, tech, fig }) => `
<article class="station" id="${id}" aria-labelledby="${id}-h">
  <header class="station-head"><span class="plate" aria-hidden="true">${n}</span><h3 id="${id}-h">${title}</h3></header>
  <div class="station-body">
    <div class="label">
      <p class="analogy"><strong>${lead1}</strong> ${analogy}</p>
      ${body}
      ${tech ? `<p class="tech"><strong>${lead2}</strong> ${tech}</p>` : ""}
    </div>
    ${fig}
  </div>
</article>`,
};

const hero = (L, p) => `
<section class="hero" id="${p}-top" aria-labelledby="${p}-title">
  <div class="wrap">
    <div class="hero-text">
      <h1 id="${p}-title">${L.name}</h1>
      <p class="idea">${L.idea}</p>
      <p class="lede">${L.lede}</p>
    </div>
    <div class="hero-strip" data-hero aria-hidden="true"></div>
  </div>
</section>
<section class="machine-sec" id="${p}-machine" aria-labelledby="${p}-machine-h">
  <div class="wrap">
    <h2 id="${p}-machine-h">${L.machineTitle}</h2>
    <p class="prose">${L.machineText}</p>
    <div class="machine-frame">
      <div class="machine-mount" data-machine></div>
    </div>
  </div>
</section>
<nav class="map" aria-label="${L.mapLabel}">
  <div class="wrap">
    <ol>${L.map.map(([href, t, d]) => `<li><a href="#${p}-${href}"><span class="map-t">${t}</span><span class="map-d">${d}</span></a></li>`).join("")}</ol>
  </div>
</nav>`;

function part(L, p) {
  return `
<main id="${p}" class="part" lang="${L.lang}" dir="${L.dir}" data-lang="${p}">
${hero(L, p)}
${L.sections(h, p)}
<section class="glossary" id="${p}-gloss" aria-labelledby="${p}-gloss-h">
  <div class="wrap">
    <h2 id="${p}-gloss-h">${L.glossTitle}</h2>
    <dl class="gloss">${L.gloss.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")}</dl>
    <p class="source-note">${L.sourceNote}</p>
  </div>
</section>
</main>`;
}

const bridge = (id, a, b, href, cls) => `
<aside class="bridge ${cls}" id="${id}" aria-label="${a}">
  <div class="wrap"><p lang="${cls === "to-ar" ? "en" : "ar"}" dir="${cls === "to-ar" ? "ltr" : "rtl"}">${a} <a href="${href}" data-go="${href.slice(1)}">${b}</a></p></div>
</aside>`;

const logo = `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22a11 11 0 0 1 22 0"/><path d="M16 22l5-8"/><circle cx="16" cy="22" r="1.6" fill="currentColor"/><path d="M4 27h24"/></svg>`;
const sun = `<svg class="i-sun" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>`;
const moon = `<svg class="i-moon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Verified RAG Explained</title>
<meta name="description" content="An illustrated explainer of the Verified RAG mini project, in English and in Egyptian Arabic.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<script>try{var t=localStorage.getItem("vrag-theme");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}</script>
<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="../machine/machine.css">
<link rel="stylesheet" href="explainer.css">
</head>
<body>
<a class="skip" href="#en-top">Skip to content</a>
<header class="top">
  <a class="brand" href="#en-top" data-go="en">${logo}<span>Verified RAG</span></a>
  <nav class="langswitch" aria-label="Language / اللغة">
    <a href="#en" data-go="en" lang="en" aria-current="true">English</a>
    <a href="#ar" data-go="ar" lang="ar">مصري</a>
  </nav>
  <button class="theme" type="button" aria-label="Switch between light and dark theme / بدّل بين الفاتح والغامق">${sun}${moon}</button>
</header>
${part(en, "en")}
${bridge("bridge-to-ar", "End of the English part. The same page follows in Egyptian Arabic.", "Jump to the Arabic part", "#ar", "to-ar")}
${part(ar, "ar")}
${bridge("bridge-to-en", "ده آخر الصفحة بالمصري. لو عايز تقراها بالإنجليزي:", "ارجع للنسخة الإنجليزي", "#en", "to-en")}
<script src="../data.js"></script>
<script src="../machine/machine.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js"></script>
<script src="explainer.js"></script>
</body>
</html>
`;
writeFileSync(resolve(here, "..", "explainer.html"), html);
console.log("wrote explainer.html", (html.length / 1024).toFixed(0) + " KB");
