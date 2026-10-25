// Assemble the three deliverables into single self-contained HTML files.
// Local <link rel="stylesheet" href="..."> and <script src="..."> are inlined, local <img src>
// becomes a data: URI; CDN scripts and Google Fonts stay as links.
//
//   node docs/explain/build.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const docs = resolve(here, "..");
const JOBS = [
  ["explainer/explainer.html", "explainer.html"],
  ["slides/slides.html", "slides.html"],
  ["guide/speaker-guide.html", "speaker-guide.html"],
];
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };
const isLocal = (u) => !/^(https?:)?\/\//.test(u) && !u.startsWith("data:");

function inline(srcPath) {
  const base = dirname(srcPath);
  let html = readFileSync(srcPath, "utf8");
  const read = (u) => readFileSync(resolve(base, u), "utf8");
  html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, (tag) => {
    const href = /href="([^"]+)"/.exec(tag)?.[1];
    if (!href || !isLocal(href)) return tag;
    return `<style>/* ${href} */\n${read(href)}\n</style>`;
  });
  html = html.replace(/<script\b([^>]*)\bsrc="([^"]+)"([^>]*)><\/script>/g, (tag, a, src, b) => {
    if (!isLocal(src)) return tag;
    const attrs = (a + b).replace(/\s+defer\b/, "");
    // </script> inside a file would end the tag early
    return `<script${attrs}>/* ${src} */\n${read(src).replace(/<\/script/gi, "<\\/script")}\n</script>`;
  });
  html = html.replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/g, (m, pre, src, post) => {
    if (!isLocal(src)) return m;
    const file = resolve(base, src);
    if (!existsSync(file)) return m;
    const b64 = readFileSync(file).toString("base64");
    return `${pre}data:${MIME[extname(file)] || "application/octet-stream"};base64,${b64}${post}`;
  });
  return html;
}

for (const [src, out] of JOBS) {
  const srcPath = resolve(here, src);
  if (!existsSync(srcPath)) {
    console.log(`skip ${src} (not built yet)`);
    continue;
  }
  const html = inline(srcPath);
  const left = [...html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)="(?!https?:|data:|#)([^"]+)"/g)];
  writeFileSync(resolve(docs, out), html);
  console.log(`wrote docs/${out} (${(html.length / 1024).toFixed(0)} KB)` +
    (left.length ? `; unresolved local refs: ${left.map((m) => m[1]).join(", ")}` : ""));
}
