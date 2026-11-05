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
const ListPage = ({ d, added = [], onBack, onPick, onAdd }) => {
  const fiat = d.kind === "fiat";
  const list = [...added, ...(WHITELIST[d.asset] || [])];
  return (
    <div className="oc-screen oc-page dp-page is-list">
      <AppBar title={fiat ? "Select bank account" : "Select wallet"} onBack={onBack} />
      <div className="oc-page-body dp-body">
        <p className="dp-lead">Choose where you’ll send {d.asset} from.</p>
        <div className="dp-list">
          {list.map((w) => (
            <button key={w.id} type="button" className={`dp-cell${w.isNew ? " is-new" : ""}`} onClick={() => onPick(w)}>
              {w.net === "bank" ? (
                <span className="dp-cell-text">
                  <b>{w.label}</b>
                  <small>{w.addr}</small>
                </span>
              ) : (
                /* Wallet: the full address is the title; name + network underneath */
                <span className="dp-cell-text is-addr">
                  <b className="dp-cell-addr">{w.addr}</b>
                  <small>
                    {w.label}
                    <span className="dp-tag">{w.net}</span>
                    {w.isNew && <span className="dp-tag is-new">Just added</span>}
                  </small>
                </span>
              )}
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
  TRC20: "TJ4r8qWm2Xc7Vb3Nk9Lp5Hd6Ys1FgPQa8z",
  SOL: "5YNmS1R9nNSCDzb5a7mMJ1dwK9uHeAAF4CmPEwKgVWr8",
};
const ADDR_RE = {
  BTC: /^(bc1[02-9ac-hj-np-z]{25,60}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/,
  ERC20: /^0x[0-9a-fA-F]{40}$/,
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
const TextField = ({ ls = "ifta", id, label, value, onChange, placeholder = "", hint, error, disabled, action, onBlur, inputProps = {} }) => {
  const [focused, setFocused] = useState(false);
  const up = ls !== "float" || focused || value !== "";
  const box = (
    <span className={`dp-tf-box${action ? " has-action" : ""}`}>
      {ls === "ifta" && (
        <label className="dp-tf-label" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        id={id}
        className="dp-tf-input"
        value={value}
        disabled={disabled}
        placeholder={ls === "float" && !up ? "" : placeholder}
        onChange={(e) => onChange(e.target.value)}
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
export default function DepositFlow({ open, onClose, labelStyle = "ifta" }) {
  const [sheet, setSheet] = useState(null); // source | network
  const [d, setD] = useState({});
  const [tokenPage, setTokenPage] = useState(false);
  const [stack, setStack] = useState([]); // pages over the token page: "list", "amount"
  const [detail, setDetail] = useState(null);
  const [leaving, setLeaving] = useState(false);
  const [added, setAdded] = useState({}); // asset → wallets whitelisted in this session
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
      isNew: true,
    };
    setAdded((a) => ({ ...a, [d.asset]: [w, ...(a[d.asset] || []).map((x) => ({ ...x, isNew: false }))] }));
    setTimeout(() => {
      setStack(["list"]);
      say("Address added");
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
            onBack={() => setTokenPage(false)}
            onPick={(k, c) => {
              picked.current = false;
              setD({ kind: k, asset: c });
              setSheet("source");
            }}
          />
        )}
        {stack.includes("list") && (
          <ListPage d={d} added={added[d.asset]} onBack={pop} onPick={(w) => setDetail({ ...d, from: w })} onAdd={() => (fiat ? toAmount() : setSheet("method"))} />
        )}
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
      <TokenSheet
        open={sheet === "method"}
        title="Add new wallet"
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
      <SecuritySheet ls={labelStyle} open={sheet === "security"} onClose={closeSheet("security")} onSubmit={whitelist} />
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
