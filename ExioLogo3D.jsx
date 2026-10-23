import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// The layered 3D EX.IO logo, ported from reference/exio-logo-3d.html with its
// default settings fixed: "All glass" finish (but with a light silver metal
// back layer), layer spacing 0.21 (3.5% of the logo width), layers aligned on
// x and y. There are no finish/spacing controls. Dragging on the logo turns
// it (and it stays at that angle; the carousel does not swipe from a drag
// that starts on the logo); it floats gently and tilts with the mouse or, on
// phones, with the device.
// Loaded lazily (React.lazy), so three.js never delays the carousel's first
// paint. Calls onReady once the model has rendered its first frame.

const MODEL_URL = `${import.meta.env.BASE_URL}models/exio_logo.glb`;
const FINISH = "glass"; // "glass" (All glass) or "frost" (Frosted + metal)
// The back layer (L2) uses the light silver metal from "Frosted + metal"
// instead of the finish's own back layer. Set to null to follow FINISH.
const BACK_FINISH = "frost";
const GAP = 0.21;
// Resting pose (radians) that the float and tilt move around: turned
// towards the upper left, so the layers behind show down and to the right.
const REST_YAW = -0.45;
const REST_PITCH = -0.3;
// Framing: the logo spans FIT_W of the canvas width, unless that would make
// it taller than FIT_H of the canvas height (short screens). Leaves room
// for the float and tilt to swing it without clipping.
const FIT_W = 0.86;
const FIT_H = 0.8;
// Motion: idle float (radians / units) and how far mouse and phone tilt turn it.
const FLOAT = { pitch: 0.06, yaw: 0.12, lift: 0.08 };
const MOUSE_TILT = { x: 0.4, y: 0.28 };
const PHONE_TILT = { x: 1.6, y: 1.3, maxX: 0.7, maxY: 0.5 };
// Drag to turn: radians per canvas width dragged (as OrbitControls'
// rotateSpeed 0.8), and how far it may tip up or down.
const DRAG_SPEED = 2 * Math.PI * 0.8;
const DRAG_MAX_PITCH = 1.2;
const HOME = new THREE.Vector3(-0.9, 0.8, 11.5);
const DEG = Math.PI / 180;

// Colour stops (top-left light -> bottom-right deep), same as the renders.
const RAMPS = {
  topGlass: [[0, "#FFFFFF"], [0.5, "#F2FFF9"], [1, "#DDFBEF"]],
  mintSolid: [[0, "#5EF0BE"], [0.3, "#1FDCA0"], [0.6, "#00C2B4"], [0.85, "#1A9FE0"], [1, "#2A78E4"]],
  violet: [[0, "#CF84CB"], [0.3, "#C779D7"], [0.6, "#AD60E0"], [1, "#7036E6"]],
  clear: [[0, "#F4F8FA"], [0.5, "#DCE6EC"], [1, "#B9C8D2"]],
  metal: [[0, "#FFFFFF"], [0.5, "#EEF2F5"], [1, "#CDD6DE"]],
};

const TOP_GLASS = () =>
  new THREE.MeshPhysicalMaterial({
    vertexColors: true, transmission: 1, thickness: 0.4, roughness: 0.04, ior: 1.5,
    clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.3, iridescenceIOR: 1.35, specularIntensity: 1,
  });

