import React, { useMemo, useState, useRef, useEffect } from "react";
import "./RwaPage.css";
import PdProduct, { PD_DEFAULT } from "./PdFlow";

// RWA product list (EXIO Mobile RWA file, "after" layout with the Before
// content). Search matches code, full name and issuer; the search field follows
// the prototype's input style switch (traditional / floating = outlined, IFTA =
// filled) but never shows a label. Sort and Filters open bottom sheets; applied
// filters show as removable chips with a result count.
//
// Prototype assumptions: issuer names and the Fund / Note / Depository tab
// categories are filled in for the demo and are not from the product source.

export const LOGO = `${import.meta.env.BASE_URL}images/rwa`;

const P = (symbol, yld, risk, badge, currency, meta, name, issuer, cat, extra) => ({
  symbol, yld, risk, badge, currency: currency.split("/"), meta, name, issuer, cat, extra,
});

export const PRODUCTS = [
  P("CMBMINT", 3.42, 4, "PI", "USD/USDC/USDT", "Tokenised · T+1 · Daily", "CMBI USD Money Market Fund Token", "CMB International", "fund"),
  P("grBENJI", 3.55, 1, "PI", "USD", "Tokenised · T+0 · Daily", "Franklin OnChain U.S. Government Liquidity Fund - AB (Ddis) USD", "Franklin Templeton", "fund"),
  P("XAUm", 60, 3, "PI", "USD/HKD", "Tokenised · Real-time", "Matrixdock Gold", "Matrixdock", "depository"),
  P("ULTRA", 3.48, 4, "PI", "USD", "Tokenised · T+0 · Daily", "Delta Wellington Ultra Short Treasury On-Chain Fund Tokenised Units", "Wellington Management", "fund"),
  P("TPLUS", 8, 4, "PI", "USD/USDC/USDT", "Tokenised · T+1 · Daily", "EPOCH TreasuryPlus SP Class T Shares", "EPOCH", "fund"),
  P("TKUSD", 3.53, 1, "RI", "USD", "Tokenised · T+0 · Daily", "Taikang Kaitai US Dollar Money Market Fund Class T Units", "Taikang Kaitai", "fund", "SFC-authorised"),
  P("TFCD", 12, 5, "PI", "USD", "Tokenised · Monthly Dealing", "Tidefront Global Private Credit Fund 1 Tokenised Class C (Distribution) Shares", "Tidefront", "fund"),
  P("TFCA", 12, 5, "PI", "USD", "Tokenised · Monthly Dealing", "Tidefront Global Private Credit Fund 1 Tokenised Class C (Accumulation) Shares", "Tidefront", "fund"),
  P("TBILL", 3.18, 4, "PI", "USD", "Tokenised · T+1 · Daily", "OpenEden TBILL Fund", "OpenEden", "fund"),
  P("STBL", 3.7, 4, "PI", "USD", "Tokenised · T+1 · Daily", "Short-Term Asset-Backed Liquidity Note Token", "Stable Capital", "note"),
  P("HYBOND", 6.65, 4, "PI", "USDC", "Tokenised · T+4 · Daily", "OpenEden's Tokenized BNY High-yield Bond Fund", "OpenEden", "fund"),
  P("GNIT-LPF2", 5.51, 5, "PI", "USD/HKD", "Tokenised · T+5 · Biweekly", "Global Nexus Income Tokenized LPF", "Global Nexus", "fund"),
  P("EXCB25", 5, 5, "PI", "USD/HKD", "Tokenised · OTC", "EXCB25 Tokenized Convertible Preferred Note", "EX Capital", "note"),
  P("FUIDL", 3.18, 4, "PI", "USD", "Tokenised · T+0 · Daily", "Finloop USD Instant Digital Liquidity", "Finloop", "fund"),
  P("FCCFCT", 116.66, 5, "PI", "USD", "Tokenised · Monthly", "Fullgoal China Circle Fund Class T Shares", "Fullgoal", "fund"),
  ...[
    ["aWMT", 4.56, "Walmart"], ["aTSLA", 5.5, "Tesla"], ["aNVDA", 34.12, "NVIDIA"], ["aMSFT", -0.85, "Microsoft"],
    ["aMETA", -18.45, "Meta"], ["aGOOGL", 44.57, "Alphabet"], ["aAVGO", 3.54, "Broadcom"], ["aASML", 127.6, "ASML"],
    ["aAMZN", 8.96, "Amazon"], ["aAAPL", 32.94, "AAPL"],
  ].map(([s, y, n]) => P(s, y, 4, "PI", "USD", "Tokenised · T+2", `Anchored ${n} Stock`, "Anchored", "depository")),
];

