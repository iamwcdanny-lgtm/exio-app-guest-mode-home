import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import "./tokens.css";
import "./MobileHomeCarousel.css";
import NavIcon from "./NavIcon.jsx";
import GlassNav from "./GlassNav.jsx";
import AuthSheet, { PasskeyPromo, DevicePasskey } from "./AuthSheet";
import TradePage from "./TradePage";
import RwaPage from "./RwaPage";
import RwaExplore from "./RwaExplore";
import LoggedInHome from "./LoggedInHome";

// Asset paths follow Vite's base, so the build also works from a subpath
// (e.g. GitHub Pages at /rwa-portal/).
const ASSETS = `${import.meta.env.BASE_URL}images/onboarding`;
const ICONS = `${ASSETS}/icons`;

// Logged-out mobile Home (EXIO Mobile, Figma 19110:92589 / 92487 / 92386):
// a 3-scene onboarding carousel above fixed Login / Sign up buttons.
// Each scene animates in two clips that share a frame: build (empty slab ->
// full scene, 1.5s) and loop (full scene, 6s). A scene builds only the first
// time it is landed on in a page view; after that it just loops. Each clip
// also has a reversed copy (`*-rev.mp4`) so the animation can run backwards
// while the user drags. Clips are encoded with a keyframe every 30 frames so
// jumping into the middle of one is quick.
const SLIDES = [
  {
    build: `${ASSETS}/home-custody-build.mp4`,
    loop: `${ASSETS}/home-custody.mp4`,
    reverse: {
      build: `${ASSETS}/home-custody-build-rev.mp4`,
      loop: `${ASSETS}/home-custody-rev.mp4`,
    },
    empty: `${ASSETS}/home-custody-empty.webp`,
    full: `${ASSETS}/home-custody.webp`,
    alt: "Glass vault holding Bitcoin and Ether coins",
    title: ["Hong Kong first regulated", "digital assets custodian"],
    subline: "Segregated, institutional-grade custody for your digital assets.",
  },
  {
    build: `${ASSETS}/home-trade-build.mp4`,
    loop: `${ASSETS}/home-trade.mp4`,
    reverse: {
      build: `${ASSETS}/home-trade-build-rev.mp4`,
      loop: `${ASSETS}/home-trade-rev.mp4`,
    },
    empty: `${ASSETS}/home-trade-empty.webp`,
    full: `${ASSETS}/home-trade.webp`,
    alt: "Trading screens with price charts and coins",
    title: ["Your price, your way:", "Tap or Chat"],
    subline: "Trade digital assets in USD and HKD in a few taps, or chat with our traders for OTC deals.",
  },
  {
    build: `${ASSETS}/home-rwa-build.mp4`,
    loop: `${ASSETS}/home-rwa.mp4`,
    reverse: {
      build: `${ASSETS}/home-rwa-build-rev.mp4`,
      loop: `${ASSETS}/home-rwa-rev.mp4`,
    },
    empty: `${ASSETS}/home-rwa-empty.webp`,
    full: `${ASSETS}/home-rwa.webp`,
    alt: "Gold bar, certificates and a house beside crypto coins",
    title: ["RWAs, all in one place:", "Invest beyond crypto"],
    subline: "Diversify with tokenized real-world assets, right alongside your digital assets on EX.IO.",
  },
];

// How long the track must stay still before a scene counts as landed on.
const SETTLE_MS = 120;
// The carousel advances when the landed scene's loop ends, so a scene's
// time is the length of its clips. This is only a fallback in case a clip
// never finishes (e.g. it fails to load), so the carousel can't get stuck.
const FALLBACK_ADVANCE_MS = 12000;
// Clip lengths (s), used for the progress bar until a clip's metadata loads.
const CLIP_SECONDS = { build: 1.5, loop: 6 };

// Navigation icons (Figma: Xirry Workspace, Navigation / Final, 2953:7272):
// 24px, Regular (light grey) when not selected, Fill with brand green when selected.
const NAV_TABS = [
  { key: "home", label: "Home", icon: "nav-home.svg" },
  { key: "markets", label: "Markets", icon: "nav-markets.svg" },
  { key: "trade", label: "Trade", icon: "nav-trade.svg" },
  { key: "rwa", label: "RWA", icon: "nav-rwa.svg" },
  { key: "assets", label: "Assets", icon: "nav-assets.svg" },
];

const Header = () => (
  <div className="mhc-header">
    <button type="button" className="mhc-icon-btn" aria-label="Account">
      <img src={`${ICONS}/avatar.svg`} alt="" />
    </button>
    <div className="mhc-header-actions">
      <button type="button" className="mhc-icon-btn" aria-label="Customer service">
        <img src={`${ICONS}/customer-service.svg`} alt="" />
      </button>
      <button type="button" className="mhc-icon-btn" aria-label="Notifications">
        <img src={`${ICONS}/bell.svg`} alt="" />
      </button>
    </div>
  </div>
);

