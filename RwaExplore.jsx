import React, { useMemo, useState, useRef, useEffect } from "react";
import { LOGO, PRODUCTS, RISK, Star, SearchIcon, CloseIcon, Info, Sheet } from "./RwaPage";
import "./RwaPage.css";
import "./RwaExplore.css";

// RWA "by asset" concept: people start from the asset they know (gold,
// Treasuries, a stock) and the issuer behind a token, not the token symbol.
// Each asset class leads with its underlying market and chart, cards show the
// numbers that matter for that kind of product (drawdown and AUM for funds,
// premium to spot for gold, price for stocks) and issuers get their own page.
//
// Everything beyond the product list (prices, AUM, drawdowns, issuer facts,
// benchmark levels, market size) is illustrative demo data, generated or
// written for the prototype. It is labelled as such in the UI.

/* ---------- Seeded series ---------- */
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
const rng = (seed) => () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// 1 year of daily points ending at `end`, `total` change over the year.
const series = (key, end, total, vol, n = 366) => {
  const r = rng(hash(key));
  const steps = [];
  for (let i = 1; i < n; i++) {
    const z = Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
    steps.push(vol * z);
  }
  const sum = steps.reduce((a, b) => a + b, 0);
  const target = Math.log(1 + total);
  const fix = (target - sum) / steps.length;
  const out = [0];
  steps.forEach((s, i) => out.push(out[i] + s + fix));
  const last = out[out.length - 1];
  return out.map((c) => end * Math.exp(c - last));
};
// Rates move in levels, not returns.
const rateSeries = (key, end, start, vol, n = 366) => {
  const r = rng(hash(key));
  const out = [];
  let walk = 0;
  for (let i = 0; i < n; i++) {
    walk += (r() - 0.5) * vol;
    out.push(walk);
  }
  const lastW = out[n - 1];
  return out.map((w, i) => start + ((end - start) * i) / (n - 1) + (w - (lastW * i) / (n - 1)));
};
const maxDrawdown = (s) => {
  let peak = s[0];
  let mdd = 0;
  for (const v of s) {
    peak = Math.max(peak, v);
    mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd;
};
const pct = (v, d = 2, sign = true) => {
  const r = Number((v * 100).toFixed(d));
  return `${sign && r > 0 ? "+" : ""}${(r === 0 ? 0 : r).toFixed(d)}%`;
};
const money = (v, d = 2) => `$${v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

/* ---------- Asset classes and their underlying market ---------- */
const CLASSES = [
  {
    key: "cash",
    label: "Cash & Treasuries",
    short: "Cash & Treasuries",
    icon: "$",
    blurb: "Tokenised money market and short-term US Treasury funds. They aim to hold their value and pay a yield close to the T-bill rate.",
    bench: { name: "US 3-month T-bill yield", kind: "rate", end: 3.62, start: 4.31, vol: 0.02 },
    keywords: "treasury treasuries t-bill tbill money market cash usd government liquidity",
    risks: ["Yield falls when the US Fed cuts rates", "Redemption may take T+0 to T+1", "Smart contract and custody risk"],
  },
  {
    key: "gold",
    label: "Gold",
    short: "Gold",
    icon: "Au",
    blurb: "Tokens backed by physical gold held in a vault. The price follows gold spot; check the premium and the latest vault audit.",
    bench: { name: "Gold spot · XAU/USD", kind: "price", end: 4128.4, total: 0.584, vol: 0.011 },
    keywords: "gold xau bullion precious metal commodity",
    risks: ["Gold price can fall sharply", "Token may trade at a premium or discount to spot", "Depends on the vault operator and auditor"],
  },
  {
    key: "credit",
    label: "Private credit",
    short: "Private credit",
    icon: "%",
    blurb: "Loans to companies outside public markets. Higher income, but less liquid: dealing is monthly or less and redemptions can be limited.",
    bench: { name: "Private credit index (direct lending)", kind: "index", end: 1284.6, total: 0.098, vol: 0.0012 },
    keywords: "private credit loans lending income lpf",
    risks: ["Borrowers may default", "Monthly or less frequent dealing; redemptions can be gated", "Valuations are not market prices"],
  },
  {
    key: "bonds",
    label: "Bonds & notes",
    short: "Bonds & notes",
    icon: "B",
    blurb: "Tokenised bond funds and structured notes. Returns depend on interest rates and the credit of the issuer.",
    bench: { name: "US high-yield bond index", kind: "index", end: 2671.2, total: 0.071, vol: 0.0028 },
    keywords: "bond bonds high yield note notes convertible fixed income asset-backed",
    risks: ["Prices fall when rates rise", "Issuer credit and default risk", "Notes may only trade OTC"],
  },
  {
    key: "equity",
    label: "Stocks & equity",
    short: "Stocks",
    icon: "↗",
    blurb: "Tokens that track listed shares or equity funds. They move with the stock; check how the token is backed and any tracking gap.",
    bench: { name: "Nasdaq-100", kind: "index", end: 24318.7, total: 0.243, vol: 0.012 },
    keywords: "stock stocks equity shares nasdaq us tech china",
    risks: ["Share prices can fall sharply", "Token may not carry voting rights", "Tracking gap versus the listed share"],
  },
];
const CLASS = Object.fromEntries(CLASSES.map((c) => [c.key, c]));

/* ---------- Issuers (illustrative facts) ---------- */
const ISSUERS = {
  "Franklin Templeton": { since: 1947, type: "Global asset manager", aum: "US$1.6tn AUM", hq: "San Mateo, US", licence: "SEC-registered adviser" },
  "Wellington Management": { since: 1928, type: "Global asset manager", aum: "US$1.2tn AUM", hq: "Boston, US", licence: "SEC-registered adviser" },
  "CMB International": { since: 1993, type: "Investment bank", aum: "Part of China Merchants Bank", hq: "Hong Kong", licence: "SFC-licensed" },
  "Taikang Kaitai": { since: 2015, type: "Asset manager", aum: "Part of Taikang Insurance", hq: "Hong Kong", licence: "SFC-licensed" },
  OpenEden: { since: 2022, type: "Tokenisation platform", aum: "Fund admin: BNY", hq: "Singapore", licence: "BVI-regulated fund" },
  Matrixdock: { since: 2022, type: "RWA platform", aum: "Vault: LBMA-accredited", hq: "Singapore", licence: "Gold audited quarterly" },
  EPOCH: { since: 2019, type: "Asset manager", aum: "SP of a Cayman SPC", hq: "Hong Kong", licence: "SFC-licensed" },
  Tidefront: { since: 2018, type: "Private credit manager", aum: "Global direct lending", hq: "Hong Kong", licence: "SFC-licensed" },
  "Stable Capital": { since: 2021, type: "Structured products", aum: "Asset-backed notes", hq: "Hong Kong", licence: "Professional investors only" },
  "Global Nexus": { since: 2016, type: "Private markets manager", aum: "HK limited partnership fund", hq: "Hong Kong", licence: "SFC-licensed" },
  "EX Capital": { since: 2020, type: "Structured products", aum: "Convertible notes", hq: "Hong Kong", licence: "Professional investors only" },
  Finloop: { since: 2018, type: "Fintech asset manager", aum: "USD liquidity funds", hq: "Hong Kong", licence: "SFC-licensed" },
  Fullgoal: { since: 1999, type: "Mutual fund manager", aum: "Mainland China fund house", hq: "Shanghai, CN", licence: "CSRC-regulated" },
  Anchored: { since: 2023, type: "Tokenised stock issuer", aum: "Shares held 1:1 by custodian", hq: "Singapore", licence: "Professional investors only" },
};

/* ---------- Product extensions ---------- */
const STOCK = {
  aWMT: ["Walmart", "WMT", 104.32], aTSLA: ["Tesla", "TSLA", 438.1], aNVDA: ["NVIDIA", "NVDA", 186.5], aMSFT: ["Microsoft", "MSFT", 512.7],
  aMETA: ["Meta", "META", 611.9], aGOOGL: ["Alphabet", "GOOGL", 254.3], aAVGO: ["Broadcom", "AVGO", 342.8], aASML: ["ASML", "ASML", 1012.4],
  aAMZN: ["Amazon", "AMZN", 226.4], aAAPL: ["Apple", "AAPL", 262.8],
};
const EXT = {
  CMBMINT: ["cash", "USD money market fund", "US$412m"],
  grBENJI: ["cash", "US government money fund", "US$786m"],
  ULTRA: ["cash", "Ultra-short US Treasuries", "US$94m"],
  TPLUS: ["cash", "US Treasuries plus", "US$58m"],
  TKUSD: ["cash", "USD money market fund", "US$205m"],
  TBILL: ["cash", "Short-term US T-bills", "US$271m"],
  FUIDL: ["cash", "USD instant liquidity fund", "US$63m"],
  STBL: ["bonds", "Short-term asset-backed note", "US$31m"],
  XAUm: ["gold", "Physical gold · LBMA bars", "US$118m"],
  TFCD: ["credit", "Global private credit · Distribution", "US$46m"],
  TFCA: ["credit", "Global private credit · Accumulation", "US$39m"],
  "GNIT-LPF2": ["credit", "Diversified private income", "US$27m"],
  HYBOND: ["bonds", "US high-yield bonds", "US$52m"],
  EXCB25: ["bonds", "Convertible preferred note", "US$15m"],
  FCCFCT: ["equity", "China equity fund", "US$22m"],
};
const VOL = { cash: 0.00004, gold: 0.011, credit: 0.0016, bonds: 0.0032, equity: 0.012 };

const ITEMS = PRODUCTS.map((p) => {
  const st = STOCK[p.symbol];
  const [cls, title, aum] = st ? ["equity", `${st[0]} (${st[1]}) shares`, "US$" + (3 + (hash(p.symbol) % 40)) + "m"] : EXT[p.symbol];
  const isReturn = cls === "equity" || cls === "gold";
  const ret = isReturn ? p.yld / 100 : cls === "cash" ? p.yld / 100 : p.yld / 100 - (hash(p.symbol) % 30) / 1000;
  const vol = st ? VOL.equity * (0.7 + (hash(p.symbol) % 10) / 10) : p.symbol === "FCCFCT" ? 0.028 : VOL[cls];
  const end = st ? st[2] : cls === "gold" ? 4131.2 : cls === "cash" ? 1.0 + (hash(p.symbol) % 9) / 100 : 100 + (hash(p.symbol) % 40);
  const s = series(p.symbol, end, ret, vol);
  return {
    ...p,
    cls,
    title,
    aum,
    ticker: st ? st[1] : null,
    isReturn,
    series: s,
    mdd: maxDrawdown(s),
    ret1y: s[s.length - 1] / s[0] - 1,
    premium: cls === "gold" ? 0.0012 : st ? ((hash(p.symbol) % 7) - 3) / 1000 : null,
    custody: p.symbol === "FCCFCT" ? "Fund custodian" : { cash: "Qualified custodian", gold: "LBMA vault, audited", credit: "Fund administrator", bonds: "Trustee", equity: "Shares held 1:1" }[cls],
  };
});

const BENCH = Object.fromEntries(
  CLASSES.map((c) => [
    c.key,
    c.bench.kind === "rate" ? rateSeries(c.key, c.bench.end, c.bench.start, c.bench.vol) : series(c.key + "-b", c.bench.end, c.bench.total, c.bench.vol),
  ]),
);
const MARKET = series("rwa-market", 36.8, 1.12, 0.006);

const RANGES = [
  { key: "1M", days: 31 },
  { key: "3M", days: 92 },
  { key: "1Y", days: 366 },
];

/* ---------- Chart ---------- */
const Chart = ({ data, compare, height = 140, mini = false, color }) => {
  const w = 343;
  const h = height;
  const norm = (arr) => arr.map((v) => v / arr[0] - 1);
  const a = compare ? norm(data) : data;
  const b = compare ? norm(compare) : null;
  const all = b ? a.concat(b) : a;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.08 || 1e-6;
  const y = (v) => h - 4 - ((v - min + pad) / (max - min + pad * 2)) * (h - 8);
  const x = (i, n) => (i / (n - 1)) * w;
  const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${x(i, arr.length).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const up = data[data.length - 1] >= data[0];
  const c = color || (up ? "#00bf80" : "#f3518b");
  const id = useMemo(() => "g" + Math.random().toString(36).slice(2, 8), []);
  return (
    <svg className={`rx-chart${mini ? " is-mini" : ""}`} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity={mini ? 0.18 : 0.22} />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      {!mini && [0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="rgba(0,0,0,.05)" />)}
      {b && <path d={line(b)} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.25" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={`${line(a)}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} />
      <path d={line(a)} fill="none" stroke={c} strokeWidth={mini ? 1.5 : 2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
};

