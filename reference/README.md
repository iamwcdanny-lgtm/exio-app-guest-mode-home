# 3D EX.IO logo: reference

`exio-logo-3d.html` is a working three.js (0.160) viewer of the layered 3D logo. Use it as the spec when building the logo into the app; it is not part of the Vite build.

Open it from a static server at the repo root (`npx serve .`, then `/reference/exio-logo-3d.html`); opening the file directly won't load the model.

- Model: `public/models/exio_logo.glb`, three meshes `L0` (front), `L1` (middle), `L2` (back), exported from Blender.
- Layers, front to back: a thin clear-glass copy of `L0` on top; `L0` solid gradient (mint → teal → blue, `RAMPS.mintSolid`); `L1` violet glass at 0.3 depth; `L2` clear glass, or light silver metal in the "Frosted + metal" finish.
- Defaults: "All glass" finish, layer spacing 0.21 (3.5% of the logo width), layers aligned on x and y.
- Interaction: drag to rotate, idle float, pointer tilt, phone tilt via DeviceOrientation (iOS asks after a tap), reduced-motion respected.
- Colours and materials live in `RAMPS`, `TOP_GLASS` and `FINISHES`.