const BottomNav = ({ active, onChange }) => (
  <nav className="mhc-nav">
    <div className="mhc-nav-tabs">
      {NAV_TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`mhc-nav-tab${active === t.key ? " is-active" : ""}`}
          aria-current={active === t.key ? "page" : undefined}
          onClick={() => onChange(t.key)}
        >
          <NavIcon name={t.key} active={active === t.key} fallback={`${ICONS}/${t.icon.replace(".svg", active === t.key ? "-on.svg" : "-off.svg")}`} />
          {t.label}
        </button>
      ))}
    </div>
  </nav>
);

const VIDEO_PROPS = {
  width: 320,
  height: 320,
  muted: true,
  playsInline: true,
  preload: "auto",
  disablePictureInPicture: true,
  "aria-hidden": true,
};

const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Prototype settings for the Sign up / Sign in sheet, also settable from the
// URL so a link can open straight into one variant:
//   ?label=trad|float|ifta   how form fields are labelled
//   ?platform=ios|android    how the sheet is presented
const LABEL_STYLES = [
  { key: "trad", short: "Traditional" },
  { key: "float", short: "Floating" },
  { key: "ifta", short: "IFTA" },
];
const PLATFORMS = [
  { key: "ios", short: "iOS" },
  { key: "android", short: "Android" },
];
// What the account has set up for 2-step verification: decides which
// verification page follows Sign in. Passkey is to be designed later.
// Which Home shows: the guest one (onboarding carousel) or the logged-in one.
// Bottom nav look: the current bar, or a floating "liquid glass" capsule (iOS 26).
const NAV_STYLES = [
  { key: "classic", short: "Classic" },
  { key: "glass", short: "Liquid glass" },
];
// RWA tab: the current product-first list, or the asset-and-issuer-first concept.
const RWA_VIEWS = [
  { key: "current", short: "Current" },
  { key: "asset", short: "By asset" },
];
const HOME_STATES = [
  { key: "guest", short: "Guest" },
  { key: "member", short: "Logged in" },
];

// The account's security bindings. Email is always bound (it's needed to
// create the account). Sign in asks for the strongest bound method, in this
// order; "Try another way" offers the other bound ones.
export const BINDINGS = [
  { key: "passkey", label: "Passkey", on: "Set", off: "Not set" },
  { key: "totp", label: "Authenticator", on: "Set", off: "Not set" },
  { key: "sms", label: "Mobile", on: "Bound", off: "Not bound" },
  { key: "email", label: "Email", on: "Bound", off: "Bound", fixed: true },
];
const SIGNIN_LABEL = { passkey: "Passkey", totp: "Authenticator code", sms: "SMS code", email: "Email code" };
export const signinMethod = (bound) => ["passkey", "totp", "sms"].find((k) => bound[k]) || "email";
const readBindings = () => {
  const q = new URLSearchParams(window.location.search);
  const list = q.get("bind");
  if (list !== null) {
    const keys = list.split(",");
    return { passkey: keys.includes("passkey"), totp: keys.includes("totp"), sms: keys.includes("sms"), email: true };
  }
  // Older links: ?verify=<method> meant "this method is set up".
  const v = q.get("verify");
  return { passkey: v === "passkey", totp: v === "totp", sms: v === "sms", email: true };
};
const writeBindings = (bound) =>
  writeParam(
    "bind",
    ["passkey", "totp", "sms"].filter((k) => bound[k]).join(",")
  );
const readParam = (name, options, fallback) => {
  const v = new URLSearchParams(window.location.search).get(name);
  return options.some((o) => o.key === v && !o.disabled) ? v : fallback;
};
const writeParam = (name, value) => {
  const url = new URL(window.location.href);
  url.searchParams.set(name, value);
  // Keep the current history state (the sheet's entry, if it's open).
  window.history.replaceState(window.history.state, "", url);
};
// A history step the app makes itself (tidying up after closing) should not
// be treated as the user pressing back.
const silentPop = () => {
  window.__asSilentPopUntil = Date.now() + 800;
};
export const isSilentPop = () => Date.now() < (window.__asSilentPopUntil || 0);

const defaultPlatform = () => (/android/i.test(navigator.userAgent) ? "android" : "ios");

// A segmented switch: one button per option, the chosen one pressed.
const Segmented = ({ label, options, value, onChange }) => (
  <div className="as-proto-group" role="radiogroup" aria-label={label}>
    <span className="as-proto-label">{label}</span>
    <div className="as-seg">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={value === o.key}
          className={`as-seg-btn${value === o.key ? " is-on" : ""}`}
          onClick={() => onChange(o.key)}
        >
          {o.short}
        </button>
      ))}
    </div>
  </div>
);