const benchValue = (c, v) => (c.bench.kind === "rate" ? `${v.toFixed(2)}%` : c.bench.kind === "price" ? money(v) : v.toLocaleString("en-US", { maximumFractionDigits: 1 }));
const benchChange = (c, arr) =>
  c.bench.kind === "rate" ? `${arr[arr.length - 1] - arr[0] >= 0 ? "+" : ""}${Math.round((arr[arr.length - 1] - arr[0]) * 100)} bp` : pct(arr[arr.length - 1] / arr[0] - 1);
const isUp = (arr) => arr[arr.length - 1] >= arr[0];

const Range = ({ value, onChange }) => (
  <div className="rx-range" role="tablist" aria-label="Chart range">
    {RANGES.map((r) => (
      <button key={r.key} type="button" role="tab" aria-selected={value === r.key} className={value === r.key ? "is-on" : ""} onClick={() => onChange(r.key)}>
        {r.key}
      </button>
    ))}
  </div>
);
const slice = (arr, range) => arr.slice(-RANGES.find((r) => r.key === range).days);

const Demo = () => <span className="rx-demo">Illustrative data</span>;

/* ---------- Key numbers per asset class ---------- */
const metrics = (p) => {
  const last = p.series[p.series.length - 1];
  switch (p.cls) {
    case "cash":
      return [["7-day yield", `${p.yld}%`], ["Max drawdown", pct(p.mdd)], ["Fund size", p.aum]];
    case "gold":
      return [["Price", money(last)], ["Premium to spot", pct(p.premium)], ["1Y", pct(p.ret1y), p.ret1y]];
    case "credit":
      return [["Target yield", `${p.yld}%`], ["Max drawdown", pct(p.mdd)], ["Dealing", p.meta.replace("Tokenised · ", "").replace(" Dealing", "")]];
    case "bonds":
      return [["Yield", `${p.yld}%`], ["Max drawdown", pct(p.mdd)], ["Fund size", p.aum]];
    default:
      return p.ticker
        ? [["Price", money(last)], ["1Y", pct(p.ret1y), p.ret1y], ["Max drawdown", pct(p.mdd)]]
        : [["NAV", money(last)], ["1Y", pct(p.ret1y), p.ret1y], ["Max drawdown", pct(p.mdd)]];
  }
};

