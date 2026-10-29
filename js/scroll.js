// Scroll-driven motion: the page "tests itself" as you scroll.
// Progressive enhancement: all extra markup is added here, so without JS the page stays static and readable.
// One rAF-throttled update reads scrollY plus cached positions and writes only transform, opacity,
// clip-path (via classes) and a couple of CSS variables. IntersectionObserver skips off-screen sections.
(() => {
  const doc = document.documentElement;
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => [...root.querySelectorAll(sel)];
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const make = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  };
  const hide = (el) => { el.setAttribute('aria-hidden', 'true'); return el; };

  const hero = q('#top');
  const about = q('#about');
  const skills = q('#skills');
  const projects = q('#projects');
  const experience = q('#experience');
  const contact = q('#contact');
  const sections = [hero, about, skills, projects, experience, contact];
  if (sections.some((s) => !s)) return;

  const nav = q('.nav');
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mqMobile = window.matchMedia('(max-width: 767.98px)');

  doc.classList.add('sx-ready');

  /* ---------- Build: global test-run bar ---------- */
  const bar = hide(make('div', 'sx-progress'));
  const barFill = make('span', 'sx-progress-fill');
  bar.append(barFill);
  const barSegs = sections.map(() => {
    const seg = make('span', 'sx-progress-seg', '<i></i>');
    bar.append(seg);
    return seg;
  });
  let segEnds = sections.map(() => 1);
  document.body.append(bar);

  /* ---------- Build: pin wrappers (sticky only when .sx-pinned) ---------- */
  const makePin = (section) => {
    const pin = make('div', 'sx-pin');
    pin.append(...section.childNodes);
    const spacer = hide(make('div', 'sx-spacer'));
    section.append(pin, spacer);
    return { section, pin, spacer, pinned: false, top: 0, start: 0, room: 0 };
  };
  const pins = { about: makePin(about), skills: makePin(skills), projects: makePin(projects) };

  /* ---------- Build: About words ---------- */
  const para = q('.intro-card p', about);
  const words = [];
  if (para) {
    const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.append(part); return; }
        const w = make('span', 'sx-w');
        w.textContent = part;
        words.push(w);
        frag.append(w);
      });
      node.replaceWith(frag);
    });
  }

  /* ---------- Build: Skills test suite ---------- */
  const skillCards = qa('.skill-card', skills);
  const runner = hide(make('div', 'sx-runner',
    '<div class="sx-runner-row">' +
      '<span class="sx-runner-cmd"><span class="accent">$</span> run skills.spec</span>' +
      '<span class="sx-runner-status">Ready</span>' +
      '<span class="sx-runner-count"></span>' +
    '</div>' +
    '<div class="sx-runner-track"><span class="sx-runner-fill"></span><span class="sx-runner-pass"></span></div>'));
  const skillsGrid = q('.skills-grid', skills);
  skillsGrid.before(runner);
  const runnerStatus = q('.sx-runner-status', runner);
  const runnerCount = q('.sx-runner-count', runner);
  const runnerFill = q('.sx-runner-fill', runner);
  const tests = [];
  const cardTests = skillCards.map((card) => {
    const head = q('.skill-head', card);
    if (head) head.append(hide(make('span', 'sx-card-pass', 'pass')));
    const range = [tests.length, 0];
    qa('.tag', card).forEach((tag) => {
      tag.prepend(hide(make('span', 'sx-check', '<span class="sx-check-ring"></span><span class="sx-check-mark">✓</span>')));
      tests.push({ el: tag, y: 0 });
    });
    range[1] = tests.length;
    return range;
  });
  const total = tests.length;

  /* ---------- Build: Projects badges ---------- */
  const track = q('.projects-grid', projects);
  const cards = qa('.project-card', projects);
  const bugs = cards.map((card) => {
    const badge = hide(make('span', 'sx-bug',
      '<span class="sx-bug-found"><i></i>bug found</span><span class="sx-bug-arrow">→</span><span class="sx-bug-fixed">✓ fixed</span>'));
    (q('.preview', card) || card).append(badge);
    return badge;
  });

  /* ---------- Existing elements we animate ---------- */
  const aurora = q('.aurora');
  const blobs = qa('.aurora .blob');
  // Depth speeds: negative = the layer lifts away faster than the page (nearer to the viewer).
  // Upper layers move fastest so the gaps only ever widen and nothing drifts into About.
  const heroLayers = [
    [q('.hero-cmd', hero), -0.32, 'transform', false],
    [q('.pill', hero), -0.28, 'translate', false],
    [q('.hero-hi', hero), -0.22, 'transform', true],
    [q('.hero-line', hero), -0.16, 'transform', true],
    [q('.hero-sub', hero), -0.1, 'translate', false],
    [q('.hero-ctas', hero), -0.05, 'translate', false],
  ].filter(([el]) => el);
  const timeline = q('.timeline', experience);
  const items = timeline ? qa('.timeline-item', timeline) : [];
  const contactCard = q('.contact-card', contact);
  const contactItems = qa('.contact-inner > *', contact);
  contactItems.forEach((el, i) => el.style.setProperty('--i', i));

  /* ---------- State ---------- */
  let mode = '';          // 'full' | 'lite' | 'static'
  let hMode = '';         // projects: 'pin' | 'row' | ''
  let vh = window.innerHeight;
  let maxScroll = 1;
  let heroEnd = 1;
  let hDist = 0;
  let pinLeft = 0;
  let cardLeft = [];
  let rowScroll = 0;
  let rowWidth = 1;
  let gridTop = 0;
  let paraTop = 0;
  let rail = null;
  let contactTop = 0;
  let contactCardTop = 0;
  let contactItemTops = [];
  let lastWordP = -1;
  let lastPassed = -1;
  let lastRate = 1;
  let blobAnims = null;
  const active = new Set(sections);

  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  /* ---------- Measure (layout reads, run on load/resize only) ---------- */
  function setProjectsLayout(navOffset) {
    let next = mode === 'full' ? 'pin' : mode === 'lite' ? 'row' : '';
    doc.classList.toggle('sx-hpin', next === 'pin');
    doc.classList.toggle('sx-row', next === 'row');
    if (next === 'pin' && pins.projects.pin.offsetHeight + navOffset + 16 > vh) {
      // Viewport too short to pin the row: fall back to the native swipe row.
      next = 'row';
      doc.classList.remove('sx-hpin');
      doc.classList.add('sx-row');
    }
    hMode = next;
    track.style.transform = '';
    if (hMode === 'row') {
      track.setAttribute('tabindex', '0');
      track.setAttribute('role', 'region');
      track.setAttribute('aria-label', 'Featured projects, scrolls sideways');
    } else {
      ['tabindex', 'role', 'aria-label'].forEach((a) => track.removeAttribute(a));
    }
  }

  function measure(layoutChanged) {
    vh = window.innerHeight;
    const navOffset = Math.round(nav ? nav.getBoundingClientRect().bottom : 84) + 12;
    doc.style.setProperty('--sx-nav', `${navOffset - 4}px`);
    if (layoutChanged) setProjectsLayout(navOffset);

    Object.entries(pins).forEach(([key, p]) => {
      const h = p.pin.offsetHeight;
      const canPin = mode === 'full' && (key !== 'projects' || hMode === 'pin') && h + 32 <= vh;
      p.pinned = canPin;
      p.section.classList.toggle('sx-pinned', canPin);
      p.top = Math.min(navOffset, vh - h - 16);
      p.pin.style.setProperty('--pin-top', `${p.top}px`);
      if (key === 'projects') hDist = hMode === 'pin' ? Math.max(0, track.offsetWidth - p.pin.clientWidth) : 0;
      // Skills gets the most scroll room: it is the signature moment.
      p.room = !canPin ? 0 : key === 'about' ? vh * 0.6 : key === 'skills' ? vh * 1.8 : hDist + vh * 0.4;
      p.spacer.style.height = `${Math.round(p.room)}px`;
    });

    Object.values(pins).forEach((p) => {
      p.start = docTop(p.section) + parseFloat(getComputedStyle(p.section).paddingTop) - p.top;
    });

    heroEnd = docTop(hero) + hero.offsetHeight;
    maxScroll = Math.max(1, doc.scrollHeight - vh);

    const bounds = sections.map((sec, i) => (i === 0 ? 0 : clamp((docTop(sec) - navOffset) / maxScroll)));
    segEnds = bounds.map((b, i) => (i < bounds.length - 1 ? bounds[i + 1] : 1));
    barSegs.forEach((seg, i) => {
      seg.style.left = `${bounds[i] * 100}%`;
      seg.style.width = `${(segEnds[i] - bounds[i]) * 100}%`;
    });

    if (para) paraTop = docTop(para);
    if (!pins.skills.pinned) {
      tests.forEach((t) => {
        const r = t.el.getBoundingClientRect();
        t.y = r.top + window.scrollY + r.height / 2;
      });
    }

    pinLeft = pins.projects.pin.getBoundingClientRect().left;
    cardLeft = cards.map((c) => c.offsetLeft - cards[0].offsetLeft);
    gridTop = docTop(track);
    rowWidth = track.clientWidth || 1;
    rowScroll = track.scrollLeft;

    bugs.forEach((b) => {
      const found = q('.sx-bug-found', b);
      b.style.setProperty('--found-w', `${found.offsetLeft + found.offsetWidth + 11}px`);
    });

    if (timeline && items.length) {
      const dotY = items.map((li) => {
        const d = q('.timeline-date', li);
        if (!d) return li.offsetTop + 40;
        const cs = getComputedStyle(d);
        return li.offsetTop + d.offsetTop + parseFloat(cs.paddingTop) + (parseFloat(cs.lineHeight) || 22) / 2;
      });
      items.forEach((li, i) => li.style.setProperty('--dot-y', `${dotY[i] - li.offsetTop}px`));
      rail = {
        docTop: docTop(timeline),
        top: dotY[0],
        h: dotY[dotY.length - 1] - dotY[0],
        at: dotY.map((y) => y - dotY[0]),
      };
      timeline.style.setProperty('--rail-top', `${rail.top}px`);
      timeline.style.setProperty('--rail-h', `${rail.h}px`);
    }

    contactTop = docTop(contact);
    contactCardTop = contactCard ? docTop(contactCard) : contactTop;
    contactItemTops = contactItems.map(docTop);
  }

  /* ---------- Writers ---------- */
  function setWords(p) {
    if (Math.abs(p - lastWordP) < 0.0005) return;
    lastWordP = p;
    const n = words.length;
    const soft = 4;
    words.forEach((w, i) => {
      const lit = clamp((p * (n + soft) - i) / soft);
      w.style.opacity = (0.2 + 0.8 * lit).toFixed(3);
    });
  }

  function setSuite(passed) {
    if (passed === lastPassed) return;
    lastPassed = passed;
    tests.forEach((t, i) => {
      t.el.classList.toggle('sx-pass', i < passed);
      t.el.classList.toggle('sx-run', i === passed);
    });
    skillCards.forEach((card, c) => card.classList.toggle('sx-done', passed >= cardTests[c][1]));
    const done = passed >= total;
    runnerFill.style.transform = `scaleX(${total ? passed / total : 1})`;
    runnerCount.textContent = `${passed}/${total} passed`;
    runnerStatus.textContent = done ? 'All tests passed' : passed === 0 ? 'Ready' : 'Running';
    runner.classList.toggle('done', done);
    runner.classList.toggle('running', !done && passed > 0);
  }

  function setRate(rate) {
    if (rate === lastRate) return;
    lastRate = rate;
    if (!blobAnims) blobAnims = blobs.flatMap((b) => (b.getAnimations ? b.getAnimations() : []));
    blobAnims.forEach((a) => (a.updatePlaybackRate ? a.updatePlaybackRate(rate) : (a.playbackRate = rate)));
  }

  function clearInline() {
    if (aurora) { aurora.style.transform = ''; aurora.style.opacity = ''; }
    heroLayers.forEach(([el]) => { el.style.transform = ''; el.style.translate = ''; el.style.opacity = ''; });
    words.forEach((w) => { w.style.opacity = ''; });
    track.style.transform = '';
    lastWordP = -1;
    lastPassed = -1;
    setRate(1);
  }

  function applyFinal() {
    setSuite(total);
    bugs.forEach((b) => b.classList.add('fixed'));
    if (timeline) timeline.style.setProperty('--rail', '1');
    items.forEach((li) => li.classList.add('sx-reached'));
    contactItems.forEach((el) => el.classList.add('sx-in'));
    if (contactCard) contactCard.classList.add('sx-calm');
  }

  /* ---------- Update (scroll-linked, no layout reads) ---------- */
  function update() {
    if (mode === 'static') return;
    const s = window.scrollY;

    // Global test-run bar: completed sections turn green.
    const gp = clamp(s / maxScroll);
    barFill.style.transform = `scaleX(${gp.toFixed(4)})`;
    barSegs.forEach((seg, i) => seg.classList.toggle('pass', gp >= segEnds[i] - 0.002));

    // Hero: depth parallax. Aurora is the far layer, text layers drift apart at different speeds.
    if (active.has(hero) || s < heroEnd) {
      const k = mode === 'lite' ? 0.5 : 1;
      const hs = Math.min(s, heroEnd);
      const t = clamp(hs / heroEnd);
      if (aurora) aurora.style.transform = `translate3d(0, ${(-hs * 0.15 * k).toFixed(1)}px, 0)`;
      heroLayers.forEach(([el, speed, prop, isTitle]) => {
        const y = (hs * speed * k).toFixed(1);
        if (prop === 'translate') el.style.translate = `0 ${y}px`;
        else el.style.transform = `translate3d(0, ${y}px, 0)${isTitle ? ` scale(${(1 + 0.04 * t * k).toFixed(4)})` : ''}`;
        if (isTitle) el.style.opacity = (1 - 0.45 * t * k).toFixed(3);
      });
    }

    // About: words light up with scroll progress (pinned on desktop).
    if (words.length && active.has(about)) {
      const P = pins.about;
      const p = P.pinned
        ? clamp((s - (P.start - vh * 0.35)) / (P.room * 0.85 + vh * 0.35))
        : clamp((s + vh * 0.85 - paraTop) / (vh * 0.5));
      setWords(p);
    }

    // Skills: each tag is a test case that passes in order.
    if (active.has(skills)) {
      const P = pins.skills;
      let passed = 0;
      if (P.pinned) {
        const p = clamp((s - P.start) / P.room);
        passed = Math.floor(clamp((p - 0.04) / 0.74) * total + 1e-6);
      } else {
        const line = s + vh * 0.72;
        while (passed < total && tests[passed].y <= line) passed += 1;
      }
      setSuite(passed);
    }

    // Projects: sideways track while pinned, or badges as cards swipe in.
    if (active.has(projects)) {
      const inView = s + vh * 0.8 > gridTop;
      if (hMode === 'pin' && pins.projects.pinned) {
        const P = pins.projects;
        const m = clamp((clamp((s - P.start) / P.room) - 0.06) / 0.82);
        const x = -m * hDist;
        track.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
        bugs.forEach((b, i) => {
          if (inView && pinLeft + cardLeft[i] + x < window.innerWidth * 0.8) b.classList.add('fixed');
        });
      } else {
        bugs.forEach((b, i) => {
          if (inView && cardLeft[i] - rowScroll < rowWidth * 0.6) b.classList.add('fixed');
        });
      }
    }

    // Experience: the line draws itself, each role appears when the line reaches it.
    if (rail && active.has(experience)) {
      const line = s + vh * 0.68 - (rail.docTop + rail.top);
      const f = rail.h > 0 ? clamp(line / rail.h) : line >= 0 ? 1 : 0;
      timeline.style.setProperty('--rail', f.toFixed(4));
      items.forEach((li, i) => li.classList.toggle('sx-reached', line >= rail.at[i] - 4));
    }

    // Contact: aurora softens and slows, content settles in once and stays.
    const cStart = contactTop - vh;
    const c = easeOut(clamp((s - cStart) / Math.max(1, maxScroll - cStart)));
    if (aurora) aurora.style.opacity = (1 - 0.5 * c).toFixed(3);
    setRate(Math.round((1 - 0.75 * c) * 20) / 20);
    if (active.has(contact)) {
      contactItems.forEach((el, i) => { if (s + vh * 0.92 > contactItemTops[i]) el.classList.add('sx-in'); });
      if (contactCard && s + vh * 0.75 > contactCardTop) contactCard.classList.add('sx-calm');
    }
  }

  /* ---------- Scheduling ---------- */
  let ticking = false;
  const requestUpdate = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => { ticking = false; update(); });
  };
  let measureQueued = false;
  let layoutQueued = false;
  const requestMeasure = (layoutChanged) => {
    layoutQueued = layoutQueued || layoutChanged;
    if (measureQueued) return;
    measureQueued = true;
    window.requestAnimationFrame(() => {
      measureQueued = false;
      const lc = layoutQueued;
      layoutQueued = false;
      if (mode === 'static') { measure(lc); return; }
      measure(lc);
      update();
    });
  };

  function setMode() {
    mode = mqReduce.matches ? 'static' : mqMobile.matches ? 'lite' : 'full';
    doc.classList.toggle('sx-motion', mode !== 'static');
    doc.classList.toggle('sx-static', mode === 'static');
    doc.classList.toggle('sx-full', mode === 'full');
    doc.classList.toggle('sx-lite', mode === 'lite');
    clearInline();
    measure(true);
    if (mode === 'static') applyFinal();
    else update();
  }

  if ('IntersectionObserver' in window) {
    active.clear();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? active.add(e.target) : active.delete(e.target)));
      requestUpdate();
    }, { rootMargin: '25% 0px 25% 0px' });
    sections.forEach((sec) => io.observe(sec));
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => requestMeasure(true), 120);
  });
  track.addEventListener('scroll', () => { rowScroll = track.scrollLeft; requestUpdate(); }, { passive: true });

  // Keyboard: tabbing into a card that is translated off-screen scrolls the page to it.
  track.addEventListener('focusin', (e) => {
    if (hMode !== 'pin' || !pins.projects.pinned) return;
    const i = cards.indexOf(e.target.closest('.project-card'));
    if (i < 0) return;
    const P = pins.projects;
    const p = 0.06 + clamp(cardLeft[i] / Math.max(1, hDist)) * 0.82;
    window.scrollTo({ top: P.start + p * P.room, behavior: 'instant' });
  });

  [mqReduce, mqMobile].forEach((mq) => {
    if (mq.addEventListener) mq.addEventListener('change', setMode);
    else if (mq.addListener) mq.addListener(setMode);
  });

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => requestMeasure(false));
    [pins.about.pin, pins.skills.pin, track, timeline, contactCard].filter(Boolean).forEach((el) => ro.observe(el));
  }
  window.addEventListener('load', () => requestMeasure(false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestMeasure(false));

  setMode();
})();
