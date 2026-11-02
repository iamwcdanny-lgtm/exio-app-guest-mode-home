import React, { useRef, useState } from "react";
import TokenSheet from "./TokenSheet";
import { useOtc, CCY, TOKENS, IMG, fmtDp } from "./OtcSession";
import PhoneLayer from "./PhoneLayer";
import "./OtcPanel.css";

// OTC section of the Trade page (Figma: OTC Chat Trading, 9231:100184).
// A tall "You pay" field (amount + currency) over a short "You receive" field
// (currency only: the amount comes with the dealer's quote); the swap button
// on the seam flips the pair. Both follow the
// prototype's input style switch: "ifta" puts the label inside at the top,
// "float" on the border, "trad" above the box.
const fmt = (n, dp) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const clean = (v, dp) => {
  let s = v.replace(/,/g, "").replace(/[^\d.]/g, "");
  const i = s.indexOf(".");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "").slice(0, dp);
  if (/^0\d/.test(s)) s = s.replace(/^0+(?=\d)/, "");
  return s;
};
const group = (v) => {
  if (v === "") return v;
  const [i, d] = v.split(".");
  return Number(i || 0).toLocaleString("en-US") + (d !== undefined ? `.${d}` : "");
};
// Currency chip inside an amount field; opens the currency sheet
// (bottom sheet instead of the native dropdown, 2026-11-02).
const CcyChip = ({ label, value, onOpen }) => (
  <button type="button" className="otc-chip" aria-label={`${label}: ${value}`} aria-haspopup="dialog" onClick={onOpen}>
    <img src={`${IMG}/${CCY[value].icon}`} width="20" height="20" alt="" />
    <b>{value}</b>
    <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" />
  </button>
);

