import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// ============================================================
// Motion 2D — tono sobrio y financiero.
// Solo transform y opacity · power2/power3.out · 0.6–1s ·
// staggers 0.08–0.15 · entradas once:true · scrub solo en líneas.
// Este módulo NO se importa si prefers-reduced-motion está activo.
// ============================================================

gsap.registerPlugin(ScrollTrigger);

const EASE = 'power2.out';
const EASE3 = 'power3.out';

function heroSequence() {
  const tl = gsap.timeline({ defaults: { ease: EASE3 } });
  tl.from('[data-hero="eyebrow"]', { y: 18, autoAlpha: 0, duration: 0.5 })
    .from('.hero-title .line', { yPercent: 60, autoAlpha: 0, duration: 0.7, stagger: 0.12 }, '-=0.25')
    .from('[data-hero="sub"]', { y: 20, autoAlpha: 0, duration: 0.6 }, '-=0.35')
    .from('[data-hero="ctas"] .btn', { y: 16, autoAlpha: 0, duration: 0.5, stagger: 0.08 }, '-=0.3')
    .from('.hero-stats li', { y: 14, autoAlpha: 0, duration: 0.5, stagger: 0.08 }, '-=0.25')
    .add(() => {
      // El texto SIEMPRE primero: recién acá puede entrar el 3D (o el fallback).
      window.__heroTextDone = true;
      window.dispatchEvent(new CustomEvent('hero:textdone'));
      const visual = document.getElementById('hero-visual');
      if (visual?.classList.contains('static')) {
        gsap.fromTo('.hero-fallback', { autoAlpha: 0, scale: 0.94 }, { autoAlpha: 1, scale: 1, duration: 0.8, ease: EASE });
      }
    });
  return tl;
}

function scrollReveals() {
  // Reveals genéricos.
  document.querySelectorAll('[data-reveal]').forEach((el) => {
    gsap.from(el, {
      y: 24,
      autoAlpha: 0,
      duration: 0.7,
      ease: EASE,
      scrollTrigger: { trigger: el, start: 'top 84%', once: true },
    });
  });

  // Grupos en cascada (párrafos, formulario, equipo).
  document.querySelectorAll('[data-reveal-group]').forEach((group) => {
    gsap.from(group.children, {
      y: 22,
      autoAlpha: 0,
      duration: 0.65,
      ease: EASE,
      stagger: 0.12,
      scrollTrigger: { trigger: group, start: 'top 82%', once: true },
    });
  });
}

function mercado() {
  const st = document.querySelector('[data-statement]');
  if (!st) return;
  const tl = gsap.timeline({
    scrollTrigger: { trigger: st, start: 'top 82%', once: true },
    defaults: { ease: EASE3 },
  });
  tl.from(st.querySelector('.statement-line'), { scaleY: 0, transformOrigin: 'top', duration: 0.8 })
    .from(st.querySelector('.statement-text'), { y: 24, autoAlpha: 0, duration: 0.8 }, '-=0.5');
}

function ecosistema() {
  // Pasos del recorrido en secuencia.
  gsap.from('[data-journey]', {
    y: 26,
    autoAlpha: 0,
    duration: 0.65,
    ease: EASE,
    stagger: 0.14,
    scrollTrigger: { trigger: '#journey', start: 'top 80%', once: true },
  });

  // La línea que conecta los pasos se dibuja con scrub.
  const fill = document.getElementById('journey-line-fill');
  if (fill) {
    const horizontal = window.matchMedia('(min-width: 769px)').matches;
    gsap.fromTo(
      fill,
      horizontal ? { scaleX: 0 } : { scaleY: 0 },
      {
        ...(horizontal ? { scaleX: 1 } : { scaleY: 1 }),
        ease: 'none',
        scrollTrigger: { trigger: '#journey', start: 'top 78%', end: 'bottom 45%', scrub: true },
      },
    );
  }

  // Tarjetas de unidad.
  gsap.from('[data-unit]', {
    y: 30,
    autoAlpha: 0,
    duration: 0.7,
    ease: EASE,
    stagger: 0.12,
    scrollTrigger: { trigger: '.units', start: 'top 80%', once: true },
  });

  // Panel del software: scale sutil + barra de progreso.
  const panel = document.getElementById('software-panel');
  if (panel) {
    gsap.from(panel, {
      scale: 0.96,
      autoAlpha: 0,
      duration: 0.8,
      ease: EASE,
      scrollTrigger: { trigger: panel, start: 'top 82%', once: true },
    });
    gsap.to('#panel-progress-fill', {
      scaleX: 0.78,
      duration: 1,
      ease: EASE,
      scrollTrigger: { trigger: panel, start: 'top 75%', once: true },
    });
  }
}

function traccion() {
  gsap.from('.metric', {
    y: 24,
    autoAlpha: 0,
    duration: 0.7,
    ease: EASE,
    stagger: 0.1,
    scrollTrigger: { trigger: '#metrics', start: 'top 82%', once: true },
  });
}

function quienesSomos() {
  // Parallax suave de la foto (solo desktop).
  if (window.matchMedia('(min-width: 769px)').matches) {
    gsap.fromTo(
      '[data-parallax]',
      { y: 30 },
      {
        y: -30,
        ease: 'none',
        scrollTrigger: { trigger: '.founder-grid', start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  }

  // Cita por líneas; el remate dorado entra último por orden natural.
  gsap.from('[data-quote] .quote-l', {
    y: 22,
    autoAlpha: 0,
    duration: 0.7,
    ease: EASE3,
    stagger: 0.15,
    scrollTrigger: { trigger: '[data-quote]', start: 'top 80%', once: true },
  });
  gsap.from('[data-quote] footer', {
    autoAlpha: 0,
    duration: 0.6,
    ease: EASE,
    delay: 0.5,
    scrollTrigger: { trigger: '[data-quote]', start: 'top 80%', once: true },
  });

  // Timeline: la línea se dibuja con scrub, los hitos aparecen al activarse.
  gsap.to('#timeline-rail-fill', {
    scaleY: 1,
    ease: 'none',
    scrollTrigger: { trigger: '#timeline', start: 'top 75%', end: 'bottom 55%', scrub: true },
  });
  document.querySelectorAll('[data-milestone]').forEach((mi) => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: mi, start: 'top 78%', once: true },
      defaults: { ease: EASE },
    });
    tl.from(mi.querySelector('.milestone-dot'), { scale: 0, duration: 0.35, ease: 'back.out(2)' })
      .from([mi.querySelector('h3'), mi.querySelector('p')], { y: 16, autoAlpha: 0, duration: 0.55, stagger: 0.08 }, '-=0.1');
  });
}

function vision() {
  gsap.from('[data-horizon="left"]', {
    x: -40,
    autoAlpha: 0,
    duration: 0.8,
    ease: EASE,
    scrollTrigger: { trigger: '.horizons', start: 'top 80%', once: true },
  });
  gsap.from('[data-horizon="right"]', {
    x: 40,
    autoAlpha: 0,
    duration: 0.8,
    ease: EASE,
    delay: 0.12,
    scrollTrigger: { trigger: '.horizons', start: 'top 80%', once: true },
  });
}

export function init() {
  heroSequence();
  scrollReveals();
  mercado();
  ecosistema();
  traccion();
  quienesSomos();
  vision();
}