const IssuerMark = ({ name, size = 32 }) => {
  const p = ITEMS.find((i) => i.issuer === name);
  return <img className="rx-issuer-mark" src={`${LOGO}/${p.symbol.toLowerCase()}.png`} width={size} height={size} alt="" />;
};

/* ---------- Product card ---------- */
const ProductCard = ({ p, fav, onFav, onOpen }) => (
  <article className="rx-card">
    <button type="button" className="rx-card-hit" onClick={onOpen} aria-label={`${p.title} by ${p.issuer}, ${p.symbol}`} />
    <div className="rx-card-top">
      <img className="rw-logo" src={`${LOGO}/${p.symbol.toLowerCase()}.png`} width="32" height="32" alt="" />
      <div className="rw-card-main">
        <div className="rx-title">{p.title}</div>
        <div className="rx-sub">
          <span className="rx-issuer">{p.issuer}</span>
          <span className="rx-sep">·</span>
          <span>{p.symbol}</span>
          <span className={`rw-badge is-${p.badge.toLowerCase()}`}>{p.badge}</span>
        </div>
      </div>
      <button type="button" className="rw-fav" aria-pressed={fav} aria-label={fav ? `Remove ${p.symbol} from favourites` : `Add ${p.symbol} to favourites`} onClick={onFav}>
        <Star on={fav} />
      </button>
    </div>
    <div className="rx-metrics">
      {metrics(p).map(([k, v, signed]) => (
        <div key={k} className="rx-metric">
          <span className="rx-mk">{k}</span>
          <span className={`rx-mv${signed != null ? (signed >= 0 ? " is-up" : " is-down") : ""}`}>{v}</span>
        </div>
      ))}
      <div className="rx-spark">
        <Chart data={slice(p.series, "3M")} height={36} mini />
      </div>
    </div>
    <div className="rw-tags">
      <span className={`rw-risk is-r${p.risk}`}>{RISK[p.risk]}</span>
      {p.extra && <span className="rw-chip is-trust">✓ {p.extra}</span>}
      <span className="rw-chip">{p.custody}</span>
    </div>
  </article>
);

