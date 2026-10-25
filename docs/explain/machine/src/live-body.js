I18N.en.start = "Press the highlighted step to start the line.";
I18N.ar.start = "اضغط على الخطوة المتنوّرة عشان الخط يشتغل.";
I18N.en.stepDone = "Line finished. Pick another example, or start over.";
I18N.ar.stepDone = "الخط خلّص. اختار مثال تاني، أو ابدأ من الأول.";

/* ------------------------------------------------------------------ the component */
let UID = 0;
function mount(el, opts) {
  opts = Object.assign({ scenario: "support", lang: "en", mode: "manual", controls: false, data: (typeof window !== "undefined" && window.VRAG_DATA) || null, hint: true, idea: true, chips: true }, opts || {});
  const D = opts.data;
  if (!D || !D.scenarios) throw new Error("VRAGMachine.mount: opts.data (window.VRAG_DATA) is missing");
  const uid = "vrm" + ++UID + "-";
  const mq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const listeners = {};
  const emit = (name, arg) => (listeners[name] || []).slice().forEach((f) => { try { f(arg); } catch (e) { console.error(e); } });
  const ST0 = { scenario: opts.scenario in D.scenarios ? opts.scenario : "support", lang: opts.lang === "ar" ? "ar" : "en", mode: opts.mode === "auto" ? "auto" : "manual" };
  let M = null, clips = [], ents = [], dirty = true, raf = 0, last = 0, visible = true, timer = 0, destroyed = false;
  let idx = -1; // step being played or last played
  let doneIdx = -1; // last step that finished
  let running = false, t = 0, speed = 1, chipUpTo = -1, chipDrawn = -2;
  const cam = { x: 500, y: 250, s: 1, tx: 500, ty: 250, ts: 1 };
  let snds = [];
  const TT = () => I18N[ST0.lang];

  /* ---------------------------------------------------------------- DOM shell */
  el.innerHTML = "";
  const root = document.createElement("div");
  root.className = "vrm";
  root.tabIndex = 0;
  root.setAttribute("role", "group");
  if (opts.controls) root.setAttribute("data-controls", "");
  el.appendChild(root);
  root.innerHTML =
    (opts.hint ? `<p class="vrm-hint" aria-live="polite"><span class="vrm-hint-n" hidden></span><span class="vrm-hint-t"></span></p>` : "") +
    `<div class="vrm-main">${opts.controls ? `<div class="vrm-controls"></div>` : ""}<div class="vrm-fig"><div class="vrm-stage"><svg class="iso-svg vrm-svg" viewBox="0 0 ${L.W} ${L.H}" xmlns="${NS}" role="img"><defs>${ART.defs.replace(/__ID__/g, uid)}</defs><g class="vrm-cam"><g class="vrm-scene"></g><g class="vrm-hud"></g></g></svg></div>${opts.chips ? `<ul class="vrm-chips"></ul>` : ""}</div></div>` +
    (opts.idea ? `<p class="vrm-idea"></p>` : "");
  const q = (sel) => root.querySelector(sel);
  const svg = q(".vrm-svg"), camG = q(".vrm-cam"), sceneG = q(".vrm-scene"), hudG = q(".vrm-hud"), stage = q(".vrm-stage");
  const R = (name) => svg.querySelector(`[data-ref="${name}"]`);

  /* ---------------------------------------------------------------- depth-sorted scene */
  const ghost = document.createElementNS(NS, "g");
  ghost.innerHTML = ART.items.map((it) => `<g data-id="${it.id}">${it.svg.replace(/__ID__/g, uid)}</g>`).join("");
  ART.items.forEach((it, i) => ents.push({ root: ghost.children[i], el: ghost.children[i], key: it.key, id: it.id }));
  function resort() {
    if (!dirty) return;
    dirty = false;
    ents.sort((a, b) => a.key - b.key);
    const live = ents.filter((e) => e.home !== "drawer");
    let same = sceneG.children.length === live.length;
    for (let i = 0; same && i < live.length; i++) if (sceneG.children[i] !== live[i].root) same = false;
    if (same) return;
    const frag = document.createDocumentFragment();
    live.forEach((e) => frag.appendChild(e.root));
    sceneG.appendChild(frag);
  }
  resort();
  // a moving thing: `el` carries the transform, `root` is what the scene holds (el itself, or a clip wrapper around it)
  function mkNode(html, cls, clipId) {
    const el2 = document.createElementNS(NS, "g");
    if (cls) el2.setAttribute("class", cls);
    el2.innerHTML = html;
    let rt = el2;
    if (clipId) { rt = document.createElementNS(NS, "g"); rt.setAttribute("clip-path", `url(#${uid}${clipId})`); rt.appendChild(el2); }
    const e = { el: el2, root: rt, key: 0, id: "dyn", home: "scene", clipId };
    ents.push(e);
    dirty = true;
    return e;
  }
  const clipOn = (e, on) => { if (!e.clipId) return; const a = on ? `url(#${uid}${e.clipId})` : null; if (a) { if (e.root.getAttribute("clip-path") !== a) e.root.setAttribute("clip-path", a); } else e.root.removeAttribute("clip-path"); };
  const show = (e, on) => { const v = on ? "" : "none"; if (e.root.style.display !== v) e.root.style.display = v; };
  const place = (e, x, y, z, bias = 0) => {
    e.x = x; e.y = y; e.z = z;
    e.el.setAttribute("transform", tr(x, y, z));
    const k2 = 1000 + vDepth(x, y, z) + bias;
    if (k2 !== e.key) { e.key = k2; dirty = true; }
  };
  const setKey = (e, k2) => { if (e.key !== k2) { e.key = k2; dirty = true; } };

  /* ---------------------------------------------------------------- window and tool helpers */
  const setText = (name, text) => { const n = R(name); if (n && n.textContent !== text) n.textContent = text; };
  const setOn = (name, on) => { const n = R(name); if (!n) return; if (on) n.setAttribute("data-on", ""); else n.removeAttribute("data-on"); };
  const toolEl = { gauge: R("tool-gauge"), press: R("tool-press"), output: R("tool-output"), gate: R("tool-gate"), sweep: R("tool-sweep"), pan: R("scale-pan") };
  const setTool = (name, x, y, z) => toolEl[name] && toolEl[name].setAttribute("transform", x || y || z ? tr(x, y, z) : "");
  const needle = { g: R("g-needle"), s: R("s-needle") };
  const setNeedle = (which, v) => {
    const a = which === "g" ? -135 + 270 * clamp(v, -0.02, 1.02) : -90 + 180 * clamp(v, -0.02, 1.02);
    const b = needle[which].getAttribute("transform").match(/translate\(([^ ]+) ([^)]+)\)/);
    needle[which].setAttribute("transform", `translate(${b[1]} ${b[2]}) rotate(${a.toFixed(2)})`);
  };
  const lamps = (d) => {
    const map = { correct: "pass", ambiguous: "hold", incorrect: "reject" };
    for (const id of ["pass", "hold", "reject"]) {
      const on = d != null && map[d] === id;
      setOn("t-lamp-" + id, on); setOn("t-word-" + id, on);
      const b = R("beacon-" + id);
      if (b) { if (on) b.setAttribute("data-on", id); else b.removeAttribute("data-on"); }
    }
  };

  /* ---------------------------------------------------------------- the scenario's cast */
  let qcard, ticket, acard, drawer, drawerMove, drawerHolder, slips = [], qslips = [], strips = [], rows = [];
  const dropPos = (k) => [L.DROP.x - 15 + (k % 2) * 31, L.DROP.y + 10 + Math.floor(k / 2) * 13];
  const queueX = (j) => XBAR - 18 - 15 * j;
  const SW = L.BIN.x + L.BIN.w / 2; // sweeper / reject lane
  const BELT_FRONT = L.BELT.y + L.BELT.d;

  function clearDyn() {
    ents = ents.filter((e) => { if (e.id === "dyn") { e.root.remove(); return false; } return true; });
    snds.forEach((s) => s.el.remove());
    snds = []; slips = []; qslips = []; strips = []; rows = [];
    dirty = true;
  }

  function buildScenario() {
    clearDyn();
    M = derive(D, ST0.scenario);
    M.dropSlips = M.first.map((t2, i) => (t2.selected ? -1 : i)).filter((i) => i >= 0);
    M.queue = M.first.map((t2, i) => (t2.selected ? i : -1)).filter((i) => i >= 0); // paragraph slips that wait at the gate
    M.later.slice(0, M.newQ.length).forEach((t2, j) => { if (t2.selected) M.queue.push(100 + j); });
    M.pips = (n) => `${TT().caps.pips} ${n}/${M.first.length}`;
    const ZQ = L.FUNNEL;
    qcard = mkNode(
      slabSvg(26, 17, 1.6) + `<path class="vrm-qcard-tab" d="${topPoly([[-13, -8.5], [-13, 8.5], [-9, 8.5], [-9, -8.5]], 1.65)}"/>` + lineSvg(lineOnTop([-5, -3.5], [9, -3.5], 1.7, P) + lineOnTop([-5, 0], [9, 0], 1.7, P) + lineOnTop([-5, 3.5], [3, 3.5], 1.7, P), { tone: "lo", free: true }),
      "vrm-qcard", "funnel");
    ticket = mkNode(
      slabSvg(15, 10, 1.3) + `<path class="vrm-bar" style="fill:var(--hold)" d="${topPoly([[-7.5, -5], [-7.5, 5], [-4.5, 5], [-4.5, -5]], 1.35)}"/>` + S(slabOf({ x: -5, y: -4.2, w: 1.6, d: 1.6, r: 0.3 }, 1.3, 7.5, P, 2, 0), { tone: "mid", crease: "none" }) + S(slabOf({ x: 3.4, y: -4.2, w: 1.6, d: 1.6, r: 0.3 }, 1.3, 7.5, P, 2, 0), { tone: "mid", crease: "none" }),
      "vrm-ticket", "funnel");
    /* the drawer: back of the tray, the slips, the front of the tray; clipped to the opening in the feeder's right face */
    const D0 = L.DRAWER, fx = L.FEEDER.x + L.FEEDER.w;
    const stack = { x: fx - 38, y: BY - L.STACK.d / 2, w: L.STACK.w, d: L.STACK.d, r: 0.8 };
    let sl = "";
    for (let z = D0.floor + 2.6; z < STACK_TOP - 0.5; z += 2.6) sl += segment([stack.x, stack.y + stack.d, z], [stack.x + stack.w, stack.y + stack.d, z], P) + segment([stack.x + stack.w, stack.y, z], [stack.x + stack.w, stack.y + stack.d, z], P);
    const trayBack =
      S(slabOf({ x: fx - D0.len, y: D0.y0, w: D0.len, d: D0.y1 - D0.y0, r: 1.5 }, 5, 4, P, 2, 0.3), { tone: "lo", crease: "faint" }) +
      S(slabOf({ x: fx - D0.len, y: D0.y0, w: 2.6, d: D0.y1 - D0.y0, r: 0.6 }, 9, 10, P, 2, 0.25), { tone: "mid" }) +
      S(slabOf({ x: fx - D0.len, y: D0.y0, w: D0.len, d: 2.6, r: 0.6 }, 9, 10, P, 2, 0.25), { tone: "mid" }) +
      S(slabOf(stack, D0.floor, STACK_TOP - D0.floor, P, 2, 0.2), { tone: "mid", crease: "faint", inner: lineSvg(sl, { tone: "faint" }) });
    const trayFront =
      S(slabOf({ x: fx - D0.len, y: D0.y1 - 2.6, w: D0.len, d: 2.6, r: 0.6 }, 9, 10, P, 2, 0.25), { tone: "mid" }) +
      S(slabOf({ x: fx, y: D0.y0 - 1, w: 4, d: D0.y1 - D0.y0 + 2, r: 1 }, 5, 8, P, 2, 0.35), { tone: "mid" }) +
      S(slabOf({ x: fx + 4, y: BY - 6, w: 2.4, d: 12, r: 1 }, 7.4, 3, P, 2, 0.2), { tone: "hi" });
    drawer = mkNode("", "vrm-drawer");
    drawer.root.setAttribute("clip-path", `url(#${uid}drawer)`);
    drawer.key = 1000 + vDepth(fx + 24, BY, 12) - 14;
    drawerMove = document.createElementNS(NS, "g");
    drawerMove.innerHTML = trayBack;
    drawerHolder = document.createElementNS(NS, "g");
    drawerMove.appendChild(drawerHolder);
    const fr = document.createElementNS(NS, "g");
    fr.innerHTML = trayFront;
    drawerMove.appendChild(fr);
    drawer.el.appendChild(drawerMove);
    /* paragraph slips (top of the stack first), rewrite slips, sentence strips, answer card */
    slips = M.first.map((t2, i) => { const e = mkNode(slipArt(i, t2.prob, t2.selected), "vrm-slip"); e.t = t2; e.i = i; e.bar = e.el.querySelector('[data-ref="bar"]'); e.mark = e.el.querySelector('[data-ref="mark"]'); return e; });
    qslips = M.newQ.map((_, j) => { const e = mkNode(slipArt(j, 0, false), "vrm-slip vrm-qslip"); e.j = j; e.bar = e.el.querySelector('[data-ref="bar"]'); e.mark = e.el.querySelector('[data-ref="mark"]'); return e; });
    strips = M.sentences.map((s2, i) => { const e = mkNode(S(slabOf({ x: -L.STRIP.w / 2, y: -L.STRIP.d / 2, w: L.STRIP.w, d: L.STRIP.d, r: 0.6 }, 0, L.STRIP.t, P, 2, 0.15), { tone: "mid", crease: "none" }), "vrm-strip"); e.el.setAttribute("data-s", s2.kept ? "kept" : "dropped"); e.s = s2; e.i = i; return e; });
    acard = mkNode(slabSvg(30, 20, 1.6) + `<path class="vrm-inkmark" data-ref="ink" data-s="pass" d="${topPoly([[-12, 4], [-12, 8], [4, 8], [4, 4]], 1.65)}" style="display:none"/>` + lineSvg(lineOnTop([-12, -7], [10, -7], 1.7, P) + lineOnTop([-12, -3.5], [8, -3.5], 1.7, P) + lineOnTop([-12, 0], [4, 0], 1.7, P), { tone: "lo", free: true }), "vrm-acard");
    /* rows in the press window */
    const host = R("p-rows");
    host.innerHTML = "";
    const N = M.sentences.length, pitch = Math.min(6.4, 54 / Math.max(1, N)), h = Math.max(1.8, pitch - 1), ic = Math.min(h, 4.6);
    M.sentences.forEach((s2, i) => {
      const y = 2 + i * pitch;
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "vrm-row");
      g.setAttribute("data-s", "idle");
      g.innerHTML = `<rect class="vrm-row-track" x="11" y="${y}" width="62" height="${h}" rx="0.8"/><rect class="vrm-row-bar" data-r="bar" x="0" y="${y}" width="1" height="${h}" rx="0.4" transform="translate(11 0) scale(0.001 1)"/><rect class="vrm-row-ico" x="4" y="${y + (h - ic) / 2}" width="${ic + 2}" height="${ic}" rx="0.8"/><path class="vrm-row-mark" data-r="mark" d="${s2.kept ? `M4.9 ${y + h / 2}l1.2 1.3l2.2 -2.6` : `M5.1 ${y + h / 2 - 1.2}l3.2 2.4m0 -2.4l-3.2 2.4`}" style="opacity:0"/>`;
      host.appendChild(g);
      rows.push({ g, bar: g.querySelector('[data-r="bar"]'), mark: g.querySelector('[data-r="mark"]'), w: Math.max(0.8, 62 * s2.prob) });
    });
    buildClips();
    sounds();
    initialState();
    applyLang(true);
  }
  function slabSvg(w, d, t2) { return S(slabOf({ x: -w / 2, y: -d / 2, w, d, r: 1.4 }, 0, t2, P, 2, 0.25), { tone: "mid", crease: "none" }); }

  /* ---------------------------------------------------------------- clips: each step is a pure function of its own time */
  let curClip = null;
  const seg = (t0, t1, ease, fn) => curClip.segs.push({ t0, t1, ease, fn });
  const when = (t0, fn) => curClip.segs.push({ t0, t1: t0, ease: null, fn });
  const sound = (t0, key, x, y, z, s2) => curClip.snd.push({ t0, key, x, y, z, s: s2 || "" });
  const lin = (p) => p;
  const probe = (p) => setTool("gauge", 0, 0, -9 * smooth(p < 0.3 ? p / 0.3 : p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1));
  const newClip = (id) => { curClip = { id, dur: 1, segs: [], snd: [], chipAt: 1 }; clips.push(curClip); return curClip; };
  const homeOf = (e, where) => {
    if (e.home === where) return;
    e.home = where;
    (where === "drawer" ? drawerHolder : sceneG).appendChild(e.root);
    dirty = true;
  };
  const inDrawer = (e, i, lift) => {
    homeOf(e, "drawer");
    show(e, true);
    const z = STACK_TOP + (M.first.length - 1 - i) * L.SLIP.t + 0.15 + lift;
    e.el.setAttribute("transform", tr(XDEAL - L.DRAWER.open, BY, z));
    e.x = XDEAL; e.y = BY; e.z = z;
  };
  const onStack = (e, i) => { homeOf(e, "scene"); show(e, true); place(e, XDEAL, BY, STACK_TOP + (M.first.length - 1 - i) * L.SLIP.t + 0.15, 0); };

  function readOne(e, t0, prevV, w, lane) {
    // a slip travels to the probe, is read, and goes on to the lane (queue slot) or off the belt (pile slot)
    const tArr = t0 + 0.85, tRd = tArr + 0.35;
    seg(t0, t0 + 0.3, smooth, (p) => { homeOf(e, "scene"); show(e, true); place(e, lerp(XDEAL, XBELT0, p), BY, lerp(e.z0, ZB + 1.5, p)); });
    seg(t0 + 0.3, tArr, smooth, (p) => place(e, lerp(XBELT0, XG, p), BY, ZB));
    seg(tArr, tRd + 0.4, lin, probe);
    if (w != null) {
      seg(tArr + 0.05, tArr + 0.62, lin, (p) => {
        const cur = lerp(prevV, w, spring(p));
        setNeedle("g", cur); setText("g-read", fmt3(cur));
        e.bar.setAttribute("d", barPath(Math.max(0.8, 21 * w) * easeOut(prog(p, 0, 0.6)))); e.bar.style.display = "";
      });
    }
    sound(tArr + 0.05, "tick", XG + 24, BY + 8, 34, "");
    if (lane.q != null) {
      seg(tRd, tRd + 0.95, smooth, (p) => place(e, lerp(XG, queueX(lane.q), p), BY, ZB));
      when(tRd + 0.05, () => { e.mark.style.display = ""; e.el.setAttribute("data-s", "sel"); });
    } else {
      const [dx, dy] = dropPos(lane.drop);
      seg(tRd, tRd + 0.45, smooth, (p) => place(e, lerp(XG, L.DROP.x, p), BY, ZB));
      seg(tRd + 0.45, tRd + 0.85, easeIn, (p) => {
        const yy = lerp(BY, dy, p);
        place(e, lerp(L.DROP.x, dx, p), yy, yy > BELT_FRONT + 2 ? lerp(ZB, 0.2, smooth(prog(yy, BELT_FRONT + 2, dy))) : ZB, yy > BELT_FRONT ? 6 : 0);
      });
    }
    return tRd + 1.0;
  }

  function buildClips() {
    clips = [];
    const nQ = M.queue.length;
    /* 0 ask */
    newClip("ask").dur = 2.3;
    curClip.chipAt = 1.6;
    seg(0.15, 0.9, easeOut, (p) => { show(qcard, p > 0); qcard.root.style.opacity = p; });
    seg(0.15, 1.15, smooth, (p) => place(qcard, L.FUNNEL.cx, L.FUNNEL.cy, lerp(198, 170, p), 40));
    seg(1.15, 1.75, easeIn, (p) => place(qcard, L.FUNNEL.cx, L.FUNNEL.cy, lerp(170, 120, p), 40));
    when(1.78, () => show(qcard, false));
    when(1.5, () => setOn("badge-1", true));
    sound(0.25, "ask", L.FUNNEL.cx - 8, L.FUNNEL.cy, 208, "accent");

    /* 1 search */
    newClip("search").dur = 3.1;
    curClip.chipAt = 2.0;
    seg(0.1, 1.2, easeOut, (p) => drawerMove.setAttribute("transform", tr(L.DRAWER.open * p, 0, 0)));
    seg(0.1, 1.2, lin, (p) => setText("feed-count", String(Math.round(RETRIEVE_TOP * p))));
    seg(1.0, 2.3, lin, (p) => slips.forEach((e, i) => { const a = prog(p, i / (slips.length + 2), (i + 2) / (slips.length + 2)); if (p < 1) inDrawer(e, i, 3.4 * Math.sin(a * Math.PI) * (1 - i / 14)); }));
    when(2.31, () => slips.forEach((e, i) => onStack(e, i)));
    when(2.4, () => setOn("badge-2", true));
    sound(0.2, "search", L.DRAWER.y1 + 4, XDEAL + 6, 30, "accent");

    /* 2 inspect */
    const GAP = 0.64, nS = slips.length;
    newClip("inspect").dur = nS * GAP + 2.9;
    curClip.chipAt = nS * GAP + 1.8;
    slips.forEach((e, i) => {
      e.z0 = STACK_TOP + (nS - 1 - i) * L.SLIP.t + 0.15;
      const lane = e.t.selected ? { q: M.queue.indexOf(i) } : { drop: M.dropSlips.indexOf(i) };
      readOne(e, i * GAP + 0.1, i === 0 ? 0 : M.first[i - 1].prob, e.t.prob, lane);
      const tPip = i * GAP + 0.1 + 0.85 + 0.4;
      when(tPip, () => { const pip = svg.querySelector(`[data-ref="g-pips"] [data-i="${i}"]`); if (pip) { pip.setAttribute("data-on", ""); if (e.t.selected) pip.setAttribute("data-sel", ""); } setText("g-pips-cap", M.pips(i + 1)); });
    });

    /* 3 decide */
    newClip("decide");
    const mk = R("t-marker");
    seg(0.25, 1.35, smooth, (p) => { const v = M.best * p; mk.setAttribute("transform", `translate(${(7 + 62 * v).toFixed(2)} 0)`); setText("t-read", fmt3(v)); });
    when(1.4, () => lamps(M.decision));
    const sig = M.decision === "correct" ? "pass" : M.decision === "incorrect" ? "reject" : "hold";
    sound(1.4, "ding", ST.gate.x0 + 58, L.CAB_FRONT, 120, sig);
    let tOpen = 2.0;
    if (M.rewrote) {
      const R0 = L.RAIL, zt = R0.z - 10.5;
      const path = [[R0.fromX, R0.back], [R0.left, R0.back], [R0.left, R0.front], [L.FUNNEL.cx, R0.front]];
      const lens = []; let tot = 0;
      for (let i = 1; i < path.length; i++) { lens.push(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])); tot += lens[i - 1]; }
      const T1 = 1.9, T2 = T1 + 0.3 + 2.4;
      seg(T1, T1 + 0.3, easeOut, (p) => { clipOn(ticket, false); show(ticket, true); ticket.root.style.opacity = p; place(ticket, R0.fromX, R0.back, zt - 8 * (1 - p), 30); });
      seg(T1 + 0.3, T2, smooth, (p) => {
        let d = p * tot, i = 0;
        while (i < lens.length - 1 && d > lens[i]) { d -= lens[i]; i++; }
        const f = d / lens[i];
        place(ticket, lerp(path[i][0], path[i + 1][0], f), lerp(path[i][1], path[i + 1][1], f), zt, 60);
      });
      seg(T2, T2 + 0.45, easeIn, (p) => { clipOn(ticket, p > 0.08); place(ticket, L.FUNNEL.cx, R0.front, lerp(zt, 122, p), 60); });
      when(T2 + 0.5, () => show(ticket, false));
      sound(T1 + 0.05, "whirr", R0.fromX - 14, R0.back, R0.z + 12, "hold");
      sound(T2 + 0.1, "plop", L.FUNNEL.cx - 8, L.FUNNEL.cy, 176, "hold");
      const tq = T2 + 0.8;
      tOpen = tq;
      qslips.forEach((e, j) => {
        e.z0 = STACK_TOP + 1.5;
        const later = M.later[j];
        const lane = M.queue.includes(100 + j) ? { q: M.queue.indexOf(100 + j) } : { drop: M.dropSlips.length + j };
        const prev = j === 0 ? M.first[M.first.length - 1].prob : M.later[j - 1] ? M.later[j - 1].prob : M.first[M.first.length - 1].prob;
        const end = readOne(e, tq + j * 0.8, prev, later ? later.prob : null, lane);
        tOpen = Math.max(tOpen, end);
      });
      when(tOpen, () => lamps(M.finalDecision));
    }
    seg(tOpen, tOpen + 0.5, smooth, (p) => setTool("gate", 0, 0, 34 * p));
    curClip.dur = tOpen + 1.2;
    curClip.chipAt = tOpen + 0.3;

    /* 4 trim */
    newClip("trim");
    const nSent = M.sentences.length;
    const per = nSent > 12 ? 0.26 : 0.34;
    const qEnt = M.queue.map((id) => (id >= 100 ? qslips[id - 100] : slips[id]));
    const shares = M.queue.map((_, j) => Math.floor(nSent / nQ) + (j < nSent % nQ ? 1 : 0));
    const stripT = [];
    let tc = 0.5, cum = 0;
    qEnt.forEach((e, j) => {
      const tP = tc + 0.55;
      const xFrom = queueX(j);
      seg(Math.max(0.02, tc - 0.1), tP, smooth, (p) => place(e, lerp(xFrom, XP, p), BY, ZB));
      seg(tP, tP + 0.36, lin, (p) => setTool("press", 0, 0, -23 * (p < 0.42 ? easeIn(p / 0.42) : 1 - smooth((p - 0.42) / 0.58))));
      when(tP + 0.15, () => show(e, false));
      sound(tP + 0.14, "thunk", XP + 10, BY + 6, 86, "accent");
      for (let s2 = 0; s2 < shares[j]; s2++) stripT[cum + s2] = tP + 0.22 + s2 * per;
      cum += shares[j];
      tc = Math.max(tP + 0.5, tP + 0.22 + shares[j] * per - 0.1);
    });
    let tLast = 0;
    const pushes = [];
    let kk = 0, dd = 0;
    strips.forEach((e, i) => {
      const s2 = e.s, te = stripT[i];
      seg(te, te + 0.3, easeOut, (p) => { show(e, true); place(e, lerp(XP, XP + 22, p), BY, lerp(ZB + 5, ZB, p)); });
      seg(te + 0.3, te + 0.7, smooth, (p) => place(e, lerp(XP + 22, SW, p), BY, ZB));
      const r = rows[i];
      seg(te, te + 0.4, easeOut, (p) => { r.g.setAttribute("data-s", p > 0 ? (s2.kept ? "kept" : "dropped") : "idle"); r.bar.setAttribute("transform", `translate(11 0) scale(${(r.w * p + 0.001).toFixed(3)} 1)`); r.mark.style.opacity = p > 0.6 ? 1 : 0; });
      seg(te, te + per, lin, (p) => setText("c-f", String(Math.round(lerp(M.wordsA, M.wordsF, clamp((i + p) / nSent))))));
      if (s2.kept) {
        const k2 = kk++;
        const px = XPAN + ((k2 % 2) - 0.5) * 8, py = BY - 9 + (Math.floor(k2 / 2) % 4) * 6, pz = ZB + 4 + Math.floor(k2 / 8) * 1.5;
        seg(te + 0.7, te + 1.6, smooth, (p) => place(e, lerp(SW, px, p), lerp(BY, py, p), lerp(ZB, pz, smooth(prog(p, 0.75, 1))), 5));
        tLast = Math.max(tLast, te + 1.7);
      } else {
        const d2 = dd++;
        const bx = L.BIN.x + 10 + (d2 % 3) * 19, by = L.BIN.y + 6 + Math.floor(d2 / 3) * 6;
        const tp = te + 0.7;
        pushes.push(tp);
        seg(tp + 0.08, tp + 0.38, smooth, (p) => { place(e, SW, BY + 0.6 + 30 * p, ZB); setKey(e, BY + 0.6 + 30 * p > BELT_FRONT + 2 ? BIN_MID + 0.4 : e.key); });
        seg(tp + 0.38, tp + 0.7, easeIn, (p) => { place(e, lerp(SW, bx, p), lerp(BY + 30.6, by, p), lerp(ZB, 3.1, p)); setKey(e, BIN_MID + 0.4); });
        sound(tp + 0.62, "plink", bx, by + 4, 14, "reject");
        tLast = Math.max(tLast, tp + 0.75);
      }
    });
    seg(0, tLast + 0.5, lin, (p) => {
      const tt = p * (tLast + 0.5);
      let y = 0;
      for (const tp of pushes) { const u = tt - tp; if (u >= 0 && u <= 0.6) y = Math.max(y, u < 0.08 ? 2 * (u / 0.08) : u < 0.38 ? 2 + 30 * smooth((u - 0.08) / 0.3) : 32 * (1 - smooth((u - 0.38) / 0.22))); }
      setTool("sweep", 0, y, 0);
    });
    curClip.dur = tLast + 0.9;
    curClip.chipAt = Math.max(1.5, tLast - 1);

    /* 5 weigh */
    newClip("weigh").dur = 3.6;
    curClip.chipAt = 2.4;
    seg(0.2, 0.8, smooth, (p) => setTool("pan", 0, 0, -1.8 * p * M.suff));
    seg(0.4, 2.4, lin, (p) => { const v = lerp(0, M.suff, spring(p)); setNeedle("s", v); setText("s-read", fmt3(v)); });
    when(2.45, () => setOn(M.suff >= TH.tau_abstain ? "s-hi" : "s-lo", true));
    sound(0.45, "bong", ST.scale.x0 + 60, L.CAB_FRONT, 112, M.suff >= TH.tau_abstain ? "pass" : "");

    /* 6 answer */
    newClip("answer").dur = 4.0;
    curClip.chipAt = 2.0;
    const kept = strips.filter((e) => e.s.kept);
    seg(0, 0.5, smooth, (p) => kept.forEach((e) => { e.root.style.opacity = 1 - p; if (p >= 1) show(e, false); }));
    seg(0.2, 1.3, smooth, (p) => { show(acard, true); place(acard, lerp(XPAN + 40, XO, p), BY, ZB + 1.7, 5); });
    seg(1.4, 1.76, lin, (p) => setTool("output", 0, 0, -29 * (p < 0.42 ? easeIn(p / 0.42) : 1 - smooth((p - 0.42) / 0.58))));
    when(1.55, () => { const ink = acard.el.querySelector('[data-ref="ink"]'); ink.style.display = ""; ink.setAttribute("data-s", M.abstain ? "abstain" : "pass"); setText("o-cite", M.abstain ? "-" : M.citations.map((c) => `[${c}]`).join(" ") || "-"); });
    seg(1.55, 2.3, easeOut, (p) => showCard(p));
    sound(1.52, "stamp", XO + 6, BY + 18, 64, M.abstain ? "" : "pass");
  }

  function sounds() {
    snds.forEach((s2) => s2.el.remove());
    snds = [];
    clips.forEach((c, ci) => c.snd.forEach((s2) => {
      const p = iso([s2.x, s2.y, s2.z], P);
      const n = document.createElementNS(NS, "text");
      n.setAttribute("class", "vrm-snd");
      if (s2.s) n.setAttribute("data-s", s2.s);
      n.setAttribute("text-anchor", "middle");
      hudG.appendChild(n);
      snds.push({ el: n, ci, t0: s2.t0, key: s2.key, sx: p[0], sy: p[1] });
    }));
    snds.forEach((s2) => (s2.el.textContent = TT().snd[s2.key] || ""));
  }
  function sndFrame(ci, tt, final) {
    for (const s2 of snds) {
      if (s2.ci !== ci || final) { if (s2.el.style.opacity !== "0") s2.el.style.opacity = 0; continue; }
      const p = (tt - s2.t0) / 1.0;
      if (p < 0 || p > 1) { s2.el.style.opacity = 0; continue; }
      const o = p < 0.12 ? p / 0.12 : p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;
      s2.el.style.opacity = o.toFixed(2);
      s2.el.setAttribute("transform", `translate(${s2.sx.toFixed(1)} ${(s2.sy - 14 * easeOut(p)).toFixed(1)}) rotate(-6) scale(${(0.8 + 0.3 * easeOut(Math.min(1, p * 3))).toFixed(3)})`);
    }
  }

  function showCard(p) {
    const o = R("o-card");
    if (!o) return;
    const tt = TT(), st = M.abstain ? "abstain" : "pass";
    let h = `<rect class="vrm-ocard" x="5" y="5" width="66" height="48" rx="2.4"/>`;
    if (M.abstain) {
      h += `<text class="vrm-otext" x="38" y="25" text-anchor="middle" font-size="14" style="fill:var(--ink-3)">?</text>`;
      h += `<text class="vrm-cap" x="38" y="33" text-anchor="middle" font-size="5.6">${esc(cut(tt.noEvidence, 24))}</text>`;
    } else {
      h += wrapText(M.answer, 21, 3).map((ln, i) => `<text class="vrm-otext" x="9" y="${15 + i * 7.4}" font-size="6.4">${esc(ln)}</text>`).join("");
      h += `<text class="vrm-digits" x="9" y="36" font-size="6">${esc(M.citations.map((c) => `[${c}]`).join(" "))}</text>`;
    }
    const sc = 1 + 1.4 * (1 - easeOut(clamp(p)));
    const label = M.abstain ? tt.stamp.abstain : tt.stamp.pass, w = M.abstain ? 42 : 34;
    h += `<g class="vrm-stamp" data-s="${st}" transform="translate(${M.abstain ? 38 : 40} 43) rotate(-7) scale(${(sc * 1.22).toFixed(3)})" style="opacity:${clamp(p * 1.6).toFixed(2)}"><rect x="${-w / 2}" y="-6.2" width="${w}" height="12.4" rx="2"/>${M.abstain ? `<path d="M${-w / 2 + 4} -1.6a2 2 0 1 1 2.6 1.9c-.5.3-.8.6-.8 1.1M${-w / 2 + 6.4} 3.3v.1"/>` : `<path d="M${-w / 2 + 3.6} 0.4l1.8 1.9l3.2 -3.8"/>`}<text x="${M.abstain ? 4 : 4.6}" y="2.1" text-anchor="middle" font-size="${ST0.lang === "ar" ? 6.4 : 5.2}">${esc(label)}</text></g>`;
    o.innerHTML = h;
  }

  function initialState() {
    drawerMove.setAttribute("transform", tr(0, 0, 0));
    for (const nme of ["gauge", "press", "output", "gate", "sweep", "pan"]) setTool(nme, 0, 0, 0);
    setNeedle("g", 0); setNeedle("s", 0);
    setText("g-read", "0.000"); setText("s-read", "0.000"); setText("t-read", "--"); setText("feed-count", "--");
    setText("c-a", String(M.wordsA)); setText("c-f", String(M.wordsA)); setText("s-line", fmt2(TH.tau_abstain)); setText("o-cite", "--");
    setText("g-pips-cap", TT().caps.pips);
    svg.querySelectorAll('[data-ref="g-pips"] .vrm-pip').forEach((p) => { p.removeAttribute("data-on"); p.removeAttribute("data-sel"); });
    R("t-marker").setAttribute("transform", "translate(7 0)");
    lamps(null);
    setOn("s-hi", false); setOn("s-lo", false);
    for (let i = 1; i <= 7; i++) setOn("badge-" + i, false);
    rows.forEach((r) => { r.g.setAttribute("data-s", "idle"); r.bar.setAttribute("transform", "translate(11 0) scale(0.001 1)"); r.mark.style.opacity = 0; });
    R("o-card").innerHTML = "";
    [qcard, ticket, acard, ...qslips, ...strips].forEach((e) => { show(e, false); e.root.style.opacity = ""; e.key = 1000; e.home = "scene"; sceneG.appendChild(e.root); });
    slips.forEach((e, i) => { e.home = "scene"; e.key = 0; e.el.removeAttribute("data-s"); inDrawer(e, i, 0); show(e, true); });
    [...slips, ...qslips].forEach((e) => { e.bar.style.display = "none"; e.bar.setAttribute("d", ""); e.mark.style.display = "none"; e.el.removeAttribute("data-s"); });
    strips.forEach((e) => (e.root.style.opacity = ""));
    const ink = acard.el.querySelector('[data-ref="ink"]'); ink.style.display = "none";
    qslips.forEach((e) => e.el.removeAttribute("data-s"));
    sceneG.appendChild(drawer.root);
    dirty = true;
    resort();
    snds.forEach((s2) => (s2.el.style.opacity = 0));
    chipUpTo = -1;
  }

  /* ---------------------------------------------------------------- hint, chips, texts */
  const hintEl = q(".vrm-hint-t"), hintN = q(".vrm-hint-n"), chipsEl = q(".vrm-chips"), ideaEl = q(".vrm-idea");
  function setHint(i) {
    if (!hintEl) return;
    const tt = TT();
    if (i < 0) { hintN.hidden = true; hintEl.textContent = doneIdx >= 6 ? tt.stepDone : tt.start; return; }
    hintN.hidden = false;
    hintN.textContent = String(i + 1);
    hintEl.textContent = tt.hints[STEP_IDS[i]](M);
  }
  const outState = (o) => ({ correct: "pass", hallucinate: "reject", planted: "plant", abstain: "abstain" }[o] || "");
  function chipsFor(i) {
    const c = TT().chips, out = [];
    switch (STEP_IDS[i]) {
      case "ask": out.push({ k: c.q, v: `<i class="vrm-q">${esc(M.question)}</i>`, wide: 1 }); break;
      case "search": out.push({ k: c.pulled, v: c.pulledV(RETRIEVE_TOP, M.first.length), m: 1 }); break;
      case "inspect": out.push({ k: c.best, v: fmt3(M.best), m: 1 }, { k: c.passed, v: c.passedV(M.selFirst.length, M.first.length) }); break;
      case "decide": {
        const s2 = M.decision === "correct" ? "pass" : M.decision === "incorrect" ? "reject" : "hold";
        out.push({ k: c.decision, v: `${c.dec[M.decision]}: ${c.decV(M.decision)}`, s: s2 });
        if (M.rewrote) { M.newQ.forEach((nq) => out.push({ k: c.again, v: `<i class="vrm-q">${esc(cut(nq, 64))}</i>`, s: "hold" })); out.push({ k: c.total, v: String(M.nRetrieved), m: 1 }); }
        break;
      }
      case "trim": {
        out.push({ k: c.sent, v: c.sentV(M.kept.length, M.dropped.length) }, { k: c.words, v: `${M.wordsA} → ${M.wordsF}`, m: 1 });
        M.kept.slice(0, 2).forEach((x) => out.push({ k: "+ " + fmt3(x.prob), v: esc(cut(x.text, 64)), s: "pass" }));
        if (M.dropped[0]) out.push({ k: "− " + fmt3(M.dropped[0].prob), v: esc(cut(M.dropped[0].text, 64)), s: "reject" });
        break;
      }
      case "weigh": { const ok = M.suff >= TH.tau_abstain; out.push({ k: c.enough, v: c.enoughV(M.suff, ok), s: ok ? "pass" : "abstain" }); break; }
    }
    return out;
  }
  const chipHtml = (c, old) => `<li class="vrm-chip"${c.s ? ` data-s="${c.s}"` : ""}${c.wide ? " data-wide" : ""}${old ? " data-old" : ""}>${c.s ? ICON[c.s] : ""}<b>${c.k}</b><span${c.m ? ' class="m"' : ""}>${c.v}</span></li>`;
  function compareHtml(old) {
    const c = TT().chips;
    const card = (k2, text, state, word) => `<li data-s="${state}"${old ? " data-old" : ""}><span class="k">${k2}</span><span class="a">${esc(text)}</span>${word ? `<span class="v">${ICON[state] || ""}${word}</span>` : ""}</li>`;
    const aT = M.A.outcome === "abstain" ? c.idk : M.aAnswer;
    const fT = M.abstain ? c.idk : M.answer + (M.citations.length ? "  " + M.citations.map((x) => `[${x}]`).join("") : "");
    return `<ul class="vrm-cmp">${card(c.gold, M.gold, "pass", "")}${card(c.plain, aT, outState(M.aOutcome), c.out[M.aOutcome])}${card(c.line, fT, outState(M.fOutcome), c.out[M.fOutcome])}</ul>`;
  }
  function renderChips() {
    if (!chipsEl) return;
    if (chipUpTo === chipDrawn) return;
    const i = chipUpTo;
    let h = "";
    if (i === 6) h = `<li class="vrm-cmpwrap">${compareHtml(false)}</li>`;
    else if (i >= 0) h = chipsFor(i).map((c) => chipHtml(c, false)).join("");
    chipsEl.innerHTML = h;
    chipDrawn = chipUpTo;
  }
  function applyLang(initial) {
    const tt = TT();
    svg.setAttribute("data-lang", ST0.lang);
    svg.setAttribute("aria-label", tt.label);
    root.setAttribute("aria-label", tt.label);
    root.setAttribute("dir", ST0.lang === "ar" ? "rtl" : "ltr");
    root.setAttribute("lang", ST0.lang === "ar" ? "ar-EG" : "en");
    for (const [k2, v] of Object.entries(tt.plates)) setText("plate-" + k2, v);
    setText("feed-cap", tt.caps.feed); setText("c-cap", tt.caps.words); setText("t-read-cap", tt.caps.best); setText("s-line-cap", tt.caps.line); setText("o-cite-cap", tt.caps.cite);
    setText("s-lo", tt.caps.lo); setText("s-hi", tt.caps.hi); setText("bin-label", tt.caps.bin);
    for (const [k2, v] of Object.entries(tt.lamp)) setText("t-word-" + k2, v);
    if (!M.pips) M.pips = () => "";
    if (doneIdx < 0 && !running) setText("g-pips-cap", tt.caps.pips);
    snds.forEach((s2) => (s2.el.textContent = tt.snd[s2.key] || ""));
    if (ideaEl) ideaEl.textContent = tt.idea;
    if (chipsEl) chipsEl.setAttribute("aria-label", tt.chips.q);
    chipDrawn = -2;
    renderChips();
    if (!initial) setHint(idx);
    renderControls();
  }

  /* ---------------------------------------------------------------- controls */
  const ctl = q(".vrm-controls");
  function renderControls() {
    if (!ctl) return;
    const tt = TT();
    ctl.innerHTML =
      `<ol class="vrm-steps">${STEP_IDS.map((id, i) => `<li><button type="button" class="vrm-step" data-i="${i}"><span class="vrm-n">${i + 1}</span><span class="vrm-l">${tt.steps[i]}</span></button></li>`).join("")}</ol>` +
      `<div class="vrm-modew"><p class="vrm-lab">${tt.modeLabel}</p><div class="vrm-seg" role="group" aria-label="${tt.modeLabel}">${["manual", "auto"].map((m2) => `<button type="button" data-mode="${m2}" aria-pressed="${ST0.mode === m2}">${tt.mode[m2]}</button>`).join("")}</div></div>` +
      `<div class="vrm-scnw"><p class="vrm-lab">${tt.scenarioLabel}</p><div class="vrm-scn" role="radiogroup" aria-label="${tt.scenarioLabel}">${Object.keys(tt.scn).map((k2) => `<button type="button" role="radio" data-scn="${k2}" aria-checked="${ST0.scenario === k2}">${tt.scn[k2]}</button>`).join("")}</div></div>` +
      `<button type="button" class="vrm-reset">${tt.reset}</button>`;
    updateControls();
  }
  function updateControls() {
    if (!ctl) return;
    ctl.querySelectorAll(".vrm-step").forEach((b) => {
      const i = +b.getAttribute("data-i");
      const st = running && i === idx ? "running" : i <= doneIdx ? "done" : i === doneIdx + 1 && ST0.mode === "manual" && !running ? "next" : "todo";
      b.setAttribute("data-state", st);
      b.disabled = st !== "next";
      b.setAttribute("aria-label", `${i + 1}. ${TT().steps[i]}`);
      if (st === "running") b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    ctl.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === ST0.mode)));
    ctl.querySelectorAll("[data-scn]").forEach((b) => b.setAttribute("aria-checked", String(b.getAttribute("data-scn") === ST0.scenario)));
  }
  if (ctl) {
    ctl.addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      if (b.classList.contains("vrm-step")) api.next();
      else if (b.hasAttribute("data-mode")) api.setMode(b.getAttribute("data-mode"));
      else if (b.hasAttribute("data-scn")) api.setScenario(b.getAttribute("data-scn"));
      else if (b.classList.contains("vrm-reset")) api.reset();
    });
  }
  root.addEventListener("keydown", (ev) => {
    const tag = ev.target && ev.target.tagName;
    if ((ev.key === " " || ev.key === "Enter") && tag !== "BUTTON" && tag !== "SELECT") { ev.preventDefault(); api.next(); }
  });

  /* ---------------------------------------------------------------- the player */
  const anchors = () => ({
    0: iso([70, 117, 90], P), 1: iso([100, 117, 60], P), 2: iso([215, 100, 62], P), 3: iso([270, 70, 90], P), 4: iso([505, 112, 56], P), 5: iso([625, 92, 60], P), 6: iso([735, 100, 62], P),
  });
  let narrow = false, bw = L.W, bh = L.H;
  function metrics() {
    const sw = stage.clientWidth || 800;
    const nw = sw < 560;
    if (nw !== narrow || svg.getAttribute("preserveAspectRatio") == null) {
      narrow = nw;
      svg.setAttribute("preserveAspectRatio", nw ? "xMidYMid slice" : "xMidYMid meet");
      svg.style.aspectRatio = nw ? "1 / 0.9" : "";
    }
    const sh = svg.clientHeight || sw * (L.H / L.W);
    const sc = Math.max(sw / L.W, sh / L.H);
    bw = narrow ? sw / sc : L.W;
    bh = narrow ? sh / sc : L.H;
    return sw;
  }
  function camTarget(i) {
    const sw = metrics();
    let want = L.W; // visible width in drawing units
    if (narrow) want = i === 3 ? 560 : 430;
    else if (sw < 760) want = i < 0 ? L.W : 640;
    const z = Math.max(0.2, bw / want);
    const a = anchors()[Math.max(0, i)];
    cam.ts = z;
    const hw = bw / (2 * z), hh = bh / (2 * z);
    cam.tx = hw >= L.W / 2 ? L.W / 2 : clamp(a[0], hw, L.W - hw);
    cam.ty = hh >= L.H / 2 ? L.H / 2 : clamp(a[1], hh, L.H - hh);
    if (!narrow && z <= 1.001) { cam.tx = L.W / 2; cam.ty = L.H / 2; cam.ts = 1; }
  }
  function drawCam(snap) {
    if (snap) { cam.x = cam.tx; cam.y = cam.ty; cam.s = cam.ts; }
    camG.setAttribute("transform", cam.s === 1 && Math.abs(cam.x - L.W / 2) < 0.01 && Math.abs(cam.y - L.H / 2) < 0.01 ? "" : `translate(${L.W / 2} ${L.H / 2}) scale(${cam.s.toFixed(4)}) translate(${(-cam.x).toFixed(2)} ${(-cam.y).toFixed(2)})`);
  }
  function evalClip(c, tt, final) {
    for (const s2 of c.segs) {
      if (tt < s2.t0 - 1e-9) continue;
      if (s2.ease === null) { s2.fn(); continue; }
      s2.fn(s2.ease(clamp((tt - s2.t0) / (s2.t1 - s2.t0 || 1e-6))));
    }
    sndFrame(clips.indexOf(c), tt, final || mq.matches);
    if (tt >= c.chipAt - 1e-9 && chipUpTo < clips.indexOf(c)) chipUpTo = clips.indexOf(c);
  }
  function applyUpTo(n) { // reset, then every step up to n at its final moment
    initialState();
    for (let j = 0; j <= n; j++) evalClip(clips[j], clips[j].dur + 1, true);
    chipUpTo = n;
    resort();
    renderChips();
  }
  function frame(now) {
    raf = 0;
    if (destroyed) return;
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    let busy = false;
    if (running && visible) {
      t += dt * speed;
      const c = clips[idx];
      if (t >= c.dur) { evalClip(c, c.dur, false); finish(); }
      else { evalClip(c, t, false); busy = true; }
    } else if (running) busy = true;
    // camera follows with a critically damped ease
    const k2 = 1 - Math.exp(-dt / 0.35);
    cam.x += (cam.tx - cam.x) * k2; cam.y += (cam.ty - cam.y) * k2; cam.s += (cam.ts - cam.s) * k2;
    const camBusy = Math.abs(cam.tx - cam.x) > 0.05 || Math.abs(cam.ty - cam.y) > 0.05 || Math.abs(cam.ts - cam.s) > 0.001;
    if (!camBusy) { cam.x = cam.tx; cam.y = cam.ty; cam.s = cam.ts; }
    drawCam(false);
    resort();
    renderChips();
    if (busy || camBusy) schedule();
  }
  const schedule = () => { if (!raf && !destroyed) { last = 0; raf = requestAnimationFrame(frame); } };
  function start(i) {
    clearTimeout(timer);
    idx = i; t = 0; running = true;
    setHint(i);
    camTarget(i);
    emit("step", { index: i, id: STEP_IDS[i], scenario: ST0.scenario });
    updateControls();
    if (mq.matches) { evalClip(clips[i], clips[i].dur + 1, true); camTarget(i); drawCam(true); resort(); renderChips(); finish(); return; }
    evalClip(clips[i], 0, false);
    resort();
    schedule();
  }
  function finish() {
    running = false;
    doneIdx = idx;
    updateControls();
    emit("done", { index: idx, id: STEP_IDS[idx], scenario: ST0.scenario });
    if (ST0.mode === "auto") {
      clearTimeout(timer);
      const calm = mq.matches;
      timer = setTimeout(() => {
        if (destroyed || ST0.mode !== "auto") return;
        if (idx >= 6) { api.reset(); api.next(); } else api.next();
      }, idx >= 6 ? (calm ? 5000 : 4200) : calm ? 1800 : 1000);
    }
  }
  function visibleHook() {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) schedule(); }, { rootMargin: "120px 0px" });
    io.observe(root);
    api._io = io;
  }

  /* ---------------------------------------------------------------- public API */
  const api = {
    element: root,
    go(i) {
      i = clamp(Math.round(i), 0, 6);
      clearTimeout(timer);
      running = false;
      applyUpTo(i - 1);
      doneIdx = i - 1;
      start(i);
      return api;
    },
    next() {
      if (running || destroyed) return api;
      if (doneIdx >= 6) { if (ST0.mode === "auto") { api.reset(); api.go(0); } return api; }
      if (doneIdx + 1 !== idx || idx < 0) { /* idle: play the following step */ }
      start(doneIdx + 1);
      return api;
    },
    reset() {
      clearTimeout(timer);
      running = false; idx = -1; doneIdx = -1;
      initialState();
      camTarget(idx); drawCam(true);
      setHint(-1);
      chipDrawn = -2; renderChips();
      updateControls();
      emit("reset", { scenario: ST0.scenario });
      return api;
    },
    setScenario(key) {
      if (!(key in D.scenarios)) return api;
      clearTimeout(timer);
      running = false; idx = -1; doneIdx = -1;
      ST0.scenario = key;
      buildScenario();
      camTarget(idx); drawCam(true);
      setHint(-1);
      updateControls();
      emit("scenario", { scenario: key });
      if (ST0.mode === "auto") timer = setTimeout(() => api.next(), 700);
      return api;
    },
    setLang(l) {
      ST0.lang = l === "ar" ? "ar" : "en";
      const was = running;
      if (was) { running = false; }
      applyLang(false);
      if (idx >= 0) { applyUpTo(was ? idx - 1 : doneIdx); if (was) { doneIdx = idx - 1; start(idx); } }
      emit("lang", { lang: ST0.lang });
      return api;
    },
    setMode(m2) {
      ST0.mode = m2 === "auto" ? "auto" : "manual";
      clearTimeout(timer);
      updateControls();
      if (ST0.mode === "auto" && !running) timer = setTimeout(() => api.next(), doneIdx < 0 ? 500 : 900);
      emit("mode", { mode: ST0.mode });
      return api;
    },
    on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); return api; },
    off(name, fn) { listeners[name] = (listeners[name] || []).filter((f) => f !== fn); return api; },
    getState() { return { scenario: ST0.scenario, lang: ST0.lang, mode: ST0.mode, index: idx, done: doneIdx, running, id: STEP_IDS[idx] || null }; },
    // verification hooks: freeze step i at time s (seconds), or change the playback speed
    seek(i, s2) { clearTimeout(timer); running = false; applyUpTo(i - 1); idx = i; doneIdx = i - 1; setHint(i); camTarget(i); drawCam(true); evalClip(clips[i], clamp(s2, 0, clips[i].dur), false); resort(); renderChips(); updateControls(); return api; },
    duration(i) { return clips[i].dur; },
    setSpeed(x) { speed = x; return api; },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
      if (api._io) api._io.disconnect();
      el.innerHTML = "";
    },
  };
  buildScenario();
  camTarget(idx); drawCam(true);
  setHint(-1);
  visibleHook();
  if (typeof ResizeObserver === "function") new ResizeObserver(() => { if (!destroyed) { camTarget(idx); if (!raf) schedule(); } }).observe(stage);
  if (ST0.mode === "auto") timer = setTimeout(() => api.next(), 800);
  return api;
}
window.VRAGMachine = { mount, version: "1.0.0", steps: STEP_IDS.slice() };