const TABS = [
  { key: "fav", label: "★", aria: "Favourites" },
  { key: "all", label: "All" },
  { key: "fund", label: "Fund" },
  { key: "note", label: "Note" },
  { key: "depository", label: "Depository / Trust Receipt" },
];

export const RISK = ["", "Very low risk", "Low risk", "Medium risk", "High risk", "Very high risk"];
const SORTS = [
  { key: "default", label: "Default" },
  { key: "yieldDesc", label: "Yield: high to low" },
  { key: "yieldAsc", label: "Yield: low to high" },
  { key: "riskAsc", label: "Risk: low to high" },
  { key: "riskDesc", label: "Risk: high to low" },
  { key: "name", label: "Code: A to Z" },
];
const CURRENCIES = ["USD", "HKD", "USDC", "USDT"];
const ELIGIBILITY = [
  { key: "RI", label: "RI · Retail investors" },
  { key: "PI", label: "PI · Professional investors" },
];
const EMPTY_FILTERS = { currency: [], risk: [], badge: [] };

const fmtYield = (y) => `${y}%`;

/* ---------- Icons ---------- */
export const Star = ({ on }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M8.6822 2.66576C9.09739 1.33366 10.9052 1.33366 11.3204 2.66576L12.3368 5.92666C12.5225 6.5224 13.055 6.92574 13.6559 6.92574H16.945C18.2886 6.92574 18.8472 8.71806 17.7602 9.54134L15.0993 11.5567C14.6132 11.9249 14.4098 12.5775 14.5955 13.1732L15.6118 16.4341C16.027 17.7662 14.5645 18.8739 13.4775 18.0507L10.8166 16.0353C10.3304 15.6671 9.67217 15.6671 9.18605 16.0353L6.52512 18.0507C5.43812 18.8739 3.97557 17.7662 4.39076 16.4341L5.40715 13.1732C5.59283 12.5775 5.38942 11.9249 4.90329 11.5567L2.24236 9.54134C1.15536 8.71806 1.71401 6.92574 3.05762 6.92574H6.34671C6.94759 6.92574 7.48013 6.5224 7.66581 5.92666L8.6822 2.66576Z"
      fill={on ? "#00d690" : "none"}
      stroke={on ? "#00d690" : "rgba(0,0,0,.2)"}
      strokeWidth="1.5"
    />
  </svg>
);
export const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7.25" cy="7.25" r="4.75" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10.75 10.75L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
export const CloseIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
const SortIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M6 3.5v13M6 16.5L3 13.5M6 16.5l3-3M14 16.5v-13M14 3.5l-3 3M14 3.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const FilterIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M3 5.5h14M5.5 10h9M8 14.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);
export const Info = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <circle cx="6" cy="6" r="5" stroke="currentColor" />
    <path d="M6 5.5v3" stroke="currentColor" strokeLinecap="round" />
    <circle cx="6" cy="3.75" r=".6" fill="currentColor" />
  </svg>
);
export const Check = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M5 10.5l3.5 3.5L15 7" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ---------- Card ---------- */
const Card = ({ p, fav, onFav, onOpen }) => (
  <article className={`rw-card${onOpen ? " is-tap" : ""}`}>
    {onOpen && <button type="button" className="rw-card-hit" aria-label={`Open ${p.symbol}, ${p.name}`} onClick={onOpen} />}
    <div className="rw-card-top">
      <img className="rw-logo" src={`${LOGO}/${p.symbol.toLowerCase()}.png`} width="32" height="32" alt="" />
      <div className="rw-card-main">
        <div className="rw-row">
          <span className="rw-symbol">{p.symbol}</span>
          <span className={`rw-badge is-${p.badge.toLowerCase()}`}>{p.badge}</span>
          <span className={`rw-yield${p.yld < 0 ? " is-neg" : ""}`}>{fmtYield(p.yld)}</span>
        </div>
        <div className="rw-name">{p.name}</div>
      </div>
    </div>
    <div className="rw-tags">
      <span className={`rw-risk is-r${p.risk}`}>{RISK[p.risk]}</span>
      <span className="rw-chip">{p.currency.join(" / ")}</span>
      {p.extra && <span className="rw-chip">{p.extra}</span>}
    </div>
    <div className="rw-card-foot">
      <div className="rw-meta">{p.meta}</div>
      <button type="button" className="rw-fav" aria-pressed={fav} aria-label={fav ? `Remove ${p.symbol} from favourites` : `Add ${p.symbol} to favourites`} onClick={onFav}>
        <Star on={fav} />
      </button>
    </div>
  </article>
);

