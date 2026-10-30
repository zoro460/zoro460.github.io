// Interactive effects: cursor spotlight, card edge light, card tilt, hero bug hunt, contact border.
// One rAF loop that runs only while something is moving; all listeners are passive.
// Mouse-only effects are off on touch (hover: none). Reduced motion keeps things still.
(() => {
  const doc = document.documentElement;
  const hero = document.getElementById('top');
  if (!hero) return;

  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const make = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  };

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  let still = false;      // reduced motion
  let pointerFx = false;  // spotlight + edge light (mouse only)
  let tiltOn = false;     // tilt (mouse only, motion allowed)

  doc.classList.add('fx-ready');

  /* ---------- Build ---------- */
  const spot = make('div', 'fx-spot');
  spot.setAttribute('aria-hidden', 'true');
  const aurora = q('.aurora');
  if (aurora) aurora.after(spot); else document.body.prepend(spot);

  const edgeCards = qa('.card').filter((c) => !c.classList.contains('timeline') && !c.classList.contains('contact-card'));
  edgeCards.forEach((c) => c.classList.add('fx-edge'));
  const tiltCards = qa('.project-card, .skill-card');
  const watchCards = [...new Set([...edgeCards, ...tiltCards])];

  const BUG_COUNT = 5;
  const bugSvg =
    '<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
      '<path d="M5.5 8 2.5 6.5M5 11H2M5.5 14l-3 1.5M14.5 8l3-1.5M15 11h3M14.5 14l3 1.5M8.6 4.6 7.2 2.4M11.4 4.6l1.4-2.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" fill="none"/>' +
      '<ellipse cx="10" cy="11.5" rx="4.8" ry="5.8" fill="currentColor"/>' +
      '<circle cx="10" cy="5.6" r="2.5" fill="currentColor"/>' +
      '<path d="M10 7.4v9.6" stroke="#07070C" stroke-width="1"/>' +
    '</svg>';
  const layer = make('div', 'fx-bugs');
  layer.setAttribute('role', 'group');
  layer.setAttribute('aria-label', 'Bug hunt, optional mini game');
  const counter = make('p', 'fx-counter mono');
  counter.setAttribute('role', 'status');
  counter.tabIndex = -1;
  hero.append(layer, counter);

  const bugs = Array.from({ length: BUG_COUNT }, () => {
    const btn = make('button', 'fx-bug',
      `<span class="fx-bug-body"><span class="fx-bug-dir">${bugSvg}</span></span>` +
      '<span class="fx-bug-burst" aria-hidden="true"></span>' +
      '<span class="fx-bug-check" aria-hidden="true">✓</span>');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Squash bug');
    layer.append(btn);
    const b = { btn, dir: q('.fx-bug-dir', btn), x: -100, y: -100, a: Math.random() * Math.PI * 2, turn: 0, wait: 0, hold: false, squashed: false };
    btn.addEventListener('click', () => squash(b));
    btn.addEventListener('pointerenter', () => { b.hold = true; });
    btn.addEventListener('pointerleave', () => { b.hold = false; wake(); });
    btn.addEventListener('focus', () => { b.hold = true; });
    btn.addEventListener('blur', () => { b.hold = false; wake(); });
    return b;
  });
  let fixed = 0;
  let doneTimer = 0;
  const setCounter = () => {
    counter.classList.toggle('done', fixed === BUG_COUNT);
    counter.textContent = `bugs fixed: ${fixed}/${BUG_COUNT}`;
  };
  setCounter();

  /* ---------- Bug hunt geometry (layer coords: x from the viewport left, y from the hero top) ---------- */
  const BUG = 44;       // tap area
  const VIS = 18;       // visible bug
  let area = { w: 0, h: 0 };
  let textBoxes = [];   // keep the visible bug off these (with margin)
  let hitBoxes = [];    // keep the whole tap area off these (buttons)

  const inflate = (r, m) => ({ l: r.l - m, t: r.t - m, r: r.r + m, b: r.b + m });
  const hits = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

  // m = clear space kept around the visible bug.
  function fits(x, y, self, m = 12) {
    const half = BUG / 2;
    if (x < half + 4 || x > area.w - half - 4 || y < half + 4 || y > area.h - half) return false;
    const vis = { l: x - VIS / 2 - m, t: y - VIS / 2 - m, r: x + VIS / 2 + m, b: y + VIS / 2 + m };
    const tap = { l: x - half - 4, t: y - half - 4, r: x + half + 4, b: y + half + 4 };
    if (textBoxes.some((r) => hits(vis, r))) return false;
    if (hitBoxes.some((r) => hits(tap, r))) return false;
    return !bugs.some((o) => o !== self && !o.squashed && Math.hypot(o.x - x, o.y - y) < BUG + 6);
  }

  function measureAvoid() {
    const hr = hero.getBoundingClientRect();
    const toLayer = (r) => ({ l: r.left, t: r.top - hr.top, r: r.right, b: r.bottom - hr.top });
    const boxes = [];
    ['.hero-hi', '.hero-line', '.hero-sub'].forEach((sel) => {
      const el = q(sel, hero);
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      [...range.getClientRects()].forEach((r) => { if (r.width && r.height) boxes.push(toLayer(r)); });
    });
    ['.hero-cmd', '.pill', '.test-strip'].forEach((sel) => {
      const el = q(sel, hero);
      if (el) boxes.push(toLayer(el.getBoundingClientRect()));
    });
    boxes.push(toLayer(counter.getBoundingClientRect()));
    textBoxes = boxes;
    hitBoxes = qa('.hero-ctas .btn', hero).map((b) => toLayer(b.getBoundingClientRect()));
  }

  function measureHero() {
    const hr = hero.getBoundingClientRect();
    const vw = doc.clientWidth;
    const about = document.getElementById('about');
    const gapBelow = about ? (parseFloat(getComputedStyle(about).paddingTop) || 80) * 0.75 : 60;
    area = { w: vw, h: hr.height + gapBelow };
    layer.style.left = `${-hr.left}px`;
    layer.style.width = `${vw}px`;
    layer.style.height = `${area.h}px`;

    const strip = q('.test-strip', hero);
    if (strip) {
      const sr = strip.getBoundingClientRect();
      const centered = getComputedStyle(hero).textAlign === 'center';
      counter.classList.toggle('fx-center', centered);
      counter.style.left = `${(centered ? sr.left + sr.width / 2 : sr.left) - hr.left}px`;
      counter.style.top = `${sr.bottom - hr.top + 12}px`;
    }
    measureAvoid();
  }

  // Random free spot; on cramped screens retry with a tighter (but still non-overlapping) margin.
  function spawn(b) {
    for (const m of [12, 4]) {
      for (let i = 0; i < 800; i += 1) {
        const x = Math.random() * area.w;
        const y = Math.random() * area.h;
        if (fits(x, y, b, m)) { b.x = x; b.y = y; return true; }
      }
    }
    return false;
  }

  function placeBug(b) {
    b.btn.style.transform = `translate3d(${(b.x - BUG / 2).toFixed(1)}px, ${(b.y - BUG / 2).toFixed(1)}px, 0)`;
    b.dir.style.transform = `rotate(${((b.a * 180) / Math.PI + 90).toFixed(1)}deg)`;
  }

  function resolveBugs() {
    bugs.forEach((b) => {
      if (b.squashed) return;
      if (!fits(b.x, b.y, b)) spawn(b);
      placeBug(b);
    });
  }

  function squash(b) {
    if (b.squashed) return;
    const hadFocus = document.activeElement === b.btn;
    b.squashed = true;
    fixed += 1;
    b.btn.classList.add('squashed');
    b.btn.setAttribute('aria-label', 'Bug fixed');
    b.btn.tabIndex = -1;
    window.setTimeout(() => { b.btn.hidden = true; }, 1100);
    setCounter();
    if (fixed === BUG_COUNT) {
      counter.textContent = '✓ all bugs fixed';
      window.clearTimeout(doneTimer);
      doneTimer = window.setTimeout(setCounter, 2600);
    }
    if (hadFocus) {
      const next = bugs.find((o) => !o.squashed);
      (next ? next.btn : counter).focus({ preventScroll: true });
    }
  }

  /* ---------- State ---------- */
  const pointer = { x: 0, y: 0, in: false };
  let spotX = 0;
  let spotY = 0;
  let cardsDirty = false;
  let heroVisible = true;
  let avoidDueAt = 0;
  const visibleCards = new Set(watchCards);
  const edgeState = new Map();   // card -> { o, mx, my }
  const tilt = new Map();        // card -> { rx, ry, tx, ty }
  let activeTilt = null;
  const MAX_TILT = 5;

  /* ---------- One rAF loop ---------- */
  let raf = 0;
  let last = 0;
  const wake = () => {
    if (raf) return;
    last = performance.now();
    raf = window.requestAnimationFrame(frame);
  };

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    let busy = false;

    // Reads first.
    if (!heroVisible) avoidDueAt = 0;
    if (avoidDueAt && now >= avoidDueAt) {
      avoidDueAt = 0;
      measureAvoid();
      if (still) resolveBugs(); // drifting bugs walk away on their own in stepBugs
    }
    let rects = null;
    if (pointerFx && cardsDirty) {
      cardsDirty = false;
      rects = new Map();
      visibleCards.forEach((c) => rects.set(c, c.getBoundingClientRect()));
    }

    // Then writes.
    if (pointerFx) busy = stepPointer(dt, rects) || busy;
    if (!still && heroVisible) busy = stepBugs(dt) || busy;
    if (avoidDueAt) busy = true;
    if (busy) raf = window.requestAnimationFrame(frame);
  }

  function stepPointer(dt, rects) {
    let busy = false;

    // Spotlight trails the cursor a little (no trailing with reduced motion).
    if (pointer.in) {
      const k = still ? 1 : 1 - Math.exp(-dt * 9);
      spotX += (pointer.x - spotX) * k;
      spotY += (pointer.y - spotY) * k;
      spot.style.transform = `translate3d(${spotX.toFixed(1)}px, ${spotY.toFixed(1)}px, 0)`;
      if (Math.abs(pointer.x - spotX) + Math.abs(pointer.y - spotY) > 0.4) busy = true;
    }

    if (rects) {
      // Edge light on cards near the cursor.
      rects.forEach((r, card) => {
        if (!card.classList.contains('fx-edge')) return;
        const dx = Math.max(r.left - pointer.x, 0, pointer.x - r.right);
        const dy = Math.max(r.top - pointer.y, 0, pointer.y - r.bottom);
        const o = pointer.in ? Math.round(clamp(1 - Math.hypot(dx, dy) / 140) * 100) / 100 : 0;
        const mx = Math.round(pointer.x - r.left);
        const my = Math.round(pointer.y - r.top);
        const prev = edgeState.get(card) || { o: 0, mx: 0, my: 0 };
        if (o === 0 && prev.o === 0) return;
        if (o !== prev.o) card.style.setProperty('--fx-o', String(o));
        if (o > 0 && (mx !== prev.mx || my !== prev.my)) {
          card.style.setProperty('--mx', `${mx}px`);
          card.style.setProperty('--my', `${my}px`);
        }
        edgeState.set(card, { o, mx, my });
      });

      // Tilt target for the card under the cursor (small hysteresis so edges never flicker).
      if (tiltOn) {
        let next = null;
        rects.forEach((r, card) => {
          if (!tiltCards.includes(card) || !pointer.in) return;
          const m = card === activeTilt ? 8 : 0;
          if (pointer.x >= r.left - m && pointer.x <= r.right + m && pointer.y >= r.top - m && pointer.y <= r.bottom + m) {
            next = card;
            const px = clamp((pointer.x - r.left) / r.width) - 0.5;
            const py = clamp((pointer.y - r.top) / r.height) - 0.5;
            const s = tilt.get(card) || { rx: 0, ry: 0, tx: 0, ty: 0 };
            s.tx = -py * 2 * MAX_TILT;
            s.ty = px * 2 * MAX_TILT;
            tilt.set(card, s);
          }
        });
        if (activeTilt && activeTilt !== next && tilt.has(activeTilt)) {
          const s = tilt.get(activeTilt);
          s.tx = 0; s.ty = 0;
        }
        activeTilt = next;
      }
    }

    // Ease every tilted card toward its target, back to flat when the cursor leaves.
    if (tiltOn || tilt.size) {
      const k = 1 - Math.exp(-dt * 10);
      tilt.forEach((s, card) => {
        s.rx += (s.tx - s.rx) * k;
        s.ry += (s.ty - s.ry) * k;
        if (Math.abs(s.tx - s.rx) < 0.01 && Math.abs(s.ty - s.ry) < 0.01) { s.rx = s.tx; s.ry = s.ty; } else busy = true;
        const angle = Math.hypot(s.rx, s.ry);
        card.style.rotate = angle < 0.01 ? '' : `${s.rx.toFixed(3)} ${s.ry.toFixed(3)} 0 ${angle.toFixed(3)}deg`;
        if (angle < 0.01 && s.tx === 0 && s.ty === 0) tilt.delete(card);
      });
    }
    return busy;
  }

  const SPEED = 16; // px per second
  function stepBugs(dt) {
    let any = false;
    bugs.forEach((b) => {
      if (b.squashed) return;
      any = true;
      // If text moved onto the bug (hero parallax), it scurries off.
      if (!fits(b.x, b.y, b)) {
        for (let i = 0; i < 12; i += 1) {
          const ang = (i / 12) * Math.PI * 2;
          const nx = b.x + Math.cos(ang) * SPEED * 4 * dt;
          const ny = b.y + Math.sin(ang) * SPEED * 4 * dt;
          if (fits(nx, ny, b)) { b.x = nx; b.y = ny; b.a = ang; break; }
        }
        if (!fits(b.x, b.y, b) && Math.random() < 0.02) spawn(b);
        placeBug(b);
        return;
      }
      if (b.hold) return;
      if (b.wait > 0) { b.wait -= dt; return; }
      b.turn = clamp(b.turn + (Math.random() - 0.5) * 3 * dt, -1, 1);
      b.a += b.turn * dt;
      const nx = b.x + Math.cos(b.a) * SPEED * dt;
      const ny = b.y + Math.sin(b.a) * SPEED * dt;
      if (fits(nx, ny, b)) {
        b.x = nx;
        b.y = ny;
      } else {
        b.a += Math.PI * (0.6 + Math.random() * 0.8);
        b.turn = 0;
        b.wait = 0.3 + Math.random() * 0.5;
      }
      placeBug(b);
    });
    return any;
  }

  /* ---------- Modes ---------- */
  function clearPointerFx() {
    spot.classList.remove('on');
    pointer.in = false;
    edgeState.forEach((_, card) => card.style.setProperty('--fx-o', '0'));
    edgeState.clear();
    tilt.forEach((_, card) => { card.style.rotate = ''; });
    tilt.clear();
    activeTilt = null;
  }

  function setMode() {
    still = mqReduce.matches;
    pointerFx = mqHover.matches;
    tiltOn = pointerFx && !still;
    doc.classList.toggle('fx-hover', pointerFx);
    doc.classList.toggle('fx-still', still);
    if (!pointerFx || !tiltOn) clearPointerFx();
    if (pointerFx && !spot.isConnected) document.body.prepend(spot);
    wake();
  }

  /* ---------- Observers and listeners ---------- */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      heroVisible = entries[entries.length - 1].isIntersecting;
      if (heroVisible) wake();
    }).observe(hero);

    visibleCards.clear();
    const cardIo = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { visibleCards.add(e.target); return; }
        visibleCards.delete(e.target);
        if (edgeState.has(e.target)) { e.target.style.setProperty('--fx-o', '0'); edgeState.delete(e.target); }
        if (tilt.has(e.target)) { const s = tilt.get(e.target); s.tx = 0; s.ty = 0; }
      });
      cardsDirty = true;
      wake();
    }, { rootMargin: '10% 0px' });
    watchCards.forEach((c) => cardIo.observe(c));
  }

  const contactCard = q('.contact-card');
  if (contactCard) {
    const ringSize = () => {
      const r = contactCard.getBoundingClientRect();
      contactCard.style.setProperty('--fx-ring', `${Math.ceil(Math.hypot(r.width, r.height)) + 4}px`);
    };
    ringSize();
    if ('ResizeObserver' in window) new ResizeObserver(ringSize).observe(contactCard);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        contactCard.classList.toggle('fx-live', entries[entries.length - 1].isIntersecting);
      }).observe(contactCard);
    } else {
      contactCard.classList.add('fx-live');
    }
  }

  window.addEventListener('pointermove', (e) => {
    if (!pointerFx || e.pointerType !== 'mouse') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (!pointer.in) {
      pointer.in = true;
      spotX = pointer.x;
      spotY = pointer.y;
      spot.classList.add('on');
    }
    cardsDirty = true;
    wake();
  }, { passive: true });

  const leave = () => {
    if (!pointer.in) return;
    pointer.in = false;
    spot.classList.remove('on');
    cardsDirty = true;
    wake();
  };
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) leave(); }, { passive: true });
  window.addEventListener('blur', leave);

  window.addEventListener('scroll', () => {
    if (pointerFx) cardsDirty = true;
    if (heroVisible && !still && !avoidDueAt) avoidDueAt = performance.now() + 120;
    wake();
  }, { passive: true });

  // The hero slides in on load (.reveal), so measure again once that settles.
  hero.addEventListener('transitionend', (e) => {
    if (!e.target.classList || !e.target.classList.contains('reveal')) return;
    avoidDueAt = performance.now() + 60;
    wake();
  });

  let resizeTimer = 0;
  const remeasure = () => { measureHero(); resolveBugs(); wake(); };
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(remeasure, 150);
  });
  window.addEventListener('load', remeasure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);

  [mqReduce, mqHover].forEach((mq) => {
    if (mq.addEventListener) mq.addEventListener('change', setMode);
    else if (mq.addListener) mq.addListener(setMode);
  });

  /* ---------- Start ---------- */
  measureHero();
  bugs.forEach((b) => { spawn(b); placeBug(b); });
  setMode();
})();
