// SOC-13.4: the one look. One drawing file for every Insta Creator slide (normal and series), on a 1080x1350 canvas.
// Plain script: sets window.OneLook. Source of the drawing: NightMode specs/SOC-13-look-reference.js, ported to the OneLook API.
// The helpers below (C, BALOO, CAVEAT, pad3, rng .. underline, wrapLines, the FACE-SAFE block) are copied unchanged from dist/cover-series/index.html.
// No random numbers anywhere: the same input always draws the same picture.
(function () {
const C = { pink:'#f29bd0', hot:'#ee3f9a', purple:'#3a1150', cream:'#faf1e2', yellow:'#ffd21e', lilac:'#f1e0f7', soft:'#f9c9e6' };
const BALOO = "'Baloo 2', 'Arial Rounded MT Bold', 'Helvetica Neue', Arial, sans-serif";
const CAVEAT = "Caveat, 'Bradley Hand', 'Segoe Script', cursive";
const pad3 = n => '#' + String(Math.max(0, Math.min(999, n | 0))).padStart(3, '0');
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function noise1(r, n) { const a = Array.from({ length: n + 2 }, () => r() * 2 - 1); return t => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return a[i] * (1 - u) + a[i + 1] * u; }; }
// Rounded rect outline sampled finely, each point pushed along its normal by noise.
// brush = torn paint ends (left/right) with bristle spikes; otherwise a gentle hand-cut edge.
function roughRect(ctx, x, y, w, h, rad, amp, seed, brush) {
  const r = rng(seed), pts = [], step = brush ? 4 : 7;
  rad = Math.min(rad, w / 2, h / 2);
  const add = (px, py, nx, ny, side) => pts.push([px, py, nx, ny, side]);
  const line = (x0, y0, x1, y1, nx, ny, side) => { const L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / step)); for (let i = 0; i < n; i++) add(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, nx, ny, side); };
  const arc = (cx, cy, a0, a1, side) => { const n = Math.max(3, Math.round(rad * Math.abs(a1 - a0) / step)); for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; add(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, Math.cos(a), Math.sin(a), side); } };
  line(x + rad, y, x + w - rad, y, 0, -1, 'h'); arc(x + w - rad, y + rad, -Math.PI / 2, 0, 'e');
  line(x + w, y + rad, x + w, y + h - rad, 1, 0, 'e'); arc(x + w - rad, y + h - rad, 0, Math.PI / 2, 'e');
  line(x + w - rad, y + h, x + rad, y + h, 0, 1, 'h'); arc(x + rad, y + h - rad, Math.PI / 2, Math.PI, 'e');
  line(x, y + h - rad, x, y + rad, -1, 0, 'e'); arc(x + rad, y + rad, Math.PI, Math.PI * 1.5, 'e');
  const n = pts.length, lo = noise1(r, Math.max(4, n / 14)), mid = noise1(r, Math.max(8, n / 5));
  ctx.beginPath();
  pts.forEach((p, i) => {
    let d = amp * (0.7 * lo(i / 14) + 0.3 * mid(i / 5));
    if (brush) {
      const spike = r();
      d = (p[4] === 'e' ? amp * 1.5 * (spike * 2 - 0.8) : amp * 0.35 * (spike * 2 - 1)) + d * 0.5;
    }
    const X = p[0] + p[2] * d, Y = p[1] + p[3] * d;
    i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  });
  ctx.closePath();
}
function fillRough(ctx, x, y, w, h, rad, amp, seed, brush, color) { roughRect(ctx, x, y, w, h, rad, amp, seed, brush); ctx.fillStyle = color; ctx.fill(); }

