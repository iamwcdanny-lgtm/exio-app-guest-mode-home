// Scroll-edge dividers (app-wide rule, 2026-11-09).
// 1. Any scrolling area: a 1px divider separates it from its top bar and its bottom (CTA) bar.
// 2. The divider shows only while content is hidden on that side: the top one once you
//    scroll down, the bottom one until you reach the end. Content that fits shows neither.
// 3. Same rule for the top bar (app bar, sticky header) and the bottom bar (CTA bar).
//
// One document-level watcher handles every page, so pages don't wire it up themselves.
// Bars are found from the scroller: the top bar is a sticky first child (RWA+ header) or the
// element just before it; the bottom bar is the element just after it. The divider is drawn
// inside the bar (::after / ::before in scrollEdges.css), so nothing shifts when it appears.

const SCROLLERS = [
  ".oc-page-body", // OTC, deposit / withdraw / manage pages
  ".oc-chat",
  ".oc-terms",
  ".acc-body", // account pages
  ".pd-scroll", // RWA subscribe / redeem
  ".pd-doc-body.is-scroll",
  ".pd-quiz",
  ".as-scroll", // sign up / sign in
  ".as-mail-body",
  ".tks-list", // token sheet
  ".rw-sheet-body",
  ".rw", // RWA+ list
].join(",");

// Never bars: home-tab nav, notes/cards that sit next to a list, overlays (toasts, layers).
const NOT_BAR = ".glass-nav, .gn, .mhc-nav, .tks-note, [data-no-edge]";

function usable(el, sc, side) {
  if (!el || el.matches(NOT_BAR)) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || el.offsetHeight === 0 || cs.position === "fixed") return false;
  // An absolute sibling is a bar only if it floats over the scroller's top edge
  // (Manage's blurred header); toasts and layers are absolute too.
  if (cs.position === "absolute") {
    if (side !== "top") return false;
    const a = el.getBoundingClientRect();
    const b = sc.getBoundingClientRect();
    return a.top <= b.top + 1 && a.bottom > b.top;
  }
  return true;
}

// Nearest element before / after the scroller, stepping out of wrappers it starts or
// ends (sign-up: the scroller is the first child of the form, the top bar is outside it).
function near(sc, side) {
  const key = side === "top" ? "previousElementSibling" : "nextElementSibling";
  let n = sc;
  for (let i = 0; i < 3 && n; i++) {
    if (n[key]) return usable(n[key], sc, side) ? n[key] : null;
    n = n.parentElement;
    // never step out of a sheet, layer or dialog: what's outside isn't its bar
    if (!n || n.getAttribute("role") === "dialog" || /^(absolute|fixed)$/.test(getComputedStyle(n).position)) return null;
  }
  return null;
}
function headOf(sc) {
  const first = sc.firstElementChild;
  if (first && getComputedStyle(first).position === "sticky") return first;
  return near(sc, "top");
}
const footOf = (sc) => near(sc, "bottom");

function mark(el, side, on) {
  if (!el) return;
  // only touch classes that change: every class write would wake the MutationObserver again
  const role = side === "top" ? "sc-head" : "sc-foot";
  const flag = side === "top" ? "is-sc-top" : "is-sc-bottom";
  if (!el.classList.contains(role)) {
    el.classList.add("sc-bar", role);
    const cs = getComputedStyle(el);
    if (parseFloat(side === "top" ? cs.borderBottomWidth : cs.borderTopWidth) > 0) el.classList.add("sc-bordered");
  }
  if (el.classList.contains(flag) !== on) el.classList.toggle(flag, on);
}

function update(sc) {
  const oy = getComputedStyle(sc).overflowY;
  if (oy !== "auto" && oy !== "scroll") return; // e.g. the token list laid out inline on the Deposit page
  const max = sc.scrollHeight - sc.clientHeight;
  mark(headOf(sc), "top", sc.scrollTop > 0.5);
  mark(footOf(sc), "bottom", max - sc.scrollTop > 1);
}

let queued = false;
function updateAll() {
  queued = false;
  document.querySelectorAll(SCROLLERS).forEach(update);
}
function queue() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(updateAll);
}

export function installScrollEdges() {
  if (typeof window === "undefined" || window.__scrollEdges) return;
  window.__scrollEdges = true;
  // scroll doesn't bubble: capture it for every scroller
  document.addEventListener(
    "scroll",
    (e) => {
      const sc = e.target;
      if (sc instanceof Element && sc.matches(SCROLLERS)) update(sc);
    },
    true
  );
  // pages open / close, lists grow, tabs switch, sheets resize
  new MutationObserver(queue).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "open"] });
  window.addEventListener("resize", queue);
  document.addEventListener("transitionend", queue, true);
  document.addEventListener("animationend", queue, true);
  queue();
}
