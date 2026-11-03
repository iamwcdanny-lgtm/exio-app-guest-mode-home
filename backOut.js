// Back (<) animation for pushed pages, 2026-11-03. The page slides back out
// the way it came in, then the real close runs. Pages: .oc-page (OTC record /
// transfer) and .pd-layer (RWA+ detail / order).
const OUT_MS = 240;

export function slideBack(e, done) {
  const el = e?.currentTarget?.closest?.(".oc-page, .pd-layer");
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (!el || reduce) return done();
  if (el.classList.contains("is-leaving")) return undefined;
  el.classList.add("is-leaving");
  setTimeout(done, OUT_MS);
  return undefined;
}