const OtcPanel = ({ labelStyle = "float", say }) => {
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("BTC");
  const [mode, setMode] = useState("pay"); // which side the amount is entered in
  const [amount, setAmount] = useState("");
  const [focused, setFocused] = useState(null); // "pay" | "receive" | null
  // Balances, orders and the chat session live in OtcSession (one session
  // for the whole app: it survives leaving this tab as a floating bubble).
  const otc = useOtc();
  const bal = otc.s.bal.otc;
  const orders = otc.s.orders;
  const [tab, setTab] = useState("ongoing");
  const [about, setAbout] = useState(false);
  const inputRef = useRef(null);
  const [picking, setPicking] = useState(null); // "from" | "to" | null

  const ccy = mode === "pay" ? from : to;
  const dp = CCY[ccy].dp;
  const rate = CCY[to].usd / CCY[from].usd; // 1 TO = rate FROM
  const value = Number(amount || 0);
  const cost = mode === "pay" ? value : value * rate; // in FROM
  const error = value > 0 && cost > bal[from] + 1e-9 ? "Exceeds your available balance." : "";
  const ready = value > 0 && !error;

  const setPair = (nextFrom, nextTo) => {
    setFrom(nextFrom);
    setTo(nextTo);
    setAmount("");
    setMode("pay");
  };
  const pickFrom = (c) => (c === to ? setPair(to, from) : setPair(c, to));
  const pickTo = (c) => (c === from ? setPair(to, from) : setPair(from, c));

  // Get quote → Terms (first time) → chat with the trading desk.
  const getQuote = () => {
    if (!ready) return;
    inputRef.current?.blur();
    otc.requestQuote({ buy: to, pay: from, amount: cost });
    setAmount("");
  };
  const openTransfer = () => otc.set({ transfer: { asset: from, from: null, to: "otc" } });

  // Like a swap form: a tall "You pay" field takes the amount, a short
  // "You receive" field only picks the currency. OTC has no receive amount
  // until the dealer quotes, so none is shown.
  const isFocused = !!focused;
  const fillAll = () => {
    const f = 10 ** CCY[from].dp;
    setAmount(String(Math.floor(bal[from] * f) / f));
  };
  const payLabel = (
    <label className="otc-label" htmlFor="otc-pay">
      You pay
    </label>
  );
  const receiveLabel = (
    <label className="otc-label" htmlFor="otc-to">
      You receive
    </label>
  );
  const avail = (
    <span className="otc-avail">
      Avail.
      <b>
        {fmt(bal[from], CCY[from].dp)} {from}
      </b>
      <button type="button" className="otc-all" onMouseDown={(e) => e.preventDefault()} onClick={fillAll}>
        Max
      </button>
      <button type="button" className="otc-xfer" aria-label="Transfer to the OTC account" onMouseDown={(e) => e.preventDefault()} onClick={openTransfer}>
        <img src={`${IMG}/transfer.svg`} width="12" height="12" alt="" />
      </button>
    </span>
  );
  const payField = (
    <div className={`otc-amount is-pay${isFocused ? " is-focused" : ""}${isFocused || amount !== "" ? " is-up" : ""}${error ? " is-error" : ""}`}>
      {labelStyle === "trad" && (
        <div className="otc-amount-head">
          {payLabel}
          {avail}
        </div>
      )}
      <div
        className="otc-amount-box"
        onMouseDown={(e) => {
          if (e.target === inputRef.current || e.target.closest("button, select")) return;
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {labelStyle === "ifta" && (
          <div className="otc-amount-head">
            {payLabel}
            {avail}
          </div>
        )}
        <div className="otc-amount-row">
          <input
            ref={inputRef}
            id="otc-pay"
            className="otc-input"
            inputMode="decimal"
            autoComplete="off"
            spellCheck={false}
            placeholder={labelStyle === "float" && !isFocused ? "" : "0"}
            value={isFocused ? amount : group(amount)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "otc-amount-note" : undefined}
            onFocus={() => setFocused("pay")}
            onBlur={() => setFocused(null)}
            onChange={(e) => setAmount(clean(e.target.value, CCY[from].dp))}
          />
          <CcyChip label="Pay with" value={from} onOpen={() => setPicking("from")} />
        </div>
        {labelStyle === "float" && <div className="otc-amount-foot">{avail}</div>}
        {labelStyle === "float" && payLabel}
      </div>
    </div>
  );
  const receiveField = (
    <div className="otc-amount is-receive is-up">
      {labelStyle === "trad" && <div className="otc-amount-head">{receiveLabel}</div>}
      <div className="otc-amount-box">
        <div className="otc-amount-row">
          {labelStyle === "ifta" ? receiveLabel : <span className="otc-quote-hint">Amount set by the dealer’s quote</span>}
          <CcyChip label="Receive" value={to} onOpen={() => setPicking("to")} />
        </div>
        {labelStyle === "float" && receiveLabel}
      </div>
    </div>
  );

  const TABS = [
    ["ongoing", `Processing (${orders.filter((o) => o.state === "ongoing").length})`],
    ["filled", "Filled"],
    ["failed", "Expired / Rejected"],
  ];
  const list = orders.filter((o) => (tab === "failed" ? o.state === "expired" || o.state === "rejected" : o.state === tab));

  return (
    <div className={`otc otc-style-${labelStyle}`}>
      <TokenSheet
        open={!!picking}
        title={picking === "to" ? "Receive" : "Pay with"}
        value={picking === "to" ? to : from}
        onPick={(c) => (picking === "to" ? pickTo(c) : pickFrom(c))}
        onClose={() => setPicking(null)}
        options={TOKENS.map((c) => ({
          value: c,
          name: CCY[c].name,
          icon: <img src={`${IMG}/${CCY[c].icon}`} alt="" />,
          balance: fmt(bal[c] || 0, CCY[c].dp), // unit already shown on the left
          // USDT / USDC pairs are for Professional Investors only.
          disabled: !!CCY[c].pi,
          tag: CCY[c].pi ? "PI" : undefined,
        }))}
      />
      <div className="otc-controls">
        <div className="otc-fields">
          {payField}
          <button type="button" className="otc-swap" aria-label="Swap pay and receive currencies" onClick={() => setPair(to, from)}>
            <img src={`${IMG}/swap.svg`} width="16" height="16" alt="" />
          </button>
          {receiveField}
          {error && (
            <p id="otc-amount-note" className="otc-note" aria-live="polite">
              {error} You can pay up to {fmt(bal[from], CCY[from].dp)} {from}.{" "}
              <button type="button" className="otc-note-link" onClick={openTransfer}>
                Transfer from another account →
              </button>
            </p>
          )}
        </div>

        <button type="button" className={`otc-submit${ready ? " is-ready" : ""}`} disabled={!ready} onClick={getQuote}>
          {error ? "Insufficient balance" : ready ? "Get quote" : "Enter amount to continue"}
        </button>
      </div>

      <div className="otc-orders">
        <div className="otc-tabs">
          <div className="otc-tablist" role="tablist" aria-label="OTC orders">
            {TABS.map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={`otc-tab${tab === k ? " is-on" : ""}`}
                onClick={() => setTab(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <span className="otc-tools">
            <button type="button" className="otc-history" aria-label="About OTC Trade" onClick={() => setAbout(true)}>
              <svg width="16" height="16" viewBox="0 0 22 22" aria-hidden="true">
                <circle cx="11" cy="11" r="10" fill="none" stroke="rgba(0,0,0,0.6)" strokeWidth="1.8" />
                <path d="M11 10v6" stroke="rgba(0,0,0,0.6)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="11" cy="6.6" r="1.3" fill="rgba(0,0,0,0.6)" />
              </svg>
            </button>
            <button type="button" className="otc-history" aria-label="Order history" onClick={() => say?.("Order history isn’t in this prototype")}>
              <img src={`${import.meta.env.BASE_URL}images/trade/history.svg`} width="14" height="14" alt="" />
            </button>
          </span>
        </div>

        {list.length === 0 ? (
          <p className="otc-empty">No orders</p>
        ) : (
          list.map((o) => {
            const get = o.payAmt / o.rate;
            const dpGet = CCY[o.buy]?.dp ?? 4;
            const st = o.state === "ongoing" ? "Processing" : o.state === "filled" ? "Filled" : o.state === "expired" ? "Expired" : "Rejected";
            return (
              <button key={o.id} type="button" className="otc-order" onClick={() => otc.openOrder(o)}>
                <span className="otc-qid">
                  {o.id}
                  {tab === "failed" && <em className={`otc-state is-${o.state}`}>{st}</em>}
                </span>
                <div className="otc-order-pair">
                  <span className="otc-leg">
                    <img src={`${IMG}/${CCY[o.pay].icon}`} width="16" height="16" alt="" />
                    <b className="is-out">-{fmt(o.payAmt, CCY[o.pay].dp)}</b>
                    <i>{o.pay}</i>
                  </span>
                  <img src={`${IMG}/arrow-right.svg`} width="16" height="16" alt="" />
                  <span className="otc-leg is-end">
                    <img src={`${IMG}/${CCY[o.buy].icon}`} width="16" height="16" alt="" />
                    <b className="is-in">+{fmtDp(get, dpGet)}</b>
                    <i>{o.buy}</i>
                  </span>
                </div>
                <div className="otc-order-meta">
                  <span>
                    <b>1</b> <i>{o.buy}</i> <b>=</b> <b>{fmt(o.rate, CCY[o.pay].dp)}</b> <i>{o.pay}</i>
                  </span>
                  <span className="otc-time">{o.time}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
      <AboutSheet open={about} onClose={() => setAbout(false)} />
    </div>
  );
};

const ABOUT = [
  ["What is OTC Trading?", "OTC (Over-the-Counter) trading allows you to buy or sell large amounts of cryptocurrency directly with a dedicated trader, without placing orders on the open market. This ensures better pricing and minimal market impact for large trades."],
  ["How it works", "1. Select your trading pair and enter the amount.\n2. Request a quote from our trader.\n3. Review and accept or reject the quoted price.\n4. Confirm the trade to complete execution."],
  ["Minimum trade size", "The minimum trade size for OTC is USD 10,000 or equivalent. For institutional enquiries, please contact your account manager."],
  ["Settlement", "Trades are settled internally between your custody and OTC wallet. Funds are typically available within minutes of order execution."],
];
const AboutSheet = ({ open, onClose }) => (
  <PhoneLayer className="oc-layer">
    <div className={`oc-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
    <div className={`oc-sheet${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label="About OTC Trade" aria-hidden={!open}>
      <span className="oc-grab" aria-hidden="true" />
      <h2 className="oc-sheet-title">About OTC Trade</h2>
      <div className="oc-terms otc-about">
        {ABOUT.map(([h, p]) => (
          <section key={h}>
            <h3>{h}</h3>
            <p>{p}</p>
          </section>
        ))}
      </div>
    </div>
  </PhoneLayer>
);

export default OtcPanel;