// Blurred dusk view of Victoria Harbour that only the metal layer reflects (painted
// on a canvas, no image download): sky, the Peak's ridge, the skyline with IFC, Bank of
// China Tower and ICC, lit windows, and the harbour.
function cityEnvironment(pmrem) {
  const W = 2048, H = 1024, hz = H * 0.6;   // horizon set low so more of the view is sky and skyline
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#1B2F5C'); sky.addColorStop(0.45, '#3F659E'); sky.addColorStop(0.8, '#9C9BB0');
  sky.addColorStop(0.93, '#E8B98A'); sky.addColorStop(1, '#FFD8A0');
  g.fillStyle = sky; g.fillRect(0, 0, W, hz);
  for (const [x, r, a] of [[0.28, 520, 0.85], [0.78, 380, 0.5]]) {   // low sun glows
    const s = g.createRadialGradient(W * x, hz, 0, W * x, hz, r);
    s.addColorStop(0, `rgba(255,236,200,${a})`); s.addColorStop(0.35, `rgba(255,190,120,${a * 0.5})`); s.addColorStop(1, 'rgba(255,170,110,0)');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
  }
  const water = g.createLinearGradient(0, hz, 0, H);
  water.addColorStop(0, '#7A7180'); water.addColorStop(0.2, '#3E4058'); water.addColorStop(1, '#1C2236');
  g.fillStyle = water; g.fillRect(0, hz, W, H - hz);
  g.fillStyle = '#2A3850';                                      // the Peak and the hills behind the skyline
  g.beginPath(); g.moveTo(0, hz);
  for (let x = 0; x <= W; x += 8) {
    const t = x / W * Math.PI * 2;
    g.lineTo(x, hz - H * (0.11 + 0.05 * Math.sin(t * 2 + 0.6) + 0.025 * Math.sin(t * 5 + 1.3) + 0.012 * Math.sin(t * 13)));
  }
  g.lineTo(W, hz); g.closePath(); g.fill();
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let x = 0; x < W;) {                                      // skyline, wraps all the way round
    const w = 14 + rnd() * 40, tall = rnd() < 0.08;
    const h = (tall ? 0.16 + rnd() * 0.1 : 0.03 + rnd() * 0.08) * H;
    g.fillStyle = `rgb(${34 + rnd() * 14},${36 + rnd() * 14},${58 + rnd() * 16})`;
    g.fillRect(x, hz - h, w, h + 2);
    g.fillStyle = 'rgba(255,214,150,0.85)';
    for (let wy = hz - h + 6; wy < hz - 4; wy += 7)
      for (let wx = x + 3; wx < x + w - 3; wx += 6) if (rnd() < 0.35) g.fillRect(wx, wy, 2, 3);
    x += w + rnd() * 6;
  }
  const tower = (x, w, h, col) => { g.fillStyle = col; g.fillRect(x, hz - h, w, h + 2); };
  // IFC 2: tall slim tower with a stepped crown
  tower(W * 0.30, 30, H * 0.30, '#3A4466'); tower(W * 0.30 + 4, 22, H * 0.315, '#3A4466'); tower(W * 0.30 + 8, 14, H * 0.33, '#3A4466');
  // Bank of China Tower: tapering prism with its X bracing
  g.fillStyle = '#323C5C'; g.beginPath(); g.moveTo(W * 0.345, hz); g.lineTo(W * 0.345, hz - H * 0.2); g.lineTo(W * 0.345 + 18, hz - H * 0.26);
  g.lineTo(W * 0.345 + 36, hz - H * 0.22); g.lineTo(W * 0.345 + 36, hz); g.fill();
  g.strokeStyle = 'rgba(220,230,255,0.55)'; g.lineWidth = 2;
  for (let k = 0; k < 4; k++) { const y0 = hz - H * 0.05 * k; g.beginPath(); g.moveTo(W * 0.345, y0); g.lineTo(W * 0.345 + 36, y0 - H * 0.05); g.moveTo(W * 0.345 + 36, y0); g.lineTo(W * 0.345, y0 - H * 0.05); g.stroke(); }
  // ICC across the harbour: the tallest, broad and flat-topped
  tower(W * 0.74, 44, H * 0.36, '#36405F');
  g.fillStyle = 'rgba(160,200,255,0.8)'; g.fillRect(W * 0.74, hz - H * 0.36, 44, 4);
  g.fillStyle = 'rgba(255,214,150,0.85)';
  for (const [x0, w, h] of [[W * 0.30, 30, 0.3], [W * 0.74, 44, 0.36]])
    for (let wy = hz - H * h + 10; wy < hz - 4; wy += 7) for (let wx = x0 + 3; wx < x0 + w - 3; wx += 6) if (rnd() < 0.4) g.fillRect(wx, wy, 2, 3);
  g.globalAlpha = 0.35;                                          // lights smeared on the water
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, y = hz + 4 + rnd() * H * 0.18;
    g.fillStyle = rnd() < 0.7 ? '#FFC98A' : '#9FB6FF'; g.fillRect(x, y, 2 + rnd() * 3, 6 + rnd() * 30);
  }
  g.globalAlpha = 1;
  const b = document.createElement('canvas'); b.width = W; b.height = H;   // soft focus
  const bg = b.getContext('2d'); bg.filter = 'blur(10px)'; bg.drawImage(c, 0, 0);
  const tex = new THREE.CanvasTexture(b);
  tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
  const env = pmrem.fromEquirectangular(tex).texture; tex.dispose();
  return env;
}