// block with text; returns {x,y,w,h}
function block(ctx, o) {
  ctx.font = o.font; ctx.textBaseline = 'alphabetic';
  const tw = ctx.measureText(o.text).width;
  const w = tw + o.padL + o.padR, h = o.size * (o.lh || 1) + o.padT + o.padB;
  const ins = o.ins || [0, 0, 0, 0];
  fillRough(ctx, o.x - ins[3], o.y - ins[0], w + ins[1] + ins[3], h + ins[0] + ins[2], o.rad, o.amp, o.seed, o.brush, o.color);
  ctx.fillStyle = C.purple;
  ctx.fillText(o.text, o.x + o.padL, o.y + o.padT + o.size * (o.base || 0.78));
  return { x: o.x, y: o.y, w, h };
}
function underline(ctx, x1, x2, y, color, tilt) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y + tilt); ctx.stroke(); ctx.restore();
}
function wrapLines(ctx, text, maxW) {
  const out = []; let line = '';
  text.split(/\s+/).filter(Boolean).forEach(wd => { const t = line ? line + ' ' + wd : wd; if (line && ctx.measureText(t).width > maxW) { out.push(line); line = wd; } else line = t; });
  if (line) out.push(line); return out;
}
// FACE-SAFE-BEGIN (pure; unit-tested by tests/cover-series-facesafe.test.mjs)
// Move the PHOTO so the face box clears every element rect. All values are canvas px.
// faceBox {x,y,w,h} as currently drawn; elementZone = rect or array of rects;
// slack = how far the photo may still move each way without exposing an edge.
// Returns deltas to apply to the photo, plus a small leftward elementShift only when
// panning alone cannot clear the face (cleared:false if even that is not enough).
function placeFaceSafe(o) {
  const none = { photoOffsetX: 0, photoOffsetY: 0, scale: 1, elementShift: { x: 0, y: 0 }, cleared: true };
  const f = o && o.faceBox;
  if (!f || !(f.w > 0) || !(f.h > 0) || ![f.x, f.y, f.w, f.h].every(Number.isFinite)) return none;
  const zones = [].concat(o.elementZone || []).filter(z => z && z.w > 0 && z.h > 0);
  if (!zones.length) return none;
  const m = o.margin == null ? 12 : o.margin, maxEl = o.maxElementShift == null ? 24 : o.maxElementShift;
  const sl = Object.assign({ left: Infinity, right: Infinity, up: Infinity, down: Infinity }, o.slack || {});
  const W = o.canvasW, H = o.canvasH;
  const ov = (a, b, k) => Math.max(0, Math.min(a.x + a.w, b.x + b.w + k) - Math.max(a.x, b.x - k)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h + k) - Math.max(a.y, b.y - k));
  const area = (fb, zs, k) => zs.reduce((t, z) => t + ov(fb, z, k), 0);
  if (!area(f, zones, m)) return none;
  const inside = (dx, dy) => dx >= -sl.left && dx <= sl.right && dy >= -sl.up && dy <= sl.down && f.x + dx >= 0 && f.x + f.w + dx <= W && f.y + dy >= 0 && f.y + f.h + dy <= H;
  const at = (dx, dy) => ({ x: f.x + dx, y: f.y + dy, w: f.w, h: f.h });
  const xs = [], ys = [];
  zones.forEach(z => {
    xs.push(z.x + z.w + m - f.x, z.x - m - (f.x + f.w));
    ys.push(z.y + z.h + m - f.y, z.y - m - (f.y + f.h));
  });
  const cands = xs.map(dx => [dx, 0]).concat(ys.map(dy => [0, dy]));
  const good = cands.filter(c => inside(c[0], c[1]) && !area(at(c[0], c[1]), zones, m));
  if (good.length) {
    good.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    return Object.assign({}, none, { photoOffsetX: good[0][0], photoOffsetY: good[0][1] });
  }
  // cannot clear by panning: go as far as allowed toward the least overlap, then nudge elements left
  const lim = [[Math.min(sl.right, W - f.x - f.w), 0], [-Math.min(sl.left, f.x), 0], [0, Math.min(sl.down, H - f.y - f.h)], [0, -Math.min(sl.up, f.y)]];
  let best = [0, 0], bestA = area(f, zones, m);
  lim.forEach(c => { const a = area(at(c[0], c[1]), zones, m); if (a < bestA - 1e-6 || (Math.abs(a - bestA) < 1e-6 && Math.hypot(c[0], c[1]) < Math.hypot(best[0], best[1]))) { best = c; bestA = a; } });
  const fb = at(best[0], best[1]);
  let sx = 0;
  while (sx <= maxEl && area(fb, zones.map(z => ({ x: z.x - sx, y: z.y, w: z.w, h: z.h })), m)) sx++;
  const cleared = sx <= maxEl;
  return { photoOffsetX: best[0], photoOffsetY: best[1], scale: 1, elementShift: { x: -(cleared ? sx : maxEl), y: 0 }, cleared };
}
// Same method as photobooth covers.js faceBoost(): native FaceDetector, never throws.
// Pads are lighter than covers.js (it pads for hair+chin to frame a crop; here the box is a keep-clear zone).
async function detectFace(img) {
  try {
    if (typeof window.FaceDetector !== 'function') return null;
    const faces = await new window.FaceDetector({ fastMode: true, maxDetectedFaces: 8 }).detect(img);
    if (!faces || !faces.length) return null;
    const bs = faces.map(f => f.boundingBox || f).filter(b => b && b.width > 0 && b.height > 0);
    if (!bs.length) return null;
    const b = bs.sort((a, c) => c.width * c.height - a.width * a.height)[0];
    return { x: b.x - b.width * 0.08, y: b.y - b.height * 0.12, w: b.width * 1.16, h: b.height * 1.24 };
  } catch (e) { return null; }
}
// FACE-SAFE-END

const T = { W: 1080, H: 1350, margin: 48, bottom: 96, maxTextTop: 0.5, titleMaxW: 800, subMaxW: 700,
  titleSize: [84, 72], titleMin: 48, titleStep: 6, subSize: 38, subMin: 30, subLH: 1.22, kickerSize: 58, numSize: 130,
  handleSize: 46, counterSize: 30, swipeSize: 48, K: 0.6,
  // SOC-18.1: the 1080x1920 reel safe zone (addendum SOC-17 2026-11-20; capY is the approved prototype's caption centre)
  SAFE: { top: 260, bottom: 1700, left: 48, right: 940, capW: 800, capBottom: 1640, capY: 1560 } };
const coverDefaults = () => ({ kicker: 'Dr Liz London', h1: 'Using', h2: 'AI', h3: 'to Earn More', h4: 'and', h5: 'Work Less' });

function fontsReady() {
  try {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all(["800 40px 'Baloo 2'", "700 30px 'Baloo 2'", "600 38px 'Baloo 2'", "700 italic 40px Caveat"].map(f => document.fonts.load(f)))
      .then(() => document.fonts.ready).then(() => undefined, () => undefined);
  } catch (e) { return Promise.resolve(); }
}

