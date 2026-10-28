import React, { useEffect, useRef } from "react";
import lottie from "lottie-web/build/player/lottie_light";
import home from "./nav-icons/home.json";
import markets from "./nav-icons/markets.json";
import trade from "./nav-icons/trade.json";
import rwa from "./nav-icons/rwa.json";
import assets from "./nav-icons/assets.json";

// Bottom-nav icons (handoff 2026-10-26, Figma 66kn3r5FtdeMTKTvS0hYTg 2953:7272).
// One Lottie per tab, 24x24, 60fps:
//   frame 0             gray Regular (not selected)
//   frame 1 -> selected  activation; colours switch on frame 1, no crossfade
//   selected            black Fill with #00D690 accent, held (no loop)
// Selecting plays 1 -> selected once. Deselecting stops at once and jumps to
// frame 0 (never reversed). First paint and reduced motion show the end state.
const ANIMS = {
  home: { data: home, selected: 24 },
  markets: { data: markets, selected: 24 },
  trade: { data: trade, selected: 42 },
  rwa: { data: rwa, selected: 24 },
  assets: { data: assets, selected: 24 },
};

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const NavIcon = ({ name, active, fallback }) => {
  const box = useRef(null);
  const anim = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    const spec = ANIMS[name];
    if (!spec || !box.current) return undefined;
    const a = lottie.loadAnimation({
      container: box.current,
      renderer: "svg",
      loop: false,
      autoplay: false,
      animationData: spec.data,
      rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
    });
    anim.current = a;
    a.goToAndStop(active ? spec.selected : 0, true);
    box.current.classList.add("is-ready");
    return () => {
      a.destroy();
      anim.current = null;
    };
  }, [name]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const a = anim.current;
    const spec = ANIMS[name];
    if (!a || !spec) return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (!active) {
      a.stop();
      a.goToAndStop(0, true);
    } else if (reducedMotion()) {
      a.goToAndStop(spec.selected, true);
    } else {
      a.goToAndPlay(1, true);
    }
  }, [active, name]);

  return (
    <span className="mhc-nav-icon" ref={box}>
      {/* Static SVG until the animation is mounted (and if it can't be). */}
      <img className="mhc-nav-fallback" src={fallback} width="24" height="24" alt="" />
    </span>
  );
};

export default NavIcon;