const FINISHES = {
  glass: {
    front: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, envMapIntensity: 0.35,
      specularIntensity: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.08 }),
    mid: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, transmission: 0.75, thickness: 0.3, roughness: 0.06, ior: 1.45,
      clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.4 }),
    back: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, transmission: 1, thickness: 0.5, roughness: 0.05, ior: 1.45,
      clearcoat: 1, clearcoatRoughness: 0.03 }),
    ramps: ["mintSolid", "violet", "clear"],
  },
  frost: {
    front: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.3, metalness: 0, envMapIntensity: 0.35,
      specularIntensity: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.08 }),
    mid: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, transmission: 0.5, thickness: 0.3, roughness: 0.28, ior: 1.45,
      clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.35 }),
    back: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 1, roughness: 0.05, envMapIntensity: 1.4,
      clearcoat: 1, clearcoatRoughness: 0.02 }),
    ramps: ["mintSolid", "violet", "metal"],
  },
};

function sampleRamp(stops, t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      return new THREE.Color(c0).lerp(new THREE.Color(c1), (t - p0) / (p1 - p0));
    }
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}

// Bake the ramp into vertex colours across the logo in world space.
function paint(mesh, stops) {
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    const c = sampleRamp(stops, 0.5 + 0.05 * v.x - 0.55 * v.y);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
}

