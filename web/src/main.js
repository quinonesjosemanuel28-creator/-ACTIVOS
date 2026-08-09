import './styles.css';

// ============================================================
// +Activos Holding — main.js
// Navegación, menú mobile accesible, count-ups, formulario y
// carga condicional de motion (GSAP) y de la escena 3D del hero.
// ============================================================

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mqMobile = window.matchMedia('(max-width: 768px)');

/* ---------- Header: transparente sobre el hero, navy al scrollear ---------- */
const header = document.getElementById('site-header');
function onScrollHeader() {
  header.classList.toggle('scrolled', window.scrollY > 80);
}
onScrollHeader();
window.addEventListener('scroll', onScrollHeader, { passive: true });

/* ---------- Menú mobile: un solo menú en el DOM, oculto con aria-hidden + inert ---------- */
const toggle = document.getElementById('nav-toggle');
const menu = document.getElementById('nav-menu');

function setMenuState(open) {
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  menu.classList.toggle('open', open);
  if (mqMobile.matches) {
    menu.setAttribute('aria-hidden', String(!open));
    if (open) menu.removeAttribute('inert');
    else menu.setAttribute('inert', '');
  }
}

function syncMenuMode() {
  if (mqMobile.matches) {
    // En mobile arranca cerrado: invisible también para lectores de pantalla.
    setMenuState(false);
  } else {
    // En desktop el menú es siempre visible y navegable.
    menu.classList.remove('open');
    menu.removeAttribute('aria-hidden');
    menu.removeAttribute('inert');
    toggle.setAttribute('aria-expanded', 'false');
  }
}
syncMenuMode();
mqMobile.addEventListener('change', syncMenuMode);

toggle.addEventListener('click', () => {
  setMenuState(toggle.getAttribute('aria-expanded') !== 'true');
});
menu.addEventListener('click', (e) => {
  if (e.target.closest('a') && mqMobile.matches) setMenuState(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mqMobile.matches && toggle.getAttribute('aria-expanded') === 'true') {
    setMenuState(false);
    toggle.focus();
  }
});

/* ---------- Link activo según sección visible ---------- */
const navLinks = [...menu.querySelectorAll('a[href^="#"]')];
const sectionsById = new Map(
  navLinks
    .map((a) => document.getElementById(a.hash.slice(1)))
    .filter(Boolean)
    .map((s) => [s.id, s]),
);
const inBand = new Set();
const activeIO = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      entry.isIntersecting ? inBand.add(entry.target.id) : inBand.delete(entry.target.id);
    }
    // Sin sección en la banda (p. ej. el hero) → ningún link activo.
    const current = inBand.size ? [...inBand][inBand.size - 1] : null;
    navLinks.forEach((a) => a.classList.toggle('active', current !== null && a.hash === `#${current}`));
  },
  { rootMargin: '-45% 0px -50% 0px' },
);
sectionsById.forEach((s) => activeIO.observe(s));

/* ---------- Count-ups (tracción + panel del software) ---------- */
const fmtMiles = new Intl.NumberFormat('es-AR');

function runCount(el) {
  const to = parseInt(el.dataset.countTo, 10);
  const format = el.dataset.countFormat === 'miles' ? (n) => fmtMiles.format(n) : (n) => String(n);
  if (reducedMotion) {
    el.textContent = format(to);
    return;
  }
  const dur = parseInt(el.dataset.countDuration ?? '1200', 10);
  const t0 = performance.now();
  function tick(t) {
    const p = Math.min((t - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cúbico
    el.textContent = format(Math.round(to * eased));
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const countIO = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        runCount(entry.target);
        countIO.unobserve(entry.target); // una sola vez
      }
    }
  },
  { threshold: 0.4 },
);
document.querySelectorAll('[data-count-to]').forEach((el) => {
  if (el.closest('#software-panel')) el.dataset.countDuration = '900'; // count-up corto en el mockup
  countIO.observe(el);
});

/* ---------- Formulario: maquetado, sin backend ---------- */
document.getElementById('contact-form')?.addEventListener('submit', (e) => e.preventDefault());

/* ---------- Motion 2D (GSAP) ---------- */
if (!reducedMotion) {
  import('./motion.js').then((m) => m.init());
} else {
  // Sin animaciones: el fallback estático del hero queda visible.
  document.getElementById('hero-visual')?.classList.add('static');
}

/* ---------- Escena 3D del hero: diferida, con fallbacks ---------- */
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

window.addEventListener('load', () => {
  const visual = document.getElementById('hero-visual');
  if (!visual) return;

  const wantsStatic =
    reducedMotion || // accesibilidad primero
    mqMobile.matches || // mobile: fallback estático (batería y LCP)
    !webglAvailable();

  if (wantsStatic) {
    visual.classList.add('static');
    return;
  }

  // Desktop con pocos núcleos → versión reducida (solo el «+», sin nodos).
  const reduced = (navigator.hardwareConcurrency ?? 8) <= 4;
  import('./hero3d.js')
    .then((m) => m.init(visual, { reduced }))
    .catch(() => visual.classList.add('static'));
});
