// Back (<) animation for pushed pages, 2026-11-03. The page slides back out
// the way it came in, then the real close runs. Pages: .oc-page (OTC record /
// transfer, deposit / withdraw) and .pd-layer (RWA+ detail / order).
// 2026-11-11: the page underneath (the previous page) moves in from the left
// at the same time (.is-revealing), as iOS does.
const OUT_MS = 240;

// The page just under `el` in the same stack: the nearest earlier sibling page.
function prevPage(el) {
  let n = el.previousElementSibling;
  while (n) {
    if (n.matches(".oc-screen") && !n.classList.contains("is-leaving") && n.offsetWidth) return n;
    n = n.previousElementSibling;
  }
  return null;
}

export function revealPrev(el) {
  if (!el || !el.matches(".oc-page")) return;
  const prev = prevPage(el);
  if (!prev) return;
  prev.classList.remove("is-revealing");
  void prev.offsetWidth; // restart the animation
  prev.classList.add("is-revealing");
  // The class stays: taking it off would swap the animation back to the page's
  // slide-in and replay it.
}

// Slide a page out to the right (previous page in from the left), then run done.
export function leavePage(el, done) {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!el || reduce) return done();
  if (el.classList.contains("is-leaving")) return undefined;
  el.classList.remove("is-revealing");
  el.classList.add("is-leaving");
  revealPrev(el);
  setTimeout(done, OUT_MS);
  return undefined;
}

export function slideBack(e, done) {
  return leavePage(e?.currentTarget?.closest?.(".oc-page, .pd-layer"), done);
}
