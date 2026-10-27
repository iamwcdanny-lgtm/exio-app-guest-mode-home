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

## Sign up / Sign in sheet

The guest Home's Login and Sign up buttons open the matching page ([Figma: Sign up](https://www.figma.com/design/Nj2U7xqDjoFcdRGGEZLGTX/%F0%9F%A5%91-EXIO-Mobile?node-id=19377-102791), [Sign in](https://www.figma.com/design/Nj2U7xqDjoFcdRGGEZLGTX/%F0%9F%A5%91-EXIO-Mobile?node-id=19408-120715)); the link under Next switches between them. Code: `AuthSheet.jsx` / `AuthSheet.css`.

- **iOS** (default): a page sheet. It slides up, Home shrinks into a rounded card behind it on black, and dragging the sheet down dismisses it (release past a quarter of its height, or flick). Inside the form, the drag only takes over once the content is scrolled to the top.
- **Android** (default on Android devices): a full-screen page that slides up over Home, with no drag to dismiss.
- On both, the X, Escape and the browser's back action close it (opening it adds a history entry, so Android's back gesture works). Each opening starts with an empty form.
- **Field labels**, to compare in the same flow: `trad` (label above, current design, 24px between fields), `float` (floating label, 20px) and `ifta` (infield top-aligned, 16px).
- **Field labels**: every field is 56px (IFTA) or 48px (floating, traditional) tall including padding and border. Focus and error strokes are 1.5px.
- Errors show as soon as what's typed is invalid. Email is the exception: its format is only checked when the field is left, and the error clears as soon as it's fixed. Next stays grey until the required fields are valid; pressing it early shows every error and focuses the first. A clear button appears while a filled field is focused; password fields have a show / hide toggle and a live checklist of EX.IO's five password rules.
- After "@" in an email field, common hosts (gmail.com, outlook.com, hotmail.com, icloud.com, yahoo.com, yahoo.com.hk) show as chips under it, narrowed by what follows the "@".
- **Sign up** → email code (6 boxes, Paste, resend countdown; `000000` is treated as wrong) → **Account activated** with a confetti burst, then Verify identity (KYC, not in this prototype) or Do it later, which returns, logged in, to where sign up started.
- **Sign in** → a verification step chosen by the prototype panel's *Sign-in verification* setting: authenticator code, SMS code or email code (passkey is to be designed). "Try another way" opens a bottom sheet with the other methods. Then it returns to the logged-in Home with "Welcome back, <username>".

Pick the variant from the panel beside the phone on a wide screen, or with URL parameters (e.g. `?label=float&platform=android&verify=sms&home=member`). The viewport sets `maximum-scale=1` so iOS Safari doesn't zoom in when a 14px field is focused.

## Logged-in Home and Trade

- **Logged-in Home** (`LoggedInHome.jsx`, [Figma](https://www.figma.com/design/Nj2U7xqDjoFcdRGGEZLGTX/%F0%9F%A5%91-EXIO-Mobile?node-id=19497-35542)): total value with hide toggle, four actions, banner, and Watchlist / Custody / Trading / OTC tabs with the empty custody state. Shown after sign in / sign up, or with *Home: Logged in* in the panel (`?home=member`).
- **Trade → Order book** (`TradePage.jsx`): simulated order book, Buy / Sell, Limit / Market, linked quantity and total, open orders and assets.
- **Trade → OTC** (`OtcPanel.jsx`, [Figma](https://www.figma.com/design/G7I2GRfIh701JkOBkbTkdE/%F0%9F%8D%87-OTC-Chat-Trading?node-id=9231-100184)): From / To currency pickers, pay or receive amount with All and an available-balance check, Get quote, and Processing / Filled quotes.
- Trade fields follow the same input-style switch as the sign-up sheet.
- The bottom nav uses the new 24px icons ([Figma](https://www.figma.com/design/66kn3r5FtdeMTKTvS0hYTg/Xirry-Workspace?node-id=2953-7272)): Regular when not selected, Fill with brand green when selected.

## Deployment

`.github/workflows/pages.yml` builds and deploys to GitHub Pages on every push to `main` (or manually from the Actions tab). Vite's `base` is `./`, so the build works from the Pages subpath.

One-time setup: in **Settings → Pages**, set **Source** to **GitHub Actions**.

This repo is the source of truth for the carousel. It was first built in [`rwa-portal`](https://github.com/iamwcdanny-lgtm/rwa-portal), whose copy is kept for reference only; `tokens.css` carries the few EXIO design tokens it needs.