/* ---------- Product detail ---------- */
const ProductDetail = ({ p, onIssuer, fav, onFav, say }) => {
  const [range, setRange] = useState("1Y");
  if (!p) return null;
  const c = CLASS[p.cls];
  const data = slice(p.series, range);
  const bench = c.bench.kind === "rate" ? null : slice(BENCH[p.cls], range);
  const iss = ISSUERS[p.issuer];
  const chg = data[data.length - 1] / data[0] - 1;
  const facts = [
    ["Underlying", p.title],
    ["Issuer", p.issuer],
    ["Custody", p.custody],
    ["Dealing", p.meta.replace("Tokenised · ", "")],
    ["Currency", p.currency.join(" / ")],
    ["Eligibility", p.badge === "RI" ? "Retail and professional investors" : "Professional investors only"],
  ];
  return (
    <div className="rx-detail">
      <div className="rx-d-head">
        <img className="rw-logo" src={`${LOGO}/${p.symbol.toLowerCase()}.png`} width="40" height="40" alt="" />
        <div className="rw-card-main">
          <div className="rx-d-title">{p.title}</div>
          <div className="rx-sub">
            <button type="button" className="rx-issuer-link" onClick={() => onIssuer(p.issuer)}>
              {p.issuer}
            </button>
            <span className="rx-sep">·</span>
            <span>{p.symbol}</span>
            <span className={`rw-badge is-${p.badge.toLowerCase()}`}>{p.badge}</span>
          </div>
        </div>
        <button type="button" className="rw-fav" aria-pressed={fav} aria-label="Favourite" onClick={onFav}>
          <Star on={fav} />
        </button>
      </div>

      <section className="rx-d-chart">
        <div className="rx-d-price">
          <span className="rx-d-big">{p.cls === "cash" ? `${p.yld}%` : money(data[data.length - 1])}</span>
          <span className={`rx-d-chg ${chg >= 0 ? "is-up" : "is-down"}`}>
            {p.cls === "cash" ? "7-day yield" : `${pct(chg)} · ${range}`}
          </span>
        </div>
        <Chart data={data} compare={bench} height={150} />
        <div className="rx-legend">
          <span>
            <i className="is-a" /> {p.symbol}
          </span>
          {bench && (
            <span>
              <i className="is-b" /> {c.bench.name}
            </span>
          )}
          <Demo />
        </div>
        <Range value={range} onChange={setRange} />
      </section>

      <section className="rx-d-sec">
        <h3>Risk and return</h3>
        <div className="rx-grid">
          {[
            [p.isReturn ? "1Y return" : p.cls === "cash" ? "7-day yield" : "Yield", p.isReturn ? pct(p.ret1y) : `${p.yld}%`],
            ["Max drawdown (1Y)", pct(p.mdd)],
            ["Fund size", p.aum],
            [p.premium != null ? "Premium to underlying" : "Risk level", p.premium != null ? pct(p.premium) : RISK[p.risk]],
          ].map(([k, v]) => (
            <div key={k} className="rx-cell">
              <span className="rx-mk">{k}</span>
              <span className="rx-mv">{v}</span>
            </div>
          ))}
        </div>
        <ul className="rx-risks">
          {c.risks.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>

      <section className="rx-d-sec">
        <h3>Who issues it</h3>
        <button type="button" className="rx-issuer-card" onClick={() => onIssuer(p.issuer)}>
          <IssuerMark name={p.issuer} size={40} />
          <span className="rx-ic-text">
            <b>{p.issuer}</b>
            <span>
              {iss.type} · since {iss.since}
            </span>
            <span>
              {iss.aum} · {iss.licence}
            </span>
          </span>
          <span className="rx-chev" aria-hidden="true">›</span>
        </button>
      </section>

      <section className="rx-d-sec">
        <h3>Product facts</h3>
        <dl className="rx-facts">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="rx-d-cta">
        <button type="button" className="rw-btn is-primary" onClick={() => say("Trading isn’t in this prototype")}>
          Trade {p.symbol}
        </button>
      </div>
    </div>
  );
};

/* ---------- Issuer page ---------- */
const IssuerDetail = ({ name, onOpen }) => {
  if (!name) return null;
  const iss = ISSUERS[name];
  const items = ITEMS.filter((i) => i.issuer === name);
  return (
    <div className="rx-detail">
      <div className="rx-d-head">
        <IssuerMark name={name} size={48} />
        <div className="rw-card-main">
          <div className="rx-d-title">{name}</div>
          <div className="rx-sub">{iss.type}</div>
        </div>
      </div>
      <div className="rx-grid">
        {[
          ["Founded", iss.since],
          ["Based in", iss.hq],
          ["Scale", iss.aum],
          ["Regulation", iss.licence],
        ].map(([k, v]) => (
          <div key={k} className="rx-cell">
            <span className="rx-mk">{k}</span>
            <span className="rx-mv is-sm">{v}</span>
          </div>
        ))}
      </div>
      <p className="rx-note">
        Issuer facts are illustrative for the prototype. In the product they would come from verified sources: licence registers, audited reports and
        on-chain data.
      </p>
      <section className="rx-d-sec">
        <h3>
          {items.length} {items.length === 1 ? "product" : "products"} on EXIO
        </h3>
        <div className="rx-mini-list">
          {items.map((p) => (
            <button key={p.symbol} type="button" className="rx-mini" onClick={() => onOpen(p.symbol)}>
              <img className="rw-logo" src={`${LOGO}/${p.symbol.toLowerCase()}.png`} width="28" height="28" alt="" />
              <span className="rx-mini-text">
                <b>{p.title}</b>
                <span>
                  {p.symbol} · {CLASS[p.cls].label}
                </span>
              </span>
              <span className="rx-mini-val">{metrics(p)[0][1]}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

/* ---------- Page ---------- */
export default function RwaExplore({ labelStyle = "float" }) {
  const [cls, setCls] = useState("all");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [range, setRange] = useState("1Y");
  const [favs, setFavs] = useState(() => new Set(["TKUSD", "TBILL"]));
  const [open, setOpen] = useState(null); // product symbol
  const [issuer, setIssuer] = useState(null);
  const [toast, setToast] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const say = (t) => {
    setToast(t);
    clearTimeout(say.t);
    say.t = setTimeout(() => setToast(""), 1800);
  };
  const toggleFav = (s) =>
    setFavs((prev) => {
      const n = new Set(prev);
      n.has(s) ? n.delete(s) : n.add(s);
      return n;
    });
  useEffect(() => {
    scrollRef.current && (scrollRef.current.scrollTop = 0);
  }, [cls]);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      q
        ? ITEMS.filter((p) =>
            [p.symbol, p.name, p.issuer, p.title, p.ticker || "", CLASS[p.cls].label, CLASS[p.cls].keywords].some((s) => s.toLowerCase().includes(q)),
          )
        : [],
    [q],
  );
  const inClass = (k) => ITEMS.filter((p) => p.cls === k);
  const issuers = useMemo(() => {
    const m = new Map();
    ITEMS.forEach((p) => m.set(p.issuer, (m.get(p.issuer) || 0) + 1));
    return [...m.entries()].sort((a, b) => ISSUERS[a[0]].since - ISSUERS[b[0]].since);
  }, []);

  const card = (p) => <ProductCard key={p.symbol} p={p} fav={favs.has(p.symbol)} onFav={() => toggleFav(p.symbol)} onOpen={() => setOpen(p.symbol)} />;
  const fieldStyle = labelStyle === "ifta" ? "is-filled" : "is-outlined";
  const c = CLASS[cls];
  const openP = ITEMS.find((p) => p.symbol === open);

  return (
    <div className="rw-wrap rx">
      <div className="rw" ref={scrollRef}>
        <header className="rw-head rx-head">
          <div className="rx-top">
            <h1>RWA</h1>
          </div>
          <div className="rw-toolbar rx-toolbar">
            <label className={`rw-search ${fieldStyle}${focused ? " is-focused" : ""}`}>
              <SearchIcon />
              <input
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                placeholder="Search gold, Treasuries, an issuer…"
                aria-label="Search by asset, issuer or code"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
              />
              {query && (
                <button type="button" className="rw-search-clear" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()} onClick={() => setQuery("")}>
                  <CloseIcon size={12} />
                </button>
              )}
            </label>
          </div>
          {!q && (
            <div className="rx-classes" role="tablist" aria-label="Asset">
              {[{ key: "all", short: "Overview" }, ...CLASSES, { key: "fav", short: "★ Watchlist" }].map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={cls === t.key} className={`rx-class${cls === t.key ? " is-on" : ""}`} onClick={() => setCls(t.key)}>
                  {t.short}
                </button>
              ))}
            </div>
          )}
        </header>

        {q ? (
          <div className="rx-body">
            <div className="rw-list-head">
              <span aria-live="polite">
                {results.length} {results.length === 1 ? "result" : "results"}
              </span>
            </div>
            {results.length ? (
              <div className="rw-list">{results.map(card)}</div>
            ) : (
              <div className="rw-empty">
                <div className="rw-empty-icon">
                  <SearchIcon />
                </div>
                <p className="rw-empty-title">No products found</p>
                <p className="rw-empty-text">Try an asset like “gold” or “treasury”, an issuer, or a code.</p>
              </div>
            )}
          </div>
        ) : cls === "all" ? (
          <div className="rx-body">
            <section className="rx-hero">
              <div className="rx-hero-label">
                Tokenised real-world assets, global market <Demo />
              </div>
              <div className="rx-d-price">
                <span className="rx-d-big">US${slice(MARKET, range).at(-1).toFixed(1)}bn</span>
                <span className="rx-d-chg is-up">
                  {pct(slice(MARKET, range).at(-1) / slice(MARKET, range)[0] - 1, 1)} · {range}
                </span>
              </div>
              <Chart data={slice(MARKET, range)} height={110} color="#00d690" />
              <Range value={range} onChange={setRange} />
            </section>

            <section className="rx-sec">
              <h2>Browse by asset</h2>
              <div className="rx-assets">
                {CLASSES.map((k) => {
                  const b = slice(BENCH[k.key], range);
                  const n = inClass(k.key).length;
                  return (
                    <button key={k.key} type="button" className="rx-asset" onClick={() => setCls(k.key)}>
                      <span className={`rx-asset-icon is-${k.key}`}>{k.icon}</span>
                      <span className="rx-asset-text">
                        <b>{k.label}</b>
                        <span>
                          {n} {n === 1 ? "product" : "products"} · {k.bench.name}
                        </span>
                      </span>
                      <span className="rx-asset-chart">
                        <Chart data={b} height={28} mini />
                      </span>
                      <span className={`rx-asset-chg ${isUp(b) ? "is-up" : "is-down"}`}>{benchChange(k, b)}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rx-sec">
              <h2>Issuers on EXIO</h2>
              <div className="rx-issuers">
                {issuers.map(([name, n]) => (
                  <button key={name} type="button" className="rx-issuer-tile" onClick={() => setIssuer(name)}>
                    <IssuerMark name={name} size={36} />
                    <b>{name}</b>
                    <span>
                      {ISSUERS[name].type} · since {ISSUERS[name].since}
                    </span>
                    <span className="rx-tile-n">
                      {n} {n === 1 ? "product" : "products"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : cls === "fav" ? (
          <div className="rx-body">
            <div className="rw-list-head">
              <span>{favs.size} in watchlist</span>
            </div>
            {favs.size ? (
              <div className="rw-list">{ITEMS.filter((p) => favs.has(p.symbol)).map(card)}</div>
            ) : (
              <div className="rw-empty">
                <div className="rw-empty-icon">
                  <Star />
                </div>
                <p className="rw-empty-title">Nothing here yet</p>
                <p className="rw-empty-text">Tap the star on a product to follow it.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="rx-body">
            <section className="rx-hero">
              <div className="rx-hero-label">
                {c.bench.name} <Demo />
              </div>
              {(() => {
                const b = slice(BENCH[cls], range);
                return (
                  <>
                    <div className="rx-d-price">
                      <span className="rx-d-big">{benchValue(c, b.at(-1))}</span>
                      <span className={`rx-d-chg ${isUp(b) ? "is-up" : "is-down"}`}>
                        {benchChange(c, b)} · {range}
                      </span>
                    </div>
                    <Chart data={b} height={120} />
                  </>
                );
              })()}
              <Range value={range} onChange={setRange} />
              <p className="rx-blurb">{c.blurb}</p>
            </section>
            <div className="rw-list-head">
              <span>
                {(() => {
                  const n = inClass(cls).length;
                  const m = new Set(inClass(cls).map((p) => p.issuer)).size;
                  return `${n} ${n === 1 ? "product" : "products"} from ${m} ${m === 1 ? "issuer" : "issuers"}`;
                })()}
              </span>
              <span className="rw-yield-head">
                Key numbers for {c.short.toLowerCase()} <Info />
              </span>
            </div>
            <div className="rw-list">{inClass(cls).map(card)}</div>
          </div>
        )}
      </div>

      <Sheet open={!!openP} title="Product" onClose={() => setOpen(null)} tall>
        <ProductDetail
          key={open}
          p={openP}
          fav={openP && favs.has(openP.symbol)}
          onFav={() => toggleFav(openP.symbol)}
          onIssuer={(n) => {
            setOpen(null);
            setIssuer(n);
          }}
          say={say}
        />
      </Sheet>
      <Sheet open={!!issuer} title="Issuer" onClose={() => setIssuer(null)} tall>
        <IssuerDetail
          name={issuer}
          onOpen={(s) => {
            setIssuer(null);
            setOpen(s);
          }}
        />
      </Sheet>
      <div className={`rx-toast${toast ? " is-shown" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
}