// ---------- shared pieces ----------
function rectsOf() { const rects = []; return { rects, R(r, p) { p = p || 0; if (!(r.w > 0) || !(r.h > 0)) return; rects.push({ x: r.x - p, y: r.y - p, w: r.w + 2 * p, h: r.h + 2 * p }); } }; }
function counter(ctx, i, total) {
  const font = '700 ' + T.counterSize + 'px ' + BALOO; ctx.font = font;
  const text = (i + 1) + ' / ' + total, w = ctx.measureText(text).width + 40;
  return block(ctx, { x: T.W - T.margin - w, y: 52, text, font, size: T.counterSize, padL: 20, padR: 20, padT: 8, padB: 10, rad: 20, amp: 2.5, seed: 77, color: C.cream, base: 0.86 });
}
function layout(ctx, s, titleSize, subSize) {
  ctx.font = '800 ' + titleSize + 'px ' + BALOO; const tl = s.title ? wrapLines(ctx, s.title, T.titleMaxW - 56) : [];
  ctx.font = '600 ' + subSize + 'px ' + BALOO; const sl = s.sub ? wrapLines(ctx, s.sub, T.subMaxW - 68) : [];
  let h = 0;
  if (s.num || s.kicker) h += (s.num ? T.numSize * 0.95 + 6 : T.kickerSize + 30) + 14;
  h += tl.length * (titleSize + 18 - 4) + (tl.length ? 14 : 0);
  if (sl.length) h += 24 + sl.length * subSize * T.subLH + 26;
  if (s.swipe) h += 14 + T.swipeSize + 26;
  return { tl, sl, h };
}
// SOC-18.10: every movable block is drawn through g(name, fn). fn(c, R) draws on c and reports its rects through R (the same
// calls drawText/drawSeries always made). With no offset for the name, fn runs once, on the real ctx, exactly as before.
// With an offset {dx, dy} (1080-wide slide units) fn first runs on a scratch canvas to learn the block's box, the offset is
// clamped so the whole box stays inside the slide, then fn runs on the real ctx under translate. Reported rects and blocks[name] are the moved ones.
let scratchCtx = null;
function scratch() { if (!scratchCtx) { const cv = document.createElement('canvas'); cv.width = T.W; cv.height = T.H; scratchCtx = cv.getContext('2d'); } return scratchCtx; }
function mover(ctx, offsets, rects, blocks) {
  return function g(name, fn) {
    const o = offsets && offsets[name], want = { dx: (o && +o.dx) || 0, dy: (o && +o.dy) || 0 };
    const box = () => { let b = null; return { R(r) { if (!(r.w > 0) || !(r.h > 0)) return; if (!b) b = { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h }; else { b.x0 = Math.min(b.x0, r.x); b.y0 = Math.min(b.y0, r.y); b.x1 = Math.max(b.x1, r.x + r.w); b.y1 = Math.max(b.y1, r.y + r.h); } }, get: () => b }; };
    let dx = 0, dy = 0;
    if ((want.dx || want.dy) && Number.isFinite(want.dx) && Number.isFinite(want.dy)) {
      const m = box(), sc = scratch(); sc.save(); fn(sc, m.R); sc.restore();
      const b = m.get();
      if (b) { dx = Math.max(-b.x0, Math.min(T.W - b.x1, want.dx)); dy = Math.max(-b.y0, Math.min(T.H - b.y1, want.dy)); }
    }
    const m = box();
    const R = (r, p) => { m.R(r); p = p || 0; if (!(r.w > 0) || !(r.h > 0)) return; rects.push({ x: r.x + dx - p, y: r.y + dy - p, w: r.w + 2 * p, h: r.h + 2 * p }); };
    let out;
    if (dx || dy) { ctx.save(); ctx.translate(dx, dy); out = fn(ctx, R); ctx.restore(); } else out = fn(ctx, R);
    const b = m.get();
    if (b) blocks[name] = { x: b.x0 + dx, y: b.y0 + dy, w: b.x1 - b.x0, h: b.y1 - b.y0, dx, dy };
    return out;
  };
}
function drawText(ctx, s, i, total) {
  const { rects, R } = rectsOf(), blocks = {}, g = mover(ctx, s.offsets, rects, blocks);
  let titleSize = T.titleSize[i === 0 ? 0 : 1], subSize = T.subSize, L = layout(ctx, s, titleSize, subSize);
  const maxH = T.H * (1 - T.maxTextTop) - T.bottom;
  while (L.h > maxH && titleSize > T.titleMin) { titleSize -= T.titleStep; L = layout(ctx, s, titleSize, subSize); }
  while (L.h > maxH && subSize > T.subMin) { subSize -= 2; L = layout(ctx, s, titleSize, subSize); }
  const fits = L.h <= maxH;
  // top row: handle (left), page count (right)
  if (s.handle) g('handle', (c, R) => {
    const tag = block(c, { x: T.margin, y: 48, text: s.handle, font: '700 italic ' + T.handleSize + 'px ' + CAVEAT, size: T.handleSize, padL: 30, padR: 30, padT: 8, padB: 18, rad: 10, amp: 8, seed: 21, brush: true, color: C.soft, base: 0.82 });
    underline(c, T.margin + 40, T.margin + tag.w - 40, tag.y + tag.h - 9, C.hot, -2); R(tag, 6);
  });
  R(counter(ctx, i, total), 4);
  let y = T.H - T.bottom - L.h; const x = T.margin;
  if (s.num) {
    const y0 = y;
    const nb = g('num', (c, R) => { const b = block(c, { x: x + 10, y: y0, text: s.num, font: '800 ' + T.numSize + 'px ' + BALOO, size: T.numSize, lh: 0.95, padL: 40, padR: 40, padT: 0, padB: 6, rad: 10, amp: 12, seed: 9, brush: true, color: C.pink, ins: [4, 8, 0, 8], base: 0.86 }); R(b, 8); return b; });
    if (s.kicker) g('kicker', (c, R) => { const kb = block(c, { x: nb.x + nb.w + 16, y: y0 + nb.h - T.kickerSize - 44, text: s.kicker, font: '700 italic ' + T.kickerSize + 'px ' + CAVEAT, size: T.kickerSize, padL: 28, padR: 28, padT: 4, padB: 14, rad: 10, amp: 10, seed: 33, brush: true, color: C.yellow, base: 0.84 }); R(kb, 8); });
    y += nb.h + 14;
  } else if (s.kicker) {
    const y0 = y;
    g('kicker', (c, R) => { const kb = block(c, { x, y: y0, text: s.kicker, font: '700 italic ' + T.kickerSize + 'px ' + CAVEAT, size: T.kickerSize, padL: 28, padR: 28, padT: 4, padB: 14, rad: 10, amp: 10, seed: 33, brush: true, color: C.yellow, base: 0.84 }); R(kb, 8); }); y += T.kickerSize + 30 + 14;
  }
  const yT = y;
  y = g('title', (c, R) => { let yy = yT; L.tl.forEach((line, k) => { const tb = block(c, { x: x + (k % 2 ? 18 : 0), y: yy, text: line, font: '800 ' + titleSize + 'px ' + BALOO, size: titleSize, padL: 28, padR: 28, padT: 6, padB: 12, rad: 22, amp: 3.5, seed: 4 + k * 5, color: C.cream, base: 0.86 }); R(tb, 6); yy += tb.h - 4; }); return yy; });
  if (L.tl.length) y += 14;
  if (L.sl.length) {
    ctx.font = '600 ' + subSize + 'px ' + BALOO; const lh = subSize * T.subLH, bw = Math.max(...L.sl.map(t => ctx.measureText(t).width)) + 68, bh = 24 + L.sl.length * lh + 26, ys = y;
    g('sub', (c, R) => {
      fillRough(c, x - 14, ys, bw, bh, 40, 6, 5, false, C.purple); R({ x: x - 14, y: ys, w: bw, h: bh }, 6);
      c.font = '600 ' + subSize + 'px ' + BALOO; c.fillStyle = C.cream; c.textBaseline = 'alphabetic'; L.sl.forEach((t, k) => c.fillText(t, x - 14 + 34, ys + 24 + subSize * 0.82 + k * lh));
    });
    y += bh;
  }
  if (s.swipe) { const ys = y; g('swipe', (c, R) => { const sb = block(c, { x, y: ys + 14, text: s.swipe + '  →', font: '700 italic ' + T.swipeSize + 'px ' + CAVEAT, size: T.swipeSize, padL: 26, padR: 26, padT: 4, padB: 12, rad: 10, amp: 8, seed: 51, brush: true, color: C.soft, base: 0.84 }); R(sb, 6); }); }
  return { rects, blocks, titleSize, subSize, fits, textTop: T.H - T.bottom - L.h };
}
// Series slide 1: the cover's own marks (kicker tag, headline blocks, purple arrow box, #NNN badge) in the shared positions.
// Movable blocks: kicker (the tag), title (the whole headline stack), strap (the arrow box), badge (#NNN).
function drawSeries(ctx, c0, i, total) {
  const c = c0, { rects, R } = rectsOf(), K = T.K, blocks = {}, g = mover(ctx, c.offsets, rects, blocks);
  if (c.kicker) g('kicker', (cx, R) => {
    const tag = block(cx, { x: T.margin, y: 48, text: c.kicker, font: '700 italic 62px ' + CAVEAT, size: 62, padL: 36, padR: 34, padT: 10, padB: 24, rad: 10, amp: 10, seed: 21, brush: true, color: C.soft, base: 0.82 });
    underline(cx, T.margin + 70, T.margin + tag.w - 70, tag.y + tag.h - 12, C.hot, -3); R(tag, 6);
  });
  R(counter(ctx, i, total), 4);
  // arrow box (only when she has written a strapline)
  ctx.font = '600 italic 31px ' + BALOO; const lines = c.strap ? wrapLines(ctx, c.strap, 538) : [], lh = 36.6, bh = lines.length ? 26 + lines.length * lh + 30 : 0;
  const bannerY = T.H - T.bottom - bh;
  const stackH = Math.round((112 + 18 - 4 + 228 * 0.95 + 6 + 2 + 76 + 14 + 8 + 104 + 14) * K);
  const hy = bannerY - 26 - stackH;
  g('title', (cx, R) => {
    const B = (o) => o.text ? block(cx, o) : { x: o.x, y: o.y, w: 0, h: 0 };
    cx.save(); cx.translate(T.margin - 50 * K, hy); cx.scale(K, K);
    let y = 0; const sub = [];
    const u = B({ x: 76, y, text: c.h1, font: '800 112px ' + BALOO, size: 112, padL: 30, padR: 30, padT: 6, padB: 12, rad: 26, amp: 3.5, seed: 4, color: C.cream, base: 0.86 }); sub.push(u); y += u.h - 4;
    const ai = B({ x: 102, y, text: c.h2, font: '800 228px ' + BALOO, size: 228, lh: 0.95, padL: 62, padR: 62, padT: 0, padB: 6, rad: 10, amp: 16, seed: 9, brush: true, color: C.pink, ins: [6, 10, 0, 10], base: 0.86 }); sub.push(ai); y += ai.h + 2;
    const earn = B({ x: 50, y, text: c.h3, font: '800 76px ' + BALOO, size: 76, padL: 26, padR: 26, padT: 6, padB: 8, rad: 22, amp: 3.5, seed: 14, color: C.cream, base: 0.86 }); sub.push(earn); y += earn.h + 8;
    const and = B({ x: 50, y: y + 20, text: c.h4, font: '800 56px ' + BALOO, size: 56, padL: 20, padR: 20, padT: 10, padB: 12, rad: 20, amp: 3, seed: 17, color: C.cream, base: 0.86 });
    const wk = B({ x: 50 + and.w - 2, y, text: c.h5, font: '700 italic 104px ' + CAVEAT, size: 104, padL: 34, padR: 34, padT: 0, padB: 14, rad: 10, amp: 14, seed: 33, brush: true, color: C.yellow, base: 0.84 }); sub.push(and, wk);
    if (wk.w) underline(cx, wk.x + 46, wk.x + wk.w - 50, wk.y + wk.h - 2, C.hot, -3);
    cx.restore();
    sub.forEach(r => R({ x: T.margin - 50 * K + r.x * K, y: hy + r.y * K, w: r.w * K, h: r.h * K }, 8));
  });
  if (lines.length) g('strap', (cx, R) => {
    R({ x: 34, y: bannerY, w: 700, h: bh }, 6);
    fillRough(cx, 34, bannerY, 700, bh, 70, 8, 5, false, C.purple);
    cx.save(); cx.strokeStyle = C.hot; cx.lineWidth = 5; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.translate(60, bannerY + 34); cx.stroke(new Path2D('M4 22c14-4 38-4 56 0M46 8l16 14-14 12')); cx.restore();
    cx.font = '600 italic 31px ' + BALOO; cx.fillStyle = C.cream; cx.textBaseline = 'alphabetic'; lines.forEach((t, k) => cx.fillText(t, 34 + 112, bannerY + 26 + 27 + k * lh));
    underline(cx, 34 + 230, 34 + 640, bannerY + bh - 14, C.hot, 2);
  });
  // #NNN badge, bottom right, on the same bottom line as the arrow box
  const ep = pad3(c.num); ctx.font = '700 italic 104px ' + CAVEAT; const ew = ctx.measureText(ep).width + 92, eh = 6 + 104 + 22, ex = T.W - 48 - ew, ey = T.H - T.bottom - eh + 16;
  g('badge', (cx, R) => { R({ x: ex, y: ey, w: ew, h: eh }, 8); fillRough(cx, ex, ey, ew, eh, 12, 14, 41, true, C.pink); cx.font = '700 italic 104px ' + CAVEAT; cx.fillStyle = C.purple; cx.fillText(ep, ex + 46, ey + 6 + 104 * 0.78); underline(cx, ex + 60, ex + ew - 60, ey + eh - 12, C.yellow, 0); });
  const textTop = hy;
  return { rects, blocks, textTop, fits: textTop >= T.H * T.maxTextTop };
}


