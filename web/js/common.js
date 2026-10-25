/* Shared helpers: theme, DOM builder, number formats, icons, fetch. No dependencies. */
(function () {
  "use strict";

  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function stored() {
    try {
      return localStorage.getItem("vrag-theme");
    } catch (e) {
      return null;
    }
  }
  function store(v) {
    try {
      localStorage.setItem("vrag-theme", v);
    } catch (e) {
      /* private mode: the toggle still works for this page view */
    }
  }
  function effective() {
    return root.dataset.theme || (media.matches ? "dark" : "light");
  }

  const listeners = [];
  function onTheme(cb) {
    listeners.push(cb);
  }
  function emit() {
    listeners.forEach((cb) => cb(effective()));
  }

  function icon(name, cls) {
    const paths = {
      check: "M4 12.5l5 5L20 6.5",
      x: "M6 6l12 12M18 6L6 18",
      warn: "M12 4l9 16H3zM12 10v4M12 17.2v.1",
      up: "M12 19V5M6 11l6-6 6 6",
      down: "M12 5v14M6 13l6 6 6-6",
      eq: "M5 9h14M5 15h14",
      sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
      moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
      logo: "M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("class", "i" + (cls ? " " + cls : ""));
    svg.setAttribute("aria-hidden", "true");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", paths[name] || "");
    svg.appendChild(p);
    return svg;
  }

  /* h("div", {class: "x", onclick: fn}, "text", node, [nodes]) -> Element; text is never parsed as HTML */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    const add = (kid) => {
      if (kid === null || kid === undefined || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else el.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
    };
    kids.forEach(add);
    return el;
  }

  const fmt = {
    pct(x, d = 1) {
      return x === null || x === undefined ? "n/a" : (100 * x).toFixed(d) + "%";
    },
    pp(x, d = 1) {
      if (x === null || x === undefined) return "n/a";
      const v = 100 * x;
      return (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d) + " pp";
    },
    prob(x) {
      if (x === null || x === undefined) return "n/a";
      if (x >= 0.995) return "0.99+";
      if (x < 0.001) return "<0.001";
      return x.toFixed(x < 0.1 ? 3 : 2);
    },
    int(x) {
      return x === null || x === undefined ? "n/a" : Math.round(x).toLocaleString("en-US");
    },
    ms(x) {
      return x >= 1000 ? (x / 1000).toFixed(1) + " s" : Math.round(x) + " ms";
    },
    num(x, d = 1) {
      return x === null || x === undefined ? "n/a" : x.toFixed(d);
    },
  };

  async function getJSON(url) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      /* non-JSON error body */
    }
    if (!res.ok) {
      const err = new Error((body && body.detail) || res.status + " " + res.statusText);
      err.status = res.status;
      throw err;
    }
    return body;
  }

  function initTheme() {
    const saved = stored();
    if (saved === "light" || saved === "dark") root.dataset.theme = saved;
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    const paint = () => {
      const dark = effective() === "dark";
      btn.replaceChildren(icon(dark ? "sun" : "moon"), document.createTextNode(dark ? "Light" : "Dark"));
      btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    };
    btn.addEventListener("click", () => {
      const next = effective() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      store(next);
      paint();
      emit();
    });
    media.addEventListener("change", () => {
      paint();
      emit();
    });
    paint();
  }

  function cssVar(name) {
    return getComputedStyle(root).getPropertyValue(name).trim();
  }

  window.V = { h, icon, fmt, getJSON, onTheme, cssVar, effective, initTheme };
  document.addEventListener("DOMContentLoaded", initTheme);
})();