// Security bindings: one switch per method, with what sign in will ask for.
const Bindings = ({ bound, onToggle }) => (
  <div className="as-proto-group" role="group" aria-label="Security bindings">
    <span className="as-proto-label">Security bindings</span>
    <ul className="as-binds">
      {BINDINGS.map((b) => {
        const on = Boolean(bound[b.key]);
        return (
          <li key={b.key}>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-disabled={b.fixed || undefined}
              className={`as-bind${on ? " is-on" : ""}${b.fixed ? " is-fixed" : ""}`}
              onClick={() => !b.fixed && onToggle(b.key)}
            >
              <span className="as-bind-name">{b.label}</span>
              <span className="as-bind-state">{on ? b.on : b.off}</span>
              <span className="as-bind-switch" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
    <span className="as-bind-note">
      Sign in asks for: <b>{SIGNIN_LABEL[signinMethod(bound)]}</b>
    </span>
  </div>
);

// Sits outside the phone: beside it on wide screens, above it otherwise.
const ProtoControls = ({ home, onHome, rwaView, onRwaView, navStyle, onNavStyle, labelStyle, onLabelStyle, platform, onPlatform, bound, onToggleBinding }) => {
  // On a phone the settings live in a drawer from the right edge, opened by a
  // small tab, so the demo gets the whole screen. Wider screens keep the panel.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className={`as-proto-tab${open ? " is-hidden" : ""}`}
        aria-label="Demo settings"
        aria-expanded={open}
        aria-controls="as-proto"
        onClick={() => setOpen(true)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
          <circle cx="16" cy="6" r="2" />
          <circle cx="10" cy="12" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      </button>
      <div className={`as-proto-scrim${open ? " is-open" : ""}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <aside id="as-proto" className={`as-proto${open ? " is-open" : ""}`} aria-label="Prototype settings">
        <div className="as-proto-head">
          <span>Demo settings</span>
          <button type="button" className="as-proto-close" aria-label="Close demo settings" onClick={() => setOpen(false)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <Segmented label="Home" options={HOME_STATES} value={home} onChange={onHome} />
        <Segmented label="RWA" options={RWA_VIEWS} value={rwaView} onChange={onRwaView} />
        <Segmented label="Bottom nav" options={NAV_STYLES} value={navStyle} onChange={onNavStyle} />
        <Segmented label="Input style" options={LABEL_STYLES} value={labelStyle} onChange={onLabelStyle} />
        <Segmented label="Sheet" options={PLATFORMS} value={platform} onChange={onPlatform} />
        <Bindings bound={bound} onToggle={onToggleBinding} />
        <p className="as-proto-note">Tap Login or Sign up to see it. Switching works with the sheet open too.</p>
      </aside>
    </>
  );
};

// Mock status bar and home indicator for the chosen OS. Shown only in the
// desktop phone frame (CSS hides them on a real phone, which draws its own).
const IosStatus = () => (
  <div className="dc dc-status dc-ios" aria-hidden="true">
    <span>9:41</span>
    <span className="dc-icons">
      <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="0.7" /><rect x="4.5" y="5" width="3" height="6" rx="0.7" /><rect x="9" y="2.5" width="3" height="8.5" rx="0.7" /><rect x="13.5" y="0" width="3" height="11" rx="0.7" /></svg>
      <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 2.3c2 0 3.9.8 5.3 2.1l1.1-1.1A9.1 9.1 0 0 0 7.5.7 9.1 9.1 0 0 0 1.1 3.3l1.1 1.1A7.5 7.5 0 0 1 7.5 2.3Z" /><path d="M7.5 5.4c1.2 0 2.3.4 3.1 1.2l1.1-1.1a6 6 0 0 0-8.4 0l1.1 1.1c.8-.8 1.9-1.2 3.1-1.2Z" /><path d="M9.5 7.7 7.5 9.8l-2-2.1a2.8 2.8 0 0 1 4 0Z" /></svg>
      <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="currentColor" opacity="0.35" /><rect x="2" y="2" width="18" height="8" rx="2" fill="currentColor" /><path d="M23 4v4c.8-.3 1.3-1.1 1.3-2S23.8 4.3 23 4Z" fill="currentColor" opacity="0.4" /></svg>
    </span>
  </div>
);

const AndroidStatus = () => (
  <div className="dc dc-status dc-android" aria-hidden="true">
    <span>9:41</span>
    <span className="dc-icons">
      <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 12 0 3.2A11.6 11.6 0 0 1 8 0c3 0 5.8 1.2 8 3.2L8 12Z" /></svg>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M12 0v12H0L12 0Z" /></svg>
      <svg width="8" height="13" viewBox="0 0 8 13" fill="currentColor"><rect x="2.5" y="0" width="3" height="1.5" rx="0.4" /><rect x="0" y="1.5" width="8" height="11.5" rx="1.2" /></svg>
    </span>
  </div>
);

const DeviceChrome = ({ platform }) => (
  <>
    {platform === "android" ? <AndroidStatus /> : <IosStatus />}
    <div className={`dc dc-home dc-${platform}`} aria-hidden="true" />
  </>
);

// The clips a landed scene plays through, in order.
const TIMELINES = { build: ["build", "loop"], loop: ["loop"] };

// One scene's illustration. `mode` drives it:
//   build -> build, then loop once, then onDone (first landing; calls onBuilt
//            once the build finishes)
//   loop  -> loop once, then onDone (any later landing)
//   empty -> rest on the empty slab (out of view, not built yet)
//   idle  -> rest on the finished scene (out of view, already built)
// `direction` steers a landed scene along that timeline: 1 plays forward,
// -1 plays backward (via the reversed clips), 0 pauses. Backward stops on the
// timeline's first frame; forward to the end calls onDone, and calls it again
// when direction returns to 1 if it is still at the end, so the parent can
// hold off advancing while the user's finger is down. `releases` bumps on
// every release so that re-check happens even if direction was already 1.
// `onAtEnd` reports whether the scene is resting at the end of its timeline.
// `getFill` returns this scene's indicator fill, scaled to the timeline position.
// Clips are stacked; a clip moves to the top only once it has painted a
// frame, so the previous clip's last frame covers any start-up delay.
const SceneVideo = ({ scene, mode, direction, releases, onDone, onAtEnd, onBuilt, getFill, label }) => {
  const buildRef = useRef(null);
  const loopRef = useRef(null);
  const reverseRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onAtEndRef = useRef(onAtEnd);
  onAtEndRef.current = onAtEnd;
  const onBuiltRef = useRef(onBuilt);
  onBuiltRef.current = onBuilt;
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const controller = useRef(null);
  const [shown, setShown] = useState(mode === "build" || mode === "empty" ? "build" : "loop");
  // The clip being swapped in: rendered just beneath `shown` until it has
  // painted a frame. Every other clip is hidden.
  const [incoming, setIncoming] = useState(null);

  useEffect(() => {
    controller.current?.setDirection(direction);
  }, [direction, releases]);

  useEffect(() => {
    const els = { build: buildRef.current, loop: loopRef.current };
    const reverse = reverseRef.current;
    const all = [els.build, els.loop, reverse];
    const cleanups = [];
    const on = (v, type, fn) => {
      v.addEventListener(type, fn, { once: true });
      cleanups.push(() => v.removeEventListener(type, fn));
    };
    const setFill = (p) => {
      const fill = getFill();
      if (fill) fill.style.transform = `scaleX(${p})`;
    };
    const rest = (layer, el) => {
      all.forEach((v) => v.pause());
      el.currentTime = 0;
      setShown(layer);
      setIncoming(null);
    };

    // Reduced motion: show the finished scene as a still.
    if (prefersReducedMotion()) {
      rest("loop", els.loop);
      setFill(1);
      return undefined;
    }
    if (mode !== "build" && mode !== "loop") {
      if (mode === "empty") rest("build", els.build);
      else rest("loop", els.loop);
      setFill(0);
      return undefined;
    }

    const phases = TIMELINES[mode];
    const len = (name) => (Number.isFinite(els[name].duration) ? els[name].duration : CLIP_SECONDS[name]);
    let phase = 0; // index into phases
    let active = null; // element driving the scene right now
    let backward = false; // active is the reversed copy
    let atEnd = false;
    const setAtEnd = (v) => {
      atEnd = v;
      onAtEndRef.current(v);
    };
    setAtEnd(false);
    let token = 0; // invalidates handlers from superseded plays
    let pending = null; // forward time a reversed clip is still seeking to

    // Forward-time position within the current phase.
    const position = () => {
      if (pending !== null) return pending;
      if (!active) return 0;
      const t = backward ? len(phases[phase]) - active.currentTime : active.currentTime;
      return Math.max(0, Math.min(len(phases[phase]), t));
    };

    // Bring a clip to the top only once it has actually painted a frame;
    // until then the previous clip's last frame stays on top and covers it.
    // ("playing" alone can fire before the first frame is drawn, notably on
    // iOS Safari, which showed as a flash between build and loop.)
    const reveal = (el, layer, my) => {
      setIncoming(layer);
      const show = () => {
        if (my !== token) return;
        setShown(layer);
        setIncoming(null);
        all.filter((o) => o !== el).forEach((o) => o.pause());
      };
      if (el.requestVideoFrameCallback) {
        const id = el.requestVideoFrameCallback(show);
        cleanups.push(() => el.cancelVideoFrameCallback?.(id));
        // Safety net in case a covered video never reports a painted frame.
        on(el, "playing", () => {
          const t = setTimeout(show, 250);
          cleanups.push(() => clearTimeout(t));
        });
      } else {
        on(el, "playing", () => requestAnimationFrame(() => requestAnimationFrame(show)));
      }
    };

    // Point the reversed element at this phase's reversed clip ahead of time,
    // so switching direction only needs a seek.
    const loadReverse = (name) => {
      if (reverse.dataset.clip === name) return;
      reverse.dataset.clip = name;
      reverse.src = scene.reverse[name];
    };

    const play = (el, t) => {
      el.muted = true; // iOS only autoplays inline video that is muted as a property
      el.currentTime = t;
      el.play().catch(() => {});
    };

    const playForward = (i, t) => {
      const my = ++token;
      const name = phases[i];
      const el = els[name];
      phase = i;
      backward = false;
      pending = null;
      setAtEnd(false);
      if (active && active !== el) active.pause();
      active = el;
      loadReverse(name);
      reveal(el, name, my);
      on(el, "ended", () => {
        if (my !== token) return;
        if (name === "build") onBuiltRef.current();
        if (i < phases.length - 1) {
          playForward(i + 1, 0);
        } else {
          setAtEnd(true);
          onDoneRef.current();
        }
      });
      play(el, t);
    };

    const playBackward = (i, t) => {
      const my = ++token;
      const name = phases[i];
      phase = i;
      backward = true;
      setAtEnd(false);
      if (active && active !== reverse) active.pause();
      active = reverse;
      pending = t;
      loadReverse(name);
      reveal(reverse, "reverse", my);
      on(reverse, "seeked", () => {
        if (my === token) pending = null;
      });
      on(reverse, "ended", () => {
        if (my !== token) return;
        if (i > 0) {
          playBackward(i - 1, len(phases[i - 1]));
        } else {
          // Back at the very start: rest on its first frame.
          ++token;
          pending = null;
          phase = 0;
          backward = false;
          active = els[phases[0]];
          rest(phases[0], active);
        }
      });
      const seekAndPlay = () => my === token && play(reverse, Math.max(0, len(name) - t));
      if (reverse.readyState >= 1) seekAndPlay();
      else on(reverse, "loadedmetadata", seekAndPlay);
    };

    controller.current = {
      setDirection(d) {
        if (d === 0) {
          active?.pause();
          return;
        }
        if (d === 1) {
          if (atEnd) {
            onDoneRef.current();
            return;
          }
          if (!backward && active && !active.paused) return;
          playForward(phase, position());
        } else {
          if (backward && active && !active.paused) return;
          playBackward(phase, atEnd ? len(phases[phase]) : position());
        }
      },
    };
    cleanups.push(() => {
      controller.current = null;
    });

    let raf = 0;
    const tick = () => {
      const total = phases.reduce((sum, n) => sum + len(n), 0);
      const before = phases.slice(0, phase).reduce((sum, n) => sum + len(n), 0);
      setFill(atEnd ? 1 : Math.min(1, (before + position()) / total));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    cleanups.push(() => cancelAnimationFrame(raf));

    playForward(0, 0);
    if (directionRef.current !== 1) controller.current.setDirection(directionRef.current);
    return () => {
      ++token;
      cleanups.forEach((fn) => fn());
    };
  }, [mode]);

  const layer = (name) =>
    `mhc-scene-layer${shown === name ? " is-shown" : incoming === name ? " is-incoming" : ""}`;
  // A still of what the scene should look like right now, under the clips.
  // A video that has not painted yet (e.g. just starting on iOS Safari) is
  // transparent, so this is what shows through instead of a blank or the
  // wrong clip.
  const showingEmpty = mode === "empty" || (mode === "build" && shown === "build" && incoming !== "loop");
  return (
    <div className="mhc-scene" role="img" aria-label={label}>
      <img className="mhc-scene-still" src={showingEmpty ? scene.empty : scene.full} alt="" aria-hidden="true" />
      <video ref={buildRef} className={layer("build")} src={scene.build} poster={scene.empty} {...VIDEO_PROPS} />
      <video ref={loopRef} className={layer("loop")} src={scene.loop} poster={scene.full} {...VIDEO_PROPS} />
      <video ref={reverseRef} className={layer("reverse")} {...VIDEO_PROPS} />
    </div>
  );
};

const MobileHomeCarousel = ({ onLogin, onRegister }) => {
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState("home");
  const trackRef = useRef(null);
  // The scene the track has come to rest on and how it animates in: build
  // the first time it is landed on, straight to loop after that.
  const [landing, setLanding] = useState({ scene: 0, mode: "build" });
  const settled = landing.scene;
  const settledRef = useRef(0);
  settledRef.current = settled;
  // Scenes that have finished their build in this page view.
  const [built, setBuilt] = useState([]);
  const builtRef = useRef([]);
  // Which way the landed scene's animation runs: forward normally; while a
  // finger (or mouse button) is down it pauses, and follows the drag:
  // dragging left (next scene coming in) plays forward, dragging right
  // (previous scene coming in) plays backward.
  const [direction, setDirection] = useState(1);
  const [releases, setReleases] = useState(0);
  const settleTimer = useRef(null);
  const stillTimer = useRef(null);
  const touching = useRef(false);
  const pressing = useRef(false);
  const lastScrollLeft = useRef(0);
  const fillRefs = useRef([]);
  const atEnd = useRef([]);
  const slotRefs = useRef([]);
  // The indicator is one overlay that stays put while slides move, so it sits
  // at the lowest of the slides' reserved rows (they only differ if a subline
  // wraps to an extra line on a narrow screen).
  const [indicatorTop, setIndicatorTop] = useState(null);

  // Sign up / Sign in sheet: null, "signup" or "signin".
  const [auth, setAuth] = useState(null);
  const authRef = useRef(null);
  authRef.current = auth;
  const [labelStyle, setLabelStyle] = useState(() => readParam("label", LABEL_STYLES, "float"));
  const [platform, setPlatform] = useState(() => readParam("platform", PLATFORMS, defaultPlatform()));
  const [bound, setBound] = useState(readBindings);
  const signinCheck = signinMethod(bound);
  const [home, setHome] = useState(() => readParam("home", HOME_STATES, "guest"));
  const [navStyle, setNavStyle] = useState(() => readParam("nav", NAV_STYLES, "classic"));
  const [rwaView, setRwaView] = useState(() => readParam("rwa", RWA_VIEWS, "current"));
  // A one-off note on the logged-in Home after signing in / up (n remounts it).
  const [welcome, setWelcome] = useState({ text: "", n: 0 });
  // Where the sheet was opened from, to return there when the flow ends.
  const originTab = useRef("home");
  const phoneRef = useRef(null);
  const screenRef = useRef(null);

  // Opening the sheet adds a history entry, so the browser's back action
  // (Android's back gesture / button) closes it. Closing from the sheet
  // itself goes back through that entry, so history stays in step.
  const openAuth = (mode) => {
    if (!authRef.current) {
      originTab.current = tab;
      window.history.pushState({ asSheet: true }, "");
    }
    setAuth(mode);
  };
  // Closing never waits on history: the sheet closes at once, and its history
  // entries (sheet, plus the OTP step if open) are removed quietly afterwards.
  // Some hosts (an embedded preview, for one) ignore history.back(), so the
  // sheet must not depend on it.
  const closeAuth = useCallback(() => {
    setAuth(null);
    const st = window.history.state;
    if (st?.asSheet) {
      silentPop();
      window.history.go(st.otp ? -2 : -1);
    }
  }, []);
  // The URL keeps ?home=member so a reload stays logged in. Closing the sheet
  // steps back through its history entries, which restores the older URL, so
  // write it again once that step lands.
  const keepMember = () => {
    writeParam("home", "member");
    window.addEventListener("popstate", () => setTimeout(() => writeParam("home", "member"), 0), { once: true });
  };
  // End of sign in / sign up: back to where the flow started, logged in.
  const finishAuth = (text, { offerPasskey = false } = {}) => {
    setHome("member");
    setTab(originTab.current);
    closeAuth();
    keepMember();
    if (offerPasskey) {
      // No passkey yet: once the sheet has closed, invite them to set one up.
      // The welcome note waits until that's dealt with.
      pendingWelcome.current = text;
      setTimeout(() => setPromo(true), 520);
    } else setWelcome((w) => ({ text, n: w.n + 1 }));
  };

  // Passkey set-up invitation and its simulated device prompt.
  const [promo, setPromo] = useState(false);
  const [createStage, setCreateStage] = useState(null); // null | "ask" | "scan" | "ok"
  const pendingWelcome = useRef("");
  const createTimer = useRef(null);
  const [userName, setUserName] = useState("");
  useEffect(() => () => clearTimeout(createTimer.current), []);
  const showNote = (text) => setWelcome((w) => ({ text, n: w.n + 1 }));
  const promoLater = useCallback(() => {
    setPromo(false);
    if (pendingWelcome.current) showNote(pendingWelcome.current);
    pendingWelcome.current = "";
  }, []);
  const promoSetUp = () => {
    setPromo(false);
    setCreateStage("ask");
  };
  const createCancel = () => {
    clearTimeout(createTimer.current);
    setCreateStage(null);
    setPromo(true);
  };
  const createContinue = () => {
    setCreateStage("scan");
    createTimer.current = setTimeout(() => {
      setCreateStage("ok");
      createTimer.current = setTimeout(() => {
        setCreateStage(null);
        pendingWelcome.current = "";
        setBound((b) => {
          const next = { ...b, passkey: true };
          writeBindings(next);
          return next;
        });
        showNote("Passkey set up — use it next time you sign in");
      }, 700);
    }, 1400);
  };

  useEffect(() => {
    const onPop = () => {
      if (isSilentPop()) return;
      if (authRef.current && !window.history.state?.asSheet) setAuth(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // A reload while the sheet's entry is current would leave a stray entry.
  useEffect(() => {
    if (window.history.state?.asSheet) window.history.replaceState(null, "");
  }, []);

  // The guest Home (and its carousel) is only on screen on the Home tab when
  // logged out; measure whenever it (re)appears.
  const showGuest = tab !== "trade" && home !== "member";
  useLayoutEffect(() => {
    if (!showGuest || !trackRef.current) return undefined;
    const place = () => {
      const tops = slotRefs.current.filter(Boolean).map((el) => el.offsetTop);
      if (tops.length) setIndicatorTop(Math.max(...tops));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(trackRef.current);
    slotRefs.current.forEach((el) => el?.previousElementSibling && ro.observe(el.previousElementSibling));
    document.fonts?.ready.then(place);
    return () => ro.disconnect();
  }, [showGuest]);

  const goTo = useCallback((i, smooth = true) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: i * track.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // The scroll position is the source of truth, so native swipes, dot taps
  // and arrow keys all update the indicator the same way. The scene only
  // settles once scrolling (including snap) has stopped.
  const handleScroll = () => {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const i = Math.max(0, Math.min(SLIDES.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
    setIndex(i);
    if (touching.current) {
      const dx = track.scrollLeft - lastScrollLeft.current;
      if (Math.abs(dx) >= 2) {
        setDirection(dx > 0 ? 1 : -1);
        lastScrollLeft.current = track.scrollLeft;
      }
      // Finger resting mid-drag: pause again.
      clearTimeout(stillTimer.current);
      stillTimer.current = setTimeout(() => touching.current && setDirection(0), 100);
    }
    scheduleSettle();
  };

  const advance = useCallback(() => {
    goTo((settledRef.current + 1) % SLIDES.length);
  }, [goTo]);

  // A finger resting mid-drag is not a landing, so wait for it to lift.
  const scheduleSettle = () => {
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      const track = trackRef.current;
      if (touching.current || !track || !track.clientWidth) return;
      const i = Math.max(0, Math.min(SLIDES.length - 1, Math.round(track.scrollLeft / track.clientWidth)));
      if (i !== settledRef.current) setLanding({ scene: i, mode: builtRef.current[i] ? "loop" : "build" });
      // Re-landing on the same scene lets it carry on where it was, unless it
      // already finished while the user held it: then move on.
      else if (atEnd.current[i]) advance();
    }, SETTLE_MS);
  };

  const markBuilt = (i) => {
    if (builtRef.current[i]) return;
    builtRef.current = Object.assign([...builtRef.current], { [i]: true });
    setBuilt(builtRef.current);
  };

  // The scene reached the end of its timeline. While the user is pressing,
  // wait: it reports again when released.
  const handleSceneDone = (i) => {
    if (i !== settledRef.current || touching.current || pressing.current) return;
    advance();
  };

  const handleTouchStart = () => {
    touching.current = true;
    lastScrollLeft.current = trackRef.current?.scrollLeft ?? 0;
    setDirection(0);
  };

  const release = () => {
    clearTimeout(stillTimer.current);
    setDirection(1);
    setReleases((n) => n + 1);
  };

  const handleTouchEnd = () => {
    touching.current = false;
    release();
    scheduleSettle();
  };

  // Mouse: press and hold pauses too (the track can't be mouse-dragged).
  const handlePointerDown = (e) => {
    if (e.pointerType !== "mouse") return;
    pressing.current = true;
    setDirection(0);
  };

  const handlePointerUp = (e) => {
    if (e.pointerType !== "mouse" || !pressing.current) return;
    pressing.current = false;
    release();
  };

  useEffect(
    () => () => {
      clearTimeout(settleTimer.current);
      clearTimeout(stillTimer.current);
    },
    []
  );

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const t = setTimeout(() => {
      if (!touching.current && !pressing.current) advance();
    }, FALLBACK_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [landing, releases, advance]);

  const sceneMode = (i) => {
    if (i === settled) return landing.mode;
    return built[i] ? "idle" : "empty";
  };

  // Keep the current slide aligned when the viewport (and so the slide width) changes.
  useEffect(() => {
    const onResize = () => goTo(index, false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [goTo, index]);

  const handleKeyDown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" ? 1 : -1;
    goTo((index + step + SLIDES.length) % SLIDES.length);
    scheduleSettle();
  };

  return (
    <div className="mhc-stage">
      <ProtoControls
        home={home}
        onHome={(v) => {
          setHome(v);
          setWelcome((w) => ({ text: "", n: w.n + 1 }));
          setTab("home");
          writeParam("home", v);
        }}
        rwaView={rwaView}
        onRwaView={(v) => {
          setRwaView(v);
          setTab("rwa");
          writeParam("rwa", v);
        }}
        navStyle={navStyle}
        onNavStyle={(v) => {
          setNavStyle(v);
          writeParam("nav", v);
        }}
        labelStyle={labelStyle}
        onLabelStyle={(v) => {
          setLabelStyle(v);
          writeParam("label", v);
        }}
        platform={platform}
        onPlatform={(v) => {
          setPlatform(v);
          writeParam("platform", v);
        }}
        bound={bound}
        onToggleBinding={(k) => {
          const next = { ...bound, [k]: !bound[k] };
          setBound(next);
          writeBindings(next);
        }}
      />
      <div ref={phoneRef} className={`mhc-phone as-platform-${platform}`}>
        <div ref={screenRef} className={`mhc-screen nav-${navStyle}`}>
          {tab === "trade" ? (
            <TradePage labelStyle={labelStyle} />
          ) : tab === "rwa" ? (
            rwaView === "asset" ? <RwaExplore labelStyle={labelStyle} /> : <RwaPage labelStyle={labelStyle} />
          ) : home === "member" ? (
            <LoggedInHome key={welcome.n} welcome={welcome.text} />
          ) : (
          <>
          <Header />

          <main className="mhc-content">
            <section
              className="mhc-carousel"
              aria-roledescription="carousel"
              aria-label="Welcome to EXIO"
              onKeyDown={handleKeyDown}
            >
              <div
                ref={trackRef}
                className="mhc-track"
                onScroll={handleScroll}
                onTouchStart={handleTouchStart}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                tabIndex={0}
              >
                {SLIDES.map((s, i) => (
                  <div
                    key={s.loop}
                    className="mhc-slide"
                    role="group"
                    aria-roledescription="slide"
                    aria-label={`${i + 1} of ${SLIDES.length}`}
                    aria-hidden={i !== index}
                  >
                    <div className="mhc-illustration">
                      <SceneVideo
                        scene={s}
                        mode={sceneMode(i)}
                        direction={i === settled ? direction : 1}
                        releases={releases}
                        onDone={() => handleSceneDone(i)}
                        onAtEnd={(v) => (atEnd.current[i] = v)}
                        onBuilt={() => markBuilt(i)}
                        getFill={() => fillRefs.current[i]}
                        label={s.alt}
                      />
                    </div>
                    <div className="mhc-copy">
                      <h1 className="mhc-title">
                        {s.title[0]}
                        <br />
                        {s.title[1]}
                      </h1>
                      <p className="mhc-subline">{s.subline}</p>
                    </div>
                    <div className="mhc-indicator-slot" ref={(el) => (slotRefs.current[i] = el)} />
                  </div>
                ))}
              </div>

              <div
                className="mhc-indicator"
                role="tablist"
                aria-label="Choose slide"
                style={indicatorTop === null ? undefined : { top: indicatorTop }}
              >
                {SLIDES.map((s, i) => (
                  <button
                    key={s.loop}
                    type="button"
                    role="tab"
                    aria-selected={i === index}
                    aria-label={`Slide ${i + 1}`}
                    className={`mhc-dot${i === index ? " is-active" : ""}`}
                    onClick={() => {
                      goTo(i);
                      scheduleSettle();
                    }}
                  >
                    <span className="mhc-dot-fill" ref={(el) => (fillRefs.current[i] = el)} />
                  </button>
                ))}
              </div>
            </section>

            <div className="mhc-btn-group">
              <button
                type="button"
                className="mhc-btn mhc-btn-outline"
                aria-haspopup="dialog"
                onClick={() => {
                  openAuth("signin");
                  onLogin?.();
                }}
              >
                Login
              </button>
              <button
                type="button"
                className="mhc-btn mhc-btn-gradient"
                aria-haspopup="dialog"
                onClick={() => {
                  openAuth("signup");
                  onRegister?.();
                }}
              >
                Sign up
              </button>
            </div>
          </main>
          </>
          )}

          {navStyle === "glass" ? (
            <GlassNav
              tabs={NAV_TABS}
              active={tab}
              onChange={setTab}
              iconSrc={(t, on) => `${ICONS}/${t.icon.replace(".svg", on ? "-on.svg" : "-off.svg")}`}
            />
          ) : (
            <BottomNav active={tab} onChange={setTab} />
          )}
        </div>

        <AuthSheet
          mode={auth}
          onModeChange={setAuth}
          onClose={closeAuth}
          onSignedIn={(from, name) => {
            // Only sign in logs the user in. Sign up ends on "Account
            // activated", whose Login button opens Sign in; closing it from
            // there leaves the user a guest.
            if (from !== "signin") return;
            setHome("member");
            keepMember();
            setUserName(name || "");
            finishAuth(name ? `Welcome back, ${name}` : "Welcome back", { offerPasskey: !bound.passkey });
          }}
          labelStyle={labelStyle}
          platform={platform}
          signinCheck={signinCheck}
          bound={bound}
          phoneRef={phoneRef}
          screenRef={screenRef}
        />

        <PasskeyPromo open={promo} onSetUp={promoSetUp} onLater={promoLater} />
        <DevicePasskey
          mode="create"
          platform={platform}
          stage={createStage}
          account={userName}
          onContinue={createContinue}
          onCancel={createCancel}
        />

        <DeviceChrome platform={platform} />
      </div>
    </div>
  );
};

export default MobileHomeCarousel;