/* ---------- Bottom sheet ---------- */
export const Sheet = ({ open, title, onClose, children, footer, tall }) => {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <>
      <div className={`rw-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <div className={`rw-sheet${open ? " is-open" : ""}${tall ? " is-tall" : ""}`} role="dialog" aria-modal="true" aria-label={title} aria-hidden={!open}>
        <div className="rw-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="rw-sheet-close" aria-label="Close" onClick={onClose} tabIndex={open ? 0 : -1}>
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="rw-sheet-body">{children}</div>
        {footer && <div className="rw-sheet-foot">{footer}</div>}
      </div>
    </>
  );
};

const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export default function RwaPage({ labelStyle = "float", cardStyle = "border", pdUser = PD_DEFAULT, setPdUser = () => {}, onImmersive = () => {} }) {
  const [openSym, setOpenSym] = useState(null);
  const [toast, setToast] = useState("");
  const toastT = useRef(0);
  const say = (t) => {
    setToast(t);
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(""), 1800);
  };
  useEffect(() => {
    onImmersive(!!openSym);
    return () => onImmersive(false);
  }, [openSym]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [sort, setSort] = useState("default");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [sheet, setSheet] = useState(null); // "sort" | "filter" | null
  const [favs, setFavs] = useState(() => new Set(["TKUSD", "TBILL"]));
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const q = query.trim().toLowerCase();
  const filterCount = filters.currency.length + filters.risk.length + filters.badge.length;
  const narrowed = q !== "" || filterCount > 0;

  const list = useMemo(() => {
    let r = PRODUCTS.filter((p) => {
      if (tab === "fav" && !favs.has(p.symbol)) return false;
      if (tab !== "fav" && tab !== "all" && p.cat !== tab) return false;
      if (q && ![p.symbol, p.name, p.issuer].some((s) => s.toLowerCase().includes(q))) return false;
      if (filters.currency.length && !p.currency.some((c) => filters.currency.includes(c))) return false;
      if (filters.risk.length && !filters.risk.includes(p.risk)) return false;
      if (filters.badge.length && !filters.badge.includes(p.badge)) return false;
      return true;
    });
    const by = {
      yieldDesc: (a, b) => b.yld - a.yld,
      yieldAsc: (a, b) => a.yld - b.yld,
      riskAsc: (a, b) => a.risk - b.risk,
      riskDesc: (a, b) => b.risk - a.risk,
      name: (a, b) => a.symbol.localeCompare(b.symbol, "en", { sensitivity: "base" }),
    }[sort];
    return by ? [...r].sort(by) : r;
  }, [tab, q, filters, sort, favs]);

  const chips = [
    ...filters.currency.map((v) => ({ k: "currency", v, label: v })),
    ...filters.risk.map((v) => ({ k: "risk", v, label: RISK[v] })),
    ...filters.badge.map((v) => ({ k: "badge", v, label: `${v} only` })),
  ];

  const draftCount = useMemo(
    () =>
      PRODUCTS.filter(
        (p) =>
          (!draft.currency.length || p.currency.some((c) => draft.currency.includes(c))) &&
          (!draft.risk.length || draft.risk.includes(p.risk)) &&
          (!draft.badge.length || draft.badge.includes(p.badge)),
      ).length,
    [draft],
  );

  const openFilters = () => {
    setDraft(filters);
    setSheet("filter");
  };
  const removeChip = (c) => setFilters((f) => ({ ...f, [c.k]: f[c.k].filter((x) => x !== c.v) }));
  const toggleFav = (s) =>
    setFavs((prev) => {
      const n = new Set(prev);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });

  useEffect(() => {
    scrollRef.current && (scrollRef.current.scrollTop = 0);
  }, [tab, sort, filters]);

  const fieldStyle = labelStyle === "ifta" ? "is-filled" : "is-outlined";

  return (
    <div className={`rw-wrap is-card-${cardStyle}`}>
      <div className="rw" ref={scrollRef}>
        <header className="rw-head">
          <div className="rw-tabs" role="tablist" aria-label="Product type">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                aria-label={t.aria}
                className={`rw-tab${tab === t.key ? " is-on" : ""}${t.key === "fav" ? " is-star" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="rw-toolbar">
            <label className={`rw-search ${fieldStyle}${focused ? " is-focused" : ""}`}>
              <SearchIcon />
              <input
                ref={inputRef}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                placeholder="Search code, name or issuer"
                aria-label="Search code, name or issuer"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
              />
              {query && (
                <button
                  type="button"
                  className="rw-search-clear"
                  aria-label="Clear search"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                >
                  <CloseIcon size={12} />
                </button>
              )}
            </label>
            <button type="button" className="rw-icon-btn" aria-label="Sort" onClick={() => setSheet("sort")}>
              <SortIcon />
              {sort !== "default" && <span className="rw-dot" />}
            </button>
            <button type="button" className="rw-icon-btn" aria-label={filterCount ? `Filters, ${filterCount} applied` : "Filters"} onClick={openFilters}>
              <FilterIcon />
              {filterCount > 0 && <span className="rw-dot" />}
            </button>
          </div>

          {chips.length > 0 && (
            <div className="rw-chips">
              {chips.map((c) => (
                <button key={`${c.k}-${c.v}`} type="button" className="rw-fchip" aria-label={`Remove filter ${c.label}`} onClick={() => removeChip(c)}>
                  {c.label}
                  <CloseIcon size={12} />
                </button>
              ))}
              <button type="button" className="rw-clear-all" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear all
              </button>
            </div>
          )}
        </header>

        <div className="rw-list-head">
          <span aria-live="polite">
            {list.length} {narrowed ? (list.length === 1 ? "result" : "results") : list.length === 1 ? "product" : "products"}
          </span>
          <span className="rw-yield-head">
            Reference Annualized Yield <Info />
          </span>
        </div>

        {list.length > 0 ? (
          <div className="rw-list">
            {list.map((p) => (
              <Card key={p.symbol} p={p} fav={favs.has(p.symbol)} onFav={() => toggleFav(p.symbol)} onOpen={() => setOpenSym(p.symbol)} />
            ))}
          </div>
        ) : (
          <div className="rw-empty">
            <div className="rw-empty-icon">
              {tab === "fav" && !narrowed ? <Star /> : <SearchIcon />}
            </div>
            {tab === "fav" && !narrowed ? (
              <>
                <p className="rw-empty-title">No favourites yet</p>
                <p className="rw-empty-text">Tap the star on a product to keep it here.</p>
              </>
            ) : (
              <>
                <p className="rw-empty-title">No products found</p>
                <p className="rw-empty-text">
                  {q ? <>Nothing matches “{query.trim()}”. Try a code, product name or issuer.</> : "Try removing a filter."}
                </p>
                <div className="rw-empty-actions">
                  {q && (
                    <button type="button" className="rw-link" onClick={() => setQuery("")}>
                      Clear search
                    </button>
                  )}
                  {filterCount > 0 && (
                    <button type="button" className="rw-link" onClick={() => setFilters(EMPTY_FILTERS)}>
                      Clear filters
                    </button>
                  )}
                  {tab !== "all" && (
                    <button type="button" className="rw-link" onClick={() => setTab("all")}>
                      Show all products
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <Sheet open={sheet === "sort"} title="Sort by" onClose={() => setSheet(null)}>
        <div className="rw-options" role="radiogroup" aria-label="Sort by">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={sort === s.key}
              className={`rw-option${sort === s.key ? " is-on" : ""}`}
              tabIndex={sheet === "sort" ? 0 : -1}
              onClick={() => {
                setSort(s.key);
                setSheet(null);
              }}
            >
              {s.label}
              {sort === s.key && <Check />}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet
        open={sheet === "filter"}
        title="Filters"
        onClose={() => setSheet(null)}
        footer={
          <>
            <button type="button" className="rw-btn is-secondary" tabIndex={sheet === "filter" ? 0 : -1} onClick={() => setDraft(EMPTY_FILTERS)}>
              Reset
            </button>
            <button
              type="button"
              className="rw-btn is-primary"
              disabled={draftCount === 0}
              tabIndex={sheet === "filter" ? 0 : -1}
              onClick={() => {
                setFilters(draft);
                setSheet(null);
              }}
            >
              {draftCount === 0 ? "No products" : `Show ${draftCount} products`}
            </button>
          </>
        }
      >
        {[
          ["Currency", "currency", CURRENCIES.map((c) => ({ v: c, label: c }))],
          ["Risk level", "risk", [1, 2, 3, 4, 5].map((r) => ({ v: r, label: RISK[r] }))],
          ["Eligibility", "badge", ELIGIBILITY.map((e) => ({ v: e.key, label: e.label }))],
        ].map(([title, key, opts]) => (
          <fieldset key={key} className="rw-group">
            <legend>{title}</legend>
            <div className="rw-pills">
              {opts.map((o) => {
                const on = draft[key].includes(o.v);
                return (
                  <button
                    key={o.v}
                    type="button"
                    aria-pressed={on}
                    tabIndex={sheet === "filter" ? 0 : -1}
                    className={`rw-pill${on ? " is-on" : ""}`}
                    onClick={() => setDraft((d) => ({ ...d, [key]: toggle(d[key], o.v) }))}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </Sheet>
      {openSym && (
        <PdProduct
          p={PRODUCTS.find((x) => x.symbol === openSym)}
          u={pdUser}
          setU={(patch) => setPdUser({ ...pdUser, ...patch })}
          fav={favs.has(openSym)}
          onFav={() => toggleFav(openSym)}
          onClose={() => setOpenSym(null)}
          say={say}
        />
      )}
      <div className={`rx-toast${toast ? " is-shown" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
}