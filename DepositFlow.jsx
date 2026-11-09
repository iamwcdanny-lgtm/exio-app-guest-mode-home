import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import PhoneLayer from "./PhoneLayer";
import TokenSheet from "./TokenSheet";
import { CCY, IMG, fmtDp, fmtCcy, useOtc } from "./OtcSession";
import { slideBack } from "./backOut";
import "./DepositFlow.css";

// Deposit flow (2026-11-04), started from Home's Deposit buttons.
//   Deposit → token page (Crypto / Fiat section headers, one search) → New / Existing (sheet)
//   New:      network + intended amount (page), Confirm ⇄ Modify →
//             verification amount + total, slide to confirm → details + QR
//   Existing: select wallet (page, + Add new wallet → New) → details + QR
// Pages stack: back from a page returns to the one under it; back from the
// amount page asks first once something has been entered.
// Fiat follows the same steps with bank accounts instead of addresses, no
// network and no verification amount (the bank account must be in the user's
// name); its details show EXIO's bank account instead of a QR code.
// Addresses, bank details and amounts are placeholders.

const KINDS = {
  crypto: { label: "Crypto", sub: "BTC, ETH, USDT, USDC", assets: ["BTC", "ETH", "USDT", "USDC"] },
  fiat: { label: "Fiat", sub: "USD, HKD by bank transfer", assets: ["USD", "HKD"] },
};
const NETWORKS = {
  BTC: [["BTC", "Bitcoin", "2 confirmations"]],
  // Arbitrum and Base are Ethereum layer 2s: same 0x address format as ERC20.
  ETH: [
    ["ERC20", "Ethereum (ERC20)", "12 confirmations"],
    ["Arbitrum", "Arbitrum One", "20 confirmations"],
    ["Base", "Base", "20 confirmations"],
  ],
  USDT: [
    ["ERC20", "Ethereum (ERC20)", "12 confirmations"],
    ["TRC20", "Tron (TRC20)", "20 confirmations"],
    ["Arbitrum", "Arbitrum One", "20 confirmations"],
  ],
  USDC: [
    ["ERC20", "Ethereum (ERC20)", "12 confirmations"],
    ["SOL", "Solana", "32 confirmations"],
    ["Arbitrum", "Arbitrum One", "20 confirmations"],
    ["Base", "Base", "20 confirmations"],
  ],
};
const NET = Object.fromEntries(Object.values(NETWORKS).flat().map(([k, name, conf]) => [k, { name, conf }]));
// EXIO's deposit address per network (placeholders).
const EXIO_ADDR = {
  BTC: "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el",
  ERC20: "0x4F3a9C21b7E05d6A8e1f2C3D4b5A6978e0dC1a2B",
  Arbitrum: "0x4F3a9C21b7E05d6A8e1f2C3D4b5A6978e0dC1a2B",
  Base: "0x4F3a9C21b7E05d6A8e1f2C3D4b5A6978e0dC1a2B",
  TRC20: "TXq7nQ2bV9wK3sL5mP8rD4fH6jC1yU0aZe",
  SOL: "8FzR3kWq2nVb6YtL9pXc4sMd7hJg1eUa5oKi2NwQbTzR",
};
// Whitelisted addresses belong to a network, not a token: one ERC20 address
// serves ETH, USDT and USDC alike. A token lists every address on its networks.
// Two whitelists: every address can receive deposits from (deposit whitelist);
// withdrawals need ownership declared — WalletConnect / signature do that when
// adding, otherwise the Self custody declaration in Manage. `withdraw` = on.
const ADDRESSES = [
  { id: "a1", withdraw: true, label: "Ledger Nano X", net: "BTC", addr: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" },
  { id: "a2", withdraw: false, label: "Trezor Model T", net: "BTC", addr: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" },
  { id: "a3", withdraw: true, label: "OKX", net: "BTC", addr: "bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h" },
  { id: "a4", withdraw: false, label: "Coinbase", net: "BTC", addr: "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy" },
  { id: "a5", withdraw: true, label: "Ledger Nano X", net: "ERC20", addr: "0x7a3B5c8D9e0F1a2b3C4d5E6f7A8b9C0d1E2fC91e" },
  // a6 / a7 were added recently: still in the withdrawal cool-down (coolUntil, ms).
  { id: "a6", withdraw: false, coolUntil: Date.now() + (2 * 3600 + 41 * 60 + 50) * 1000, label: "MetaMask", net: "ERC20", addr: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE" },
  { id: "a7", withdraw: true, coolUntil: Date.now() + (37 * 60 + 12) * 1000, label: "OKX", net: "Arbitrum", addr: "0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b" },
  { id: "a8", withdraw: true, label: "Coinbase", net: "Base", addr: "0x71660c4005BA85c37ccec55d0C4493E66Fe775d3" },
  { id: "a9", withdraw: true, label: "Binance", net: "TRC20", addr: "TQ9mFz2Rk7Lb4Wn8Yc1Vd5Hs3Jt6Gp0kLp" },
  { id: "a10", withdraw: false, label: "OKX", net: "TRC20", addr: "TNXoiAJ3dct8Fjg4M9fkLFh9S2v9TXc32G" },
  { id: "a11", withdraw: true, label: "Trust Wallet", net: "TRC20", addr: "TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS" },
];
const BANKS = {
  USD: [
    { id: "b1", label: "HSBC Hong Kong", net: "bank", addr: "···· 4821" },
    { id: "b2", label: "Bank of China (Hong Kong)", net: "bank", addr: "···· 0937" },
  ],
  HKD: [{ id: "b3", label: "HSBC Hong Kong", net: "bank", addr: "···· 4821" }],
};
// The user's own-name bank accounts, once each (one account can hold several currencies).
const MY_BANKS = [
  { id: "b1", label: "HSBC Hong Kong", addr: "···· 4821", ccy: ["USD", "HKD"] },
  { id: "b2", label: "Bank of China (Hong Kong)", addr: "···· 0937", ccy: ["USD"] },
];
// A newly whitelisted address can't be withdrawn to until the cool-down has passed.
const COOL_HOURS = 4;
const isCooling = (w, now = Date.now()) => (w.coolUntil || 0) > now;
// Time left as "2h 41m 50s" / "37m 12s" / "8s"
const fmtLeft = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`;
};
// `book`: the address book as it stands (seed + added this session, toggles).
const listFor = (asset, book = ADDRESSES) => {
  if (BANKS[asset]) return BANKS[asset];
  const nets = (NETWORKS[asset] || []).map(([k]) => k);
  return book.filter((w) => nets.includes(w.net));
};
const ok12 = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M1.5 6.3l3 2.9 6-6.2" fill="none" stroke="#00d690" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const no12 = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" fill="none" stroke="#ff649b" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);
// Deposit ✓ / Withdraw ✓✗ — which whitelists the address is on.
const WlTags = ({ w }) => (
  <>
    <span className="dp-tag is-wl">Deposit{ok12}</span>
    <span className="dp-tag is-wl" aria-label={`Withdraw ${w.withdraw ? "on" : "off"}`}>
      Withdraw{w.withdraw ? ok12 : no12}
    </span>
  </>
);
const short = (a) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
const dpOf = (c) => CCY[c]?.dp ?? 2;
// A unique tail on the amount identifies a deposit from a new address / account.
const verDp = (c) => (c === "BTC" || c === "ETH" ? 6 : 2);
const makeVer = (c) => {
  const n = 11 + Math.floor(Math.random() * 89);
  return verDp(c) === 6 ? n / 1e6 : n / 100;
};
const clean = (v, dp) => {
  let s = v.replace(/,/g, "").replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "").slice(0, dp);
  return s.replace(/^0+(?=\d)/, "");
};
const group = (s) => {
  if (!s) return s;
  const [a, b] = s.split(".");
  return Number(a || 0).toLocaleString("en-US") + (b !== undefined ? `.${b}` : "");
};

const Icon = ({ c, size = 32 }) => <img src={`${IMG}/${CCY[c].icon}`} width={size} height={size} alt="" />;
const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" fill="none" stroke="rgba(0,0,0,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M10.5 3.5v-.5A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

// slide=false: the back asks first (the page leaves only if the user confirms).
const AppBar = ({ title, onBack, slide = true, right = null }) => (
  <header className="oc-appbar">
    <button type="button" className="oc-back" aria-label="Back" onClick={(e) => (slide ? slideBack(e, onBack) : onBack())}>
      <BackIcon />
    </button>
    <h1>{title}</h1>
    {right || <span />}
  </header>
);

/* ---------- Slide to confirm ---------- */
const SlideToConfirm = ({ label = "Slide to confirm", onDone }) => {
  const track = useRef(null);
  const start = useRef(null);
  const [x, setX] = useState(0);
  const [done, setDone] = useState(false);
  const [drag, setDrag] = useState(false);
  const max = () => (track.current ? track.current.clientWidth - 52 : 0);
  const down = (e) => {
    if (done) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    start.current = e.clientX - x;
    setDrag(true);
  };
  const move = (e) => {
    if (start.current == null) return;
    setX(Math.max(0, Math.min(max(), e.clientX - start.current)));
  };
  const up = () => {
    if (start.current == null) return;
    start.current = null;
    setDrag(false);
    if (x >= max() * 0.9) {
      setX(max());
      setDone(true);
      setTimeout(onDone, 350);
    } else setX(0);
  };
  const p = max() ? x / max() : 0;
  return (
    <div className={`dp-slide${done ? " is-done" : ""}${drag ? " is-drag" : ""}`} ref={track}>
      <span className="dp-slide-fill" style={{ width: `${x + 52}px` }} aria-hidden="true" />
      <span className="dp-slide-label" style={{ opacity: done ? 1 : 1 - p }}>
        {done ? "Confirmed" : label}
      </span>
      <button
        type="button"
        className="dp-slide-knob"
        style={{ transform: `translateX(${x}px)` }}
        aria-label={label}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setX(max());
            setDone(true);
            setTimeout(onDone, 350);
          }
        }}
      >
        {done ? (
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M8 5l5 5-5 5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );
};

/* ---------- Step 6–8: amount, verification, slide ---------- */
// ls: the prototype's Input style — "ifta" (label inside, top), "float"
// (label on the border), "trad" (label above a grey box).
// fixed: shows the value only (no caret, not tappable), e.g. the asset when
// whitelisting an address for it.
const Picker = ({ label, open, onOpen, children, ls = "ifta", fixed = false }) => {
  const Tag = fixed ? "div" : "button";
  const btn = (
    <Tag
      {...(fixed ? {} : { type: "button", onClick: onOpen, "aria-haspopup": "dialog", "aria-expanded": open })}
      className={`oc-xpick dp-pick is-${ls}${open ? " is-open" : ""}${fixed ? " is-fixed" : ""}`}
      aria-label={ls === "trad" ? label : undefined}
    >
      {ls !== "trad" && <span className="otc-label">{label}</span>}
      <span className="oc-xpick-row">
        {children}
        {!fixed && <img className="sel-caret" src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" />}
      </span>
    </Tag>
  );
  if (ls !== "trad") return btn;
  return (
    <div className="dp-trad">
      <span className="dp-trad-label">{label}</span>
      {btn}
    </div>
  );
};

const AmountPage = ({ d, sheet, onPickNet, onBack, onConfirmed, ls = "ifta" }) => {
  const c = d.asset;
  const fiat = d.kind === "fiat";
  const [amt, setAmt] = useState("");
  const [locked, setLocked] = useState(false);
  const [focused, setFocused] = useState(false);
  const [ver, setVer] = useState(() => makeVer(c));
  const ref = useRef(null);
  // A new asset or network unlocks the amount: it has to be confirmed again.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setLocked(false);
    setAmt((a) => clean(a, dpOf(c)));
  }, [c, d.net]);
  const noNet = !fiat && !d.net;
  const v = parseFloat(amt) || 0;
  // Fiat has no small-amount verification: the total is the amount itself.
  const vv = fiat ? 0 : ver;
  const tdp = fiat ? dpOf(c) : Math.max(dpOf(c), verDp(c));
  const total = v + vv;
  const confirm = () => {
    if (!v) return;
    setVer(makeVer(c)); // a fresh tail each time the amount is set
    setLocked(true);
    ref.current?.blur();
  };
  return (
    <div className="oc-screen oc-page dp-page is-amount">
      <AppBar title={`Deposit ${c}`} onBack={(e) => onBack(amt !== "" || locked)} slide={false} />
      <div className={`oc-page-body dp-body otc otc-style-${ls}`}>
        {!fiat && (
          <Picker ls={ls} label="Network" open={sheet === "network"} onOpen={onPickNet}>
            <b className={noNet ? "is-placeholder" : ""}>{noNet ? "Select network" : NET[d.net].name}</b>
          </Picker>
        )}
        <div className="dp-route">
          <span>From</span>
          <b>{fiat ? "A new bank account" : "A new address"}</b>
        </div>
        <div className="otc-fields">
          <div className={`otc-amount is-pay${ls !== "float" || focused || amt !== "" ? " is-up" : ""}${focused ? " is-focused" : ""}${locked ? " is-locked" : ""}${noNet ? " is-dim" : ""}`}>
            {ls === "trad" && (
              <div className="otc-amount-head">
                <label className="otc-label" htmlFor="dp-amt">
                  Intended deposit amount
                </label>
              </div>
            )}
            <div
              className="otc-amount-box"
              onMouseDown={(e) => {
                if (locked || e.target === ref.current) return;
                e.preventDefault();
                ref.current?.focus();
              }}
            >
              {ls === "ifta" && (
                <div className="otc-amount-head">
                  <label className="otc-label" htmlFor="dp-amt">
                    Intended deposit amount
                  </label>
                </div>
              )}
              <div className="otc-amount-row">
                <input
                  ref={ref}
                  id="dp-amt"
                  className="otc-input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={ls === "float" && !focused ? "" : "0"}
                  readOnly={locked}
                  disabled={noNet}
                  value={focused ? amt : group(amt)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onChange={(e) => setAmt(clean(e.target.value, dpOf(c)))}
                  onKeyDown={(e) => e.key === "Enter" && confirm()}
                />
                <span className="otc-chip is-static">
                  <Icon c={c} size={20} />
                  <b>{c}</b>
                </span>
              </div>
              {ls === "float" && (
                <label className="otc-label" htmlFor="dp-amt">
                  Intended deposit amount
                </label>
              )}
            </div>
          </div>
        </div>
        {locked ? (
          <button type="button" className="oc-btn is-outline dp-amt-btn" onClick={() => setLocked(false)}>
            Modify
          </button>
        ) : (
          <button type="button" className="oc-btn is-primary dp-amt-btn" disabled={!v || noNet} onClick={confirm}>
            Confirm amount
          </button>
        )}
        {locked && (
          <section className="dp-verify" aria-live="polite">
            {!fiat && (
              <>
                <div className="dp-row">
                  <span>Intended amount</span>
                  <b>
                    {fmtDp(v, dpOf(c))} {c}
                  </b>
                </div>
                <div className="dp-row">
                  <span>Verification amount</span>
                  <b className="is-accent">
                    + {fmtDp(ver, verDp(c))} {c}
                  </b>
                </div>
              </>
            )}
            <div className={`dp-row${fiat ? "" : " is-total"}`}>
              <span>{fiat ? "Deposit amount" : "Total deposit amount"}</span>
              <b>
                {fmtDp(total, tdp)} {c}
              </b>
            </div>
            <p className="dp-hint">
              {fiat
                ? "Send from a bank account in your own name. Once the deposit arrives, the account is added to your whitelist."
                : `Send exactly the total amount. The extra ${fmtDp(ver, verDp(c))} ${c} lets us confirm this address is yours; once it arrives, it’s added to your whitelist.`}
            </p>
          </section>
        )}
      </div>
      {locked && (
        <div className="oc-foot dp-foot">
          <SlideToConfirm onDone={() => onConfirmed({ amount: v, ver: vv, total, tdp })} />
        </div>
      )}
    </div>
  );
};

/* ---------- Step 10–11: whitelisted list ---------- */
// Same page for deposit and withdraw: only what tapping a row does differs.
// Network filter over an address list: All + each network in the list (order of first
// appearance). Hidden when the list has only one network. Same look as RWA+'s filter pills.
const netsOf = (list) => [...new Set(list.map((w) => w.net))].filter((n) => NET[n]);
const NetPills = ({ nets, value, onChange }) =>
  nets.length < 2 ? null : (
    <div className="dp-npills" role="radiogroup" aria-label="Network">
      {[["all", "All"], ...nets.map((n) => [n, NET[n].name])].map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={`dp-npill${value === k ? " is-on" : ""}`} onClick={() => onChange(k)}>
          {l}
        </button>
      ))}
    </div>
  );
const useNetFilter = (list) => {
  const [net, setNet] = useState("all");
  const nets = netsOf(list);
  const v = nets.includes(net) ? net : "all"; // a network that's gone falls back to All
  return { nets, net: v, setNet, shown: v === "all" ? list : list.filter((w) => w.net === v) };
};

// Withdraw reminders inside an address cell (Figma 18740:137477 / 18740:137492).
const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="6.67" stroke="#019ff8" strokeWidth="1.33" />
    <path d="M10 6.5V10l2.3 1.6" stroke="#019ff8" strokeWidth="1.33" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const WarnIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="6.67" fill="#f7a042" />
    <path d="M10 6.6v4.2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="13.2" r=".9" fill="#fff" />
  </svg>
);

const ListPage = ({ d, book, withdraw, onBack, onPick, onDeclare, onAdd, onManage }) => {
  const fiat = d.kind === "fiat";
  const all = listFor(d.asset, book);
  const nf = useNetFilter(fiat ? [] : all);
  // Withdraw order: 0 ready → 1 needs the ownership declaration → 2 cooling down (soonest
  // to unlock first). Ranks are taken when an address first shows (page opens, or it was
  // just added) and kept, so cards don't jump when a countdown ends or after declaring.
  const ranks = useRef({ asset: null, by: {} });
  if (ranks.current.asset !== d.asset) ranks.current = { asset: d.asset, by: {} };
  const rankOf = (w, i) => {
    const by = ranks.current.by;
    if (!by[w.id]) {
      const t = Date.now();
      by[w.id] = isCooling(w, t) ? [2, w.coolUntil] : w.withdraw === false ? [1, i] : [0, i];
    }
    return by[w.id];
  };
  const sorted = withdraw && !fiat ? all.map((w, i) => [w, rankOf(w, i)]).sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1]).map(([w]) => w) : all;
  const list = fiat ? all : nf.shown.slice().sort((a, b) => sorted.indexOf(a) - sorted.indexOf(b));
  // A just-added address may land far down (it's cooling): bring it into view, highlighted.
  const pageRef = useRef(null);
  const newId = all.find((w) => w.isNew)?.id;
  useEffect(() => {
    if (!newId) return;
    // Scroll the list only (scrollIntoView would also shift the phone frame around it).
    const t = setTimeout(() => {
      const body = pageRef.current?.querySelector(".oc-page-body");
      const card = body?.querySelector(`[data-id="${newId}"]`);
      if (!card) return;
      const top = card.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      body.scrollTo({ top: top - (body.clientHeight - card.offsetHeight) / 2, behavior: "smooth" });
    }, 320);
    return () => clearTimeout(t);
  }, [newId]);
  // Tick each second while an address is cooling down (withdraw only); it unlocks at zero.
  const [now, setNow] = useState(Date.now());
  const ticking = withdraw && all.some((w) => isCooling(w, now));
  useEffect(() => {
    if (!ticking) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);
  return (
    <div ref={pageRef} className="oc-screen oc-page dp-page is-list">
      <AppBar
        title={fiat ? "Select bank account" : "Select address"}
        onBack={onBack}
        right={
          <button type="button" className="dp-bar-link" onClick={onManage}>
            Manage
          </button>
        }
      />
      <div className="oc-page-body dp-body">
        <p className="dp-lead">
          Your whitelisted {fiat ? "bank accounts" : "addresses"} for {d.asset}.
        </p>
        {!fiat && <NetPills nets={nf.nets} value={nf.net} onChange={nf.setNet} />}
        <div className="dp-list">
          {list.map((w) =>
            w.net !== "bank" ? (
              /* Same card as Manage whitelist address; full address as the title, right arrow to pick.
                 Withdrawing: reminders for a cooling-down address and / or one without the
                 withdrawal whitelist (both can show); such a card has no arrow. */
              (() => {
                const cool = withdraw && isCooling(w, now);
                const noWd = withdraw && w.withdraw === false;
                const blocked = cool || noWd;
                return (
                  <div key={w.id} data-id={w.id} className={`dp-mcell is-pick${w.isNew ? " is-new" : ""}${blocked ? " is-blocked" : ""}`}>
                    <button type="button" className="dp-mcell-top" onClick={() => onPick(w)}>
                      <span className="dp-mcell-title">
                        <b className="is-full">
                          <FullAddr a={w.addr} />
                        </b>
                        {!blocked && <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-mcell-chev is-right" />}
                      </span>
                      <span className="dp-mcell-sub">
                        {/* Picking for a deposit / withdrawal: network only, no whitelist tags */}
                        <span className="dp-tag is-wl is-net">{NET[w.net].name}</span>
                        {w.isNew && <span className="dp-tag is-new">Just added</span>}
                      </span>
                      <small>{w.label}</small>
                    </button>
                    {blocked && (
                      <div className="dp-walerts">
                        {cool && (
                          <div className="dp-walert">
                            <p className="dp-walert-t">
                              <ClockIcon />
                              Available for withdrawal in {fmtLeft(w.coolUntil - now)}
                            </p>
                          </div>
                        )}
                        {noWd && (
                          <div className="dp-walert is-warn">
                            <p className="dp-walert-t">
                              <WarnIcon />
                              Declare the wallet ownership for withdrawal
                            </p>
                            <button type="button" className="dp-walert-link" onClick={() => onDeclare(w)}>
                              Declare now
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
            <button key={w.id} data-id={w.id} type="button" className={`dp-cell${w.isNew ? " is-new" : ""}`} onClick={() => onPick(w)}>
              {w.net === "bank" ? (
                <span className="dp-cell-text">
                  <b>{w.label}</b>
                  <small>{w.addr}</small>
                </span>
              ) : (
                /* Wallet: the full address is the title; name + network underneath */
                <span className="dp-cell-text is-addr">
                  <b className="dp-cell-addr">
                    <FullAddr a={w.addr} />
                  </b>
                  <small>
                    {w.label}
                    <span className="dp-tag">{w.net}</span>
                    <WlTags w={w} />
                    {w.isNew && <span className="dp-tag is-new">Just added</span>}
                  </small>
                </span>
              )}
              <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-chev" />
            </button>
            ),
          )}
          {!list.length && <p className="dp-empty">No whitelisted {fiat ? "bank accounts" : "addresses"} for {d.asset} yet.</p>}
        </div>
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-outline" onClick={onAdd}>
          {fiat ? "Add bank account" : "Add address"}
        </button>
      </div>
    </div>
  );
};

/* ---------- Manage whitelist address (Figma EXIO Mobile 18169:143919) ---------- */
const shortAddr = (a) => (a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);
// Full address with the middle dimmed, so the ends are easy to compare.
const FullAddr = ({ a }) => (
  <>
    {a.slice(0, 6)}
    <span className="dp-addr-mid">{a.slice(6, -6)}</span>
    {a.slice(-6)}
  </>
);
const Switch = ({ on, disabled, label, onClick }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`dp-switch${on ? " is-on" : ""}`} onClick={onClick}>
    <span />
  </button>
);
const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.7" fill="#007dc0" />
    <path d="M8 7.2v3.9" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="5" r=".9" fill="#fff" />
  </svg>
);

// Full-screen page over Select address (like the add pages); Add address in the footer.
// Two tabs: crypto addresses and bank accounts. Opens on the tab that matches
// where it was reached from (a fiat token's Select bank account → Bank accounts).
const ManagePage = ({ book, tab, setTab, onBack, onAdd, onAddBank, onWithdraw, say }) => {
  const [open, setOpen] = useState(null);
  const bodyRef = useRef(null);
  const headRef = useRef(null);
  const [headH, setHeadH] = useState(0); // the blurred header floats over the list
  const bank = tab === "bank";
  const nf = useNetFilter(book);
  useLayoutEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="oc-screen oc-page dp-page is-manage">
      <div ref={headRef} className="dp-mhead">
      <AppBar title="Manage whitelist address" onBack={onBack} />
      {/* Two kinds only, so the app's segmented control (Trade's OTC / Order book). */}
      <div className="dp-seg-wrap">
      <div className="tp-seg dp-seg" role="tablist" aria-label="Whitelist type" style={{ "--seg-i": bank ? 1 : 0, "--seg-n": 2 }}>
        {[
          ["crypto", "Crypto addresses"],
          ["bank", "Bank accounts"],
        ].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tp-seg-item${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      </div>
      </div>
      <div ref={bodyRef} className="oc-page-body dp-body" style={{ paddingTop: headH + 16 }}>
        {bank ? (
          <div className="dp-list">
            {MY_BANKS.map((b) => (
              <div key={b.id} className="dp-mcell">
                <div className="dp-mcell-top is-static">
                  <span className="dp-mcell-title">
                    <b>{b.label}</b>
                  </span>
                  <span className="dp-mcell-sub">
                    <span className="dp-mcell-net">{b.addr}</span>
                    {b.ccy.map((c) => (
                      <span key={c} className="dp-tag is-wl">
                        {c}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
        <p className="dp-info">
          <InfoIcon />
          <span>To enable withdrawals for an address, tab to open the address details and turn on the ownership confirmation switch.</span>
        </p>
        <NetPills nets={nf.nets} value={nf.net} onChange={nf.setNet} />
        <div className="dp-list">
          {nf.shown.map((w) => {
            const isOpen = open === w.id;
            return (
              <div key={w.id} className={`dp-mcell${isOpen ? " is-open" : ""}`}>
                <button type="button" className="dp-mcell-top" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : w.id)}>
                  <span className="dp-mcell-title">
                    <b>{shortAddr(w.addr)}</b>
                    <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-mcell-chev" />
                  </span>
                  <span className="dp-mcell-sub">
                    <span className="dp-tag is-wl is-net">{NET[w.net].name}</span>
                    <WlTags w={w} />
                  </span>
                  <small>{w.label}</small>
                </button>
                {/* Always mounted so open and close can animate (grid row 0fr ↔ 1fr); inert while closed. */}
                <div className="dp-mcell-exp" inert={isOpen ? undefined : ""} aria-hidden={!isOpen}>
                  <div className="dp-mcell-exp-in">
                  <div className="dp-mcell-body">
                    <dl className="dp-grid">
                      <dt>Address</dt>
                      <dd className="dp-grid-addr">
                        <FullAddr a={w.addr} />
                      </dd>
                      <dt>Network</dt>
                      <dd>{NET[w.net].name}</dd>
                      <dt>Deposit</dt>
                      <dd>
                        {/* Every whitelisted address can deposit; not switchable. */}
                        <Switch on disabled label="Deposit" />
                      </dd>
                      <dt>Withdraw</dt>
                      <dd>
                        <Switch on={w.withdraw} label="Withdraw" onClick={() => onWithdraw(w)} />
                      </dd>
                      <dt>Remarks</dt>
                      <dd>{w.label}</dd>
                    </dl>
                    <div className="dp-mcell-btns">
                      <button type="button" className="dp-sbtn" onClick={() => say("Editing remarks isn’t in this demo")}>
                        Edit remarks
                      </button>
                      <button type="button" className="dp-sbtn is-danger" onClick={() => say("Removing an address isn’t in this demo")}>
                        Remove address
                      </button>
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
          </>
        )}
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-outline" onClick={bank ? onAddBank : onAdd}>
          {bank ? "Add bank account" : "Add address"}
        </button>
      </div>
    </div>
  );
};

// Withdraw switch off → on: declare the wallet is self-custodied.
const DeclareSheet = ({ w, open, onClose, onConfirm }) => {
  const [agree, setAgree] = useState(false);
  useEffect(() => {
    if (open) setAgree(false);
  }, [open]);
  return (
    <BaseSheet open={open} onClose={onClose} title="Self custody declaration" className="dp-declare">
      {w && (
        <dl className="dp-grid">
          <dt>Address</dt>
          <dd className="dp-grid-addr">
            <FullAddr a={w.addr} />
          </dd>
          <dt>Network</dt>
          <dd>{NET[w.net].name}</dd>
          <dt>Remarks</dt>
          <dd>{w.label}</dd>
        </dl>
      )}
      <button type="button" role="checkbox" aria-checked={agree} className="dp-agree" tabIndex={open ? 0 : -1} onClick={() => setAgree((a) => !a)}>
        <Check on={agree} />
        <span>I hereby declare that this is my personal unhosted (self-custody) wallet, and I have full control over its private keys.</span>
      </button>
      <div className="dp-leave-btns">
        <button type="button" className="oc-btn is-primary" disabled={!agree} tabIndex={open ? 0 : -1} onClick={onConfirm}>
          Confirm &amp; continue
        </button>
      </div>
    </BaseSheet>
  );
};

// Withdraw switch on → off.
const DisableSheet = ({ open, onClose, onConfirm }) => (
  <PhoneLayer className="tks-layer">
    <div className={`tks-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
    <div className={`tks-sheet dp-disable${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dp-disable-title" aria-hidden={!open}>
      <span className="tks-grab" aria-hidden="true" />
      <img src={`${IMG}/result-warning.png`} width="120" height="120" alt="" />
      <h2 id="dp-disable-title">Disable withdrawals for this address?</h2>
      <p>Once disabled, this address cannot be used for withdrawals.</p>
      <div className="dp-leave-btns">
        <button type="button" className="oc-btn is-danger-outline" tabIndex={open ? 0 : -1} onClick={onConfirm}>
          Disable withdrawals
        </button>
      </div>
    </div>
  </PhoneLayer>
);

/* ---------- Step 9 / 12: deposit details ---------- */
const Qr = ({ text }) => {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M" }).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [text]);
  return <div className="dp-qr" role="img" aria-label="Deposit address QR code" dangerouslySetInnerHTML={{ __html: svg }} />;
};

const DetailPage = ({ d, onDone, say }) => {
  const c = d.asset;
  const fiat = d.kind === "fiat";
  const fromNew = !d.from;
  const net = fromNew ? d.net : d.from.net;
  const addr = fiat ? null : EXIO_ADDR[net];
  const ref = useRef(`DEP-${Math.floor(100000 + Math.random() * 900000)}`).current;
  const copy = (label, value) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    say(`${label} copied`);
  };
  const Row = ({ k, v, copyAs }) => (
    <div className="dp-row">
      <span>{k}</span>
      <b>
        {v}
        {copyAs && (
          <button type="button" className="dp-copy" aria-label={`Copy ${k}`} onClick={() => copy(k, copyAs)}>
            <CopyIcon />
          </button>
        )}
      </b>
    </div>
  );
  const amountStr = d.total != null ? `${fmtDp(d.total, d.tdp)} ${c}` : null;
  return (
    <div className="oc-screen oc-page dp-page is-detail">
      <AppBar title={`Deposit ${c}`} onBack={onDone} />
      <div className="oc-page-body dp-body">
        <div className="dp-note">
          {fromNew ? (
            <>
              {fiat ? (
                <>
                  Send <b>{amountStr}</b> from a bank account in your own name, with the reference below in the remarks. Transfers from third-party accounts are returned.
                </>
              ) : (
                <>
                  Send <b>exactly {amountStr}</b> from your new address within 24 hours. Other amounts can’t be matched to you and are returned.
                </>
              )}
            </>
          ) : (
            <>
              Send {c} only from <b>{d.from.label}</b> ({fiat ? d.from.addr : short(d.from.addr)}). Deposits from other {fiat ? "accounts" : "addresses"} are returned.
            </>
          )}
        </div>
        {fiat ? (
          <section className="dp-card">
            <h2>EXIO bank account</h2>
            <Row k="Beneficiary" v="EXIO (HK) Limited" copyAs="EXIO (HK) Limited" />
            <Row k="Bank" v="Placeholder Bank (HK)" />
            <Row k="Account no." v="000-000000-001" copyAs="000000000001" />
            <Row k="SWIFT" v="XXXXHKHH" copyAs="XXXXHKHH" />
            <Row k="Reference" v={ref} copyAs={ref} />
            <p className="dp-hint">Put the reference in the transfer remarks. Bank details are placeholders.</p>
          </section>
        ) : (
          <section className="dp-card is-qr">
            <Qr text={addr} />
            <span className="dp-tag is-lg">{NET[net].name}</span>
            <p className="dp-addr">{addr}</p>
            <button type="button" className="oc-btn is-outline is-sm dp-copy-btn" onClick={() => copy("Address", addr)}>
              <CopyIcon /> Copy address
            </button>
          </section>
        )}
        <section className="dp-card">
          <Row k="Asset" v={c} />
          {!fiat && <Row k="Network" v={NET[net].name} />}
          {amountStr && <Row k="Amount to send" v={amountStr} copyAs={String(d.total.toFixed(d.tdp))} />}
          <Row k="From" v={fromNew ? (fiat ? "New bank account" : "New address") : d.from.label} />
          <Row k="Credited to" v="Custody account" />
          {!fiat && <Row k="Arrives after" v={NET[net].conf} />}
        </section>
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
};

/* ---------- Withdraw: amount, review, result ---------- */
// Withdrawals leave the Custody account, so its balance is what's available.
const WAmountPage = ({ d, onBack, onNext, ls = "ifta" }) => {
  const c = d.asset;
  const avail = useOtc().s.bal.custody[c] || 0;
  const [amt, setAmt] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);
  const v = parseFloat(amt) || 0;
  const over = v > avail;
  const availEl = (
    <span className="otc-avail">
      Avail.
      <b>{fmtCcy(avail, c)}</b>
      <button type="button" className="otc-all" disabled={!avail} onMouseDown={(e) => e.preventDefault()} onClick={() => setAmt(clean(String(avail), dpOf(c)))}>
        Max
      </button>
    </span>
  );
  const label = (
    <label className="otc-label" htmlFor="wd-amt">
      Withdraw amount
    </label>
  );
  return (
    <div className="oc-screen oc-page dp-page is-wamount">
      <AppBar title={`Withdraw ${c}`} onBack={onBack} />
      <div className={`oc-page-body dp-body otc otc-style-${ls}`}>
        <div className="dp-route">
          <span>To</span>
          <b>{d.to.label}</b>
          <em>{d.to.net === "bank" ? d.to.addr : short(d.to.addr)}</em>
        </div>
        <div className="otc-fields">
          <div className={`otc-amount is-pay${ls !== "float" || focused || amt !== "" ? " is-up" : ""}${focused ? " is-focused" : ""}${over ? " is-error" : ""}`}>
            {ls === "trad" && (
              <div className="otc-amount-head">
                {label}
                {availEl}
              </div>
            )}
            <div
              className="otc-amount-box"
              onMouseDown={(e) => {
                if (e.target === ref.current || e.target.closest("button")) return;
                e.preventDefault();
                ref.current?.focus();
              }}
            >
              {ls === "ifta" && (
                <div className="otc-amount-head">
                  {label}
                  {availEl}
                </div>
              )}
              <div className="otc-amount-row">
                <input
                  ref={ref}
                  id="wd-amt"
                  className="otc-input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={ls === "float" && !focused ? "" : "0"}
                  aria-invalid={over || undefined}
                  aria-describedby={over ? "wd-amt-note" : undefined}
                  value={focused ? amt : group(amt)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onChange={(e) => setAmt(clean(e.target.value, dpOf(c)))}
                  onKeyDown={(e) => e.key === "Enter" && v && !over && onNext(v)}
                />
                <span className="otc-chip is-static">
                  <Icon c={c} size={20} />
                  <b>{c}</b>
                </span>
              </div>
              {ls === "float" && <div className="otc-amount-foot">{availEl}</div>}
              {ls === "float" && label}
            </div>
          </div>
          {over && (
            <p id="wd-amt-note" className="otc-note" aria-live="polite">
              Exceeds your available balance.
            </p>
          )}
        </div>
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-primary" disabled={!v || over} onClick={() => onNext(v)}>
          Next
        </button>
      </div>
    </div>
  );
};

const WReviewPage = ({ d, onBack, onConfirmed }) => {
  const c = d.asset;
  const bank = d.to.net === "bank";
  return (
    <div className="oc-screen oc-page dp-page is-wreview">
      <AppBar title="Withdrawal request" onBack={onBack} />
      <div className="oc-page-body dp-body">
        <section className="dp-card">
          <div className="dp-row">
            <span>Asset</span>
            <b>{c}</b>
          </div>
          {!bank && (
            <div className="dp-row">
              <span>Network</span>
              <b>{NET[d.to.net].name}</b>
            </div>
          )}
          <div className="dp-row is-to">
            <span>To</span>
            <b>
              {d.to.label}
              <small className={bank ? "" : "dp-addr-full"}>{d.to.addr}</small>
            </b>
          </div>
          <div className="dp-row is-total">
            <span>Withdraw amount</span>
            <b>
              {fmtCcy(d.amount, c)} {c}
            </b>
          </div>
        </section>
      </div>
      <div className="oc-foot dp-foot">
        <SlideToConfirm onDone={onConfirmed} />
      </div>
    </div>
  );
};

const WResultPage = ({ onDone }) => (
  <div className="oc-screen oc-page dp-page is-wresult">
    <AppBar title="Withdraw" onBack={onDone} />
    <div className="oc-page-body dp-body dp-result">
      <img src={`${import.meta.env.BASE_URL}images/passkey/result-success.svg`} width="120" height="120" alt="" />
      <h2>Withdrawal request submitted</h2>
    </div>
    <div className="oc-foot dp-foot">
      <button type="button" className="oc-btn is-primary" onClick={onDone}>
        Done
      </button>
    </div>
  </div>
);

/* ---------- Token selection (page) ---------- */
const HEADS = { crypto: ["Crypto"], fiat: ["Fiat", "By bank transfer"] };
const TokenPage = ({ value, kind, onBack, onPick, title = "Deposit", heads = HEADS }) => {
  const [q, setQ] = useState("");
  // Deposits land in the Custody account, so each cell shows that balance.
  const bal = useOtc().s.bal.custody;
  const term = q.trim().toLowerCase();
  // Only the kind picked in the first sheet (Fiat / Crypto, Bank / On-chain).
  const sections = Object.entries(KINDS)
    .filter(([k]) => !kind || k === kind)
    .map(([k, v]) => [k, v, v.assets.filter((c) => (c + CCY[c].name).toLowerCase().includes(term))])
    .filter(([, , list]) => list.length);
  return (
    <div className="oc-screen oc-page dp-page is-token">
      <AppBar title={title} onBack={onBack} />
      <div className="oc-page-body dp-body">
        <label className="dp-search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search token or currency" aria-label="Search" />
        </label>
        {sections.map(([k, v, list]) => (
          <section key={k} className="dp-section" aria-labelledby={`dp-sec-${k}`}>
            <h2 id={`dp-sec-${k}`} className="dp-section-head">
              {heads[k][0]}
              {heads[k][1] && <span>{heads[k][1]}</span>}
            </h2>
            <div className="tks-list dp-tokens">
              {list.map((c) => (
                <button key={c} type="button" className={`tks-row${c === value ? " is-on" : ""}`} onClick={() => onPick(k, c)}>
                  <span className="tks-icon">
                    <Icon c={c} />
                  </span>
                  <span className="tks-text">
                    <b>
                      {c}
                      {CCY[c].pi && <span className="tks-tag">PI</span>}
                    </b>
                    <small>{CCY[c].name}</small>
                  </span>
                  <span className="tks-bal">
                    <b>{fmtCcy(bal[c] || 0, c)}</b>
                    <small>≈ {fmtDp((bal[c] || 0) * (CCY[c].usd || 0), 2)} USD</small>
                  </span>
                  <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-chev" />
                </button>
              ))}
            </div>
          </section>
        ))}
        {!sections.length && <p className="dp-empty">No match for “{q}”.</p>}
      </div>
    </div>
  );
};

/* ---------- Leave? ---------- */
const LeaveSheet = ({ open, onStay, onLeave }) => (
  <PhoneLayer className="tks-layer">
    <div className={`tks-scrim${open ? " is-open" : ""}`} onClick={onStay} aria-hidden="true" />
    <div className={`tks-sheet dp-leave${open ? " is-open" : ""}`} role="alertdialog" aria-modal="true" aria-labelledby="dp-leave-t" aria-hidden={!open}>
      <span className="tks-grab" aria-hidden="true" />
      <div className="tks-head">
        <h2 id="dp-leave-t">Go back?</h2>
      </div>
      <p className="dp-leave-text">The network and amount you’ve set won’t be kept.</p>
      <div className="dp-leave-btns">
        <button type="button" className="oc-btn is-outline" tabIndex={open ? 0 : -1} onClick={onLeave}>
          Go back
        </button>
        <button type="button" className="oc-btn is-primary" tabIndex={open ? 0 : -1} onClick={onStay}>
          Stay
        </button>
      </div>
    </div>
  </PhoneLayer>
);

/* ---------- Add new wallet (2026-11-05) ----------
   Add new wallet → sheet: Small-amount verification | WalletConnect | Signature verification
   Small amount: the New-address amount page (verified by the deposit itself).
   WalletConnect: Add whitelist address (network, remarks, terms) → Connect wallet
     sheet → the wallet app asks to connect → Security verification → list.
   Signature: Add whitelist address (network, address, remarks) → Address ownership
     verification (copy message, sign in wallet, paste result) → Security
     verification → list.
   Reorganised from EXIO Mobile 19776:127306: the Wallet / Manual radio on the
   form is now the choice in the sheet. Wallet apps, codes and signatures are
   simulated; any 6 digits pass. */
const LOCK_NOTE = "For added security, a 4-hour lock is implemented on fund withdrawals for newly whitelisted addresses.";
const WALLETS = [
  ["metamask", "MetaMask", "#f6851b"],
  ["coinbase", "Coinbase Wallet", "#0052ff"],
  ["okx", "OKX Wallet", "#111"],
  ["phantom", "Phantom", "#ab9ff2"],
  ["trust", "Trust Wallet", "#0500ff"],
];
const WALLET = Object.fromEntries(WALLETS.map(([k, name, bg]) => [k, { name, bg }]));
const WalletBadge = ({ k, size = 32 }) => (
  <span className="dp-wbadge" style={{ width: size, height: size, background: WALLET[k].bg }} aria-hidden="true">
    {WALLET[k].name[0]}
  </span>
);
// Demo addresses a connected wallet / the Paste button hands over, per network.
const DEMO_ADDR = {
  BTC: "bc1q9h7garjk7xg4ek3gf9xkqrz7dhpcm4nn2ul8qx",
  ERC20: "0x451ceE9936cE1F566DfA4b09E09e3485DC17a1de",
  Arbitrum: "0x451ceE9936cE1F566DfA4b09E09e3485DC17a1de",
  Base: "0x451ceE9936cE1F566DfA4b09E09e3485DC17a1de",
  TRC20: "TJ4r8qWm2Xc7Vb3Nk9Lp5Hd6Ys1FgPQa8z",
  SOL: "5YNmS1R9nNSCDzb5a7mMJ1dwK9uHeAAF4CmPEwKgVWr8",
};
const ADDR_RE = {
  BTC: /^(bc1[02-9ac-hj-np-z]{25,60}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  ERC20: /^0x[0-9a-fA-F]{40}$/,
  Arbitrum: /^0x[0-9a-fA-F]{40}$/,
  Base: /^0x[0-9a-fA-F]{40}$/,
  TRC20: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  SOL: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
};
const DEMO_SIG =
  "0x38e83f5b0d3ae0d392c09cfe7ac78bf9e480acd55e491cf9a47207ea7639303d359547ab324580b7d37aab3464ccd919f701d4d0a6a2a0aa82d5088aae5f1dc51b";

const MethodIcon = ({ k }) => (
  <span className="dp-micon" aria-hidden="true">
    {k === "small" && (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 10h14M10 3v14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="15.5" cy="15.5" r="2" fill="currentColor" />
      </svg>
    )}
    {k === "connect" && (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M8.5 11.5l3-3M7 9l-1.8 1.8a2.5 2.5 0 0 0 3.5 3.5L10.5 13M13 11l1.8-1.8a2.5 2.5 0 0 0-3.5-3.5L9.5 7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    )}
    {k === "sign" && (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M4 15.5c2-3 3.5-3 4.5-1.5s2 1.5 3.5-.5M12.5 4.5l3 3-6 6H6.5v-3l6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </span>
);

const Field = ({ label, children, hint, error }) => (
  <div className={`dp-field${error ? " is-error" : ""}`}>
    <span className="dp-field-label">{label}</span>
    {children}
    {(error || hint) && <small className="dp-field-hint">{error || hint}</small>}
  </div>
);

// Text field that follows the prototype's Input style, like the pickers:
// ifta (label inside, top), float (label rests in the box, rises onto the
// border), trad (label above). action: a text button inside on the right.
// multiline: a textarea that grows with its content (e.g. a full address that
// needs two rows) instead of scrolling sideways; Enter doesn't add a line.
const TextField = ({ ls = "ifta", id, label, value, onChange, placeholder = "", hint, error, disabled, action, onBlur, multiline = false, inputProps = {} }) => {
  const [focused, setFocused] = useState(false);
  const up = ls !== "float" || focused || value !== "";
  const ta = useRef(null);
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value, multiline]);
  const Input = multiline ? "textarea" : "input";
  const box = (
    <span className={`dp-tf-box${action ? " has-action" : ""}${multiline ? " is-multi" : ""}`}>
      {ls === "ifta" && (
        <label className="dp-tf-label" htmlFor={id}>
          {label}
        </label>
      )}
      <Input
        id={id}
        ref={multiline ? ta : undefined}
        rows={multiline ? 1 : undefined}
        className="dp-tf-input"
        value={value}
        disabled={disabled}
        placeholder={ls === "float" && !up ? "" : placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={multiline ? (e) => e.key === "Enter" && e.preventDefault() : undefined}
        {...inputProps}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
      />
      {ls === "float" && (
        <label className="dp-tf-label" htmlFor={id}>
          {label}
        </label>
      )}
      {action}
    </span>
  );
  return (
    <div className={`dp-tf is-${ls}${up ? " is-up" : ""}${focused ? " is-focused" : ""}${error ? " is-error" : ""}${disabled ? " is-disabled" : ""}`}>
      {ls === "trad" && (
        <label className="dp-tf-label" htmlFor={id}>
          {label}
        </label>
      )}
      {box}
      {(error || hint) && <small className="dp-field-hint">{error || hint}</small>}
    </div>
  );
};

const Check = ({ on }) => (
  <span className={`dp-check${on ? " is-on" : ""}`} aria-hidden="true">
    {on && (
      <svg width="12" height="12" viewBox="0 0 12 12">
        <path d="M2.5 6.2l2.3 2.3L9.5 3.8" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </span>
);

// The shared top of both Add whitelist address pages.
// Asset (pre-filled from where the user came from, changeable), then Network.
const WlHead = ({ d, ls, sheet, onPickAsset, onPickNet }) => (
  <>
    <div className="dp-note">{LOCK_NOTE}</div>
    <Picker ls={ls} label="Asset" open={sheet === "asset"} onOpen={onPickAsset}>
      <Icon c={d.asset} size={20} />
      <b>
        {d.asset}
        <small className="dp-pick-sub">{CCY[d.asset].name}</small>
      </b>
    </Picker>
    <Picker ls={ls} label="Network" open={sheet === "network"} onOpen={onPickNet}>
      <b className={d.net ? "" : "is-placeholder"}>{d.net ? NET[d.net].name : "Select network"}</b>
    </Picker>
  </>
);

const ConnectPage = ({ d, ls, sheet, onPickAsset, onPickNet, onBack, onConnect, remarks, setRemarks }) => {
  const [agree, setAgree] = useState(false);
  return (
    <div className="oc-screen oc-page dp-page is-connect">
      <AppBar title="Add whitelist address" onBack={onBack} />
      <div className={`oc-page-body dp-body dp-form is-${ls} otc-style-${ls}`}>
        <WlHead d={d} ls={ls} sheet={sheet} onPickAsset={onPickAsset} onPickNet={onPickNet} />
        <TextField ls={ls} id="dp-wc-remarks" label="Remarks (optional)" value={remarks} onChange={setRemarks} placeholder="e.g. My MetaMask" inputProps={{ maxLength: 30 }} />
        <button type="button" className="dp-agree" role="checkbox" aria-checked={agree} onClick={() => setAgree((a) => !a)}>
          <Check on={agree} />
          <span>
            I have read and agreed to EX.IO’s <u>Privacy Policy</u> and <u>Terms &amp; Conditions</u>.
          </span>
        </button>
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-primary" disabled={!agree || !d.net} onClick={onConnect}>
          Connect wallet
        </button>
      </div>
    </div>
  );
};

const AddrPage = ({ d, ls, sheet, onPickAsset, onPickNet, onBack, onNext, remarks, setRemarks, addr, setAddr }) => {
  const [touched, setTouched] = useState(false);
  const ok = d.net && ADDR_RE[d.net].test(addr.trim());
  const err = touched && addr && d.net && !ok ? `Enter a valid ${NET[d.net].name} address` : "";
  return (
    <div className="oc-screen oc-page dp-page is-addr">
      <AppBar title="Add whitelist address" onBack={onBack} />
      <div className={`oc-page-body dp-body dp-form is-${ls} otc-style-${ls}`}>
        <WlHead d={d} ls={ls} sheet={sheet} onPickAsset={onPickAsset} onPickNet={onPickNet} />
        <TextField
          ls={ls}
          id="dp-sig-addr"
          multiline
          label="Address"
          value={addr}
          onChange={(v) => setAddr(v.trim())}
          onBlur={() => setTouched(true)}
          error={err}
          disabled={!d.net}
          placeholder={d.net ? "Enter or paste the address" : "Select a network first"}
          inputProps={{ spellCheck: false, autoCapitalize: "off" }}
          action={
            <button type="button" className="dp-paste" disabled={!d.net} onClick={() => (setAddr(DEMO_ADDR[d.net]), setTouched(true))}>
              Paste
            </button>
          }
        />
        <TextField ls={ls} id="dp-sig-remarks" label="Remarks (optional)" value={remarks} onChange={setRemarks} placeholder="e.g. My Ledger" inputProps={{ maxLength: 30 }} />
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-primary" disabled={!ok} onClick={onNext}>
          Next
        </button>
      </div>
    </div>
  );
};

const SignPage = ({ addr, onBack, onHow, onSubmit, say }) => {
  const [sig, setSig] = useState("");
  const msg = useRef(
    `It is hereby declared, on ${new Date().toISOString().slice(0, 10)}, that I/we own the wallet address ${addr} Nonce: ${Math.floor(Date.now() / 1000)}`
  ).current;
  const ok = /^0x[0-9a-fA-F]{64,}$/.test(sig.trim());
  return (
    <div className="oc-screen oc-page dp-page is-sign">
      <AppBar title="Add whitelist address" onBack={onBack} />
      <div className="oc-page-body dp-body">
        <div className="dp-sign-head">
          <h2>Address ownership verification</h2>
          <p className="dp-lead">Sign the message below with this address’s wallet, then paste the signature here.</p>
        </div>
        <ol className="dp-steps">
          <li>
            <span className="dp-step-n">1</span>
            <div className="dp-step-body">
              <b>Copy the message</b>
              <div className="dp-msg">
                <p>{msg}</p>
                <button
                  type="button"
                  className="dp-copy"
                  aria-label="Copy message"
                  onClick={() => {
                    navigator.clipboard?.writeText(msg).catch(() => {});
                    say("Message copied");
                  }}
                >
                  <CopyIcon />
                </button>
              </div>
            </div>
          </li>
          <li>
            <span className="dp-step-n">2</span>
            <div className="dp-step-body">
              <b>Sign the copied message with your wallet</b>
              <button type="button" className="dp-link" onClick={onHow}>
                How to sign with your wallet?
              </button>
            </div>
          </li>
          <li>
            <span className="dp-step-n">3</span>
            <div className="dp-step-body">
              <b>Paste the result</b>
              <span className="dp-input-wrap is-area">
                <textarea className="dp-input" rows={4} value={sig} onChange={(e) => setSig(e.target.value.trim())} placeholder="Paste the signature result here" spellCheck={false} />
                <button type="button" className="dp-paste" onClick={() => setSig(DEMO_SIG)}>
                  Paste
                </button>
              </span>
              {sig && !ok && <small className="dp-field-hint is-error">This doesn’t look like a signature. It starts with 0x.</small>}
            </div>
          </li>
        </ol>
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-primary" disabled={!ok} onClick={onSubmit}>
          Submit
        </button>
      </div>
    </div>
  );
};

const BaseSheet = ({ open, onClose, title, children, className = "" }) => (
  <PhoneLayer className="tks-layer">
    <div className={`tks-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
    <div className={`tks-sheet ${className}${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label={title} aria-hidden={!open}>
      <span className="tks-grab" aria-hidden="true" />
      <div className="tks-head">
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  </PhoneLayer>
);

const HowSheet = ({ open, onClose }) => (
  <BaseSheet open={open} onClose={onClose} title="How to sign with your wallet?" className="dp-how">
    <ol className="dp-how-list">
      <li>Copy the verification message provided by EX.IO.</li>
      <li>Open your wallet (e.g. MetaMask, or another supported wallet).</li>
      <li>Sign the message using the address you want to verify.</li>
      <li>Copy the signed message from your wallet.</li>
      <li>Paste and submit the signed message in the field on this page.</li>
    </ol>
    <div className="dp-leave-btns">
      <button type="button" className="oc-btn is-primary" tabIndex={open ? 0 : -1} onClick={onClose}>
        Got it
      </button>
    </div>
  </BaseSheet>
);

const SecuritySheet = ({ open, onClose, onSubmit, ls = "ifta" }) => {
  const [sms, setSms] = useState("");
  const [ga, setGa] = useState("");
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (open) {
      setSms("");
      setGa("");
      setLeft(0);
    }
  }, [open]);
  useEffect(() => {
    if (!left) return undefined;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const digits = (v) => v.replace(/\D/g, "").slice(0, 6);
  const ok = sms.length === 6 && ga.length === 6;
  return (
    <BaseSheet open={open} onClose={onClose} title="Security verification" className="dp-sec">
      <div className={`dp-sec-body dp-form is-${ls}`}>
        <TextField
          ls={ls}
          id="dp-sec-sms"
          label="Mobile verification code"
          hint="Code will be sent to +852 91***21"
          value={sms}
          onChange={(v) => setSms(digits(v))}
          placeholder="6-digit code"
          inputProps={{ inputMode: "numeric", autoComplete: "one-time-code", tabIndex: open ? 0 : -1 }}
          action={
            <button type="button" className="dp-paste" disabled={left > 0} tabIndex={open ? 0 : -1} onClick={() => setLeft(60)}>
              {left ? `Resend in ${left}s` : "Send code"}
            </button>
          }
        />
        <TextField
          ls={ls}
          id="dp-sec-ga"
          label="Authenticator code"
          hint="Enter the 6-digit code from your authenticator app"
          value={ga}
          onChange={(v) => setGa(digits(v))}
          placeholder="6-digit code"
          inputProps={{ inputMode: "numeric", tabIndex: open ? 0 : -1 }}
        />
      </div>
      <div className="dp-leave-btns">
        <button type="button" className="oc-btn is-primary" disabled={!ok} tabIndex={open ? 0 : -1} onClick={onSubmit}>
          Submit
        </button>
      </div>
    </BaseSheet>
  );
};

// Stand-in for the wallet app: "Opening…", then its connect request.
const WalletApp = ({ k, onCancel, onConnect }) => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 900);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="dp-wapp" role="dialog" aria-modal="true" aria-label={WALLET[k].name}>
      <div className="dp-wapp-top">
        <WalletBadge k={k} size={56} />
        <b>{WALLET[k].name}</b>
        {!ready && <small>Opening…</small>}
      </div>
      {ready && (
        <div className="dp-wapp-sheet">
          <span className="dp-wapp-logo">EX</span>
          <h2>EX.IO wants to:</h2>
          <ul>
            <li>
              <b>See your accounts and suggest transactions</b>
              <small>Requesting for Account 1</small>
            </li>
            <li>
              <b>Use your enabled networks</b>
              <small>Needed to verify the address on this network</small>
            </li>
          </ul>
          <div className="dp-leave-btns">
            <button type="button" className="oc-btn is-outline" onClick={onCancel}>
              Cancel
            </button>
            <button type="button" className="oc-btn is-primary" onClick={onConnect}>
              Connect
            </button>
          </div>
          <p className="dp-wapp-hint">Simulated wallet app</p>
        </div>
      )}
    </div>
  );
};

/* ---------- The flow ---------- */
// Withdraw (2026-11-07) reuses the token page, the address list and the
// add-address pages: token → Select address (Manage, Add address) → amount →
// review + slide to confirm → submitted.
const W_HEADS = { crypto: ["On-chain withdrawal"], fiat: ["Bank withdrawal"] };

export default function DepositFlow({ open, onClose, labelStyle = "ifta", mode = "deposit" }) {
  const withdraw = mode === "withdraw";
  const [sheet, setSheet] = useState(null); // way | source | network
  const [way, setWay] = useState(null); // first step: "fiat" | "crypto"
  const [d, setD] = useState({});
  const [tokenPage, setTokenPage] = useState(false);
  const [stack, setStack] = useState([]); // pages over the token page: "list", "amount"
  const [detail, setDetail] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [book, setBook] = useState(ADDRESSES); // address book: seed + added this session, withdraw on/off
  const [mTab, setMTab] = useState("crypto"); // Manage tab
  const savedD = useRef(null); // token context to restore after Add bank account from a crypto context
  const [wdFor, setWdFor] = useState(null); // address whose Withdraw switch was tapped
  const [done, setDone] = useState(""); // centred result toast (Figma "Address setting updated")
  const [wl, setWl] = useState({ remarks: "", addr: "", wallet: null, method: null });
  const [wapp, setWapp] = useState(null); // wallet app being "opened"
  const picked = useRef(false); // the New / Existing sheet closed by a choice, not a dismiss
  const [toast, setToast] = useState("");
  const tt = useRef(null);
  const say = (t) => {
    setToast(t);
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(""), 1600);
  };
  useEffect(() => {
    if (open) {
      setD({});
      setTokenPage(false);
      setStack([]);
      setDetail(null);
      setLeaving(false);
      if (mode === "manage") {
        // Account › Whitelist addresses: straight to Manage, no token chosen yet.
        setD({ kind: "crypto", asset: "USDT" });
        setMTab("crypto");
        setStack(["manage"]);
      } else {
        // First step: how (Fiat / Crypto, Bank / On-chain) as a sheet over Home, then the token.
        setWay(null);
        picked.current = false;
        setSheet("way");
      }
    }
  }, [open]);
  const closeSheet = (name) => () => setSheet((s) => (s === name ? null : s));
  // Nothing left on screen ends the flow.
  useEffect(() => {
    if (open && !sheet && !tokenPage && !stack.length && !detail) {
      const t = setTimeout(onClose, 320);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, sheet, tokenPage, stack, detail]);
  const finish = () => {
    setDetail(null);
    setStack([]);
    setTokenPage(false);
  };
  const fiat = d.kind === "fiat";
  // The New-address page: network preset when the token has only one.
  const toAmount = () => {
    const nets = NETWORKS[d.asset] || [];
    setD((x) => ({ ...x, net: fiat ? "bank" : nets.length === 1 ? nets[0][0] : null }));
    setStack((s) => [...s.filter((x) => x !== "amount"), "amount"]);
  };
  const pop = () => {
    if (stack[stack.length - 1] === "amount" && savedD.current) {
      setD(savedD.current);
      savedD.current = null;
    }
    setStack((s) => s.slice(0, -1));
  };
  // Manage › Bank accounts › Add bank account: the first deposit from an own-name
  // account whitelists it (same as Add bank account on Select bank account).
  const addBank = () => {
    if (fiat) return toAmount();
    savedD.current = d;
    setD({ kind: "fiat", asset: "HKD", net: "bank" });
    return setStack((s) => [...s.filter((x) => x !== "amount"), "amount"]);
  };
  const push = (pg) => setStack((s) => [...s.filter((x) => x !== pg), pg]);
  const startAdd = (method) => {
    const nets = NETWORKS[d.asset] || [];
    setWl({ remarks: "", addr: "", wallet: null, method });
    setD((x) => ({ ...x, net: nets[0]?.[0] ?? null }));
    push(method === "connect" ? "connect" : "addr");
  };
  // Security passed: the address joins the list, back to Select wallet.
  const whitelist = () => {
    setSheet(null);
    const w = {
      id: `n${Date.now()}`,
      label: wl.remarks.trim() || (wl.wallet ? WALLET[wl.wallet].name : "Wallet"),
      net: d.net,
      addr: wl.method === "connect" ? DEMO_ADDR[d.net] : wl.addr,
      // Ownership proven by WalletConnect / signature: both whitelists.
      withdraw: true,
      coolUntil: Date.now() + COOL_HOURS * 3600e3, // newly whitelisted: withdrawal cool-down
      isNew: true,
    };
    setBook((b) => [w, ...b.map((x) => ({ ...x, isNew: false }))]);
    setTimeout(() => {
      // Back to where Add started: Manage, else Select address.
      setStack((s) => (s.includes("manage") ? s.slice(0, s.indexOf("manage") + 1) : ["list"]));
      say("Address added");
    }, 280);
  };
  const setWithdraw = (on) => {
    const id = wdFor.id;
    setSheet(null);
    setBook((b) => b.map((x) => (x.id === id ? { ...x, withdraw: on } : x)));
    setTimeout(() => {
      setDone("Address setting updated");
      setTimeout(() => setDone(""), 1600);
    }, 280);
  };
  const slideOut = (sel, then) => {
    document.querySelector(sel)?.classList.add("is-leaving");
    setTimeout(then, 240);
  };
  if (!open) return null;
  return (
    <>
      <PhoneLayer className="oc-layer dp-layer">
        {tokenPage && (
          <TokenPage
            value={d.asset}
            kind={way}
            onBack={() => {
              // Back to the first step's sheet
              setTokenPage(false);
              picked.current = false;
              setSheet("way");
            }}
            title={withdraw ? "Withdraw" : "Deposit"}
            heads={withdraw ? W_HEADS : HEADS}
            onPick={(k, c) => {
              picked.current = false;
              setD({ kind: k, asset: c });
              if (withdraw) setStack(["list"]);
              else setSheet("source");
            }}
          />
        )}
        {stack.includes("list") && (
          <ListPage
            d={d}
            book={book}
            withdraw={withdraw}
            onDeclare={(w) => {
              // Declare right here, no detour through Manage
              setWdFor(w);
              setSheet("declare");
            }}
            onBack={pop}
            onManage={() => {
              setMTab(fiat ? "bank" : "crypto");
              push("manage");
            }}
            onPick={(w) => {
              if (!withdraw) return setDetail({ ...d, from: w });
              if (isCooling(w)) return say(`Available for withdrawal in ${fmtLeft(w.coolUntil - Date.now())}`);
              if (w.withdraw === false) return say("Declare the wallet ownership for withdrawal first");
              setD((x) => ({ ...x, to: w }));
              return push("wamount");
            }}
            onAdd={() => (fiat ? toAmount() : setSheet("method"))}
          />
        )}
        {stack.includes("manage") && (
          <ManagePage
            book={book}
            tab={mTab}
            setTab={setMTab}
            onAddBank={addBank}
            onBack={pop}
            onAdd={() => setSheet("method")}
            say={say}
            onWithdraw={(w) => {
              setWdFor(w);
              setSheet(w.withdraw ? "disable" : "declare");
            }}
          />
        )}
        {stack.includes("wamount") && (
          <WAmountPage
            key={`${d.asset}-${d.to?.id}`}
            ls={labelStyle}
            d={d}
            onBack={pop}
            onNext={(v) => {
              setD((x) => ({ ...x, amount: v }));
              push("wreview");
            }}
          />
        )}
        {stack.includes("wreview") && <WReviewPage d={d} onBack={pop} onConfirmed={() => push("wdone")} />}
        {stack.includes("wdone") && <WResultPage onDone={finish} />}
        {stack.includes("amount") && (
          <AmountPage
            key={d.asset}
            ls={labelStyle}
            d={d}
            sheet={sheet}
            onPickNet={() => setSheet("network")}
            onBack={(dirty) => (dirty ? setLeaving(true) : slideOut(".dp-page.is-amount", pop))}
            onConfirmed={(r) => setDetail({ ...d, ...r, from: null })}
          />
        )}
        {stack.includes("connect") && (
          <ConnectPage
            d={d}
            ls={labelStyle}
            sheet={sheet}
            onPickAsset={() => setSheet("asset")}
            onPickNet={() => setSheet("network")}
            onBack={pop}
            onConnect={() => setSheet("wallets")}
            remarks={wl.remarks}
            setRemarks={(v) => setWl((x) => ({ ...x, remarks: v }))}
          />
        )}
        {stack.includes("addr") && (
          <AddrPage
            d={d}
            ls={labelStyle}
            sheet={sheet}
            onPickAsset={() => setSheet("asset")}
            onPickNet={() => setSheet("network")}
            onBack={pop}
            onNext={() => push("sign")}
            remarks={wl.remarks}
            setRemarks={(v) => setWl((x) => ({ ...x, remarks: v }))}
            addr={wl.addr}
            setAddr={(v) => setWl((x) => ({ ...x, addr: v }))}
          />
        )}
        {stack.includes("sign") && <SignPage addr={wl.addr} onBack={pop} onHow={() => setSheet("how")} onSubmit={() => setSheet("security")} say={say} />}
        {wapp && (
          <WalletApp
            k={wapp}
            onCancel={() => setWapp(null)}
            onConnect={() => {
              setWapp(null);
              setTimeout(() => setSheet("security"), 200);
            }}
          />
        )}
        {detail && <DetailPage d={detail} onDone={finish} say={say} />}
      </PhoneLayer>
      <TokenSheet
        open={sheet === "way"}
        title={withdraw ? "Withdraw" : "Deposit"}
        value={null}
        onPick={(k) => {
          picked.current = true;
          setWay(k);
          setD({});
          setTokenPage(true);
        }}
        onClose={() => {
          picked.current = false;
          setSheet((s) => (s === "way" ? null : s)); // dismissed without a choice: the flow ends
        }}
        options={
          withdraw
            ? [
                { value: "fiat", label: "Bank withdrawal" },
                { value: "crypto", label: "On-chain withdrawal" },
              ]
            : [
                { value: "fiat", label: "Fiat" },
                { value: "crypto", label: "Crypto" },
              ]
        }
      />
      <TokenSheet
        open={sheet === "source"}
        title="Deposit from"
        value={null}
        onPick={(k) => {
          picked.current = true;
          if (k === "new") toAmount();
          else setStack(["list"]);
        }}
        onClose={() => {
          // Dismissed without choosing: the token goes back to unselected.
          if (!picked.current) setD((x) => ({ kind: x.kind }));
          picked.current = false;
          setSheet((s) => (s === "source" ? null : s));
        }}
        options={[
          {
            value: "new",
            label: fiat ? "New bank account" : "New address",
            name: fiat ? "Must be in your own name; whitelisted after the first deposit" : "Verified with a small extra amount, then whitelisted",
          },
          {
            value: "existing",
            label: fiat ? "Whitelisted bank account" : "Existing address",
            name: `${listFor(d.asset, book).length} whitelisted`,
          },
        ]}
      />
      <TokenSheet
        open={sheet === "network"}
        title="Select network"
        value={d.net}
        onPick={(n) => setD((x) => ({ ...x, net: n }))}
        onClose={closeSheet("network")}
        options={(NETWORKS[d.asset] || []).map(([k, name, conf]) => ({ value: k, label: name, name: `Arrives after ${conf}` }))}
      />
      <TokenSheet
        open={sheet === "method"}
        title="Add address"
        value={null}
        onPick={(m) => {
          picked.current = true;
          if (m === "small") toAmount();
          else startAdd(m);
        }}
        onClose={closeSheet("method")}
        options={[
          { value: "small", icon: <MethodIcon k="small" />, label: "Small-amount verification", name: "Deposit with a small extra amount; whitelisted when it arrives" },
          { value: "connect", icon: <MethodIcon k="connect" />, label: "WalletConnect", name: "Connect your wallet app to prove you own the address" },
          { value: "sign", icon: <MethodIcon k="sign" />, label: "Signature verification", name: "Sign a message in your wallet and paste the result" },
        ]}
      />
      <TokenSheet
        open={sheet === "wallets"}
        title="Connect wallet"
        note="If you don’t have a wallet yet, you can select a provider and create one now."
        value={null}
        onPick={(k) => {
          setWl((x) => ({ ...x, wallet: k }));
          setTimeout(() => setWapp(k), 250);
        }}
        onClose={closeSheet("wallets")}
        options={WALLETS.map(([k, name]) => ({ value: k, label: name, icon: <WalletBadge k={k} />, name: "Installed" }))}
      />
      <TokenSheet
        open={sheet === "asset"}
        title="Select asset"
        value={d.asset}
        onPick={(c) => {
          if (c === d.asset) return;
          const nets = NETWORKS[c] || [];
          setD((x) => ({ ...x, asset: c, net: nets[0]?.[0] ?? null }));
          setWl((x) => ({ ...x, addr: "" }));
        }}
        onClose={closeSheet("asset")}
        options={KINDS.crypto.assets.map((c) => ({ value: c, label: c, icon: <Icon c={c} />, name: CCY[c].name, tag: CCY[c].pi ? "PI" : undefined }))}
      />
      <HowSheet open={sheet === "how"} onClose={closeSheet("how")} />
      {/* Security codes are account-security, not trading: floating label (library Floating Input), like sign up / sign in. */}
      <SecuritySheet ls="float" open={sheet === "security"} onClose={closeSheet("security")} onSubmit={whitelist} />
      <DeclareSheet w={wdFor} open={sheet === "declare"} onClose={closeSheet("declare")} onConfirm={() => setWithdraw(true)} />
      <DisableSheet open={sheet === "disable"} onClose={closeSheet("disable")} onConfirm={() => setWithdraw(false)} />
      <LeaveSheet
        open={leaving}
        onStay={() => setLeaving(false)}
        onLeave={() => {
          setLeaving(false);
          slideOut(".dp-page.is-amount", pop);
        }}
      />
      <PhoneLayer className="dp-toast-layer">
        {toast && (
          <div className="dp-toast" role="status">
            {toast}
          </div>
        )}
        {done && (
          <div className="dp-toast-c" role="status">
            <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
              <circle cx="15" cy="15" r="13.5" fill="none" stroke="#fff" strokeWidth="1.5" />
              <path d="M9.5 15.3l3.8 3.7 7.2-7.6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {done}
          </div>
        )}
      </PhoneLayer>
    </>
  );
}
