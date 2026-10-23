# EXIO app: guest-mode Home

Interactive prototype of the logged-out (guest) Home screen of the EXIO mobile app, with its 3-scene onboarding carousel ([Figma](https://www.figma.com/design/Nj2U7xqDjoFcdRGGEZLGTX/%F0%9F%A5%91-EXIO-Mobile?node-id=19110-92589)).

Live: https://iamwcdanny-lgtm.github.io/exio-app-guest-mode-home/

```sh
npm install
npm run dev     # local dev server
npm run build   # production build in dist/
```

## How the carousel behaves

- Each scene animates in two clips in `public/images/onboarding/` that share a frame: `home-<scene>-build.mp4` (empty slab → full scene, 1.5s) and `home-<scene>.mp4` (loop, 6s).
- The first time a scene is landed on in a page view, it plays its build and then the loop (7.5s). After that, landing on it plays just the loop (6s). Scenes not built yet wait on their empty slab; built ones wait on their finished frame.
- When the loop finishes, the carousel moves to the next scene; after the last scene it returns to the first.
- Press and hold pauses the current scene (and its progress bar). While dragging, the scene follows the drag: dragging left (next scene coming in) plays it forward, dragging right (previous scene coming in) plays it backward, and resting the finger pauses it. Releasing resumes forward playback from that point. Nothing advances while the finger is down.
- Backward playback uses a reversed copy of each clip (`*-rev.mp4`). All clips are 720×720 H.264 (crf 23, BT.709) with a keyframe every 30 frames, about 3 MB in total. The renders' off-white background is lifted to pure white so no faint square shows on the white page.
- The active indicator is a progress bar that follows the actual playback position (7.5s on a first landing, 6s after).
- A scene only counts as landed once scrolling has stopped and the finger has lifted. Under `prefers-reduced-motion` each scene shows its finished state as a still and nothing auto-advances.

## Deployment

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push to `main` (or manually from the Actions tab). Vite's `base` is `./`, so the build works from the Pages subpath.

One-time setup: in **Settings → Pages**, set **Source** to **GitHub Actions**.

This repo is the source of truth for the carousel. It was first built in [`rwa-portal`](https://github.com/iamwcdanny-lgtm/rwa-portal), whose copy is kept for reference only; `tokens.css` carries the few EXIO design tokens it needs.
