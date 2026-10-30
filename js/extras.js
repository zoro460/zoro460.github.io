// Extras: magnetic buttons, count-up numbers and a hidden "test" easter egg.
// Magnets run on one rAF loop that stops when nothing moves. Listeners are passive.
(() => {
  const doc = document.documentElement;
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqHover = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  let still = mqReduce.matches;
  let magnetsOn = mqHover.matches && !still;

  doc.classList.add('ex-ready');
  doc.classList.toggle('ex-still', still);

  /* ---------- 1. Magnetic buttons ---------- */
  const MAX_PULL = 7;    // px the button moves at most
  const LABEL_EXTRA = 0.5; // the label moves 1.5x the button
  const RADIUS = 70;     // px around the button where the pull starts

  const magnets = [...document.querySelectorAll('#top .btn, .contact-card .btn, .nav-resume')].map((btn) => {
    const label = document.createElement('span');
    label.className = 'ex-label';
    label.append(...btn.childNodes);
    btn.append(label);
    return { btn, label, x: 0, y: 0, tx: 0, ty: 0 };
  });

  const pointer = { x: 0, y: 0, in: false };
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

    // Reads first: where each button sits without its own pull.
    const rects = magnets.map((m) => m.btn.getBoundingClientRect());

    let busy = false;
    const k = 1 - Math.exp(-dt * 12);
    magnets.forEach((m, i) => {
      const r = rects[i];
      m.tx = 0;
      m.ty = 0;
      if (magnetsOn && pointer.in && r.width) {
        const cx = r.left + r.width / 2 - m.x;
        const cy = r.top + r.height / 2 - m.y;
        const dx = Math.max(r.left - m.x - pointer.x, 0, pointer.x - (r.right - m.x));
        const dy = Math.max(r.top - m.y - pointer.y, 0, pointer.y - (r.bottom - m.y));
        if (Math.hypot(dx, dy) < RADIUS) {
          let px = (pointer.x - cx) * 0.18;
          let py = (pointer.y - cy) * 0.18;
          const len = Math.hypot(px, py);
          if (len > MAX_PULL) { px *= MAX_PULL / len; py *= MAX_PULL / len; }
          m.tx = px;
          m.ty = py;
        }
      }
      m.x += (m.tx - m.x) * k;
      m.y += (m.ty - m.y) * k;
      if (Math.abs(m.tx - m.x) < 0.05 && Math.abs(m.ty - m.y) < 0.05) { m.x = m.tx; m.y = m.ty; } else busy = true;
      const atRest = m.x === 0 && m.y === 0;
      m.btn.style.translate = atRest ? '' : `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
      m.label.style.translate = atRest ? '' : `${(m.x * LABEL_EXTRA).toFixed(2)}px ${(m.y * LABEL_EXTRA).toFixed(2)}px`;
    });
    if (busy) raf = window.requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', (e) => {
    if (!magnetsOn || e.pointerType !== 'mouse') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.in = true;
    wake();
  }, { passive: true });
  const release = () => { if (pointer.in) { pointer.in = false; wake(); } };
  document.addEventListener('pointerout', (e) => { if (!e.relatedTarget) release(); }, { passive: true });
  window.addEventListener('blur', release);
  window.addEventListener('scroll', () => { if (pointer.in) wake(); }, { passive: true });

  /* ---------- 2. Count-up numbers (only numbers already in the HTML) ---------- */
  // The hero "128 passed" already counts up in js/main.js, so it is left alone here.
  const countEls = [...document.querySelectorAll('.report-badges .badge-pass, .donut span, .stat')]
    .filter((el) => !el.closest('[data-count]') && !el.querySelector('[data-count]'));

  const counters = [];
  if (!still) {
    countEls.forEach((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && !/\d/.test(node.textContent)) node = walker.nextNode();
      if (!node) return;
      const match = node.textContent.match(/\d+/);
      const value = Number(match[0]);
      if (!value) return;
      const before = node.textContent.slice(0, match.index);
      const after = node.textContent.slice(match.index + match[0].length);

      // Visible animating copy is aria-hidden; screen readers get the real value the whole time.
      const wrap = document.createElement('span');
      wrap.className = 'ex-count';
      wrap.style.minWidth = `${match[0].length}ch`;
      const vis = document.createElement('span');
      vis.setAttribute('aria-hidden', 'true');
      vis.textContent = '0';
      const sr = document.createElement('span');
      sr.className = 'ex-sr';
      sr.textContent = match[0];
      wrap.append(vis, sr);

      const frag = document.createDocumentFragment();
      if (before) frag.append(before);
      frag.append(wrap);
      if (after) frag.append(after);
      node.replaceWith(frag);
      counters.push({ el, wrap, vis, value, text: match[0] });
    });
  }

  const finish = (c) => {
    // Put back the exact original text.
    c.wrap.replaceWith(document.createTextNode(c.text));
  };

  const run = (c) => {
    const start = performance.now();
    const duration = 1300;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      c.vis.textContent = String(Math.round(c.value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) window.requestAnimationFrame(tick);
      else finish(c);
    };
    window.requestAnimationFrame(tick);
  };

  if (counters.length) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          const c = counters.find((x) => x.el === e.target);
          if (c) run(c);
        });
      }, { threshold: 0.6 });
      counters.forEach((c) => io.observe(c.el));
    } else {
      counters.forEach(finish);
    }
  }

  /* ---------- 3. Hidden "test" easter egg ---------- */
  const toast = document.createElement('div');
  toast.className = 'ex-toast';
  toast.setAttribute('role', 'status');
  document.body.append(toast);
  const bar = document.querySelector('.sx-progress');

  let typed = '';
  let showing = false;
  let timers = [];
  const later = (fn, ms) => timers.push(window.setTimeout(fn, ms));

  function showToast() {
    showing = true;
    timers.forEach(window.clearTimeout);
    timers = [];
    toast.innerHTML =
      '<div class="ex-toast-line"><span class="accent">$</span> npm test</div>' +
      '<div class="ex-toast-line"><span class="ok">✓</span> portfolio.spec  all checks passed</div>';
    const lines = [...toast.children];
    window.requestAnimationFrame(() => toast.classList.add('show'));
    later(() => lines[0].classList.add('in'), still ? 0 : 250);
    later(() => {
      lines[1].classList.add('in');
      if (bar) {
        bar.classList.remove('ex-flash');
        void bar.offsetWidth; // restart the flash animation
        bar.classList.add('ex-flash');
      }
    }, still ? 0 : 800);
    later(hideToast, 3000);
  }

  function hideToast() {
    timers.forEach(window.clearTimeout);
    timers = [];
    toast.classList.remove('show');
    later(() => {
      toast.innerHTML = '';
      if (bar) bar.classList.remove('ex-flash');
      showing = false;
    }, still ? 0 : 450);
  }

  const isField = (t) => t && t.nodeType === 1 && (
    t.isContentEditable || t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (showing && toast.classList.contains('show')) hideToast(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (isField(e.target)) { typed = ''; return; }
    if (!e.key || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-4);
    if (typed === 'test') {
      typed = '';
      if (!showing) showToast();
    }
  }, { passive: true });

  /* ---------- Modes ---------- */
  const setMode = () => {
    still = mqReduce.matches;
    magnetsOn = mqHover.matches && !still;
    doc.classList.toggle('ex-still', still);
    if (!magnetsOn) release();
    wake();
  };
  [mqReduce, mqHover].forEach((mq) => {
    if (mq.addEventListener) mq.addEventListener('change', setMode);
    else if (mq.addListener) mq.addListener(setMode);
  });
})();
