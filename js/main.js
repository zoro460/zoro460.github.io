// Portfolio interactions: mobile menu, sticky nav state, scroll reveal, active section, test counter.
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Footer year
  const year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Mobile menu
  const menuBtn = document.querySelector('.menu-btn');
  const links = document.getElementById('nav-links');
  const setMenu = (open) => {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    links.classList.toggle('open', open);
  };
  menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && links.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
  });
  document.addEventListener('click', (e) => {
    if (links.classList.contains('open') && !e.target.closest('.nav')) setMenu(false);
  });

  // Nav background on scroll
  const navWrap = document.querySelector('.nav-wrap');
  const onScroll = () => navWrap.classList.toggle('scrolled', window.scrollY > 24);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Scroll reveal with a small stagger per group
  const revealEls = [...document.querySelectorAll('.reveal')];
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('in'));
  } else {
    revealEls.forEach((el) => {
      const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
      el.style.setProperty('--d', `${Math.min(siblings.indexOf(el), 4) * 0.07}s`);
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach((el) => io.observe(el));
  }

  // Highlight the nav link for the section in view
  const navAnchors = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  // The hero (#top) has no nav link, so seeing it clears the highlight.
  const sections = ['#top', ...navAnchors.map((a) => a.getAttribute('href'))]
    .map((sel) => document.querySelector(sel)).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navAnchors.forEach((a) => {
          const on = a.getAttribute('href') === `#${entry.target.id}`;
          a.classList.toggle('active', on);
          if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));
  }

  // Count up the "passed" number in the hero test strip
  const counter = document.querySelector('[data-count]');
  if (counter && !reduceMotion) {
    const target = Number(counter.dataset.count);
    const start = performance.now();
    const duration = 1400;
    counter.textContent = '0';
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      counter.textContent = String(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    setTimeout(() => requestAnimationFrame(tick), 500);
  }
})();
