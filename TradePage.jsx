import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { RuleIcon } from "./AuthSheet";
import "./TradePage.css";
import OtcPanel from "./OtcPanel";

// Order book trading (EXIO Mobile, Figma 19477:24818). The Price, Quantity
// and Total fields follow the prototype's input style switch (floating label,
// IFTA or traditional), built the same way as the sign-up fields rather than
// the Figma field. Market data is simulated and ticks every couple of seconds.

const ICON = `${import.meta.env.BASE_URL}images/trade`;

const PAIR = { base: "BTC", quote: "USDT" };
const START_PRICE = 127278.34;
const PRICE_STEP = 2.5; // order book price spacing
const BOOK_ROWS = 9;
const MIN_QTY = 0.0001;
const DECIMALS = { price: 2, qty: 5, total: 2 };
const TIFS = [
  { key: "GTC", label: "Good till cancelled" },
  { key: "IOC", label: "Immediate or cancel" },
  { key: "FOK", label: "Fill or kill" },
];

/* ---------- Numbers ---------- */
const fmt = (n, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "";
const num = (s) => {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// Keep digits and one dot, at most `d` decimals.
const clean = (s, d) => {
  let v = String(s).replace(/,/g, "").replace(/[^\d.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, d);
  if (/^0\d/.test(v)) v = v.replace(/^0+(?=\d)/, "");
  return v;
};
// "1234567.5" -> "1,234,567.5" (grouping only, keeps what was typed)
const group = (s) => {
  if (s === "") return "";
  const [i, f] = String(s).split(".");
  return Number(i || 0).toLocaleString("en-US") + (f !== undefined ? "." + f : "");
};
const trimQty = (n) => (n > 0 ? String(Math.floor(n * 1e5) / 1e5) : "");
const now = () => {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/* ---------- Simulated market ---------- */
const seedQty = () => Math.round((0.02 + Math.random() * 0.6) * 1e6) / 1e6;
const makeBook = (mid) => ({
  asks: Array.from({ length: BOOK_ROWS }, (_, i) => ({ price: mid + PRICE_STEP * (BOOK_ROWS - i), qty: seedQty() })),
  bids: Array.from({ length: BOOK_ROWS }, (_, i) => ({ price: mid - PRICE_STEP * (i + 1), qty: seedQty() })),
});

const useMarket = () => {
  const [last, setLast] = useState(START_PRICE);
  const [dir, setDir] = useState(1);
  const [book, setBook] = useState(() => makeBook(START_PRICE));
  useEffect(() => {
    const id = setInterval(() => {
      setLast((p) => {
        const next = Math.round((p + (Math.random() - 0.48) * 18) * 100) / 100;
        setDir(next >= p ? 1 : -1);
        setBook((b) => {
          const fresh = makeBook(next);
          // Keep most sizes so the book shifts rather than reshuffles.
          const keep = (arr, old) => arr.map((r, i) => ({ ...r, qty: Math.random() < 0.35 ? seedQty() : old[i].qty }));
          return { asks: keep(fresh.asks, b.asks), bids: keep(fresh.bids, b.bids) };
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(id);
  }, []);
  return { last, dir, book };
};

/* ---------- IFTA field (prototype style) ---------- */
const ClearIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
  </svg>
);

const TradeField = ({ id, label, unit, value, onChange, placeholder, disabled, disabledText, error, note, decimals, inputRef, labelStyle = "float" }) => {
  const [focused, setFocused] = useState(false);
  const ownRef = useRef(null);
  const ref = inputRef || ownRef;
  const shown = focused ? value : group(value);
  // Floating label: it sits in the empty field and moves up onto the border
  // once the field is focused, filled or showing static text.
  const up = focused || value !== "" || disabled;
  const labelEl = (
    <label className="tp-label" htmlFor={id}>
      {label}
    </label>
  );
  const row = (
    <div className="tp-row">
      {disabled ? (
        <span className="tp-static">{disabledText}</span>
      ) : (
        <input
          ref={ref}
          id={id}
          className="tp-input"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          // With a floating label, the label stands in for the placeholder until focus.
          placeholder={labelStyle === "float" && !focused ? "" : placeholder}
          value={shown}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || note ? `${id}-note` : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => onChange(clean(e.target.value, decimals))}
        />
      )}
      {focused && value !== "" && (
        <button
          type="button"
          className="tp-clear"
          aria-label={`Clear ${label.toLowerCase()}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
        >
          <ClearIcon />
        </button>
      )}
      <span className="tp-unit">{unit}</span>
    </div>
  );
  return (
    <div className={`tp-field${focused ? " is-focused" : ""}${up ? " is-up" : ""}${error ? " is-error" : ""}${disabled ? " is-disabled" : ""}`}>
      {labelStyle === "trad" && labelEl}
      <div
        className="tp-box"
        onMouseDown={(e) => {
          if (disabled || e.target === ref.current || e.target.closest("button")) return;
          e.preventDefault();
          ref.current?.focus();
        }}
      >
        {labelStyle === "ifta" ? (
          <div className="tp-ifta">
            {labelEl}
            {row}
          </div>
        ) : (
          row
        )}
      </div>
      {labelStyle === "float" && labelEl}
      {(error || note) && (
        <p id={`${id}-note`} className={`tp-note${error ? " is-error" : ""}`} aria-live={error ? "polite" : undefined}>
          {error || note}
        </p>
      )}
    </div>
  );
};

/* ---------- Percentage slider (0 / 25 / 50 / 75 / 100) ---------- */
const PercentSlider = ({ value, onChange, tone }) => {
  const ref = useRef(null);
  const [drag, setDrag] = useState(false);
  const pctAt = (x) => {
    const r = ref.current.getBoundingClientRect();
    let p = Math.max(0, Math.min(100, ((x - r.left) / r.width) * 100));
    // Snap to a stop when close to it.
    for (const s of [0, 25, 50, 75, 100]) if (Math.abs(p - s) < 3) p = s;
    return Math.round(p);
  };
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      ref={ref}
      className={`tp-slider tp-${tone}${drag ? " is-dragging" : ""}`}
      role="slider"
      tabIndex={0}
      aria-label="Share of available balance"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-valuetext={`${Math.round(v)}%`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag(true);
        onChange(pctAt(e.clientX));
      }}
      onPointerMove={(e) => drag && onChange(pctAt(e.clientX))}
      onPointerUp={() => setDrag(false)}
      onPointerCancel={() => setDrag(false)}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 25 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -25 : 0;
        if (!step) return;
        e.preventDefault();
        onChange(Math.max(0, Math.min(100, Math.round(v / 25) * 25 + step)));
      }}
    >
      <span className="tp-slider-track" />
      <span className="tp-slider-fill" style={{ width: `${v}%` }} />
      {[0, 25, 50, 75, 100].map((s) => (
        <span key={s} className={`tp-slider-stop${v >= s ? " is-on" : ""}`} style={{ left: `${s}%` }} />
      ))}
      <span className="tp-slider-thumb" style={{ left: `${v}%` }}>
        <span className="tp-slider-tip">{Math.round(v)}%</span>
      </span>
    </div>
  );
};

/* ---------- Order book ---------- */
const OrderBook = ({ book, last, dir, showTotal, onToggleUnit, onPick }) => {
  const depth = (rows) => {
    let c = 0;
    return rows.map((r) => (c += r.qty));
  };
  // Cumulative from the middle outwards: asks are listed high to low.
  const askCum = depth([...book.asks].reverse()).reverse();
  const bidCum = depth(book.bids);
  const max = Math.max(askCum[0] || 1, bidCum[bidCum.length - 1] || 1);
  const row = (r, cum, side) => (
    <button
      type="button"
      key={`${side}-${r.price}`}
      className={`tp-book-row is-${side}`}
      onClick={() => onPick(r.price)}
      aria-label={`${side === "ask" ? "Ask" : "Bid"} ${fmt(r.price)}, use this price`}
    >
      <span className="tp-book-depth" style={{ width: `${(cum / max) * 100}%` }} />
      <span className="tp-book-price">{fmt(r.price)}</span>
      <span className="tp-book-qty">{showTotal ? fmt(r.price * r.qty, 2) : fmt(r.qty, 6)}</span>
    </button>
  );
  return (
    <section className="tp-book" aria-label="Order book">
      <div className="tp-book-head">
        <div>
          <span>Price</span>
          <span className="tp-dim">{PAIR.quote}</span>
        </div>
        <button type="button" className="tp-book-unit" onClick={onToggleUnit} aria-label={showTotal ? "Show quantity in BTC" : "Show total in USDT"}>
          <span className="tp-book-unit-top">
            {showTotal ? "Total" : "Qty"}
            <img src={`${ICON}/up-down.svg`} width="12" height="12" alt="" />
          </span>
          <span className="tp-dim">{showTotal ? PAIR.quote : PAIR.base}</span>
        </button>
      </div>
      <div className="tp-book-side">{book.asks.map((r, i) => row(r, askCum[i], "ask"))}</div>
      <button type="button" className="tp-book-mid" onClick={() => onPick(last)} aria-label={`Last price ${fmt(last)}, use this price`}>
        <span className={`tp-book-last ${dir >= 0 ? "is-up" : "is-down"}`}>{fmt(last)}</span>
        <span className="tp-book-usd">
          ≈{fmt(last * 0.9998)} <span>USD</span>
        </span>
      </button>
      <div className="tp-book-side">{book.bids.map((r, i) => row(r, bidCum[i], "bid"))}</div>
    </section>
  );
};

/* ---------- Open orders and assets ---------- */
const COIN_ICON = { BTC: "coin-btc", ETH: "coin-eth", AAVE: "coin-aave" };
const START_ORDERS = [
  { id: 1, base: "BTC", side: "buy", type: "Limit", price: 125800, qty: 0.12, filled: 0.0421, time: "2026-10-27 09:12:45" },
  { id: 2, base: "ETH", side: "sell", type: "Limit", price: 2678.56, qty: 12.67833, filled: 0, time: "2026-10-26 22:40:11" },
  { id: 3, base: "BTC", side: "buy", type: "Limit", price: 124500, qty: 0.25, filled: 0, time: "2026-10-26 18:03:27" },
];

const OrderRow = ({ o, onEdit, onCancel }) => (
  <li className="tp-order">
    <div className="tp-order-top">
      <span className={`tp-order-stripe is-${o.side}`} aria-hidden="true" />
      <img src={`${ICON}/${COIN_ICON[o.base]}.svg`} width="21" height="20" alt="" />
      <span className="tp-order-pair">
        {o.base}
        <span>/USDT</span>
      </span>
      <span className={`tp-order-type is-${o.side}`}>
        {o.type} {o.side === "buy" ? "Buy" : "Sell"}
      </span>
    </div>
    <div className="tp-order-grid">
      <div>
        <span className="tp-k">Filled / Order quantity</span>
        <span className="tp-v">
          <span className={`is-${o.side}`}>{fmt(o.filled, 5)}</span>
          <span className="tp-dim"> / </span>
          {fmt(o.qty, 5)}
        </span>
      </div>
      <div className="tp-order-col">
        <span className="tp-k">Order price</span>
        <span className="tp-v">{fmt(o.price)}</span>
      </div>
      <div>
        <span className="tp-k">Total value (USDT)</span>
        <span className="tp-v">{fmt(o.price * o.qty)}</span>
      </div>
      <div className="tp-order-col">
        <span className="tp-k tp-time">{o.time}</span>
        <span className="tp-order-actions">
          <button type="button" className="tp-pill" onClick={() => onEdit(o)}>
            Edit
          </button>
          <button type="button" className="tp-pill" onClick={() => onCancel(o)}>
            Cancel
          </button>
        </span>
      </div>
    </div>
  </li>
);

/* ---------- Page ---------- */
const TradePage = ({ labelStyle = "float" }) => {
  const { last, dir, book } = useMarket();
  const [venue, setVenue] = useState("book"); // "otc" | "book"
  const [side, setSide] = useState("buy");
  const [type, setType] = useState("Limit");
  const [price, setPrice] = useState(String(START_PRICE));
  const [qty, setQty] = useState("");
  const [total, setTotal] = useState("");
  const [driver, setDriver] = useState("qty"); // which of qty / total the user set last
  const [postOnly, setPostOnly] = useState(false);
  const [tif, setTif] = useState("GTC");
  const [tifOpen, setTifOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [balances, setBalances] = useState({ USDT: 112345.78, BTC: 1.2505 });
  const [orders, setOrders] = useState(START_ORDERS);
  const [listTab, setListTab] = useState("orders");
  const [onlyPair, setOnlyPair] = useState(false);
  const [showTotal, setShowTotal] = useState(false);
  const [fav, setFav] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const qtyRef = useRef(null);
  const priceRef = useRef(null);
  const scrollRef = useRef(null);

  const say = useCallback((t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const isMarket = type === "Market";
  const p = isMarket ? last : num(price);
  // Quantity and total stay linked through the price: whichever the user
  // typed last drives the other.
  const q = driver === "qty" ? num(qty) : p > 0 ? Math.floor((num(total) / p) * 1e5) / 1e5 : 0;
  const t = driver === "total" ? num(total) : q * p;
  const qtyStr = driver === "qty" ? qty : trimQty(q);
  const totalStr = driver === "total" ? total : t > 0 ? t.toFixed(2) : "";

  const avail = side === "buy" ? balances.USDT : balances.BTC;
  const maxQty = side === "buy" ? (p > 0 ? avail / p : 0) : avail;
  const pct = maxQty > 0 ? (q / maxQty) * 100 : 0;

  // Errors: balance problems show as soon as they happen; missing values
  // only after the user has tried to place the order.
  const errors = {};
  if (!isMarket && submitted && !(num(price) > 0)) errors.price = "Enter a price.";
  if (submitted && !(q > 0)) errors.qty = "Enter a quantity.";
  else if (q > 0 && q < MIN_QTY) errors.qty = `Minimum is ${MIN_QTY} ${PAIR.base}.`;
  if (side === "sell" && q > balances.BTC + 1e-9) errors.qty = `Not enough ${PAIR.base}. Available ${fmt(balances.BTC, 5)}.`;
  if (side === "buy" && t > balances.USDT + 1e-6) errors.total = `Not enough ${PAIR.quote}. Available ${fmt(balances.USDT)}.`;

  const setPct = (v) => {
    setDriver("qty");
    setQty(trimQty((maxQty * v) / 100));
  };
  const switchSide = (s) => {
    setSide(s);
    setSubmitted(false);
  };
  const pickPrice = (pr) => {
    if (isMarket) setType("Limit");
    setPrice(pr.toFixed(2));
    say(`Price set to ${fmt(pr)}`);
  };

  const place = () => {
    setSubmitted(true);
    const missing = (!isMarket && !(num(price) > 0)) || !(q > 0);
    if (missing || Object.keys(errors).length) {
      (!isMarket && !(num(price) > 0) ? priceRef : qtyRef).current?.focus();
      return;
    }
    const amount = Math.floor(q * 1e5) / 1e5;
    if (isMarket) {
      setBalances((b) =>
        side === "buy" ? { USDT: b.USDT - amount * last, BTC: b.BTC + amount } : { USDT: b.USDT + amount * last, BTC: b.BTC - amount }
      );
      say(`${side === "buy" ? "Bought" : "Sold"} ${fmt(amount, 5)} ${PAIR.base} at ${fmt(last)}`);
    } else {
      const o = { id: Date.now(), base: "BTC", side, type: "Limit", price: num(price), qty: amount, filled: 0, time: now() };
      setOrders((os) => [o, ...os]);
      // Funds are held while the order is open.
      setBalances((b) => (side === "buy" ? { ...b, USDT: b.USDT - amount * o.price } : { ...b, BTC: b.BTC - amount }));
      setListTab("orders");
      say(`Limit ${side} order placed${postOnly ? " (post only)" : ""}, ${tif}`);
    }
    setQty("");
    setTotal("");
    setDriver("qty");
    setSubmitted(false);
  };

  const release = (o) => {
    if (o.base !== "BTC") return;
    const open = o.qty - o.filled;
    setBalances((b) => (o.side === "buy" ? { ...b, USDT: b.USDT + open * o.price } : { ...b, BTC: b.BTC + open }));
  };
  const cancel = (o) => {
    setOrders((os) => os.filter((x) => x.id !== o.id));
    release(o);
    say(`${o.base}/USDT ${o.side} order cancelled`);
  };
  const edit = (o) => {
    if (o.base !== "BTC") {
      say("Switch to ETH/USDT to edit this order — not in this prototype");
      return;
    }
    setOrders((os) => os.filter((x) => x.id !== o.id));
    release(o);
    setSide(o.side);
    setType("Limit");
    setPrice(o.price.toFixed(2));
    setDriver("qty");
    setQty(trimQty(o.qty - o.filled));
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    say("Order moved to the form. Adjust it and place it again.");
  };
  const visible = onlyPair ? orders.filter((o) => o.base === "BTC") : orders;
  const cancelAll = () => {
    if (!visible.length) return;
    visible.forEach(release);
    const ids = new Set(visible.map((o) => o.id));
    setOrders((os) => os.filter((o) => !ids.has(o.id)));
    say(`${visible.length} order${visible.length > 1 ? "s" : ""} cancelled`);
  };

  // Close the time-in-force menu on outside tap.
  useEffect(() => {
    if (!tifOpen) return undefined;
    const off = (e) => !e.target.closest(".tp-tif") && setTifOpen(false);
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [tifOpen]);

  const assets = useMemo(
    () => [
      { base: "BTC", qty: balances.BTC, price: last },
      { base: "AAVE", qty: 121.1232, price: 242.983 },
      { base: "ETH", qty: 3.1234, price: 2894.78 },
    ],
    [balances.BTC, last]
  );

  return (
    <div className="tp-wrap">
    <div className="tp" ref={scrollRef}>
      <header className="tp-head">
        <div className="tp-seg" role="tablist" aria-label="Trading venue">
          {[
            ["otc", "OTC"],
            ["book", "Order book"],
          ].map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={venue === k} className={`tp-seg-item${venue === k ? " is-on" : ""}`} onClick={() => setVenue(k)}>
              {l}
            </button>
          ))}
        </div>
        {venue === "book" && (
          <>
        <div className="tp-pair">
          <button type="button" className="tp-pair-name" onClick={() => say("Pair list isn’t in this prototype")}>
            <img src={`${ICON}/menu.svg`} width="16" height="16" alt="" />
            BTC/USDT
          </button>
          <span className="tp-ri">RI</span>
          <span className="tp-change is-up">1.44%</span>
          <button
            type="button"
            className={`tp-fav${fav ? " is-on" : ""}`}
            aria-pressed={fav}
            aria-label={fav ? "Remove from favourites" : "Add to favourites"}
            onClick={() => {
              setFav((f) => !f);
              say(fav ? "Removed from favourites" : "Added to favourites");
            }}
          >
            <img src={`${ICON}/fav.svg`} width="14" height="14" alt="" />
          </button>
          <span className={`tp-last ${dir >= 0 ? "is-up" : "is-down"}`}>{fmt(last)}</span>
        </div>
        <div className="tp-stats">
          <dl>
            <div>
              <dt>24h Vol.</dt>
              <dd>188.633M</dd>
            </div>
            <div>
              <dt>24h high</dt>
              <dd>129,232.89</dd>
            </div>
            <div>
              <dt>24h low</dt>
              <dd>99,345.22</dd>
            </div>
          </dl>
          <button type="button" className="tp-chart" aria-label="Show chart" onClick={() => say("Chart isn’t in this prototype")}>
            <img src={`${ICON}/kline.svg`} width="20" height="20" alt="" />
            <img src={`${ICON}/arrow-down.svg`} width="12" height="12" alt="" />
          </button>
        </div>
          </>
        )}
      </header>

      {venue === "otc" ? (
        <OtcPanel labelStyle={labelStyle} say={say} />
      ) : (
        <>
          <div className="tp-main">
            <section className={`tp-entry is-${side} tp-style-${labelStyle}`} aria-label="Place an order">
              <div className="tp-side" role="tablist" aria-label="Order side">
                <button type="button" role="tab" aria-selected={side === "buy"} className={`tp-side-btn is-buy${side === "buy" ? " is-on" : ""}`} onClick={() => switchSide("buy")}>
                  Buy
                </button>
                <button type="button" role="tab" aria-selected={side === "sell"} className={`tp-side-btn is-sell${side === "sell" ? " is-on" : ""}`} onClick={() => switchSide("sell")}>
                  Sell
                </button>
              </div>

              <div className="tp-tabs" role="tablist" aria-label="Order type">
                {["Limit", "Market"].map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={type === k} className={`tp-tab${type === k ? " is-on" : ""}`} onClick={() => setType(k)}>
                    {k}
                  </button>
                ))}
              </div>

              <TradeField
                labelStyle={labelStyle}
                id="tp-price"
                label="Price"
                unit={PAIR.quote}
                value={price}
                onChange={setPrice}
                placeholder="0.00"
                decimals={DECIMALS.price}
                disabled={isMarket}
                disabledText="Best market price"
                error={errors.price}
                note={`≈${p > 0 ? fmt(p * 0.9998) : "--"} USD`}
                inputRef={priceRef}
              />

              <TradeField
                labelStyle={labelStyle}
                id="tp-qty"
                label="Quantity"
                unit={PAIR.base}
                value={qtyStr}
                onChange={(v) => {
                  setDriver("qty");
                  setQty(v);
                }}
                placeholder={`Min ${MIN_QTY}`}
                decimals={DECIMALS.qty}
                error={errors.qty}
                inputRef={qtyRef}
              />

              <PercentSlider value={pct} onChange={setPct} tone={side} />

              <TradeField
                labelStyle={labelStyle}
                id="tp-total"
                label={isMarket ? "Total (estimated)" : "Total value"}
                unit={PAIR.quote}
                value={totalStr}
                onChange={(v) => {
                  setDriver("total");
                  setTotal(v);
                }}
                placeholder="0.00"
                decimals={DECIMALS.total}
                error={errors.total}
                note={`≈${t > 0 ? fmt(t * 0.9998) : "--"} USD`}
              />

              {!isMarket && (
                <div className="tp-opts">
                  <button type="button" className={`tp-check${postOnly ? " is-on" : ""}`} role="checkbox" aria-checked={postOnly} onClick={() => setPostOnly((v) => !v)}>
                    <RuleIcon size={18} />
                    Post only
                  </button>
                  <div className="tp-tif">
                    <button type="button" className="tp-tif-btn" aria-haspopup="listbox" aria-expanded={tifOpen} onClick={() => setTifOpen((o) => !o)}>
                      {tif}
                      <img src={`${ICON}/arrow-down.svg`} width="12" height="12" alt="" className={tifOpen ? "is-open" : ""} />
                    </button>
                    {tifOpen && (
                      <ul className="tp-tif-menu" role="listbox" aria-label="Time in force">
                        {TIFS.map((o) => (
                          <li key={o.key}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={tif === o.key}
                              className={tif === o.key ? "is-on" : ""}
                              onClick={() => {
                                setTif(o.key);
                                setTifOpen(false);
                              }}
                            >
                              <strong>{o.key}</strong>
                              <span>{o.label}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              <dl className="tp-avail">
                <div>
                  <dt>Available</dt>
                  <dd>
                    {side === "buy" ? fmt(balances.USDT) : fmt(balances.BTC, 5)}
                    <span className="tp-dim"> {side === "buy" ? PAIR.quote : PAIR.base}</span>
                    <button type="button" className="tp-transfer" aria-label="Transfer funds" onClick={() => say("Transfers aren’t in this prototype")}>
                      <img src={`${ICON}/transfer-sm.svg`} width="12" height="12" alt="" />
                    </button>
                  </dd>
                </div>
                <div>
                  <dt className={`is-${side}`}>{side === "buy" ? "Max buy" : "Max sell"}</dt>
                  <dd>
                    {side === "buy" ? fmt(maxQty, 5) : fmt(balances.BTC * p)}
                    <span className="tp-dim"> {side === "buy" ? PAIR.base : PAIR.quote}</span>
                  </dd>
                </div>
              </dl>

              <button type="button" className={`tp-submit is-${side}`} onClick={place}>
                {side === "buy" ? "Buy" : "Sell"} {PAIR.base}
              </button>
            </section>

            <OrderBook book={book} last={last} dir={dir} showTotal={showTotal} onToggleUnit={() => setShowTotal((v) => !v)} onPick={pickPrice} />
          </div>

          <section className="tp-list" aria-label="Your orders and assets">
            <div className="tp-list-tabs">
              <div role="tablist" aria-label="Orders and assets">
                <button type="button" role="tab" aria-selected={listTab === "orders"} className={`tp-tab tp-tab-lg${listTab === "orders" ? " is-on" : ""}`} onClick={() => setListTab("orders")}>
                  Open orders ({orders.length})
                </button>
                <button type="button" role="tab" aria-selected={listTab === "assets"} className={`tp-tab tp-tab-lg${listTab === "assets" ? " is-on" : ""}`} onClick={() => setListTab("assets")}>
                  Assets
                </button>
              </div>
              <button type="button" className="tp-icon-btn" aria-label="Order history" onClick={() => say("Order history isn’t in this prototype")}>
                <img src={`${ICON}/history.svg`} width="14" height="14" alt="" />
              </button>
            </div>

            {listTab === "orders" ? (
              <>
                <div className="tp-list-bar">
                  <button type="button" className={`tp-check${onlyPair ? " is-on" : ""}`} role="checkbox" aria-checked={onlyPair} onClick={() => setOnlyPair((v) => !v)}>
                    <RuleIcon size={18} />
                    Current symbol
                  </button>
                  <button type="button" className="tp-pill" onClick={cancelAll} disabled={!visible.length}>
                    Cancel all
                  </button>
                </div>
                {visible.length ? (
                  <ul className="tp-orders">
                    {visible.map((o) => (
                      <OrderRow key={o.id} o={o} onEdit={edit} onCancel={cancel} />
                    ))}
                  </ul>
                ) : (
                  <p className="tp-none">No open orders{onlyPair ? " for BTC/USDT" : ""}.</p>
                )}
              </>
            ) : (
              <ul className="tp-assets">
                {assets.map((a) => (
                  <li key={a.base} className="tp-asset">
                    <span className="tp-asset-name">
                      <img src={`${ICON}/${COIN_ICON[a.base]}.svg`} width="21" height="20" alt="" />
                      {a.base}
                    </span>
                    <div className="tp-asset-grid">
                      <div>
                        <span className="tp-k">Quantity</span>
                        <span className="tp-v">{fmt(a.qty, 4)}</span>
                      </div>
                      <div>
                        <span className="tp-k">Index price</span>
                        <span className="tp-v">{fmt(a.price, a.price < 1000 ? 3 : 2)}</span>
                      </div>
                      <div className="is-end">
                        <span className="tp-k">Total value (USD)</span>
                        <span className="tp-v">{fmt(a.qty * a.price)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

    </div>
      <div className={`tp-toast${toast ? " is-shown" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
};

export default TradePage;
