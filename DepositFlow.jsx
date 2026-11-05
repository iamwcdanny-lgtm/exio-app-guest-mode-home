import React, { useEffect, useRef, useState } from "react";
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
  ETH: [["ERC20", "Ethereum (ERC20)", "12 confirmations"]],
  USDT: [
    ["ERC20", "Ethereum (ERC20)", "12 confirmations"],
    ["TRC20", "Tron (TRC20)", "20 confirmations"],
  ],
  USDC: [
    ["ERC20", "Ethereum (ERC20)", "12 confirmations"],
    ["SOL", "Solana", "32 confirmations"],
  ],
};
const NET = Object.fromEntries(Object.values(NETWORKS).flat().map(([k, name, conf]) => [k, { name, conf }]));
// EXIO's deposit address per network (placeholders).
const EXIO_ADDR = {
  BTC: "bc1q8c6fshw2dlwun7ekn9qwf37cu2rn755upcp6el",
  ERC20: "0x4F3a9C21b7E05d6A8e1f2C3D4b5A6978e0dC1a2B",
  TRC20: "TXq7nQ2bV9wK3sL5mP8rD4fH6jC1yU0aZe",
  SOL: "8FzR3kWq2nVb6YtL9pXc4sMd7hJg1eUa5oKi2NwQbTzR",
};
const WHITELIST = {
  BTC: [{ id: "w1", label: "Ledger Nano X", net: "BTC", addr: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh" }],
  ETH: [{ id: "w2", label: "Ledger Nano X", net: "ERC20", addr: "0x7a3B5c8D9e0F1a2b3C4d5E6f7A8b9C0d1E2fC91e" }],
  USDT: [
    { id: "w3", label: "Ledger Nano X", net: "ERC20", addr: "0x7a3B5c8D9e0F1a2b3C4d5E6f7A8b9C0d1E2fC91e" },
    { id: "w4", label: "Binance", net: "TRC20", addr: "TQ9mFz2Rk7Lb4Wn8Yc1Vd5Hs3Jt6Gp0kLp" },
  ],
  USDC: [{ id: "w5", label: "Ledger Nano X", net: "ERC20", addr: "0x7a3B5c8D9e0F1a2b3C4d5E6f7A8b9C0d1E2fC91e" }],
  USD: [
    { id: "b1", label: "HSBC Hong Kong", net: "bank", addr: "···· 4821" },
    { id: "b2", label: "Bank of China (Hong Kong)", net: "bank", addr: "···· 0937" },
  ],
  HKD: [{ id: "b3", label: "HSBC Hong Kong", net: "bank", addr: "···· 4821" }],
};
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
const AppBar = ({ title, onBack, slide = true }) => (
  <header className="oc-appbar">
    <button type="button" className="oc-back" aria-label="Back" onClick={(e) => (slide ? slideBack(e, onBack) : onBack())}>
      <BackIcon />
    </button>
    <h1>{title}</h1>
    <span />
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
const Picker = ({ label, open, onOpen, children, ls = "ifta" }) => {
  const btn = (
    <button type="button" className={`oc-xpick dp-pick is-${ls}${open ? " is-open" : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-label={ls === "trad" ? label : undefined} onClick={onOpen}>
      {ls !== "trad" && <span className="otc-label">{label}</span>}
      <span className="oc-xpick-row">
        {children}
        <img className="sel-caret" src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" />
      </span>
    </button>
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
const ListPage = ({ d, onBack, onPick, onAdd }) => {
  const fiat = d.kind === "fiat";
  const list = WHITELIST[d.asset] || [];
  return (
    <div className="oc-screen oc-page dp-page is-list">
      <AppBar title={fiat ? "Select bank account" : "Select wallet"} onBack={onBack} />
      <div className="oc-page-body dp-body">
        <p className="dp-lead">Choose where you’ll send {d.asset} from.</p>
        <div className="dp-list">
          {list.map((w) => (
            <button key={w.id} type="button" className="dp-cell" onClick={() => onPick(w)}>
              <span className="dp-cell-text">
                <b>
                  {w.label}
                  {w.net !== "bank" && <span className="dp-tag">{w.net}</span>}
                </b>
                <small>{w.net === "bank" ? w.addr : short(w.addr)}</small>
              </span>
              <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-chev" />
            </button>
          ))}
          {!list.length && <p className="dp-empty">No whitelisted {fiat ? "bank accounts" : "addresses"} for {d.asset} yet.</p>}
        </div>
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-outline" onClick={onAdd}>
          {fiat ? "Add new bank account" : "Add new wallet"}
        </button>
      </div>
    </div>
  );
};

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

/* ---------- Token selection (page) ---------- */
const TokenPage = ({ value, onBack, onPick }) => {
  const [q, setQ] = useState("");
  // Deposits land in the Custody account, so each cell shows that balance.
  const bal = useOtc().s.bal.custody;
  const term = q.trim().toLowerCase();
  const sections = Object.entries(KINDS)
    .map(([k, v]) => [k, v, v.assets.filter((c) => (c + CCY[c].name).toLowerCase().includes(term))])
    .filter(([, , list]) => list.length);
  return (
    <div className="oc-screen oc-page dp-page is-token">
      <AppBar title="Deposit" onBack={onBack} />
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
              {v.label}
              {k === "fiat" && <span>By bank transfer</span>}
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

/* ---------- The flow ---------- */
export default function DepositFlow({ open, onClose, labelStyle = "ifta" }) {
  const [sheet, setSheet] = useState(null); // source | network
  const [d, setD] = useState({});
  const [tokenPage, setTokenPage] = useState(false);
  const [stack, setStack] = useState([]); // pages over the token page: "list", "amount"
  const [detail, setDetail] = useState(null);
  const [leaving, setLeaving] = useState(false);
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
      setTokenPage(true);
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
  const pop = () => setStack((s) => s.slice(0, -1));
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
            onBack={() => setTokenPage(false)}
            onPick={(k, c) => {
              picked.current = false;
              setD({ kind: k, asset: c });
              setSheet("source");
            }}
          />
        )}
        {stack.includes("list") && <ListPage d={d} onBack={pop} onPick={(w) => setDetail({ ...d, from: w })} onAdd={toAmount} />}
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
        {detail && <DetailPage d={detail} onDone={finish} say={say} />}
        {toast && (
          <div className="dp-toast" role="status">
            {toast}
          </div>
        )}
      </PhoneLayer>
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
            name: `${(WHITELIST[d.asset] || []).length} whitelisted`,
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
      <LeaveSheet
        open={leaving}
        onStay={() => setLeaving(false)}
        onLeave={() => {
          setLeaving(false);
          slideOut(".dp-page.is-amount", pop);
        }}
      />
    </>
  );
}
