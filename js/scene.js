(function () {
  'use strict';

  if (typeof THREE === 'undefined') return;

  const canvas = document.getElementById('scene');
  if (!canvas) return;

  const isMobile = window.matchMedia('(max-width: 900px)').matches;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: !isMobile,
      alpha: true,
      powerPreference: 'high-performance'
    });
  } catch (e) {
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.4 : 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  if (!isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a1628, 0.028);

  const camera = new THREE.PerspectiveCamera(
    42,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 0, 14);
  camera.lookAt(0, 0, 0);

  const COLORS = {
    gold: 0xc9a961,
    goldHi: 0xe8d098,
    navy: 0x0a1628,
    navyElev: 0x18294a,
    cream: 0xece4d3,
    emerald: 0x2f6e5e
  };

  /* LIGHTS ---------------------------------------------------------- */
  const ambient = new THREE.AmbientLight(0x1a2a44, 0.55);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(COLORS.gold, 1.1);
  key.position.set(6, 8, 6);
  if (!isMobile) {
    key.castShadow = true;
    key.shadow.mapSize.width = 1024;
    key.shadow.mapSize.height = 1024;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 40;
  }
  scene.add(key);

  const fill = new THREE.DirectionalLight(COLORS.emerald, 0.35);
  fill.position.set(-6, -3, 4);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(COLORS.cream, 0.45);
  rim.position.set(0, -4, -8);
  scene.add(rim);

  /* GROUP THAT HOLDS EVERYTHING ------------------------------------- */
  const root = new THREE.Group();
  scene.add(root);

  /* CENTRAL "+" CROSS ----------------------------------------------- */
  const crossGroup = new THREE.Group();
  const crossMat = new THREE.MeshStandardMaterial({
    color: COLORS.gold,
    metalness: 0.55,
    roughness: 0.35,
    emissive: 0x3a2c12,
    emissiveIntensity: 0.35
  });
  const barH = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.85, 0.85), crossMat);
  const barV = new THREE.Mesh(new THREE.BoxGeometry(0.85, 3.4, 0.85), crossMat);
  if (!isMobile) {
    barH.castShadow = barH.receiveShadow = true;
    barV.castShadow = barV.receiveShadow = true;
  }
  crossGroup.add(barH);
  crossGroup.add(barV);

  const edgeMat = new THREE.LineBasicMaterial({
    color: COLORS.goldHi,
    transparent: true,
    opacity: 0.55
  });
  crossGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(barH.geometry), edgeMat));
  crossGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(barV.geometry), edgeMat));

  root.add(crossGroup);

  /* SATELLITES ------------------------------------------------------ */
  const satMat = new THREE.MeshStandardMaterial({
    color: COLORS.navyElev,
    metalness: 0.7,
    roughness: 0.4,
    emissive: 0x0c1830,
    emissiveIntensity: 0.4
  });
  const satEdgeMat = new THREE.LineBasicMaterial({
    color: COLORS.gold,
    transparent: true,
    opacity: 0.7
  });

  const satGeometries = [
    new THREE.BoxGeometry(0.95, 0.95, 0.95),
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.CylinderGeometry(0.55, 0.55, 0.85, 6),
    new THREE.ConeGeometry(0.7, 1.1, 4)
  ];

  const satellites = [];
  for (let i = 0; i < 4; i++) {
    const grp = new THREE.Group();
    const mesh = new THREE.Mesh(satGeometries[i], satMat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(satGeometries[i]), satEdgeMat);
    if (!isMobile) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    grp.add(mesh);
    grp.add(edges);

    const radius = 5.4 + i * 0.18;
    const angle = (i / 4) * Math.PI * 2;
    const tilt = (i - 1.5) * 0.18;
    grp.userData = {
      radius: radius,
      angle: angle,
      speed: 0.12 + i * 0.027,
      tilt: tilt,
      spin: 0.18 + i * 0.05
    };
    grp.position.set(Math.cos(angle) * radius, Math.sin(tilt) * radius, Math.sin(angle) * radius);
    root.add(grp);
    satellites.push(grp);
  }

  /* CONNECTION LINES ------------------------------------------------ */
  const linkMat = new THREE.LineBasicMaterial({
    color: COLORS.gold,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending
  });
  const links = [];
  for (let i = 0; i < 4; i++) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(6);
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const line = new THREE.Line(geo, linkMat);
    root.add(line);
    links.push({ line: line, sat: satellites[i] });
  }

  /* PARTICLE FIELD -------------------------------------------------- */
  const particleCount = isMobile ? 600 : 1300;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(particleCount * 3);
  const pCols = new Float32Array(particleCount * 3);
  const colorA = new THREE.Color(COLORS.cream);
  const colorB = new THREE.Color(COLORS.gold);

  for (let i = 0; i < particleCount; i++) {
    const r = 14 + Math.random() * 30;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    pPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    pPos[i * 3 + 2] = r * Math.cos(phi);
    const c = Math.random() > 0.85 ? colorB : colorA;
    pCols[i * 3] = c.r;
    pCols[i * 3 + 1] = c.g;
    pCols[i * 3 + 2] = c.b;
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCols, 3));
  const pMat = new THREE.PointsMaterial({
    size: isMobile ? 0.05 : 0.045,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  /* SCROLL-DRIVEN CAMERA ------------------------------------------- */
  const camTarget = new THREE.Vector3(0, 0, 14);
  const camLook = new THREE.Vector3(0, 0, 0);
  let scrollProgress = 0;
  let targetScroll = 0;

  function updateCameraTarget(p) {
    const tau = Math.PI * 2;
    const orbit = p * tau * 0.65;
    const radius = 14 - p * 1.5;
    const height = p * 6.5;
    camTarget.set(
      Math.sin(orbit) * radius,
      height,
      Math.cos(orbit) * radius
    );
    camLook.set(0, p * 0.5, 0);
  }

  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    targetScroll = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* RESIZE --------------------------------------------------------- */
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  /* ANIMATION LOOP ------------------------------------------------- */
  const clock = new THREE.Clock();
  function tick() {
    const dt = clock.getDelta();
    const t = clock.getElapsedTime();

    scrollProgress += (targetScroll - scrollProgress) * 0.05;
    updateCameraTarget(scrollProgress);

    camera.position.x += (camTarget.x - camera.position.x) * 0.04;
    camera.position.y += (camTarget.y - camera.position.y) * 0.04;
    camera.position.z += (camTarget.z - camera.position.z) * 0.04;
    camera.lookAt(camLook);

    if (!prefersReduced) {
      crossGroup.rotation.y += dt * 0.18;
      crossGroup.rotation.x = Math.sin(t * 0.3) * 0.08;

      satellites.forEach((s, i) => {
        const d = s.userData;
        d.angle += dt * d.speed;
        s.position.x = Math.cos(d.angle) * d.radius;
        s.position.z = Math.sin(d.angle) * d.radius;
        s.position.y = Math.sin(d.angle * 0.8 + i) * 1.4 + Math.sin(d.tilt) * 0.6;
        s.rotation.x += dt * d.spin;
        s.rotation.y += dt * d.spin * 1.3;
      });

      links.forEach(({ line, sat }) => {
        const arr = line.geometry.attributes.position.array;
        arr[0] = 0; arr[1] = 0; arr[2] = 0;
        arr[3] = sat.position.x;
        arr[4] = sat.position.y;
        arr[5] = sat.position.z;
        line.geometry.attributes.position.needsUpdate = true;
      });

      particles.rotation.y += dt * 0.012;
      particles.rotation.x = Math.sin(t * 0.05) * 0.08;

      root.rotation.y = Math.sin(t * 0.08) * 0.06;
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