// ---------- SOC-26: the dark look ----------
// The design of the 20 Nov post: her photo full-bleed, a dark fade over the lower part, small white handle and counter on top, and a
// bottom-aligned stack: small letter-spaced kicker, big number, bold title, sub, short swipe line. No brush shapes.
// Every value below is the old Orb creator's card CSS (git commit 2c825b7, dist/carousel-insta/index.html, the version that drew the post),
// written in its 460 x 575 card units and multiplied by DK = 1080 / 460, the scale its own export used (html2canvas { scale: 1080 / 460 }, line 689).
const DK = 1080 / 460;
const DARK = {
  ground: '#2b2a33',                                                   // index.html:48  .ig-card background (no photo)
  scrim: [[0, 'rgba(10,10,16,0.92)'], [0.38, 'rgba(10,10,16,0.78)'], [0.72, 'rgba(10,10,16,0.30)'], [1, 'rgba(10,10,16,0.05)']], // :53 linear-gradient(to top, ...): stop 0 is the bottom edge
  font: "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif", // :11 body font-family
  accent: '#ffd9a0',                                                   // :61 .ig-kicker, :62 .ig-num, :65 .ig-swipe colour
  handle: { top: 24, left: 30, size: 14, color: 'rgba(255,255,255,0.9)' },  // :55 .ig-handle
  count: { top: 24, right: 30, size: 14, color: 'rgba(255,255,255,0.85)' }, // :56 .ig-count
  box: { left: 34, right: 34, bottom: 46, top: 60 },                   // :57-60 .ig-content
  kicker: { size: 13, ls: 2, mb: 12 },                                 // :61 uppercase, letter-spacing 2px, margin-bottom 12px, weight 700
  num: { size: 92, lh: 0.9, mb: 8 },                                   // :62 weight 800
  title: { size: 30, lh: 1.14, ls: -0.5, color: '#fff' },              // :63 weight 800; colour inherited from the card (white)
  sub: { size: 19, lh: 1.26, mt: 15, color: '#f3f1ee' },               // :64 weight 500
  swipe: { size: 15, mt: 18 },                                         // :65 weight 700
  normalLH: 1.17 };                                                    // line-height: normal for the system sans (kicker, swipe, handle, counter)