const ExioLogo3D = ({ onReady }) => {
  const canvasRef = useRef(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvas = canvasRef.current;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const cleanups = [];
    const listen = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#ffffff");
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(renderer), 0.03).texture;
    scene.environment = envTexture;
    const cityEnv = cityEnvironment(pmrem);   // Hong Kong, reflected by the metal layer only

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    camera.position.copy(HOME);
    camera.lookAt(0, 0, 0);

    // Soft studio lights on top of the environment.
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-4, 6, 8);
    const rim = new THREE.DirectionalLight(0xe8f0ff, 1.2);
    rim.position.set(6, 2, -5);
    scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0xcfe3dd, 0.6));

    const pivot = new THREE.Group();
    scene.add(pivot);
    const restPoints = [];
    let loaded = false;
    let disposed = false;

    new GLTFLoader().load(MODEL_URL, (gltf) => {
      if (disposed) return;
      const root = gltf.scene;
      pivot.add(root);
      root.updateMatrixWorld(true);
      const meshes = {};
      root.traverse((o) => {
        if (o.isMesh) meshes[o.name.split("_")[0]] = o;
      });
      const layers = ["L0", "L1", "L2"].map((k) => meshes[k]).filter(Boolean);
      layers.forEach((m, i) => {
        const p = m.parent;
        const o = p.worldToLocal(new THREE.Vector3(0, 0, 0));
        m.userData.dir = p.worldToLocal(new THREE.Vector3(0, 0, -1)).sub(o); // "away from viewer" in the layer's own space
        m.userData.base = m.position.clone();
        m.userData.i = i;
      });
      // Line every layer up with the front one, left/right and top/bottom
      // (only the depth step remains).
      {
        const p = layers[0].parent;
        const o = p.worldToLocal(new THREE.Vector3(0, 0, 0));
        const xdir = p.worldToLocal(new THREE.Vector3(1, 0, 0)).sub(o);
        const ydir = p.worldToLocal(new THREE.Vector3(0, 1, 0)).sub(o);
        const w0 = p.localToWorld(layers[0].userData.base.clone());
        layers.forEach((m) => {
          const w = p.localToWorld(m.userData.base.clone());
          m.userData.base.addScaledVector(xdir, w0.x - w.x).addScaledVector(ydir, w0.y - w.y);
        });
      }
      // Glass layer on top: a copy of the front shape, one step towards the viewer.
      const [L0, L1] = layers;
      const topGlass = L0.clone();
      topGlass.geometry = L0.geometry.clone();
      topGlass.name = "TopGlass";
      topGlass.userData = { dir: L0.userData.dir.clone(), base: L0.userData.base.clone().multiplyScalar(2).sub(L1.userData.base), i: -1 };
      L0.parent.add(topGlass);
      // Middle layer and top glass are thinner: squash along the depth axis.
      const d = L1.userData.dir;
      const ax = ["x", "y", "z"].reduce((b, k) => (Math.abs(d[k]) > Math.abs(d[b]) ? k : b), "x");
      L1.scale[ax] = 0.3;
      topGlass.scale[ax] = 0.3;
      [topGlass, ...layers].forEach((m) => {
        m.position.copy(m.userData.base).addScaledVector(m.userData.dir, GAP * m.userData.i);
      });
      // Centre the stack in the view.
      const box = new THREE.Box3().setFromObject(root);
      root.position.sub(box.getCenter(new THREE.Vector3()));
      root.updateMatrixWorld(true);
      pivot.rotation.set(REST_PITCH, REST_YAW, 0);
      // Sample the logo's points at rest; resize() frames the camera on
      // where they land on screen.
      pivot.updateMatrixWorld(true);
      pivot.traverse((o) => {
        if (!o.isMesh) return;
        const pos = o.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 4) restPoints.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
      });
      // Materials and colours for the chosen finish.
      const f = FINISHES[FINISH];
      const back = FINISHES[BACK_FINISH ?? FINISH];
      const mats = [f.front(), f.mid(), back.back()];
      if (mats[2].metalness === 1) mats[2].envMap = cityEnv;
      const ramps = [f.ramps[0], f.ramps[1], back.ramps[2]];
      layers.forEach((m, i) => {
        paint(m, RAMPS[ramps[i]]);
        m.material.dispose?.();
        m.material = mats[i];
      });
      paint(topGlass, RAMPS.topGlass);
      topGlass.material = TOP_GLASS();
      loaded = true;
      resize();
      renderFrame();
      onReadyRef.current?.();
    });

    // Gentle tilt toward the mouse when idle.
    // Angle set by dragging, eased towards so it glides like OrbitControls'
    // damping.
    const turn = new THREE.Vector2();
    const turnTarget = new THREE.Vector2();
    let drag = null;
    listen(canvas, "pointerdown", (e) => {
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("is-dragging");
    });
    listen(canvas, "pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const w = canvas.clientWidth || 1;
      turnTarget.x += ((e.clientX - drag.x) / w) * DRAG_SPEED;
      turnTarget.y = Math.max(-DRAG_MAX_PITCH, Math.min(DRAG_MAX_PITCH, turnTarget.y + ((e.clientY - drag.y) / w) * DRAG_SPEED));
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (reduceMotion && loaded) renderFrame(); // no animation loop then
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      canvas.classList.remove("is-dragging");
    };
    listen(canvas, "pointerup", endDrag);
    listen(canvas, "pointercancel", endDrag);

    const tilt = new THREE.Vector2();
    const tiltTarget = new THREE.Vector2();
    let gyroOn = false;
    listen(window, "pointermove", (e) => {
      if (e.pointerType === "mouse" && !gyroOn) {
        tiltTarget.set((e.clientX / window.innerWidth - 0.5) * MOUSE_TILT.x, (e.clientY / window.innerHeight - 0.5) * MOUSE_TILT.y);
      }
    });

    // Phone tilt: turning the phone turns the logo, so the layers shift
    // against each other like looking through a window.
    let base = null;
    const clamp = (v, a) => Math.max(-a, Math.min(a, v));
    const onOrient = (e) => {
      if (e.beta == null || e.gamma == null) return;
      let x = e.gamma;
      let y = e.beta;
      const ang = (window.screen.orientation && window.screen.orientation.angle) || window.orientation || 0;
      if (ang === 90) [x, y] = [e.beta, -e.gamma];
      else if (ang === -90 || ang === 270) [x, y] = [-e.beta, e.gamma];
      if (!base) base = { x, y };
      base.x += (x - base.x) * 0.004; // slowly re-centre on how the phone is held
      base.y += (y - base.y) * 0.004;
      gyroOn = true;
      tiltTarget.set(
        clamp((x - base.x) * DEG * PHONE_TILT.x, PHONE_TILT.maxX),
        clamp((y - base.y) * DEG * PHONE_TILT.y, PHONE_TILT.maxY)
      );
    };
    const DOE = window.DeviceOrientationEvent;
    if (!reduceMotion && DOE && window.matchMedia?.("(pointer: coarse)").matches) {
      if (typeof DOE.requestPermission === "function") {
        // iOS only asks from inside a user gesture, and there is no button
        // here, so ask on the first tap anywhere on the page.
        const ask = () => {
          DOE.requestPermission()
            .then((r) => r === "granted" && listen(window, "deviceorientation", onOrient))
            .catch(() => {});
        };
        listen(window, "touchend", ask, { once: true });
      } else {
        listen(window, "deviceorientation", onOrient);
      }
    }

    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      frame();
      if (loaded) renderFrame();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    // Frame the logo as it appears on screen at rest: centre its outline
    // (the off-axis camera shifts it) by sliding the camera sideways, then
    // set the field of view so it fills FIT_W of the width, or FIT_H of the
    // height if that is the tighter fit. The camera keeps its angle, so the
    // perspective matches the reference.
    function frame() {
      camera.position.copy(HOME);
      camera.lookAt(0, 0, 0);
      camera.fov = 30;
      camera.updateProjectionMatrix();
      if (!restPoints.length) return;
      camera.updateMatrixWorld(true);
      const lo = new THREE.Vector2(Infinity, Infinity);
      const hi = new THREE.Vector2(-Infinity, -Infinity);
      const v = new THREE.Vector3();
      for (const p of restPoints) {
        v.copy(p).project(camera);
        lo.min(v);
        hi.max(v);
      }
      const halfH = Math.tan((camera.fov * DEG) / 2); // per unit distance
      const d = HOME.length();
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const shift = right
        .multiplyScalar(((lo.x + hi.x) / 2) * halfH * camera.aspect * d)
        .add(up.multiplyScalar(((lo.y + hi.y) / 2) * halfH * d));
      camera.position.add(shift);
      const scale = Math.max((hi.x - lo.x) / (2 * FIT_W), (hi.y - lo.y) / (2 * FIT_H));
      camera.fov = (2 * Math.atan(halfH * scale)) / DEG;
      camera.updateProjectionMatrix();
    }

    const clock = new THREE.Clock();
    function renderFrame() {
      const t = clock.getElapsedTime();
      if (reduceMotion) {
        // Only the user's own drag moves it, without easing.
        pivot.rotation.set(REST_PITCH + turnTarget.y, REST_YAW + turnTarget.x, 0);
      } else {
        tilt.lerp(tiltTarget, 0.05);
        turn.lerp(turnTarget, 0.15);
        pivot.rotation.x = REST_PITCH + turn.y + tilt.y + Math.sin(t * 0.6) * FLOAT.pitch;
        pivot.rotation.y = REST_YAW + turn.x + tilt.x + Math.sin(t * 0.4) * FLOAT.yaw;
        pivot.position.y = Math.sin(t * 0.8) * FLOAT.lift;
      }
      renderer.render(scene, camera);
    }

    // Only animate while the logo is on screen (and never under reduced
    // motion, where the single frame rendered on load is enough).
    const io = new IntersectionObserver(([entry]) => {
      renderer.setAnimationLoop(entry.isIntersecting && !reduceMotion ? () => loaded && renderFrame() : null);
    });
    io.observe(canvas);

    return () => {
      disposed = true;
      io.disconnect();
      ro.disconnect();
      cleanups.forEach((fn) => fn());
      renderer.setAnimationLoop(null);
      scene.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          o.material.dispose();
        }
      });
      envTexture.dispose();
      cityEnv.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="mhc-logo-canvas" aria-hidden="true" />;
};

export default ExioLogo3D;
