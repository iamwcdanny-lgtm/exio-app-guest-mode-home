import React, { useLayoutEffect, useRef, useState } from "react";
import NavIcon from "./NavIcon.jsx";
import "./GlassNav.css";

// "Liquid glass" bottom nav (iOS 26 style): a floating translucent capsule
// over the page. The selected tab sits on a soft pill (the "lens"). Changing
// tab, the lens turns into a clear glass bubble, grows a little and springs
// across; pressing and dragging along the bar moves the bubble with the finger
// and selects the tab it's released on.
const DRAG_START_PX = 6;

const GlassNav = ({ tabs, active, onChange, iconSrc }) => {
  const barRef = useRef(null);
  const tabRefs = useRef({});
  const drag = useRef(null);
  const settleTimer = useRef(null);
  const [lens, setLens] = useState({ x: 0, w: 0, ready: false });
  const [moving, setMoving] = useState(false);
  const [dragX, setDragX] = useState(null);

  // Lens sits under the active tab (measured, so it follows any width).
  const place = () => {
    const el = tabRefs.current[active];
    if (!el) return;
    setLens({ x: el.offsetLeft, w: el.offsetWidth, ready: true });
  };
  const prevActive = useRef(active);
  useLayoutEffect(() => {
    place();
    if (prevActive.current !== active) {
      prevActive.current = active;
      // Glass bubble while it travels, then back to the resting pill.
      setMoving(true);
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => setMoving(false), 520);
    }
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(place);
    ro.observe(bar);
    return () => ro.disconnect();
  }); // re-bind so place() sees the current tab

  // Drag along the bar.
  const tabAt = (clientX) => {
    let best = null;
    let dist = Infinity;
    for (const t of tabs) {
      const el = tabRefs.current[t.key];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const d = Math.abs(clientX - (r.left + r.width / 2));
      if (d < dist) {
        dist = d;
        best = t.key;
      }
    }
    return best;
  };
  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    drag.current = { startX: e.clientX, id: e.pointerId, dragging: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    if (!d.dragging) {
      if (Math.abs(e.clientX - d.startX) < DRAG_START_PX) return;
      d.dragging = true;
      barRef.current?.setPointerCapture?.(e.pointerId);
      clearTimeout(settleTimer.current);
      setMoving(true);
    }
    const bar = barRef.current.getBoundingClientRect();
    const half = lens.w / 2;
    const x = Math.min(Math.max(e.clientX - bar.left - half, 4), bar.width - lens.w - 4);
    setDragX(x);
  };
  const endDrag = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.dragging) return;
    // Swallow the click that follows a drag.
    const stop = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 0);
    const key = tabAt(e.clientX);
    setDragX(null);
    if (key && key !== active) onChange(key);
    else {
      place();
      settleTimer.current = setTimeout(() => setMoving(false), 420);
    }
  };

  const x = dragX ?? lens.x;
  // While the bubble travels, the tab under its centre is magnified.
  const under = (() => {
    if (!moving || !lens.w) return null;
    const c = x + lens.w / 2;
    let best = null;
    let dist = Infinity;
    for (const t of tabs) {
      const el = tabRefs.current[t.key];
      if (!el) continue;
      const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - c);
      if (d < dist) {
        dist = d;
        best = t.key;
      }
    }
    return dist < lens.w / 2 ? best : null;
  })();
  return (
    <nav className="gn" aria-label="Main">
      <div
        ref={barRef}
        className={`gn-bar${moving ? " is-moving" : ""}${dragX !== null ? " is-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span
          className={`gn-lens${lens.ready ? " is-ready" : ""}`}
          style={{ width: `${lens.w}px`, transform: `translateX(${x}px)` }}
          aria-hidden="true"
        >
          <span className="gn-lens-glass" />
        </span>
        {tabs.map((t) => (
          <button
            key={t.key}
            ref={(el) => {
              tabRefs.current[t.key] = el;
            }}
            type="button"
            className={`gn-tab${active === t.key ? " is-active" : ""}${under === t.key ? " is-magnified" : ""}`}
            aria-current={active === t.key ? "page" : undefined}
            onClick={() => onChange(t.key)}
          >
            <NavIcon name={t.key} active={active === t.key} fallback={iconSrc(t, active === t.key)} />
            <span className="gn-label">{t.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default GlassNav;