const SHADOW = { color: 'rgba(0,0,0,0.35)', y: 2, blur: 12 }; // SOC-26 brief: 0 2px 12px rgba(0,0,0,.35), scaled by DK to the 1080 slide
function shadowOn(c) { c.shadowColor = SHADOW.color; c.shadowOffsetX = 0; c.shadowOffsetY = SHADOW.y * DK; c.shadowBlur = SHADOW.blur * DK; }
function shadowOff(c) { c.shadowColor = 'rgba(0,0,0,0)'; c.shadowBlur = 0; c.shadowOffsetY = 0; }
function setLS(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
function darkLines(ctx, text, maxW) { return text ? wrapLines(ctx, text, maxW) : []; }
function drawDark(ctx, s, i, total) {
  const { rects, R } = rectsOf(), blocks = {}, g = mover(ctx, s.offsets, rects, blocks), D = DARK, F = D.font;
  const x0 = D.box.left * DK, maxW = T.W - (D.box.left + D.box.right) * DK;
  const top = D.box.top * DK, bottom = T.H - D.box.bottom * DK, avail = bottom - top;
  const titleBase = D.title.size * DK, subBase = D.sub.size * DK;
  const lay = (ts, ss) => {
    ctx.font = '800 ' + ts + 'px ' + F; setLS(ctx, D.title.ls * DK); const tl = darkLines(ctx, s.title, maxW); setLS(ctx, 0);
    ctx.font = '500 ' + ss + 'px ' + F; const sl = darkLines(ctx, s.sub, maxW);
    const kS = D.kicker.size * DK, nS = D.num.size * DK, wS = D.swipe.size * DK;
    const hK = s.kicker ? kS * D.normalLH : 0, hN = s.num ? nS * D.num.lh : 0, hT = tl.length * ts * D.title.lh, hS = sl.length * ss * D.sub.lh, hW = s.swipe ? wS * D.normalLH : 0;
    let h = hK + hN + hT + hS + hW;
    if (s.kicker) h += D.kicker.mb * DK;
    if (s.num) h += D.num.mb * DK;
    if (sl.length) h += D.sub.mt * DK;
    if (s.swipe) h += D.swipe.mt * DK;
    return { tl, sl, h, kS, nS, wS, hK, hN, hT, hS, hW };
  };
  let ts = titleBase, ss = subBase, L = lay(ts, ss);
  while (L.h > avail && ts > T.titleMin) { ts -= 4; L = lay(ts, ss); }     // not in the old CSS (it let text overflow); the shrink uses the creator's own floors so the fit check can pass
  while (L.h > avail && ss > T.subMin) { ss -= 2; L = lay(ts, ss); }
  const fits = L.h <= avail;
  const base = (yTop, size, lh) => yTop + ((lh - 1.15) / 2 + 0.93) * size; // alphabetic baseline of a line box (ascent .93, content 1.15 of the em)
  ctx.textBaseline = 'alphabetic';
  if (s.handle) g('handle', (c, R) => {
    const sz = D.handle.size * DK; c.font = '700 ' + sz + 'px ' + F; c.fillStyle = D.handle.color;
    const y = D.handle.top * DK, x = D.handle.left * DK; shadowOn(c); c.fillText(s.handle, x, base(y, sz, D.normalLH)); shadowOff(c);
    R({ x, y, w: c.measureText(s.handle).width, h: sz * D.normalLH }, 6);
  });
  { const sz = D.count.size * DK, t = (i + 1) + ' / ' + total; ctx.font = '700 ' + sz + 'px ' + F; ctx.fillStyle = D.count.color;
    const w = ctx.measureText(t).width, x = T.W - D.count.right * DK - w, y = D.count.top * DK; shadowOn(ctx); ctx.fillText(t, x, base(y, sz, D.normalLH)); shadowOff(ctx); R({ x, y, w, h: sz * D.normalLH }, 4); }
  let y = bottom - L.h; const textTop = y;
  if (s.kicker) { const y0 = y; g('kicker', (c, R) => {
    c.font = '700 ' + L.kS + 'px ' + F; setLS(c, D.kicker.ls * DK); c.fillStyle = D.accent;
    const t = s.kicker.toUpperCase(); c.fillText(t, x0, base(y0, L.kS, D.normalLH)); const w = c.measureText(t).width; setLS(c, 0);
    R({ x: x0, y: y0, w, h: L.hK }, 6); }); y += L.hK + D.kicker.mb * DK; }
  if (s.num) { const y0 = y; g('num', (c, R) => {
    c.font = '800 ' + L.nS + 'px ' + F; c.fillStyle = D.accent; c.fillText(s.num, x0, base(y0, L.nS, D.num.lh)); R({ x: x0, y: y0, w: c.measureText(s.num).width, h: L.hN }, 6); }); y += L.hN + D.num.mb * DK; }
  if (L.tl.length) { const yT = y; g('title', (c, R) => {
    c.font = '800 ' + ts + 'px ' + F; setLS(c, D.title.ls * DK); c.fillStyle = D.title.color; let bw = 0;
    shadowOn(c); L.tl.forEach((t, k) => { c.fillText(t, x0, base(yT + k * ts * D.title.lh, ts, D.title.lh)); bw = Math.max(bw, c.measureText(t).width); }); setLS(c, 0); shadowOff(c);
    R({ x: x0, y: yT, w: bw, h: L.hT }, 6); }); y += L.hT; }
  if (L.sl.length) { y += D.sub.mt * DK; const yS = y; g('sub', (c, R) => {
    c.font = '500 ' + ss + 'px ' + F; c.fillStyle = D.sub.color; let bw = 0;
    shadowOn(c); L.sl.forEach((t, k) => { c.fillText(t, x0, base(yS + k * ss * D.sub.lh, ss, D.sub.lh)); bw = Math.max(bw, c.measureText(t).width); }); shadowOff(c);
    R({ x: x0, y: yS, w: bw, h: L.hS }, 6); }); y += L.hS; }
  if (s.swipe) { y += D.swipe.mt * DK; const yW = y; g('swipe', (c, R) => {
    c.font = '700 ' + L.wS + 'px ' + F; c.fillStyle = D.accent; c.fillText(s.swipe, x0, base(yW, L.wS, D.normalLH)); R({ x: x0, y: yW, w: c.measureText(s.swipe).width, h: L.hW }, 6); }); }
  return { rects, blocks, titleSize: Math.round(ts), subSize: Math.round(ss), fits, textTop };
}
function drawDarkScrim(ctx) { const g = ctx.createLinearGradient(0, T.H, 0, 0); DARK.scrim.forEach(([o, c]) => g.addColorStop(o, c)); ctx.fillStyle = g; ctx.fillRect(0, 0, T.W, T.H); }


// ---------- SOC-26: the photo finish ----------
// Applied to the photo only (never the words), after the cover scaling and before the scrim and the text, in BOTH looks. Deterministic, one pass over
// the output-size ImageData. Every number below is a design value from the SOC-26 brief (coordinator message, 2026-11-21; founder: "high quality post production look").
// No background blur, no face retouching. opts.finish === false skips it (used only to make before/after samples and tests).
const FINISH = { lo: 4, hi: 250, maxGain: 1.4, pLo: 0.01, pHi: 0.99, curve: 0.16 /* slope +8% at the midtone */, warmR: 4, warmB: 4, sat: 1.06, sharpR: 1.2, sharpAmt: 0.35 };
function applyFinish(ctx) {
  const F = FINISH, W = T.W, H = T.H, id = ctx.getImageData(0, 0, W, H), d = id.data, n = W * H;
  const lum = new Float32Array(n), hist = new Uint32Array(256);
  for (let i = 0, o = 0; i < n; i++, o += 4) { const y = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]; lum[i] = y; hist[Math.min(255, Math.round(y))]++; }
  const pct = q => { let acc = 0; const t = q * n; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= t) return v; } return 255; };
  const p1 = pct(F.pLo), p99 = pct(F.pHi);
  const gain = p99 > p1 ? Math.min(F.maxGain, (F.hi - F.lo) / (p99 - p1)) : 1;
  // unclamped (range wide enough): p1 -> lo and p99 -> hi exactly. Clamped (a very flat photo): stretch by maxGain around its own middle, so it never jumps to another brightness.
  const unclamped = p99 > p1 && (F.hi - F.lo) / (p99 - p1) <= F.maxGain, mid = unclamped ? p1 : (p1 + p99) / 2, ctr = unclamped ? F.lo : (p1 + p99) / 2;
  const sm = v => v * v * (3 - 2 * v);
  // pass 1: levels (one linear map, same on every channel so hue is kept), S-curve, midtone warmth, saturation
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    let r = ctr + (d[o] - mid) * gain, g = ctr + (d[o + 1] - mid) * gain, b = ctr + (d[o + 2] - mid) * gain;
    r = r < 0 ? 0 : r > 255 ? 255 : r; g = g < 0 ? 0 : g > 255 ? 255 : g; b = b < 0 ? 0 : b > 255 ? 255 : b;
    r /= 255; g /= 255; b /= 255;
    r += F.curve * (sm(r) - r); g += F.curve * (sm(g) - g); b += F.curve * (sm(b) - b);
    let y = 0.299 * r + 0.587 * g + 0.114 * b; const w = 4 * y * (1 - y);
    r = r * 255 + F.warmR * w; b = b * 255 - F.warmB * w; g *= 255; y *= 255;
    y = 0.299 * r + 0.587 * g + 0.114 * b;
    r = y + (r - y) * F.sat; g = y + (g - y) * F.sat; b = y + (b - y) * F.sat;
    d[o] = r < 0 ? 0 : r > 255 ? 255 : r; d[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
    lum[i] = 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2];
  }
  // pass 2: unsharp mask on luminance only (no colour fringes), gaussian sigma = radius, separable 7-tap
  const R = 3, k = []; let ks = 0; for (let j = -R; j <= R; j++) { const w = Math.exp(-(j * j) / (2 * F.sharpR * F.sharpR)); k.push(w); ks += w; }
  for (let j = 0; j < k.length; j++) k[j] /= ks;
  const tmp = new Float32Array(n), blur = new Float32Array(n);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let j = -R; j <= R; j++) { const xx = x + j < 0 ? 0 : x + j >= W ? W - 1 : x + j; a += lum[y * W + xx] * k[j + R]; } tmp[y * W + x] = a; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let j = -R; j <= R; j++) { const yy = y + j < 0 ? 0 : y + j >= H ? H - 1 : y + j; a += tmp[yy * W + x] * k[j + R]; } blur[y * W + x] = a; }
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const dl = F.sharpAmt * (lum[i] - blur[i]);
    const r = d[o] + dl, g = d[o + 1] + dl, b = d[o + 2] + dl;
    d[o] = r < 0 ? 0 : r > 255 ? 255 : r; d[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g; d[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(id, 0, 0);
}

// ---------- the photo ----------
// face = { x, y, w, h } as fractions of the image. frame = { fx, fy, zoom } or null.
// SOC-25: lowRes is true when drawing the photo cover-fitted needs more than 1 output px per source px (scale > 1): the slide
// would be an upscale, so soft. It is reported, never hidden: the creator blocks Approve on it. null when there is no photo.
const lowResAt = sc => sc > 1 + 1e-6;
function place(imgW, imgH, face, rects, frame) {
  let fx = frame ? frame.fx : 0.5, fy = frame ? frame.fy : 0.5; const zoom = frame ? frame.zoom : 1;
  if (!(imgW > 0 && imgH > 0)) return { fx, fy, zoom, cleared: null, lowRes: null };
  const sc = Math.max(T.W / imgW, T.H / imgH) * zoom, dw = imgW * sc, dh = imgH * sc;
  let cleared = null;
  if (face) {
    const pad = { x: (face.x - face.w * 0.08) * imgW, y: (face.y - face.h * 0.12) * imgH, w: face.w * 1.16 * imgW, h: face.h * 1.24 * imgH };
    const boxAt = (px, py) => ({ x: pad.x * sc + px, y: pad.y * sc + py, w: pad.w * sc, h: pad.h * sc });
    if (!frame) {
      const x0 = -(dw - T.W) * fx, y0 = -(dh - T.H) * fy;
      const r = placeFaceSafe({ faceBox: boxAt(x0, y0), canvasW: T.W, canvasH: T.H, elementZone: rects, slack: { right: -x0, left: dw - T.W + x0, down: -y0, up: dh - T.H + y0 }, maxElementShift: 0 });
      if (dw > T.W) fx = Math.min(1, Math.max(0, -(x0 + r.photoOffsetX) / (dw - T.W)));
      if (dh > T.H) fy = Math.min(1, Math.max(0, -(y0 + r.photoOffsetY) / (dh - T.H)));
    }
    const f2 = boxAt(-(dw - T.W) * fx, -(dh - T.H) * fy);
    cleared = !rects.some(z => f2.x < z.x + z.w && f2.x + f2.w > z.x && f2.y < z.y + z.h && f2.y + f2.h > z.y);
  }
  return { fx, fy, zoom, cleared, lowRes: lowResAt(sc) };
}
// SOC-25: ONE uniform scale on both axes (cover), never a per-axis fit: a circle stays a circle.
function drawPhoto(ctx, im, fx, fy, zoom, dark, finish) {
  ctx.fillStyle = dark ? DARK.ground : '#bdbdba'; ctx.fillRect(0, 0, T.W, T.H); if (!im) return;
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const s = Math.max(T.W / iw, T.H / ih) * zoom, dw = iw * s, dh = ih * s;
  ctx.drawImage(im, -(dw - T.W) * fx, -(dh - T.H) * fy, dw, dh);
  if (finish !== false) applyFinish(ctx); // SOC-26: the finish, photo only, before the tint, the scrim and the words
  if (dark) return; // the dark look has no plum tint (its template has none)
  const g = ctx.createLinearGradient(0, 0, T.W * 0.55, T.H * 0.1); g.addColorStop(0, 'rgba(58,17,80,.22)'); g.addColorStop(1, 'rgba(58,17,80,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, T.W, T.H);
}
function twoPass(cv, draw, im, opts) {
  opts = opts || {}; cv.width = T.W; cv.height = T.H; const ctx = cv.getContext('2d');
  const dark = opts.look === 'dark'; // SOC-26: same photo placement and lowRes as the photo look; the ground, the scrim and the words differ
  const tmp = document.createElement('canvas'); tmp.width = T.W; tmp.height = T.H;
  const pre = draw(tmp.getContext('2d'));
  const iw = im ? (im.naturalWidth || im.width) : 0, ih = im ? (im.naturalHeight || im.height) : 0;
  const pl = place(iw, ih, im ? opts.face || null : null, pre.rects, opts.frame || null);
  drawPhoto(ctx, im, pl.fx, pl.fy, pl.zoom, dark, opts.finish); if (dark) drawDarkScrim(ctx); draw(ctx);
  return { rects: pre.rects, blocks: pre.blocks, textTop: Math.round(pre.textTop), fits: pre.fits, faceClear: pl.cleared, lowRes: pl.lowRes, fx: +pl.fx.toFixed(4), fy: +pl.fy.toFixed(4), zoom: pl.zoom };
}
function renderSlide(cv, slide, i, total, im, opts) { const dk = !!opts && opts.look === 'dark'; return twoPass(cv, ctx => (dk ? drawDark : drawText)(ctx, slide, i, total), im, opts); }
function renderSeries(cv, cover, i, total, im, opts) { return twoPass(cv, ctx => drawSeries(ctx, cover, i, total), im, opts); }

// ---------- the reel overlay (SOC-18.1) ----------
// Transparent 1080x1920 layer: one handle tag at the safe-zone corner, one caption centred above the caption line.
// Every word drawn comes from the input; empty input draws nothing. Caption look = the approved prototype: white, weight 900, black outline, soft shadow.
function renderReelOverlay(cv, o) {
  o = o || {}; const handle = o.handle || '', caption = o.caption || '', S = T.SAFE;
  cv.width = 1080; cv.height = 1920; const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 1080, 1920);
  const rects = { tag: null, caption: null };
  let captionSize = 0, fits = true;
  if (handle) {
    ctx.save();
    const tag = block(ctx, { x: S.left, y: S.top, text: handle, font: '700 italic ' + T.handleSize + 'px ' + CAVEAT, size: T.handleSize, padL: 30, padR: 30, padT: 8, padB: 18, rad: 10, amp: 8, seed: 21, brush: true, color: C.soft, base: 0.82 });
    underline(ctx, S.left + 40, S.left + tag.w - 40, tag.y + tag.h - 9, C.hot, -2);
    rects.tag = { x: tag.x, y: tag.y, w: tag.w, h: tag.h };
    ctx.restore();
  }
  if (caption) {
    ctx.save();
    const capFont = n => '900 ' + n + 'px "Helvetica Neue", Helvetica, Arial, sans-serif';
    let size = 104; ctx.font = capFont(size);
    while (size > 40 && ctx.measureText(caption).width + 14 > S.capW) { size -= 2; ctx.font = capFont(size); }
    const w = ctx.measureText(caption).width + 14;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowOffsetY = 6; ctx.shadowBlur = 18; ctx.shadowColor = 'rgba(0,0,0,.6)';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 14; ctx.lineJoin = 'round'; ctx.strokeText(caption, 540, S.capY);
    ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#fff'; ctx.fillText(caption, 540, S.capY);
    ctx.restore();
    rects.caption = { x: 540 - w / 2, y: S.capY - size * 0.6, w, h: size * 1.2 };
    captionSize = size; fits = w <= S.capW;
  }
  const t = rects.tag, c = rects.caption;
  const safe = (!t || (t.x >= S.left && t.y >= S.top && t.x + t.w <= S.right)) &&
    (!c || (c.x >= S.left && c.y >= S.top && c.x + c.w <= S.right && c.y + c.h <= S.capBottom && c.x >= 1080 - S.right));
  return { rects, captionSize, fits, safe };
}

window.OneLook = { T, C, pad3, coverDefaults, fontsReady, detectFace, placeFaceSafe, place, renderSlide, renderSeries, renderReelOverlay };
})();
