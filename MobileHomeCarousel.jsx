import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, Suspense, lazy } from "react";
import "./tokens.css";
import "./MobileHomeCarousel.css";

// Asset paths follow Vite's base, so the build also works from a subpath
// (e.g. GitHub Pages at /rwa-portal/).
const ASSETS = `${import.meta.env.BASE_URL}images/onboarding`;
const ICONS = `${ASSETS}/icons`;

// Logged-out mobile Home (EXIO Mobile, Figma 19110:92589 / 92487 / 92386):
// an onboarding carousel above fixed Login / Register buttons. It opens on
// the 3D EX.IO logo (LogoScene), followed by three video scenes.
// Each video scene animates in two clips that share a frame: build (empty slab ->
// full scene, 1.5s) and loop (full scene, 6s). A scene builds only the first
// time it is landed on in a page view; after that it just loops. Each clip
// also has a reversed copy (`*-rev.mp4`) so the animation can run backwards
// while the user drags. Clips are encoded with a keyframe every 30 frames so
// jumping into the middle of one is quick.
const SLIDES = [
  {
    key: "logo",
    type: "logo",
    poster: `${ASSETS}/home-logo.webp`,
    alt: "EX.IO logo",
  },
  {
    key: "custody",
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
    key: "trade",
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
    key: "rwa",
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

// Insets match each glyph's position inside its 22px nav slot in the design.
const NAV_TABS = [
  { key: "home", label: "Home", icon: "nav-home.svg", inset: "10.42%" },
  { key: "markets", label: "Markets", icon: "nav-markets.svg", inset: "12.5% 10.42%" },
  { key: "trade", label: "Trade", icon: "nav-trade.svg", inset: "14.49% 10.42% 10.36% 10.42%" },
  { key: "rwa", label: "RWA", icon: "nav-rwa.svg", inset: "0" },
  { key: "assets", label: "Assets", icon: "nav-assets.svg", inset: "14.58% 10.42%" },
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
          <span className="mhc-nav-icon">
            <img src={`${ICONS}/${t.icon}`} alt="" style={{ inset: t.inset }} />
          </span>
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

// three.js is split into its own chunk and only fetched after first paint.
const ExioLogo3D = lazy(() => import("./ExioLogo3D"));
// How long the logo scene holds before the carousel moves on.
const LOGO_SECONDS = 6;

// The 3D logo scene. It has no clips, so it runs a LOGO_SECONDS timeline
// that behaves like a video scene's (same props and contract as
// SceneVideo): it plays when landed on, pauses and runs backwards with
// `direction`, fills the progress bar, and calls onDone at the end. A
// still of the logo shows until the 3D view has rendered.
const LogoScene = ({ mode, direction, releases, onDone, onAtEnd, onBuilt, getFill, poster, label }) => {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onAtEndRef = useRef(onAtEnd);
  onAtEndRef.current = onAtEnd;
  const onBuiltRef = useRef(onBuilt);
  onBuiltRef.current = onBuilt;
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const controller = useRef(null);
  const [mount3D, setMount3D] = useState(false);
  const [ready, setReady] = useState(false);

  // Mount the 3D view only after the first paint.
  useEffect(() => {
    const id = requestAnimationFrame(() => setMount3D(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    controller.current?.setDirection(direction);
  }, [direction, releases]);

  useEffect(() => {
    const setFill = (p) => {
      const fill = getFill();
      if (fill) fill.style.transform = `scaleX(${p})`;
    };
    if (prefersReducedMotion()) {
      setFill(1);
      return undefined;
    }
    if (mode !== "build" && mode !== "loop") {
      setFill(0);
      return undefined;
    }
    onBuiltRef.current(); // nothing to build

    let t = 0;
    let dir = directionRef.current;
    let atEnd = false;
    const setAtEnd = (v) => {
      atEnd = v;
      onAtEndRef.current(v);
    };
    setAtEnd(false);
    let last = performance.now();
    let raf = 0;
    const tick = (now) => {
      // Real elapsed time, so a slow frame rate doesn't stretch the scene;
      // only a long gap (e.g. returning to a background tab) is dropped.
      const gap = (now - last) / 1000;
      const dt = gap > 0.5 ? 0 : gap;
      last = now;
      if (!atEnd && dir !== 0) {
        t = Math.max(0, Math.min(LOGO_SECONDS, t + dt * dir));
        if (t >= LOGO_SECONDS && dir === 1) {
          setAtEnd(true);
          onDoneRef.current();
        }
      }
      setFill(atEnd ? 1 : t / LOGO_SECONDS);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    controller.current = {
      setDirection(d) {
        if (d === 1 && atEnd) {
          onDoneRef.current();
          return;
        }
        if (d === -1 && atEnd) setAtEnd(false);
        dir = d;
      },
    };
    return () => {
      cancelAnimationFrame(raf);
      controller.current = null;
    };
  }, [mode]);

  return (
    <div className={`mhc-logo${ready ? " is-ready" : ""}`} role="img" aria-label={label}>
      <img className="mhc-logo-poster" src={poster} alt="" aria-hidden="true" />
      {mount3D && (
        <Suspense fallback={null}>
          <ExioLogo3D onReady={() => setReady(true)} />
        </Suspense>
      )}
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

  useLayoutEffect(() => {
    const place = () => {
      const tops = slotRefs.current.filter(Boolean).map((el) => el.offsetTop);
      if (tops.length) setIndicatorTop(Math.max(...tops));
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(trackRef.current);
    slotRefs.current.forEach((el) => el && ro.observe(el.previousElementSibling));
    document.fonts?.ready.then(place);
    return () => ro.disconnect();
  }, []);

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
      <div className="mhc-phone">
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
                  key={s.key}
                  className="mhc-slide"
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${SLIDES.length}`}
                  aria-hidden={i !== index}
                >
                  {s.type === "logo" ? (
                    <div className="mhc-logo-area">
                      <LogoScene
                        mode={sceneMode(i)}
                        direction={i === settled ? direction : 1}
                        releases={releases}
                        onDone={() => handleSceneDone(i)}
                        onAtEnd={(v) => (atEnd.current[i] = v)}
                        onBuilt={() => markBuilt(i)}
                        getFill={() => fillRefs.current[i]}
                        poster={s.poster}
                        label={s.alt}
                      />
                    </div>
                  ) : (
                    <>
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
                    </>
                  )}
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
                  key={s.key}
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
            <button type="button" className="mhc-btn mhc-btn-outline" onClick={onLogin}>
              Login
            </button>
            <button type="button" className="mhc-btn mhc-btn-gradient" onClick={onRegister}>
              Register
            </button>
          </div>
        </main>

        <BottomNav active={tab} onChange={setTab} />
      </div>
    </div>
  );
};

export default MobileHomeCarousel;
