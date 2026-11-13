import jazzicon from "@metamask/jazzicon";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import PhoneLayer from "./PhoneLayer";
import TokenSheet from "./TokenSheet";
import { CCY, IMG, fmtDp, fmtCcy, useOtc } from "./OtcSession";
import { slideBack, leavePage } from "./backOut";
import { VerifySheet, VerifySteps } from "./PasskeySetup";
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
  // No remark: the cell shows the first 6 / last 6 as its title (one per network)
  { id: "u1", withdraw: true, label: "", net: "BTC", addr: "bc1qdvkfhu9t94xuft3zh7jkndgakm87gqujwgu0zp" },
  { id: "u2", withdraw: true, label: "", net: "ERC20", addr: "0x5D6ca5bDDFAB7E5EF94feedDe783c747Dc9D4754" },
  { id: "u3", withdraw: true, label: "", net: "Arbitrum", addr: "0xEF2DAbDAE9A2da5bAfFC315B88576AC469DB17b9" },
  { id: "u4", withdraw: true, label: "", net: "Base", addr: "0xDad597714bdE83bc86aCca2BE99aDd48DA7B2Bab" },
  { id: "u5", withdraw: true, label: "", net: "TRC20", addr: "ToX6sJxm7RQjcqig7HXx7fz1jF3wikAgaf" },
  { id: "u6", withdraw: true, label: "", net: "SOL", addr: "XqPHSq7vrSKw2iHjNaUohETdyonhnikMfACEFKVC1XvD" },
];
const BANKS = {
  USD: [
    { id: "b1", label: "HSBC Hong Kong", net: "bank", addr: "···· 4821" },
    { id: "b2", label: "Bank of China (Hong Kong)", net: "bank", addr: "···· 0937" },
  ],
  HKD: [{ id: "b3", label: "HSBC Hong Kong", net: "bank", addr: "···· 4821" }],
};
// The user's own-name bank accounts, once each (one account can hold several currencies).
// Details shown when a Manage cell opens (Figma 17286:57264; placeholders).
const MY_BANKS = [
  { id: "b1", label: "HSBC Hong Kong", addr: "···· 4821", ccy: ["USD", "HKD"], no: "004-512-834821", bank: "The Hongkong and Shanghai Banking Corporation Limited", code: "004", swift: "HSBCHKHHHKH", holder: "Chan Tai Man" },
  { id: "b2", label: "Bank of China (Hong Kong)", addr: "···· 0937", ccy: ["USD"], no: "012-875-2-140937", bank: "Bank of China (Hong Kong) Limited", code: "012", swift: "BKCHHKHHXXX", holder: "Chan Tai Man" },
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
// Address name (2026-11-11): the remark if there is one, else the first 6 and last 6 of the address
const head6 = (a) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a);
const nameOf = (w) => w.label || head6(w.addr);
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
// close: first page of a page sheet; the button closes the sheet (X) instead of going back
const XIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="rgba(0,0,0,0.8)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const AppBar = ({ title, onBack, slide = true, right = null, close = false }) =>
  close ? (
    <header className="oc-appbar">
      <span />
      <h1>{title}</h1>
      <button type="button" className="oc-back is-close" aria-label="Close" onClick={() => onBack()}>
        <XIcon />
      </button>
    </header>
  ) : (
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

// Minimum deposit per asset (demo placeholders; Figma 20015:58639 shows 0.01 ETH)
const MIN_DEP = { BTC: 0.0005, ETH: 0.01, USDT: 10, USDC: 10 };
const AmountPage = ({ d, sheet, onPickNet, onBack, onConfirmed, ls = "ifta", netFixed = false, close = false, initAmt = "", focusKey = 0 }) => {
  const c = d.asset;
  const fiat = d.kind === "fiat";
  const [amt, setAmt] = useState(initAmt);
  const [locked, setLocked] = useState(false); // fiat: amount locked on the page
  const [ask, setAsk] = useState(false); // crypto: "Deposit the amount" confirmation sheet
  const [focused, setFocused] = useState(false);
  const [ver, setVer] = useState(() => makeVer(c));
  const ref = useRef(null);
  // Modify amount (from the deposit address page): focus the amount once the page is back in view
  useEffect(() => {
    if (!focusKey) return undefined;
    const t = setTimeout(() => ref.current?.focus(), 320);
    return () => clearTimeout(t);
  }, [focusKey]);
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
  const min = fiat ? 0 : MIN_DEP[c] || 0;
  const under = v > 0 && v < min; // below the minimum deposit: can't confirm
  const confirm = () => {
    if (!v || under) return;
    setVer(makeVer(c)); // a fresh tail each time the amount is set
    ref.current?.blur();
    // Crypto (Figma 20044:58640): confirm in a bottom sheet, then the deposit QR page.
    // Dismissing the sheet = keep editing the amount.
    if (fiat) setLocked(true);
    else setAsk(true);
  };
  return (
    <div className="oc-screen oc-page dp-page is-amount">
      <AppBar title={`Deposit ${c}`} onBack={(e) => onBack(amt !== "" || locked)} slide={false} close={close} />
      <div className={`oc-page-body dp-body otc otc-style-${ls}`}>
        {!fiat && (
          <Picker ls={ls} label="Network" open={sheet === "network"} onOpen={onPickNet} fixed={netFixed}>
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
        {!fiat && (
          <div className={`dp-row is-min${under ? " is-under" : ""}`}>
            <span>Min. deposit</span>
            <b>
              {min} {c}
            </b>
          </div>
        )}
        {/* Crypto: Confirm amount sits in the bottom CTA bar */}
        {fiat &&
          (locked ? (
            <button type="button" className="oc-btn is-outline dp-amt-btn" onClick={() => setLocked(false)}>
              Modify
            </button>
          ) : (
            <button type="button" className="oc-btn is-primary dp-amt-btn" disabled={!v || noNet} onClick={confirm}>
              Confirm amount
            </button>
          ))}
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
        {!fiat && (
          <div className="dp-note has-icon">
            <WarnIcon />
            <span>
              Upon successful deposit, your address will only be added to the deposit whitelist. Should you wish to whitelist your address for withdrawals, you can add it in
              Account › Addresses &amp; bank accounts.
            </span>
          </div>
        )}
      </div>
      {locked && (
        <div className="oc-foot dp-foot">
          <SlideToConfirm onDone={() => onConfirmed({ amount: v, ver: vv, total, tdp })} />
        </div>
      )}
      {!fiat && (
        <div className="oc-foot dp-foot">
          <button type="button" className="oc-btn is-primary" disabled={!v || under || noNet} onClick={confirm}>
            Confirm amount
          </button>
        </div>
      )}
      {!fiat && (
        <DepAmountSheet
          open={ask}
          c={c}
          amount={v}
          ver={ver}
          total={total}
          tdp={tdp}
          onClose={() => setAsk(false)}
          onConfirm={() => {
            setAsk(false);
            onConfirmed({ amount: v, ver: vv, total, tdp });
          }}
        />
      )}
    </div>
  );
};

// "Deposit the amount" sheet (Figma 20044:58640): total, breakdown, warning, acknowledgement.
const DepAmountSheet = ({ open, c, amount, ver, total, tdp, onClose, onConfirm }) => {
  const [agree, setAgree] = useState(false);
  useEffect(() => {
    if (open) setAgree(false);
  }, [open]);
  return (
    <BaseSheet open={open} onClose={onClose} title="Deposit the amount" className="dp-depamt">
      <div className="dp-depamt-total">
        <span>Total deposit amount (verification amount included)</span>
        <b>
          {fmtDp(total, tdp)} <em>{c}</em>
        </b>
      </div>
      <div className="dp-depamt-rows">
        <div className="dp-row">
          <span>Deposit amount</span>
          <b>
            {fmtDp(amount, dpOf(c))} {c}
          </b>
        </div>
        <div className="dp-row">
          <span>Verification amount</span>
          <b>
            {fmtDp(ver, verDp(c))} {c}
          </b>
        </div>
      </div>
      <div className="dp-note has-icon">
        <WarnIcon />
        <span>Please only deposit the above specified amount; otherwise, the deposit will fail, and relevant refund fees may be incurred.</span>
      </div>
      <button type="button" role="checkbox" aria-checked={agree} className="dp-agree" tabIndex={open ? 0 : -1} onClick={() => setAgree((a) => !a)}>
        <Check on={agree} />
        <span>
          I confirm that I will only deposit virtual assets from a wallet for which I hold the private keys, and I understand that depositing from wallets I do not fully
          control, such as exchange wallets, may result in refund fees.
        </span>
      </button>
      <div className="dp-leave-btns">
        <button type="button" className="oc-btn is-primary" disabled={!agree} tabIndex={open ? 0 : -1} onClick={onConfirm}>
          Confirm
        </button>
      </div>
    </BaseSheet>
  );
};

// Modify amount from the deposit QR page: the old total stops matching.
const ModifyAmtSheet = ({ open, onClose, onConfirm }) => (
  <PhoneLayer className="tks-layer">
    <div className={`tks-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
    <div className={`tks-sheet dp-disable${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="dp-modamt-title" aria-hidden={!open}>
      <span className="tks-grab" aria-hidden="true" />
      <img src={`${IMG}/result-warning.png`} width="120" height="120" alt="" />
      <h2 id="dp-modamt-title">Modify the amount?</h2>
      <p>If you’ve already sent the deposit, don’t change the amount. A new amount comes with a new verification amount, so a deposit of the current total will fail, and refund fees may be incurred.</p>
      <div className="dp-leave-btns">
        <button type="button" className="oc-btn is-primary" tabIndex={open ? 0 : -1} onClick={onConfirm}>
          Modify amount
        </button>
        <button type="button" className="oc-btn is-outline" tabIndex={open ? 0 : -1} onClick={onClose}>
          Keep this amount
        </button>
      </div>
    </div>
  </PhoneLayer>
);

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

/* ---------- Split network screens (Figma Xirry 3195:8428 deposit, 3218:7390 withdraw) ---------- */
// Grey card naming the asset and its network, at the top of each step after the network.
const AssetCard = ({ c, net }) => (
  <div className="dp-asset">
    <Icon c={c} />
    <span>
      <b>{c}</b>
      {net && NET[net] && <small>{NET[net].name}</small>}
    </span>
  </div>
);
// action: a link at the right end of the title line (e.g. Manage)
const SecHead = ({ title, sub, action = null }) => (
  <div className="dp-sechead">
    <div className="dp-sechead-top">
      <h2>{title}</h2>
      {action}
    </div>
    {sub && <p>{sub}</p>}
  </div>
);
const PlusGlyph = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 4.5v11M4.5 10h11" stroke="#00a874" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const Chev = () => <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-chev" />;

// Address avatar: Jazzicon seeded by a SHA-256 hash of the whole address (not MetaMask's
// first-8-hex seed), so changing any character changes the pattern; a look-alike address
// that only copies the start and end gets a different avatar. EVM addresses are
// case-insensitive, so they are lower-cased first. Same 32px size and left position as the
// token icon.
const jazzSeeds = new Map();
const jazzSeed = async (a) => {
  const key = /^0x/i.test(a) ? a.toLowerCase() : a;
  if (!jazzSeeds.has(key)) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    jazzSeeds.set(key, new DataView(buf).getUint32(0)); // first 4 bytes of the hash
  }
  return jazzSeeds.get(key);
};
const AddrAvatar = ({ a }) => {
  const ref = useRef(null);
  useEffect(() => {
    let live = true;
    jazzSeed(a).then((seed) => {
      if (live && ref.current) ref.current.replaceChildren(jazzicon(32, seed));
    });
    return () => {
      live = false;
    };
  }, [a]);
  return <span ref={ref} className="dp-av" aria-hidden="true" />;
};

// Address cell (Select a sending / withdrawal address): full address as the title (first and
// last 6 dark), network tag only in Mix network (Split: the list is one network), then the label.
const AddrCellBody = ({ w, split, chev = true }) => (
  <>
    <AddrAvatar a={w.addr} />
    <span className="dp-mcell-title">
      <b>{nameOf(w)}</b>
    </span>
    {/* Arrow centred on the whole cell */}
    {chev && <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-mcell-chev is-right is-mid" />}
    <small className="dp-mcell-addr">
      <FullAddr a={w.addr} />
    </small>
    {(!split || w.isNew) && (
      <span className="dp-mcell-sub">
        {!split && <span className="dp-tag is-wl is-net">{NET[w.net].name}</span>}
        {w.isNew && <span className="dp-tag is-new">Just added</span>}
      </span>
    )}
  </>
);

// Deposit · Select a sending address: saved addresses on this network, then "Use a new address".
// "Or" divider between the direct-deposit option and the saved addresses (split v2)
const OrDivider = () => (
  <div className="dp-or" role="separator">
    <span>Or</span>
  </div>
);
// Split v2: "Add whitelist address" text button 16px under the last address
const AddWlLink = ({ onClick, label = "Add whitelist address" }) => (
  <button type="button" className="dp-text-btn is-addwl" onClick={onClick}>
    {label}
  </button>
);
const SendAddrPage = ({ d, book, onBack, onPick, onAdd, onManage, v2 = false, onDirect }) => {
  const list = listFor(d.asset, book).filter((w) => w.net === d.net);
  return (
    <div className="oc-screen oc-page dp-page is-send">
      <AppBar title="Deposit from" onBack={onBack} />
      <div className="oc-page-body dp-body">
        {v2 && (
          <>
            {/* Split v2: deposit straight from a new address (small amount verification) */}
            <button type="button" className="dp-opt" onClick={onDirect}>
              <MethodIcon k="small" />
              <span className="dp-opt-text">
                <b>Directly deposit from new address</b>
                <small>Deposit with a small extra amount; whitelisted when it arrives</small>
              </span>
              <Chev />
            </button>
            <OrDivider />
          </>
        )}
        <SecHead title="Saved addresses" sub={`Approved for ${NET[d.net].name}.`} />
        <div className="dp-opts">
          {list.map((w) => (
            <div key={w.id} className={`dp-mcell is-pick${w.isNew ? " is-new" : ""}`}>
              <button type="button" className="dp-mcell-top has-av" onClick={() => onPick(w)}>
                <AddrCellBody w={w} split />
              </button>
            </div>
          ))}
          {!list.length && <p className="dp-empty">No saved addresses on {NET[d.net].name} yet.</p>}
        </div>
        {v2 && <AddWlLink onClick={onAdd} />}
      </div>
      {!v2 && (
        <div className="oc-foot dp-foot">
          <button type="button" className="oc-btn is-outline" onClick={onAdd}>
            Add address
          </button>
        </div>
      )}
    </div>
  );
};

const ListPage = ({ d, book, withdraw, split, onBack, onPick, onDeclare, onAdd, onManage, v2 = false, allNets = false }) => {
  // Split v2: "Add …" text button under the list instead of a bottom CTA (bank accounts too)
  const v2w = v2 && split;
  const fiat = d.kind === "fiat";
  // Split network: the network was picked before this page, so only its addresses show.
  // Split v3 withdraw (allNets): no network step, so every network's addresses show.
  const all = listFor(d.asset, book).filter((w) => !split || fiat || allNets || w.net === d.net);
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
        title={fiat ? "Select bank account" : split ? "Withdraw to" : "Select address"}
        onBack={onBack}
      />
      <div className="oc-page-body dp-body">
        {split && !fiat ? (
          <>
<SecHead title="Whitelisted addresses" sub="Select the wallet that will receive your withdrawal." />
          </>
        ) : (
          <p className="dp-lead">
            Your whitelisted {fiat ? "bank accounts" : "addresses"} for {d.asset}
            {split && !fiat && d.net ? ` on ${NET[d.net].name}` : ""}.
          </p>
        )}
        {!fiat && (!split || allNets) && <NetPills nets={nf.nets} value={nf.net} onChange={nf.setNet} />}
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
                    <button type="button" className="dp-mcell-top has-av" onClick={() => onPick(w)}>
                      <AddrCellBody w={w} split={split && !(allNets && nf.net === "all")} chev={!blocked} />
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
        {v2w && <AddWlLink onClick={onAdd} label={fiat ? "Add bank account" : undefined} />}
      </div>
      {!v2w && (
        <div className="oc-foot dp-foot">
          <button type="button" className="oc-btn is-outline" onClick={onAdd}>
            {fiat ? "Add bank account" : "Add address"}
          </button>
        </div>
      )}
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
  // Search (2026-11-13): crypto by remark or address, bank by name or account number
  const [q, setQ] = useState("");
  useEffect(() => setQ(""), [tab]);
  const qq = q.trim().toLowerCase();
  const hit = (...xs) => !qq || xs.some((x) => String(x || "").toLowerCase().includes(qq));
  const nf = useNetFilter(book.filter((w) => hit(w.label, w.addr)));
  const banks = MY_BANKS.filter((b) => hit(b.label, b.bank, b.no, b.no.replace(/\D/g, "")));
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
      <AppBar
        title="Manage whitelist address"
        onBack={onBack}
        right={
          // Add (2026-11-11): a + in the top bar instead of a bottom CTA
          <button type="button" className="oc-back is-close" aria-label={bank ? "Add bank account" : "Add address"} onClick={bank ? onAddBank : onAdd}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" fill="none" stroke="rgba(0,0,0,0.8)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        }
      />
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
        <label className="dp-search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={bank ? "Search by bank or account number" : "Search by name or address"} aria-label="Search" />
        </label>
        {bank ? (
          <div className="dp-list">
            {!banks.length && <p className="dp-empty">No bank accounts match “{q.trim()}”.</p>}
            {/* Bank account cell (Figma 17286:57264): bank, ****last 4 + currencies; opens to the details */}
            {banks.map((b) => {
              const isOpen = open === b.id;
              return (
                <div key={b.id} className={`dp-mcell${isOpen ? " is-open" : ""}`}>
                  <button type="button" className="dp-mcell-top" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.id)}>
                    <span className="dp-mcell-title">
                      <b>{b.label}</b>
                      <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-mcell-chev" />
                    </span>
                    <span className="dp-mcell-sub">
                      <span className="dp-bank-no">****{b.no.replace(/\D/g, "").slice(-4)}</span>
                      {b.ccy.map((c) => (
                        <span key={c} className="dp-tag is-wl is-net">
                          {c}
                        </span>
                      ))}
                    </span>
                  </button>
                  <div className="dp-mcell-exp" inert={isOpen ? undefined : ""} aria-hidden={!isOpen}>
                    <div className="dp-mcell-exp-in">
                      <div className="dp-mcell-body">
                        <dl className="dp-grid">
                          <dt>Account number</dt>
                          <dd>{b.no}</dd>
                          <dt>Bank name</dt>
                          <dd>{b.bank}</dd>
                          <dt>Bank code</dt>
                          <dd>{b.code}</dd>
                          <dt>SWIFT code</dt>
                          <dd>{b.swift}</dd>
                          <dt>Account name</dt>
                          <dd>{b.holder}</dd>
                        </dl>
                        <div className="dp-mcell-btns">
                          <button type="button" className="dp-sbtn is-danger" onClick={() => say("Removing an account isn’t in this demo")}>
                            Remove account
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
        <p className="dp-info">
          <InfoIcon />
          <span>To enable withdrawals for an address, tab to open the address details and turn on the ownership confirmation switch.</span>
        </p>
        <NetPills nets={nf.nets} value={nf.net} onChange={nf.setNet} />
        <div className="dp-list">
          {qq && !nf.shown.length && <p className="dp-empty">No addresses match “{q.trim()}”.</p>}
          {nf.shown.map((w) => {
            const isOpen = open === w.id;
            return (
              <div key={w.id} className={`dp-mcell${isOpen ? " is-open" : ""}`}>
                <button type="button" className="dp-mcell-top has-av" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : w.id)}>
                  <AddrAvatar a={w.addr} />
                  <span className="dp-mcell-title">
                    <b>{nameOf(w)}</b>
                    <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-mcell-chev" />
                  </span>
                  <small className="dp-mcell-addr">
                    <FullAddr a={w.addr} />
                  </small>
                  <span className="dp-mcell-sub">
                    {/* Network tag only under "All": a network pill already says which network */}
                    {nf.net === "all" && <span className="dp-tag is-wl is-net">{NET[w.net].name}</span>}
                    <WlTags w={w} />
                  </span>
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
                      <dd>{w.label || "–"}</dd>
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
          <dd>{w.label || "–"}</dd>
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

const DetailPage = ({ d, onDone, onBack, onModify, say, split = false }) => {
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
  const [modAsk, setModAsk] = useState(false);
  // Split network, crypto (Figma Xirry "Deposit QR"): its own wording and rows.
  // A new address (any approach) uses it too: exact total on top, "Modify amount" back to the amount.
  if (!fiat && (split || fromNew))
    return (
      <div className="oc-screen oc-page dp-page is-detail">
        <AppBar title={`${c} deposit address`} onBack={onBack || onDone} />
        <div className="oc-page-body dp-body">
          {fromNew ? (
            <div className="dp-exact">
              <span>Exact total to send</span>
              <b>
                {amountStr}
                <button type="button" className="dp-copy" aria-label="Copy total deposit amount" onClick={() => copy("Amount", String(d.total.toFixed(d.tdp)))}>
                  <CopyIcon />
                </button>
              </b>
              <small>
                Includes {fmtDp(d.ver, verDp(c))} {c} for address verification. Send exactly this amount from your new address.
              </small>
              <button type="button" className="oc-btn is-outline is-sm dp-modamt" onClick={() => setModAsk(true)}>
                Modify amount
              </button>
            </div>
          ) : (
            <div className="dp-note">
              Send any amount of {c}. Use only {d.from.label ? `${d.from.label} (${head6(d.from.addr)})` : head6(d.from.addr)} on {NET[net].name}.
            </div>
          )}
          <section className="dp-card is-qr">
            <Qr text={addr} />
            <span className="dp-tag is-lg">{NET[net].name}</span>
            <p className="dp-addr">{addr}</p>
            <button type="button" className="oc-btn is-outline is-sm dp-copy-btn" onClick={() => copy("Deposit address", addr)}>
              Copy deposit address
            </button>
          </section>
          <section className="dp-card">
            <Row k="Asset" v={c} />
            <Row k="Network" v={NET[net].name} />
            <Row k="Sending address" v={fromNew ? "New address" : nameOf(d.from)} />
            <Row k="Credited to" v="Custody account" />
          </section>
        </div>
        <div className="oc-foot dp-foot">
          <button type="button" className="oc-btn is-primary" onClick={onDone}>
            Done
          </button>
        </div>
        {fromNew && (
          <ModifyAmtSheet
            open={modAsk}
            onClose={() => setModAsk(false)}
            onConfirm={() => {
              setModAsk(false);
              onModify?.();
            }}
          />
        )}
      </div>
    );
  return (
    <div className="oc-screen oc-page dp-page is-detail">
      <AppBar title={`Deposit ${c}`} onBack={onBack || onDone} />
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
              Send {c} only from {fiat || d.from.label ? <><b>{d.from.label}</b> ({fiat ? d.from.addr : head6(d.from.addr)})</> : <b>{head6(d.from.addr)}</b>}. Deposits from other {fiat ? "accounts" : "addresses"} are returned.
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
          <Row k="From" v={fromNew ? (fiat ? "New bank account" : "New address") : nameOf(d.from)} />
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
const DAILY_WD_LIMIT = 2000000; // USD, demo placeholder
// Network fee per withdrawal, in the asset (demo placeholders)
const WD_FEE = { BTC: { BTC: 0.0002 }, ETH: { ERC20: 0.002, Arbitrum: 0.0002, Base: 0.0002 }, USDT: { ERC20: 5, TRC20: 1, SOL: 1 }, USDC: { ERC20: 5, SOL: 1, Base: 1, Arbitrum: 1 } };
const wdFee = (c, net) => WD_FEE[c]?.[net] ?? 0;
// Withdrawal confirmation sheet (Figma 9897:53403): what arrives, the breakdown, and a
// slider instead of a button, so withdrawing takes a deliberate gesture.
const WdConfirmSheet = ({ open, d, amount, fee, onClose, onConfirm, say }) => {
  const c = d.asset;
  const [n, setN] = useState(0); // fresh slider each time the sheet opens
  useEffect(() => {
    if (open) setN((x) => x + 1);
  }, [open]);
  const copy = () => {
    navigator.clipboard?.writeText(d.to.addr).catch(() => {});
    say?.("Address copied");
  };
  return (
    <BaseSheet open={open} onClose={onClose} title="Withdrawal confirmation" className="dp-depamt dp-wdconf">
      <div className="dp-depamt-total">
        <span>You will receive</span>
        <b>
          {fmtCcy(amount, c)} <em>{c}</em>
        </b>
      </div>
      <div className="dp-depamt-rows">
        <div className="dp-row">
          <span>Asset</span>
          <b className="dp-wdconf-asset">
            <Icon c={c} size={16} /> {c}
          </b>
        </div>
        <div className="dp-row">
          <span>Network</span>
          <b>{NET[d.to.net].name}</b>
        </div>
        <div className="dp-row is-addr">
          <span>Address</span>
          <b>
            <span>{d.to.addr}</span>
            <button type="button" className="dp-copy" aria-label="Copy address" tabIndex={open ? 0 : -1} onClick={copy}>
              <CopyIcon />
            </button>
          </b>
        </div>
        <div className="dp-row">
          <span>Withdraw amount</span>
          <b>
            {fmtCcy(amount, c)} {c}
          </b>
        </div>
        <div className="dp-row">
          <span>Fee</span>
          <b>
            {fmtCcy(fee, c)} {c}
          </b>
        </div>
        <div className="dp-row">
          <span>Deduct amount</span>
          <b>
            {fmtCcy(amount + fee, c)} {c}
          </b>
        </div>
      </div>
      <div className="dp-wdconf-slide">{open && <SlideToConfirm key={n} label="Slide to withdraw" onDone={onConfirm} />}</div>
    </BaseSheet>
  );
};
const WAmountPage = ({ d, onBack, onNext, onConfirm, say, hasPw = true, ls = "ifta", split = false }) => {
  const c = d.asset;
  const avail = useOtc().s.bal.custody[c] || 0;
  const [amt, setAmt] = useState("");
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);
  const v = parseFloat(amt) || 0;
  const [ask, setAsk] = useState(false); // withdrawal confirmation sheet
  const [sec, setSec] = useState(false); // then security verification
  // Crypto: the network fee comes on top, so the most you can withdraw is the balance less the fee
  const fee = split && d.to.net !== "bank" ? wdFee(c, d.to.net) : 0;
  const maxWd = Math.max(0, avail - fee);
  const over = v > maxWd;
  const availEl = (
    <span className="otc-avail">
      Avail.
      <b>{fmtCcy(avail, c)}</b>
      <button type="button" className="otc-all" disabled={!maxWd} onMouseDown={(e) => e.preventDefault()} onClick={() => setAmt(clean(String(maxWd), dpOf(c)))}>
        Max
      </button>
    </span>
  );
  const label = (
    <label className="otc-label" htmlFor="wd-amt">
      Withdrawal amount
    </label>
  );
  // Split (Figma Xirry "Withdraw ETH"): To card, amount, Available + Max, Network, Review withdrawal.
  if (split && d.to.net !== "bank")
    return (
      <div className="oc-screen oc-page dp-page is-wamount">
        <AppBar title={`Withdraw ${c}`} onBack={onBack} />
        <div className={`oc-page-body dp-body otc otc-style-${ls}`}>
          <div className="dp-to">
            <span>To</span>
            <b>{nameOf(d.to)}</b>
            <small>
              <FullAddr a={d.to.addr} />
            </small>
          </div>
          <div className="otc-fields">
            <div className={`otc-amount is-pay is-up${focused ? " is-focused" : ""}${over ? " is-error" : ""}`}>
              <div
                className="otc-amount-box"
                onMouseDown={(e) => {
                  if (e.target === ref.current || e.target.closest("button")) return;
                  e.preventDefault();
                  ref.current?.focus();
                }}
              >
                {/* Available + Max inside the field, as the other amount fields */}
                <div className="otc-amount-head">
                  {label}
                  {availEl}
                </div>
                <div className="otc-amount-row">
                  <input
                    ref={ref}
                    id="wd-amt"
                    className="otc-input"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0"
                    aria-invalid={over || undefined}
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
              </div>
            </div>
            {over && (
              <p className="otc-note" aria-live="polite">
                Exceeds your available balance.
              </p>
            )}
          </div>
          {/* Limits under the field (2026-11-11) */}
          <div className="dp-lims">
            <div className="dp-row is-min">
              <span>Max. withdrawable</span>
              <b>
                {fmtCcy(maxWd, c)} <em>{c}</em>
              </b>
            </div>
            <div className="dp-row is-min">
              <span>Daily withdraw limit</span>
              <b>
                {fmtDp(DAILY_WD_LIMIT, 0)} <em>USD</em>
              </b>
            </div>
          </div>
          <div className="dp-row">
            <span>Network</span>
            <b>{NET[d.to.net].name}</b>
          </div>
        </div>
        {/* Bottom bar (Figma 9847:46092): deduct amount = amount + fee, and the CTA */}
        <div className="oc-foot dp-foot dp-deduct">
          <div className="dp-deduct-val">
            <span>Deduct amount</span>
            <b>
              {fmtCcy(v ? v + fee : 0, c)} <em>{c}</em>
            </b>
            <small>
              Fee <b>{fmtCcy(fee, c)}</b> {c}
            </small>
          </div>
          <button type="button" className="oc-btn is-primary" disabled={!v || over} onClick={() => setAsk(true)}>
            Withdraw
          </button>
        </div>
        <WdConfirmSheet
          open={ask}
          d={d}
          amount={v}
          fee={fee}
          say={say}
          onClose={() => setAsk(false)}
          onConfirm={() => {
            // let the slider finish; the sheet goes down, then security verification comes up
            setTimeout(() => {
              setAsk(false);
              setTimeout(() => setSec(true), 300);
            }, 250);
          }}
        />
        <WdSecurity open={sec} hasPw={hasPw} onClose={() => setSec(false)} onVerified={() => onConfirm(v, fee)} />
      </div>
    );
  return (
    <div className="oc-screen oc-page dp-page is-wamount">
      <AppBar title={`Withdraw ${c}`} onBack={onBack} />
      <div className={`oc-page-body dp-body otc otc-style-${ls}`}>
        <div className="dp-route">
          <span>To</span>
          <b>{nameOf(d.to)}</b>
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

const WReviewPage = ({ d, onBack, onConfirmed, split = false }) => {
  const c = d.asset;
  const bank = d.to.net === "bank";
  if (split && !bank)
    return (
      <div className="oc-screen oc-page dp-page is-wreview">
        <AppBar title="Review withdrawal" onBack={onBack} />
        <div className="oc-page-body dp-body">
          <WSummary d={d} />
        </div>
        <div className="dp-confirm">
          <div className="dp-confirm-sum">
            <span className="dp-confirm-k">Withdrawal amount</span>
            <b className="dp-confirm-v">
              {fmtCcy(d.amount, c)} {c}
            </b>
            <p className="dp-confirm-hint">Verify your identity after you confirm.</p>
          </div>
          <SlideToConfirm onDone={onConfirmed} />
        </div>
      </div>
    );
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
              {nameOf(d.to)}
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

// Asset / Network / To card (split review, verification and result).
const WSummary = ({ d, amount = false }) => (
  <section className="dp-card">
    {amount ? (
      <div className="dp-row">
        <span>Amount</span>
        <b>
          {fmtCcy(d.amount, d.asset)} {d.asset}
        </b>
      </div>
    ) : (
      <div className="dp-row">
        <span>Asset</span>
        <b>{d.asset}</b>
      </div>
    )}
    <div className="dp-row">
      <span>Network</span>
      <b>{NET[d.to.net].name}</b>
    </div>
    <div className="dp-row is-to">
      <span>To</span>
      <b>
        {nameOf(d.to)}
        <small className="dp-addr-full">{d.to.addr}</small>
      </b>
    </div>
  </section>
);

const PasskeyArt = () => (
  <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
    <circle cx="31" cy="22" r="10" stroke="rgba(0,0,0,0.85)" strokeWidth="4.5" />
    <path d="M12 58c0-10.5 8.5-19 19-19 4 0 7.7 1.2 10.8 3.4" stroke="rgba(0,0,0,0.85)" strokeWidth="4.5" strokeLinecap="round" />
    <circle cx="50" cy="44" r="7" fill="#00c08b" />
    <path d="M50 51v11M50 57h4" stroke="#00c08b" strokeWidth="4" strokeLinecap="round" />
    <circle cx="50" cy="44" r="2.2" fill="#fff" />
  </svg>
);

// Withdraw · verification (split). With a withdrawal password: password, then passkey
// (default); without one: straight to passkey. "Try another method": password + SMS +
// authenticator. Passkey is simulated: Start verification waits briefly, then passes.
// Security verification (Figma 18699:102011 / 12324:68135), as sheets over the withdraw
// amount page: withdraw password → passkey; "Try another way" = password + mobile code +
// authenticator code. Dismissing any sheet goes back to the amount page.
const EyeBtn = ({ shown, onClick, tab }) => (
  <button type="button" className="dp-eye" aria-label={shown ? "Hide password" : "Show password"} tabIndex={tab} onClick={onClick}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.8)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {shown ? (
        <>
          <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <path d="M3 10c2.2 3 5.4 4.5 9 4.5s6.8-1.5 9-4.5M6 13.4L4.5 15.5M10 14.4l-.6 2.4M14 14.4l.6 2.4M18 13.4l1.5 2.1" />
      )}
    </svg>
  </button>
);
const WdSecurity = ({ open, hasPw, onClose, onVerified }) => {
  const [step, setStep] = useState(null); // pw | passkey | other
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [sms, setSms] = useState("");
  const [ga, setGa] = useState("");
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return setStep(null);
    setPw("");
    setPw2("");
    setSms("");
    setGa("");
    setShow(false);
    setStep(hasPw ? "pw" : "passkey");
    return undefined;
  }, [open]);
  useEffect(() => {
    if (!sent) return undefined;
    const t = setTimeout(() => setSent((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [sent]);
  const digits = (v) => v.replace(/\D/g, "").slice(0, 6);
  const go = (next) => {
    clearTimeout(timer.current);
    setBusy(false);
    setStep(null);
    setTimeout(() => setStep(next), 300);
  };
  const finish = () => {
    setStep(null);
    setTimeout(onVerified, 280);
  };
  const timer = useRef(null);
  const start = () => {
    setBusy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setBusy(false);
      finish();
    }, 2000);
  };
  useEffect(() => {
    if (step === "passkey") {
      const t = setTimeout(start, 350); // once the sheet is up
      return () => clearTimeout(t);
    }
    clearTimeout(timer.current); // left the passkey sheet (another way / dismissed)
    if (step !== null) setBusy(false);
    return undefined;
  }, [step]);
  const okOther = (!hasPw || pw.length >= 6) && sms.length === 6 && ga.length === 6;
  const tab = (on) => (on ? 0 : -1);
  const another = (on) => (
    <p className="dp-another">
      Passkey not available?{" "}
      <button type="button" className="dp-text-btn" tabIndex={tab(on)} onClick={() => go("other")}>
        Try another way
      </button>
    </p>
  );
  const pwField = (id, v, set, on) => (
    <TextField
      ls="float"
      id={id}
      label="Withdraw password"
      value={v}
      onChange={set}
      inputProps={{ type: show ? "text" : "password", tabIndex: tab(on) }}
      action={<EyeBtn shown={show} tab={tab(on)} onClick={() => setShow((x) => !x)} />}
    />
  );
  return (
    <>
      <BaseSheet open={step === "pw"} onClose={onClose} title="Security verification" className="dp-sec">
        <div className="dp-sec-body dp-form is-float">{pwField("wv-pw", pw, setPw, step === "pw")}</div>
        <div className="dp-leave-btns">
          <button type="button" className="oc-btn is-primary" disabled={!pw} tabIndex={tab(step === "pw")} onClick={() => go("passkey")}>
            Verify with passkey
          </button>
          {another(step === "pw")}
        </div>
      </BaseSheet>
      {/* Passkey (Figma 18699:102076): the device prompt starts as the sheet opens */}
      <BaseSheet open={step === "passkey"} onClose={onClose} title="" className="dp-pk">
        <div className="dp-pk-body">
          <PasskeyArt />
          <h2>Complete verification with passkey</h2>
          <p>Please follow the instructions on your device to complete verification</p>
        </div>
        <div className="dp-leave-btns">
          <button type="button" className="oc-btn is-primary dp-pk-busy" aria-busy={busy} tabIndex={tab(step === "passkey")} onClick={busy ? undefined : start}>
            {busy ? (
              <>
                <span className="dp-bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                Verifying
              </>
            ) : (
              "Verify with passkey"
            )}
          </button>
          {another(step === "passkey")}
        </div>
      </BaseSheet>
      {/* Try another way (2026-11-13): SMS, then authenticator, as in Set up passkey;
          the withdraw password was already entered in the first sheet. */}
      <VerifySheet
        open={step === "other"}
        onClose={onClose}
        onDone={finish}
        lastLabel="Complete"
        extra={
          <p className="dp-another pk-another">
            Passkey available?{" "}
            <button type="button" className="dp-text-btn" tabIndex={step === "other" ? 0 : -1} onClick={() => go("passkey")}>
              Verify with passkey
            </button>
          </p>
        }
      />
    </>
  );
};
const WVerifyPage = ({ d, hasPw, onBack, onVerified, ls = "ifta" }) => {
  const [step, setStep] = useState(null); // pw | passkey | other
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [sms, setSms] = useState("");
  const [ga, setGa] = useState("");
  const [sent, setSent] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStep(hasPw ? "pw" : "passkey"), 60); // slide the first sheet up
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!sent) return undefined;
    const t = setTimeout(() => setSent((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [sent]);
  const digits = (v) => v.replace(/\D/g, "").slice(0, 6);
  const start = () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setStep(null);
      setTimeout(onVerified, 280);
    }, 1200);
  };
  const other = () => {
    setStep(null);
    setTimeout(() => setStep("other"), 300);
  };
  const okOther = pw2.length >= 6 && sms.length === 6 && ga.length === 6;
  const tab = (on) => (on ? 0 : -1);
  return (
    <div className="oc-screen oc-page dp-page is-wverify">
      <AppBar title="Verify withdrawal" onBack={onBack} />
      <div className="oc-page-body dp-body">
        <WSummary d={d} amount />
      </div>
      <BaseSheet open={step === "pw"} onClose={onBack} title="Security verification" className="dp-sec">
        <div className={`dp-sec-body dp-form is-${ls}`}>
          <TextField ls={ls} id="wv-pw" label="Withdrawal password" value={pw} onChange={setPw} placeholder="Enter your withdrawal password" inputProps={{ type: "password", tabIndex: tab(step === "pw") }} />
        </div>
        <div className="dp-leave-btns">
          <button type="button" className="oc-btn is-primary" disabled={!pw} tabIndex={tab(step === "pw")} onClick={() => { setStep(null); setTimeout(() => setStep("passkey"), 300); }}>
            Verify with passkey
          </button>
          <button type="button" className="dp-text-btn" tabIndex={tab(step === "pw")} onClick={other}>
            Try another method
          </button>
        </div>
      </BaseSheet>
      <BaseSheet open={step === "passkey"} onClose={onBack} title="" className="dp-pk">
        <div className="dp-pk-body">
          <PasskeyArt />
          <h2>Verify with passkey</h2>
          <p>Follow the prompts on your device to verify this withdrawal.</p>
        </div>
        <div className="dp-leave-btns">
          <button type="button" className="oc-btn is-primary" disabled={busy} tabIndex={tab(step === "passkey")} onClick={start}>
            {busy ? "Verifying…" : "Start verification"}
          </button>
          <button type="button" className="dp-text-btn" disabled={busy} tabIndex={tab(step === "passkey")} onClick={other}>
            Try another method
          </button>
        </div>
      </BaseSheet>
      <BaseSheet open={step === "other"} onClose={onBack} title="Security verification" className="dp-sec">
        <div className={`dp-sec-body dp-form is-${ls}`}>
          <TextField ls={ls} id="wv-pw2" label="Withdrawal password" value={pw2} onChange={setPw2} placeholder="Enter your withdrawal password" inputProps={{ type: "password", tabIndex: tab(step === "other") }} />
          <TextField
            ls={ls}
            id="wv-sms"
            label="SMS verification code"
            hint={sent ? "Code sent to +852 ••••••21." : "Send a code to +852 ••••••21."}
            value={sms}
            onChange={(v) => setSms(digits(v))}
            placeholder="Enter 6-digit code"
            inputProps={{ inputMode: "numeric", autoComplete: "one-time-code", tabIndex: tab(step === "other") }}
            action={
              <button type="button" className="dp-paste" disabled={sent > 0} tabIndex={tab(step === "other")} onClick={() => setSent(60)}>
                {sent ? `Resend in ${sent}s` : "Send code"}
              </button>
            }
          />
          <TextField
            ls={ls}
            id="wv-ga"
            label="Authenticator code"
            hint="Enter the 6-digit code from your authenticator app."
            value={ga}
            onChange={(v) => setGa(digits(v))}
            placeholder="Enter 6-digit code"
            inputProps={{ inputMode: "numeric", tabIndex: tab(step === "other") }}
            action={
              <button type="button" className="dp-paste" tabIndex={tab(step === "other")} onClick={() => setGa("735204")}>
                Paste
              </button>
            }
          />
        </div>
        <div className="dp-leave-btns">
          <button type="button" className="oc-btn is-primary" disabled={!okOther} tabIndex={tab(step === "other")} onClick={() => { setStep(null); setTimeout(onVerified, 280); }}>
            Submit withdrawal
          </button>
        </div>
      </BaseSheet>
    </div>
  );
};

// Result: no back (the request is already submitted); Done or View history.
const WResultPage = ({ onDone, onHistory, d, split = false }) => (
  <div className="oc-screen oc-page dp-page is-wresult">
    <header className="oc-appbar">
      <span />
      <h1>Withdraw</h1>
      <span />
    </header>
    {/* Content as Figma 18342:150106 (a sheet there; a page here) */}
    <div className="oc-page-body dp-body dp-result">
      <div className="pd-illo is-clock" aria-hidden="true">
        <span className="pd-illo-back" />
        <span className="pd-illo-front">
          <svg width="40" height="40" viewBox="0 0 40 40">
            <path d="M20 10v11l6 6" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <h2>Awaiting approval</h2>
      <p className="dp-result-msg">Withdrawal request submitted. You will be notified once the withdrawal is complete. View your history for the latest updates.</p>
    </div>
    <div className="oc-foot dp-foot">
      <button type="button" className="oc-btn is-primary" onClick={onDone}>
        OK
      </button>
      <button type="button" className="oc-btn is-outline" onClick={onHistory}>
        View history
      </button>
    </div>
  </div>
);


/* ---------- Add bank account (split v2): type, then EX.IO's bank details ---------- */
// From the live app's screens (2026-11-11): 1) asset + Hong Kong / Oversea bank,
// 2) deposit to EX.IO's account from an own-name account; the first deposit whitelists it.
const HOLDER = "Chan Tai Man"; // the account opening name (demo)
const MIN_FIAT_DEP = { USD: 1400, HKD: 10000 }; // min. initial deposit (demo placeholders)
const COUNTRIES = ["Åland Islands", "Albania", "American Samoa", "Andorra", "Anguilla", "Antarctica", "Antigua and Barbuda", "Argentina", "Armenia", "Aruba", "Australia", "Austria", "Bahamas", "Bahrain", "Barbados", "Belgium", "Bermuda", "Brazil", "Brunei", "Bulgaria", "Canada", "Chile", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Iceland", "Ireland", "Israel", "Italy", "Japan", "Korea", "Latvia", "Lithuania", "Luxembourg", "Macao", "Malaysia", "Malta", "Mexico", "Netherlands", "New Zealand", "Norway", "Philippines", "Poland", "Portugal", "Singapore", "Slovakia", "Slovenia", "Spain", "Sweden", "Switzerland", "Taiwan", "Thailand", "United Kingdom", "United States"];
const EXIO_BANK = [
  ["Bank Name", "ZA Bank Limited"],
  ["Bank Code", "387"],
  ["Branch Code", "747"],
  ["SWIFT Code", "AABLHKHH"],
  ["Account Name", "EXIO (HK) LTD - CLIENTS A/C"],
  ["Account Number", "327400044128"],
  ["Account Type", "Multi-currency Current Account"],
  ["Bank address", "UNIT 1301, IT STREET, CYBERPORT 3, 100 CYBERPORT ROAD, HK"],
];
const BulbIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M8.5 15.5c-1.6-1.2-2.5-3-2.5-5a6 6 0 0112 0c0 2-.9 3.8-2.5 5v1.5h-7v-1.5z" stroke="rgba(0,0,0,0.8)" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9.5 20h5" stroke="#00c08b" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const QIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="7.5" fill="#f7a042" />
    <path d="M8 8.2a2 2 0 113 1.7c-.6.4-1 .8-1 1.5v.3" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="14" r=".9" fill="#fff" />
  </svg>
);
const BankTips = ({ open, onClose, c, count, onCountries }) => (
  <BaseSheet open={open} onClose={onClose} title="Tips" className="dp-tips">
    <ol className="dp-tips-list">
      <li>
        The bank transfer must be made from an account registered under the same name you provided in the account opening form (i.e. <b>{HOLDER}</b>).
      </li>
      <li>
        Please note that the initial deposit amount must be a minimum of{" "}
        <b>
          {fmtDp(MIN_FIAT_DEP[c] || 0, 0)} {c}
        </b>{" "}
        per transaction.
      </li>
      <li>To ensure smooth processing, please refrain from depositing cash into the designated bank account. Instead, we suggest utilizing alternative methods such as FPS (Faster Payment System), or Bank transfer via CHATS.</li>
      <li>
        Please use a bank account from the{" "}
        <button type="button" className="dp-tips-link" tabIndex={open ? 0 : -1} onClick={onCountries}>
          supported countries / region
        </button>{" "}
        for deposit according to regulatory requirements. If not, a refund will be issued, and you will be responsible for any applicable refund fees.
      </li>
      <li>FPS/CHATS deposits are expected to be credited within 1 working day.</li>
      <li>
        Only 3 bank accounts can be whitelisted per currency. If you already have 3 whitelisted bank accounts and need to add a new one, you must first delete one of the previously
        whitelisted accounts. You currently have <b>{count}/3</b> whitelisted bank accounts for {c}.
      </li>
    </ol>
  </BaseSheet>
);
const BankTypePage = ({ d, setAsset, onBack, onNext, onTips }) => {
  const c = d.asset;
  const [type, setType] = useState("hk");
  const [pick, setPick] = useState(false);
  return (
    <div className="oc-screen oc-page dp-page is-bank1">
      <AppBar
        title="Add bank account"
        onBack={onBack}
        right={
          <button type="button" className="oc-back is-close" aria-label="Tips" onClick={onTips}>
            <BulbIcon />
          </button>
        }
      />
      <div className="oc-page-body dp-body">
        <div className="dp-note has-icon">
          <QIcon />
          <span>Note: Deposit requested near bank holidays may experience processing delays.</span>
        </div>
        <div className="dp-trad">
          <span className="dp-trad-label">Asset</span>
          <button type="button" className={`oc-xpick dp-pick is-trad dp-bank-asset${pick ? " is-open" : ""}`} aria-haspopup="dialog" onClick={() => setPick(true)}>
            <span className="oc-xpick-row">
              <Icon c={c} size={24} />
              <b>{c}</b>
              <img className="sel-caret" src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" />
            </span>
          </button>
        </div>
        <div className="dp-btype" role="radiogroup" aria-label="Bank Account Type">
          <span className="dp-trad-label">Bank Account Type</span>
          {[
            ["hk", "Hong Kong"],
            ["os", "Oversea Bank"],
          ].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={type === k} className="dp-btype-row" onClick={() => setType(k)}>
              <span>{l}</span>
              <span className={`dp-radio${type === k ? " is-on" : ""}`} aria-hidden="true" />
            </button>
          ))}
        </div>
        {type === "os" && (
          <section className="dp-countries" aria-label="Supported countries/regions">
            <h3>Supported countries/regions</h3>
            <ul>
              {COUNTRIES.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-primary" onClick={() => onNext(type)}>
          Next
        </button>
      </div>
      <TokenSheet
        open={pick}
        title="Select asset"
        value={c}
        onPick={(v) => setAsset(v)}
        onClose={() => setPick(false)}
        options={KINDS.fiat.assets.map((k) => ({ value: k, label: k, name: CCY[k].name, icon: <Icon c={k} /> }))}
      />
    </div>
  );
};
const BankInfoPage = ({ d, onBack, onTips, say }) => {
  const c = d.asset;
  const copy = (k, v) => {
    navigator.clipboard?.writeText(v).catch(() => {});
    say(`${k} copied`);
  };
  return (
    <div className="oc-screen oc-page dp-page is-bank2">
      <AppBar
        title="Add bank account"
        onBack={onBack}
        right={
          <button type="button" className="oc-back is-close" aria-label="Tips" onClick={onTips}>
            <BulbIcon />
          </button>
        }
      />
      <div className="oc-page-body dp-body">
        <div className="dp-note has-icon">
          <WarnIcon />
          <ol className="dp-note-list">
            <li>
              The bank transfer must be made from an account registered under the same name you provided in the account opening form (i.e. <b>{HOLDER}</b>).
            </li>
            <li>
              Please note that the initial deposit amount must be a minimum of{" "}
              <b>
                {fmtDp(MIN_FIAT_DEP[c] || 0, 0)} {c}
              </b>{" "}
              per transaction.
            </li>
          </ol>
        </div>
        <section className="dp-bstep">
          <h2>
            <span className="dp-bstep-n">1</span>
            <span>Deposit {c} to the designated bank account of EX.IO</span>
          </h2>
          <div className="dp-bstep-body">
            <div className="dp-bank-card">
              <div className="dp-bank-to">
                <span>Bank to Deposit</span>
                <b>ZA Bank Limited</b>
              </div>
              {EXIO_BANK.map(([k, v]) => (
                <div key={k} className="dp-bank-row">
                  <span>
                    <small>{k}</small>
                    <b>{v}</b>
                  </span>
                  <button type="button" className="dp-copy" aria-label={`Copy ${k}`} onClick={() => copy(k, v)}>
                    <CopyIcon />
                  </button>
                </div>
              ))}
            </div>
            <div className="dp-lims">
              <div className="dp-row is-min">
                <span>Min. Initial Deposit</span>
                <b>
                  {fmtDp(MIN_FIAT_DEP[c] || 0, 2)} <em>{c}</em>
                </b>
              </div>
              <div className="dp-row is-min">
                <span>Suggest Payment Method</span>
                <b>FPS / CHATS</b>
              </div>
            </div>
          </div>
        </section>
        <section className="dp-bstep">
          <h2>
            <span className="dp-bstep-n">2</span>
            <span>After receiving the funds, EX.IO will automatically credit and whitelist</span>
          </h2>
        </section>
      </div>
      <div className="oc-foot dp-foot">
        <button type="button" className="oc-btn is-primary" onClick={() => say("Saved to Photos")}>
          Save picture
        </button>
      </div>
    </div>
  );
};

/* ---------- Token selection (page) ---------- */
const HEADS = { crypto: ["On-chain deposit"], fiat: ["Bank deposit"] };
const TokenPage = ({ value, kind, onBack, onPick, title = "Deposit", heads = HEADS, split = false, withdraw = false }) => {
  const [q, setQ] = useState("");
  // Deposits land in the Custody account, so each cell shows that balance.
  const bal = useOtc().s.bal.custody;
  const term = q.trim().toLowerCase();
  // Only the kind picked in the first sheet (Fiat / Crypto, Bank / On-chain).
  const sections = Object.entries(KINDS)
    .filter(([k]) => !kind || k === kind)
    .map(([k, v]) => [k, v, v.assets.filter((c) => (c + CCY[c].name).toLowerCase().includes(term))])
    .filter(([, , list]) => list.length);
  // Split · fiat deposit (Figma "Deposit fiat"): a currency list, no search or balances.
  if (split && !withdraw && kind === "fiat")
    return (
      <div className="oc-screen oc-page dp-page is-token">
        <AppBar title="Deposit fiat" onBack={onBack} />
        <div className="oc-page-body dp-body">
          <SecHead title="Select a currency" sub="Choose the currency of your bank transfer." />
          <div className="dp-opts">
            {KINDS.fiat.assets.map((c) => (
              <button key={c} type="button" className="dp-opt" onClick={() => onPick("fiat", c)}>
                {/* currency logo, as the token cells */}
                <span className="dp-opt-icon">
                  <Icon c={c} />
                </span>
                <span className="dp-opt-text">
                  <b>{c}</b>
                  <small>{CCY[c].name}</small>
                </span>
                <Chev />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  const sTitle = split && kind === "crypto" ? (withdraw ? "Withdraw" : "Select crypto") : title;
  const sHead = split && kind === "crypto" ? (withdraw ? "Assets you hold" : "Available assets") : null;
  return (
    <div className="oc-screen oc-page dp-page is-token">
      <AppBar title={sTitle} onBack={onBack} />
      <div className="oc-page-body dp-body">
        <label className="dp-search">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={split ? "Search by name or symbol" : "Search token or currency"} aria-label="Search" />
        </label>
        {sections.map(([k, v, list]) => (
          <section key={k} className="dp-section" aria-labelledby={`dp-sec-${k}`}>
            <h2 id={`dp-sec-${k}`} className="dp-section-head">
              {sHead || heads[k][0]}
              {!sHead && heads[k][1] && <span>{heads[k][1]}</span>}
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

/* ---------- Select network (page; split network setting) ---------- */
const NetPage = ({ d, onBack, onPick, withdraw = false }) => (
  <div className="oc-screen oc-page dp-page is-net">
    <AppBar title="Select a network" onBack={onBack} />
    <div className="oc-page-body dp-body">
      <p className="dp-lead">{withdraw ? "Use the same network as the receiving wallet." : "Use the same network in your sending wallet."}</p>
      <div className="tks-list dp-tokens">
        {(NETWORKS[d.asset] || []).map(([k, name, conf]) => (
          <button key={k} type="button" className={`tks-row${k === d.net ? " is-on" : ""}`} onClick={() => onPick(k)}>
            <span className="tks-text">
              <b>{name}</b>
              {!withdraw && <small>Credited after {conf}</small>}
            </span>
            <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" className="dp-chev" />
          </button>
        ))}
      </div>
    </div>
  </div>
);

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
    {/* Icons from the design specs (Figma sK53DNpEr5M2YvjbvhOvE3: round-deposit 11893:15458, Wallet Connect 11893:15425) */}
    {k === "small" && (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 1C18.0751 1 23 5.92487 23 12C23 18.0751 18.0751 23 12 23C5.92487 23 1 18.0751 1 12C1 5.92487 5.92487 1 12 1ZM12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3ZM16.4443 14.8652C16.9965 14.8653 17.4442 15.3131 17.4443 15.8652V16.6514C17.4443 16.9206 17.3361 17.179 17.1436 17.3672C16.7295 17.7716 16.1723 17.9941 15.5967 17.9941H8.40332C7.82785 17.9941 7.27146 17.7714 6.85742 17.3672C6.66479 17.179 6.55566 16.9207 6.55566 16.6514V15.8652C6.55581 15.3131 7.00347 14.8652 7.55566 14.8652C8.1078 14.8653 8.55552 15.3131 8.55566 15.8652V15.9941H15.4443V15.8652C15.4445 15.3131 15.8922 14.8654 16.4443 14.8652ZM12.001 6.00488C12.553 6.00503 13.0008 6.45282 13.001 7.00488V11.4658L14.3096 10.3447C14.729 9.98566 15.3605 10.0348 15.7197 10.4541C16.0789 10.8734 16.0305 11.5049 15.6113 11.8643L12.6514 14.3994C12.2771 14.7199 11.7249 14.7198 11.3506 14.3994L8.39062 11.8643C7.97124 11.505 7.92296 10.8735 8.28223 10.4541C8.64144 10.0351 9.27208 9.98595 9.69141 10.3447L11.001 11.4658V7.00488C11.0011 6.45272 11.4488 6.00488 12.001 6.00488Z" />
      </svg>
    )}
    {k === "connect" && (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.8691 2C18.4214 2 18.8691 2.44772 18.8691 3C18.8689 3.5521 18.4213 4 17.8691 4H4.56544C4.42696 4 4.28657 4.05645 4.17775 4.16895C4.06787 4.28277 4.00001 4.4449 4.00001 4.62012C4.00014 4.79518 4.06793 4.95659 4.17775 5.07031C4.28658 5.18285 4.42694 5.24023 4.56544 5.24023H20.2178C20.6412 5.24033 21.0443 5.39226 21.3604 5.66016L21.4902 5.78223L21.6065 5.91602C21.862 6.23875 22 6.63947 22 7.0498V18.3896C21.9999 18.8585 21.8202 19.3155 21.4902 19.6572C21.1589 20.0001 20.7016 20.2001 20.2178 20.2002H14C13.4479 20.2002 13.0003 19.7522 13 19.2002C13 18.6479 13.4477 18.2002 14 18.2002H20V7.24023H4.56544C4.37309 7.24023 4.1838 7.21529 4.00001 7.17285V8.59961C3.9998 9.15171 3.55216 9.59961 3.00001 9.59961C2.44786 9.59961 2.00022 9.15171 2.00001 8.59961V4.62012C2.00001 3.93623 2.26231 3.27305 2.73927 2.7793C3.21746 2.28445 3.87386 2 4.56544 2H17.8691ZM16.0498 10.6494C17.0438 10.6494 17.8494 11.4553 17.8496 12.4492C17.8496 13.4433 17.0439 14.25 16.0498 14.25C15.0558 14.2499 14.25 13.4433 14.25 12.4492C14.2502 11.4553 15.0559 10.6495 16.0498 10.6494Z" />
        <path d="M4.50735 13.6602C4.11682 13.2697 3.48379 13.2697 3.09328 13.6602L2.17727 14.5762C0.774222 15.9792 0.774222 18.2542 2.17727 19.6572C3.58036 21.0597 5.85546 21.0601 7.25832 19.6572L8.17434 18.7412C8.56462 18.3509 8.56414 17.7177 8.17434 17.3271C7.78381 16.9366 7.1508 16.9366 6.76028 17.3271L5.84328 18.2432C5.22146 18.8648 4.21332 18.8646 3.59133 18.2432C2.96933 17.6212 2.96933 16.6122 3.59133 15.9902L4.50735 15.0742C4.89772 14.6838 4.89742 14.0507 4.50735 13.6602Z" />
        <path d="M8.17434 13.6602C7.78383 13.2696 7.1508 13.2697 6.76028 13.6602L4.92727 15.4932C4.53674 15.8837 4.53674 16.5167 4.92727 16.9072C5.31784 17.2972 5.951 17.2976 6.34133 16.9072L8.17434 15.0742C8.56463 14.6839 8.56428 14.0507 8.17434 13.6602Z" />
        <path d="M10.9243 10.9102C9.52133 9.50715 7.24634 9.50722 5.84328 10.9102L4.92629 11.8271C4.53641 12.2177 4.53603 12.8509 4.92629 13.2412C5.31677 13.6312 5.95093 13.6313 6.34133 13.2412L7.25832 12.3242C7.88034 11.7024 8.88834 11.7023 9.51028 12.3242C10.1317 12.9462 10.1319 13.9543 9.51028 14.5762L8.59328 15.4932C8.20311 15.8836 8.20313 16.5168 8.59328 16.9072C8.98376 17.2972 9.61697 17.2973 10.0073 16.9072L10.9243 15.9902C12.327 14.5874 12.3268 12.3132 10.9243 10.9102Z" />
      </svg>
    )}
    {/* blocks 11902:15476 */}
    {k === "chain" && (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.5 16.4844L11 20.3496V13.4824L4.5 9.61719V16.4844ZM13 13.4824V20.3496L19.5 16.4844V9.61719L13 13.4824ZM4.68848 7.40332L12 11.75L19.3105 7.40332L12 3.05566L4.68848 7.40332ZM21.5 16.5977C21.5 16.8994 21.4258 17.2001 21.2793 17.4688C21.1508 17.7043 20.9683 17.9117 20.7422 18.0684L20.6426 18.1318L12.8516 22.7646L12.8506 22.7656C12.5952 22.9173 12.3023 23 12 23C11.6977 23 11.4048 22.9173 11.1494 22.7656L11.1484 22.7646L3.35742 18.1318C3.08559 17.9702 2.86853 17.7391 2.72168 17.4707C2.57508 17.2027 2.50064 16.9027 2.5 16.6016V7.40039C2.50019 7.36337 2.5037 7.32698 2.50781 7.29102C2.52394 7.02647 2.59257 6.76531 2.72168 6.5293L2.84473 6.33496C2.98028 6.14914 3.1536 5.98932 3.35742 5.86816L11.1484 1.23535L11.1494 1.23438C11.4048 1.08269 11.6977 1 12 1C12.2267 1 12.4481 1.04651 12.6523 1.13379L12.8506 1.23438L12.8516 1.23535L20.6426 5.86816L20.7422 5.93164C20.9032 6.04318 21.0423 6.18014 21.1553 6.33496L21.2783 6.5293L21.374 6.73633C21.4431 6.9126 21.4802 7.09841 21.4922 7.28613C21.4965 7.32303 21.4998 7.36043 21.5 7.39844V16.5977Z" />
      </svg>
    )}
    {/* bank 2280:1374 */}
    {k === "bank" && (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21.2075 19.9999C21.7597 19.9999 22.2075 20.4476 22.2075 20.9999C22.2075 21.5522 21.7597 21.9999 21.2075 21.9999H2.79242C2.24013 21.9999 1.79242 21.5522 1.79242 20.9999C1.79242 20.4476 2.24013 19.9999 2.79242 19.9999H21.2075ZM11.3569 1.23815C11.7495 0.989739 12.2513 0.989701 12.644 1.23815L12.726 1.29479L21.6157 8.00573C22.5372 8.70211 22.0452 10.1713 20.8901 10.1717H19.5756C19.5759 10.1811 19.5766 10.1907 19.5766 10.2001V15.8856H20.769C21.3212 15.8856 21.7689 16.3334 21.769 16.8856C21.7689 17.4378 21.3212 17.8856 20.769 17.8856H3.2309C2.67869 17.8856 2.23103 17.4378 2.2309 16.8856C2.23099 16.3334 2.67867 15.8856 3.2309 15.8856H4.42328V10.2001C4.42328 10.1907 4.424 10.1811 4.42426 10.1717H3.11078C1.95539 10.1715 1.46326 8.70209 2.38519 8.00573L11.2748 1.29479L11.3569 1.23815ZM6.4223 10.1717C6.42256 10.1811 6.42328 10.1907 6.42328 10.2001V15.8856H8.80804V10.2001C8.80804 10.1907 8.80876 10.1811 8.80902 10.1717H6.4223ZM10.8071 10.1717C10.8073 10.1811 10.808 10.1907 10.808 10.2001V15.8856H13.1928V10.2001C13.1928 10.1907 13.1935 10.1811 13.1938 10.1717H10.8071ZM15.1918 10.1717C15.1921 10.1811 15.1928 10.1907 15.1928 10.2001V15.8856H17.5766V10.2001C17.5766 10.1907 17.5773 10.1811 17.5776 10.1717H15.1918ZM5.4848 8.17174H18.5161L12.0004 3.2528L5.4848 8.17174Z" />
      </svg>
    )}
    {/* Interactive Icons/edit2 11884:6720 */}
    {k === "sign" && (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.2422 2C11.7945 2 12.2422 2.44772 12.2422 3C12.2422 3.55228 11.7945 4 11.2422 4H4V19H19V11.7578C19 11.2055 19.4477 10.7578 20 10.7578C20.5523 10.7578 21 11.2055 21 11.7578V19.2275C20.9999 19.6976 20.8129 20.1481 20.4805 20.4805C20.1481 20.8129 19.6976 20.9999 19.2275 21H3.77246C3.3024 20.9999 2.85192 20.8129 2.51953 20.4805C2.18714 20.1481 2.00007 19.6976 2 19.2275V3.77246C2.00007 3.3024 2.18714 2.85192 2.51953 2.51953C2.85192 2.18714 3.3024 2.00007 3.77246 2H11.2422ZM17.1191 2.22461C17.5119 1.90426 18.0909 1.92686 18.457 2.29297L21.707 5.54297C22.0976 5.93349 22.0976 6.56651 21.707 6.95703L11.957 16.707C11.7695 16.8946 11.5152 17 11.25 17H8C7.44772 17 7 16.5523 7 16V12.75C7 12.4848 7.10543 12.2305 7.29297 12.043L17.043 2.29297L17.1191 2.22461ZM9 13.1641V15H10.8359L17.1484 8.6875L15.3125 6.85156L9 13.1641ZM16.7266 5.4375L18.5625 7.27344L19.5859 6.25L17.75 4.41406L16.7266 5.4375Z" />
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

const ConnectPage = ({ d, ls, sheet, onPickAsset, onPickNet, onBack, onConnect, remarks, setRemarks, slide = true }) => {
  const [agree, setAgree] = useState(false);
  return (
    <div className="oc-screen oc-page dp-page is-connect">
      <AppBar title="Add whitelist address" onBack={onBack} slide={slide} close={!slide} />
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

const AddrPage = ({ d, ls, sheet, onPickAsset, onPickNet, onBack, onNext, remarks, setRemarks, addr, setAddr, slide = true }) => {
  const [touched, setTouched] = useState(false);
  const ok = d.net && ADDR_RE[d.net].test(addr.trim());
  const err = touched && addr && d.net && !ok ? `Enter a valid ${NET[d.net].name} address` : "";
  return (
    <div className="oc-screen oc-page dp-page is-addr">
      <AppBar title="Add whitelist address" onBack={onBack} slide={slide} close={!slide} />
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

const SignPage = ({ addr, onBack, onClose, onHow, onSubmit, say }) => {
  const [sig, setSig] = useState("");
  const msg = useRef(
    `It is hereby declared, on ${new Date().toISOString().slice(0, 10)}, that I/we own the wallet address ${addr} Nonce: ${Math.floor(Date.now() / 1000)}`
  ).current;
  const ok = /^0x[0-9a-fA-F]{64,}$/.test(sig.trim());
  return (
    <div className="oc-screen oc-page dp-page is-sign">
      <AppBar
        title="Add whitelist address"
        onBack={onBack}
        right={
          // 2nd step of the page sheet: back (left) to the previous step, close (right) the sheet
          onClose && (
            <button type="button" className="oc-back is-close" aria-label="Close" onClick={onClose}>
              <XIcon />
            </button>
          )
        }
      />
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

// Add address, last step (2026-11-13): security verification as a page in the page
// sheet, for both Connect to wallet and Manual wallet signing. SMS, then authenticator.
const SecPage = ({ onBack, onClose, onDone }) => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 30);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="oc-screen oc-page dp-page is-secpage">
      <AppBar
        title="Add whitelist address"
        onBack={onBack}
        right={
          <button type="button" className="oc-back is-close" aria-label="Close" onClick={onClose}>
            <XIcon />
          </button>
        }
      />
      <div className="oc-page-body dp-body as-style-float">
        <VerifySteps open={on} onDone={onDone} lastLabel="Complete" />
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

/* ---------- Add address as a page sheet (2026-11-11) ----------
   The three add methods (small amount, wallet, signature) open in an iOS page sheet over
   the address list, like sign-up and the OTC chat: the app behind shrinks into a card
   (.mhc-phone.as-open, --as-p). Android: full screen. The sheet keeps its last pages while
   it slides down. */
const ADD_PAGES = ["amount", "connect", "addr", "sign", "sec"];
const AddSheet = ({ open, children }) => {
  const [shown, setShown] = useState(open);
  const ref = useRef(null);
  const phone = () => ref.current?.closest(".mhc-phone") || document.querySelector(".mhc-phone");
  const setP = (p) => phone()?.style.setProperty("--as-p", String(p));
  useEffect(() => {
    if (open) setShown(true);
  }, [open]);
  useEffect(() => {
    const ph = phone();
    if (!ph || !shown) return undefined;
    if (open) {
      ph.classList.add("as-open");
      setP(0);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setP(1)));
      return () => cancelAnimationFrame(r);
    }
    setP(0);
    const t = setTimeout(() => {
      ph.classList.remove("as-open");
      ph.style.removeProperty("--as-p");
      setShown(false);
    }, 450);
    return () => clearTimeout(t);
  }, [open, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null;
  return (
    <>
      <div className="oc-ps-scrim" aria-hidden="true" />
      <div className="oc-ps dp-ps" ref={ref} role="dialog" aria-modal="true" aria-label="Add address">
        <div className="oc-ps-grip">
          <span className="oc-grab" aria-hidden="true" />
        </div>
        <div className="dp-ps-stage">{children}</div>
      </div>
    </>
  );
};

/* ---------- The flow ---------- */
// Withdraw (2026-11-07) reuses the token page, the address list and the
// add-address pages: token → Select address (Manage, Add address) → amount →
// review + slide to confirm → submitted.
const W_HEADS = { crypto: ["On-chain withdrawal"], fiat: ["Bank withdrawal"] };

// netFlow (demo setting): "mix" = network handled inside the address list (pills) / the
// new-address page; "split" = pick the network right after the token, then addresses or
// New address for that network only.
export default function DepositFlow({ open, onClose, labelStyle = "ifta", mode = "deposit", netFlow = "split2", wdPw = "set" }) {
  const withdraw = mode === "withdraw";
  const split = netFlow === "split" || netFlow === "split2" || netFlow === "split3";
  // split2 (Split v2): direct deposit on top of the address list, "Add whitelist address" link
  const v2 = netFlow === "split2" || netFlow === "split3";
  // split3 (Split v3) = v2, but withdraw skips the network step: every whitelisted address of
  // the asset shows (network tag + pills), and picking one sets the network. Deposit unchanged.
  const wdAllNets = netFlow === "split3" && withdraw;
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
  const [adding, setAdding] = useState(false); // Add address pages are in the page sheet
  const [noSmall, setNoSmall] = useState(false);
  const [initAmt, setInitAmt] = useState(""); // Modify amount (page sheet): the amount to start from
  const [focusAmt, setFocusAmt] = useState(0); // Modify amount: focus the intended amount field
  const amtInSheet = useRef(false); // the confirmed amount came from the page sheet // method sheet without "Directly deposit" (split v2 link)
  const lastAdd = useRef(null);
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
      setAdding(false);
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
    setAdding(false);
    setDetail(null);
    setStack([]);
    setTokenPage(false);
  };
  const fiat = d.kind === "fiat";
  // The New-address page: network preset when the token has only one.
  const toAmount = () => {
    setInitAmt("");
    const nets = NETWORKS[d.asset] || [];
    setD((x) => ({ ...x, net: fiat ? "bank" : split && x.net ? x.net : nets.length === 1 ? nets[0][0] : null }));
    setStack((s) => [...s.filter((x) => x !== "amount"), "amount"]);
  };
  const pop = () => {
    if ((stack[stack.length - 1] === "amount" || stack[stack.length - 1] === "bank1") && savedD.current) {
      setD(savedD.current);
      savedD.current = null;
    }
    setStack((s) => s.slice(0, -1));
  };
  // Manage › Bank accounts › Add bank account: the first deposit from an own-name
  // account whitelists it (same as Add bank account on Select bank account).
  const addBank = () => {
    // Split v2: the Add bank account steps (type, then EX.IO's bank details)
    if (v2) {
      if (!fiat) {
        savedD.current = d;
        setD({ kind: "fiat", asset: "HKD", net: "bank" });
      }
      return push("bank1");
    }
    if (fiat) return toAmount();
    savedD.current = d;
    setD({ kind: "fiat", asset: "HKD", net: "bank" });
    return setStack((s) => [...s.filter((x) => x !== "amount"), "amount"]);
  };
  const push = (pg) => setStack((s) => [...s.filter((x) => x !== pg), pg]);
  const closeAdd = () => {
    setAdding(false);
    setStack((s) => s.filter((x) => !ADD_PAGES.includes(x)));
  };
  const startAdd = (method) => {
    const nets = NETWORKS[d.asset] || [];
    setWl({ remarks: "", addr: "", wallet: null, method });
    // Split network: keep the network already picked, so the new address lands in that list.
    setD((x) => ({ ...x, net: split && x.net ? x.net : nets[0]?.[0] ?? null }));
    push(method === "connect" ? "connect" : "addr");
  };
  // Security passed: the address joins the list, back to Select wallet.
  const whitelist = () => {
    setSheet(null);
    const w = {
      id: `n${Date.now()}`,
      label: wl.remarks.trim(), // no remark: the cell shows the first 6 / last 6 instead
      net: d.net,
      addr: wl.method === "connect" ? DEMO_ADDR[d.net] : wl.addr,
      // Ownership proven by WalletConnect / signature: both whitelists.
      withdraw: true,
      coolUntil: Date.now() + COOL_HOURS * 3600e3, // newly whitelisted: withdrawal cool-down
      isNew: true,
    };
    setBook((b) => [w, ...b.map((x) => ({ ...x, isNew: false }))]);
    const fromManage = stack.includes("manage");
    setTimeout(() => {
      // Sheet slides down to where Add started: Manage, else Select address. Deposit
      // carries on to the new address's deposit QR page (back: the list, address added).
      setAdding(false);
      setStack((s) => (s.includes("manage") ? s.slice(0, s.indexOf("manage") + 1) : s.includes("list") ? s.slice(0, s.indexOf("list") + 1) : s.includes("send") ? s.slice(0, s.indexOf("send") + 1) : ["list"]));
      if (!withdraw && !fromManage) setDetail({ ...d, from: w });
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
    const el = document.querySelector(sel);
    if (!el) return then();
    return leavePage(el, then);
  };
  if (!open) return null;
  const amountPage = (
          <AmountPage
            key={d.asset}
            ls={labelStyle}
            d={d}
            sheet={sheet}
            onPickNet={() => setSheet("network")}
            netFixed={split}
            close={adding}
            initAmt={initAmt}
            focusKey={focusAmt}
            onBack={(dirty) => (dirty ? setLeaving(true) : adding ? closeAdd() : slideOut(".dp-page.is-amount", pop))}
            onConfirmed={(r) => {
              // From the sheet: it slides down onto the deposit QR page
              // (Plain page: the amount page stays under the QR page, for Modify amount.)
              amtInSheet.current = adding;
              setFocusAmt(0);
              if (adding) closeAdd();
              setDetail({ ...d, ...r, from: null });
            }}
          />
  );
  const sheetOpen = adding && stack.some((x) => ADD_PAGES.includes(x));
  const addPages = (
    <>
      {stack.includes("amount") && amountPage}
        {stack.includes("connect") && (
          <ConnectPage
            d={d}
            ls={labelStyle}
            sheet={sheet}
            onPickAsset={() => setSheet("asset")}
            onPickNet={() => setSheet("network")}
            onBack={closeAdd}
            slide={false}
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
            onBack={closeAdd}
            slide={false}
            onNext={() => push("sign")}
            remarks={wl.remarks}
            setRemarks={(v) => setWl((x) => ({ ...x, remarks: v }))}
            addr={wl.addr}
            setAddr={(v) => setWl((x) => ({ ...x, addr: v }))}
          />
        )}
        {stack.includes("sign") && <SignPage addr={wl.addr} onBack={pop} onClose={closeAdd} onHow={() => setSheet("how")} onSubmit={() => push("sec")} say={say} />}
        {stack.includes("sec") && <SecPage onBack={pop} onClose={closeAdd} onDone={whitelist} />}
    </>
  );
  if (sheetOpen) lastAdd.current = addPages;
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
            split={split}
            withdraw={withdraw}
            onPick={(k, c) => {
              picked.current = false;
              const nets = NETWORKS[c] || [];
              // Split: crypto goes Select network (page) → Select address, deposit and withdraw
              // alike; a token with one network skips the network page.
              if (split && k === "crypto") {
                if (wdAllNets) {
                  setD({ kind: k, asset: c });
                  return setStack(["list"]);
                }
                if (nets.length > 1) {
                  // Network as a bottom sheet over the token list (Figma Xirry)
                  setD({ kind: k, asset: c });
                  picked.current = false;
                  return setSheet("netpick");
                }
                setD({ kind: k, asset: c, net: nets[0]?.[0] });
                return setStack([withdraw ? "list" : "send"]);
              }
              setD({ kind: k, asset: c });
              // Split v2, fiat: no small-amount verification, so no "Deposit from" sheet:
              // straight to the bank accounts (a new one is added from there).
              if (withdraw || (v2 && k === "fiat")) setStack(["list"]);
              else setSheet("source");
            }}
          />
        )}
        {stack.includes("net") && (
          <NetPage
            d={d}
            withdraw={withdraw}
            onBack={pop}
            onPick={(n) => {
              setD((x) => ({ ...x, net: n }));
              push(withdraw ? "list" : "send");
            }}
          />
        )}
        {stack.includes("send") && (
          <SendAddrPage
            d={d}
            book={book}
            onBack={pop}
            onManage={() => {
              setMTab("crypto");
              push("manage");
            }}
            onPick={(w) => setDetail({ ...d, from: w })}
            v2={v2}
            onDirect={toAmount}
            onAdd={() => {
              setNoSmall(v2);
              setSheet("method");
            }}
          />
        )}
        {stack.includes("list") && (
          <ListPage
            d={d}
            book={book}
            withdraw={withdraw}
            split={split}
            allNets={wdAllNets}
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
            v2={v2}
            onAdd={() => {
              if (fiat) return v2 ? push("bank1") : toAmount();
              setNoSmall(v2 && split);
              return setSheet("method");
            }}
          />
        )}
        {stack.includes("manage") && (
          <ManagePage
            book={book}
            tab={mTab}
            setTab={setMTab}
            onAddBank={addBank}
            onBack={pop}
            onAdd={() => {
              setNoSmall(false);
              setSheet("method");
            }}
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
            split={split}
            ls={labelStyle}
            d={d}
            onBack={pop}
            onNext={(v) => {
              setD((x) => ({ ...x, amount: v }));
              push("wreview");
            }}
            // Split crypto: confirmed and verified in sheets over this page, then the result
            onConfirm={(v, fee) => {
              setD((x) => ({ ...x, amount: v, fee }));
              push("wdone");
            }}
            hasPw={wdPw === "set"}
            say={say}
          />
        )}
        {stack.includes("wreview") && <WReviewPage d={d} split={split} onBack={pop} onConfirmed={() => push(split && d.to?.net !== "bank" ? "wverify" : "wdone")} />}
        {stack.includes("wverify") && <WVerifyPage d={d} ls={labelStyle} hasPw={wdPw === "set"} onBack={pop} onVerified={() => push("wdone")} />}
        {stack.includes("bank1") && (
          <BankTypePage d={d} setAsset={(a) => setD((x) => ({ ...x, asset: a }))} onBack={pop} onNext={() => push("bank2")} onTips={() => setSheet("tips")} />
        )}
        {stack.includes("bank2") && <BankInfoPage d={d} onBack={pop} onTips={() => setSheet("tips")} say={say} />}
        {stack.includes("wdone") && <WResultPage onDone={finish} onHistory={() => say("Withdrawal history isn’t in this demo")} d={d} split={split} />}
        {stack.includes("amount") && !adding && amountPage}
        {detail && (
          <DetailPage
            d={detail}
            onDone={finish}
            onBack={() => {
              setDetail(null);
              // new address: back = give up this deposit, to the address list
              if (!detail.from) setStack((s) => s.filter((x) => x !== "amount"));
            }}
            onModify={() => {
              // back to the intended amount, filled in; it gets a new verification amount
              setDetail(null);
              setFocusAmt((n) => n + 1);
              if (amtInSheet.current) {
                setInitAmt(String(detail.amount));
                setAdding(true);
                setStack((s) => [...s.filter((x) => x !== "amount"), "amount"]);
              }
            }}
            say={say}
            split={split}
          />
        )}
      </PhoneLayer>
      <PhoneLayer className="oc-layer dp-ps-layer">
        <AddSheet open={sheetOpen}>{sheetOpen ? addPages : lastAdd.current}</AddSheet>
      </PhoneLayer>
      {/* The simulated wallet app takes the whole screen, over the sheet */}
      <PhoneLayer className="oc-layer dp-wapp-layer">
        {wapp && (
          <WalletApp
            k={wapp}
            onCancel={() => setWapp(null)}
            onConnect={() => {
              setWapp(null);
              push("sec");
            }}
          />
        )}
      </PhoneLayer>
      <TokenSheet
        open={sheet === "way"}
        title={withdraw ? "Choose a withdrawal method" : "Choose a deposit method"}
        chevron={`${IMG}/arrow-down.svg`}
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
          // Same first step in Mix and Split network
          withdraw
            ? [
                { value: "crypto", icon: <MethodIcon k="chain" />, label: "On-chain withdrawal", name: "Withdraw crypto to whitelisted address" },
                { value: "fiat", icon: <MethodIcon k="bank" />, label: "Bank withdrawal", name: "Withdraw fiat to your bank account" },
              ]
            : [
                { value: "crypto", icon: <MethodIcon k="chain" />, label: "On-chain deposit", name: "Deposit crypto from whitelisted address" },
                { value: "fiat", icon: <MethodIcon k="bank" />, label: "Bank deposit", name: "Deposit fiat from your bank account" },
              ]
        }
      />
      <TokenSheet
        open={sheet === "netpick"}
        title="Select a network"
        note={withdraw ? "Use the same network as the receiving wallet." : "Use the same network in your sending wallet."}
        value={null}
        chevron={`${IMG}/arrow-down.svg`}
        onPick={(n) => {
          picked.current = true;
          setD((x) => ({ ...x, net: n }));
          setStack([withdraw ? "list" : "send"]);
        }}
        onClose={() => {
          picked.current = false;
          setSheet((s) => (s === "netpick" ? null : s)); // dismissed: back on the token list
        }}
        options={(NETWORKS[d.asset] || []).map(([k, name, conf]) => ({ value: k, label: name, name: withdraw ? undefined : `Credited after ${conf}` }))}
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
            name: `${listFor(d.asset, book).filter((w) => !split || fiat || w.net === d.net).length} whitelisted`,
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
        chevron={`${IMG}/arrow-down.svg`}
        onPick={(m) => {
          picked.current = true;
          // the bottom sheet slides away first, then the add pages rise in the page sheet
          setTimeout(() => {
            setAdding(true);
            if (m === "small") toAmount();
            else startAdd(m);
          }, 300);
        }}
        onClose={closeSheet("method")}
        options={[
          { value: "small", icon: <MethodIcon k="small" />, label: "Directly deposit from new address", name: "Deposit with a small extra amount; whitelisted when it arrives" },
          { value: "connect", icon: <MethodIcon k="connect" />, label: "Connect to wallet", name: "Connect your wallet app to prove you own the address" },
          { value: "sign", icon: <MethodIcon k="sign" />, label: "Manual wallet signing", name: "Sign a message in your wallet and paste the result" },
        ].filter((o) => !(noSmall && o.value === "small"))}
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
      <BankTips
        open={sheet === "tips"}
        onClose={closeSheet("tips")}
        c={d.asset && BANKS[d.asset] ? d.asset : "USD"}
        count={(BANKS[d.asset] || []).length}
        onCountries={() => {
          setSheet(null);
          setTimeout(() => setSheet("countries"), 300);
        }}
      />
      <BaseSheet open={sheet === "countries"} onClose={closeSheet("countries")} title="Supported countries/regions" className="dp-tips">
        <ul className="dp-countries-list">
          {COUNTRIES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </BaseSheet>
      {/* Security codes are account-security, not trading: floating label (library Floating Input), like sign up / sign in. */}
      <DeclareSheet w={wdFor} open={sheet === "declare"} onClose={closeSheet("declare")} onConfirm={() => setWithdraw(true)} />
      <DisableSheet open={sheet === "disable"} onClose={closeSheet("disable")} onConfirm={() => setWithdraw(false)} />
      <LeaveSheet
        open={leaving}
        onStay={() => setLeaving(false)}
        onLeave={() => {
          setLeaving(false);
          slideOut(".dp-page.is-amount, .dp-page.is-samount", pop);
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
