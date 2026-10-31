import React, { useRef, useState } from "react";
import "./OtcPanel.css";

// OTC section of the Trade page (Figma: OTC Chat Trading, 9231:100184).
// A tall "You pay" field (amount + currency) over a short "You receive" field
// (currency only: the amount comes with the dealer's quote); the swap button
// on the seam flips the pair. Both follow the
// prototype's input style switch: "ifta" puts the label inside at the top,
// "float" on the border, "trad" above the box.
const IMG = `${import.meta.env.BASE_URL}images/otc`;

const CCY = {
  USD: { icon: "flag-usd.svg", dp: 2, usd: 1 },
  BTC: { icon: "coin-btc.svg", dp: 6, usd: 127250 },
  ETH: { icon: "coin-eth.svg", dp: 4, usd: 3420 },
};
const START_BAL = { USD: 20029.62, BTC: 0.532161, ETH: 3.1234 };

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
const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const START_ORDERS = [
  { id: 396878, payCcy: "USD", pay: 50000, getCcy: "ETH", get: 14.6199, time: "2026-12-10 11:30:02" },
];

// Currency chip inside an amount field; the native picker sits on top so the
// phone's own list opens on tap.
const CcyChip = ({ id, label, value, onChange }) => (
  <span className="otc-chip">
    <img src={`${IMG}/${CCY[value].icon}`} width="20" height="20" alt="" />
    <b>{value}</b>
    <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" />
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      {Object.keys(CCY).map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  </span>
);

const OtcPanel = ({ labelStyle = "float", say }) => {
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("BTC");
  const [mode, setMode] = useState("pay"); // which side the amount is entered in
  const [amount, setAmount] = useState("");
  const [focused, setFocused] = useState(null); // "pay" | "receive" | null
  const [bal] = useState(START_BAL);
  const [orders, setOrders] = useState(START_ORDERS);
  const [filled] = useState([]);
  const [tab, setTab] = useState("processing");
  const inputRef = useRef(null);

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

  const getQuote = () => {
    if (!ready) return;
    const pay = mode === "pay" ? value : value * rate;
    const get = mode === "pay" ? value / rate : value;
    setOrders((o) => [
      { id: 396879 + o.length, payCcy: from, pay, getCcy: to, get, time: stamp() },
      ...o,
    ]);
    setTab("processing");
    setAmount("");
    inputRef.current?.blur();
    say?.("Quote requested — a dealer will reply in chat (prototype)");
  };

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
    </span>
  );
  const payField = (
    <div className={`otc-amount is-pay${isFocused ? " is-focused" : ""}${isFocused || amount !== "" ? " is-up" : ""}${error ? " is-error" : ""}`}>
      {labelStyle === "trad" && <div className="otc-amount-head">{payLabel}</div>}
      <div
        className="otc-amount-box"
        onMouseDown={(e) => {
          if (e.target === inputRef.current || e.target.closest("button, select")) return;
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        {labelStyle === "ifta" && <div className="otc-amount-head">{payLabel}</div>}
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
          <CcyChip id="otc-from" label="Pay with" value={from} onChange={pickFrom} />
        </div>
        <div className="otc-amount-foot">{avail}</div>
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
          <CcyChip id="otc-to" label="Receive" value={to} onChange={pickTo} />
        </div>
        {labelStyle === "float" && receiveLabel}
      </div>
    </div>
  );

  const list = tab === "processing" ? orders : filled;

  return (
    <div className={`otc otc-style-${labelStyle}`}>
      <div className="otc-controls">
        <div className="otc-fields">
          {payField}
          <button type="button" className="otc-swap" aria-label="Swap pay and receive currencies" onClick={() => setPair(to, from)}>
            <img src={`${IMG}/swap.svg`} width="16" height="16" alt="" />
          </button>
          {receiveField}
          {error && (
            <p id="otc-amount-note" className="otc-note" aria-live="polite">
              {error} You can pay up to {fmt(bal[from], CCY[from].dp)} {from}.
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
            {[
              ["processing", `Processing (${orders.length})`],
              ["filled", "Filled"],
            ].map(([k, l]) => (
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
          <button type="button" className="otc-history" aria-label="Order history" onClick={() => say?.("Order history isn’t in this prototype")}>
            <img src={`${import.meta.env.BASE_URL}images/trade/history.svg`} width="14" height="14" alt="" />
          </button>
        </div>

        {list.length === 0 ? (
          <p className="otc-empty">No filled quotes yet</p>
        ) : (
          list.map((o) => {
            const unitRate = o.pay / o.get;
            return (
              <div key={o.id} className="otc-order">
                <span className="otc-qid">Quote ID #{o.id}</span>
                <div className="otc-order-pair">
                  <span className="otc-leg">
                    <img src={`${IMG}/${CCY[o.payCcy].icon}`} width="16" height="16" alt="" />
                    <b className="is-out">-{fmt(o.pay, CCY[o.payCcy].dp)}</b>
                    <i>{o.payCcy}</i>
                  </span>
                  <img src={`${IMG}/arrow-right.svg`} width="16" height="16" alt="" />
                  <span className="otc-leg is-end">
                    <img src={`${IMG}/${CCY[o.getCcy].icon}`} width="16" height="16" alt="" />
                    <b className="is-in">+{fmt(o.get, CCY[o.getCcy].dp)}</b>
                    <i>{o.getCcy}</i>
                  </span>
                </div>
                <div className="otc-order-meta">
                  <span>
                    <b>1</b> <i>{o.getCcy}</i> <b>=</b> <b>{fmt(unitRate, CCY[o.payCcy].dp)}</b> <i>{o.payCcy}</i>
                  </span>
                  <span className="otc-time">{o.time}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default OtcPanel;
