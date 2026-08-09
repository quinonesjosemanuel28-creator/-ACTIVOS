// ============================================================
// Hero 3D — "El ecosistema" (la ÚNICA escena 3D del sitio).
// El isotipo «+» dorado como objeto central + 4 nodos orbitando
// (uno por unidad) conectados por líneas doradas finas.
// Imports selectivos de Three (tree-shaking), sin postprocessing,
// sin texturas ni modelos externos: todo geometría procedural.
// ============================================================

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Clock,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Shape,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Shape de cruz con esquinas redondeadas (el «+» de la marca). */
function crossShape(arm = 0.62, half = 1.55, r = 0.16) {
  const s = new Shape();
  const a = arm, h = half;
  s.moveTo(-a + r, h);
  s.lineTo(a - r, h);           s.quadraticCurveTo(a, h, a, h - r);
  s.lineTo(a, a + r);           s.quadraticCurveTo(a, a, a + r, a);
  s.lineTo(h - r, a);           s.quadraticCurveTo(h, a, h, a - r);
  s.lineTo(h, -a + r);          s.quadraticCurveTo(h, -a, h - r, -a);
  s.lineTo(a + r, -a);          s.quadraticCurveTo(a, -a, a, -a - r);
  s.lineTo(a, -h + r);          s.quadraticCurveTo(a, -h, a - r, -h);
  s.lineTo(-a + r, -h);         s.quadraticCurveTo(-a, -h, -a, -h + r);
  s.lineTo(-a, -a - r);         s.quadraticCurveTo(-a, -a, -a - r, -a);
  s.lineTo(-h + r, -a);         s.quadraticCurveTo(-h, -a, -h, -a + r);
  s.lineTo(-h, a - r);          s.quadraticCurveTo(-h, a, -h + r, a);
  s.lineTo(-a - r, a);          s.quadraticCurveTo(-a, a, -a, a + r);
  s.lineTo(-a, h - r);          s.quadraticCurveTo(-a, h, -a + r, h);
  return s;
}

/**
 * Monta la escena en `container`.
 * @param {HTMLElement} container  #hero-visual
 * @param {{reduced?: boolean}} opts  reduced: solo el «+», sin nodos ni líneas
 */
export function init(container, { reduced = false } = {}) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 8.4);

  // Environment map liviano para los reflejos del metal (sin HDRIs).
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // Iluminación: key cálida + rim fría + ambient bajo.
  const key = new DirectionalLight(0xffe3b3, 1.15);
  key.position.set(4, 5, 6);
  const rim = new DirectionalLight(0x9db8ff, 0.7);
  rim.position.set(-5, -2, -6);
  const amb = new AmbientLight(0x24365c, 0.5);
  scene.add(key, rim, amb);

  // Grupo raíz (rotación idle + parallax por mouse).
  const root = new Group();
  scene.add(root);

  // ---- El «+» central, dorado premium ----
  const plusGeo = new ExtrudeGeometry(crossShape(), {
    depth: 0.62,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.07,
    bevelSegments: 3,
    curveSegments: 10,
  });
  plusGeo.center();
  const plus = new Mesh(
    plusGeo,
    new MeshPhysicalMaterial({
      color: 0xb8902f,
      metalness: 0.85,
      roughness: 0.25,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
    }),
  );
  root.add(plus);

  // ---- 4 nodos orbitando (uno por unidad) + líneas al centro ----
  const orbiters = [];
  if (!reduced) {
    // Radios dentro del encuadre de cámara (frustum ~±2.6 en z=0).
    const UNITS = [
      { color: 0xc9a961, radius: 2.0, speed: 0.22, tilt: 0.45, phase: 0.0 },   // Academy
      { color: 0x3f65a6, radius: 2.3, speed: -0.17, tilt: -0.35, phase: 1.6 }, // Financiera
      { color: 0x24503c, radius: 2.45, speed: 0.14, tilt: 0.2, phase: 3.1 },   // Legal & Contable
      { color: 0x2bb89c, radius: 2.15, speed: -0.2, tilt: -0.55, phase: 4.7 }, // Software
    ];
    const nodeGeo = new SphereGeometry(0.13, 24, 16);
    for (const u of UNITS) {
      const pivot = new Group();
      pivot.rotation.x = u.tilt;
      root.add(pivot);

      const node = new Mesh(
        nodeGeo,
        new MeshStandardMaterial({
          color: u.color,
          emissive: u.color,
          emissiveIntensity: 0.32,
          metalness: 0.4,
          roughness: 0.45,
        }),
      );
      pivot.add(node);

      // Línea fina dorada semitransparente hacia el centro.
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
      const line = new Line(
        lineGeo,
        new LineBasicMaterial({ color: 0xc9a961, transparent: true, opacity: 0.38 }),
      );
      pivot.add(line);

      orbiters.push({ ...u, node, line, angle: u.phase });
    }
  }

  // ---- Interacción: parallax suave con el mouse (máx ±6°) ----
  const MAX_TILT = (6 * Math.PI) / 180;
  const target = { x: 0, y: 0 };
  function onMouse(e) {
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = (e.clientY / innerHeight) * 2 - 1;
    target.y = nx * MAX_TILT;
    target.x = ny * MAX_TILT;
  }
  window.addEventListener('mousemove', onMouse, { passive: true });

  // ---- Render loop: pausado fuera de viewport y sin foco ----
  const clock = new Clock();
  let inView = true;
  let rafId = 0;

  function frame() {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);

    // Rotación idle muy lenta (~60 s por vuelta) + lerp del parallax.
    root.rotation.y += dt * ((Math.PI * 2) / 60);
    root.rotation.x += (target.x - root.rotation.x) * 0.05;
    root.rotation.z += (target.y * 0.4 - root.rotation.z) * 0.05;

    for (const o of orbiters) {
      o.angle += dt * o.speed;
      const x = Math.cos(o.angle) * o.radius;
      const z = Math.sin(o.angle) * o.radius;
      o.node.position.set(x, 0, z);
      const pos = o.line.geometry.attributes.position;
      pos.setXYZ(0, 0, 0, 0);
      pos.setXYZ(1, x, 0, z);
      pos.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  function play() {
    if (!rafId) {
      clock.getDelta(); // descarta el tiempo acumulado en pausa
      frame();
    }
  }
  function pause() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      inView && !document.hidden ? play() : pause();
    },
    { threshold: 0.05 },
  ).observe(container);

  document.addEventListener('visibilitychange', () => {
    document.hidden || !inView ? pause() : play();
  });

  // ---- Resize ----
  function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  onResize();
  window.addEventListener('resize', onResize, { passive: true });

  // ---- Entrada: después del texto del hero (fade + scale 0.9→1) ----
  function enter() {
    gsap.fromTo(
      renderer.domElement,
      { autoAlpha: 0, scale: 0.9 },
      { autoAlpha: 1, scale: 1, duration: 1, ease: 'power2.out' },
    );
  }
  if (window.__heroTextDone) enter();
  else window.addEventListener('hero:textdone', enter, { once: true });

  // ---- Al scrollear: la escena se aleja y desvanece ----
  gsap.to(container, {
    autoAlpha: 0,
    scale: 0.92,
    ease: 'none',
    scrollTrigger: { trigger: '#hero', start: '12% top', end: 'bottom 25%', scrub: true },
  });

  play();
}
