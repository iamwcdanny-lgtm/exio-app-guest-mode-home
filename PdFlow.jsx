import React, { useEffect, useMemo, useRef, useState } from "react";
import { LOGO, RISK, Star, CloseIcon, Info } from "./RwaPage";
import { DETAIL } from "./RwaDetailData";
import TokenSheet, { ChipCaret } from "./TokenSheet";
import { useOtc, IMG as OTC_IMG } from "./OtcSession";
import "./PdFlow.css";

// RWA primary distribution (PD): product detail, then Subscribe / Redeem.
// Rules follow FLOW.md, pd-automation-api.md and the PD design addendum
// (2026-10-28):
//   Round 1 eligibility runs continuously, first failure wins, and decides the
//   banner and whether Submit is locked. Subscribe-only checks never block
//   Redeem.
//   Amount validation: min / max / lot size, and Redeem's minimum holding.
//   Round 2 after Submit, one at a time: risk mismatch, concentration (both
//   Subscribe only), then the three agreements, then the order confirmation.
//   Order Received is a demonstration: nothing is submitted.
//
// The account state comes from the demo settings (PD_SETTINGS). PD attribute
// values (fees, limits, lot sizes), balances, NAVs and the agreement text are
// placeholders for the prototype.

/* ---------- Demo account state ---------- */
export const PD_SETTINGS = [
  { key: "acct", label: "Account", options: [["individual", "Individual"], ["corporate", "Corporate"], ["institutional", "Institutional"], ["lpmm", "LP / MM"]] },
  { key: "verified", label: "Verification", options: [["yes", "Verified"], ["no", "Not verified"]] },
  { key: "otc", label: "OTC trading", options: [["on", "On"], ["off", "Off"]] },
  { key: "pi", label: "OTC-PI (PI products)", options: [["yes", "Yes"], ["no", "No"]] },
  { key: "country", label: "Country", options: [["ok", "Eligible"], ["blocked", "Not eligible"]] },
  { key: "suit", label: "Suitability", options: [["valid", "Valid"], ["expired", "Expired"], ["wait", "Expired, must wait"]] },
  { key: "rating", label: "Risk rating", options: [["3", "Growth"], ["4", "Aggressive"], ["5", "Very aggressive"]] },
  { key: "dka", label: "DKA", options: [["passed", "Passed"], ["3", "Not passed · 3 left"], ["2", "Not passed · 2 left"], ["1", "Not passed · 1 left"], ["0", "Not passed · 0 left"]] },
  { key: "pos", label: "Position limit", options: [["ok", "Available"], ["used", "Fully used"]] },
  { key: "conc", label: "Concentration limit", options: [["ok", "Available"], ["reached", "Reached"]] },
  { key: "hold", label: "Holding", options: [["ok", "1,000 units"], ["low", "Below minimum"], ["none", "None"]] },
];
export const PD_DEFAULT = Object.fromEntries(PD_SETTINGS.map((s) => [s.key, s.key === "rating" ? "4" : s.options[0][0]]));

/* ---------- Product PD config (placeholders) ---------- */
const DERIVATIVE = new Set(["XAUm", "EXCB25"]);
// Subscription balances live in the shared PD account (OtcSession s.bal.pd), so a
// transfer from the Avail. row tops them up.
const FIAT = new Set(["USD", "HKD"]);
const FLAG = { USD: "🇺🇸", HKD: "🇭🇰", USDC: "◎", USDT: "₮" };
const CCY_NAME = { USD: "US Dollar", HKD: "Hong Kong Dollar", USDC: "USD Coin", USDT: "Tether" };
const RISK_CODE = ["", "VL", "L", "M", "H", "VH"];
const MIN_RATING = { VL: 4, L: 4, M: 4, H: 4, VH: 5 }; // api §5.4
const RATING_NAME = { 3: "Growth", 4: "Aggressive", 5: "Very aggressive" };

const attr = (p) => ({
  subscribeInitialNotional: 50,
  subscribeMinNotional: 20,
  subscribeMaxNotional: 10000,
  subscribeLotSize: 1,
  subscribeFeePct: 0.02,
  subscribeHandlingFeeQty: 0.2,
  redeemMinHoldingQty: 10,
  redeemMinQty: 1,
  redeemMaxQty: 2000,
  redeemLotSize: 0.1,
  redeemPlatformFeePct: 0.02,
  redeemHandlingFeeQty: 0.01, // in product units: redemption fees are charged in the asset being paid
  hasDerivatives: DERIVATIVE.has(p.symbol),
  settlementPeriod: settlementText(p),
});
function settlementText(p) {
  const d = p.meta.replace("Tokenised · ", "");
  if (/T\+\d/.test(d)) return `Orders settle ${d.match(/T\+\d/)[0]} after the dealing day (${d.split(" · ").slice(1).join(", ") || "daily dealing"}). Cut-off times follow the fund’s dealing rules.`;
  if (/Real-time/.test(d)) return "Tokens are issued or redeemed on-chain once the order is processed. Physical delivery is not available.";
  return `Orders are processed on the next dealing day (${d}). Settlement can take several business days after the dealing day.`;
}
const holdingQty = (u) => (u.hold === "ok" ? 1000 : u.hold === "low" ? 6.5 : 0);

/* ---------- Numbers ---------- */
const fmt = (n, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (s) => {
  const n = parseFloat(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const isStep = (v, step) => Math.abs(Math.round(v / step) * step - v) < 1e-9;
const floorStep = (v, step) => Math.floor(v / step + 1e-9) * step;

/* ---------- Round 1: eligibility (first failure wins) ---------- */
const DAY = 86400000;
const waitDays = 12; // demo: days until the oldest attempt leaves the 30-day window
const retryDate = () => new Date(Date.now() + waitDays * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function eligibility(u, p, instr) {
  const sub = instr === "subscribe";
  const corp = u.acct === "corporate" || u.acct === "institutional";
  if (u.acct === "lpmm") return { id: "lpmm", shared: true, text: "Products on this page are not available for your account type. Contact cs@ex.io if this is an error." };
  if (u.verified === "no") return { id: "verify", shared: true, text: "Complete identity verification before you subscribe or redeem.", action: "Verify now" };
  if (u.otc === "off") return { id: "otc", shared: true, text: "Your account is not eligible for RWA trading. Contact cs@ex.io for assistance." };
  if (sub && p.badge === "PI" && u.pi === "no") return { id: "pi", text: "This product is only available to Professional Investors for subscription. You can still redeem holdings.", action: "Apply now" };
  if (u.country === "blocked") return { id: "country", shared: true, text: "This product is not available in your account’s registered jurisdiction. Please contact us if your profile details need to be updated.", action: "Contact us" };
  if (sub && corp) {
    if (u.suit !== "valid") return { id: "corpExpired", text: "Your corporate suitability assessment has expired. Please contact your Relationship Manager to renew it before subscribing to this product." };
    if (Number(u.rating) < 4) return { id: "corpRating", text: "Your corporate risk rating doesn’t meet the requirement for this product. Please contact your Relationship Manager to review your assessment." };
  }
  if (sub && !corp && u.suit !== "valid")
    return u.suit === "wait"
      ? { id: "rpqWait", text: `Your suitability assessment has expired. You can retake it in ${waitDays} days, on ${retryDate()}.`, action: "Take suitability assessment", disabled: true }
      : { id: "rpq", text: "Your suitability assessment has expired. Retake it to subscribe. Attempts left: 2 (to be confirmed).", action: "Take suitability assessment" };
  if (sub && attr(p).hasDerivatives && u.acct !== "institutional" && u.dka !== "passed")
    return u.dka === "0"
      ? { id: "dkaWait", text: `This product includes derivatives. You’ve used all 3 Derivative Knowledge Assessment attempts in the last 30 days. You can try again in ${waitDays} days, on ${retryDate()}.`, action: "Complete Derivative Assessment" }
      : { id: "dka", text: "This product includes derivatives and requires completion of the Derivative Knowledge Assessment before subscribing.", action: "Complete Derivative Assessment" };
  if (sub && u.pos === "used") return { id: "pos", text: "You’ve used your full position limit, so you can’t subscribe right now. Subscriptions reopen when your position limit frees up. You can still redeem." };
  return null;
}

/* ---------- Shared bits ---------- */
const Back = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Warn = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" fill="#f7a042" />
    <path d="M8 4.5v4.2" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="8" cy="11.2" r=".95" fill="#fff" />
  </svg>
);
const Banner = ({ g, onAction, flush }) =>
  g ? (
    <div className={`pd-banner${flush ? " is-flush" : ""}`} role="status">
      <Warn />
      <div>
        <p>{g.text}</p>
        {g.action && (
          <button type="button" className="pd-banner-act" disabled={g.disabled} onClick={() => onAction(g)}>
            {g.action}
          </button>
        )}
      </div>
    </div>
  ) : null;

const Illo = ({ kind }) => (
  <div className={`pd-illo is-${kind}`} aria-hidden="true">
    <span className="pd-illo-back" />
    <span className="pd-illo-front">
      {kind === "warn" && (
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M20 9v14" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
          <circle cx="20" cy="30" r="2.6" fill="#fff" />
        </svg>
      )}
      {kind === "ok" && (
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M11 21l6 6 12-13" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {kind === "clock" && (
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M20 10v11l6 6" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  </div>
);

// Bottom sheet over the PD screens.
const PdSheet = ({ open, onClose, children, full, label }) => {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <>
      <div className={`pd-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <div className={`pd-sheet${open ? " is-open" : ""}${full ? " is-full" : ""}`} role="dialog" aria-modal="true" aria-label={label} aria-hidden={!open}>
        <span className="pd-grab" aria-hidden="true" />
        {open && children}
      </div>
    </>
  );
};

const Top = ({ title, onBack, right, titleHidden = false }) => (
  <header className="pd-top">
    <button type="button" className="pd-icon" aria-label="Back" onClick={onBack}>
      <Back />
    </button>
    <h1 className={titleHidden ? "is-hidden" : ""} aria-hidden={titleHidden || undefined}>
      {title}
    </h1>
    <span className="pd-top-right">{right}</span>
  </header>
);

/* ---------- DKA ---------- */
const DKA_Q = [
  ["A derivative is a financial instrument that derives its value from an underlying asset.", true],
  ["Derivative products carry financial risks, including counterparty risk, liquidity risk and market risk.", true],
  ["Standard individual stocks are classified as derivative products.", false],
  ["Derivatives can be used both to hedge against adverse price movements and to speculate.", true],
  ["Losses on leveraged derivatives can exceed the amount you first invested.", true],
  ["A futures contract obliges both parties to trade at an agreed price on a future date.", true],
  ["Derivatives are only ever traded on regulated exchanges.", false],
  ["The buyer of an option is obliged to exercise it.", false],
  ["A token that tracks the price of gold can carry derivative exposure.", true],
  ["The past performance of a derivative guarantees its future returns.", false],
];
const PASS_SCORE = 80;

const DkaFlow = ({ u, setU, onClose, say }) => {
  const [step, setStep] = useState("intro"); // intro | quiz | result | pass
  const [ans, setAns] = useState({});
  const [result, setResult] = useState(null);
  const left = u.dka === "passed" ? 3 : Number(u.dka);
  const answered = Object.keys(ans).length === DKA_Q.length;

  const submit = () => {
    const wrong = DKA_Q.map(([, a], i) => ans[i] !== a);
    const score = (wrong.filter((w) => !w).length / DKA_Q.length) * 100;
    if (score >= PASS_SCORE) {
      setU({ dka: "passed" });
      setStep("pass");
      return;
    }
    const next = Math.max(0, left - 1);
    setU({ dka: String(next) });
    setResult({ wrong, score, left: next });
    setStep("result");
  };

  if (step === "pass")
    return (
      <div className="pd-msg">
        <Illo kind="ok" />
        <h2>You’ve passed the assessment</h2>
        <p>You can now subscribe to derivative RWA products.</p>
        <button type="button" className="pd-btn is-primary" onClick={onClose}>
          OK
        </button>
      </div>
    );

  if (step === "intro")
    return (
      <div className="pd-doc">
        <h2 className="pd-sheet-title">Derivative Knowledge Assessment</h2>
        <div className="pd-doc-body">
          <p>
            This assessment checks your understanding of derivative products and their risks. Regulations require us to confirm your knowledge before you can
            subscribe to derivative products.
          </p>
          <p>
            You need a score of at least <b>{PASS_SCORE}%</b> to pass. You can take it <b>3 times in any rolling 30 days</b>.
          </p>
          <div className={`pd-attempts${left === 0 ? " is-out" : ""}`}>
            {left > 0 ? (
              <>
                <b>
                  {left} {left === 1 ? "attempt" : "attempts"} left
                </b>{" "}
                in the current 30-day window
              </>
            ) : (
              <>
                <b>No attempts left.</b> You can try again in {waitDays} days, on {retryDate()}.
              </>
            )}
          </div>
        </div>
        <button type="button" className="pd-btn is-primary" disabled={left === 0} onClick={() => setStep("quiz")}>
          Start now
        </button>
      </div>
    );

  return (
    <div className="pd-doc">
      <h2 className="pd-sheet-title">Derivative Knowledge Assessment</h2>
      {step === "result" && (
        <div className="pd-result">
          <span>✕</span>
          <div>
            <b>
              Not passed · score {result.score}% (pass mark {PASS_SCORE}%)
            </b>
            <p>
              {result.wrong.filter(Boolean).length} of the answers are incorrect.{" "}
              {result.left > 0 ? `${result.left} ${result.left === 1 ? "attempt" : "attempts"} left in this 30-day window.` : `No attempts left. You can try again in ${waitDays} days.`}
            </p>
          </div>
        </div>
      )}
      <ol className="pd-quiz">
        {DKA_Q.map(([q, a], i) => (
          <li key={i}>
            <p>{q}</p>
            <div className="pd-tf" role="radiogroup" aria-label={`Question ${i + 1}`}>
              {[true, false].map((v) => {
                const on = ans[i] === v;
                const mark = step === "result" && on ? (v === a ? "is-right" : "is-wrong") : "";
                return (
                  <button
                    key={String(v)}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={step === "result"}
                    className={`pd-radio${on ? " is-on" : ""} ${mark}`}
                    onClick={() => setAns((s) => ({ ...s, [i]: v }))}
                  >
                    <i />
                    {v ? "True" : "False"}
                    {mark && <em>{mark === "is-right" ? "Correct" : "Incorrect"}</em>}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ol>
      <div className="pd-sticky">
        {step === "quiz" ? (
          <button type="button" className="pd-btn is-primary" disabled={!answered} onClick={submit}>
            Submit
          </button>
        ) : result.left > 0 ? (
          <button
            type="button"
            className="pd-btn is-primary"
            onClick={() => {
              setAns({});
              setStep("quiz");
            }}
          >
            Try again
          </button>
        ) : (
          <button type="button" className="pd-btn is-secondary" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  );
};

/* ---------- Agreements (3 steps) ---------- */
const para = (n) =>
  Array.from({ length: n }, (_, i) => (
    <p key={i}>
      {i % 2
        ? "The Client acknowledges that tokenised products are subject to the dealing, settlement and redemption terms set by the issuer, that the value of the product may go down as well as up, and that EXIO acts as the distributor and does not guarantee any return."
        : "This placeholder stands in for the formal document. The final version will be supplied by Compliance in English, Traditional Chinese and Simplified Chinese, and shown in the app’s language. Headings, paragraphs and tables are adapted for this sheet."}
    </p>
  ));
const DOCS = [
  { title: "PD Client Agreement", sub: "Including Appendices I and II", body: para(7) },
  { title: "Disclosure of Transaction Related Information", sub: "", body: para(5) },
  { title: "Declaration by Client", sub: "", body: <p>I declare that the information I have provided is true and complete, and that I am subscribing or redeeming on my own account.</p> },
];

const Agreements = ({ onDone, onClose }) => {
  const [step, setStep] = useState(0);
  const [read, setRead] = useState([false, false, false]);
  const [ok, setOk] = useState([false, false, false]);
  const bodyRef = useRef(null);
  const check = () => {
    const el = bodyRef.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) setRead((r) => r.map((v, i) => (i === step ? true : v)));
  };
  useEffect(() => {
    bodyRef.current && (bodyRef.current.scrollTop = 0);
    const t = setTimeout(check, 50); // fully visible content is readable at once
    return () => clearTimeout(t);
  }, [step]);
  const d = DOCS[step];
  return (
    <div className="pd-doc">
      <div className="pd-doc-head">
        {step > 0 ? (
          <button type="button" className="pd-icon" aria-label="Back" onClick={() => setStep(step - 1)}>
            <Back />
          </button>
        ) : (
          <span />
        )}
        <h2 className="pd-sheet-title">Product acknowledgement ({step + 1}/3)</h2>
        {/* No close button: sheets close by dragging down or tapping outside. */}
        <span />
      </div>
      <div className="pd-doc-body is-scroll" ref={bodyRef} onScroll={check}>
        <h3>{d.title}</h3>
        {d.sub && <p className="pd-doc-sub">{d.sub}</p>}
        {d.body}
        <p className="pd-placeholder">Placeholder text · formal document to be supplied</p>
      </div>
      <label className={`pd-check${read[step] ? "" : " is-locked"}`}>
        <input
          type="checkbox"
          disabled={!read[step]}
          checked={ok[step]}
          onChange={(e) => setOk((o) => o.map((v, i) => (i === step ? e.target.checked : v)))}
        />
        <i aria-hidden="true" />
        <span>
          {read[step]
            ? `I have read, understood and agree to the ${d.title}.`
            : "Scroll to the end of the document to continue."}
        </span>
      </label>
      <button type="button" className="pd-btn is-primary" disabled={!ok[step]} onClick={() => (step < 2 ? setStep(step + 1) : onDone())}>
        {step < 2 ? "Next" : "Accept and continue"}
      </button>
    </div>
  );
};

/* ---------- Order form ---------- */
const OrderPage = ({ p, u, setU, instr, setInstr, onBack, say, labelStyle = "float" }) => {
  const a = attr(p);
  const sub = instr === "subscribe";
  const [quote, setQuote] = useState(p.currency[0]);
  const [amount, setAmount] = useState("");
  const [gates, setGates] = useState([]); // remaining Round 2 steps
  const [snap, setSnap] = useState(null);
  const [sheet, setSheet] = useState(null); // dka | rpq | received
  const inputRef = useRef(null);

  const g = eligibility(u, p, instr);
  const hold = holdingQty(u);
  const otc = useOtc();
  const BALANCE = otc.s.bal.pd;
  const bal = sub ? BALANCE[quote] ?? 0 : hold;
  const openTransfer = () => otc.set({ transfer: { asset: quote, from: "custody", to: "pd" } });
  const unit = sub ? quote : p.symbol;
  const d = sub ? 2 : 2;

  // Fees are charged on top of the amount, in the asset being paid (like gas):
  // Subscribe pays amount + fees in the settlement currency, Redeem pays
  // amount + fees in product units. Both must fit in the available balance.
  const fee = sub ? { pct: a.subscribeFeePct, qty: a.subscribeHandlingFeeQty } : { pct: a.redeemPlatformFeePct, qty: a.redeemHandlingFeeQty };
  const feesOf = (x) => x * fee.pct + fee.qty;
  const affordable = Math.max(0, (bal - fee.qty) / (1 + fee.pct)); // largest amount whose total still fits the balance

  // Amount rules (api §5.5)
  const limit = sub ? a.subscribeMaxNotional : a.redeemMaxQty;
  const rules = sub
    ? {
        min: hold > 0 ? a.subscribeMinNotional : Math.max(a.subscribeInitialNotional, a.subscribeMinNotional),
        initial: hold === 0,
        max: Math.min(affordable, limit),
        step: FIAT.has(quote) ? a.subscribeLotSize : a.subscribeLotSize,
      }
    : { min: a.redeemMinQty, max: Math.min(affordable, limit), step: a.redeemLotSize };
  rules.max = floorStep(rules.max, rules.step);
  const holdingLow = !sub && hold < a.redeemMinHoldingQty;
  const v = num(amount);
  const total = v > 0 ? v + feesOf(v) : 0;
  let err = "";
  if (amount !== "" && !holdingLow) {
    if (!(v > 0)) err = "Enter an amount greater than 0.";
    else if (v > limit + 1e-9) err = `You can ${sub ? "subscribe" : "redeem"} up to ${fmt(limit, d)} ${unit} per order.`;
    else if (total > bal + 1e-9)
      err = `Not enough ${unit} to cover the amount plus fees (${fmt(total)} ${unit} in total). You can ${sub ? "subscribe" : "redeem"} up to ${fmt(rules.max, d)} ${unit}.`;
    else if (v < rules.min - 1e-9)
      err = sub ? `Minimum ${rules.initial ? "initial " : ""}subscription is ${fmt(rules.min)} ${unit}.` : `Minimum redemption is ${fmt(rules.min)} ${unit}.`;
    else if (!isStep(v, rules.step)) err = `Enter the amount in steps of ${rules.step} ${unit}.`;
  }
  const canSubmit = !g && !holdingLow && amount !== "" && !err;

  // Switching instruction drops the other side's state (addendum R02).
  useEffect(() => {
    setAmount("");
    setGates([]);
  }, [instr]);

  const submit = () => {
    const q = [];
    const rating = Number(u.rating);
    const exempt = u.acct === "institutional";
    if (sub && rating < MIN_RATING[RISK_CODE[p.risk]]) q.push("risk");
    if (sub && u.conc === "reached" && !exempt) q.push("conc");
    q.push("terms", "confirm");
    setSnap({ instr, quote, v, unit, feeAmt: v * fee.pct, total });
    setGates(q);
  };
  const nextGate = () => setGates((q) => q.slice(1));
  const cancelGates = () => setGates([]);
  const gate = gates[0];

  const onBannerAction = (b) => {
    if (b.id === "dka" || b.id === "dkaWait") setSheet("dka");
    else if (b.id === "rpq") setSheet("rpq");
    else say(b.id === "pi" ? "PI application isn’t in this prototype" : b.id === "verify" ? "Verification isn’t in this prototype" : "Opens Contact us");
  };
  const top = g && (g.shared || g.id === "rpq" || g.id === "rpqWait" || g.id === "corpExpired");
  const from = sub ? quote : p.symbol;
  const to = sub ? p.symbol : quote;
  // Same layout as the OTC form (OtcPanel's field classes), following the
  // app-wide input style: a tall "You pay" field with the amount, the pay
  // asset and the balance + Max, over a short "You receive" field with the
  // receive asset only (the amount is confirmed after dealing). The button on
  // the seam flips Subscribe and Redeem.
  const [focused, setFocused] = useState(false);
  const [picking, setPicking] = useState(false); // currency sheet (replaces the native dropdown)
  const Chip = ({ s, label }) => {
    const pick = s !== p.symbol && p.currency.length > 1;
    const inner = (
      <>
        {s === p.symbol ? <img src={`${LOGO}/${p.symbol.toLowerCase()}.png`} width="20" height="20" alt="" /> : <span className="pd-flag">{FLAG[s]}</span>}
        <b>{s}</b>
        {pick && <ChipCaret />}
      </>
    );
    return pick ? (
      <button type="button" className="otc-chip" aria-label={`${label}: ${s}`} aria-haspopup="dialog" disabled={!!g} onClick={() => setPicking(true)}>
        {inner}
      </button>
    ) : (
      <span className="otc-chip is-fixed">{inner}</span>
    );
  };
  const payLabel = (
    <label className="otc-label" htmlFor="pd-amount">
      You pay
    </label>
  );
  const receiveLabel = <span className="otc-label">You receive</span>;
  const avail = (
    <span className="otc-avail">
      {sub ? "Avail." : "Holding"}
      <b>
        {fmt(bal)} {unit}
      </b>
      <button
        type="button"
        className="otc-all"
        disabled={!!g || holdingLow}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAmount(String(+rules.max.toFixed(6)))}
      >
        Max
      </button>
      {sub && (
        <button type="button" className="otc-xfer" aria-label="Transfer to the PD account" onMouseDown={(e) => e.preventDefault()} onClick={openTransfer}>
          <img src={`${OTC_IMG}/transfer.svg`} width="12" height="12" alt="" />
        </button>
      )}
    </span>
  );
  const payField = (
    <div className={`otc-amount is-pay${focused ? " is-focused" : ""}${focused || amount !== "" ? " is-up" : ""}${err ? " is-error" : ""}`}>
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
            id="pd-amount"
            className="otc-input"
            inputMode="decimal"
            autoComplete="off"
            placeholder={labelStyle === "float" && !focused ? "" : "0"}
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? "pd-amount-note" : undefined}
            disabled={!!g}
            value={amount}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))}
          />
          <Chip s={from} label="Pay with" />
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
          {labelStyle === "ifta" ? receiveLabel : <span className="otc-quote-hint">{sub ? "Units confirmed after dealing" : "Amount confirmed after dealing"}</span>}
          <Chip s={to} label="Receive in" />
        </div>
        {labelStyle === "float" && receiveLabel}
      </div>
    </div>
  );

  return (
    <div className="pd-page">
      <Top title="Subscription / Redeem" onBack={onBack} />
      <TokenSheet
        open={picking}
        title={sub ? "Pay with" : "Receive in"}
        value={quote}
        onPick={setQuote}
        onClose={() => setPicking(false)}
        balanceLabel="Avail."
        options={p.currency.map((c) => ({
          value: c,
          name: CCY_NAME[c],
          icon: <span className="pd-flag">{FLAG[c]}</span>,
          balance: sub ? fmt(BALANCE[c] ?? 0) : undefined, // unit already shown on the left // redeem: picking the receive currency, balance not relevant
        }))}
      />
      {top && <Banner g={g} onAction={onBannerAction} flush />}
      <div className="pd-scroll">
        <div className="pd-seg" role="tablist" aria-label="Instruction" style={{ "--seg-i": instr === "subscribe" ? 0 : 1, "--seg-n": 2 }}>
          {["subscribe", "redeem"].map((k) => (
            <button key={k} type="button" role="tab" aria-selected={instr === k} className={instr === k ? "is-on" : ""} onClick={() => setInstr(k)}>
              {k === "subscribe" ? "Subscribe" : "Redeem"}
            </button>
          ))}
        </div>
        {g && !top && <Banner g={g} onAction={onBannerAction} />}

        <div className={`otc otc-style-${labelStyle} pd-otc${g ? " is-disabled" : ""}`}>
          <div className="otc-fields">
            {payField}
            <button
              type="button"
              className="otc-swap"
              aria-label={sub ? "Switch to Redeem" : "Switch to Subscribe"}
              onClick={() => setInstr(sub ? "redeem" : "subscribe")}
            >
              <img src={`${import.meta.env.BASE_URL}images/otc/swap.svg`} width="16" height="16" alt="" />
            </button>
            {receiveField}
            {err && (
              <p id="pd-amount-note" className="otc-note" aria-live="polite">
                {err}
              </p>
            )}
          </div>
        </div>
        {holdingLow && (
          <div className="pd-note">
            <Warn />
            <p>
              You hold <b>{fmt(hold)} {p.symbol}</b>. You need at least <b>{fmt(a.redeemMinHoldingQty)} {p.symbol}</b> to redeem.
            </p>
          </div>
        )}

        <dl className="pd-rows">
          <div>
            <dt>{sub ? "Subscription fee" : "Redemption fee"}</dt>
            <dd>
              {fee.pct * 100}%{v > 0 && <> · {fmt(v * fee.pct)} <small>{unit}</small></>}
            </dd>
          </div>
          <div>
            <dt>Handling fee</dt>
            <dd>
              {fmt(fee.qty)} <small>{unit}</small>
            </dd>
          </div>
          <div className="pd-row-total">
            <dt>{sub ? "Total subscription amount (including fees)" : "Total redemption amount (including fees)"}</dt>
            <dd>{v > 0 ? <>{fmt(total)} <small>{unit}</small></> : "--"}</dd>
          </div>
          {sub ? (
            <>
              <div>
                <dt>Initial subscription amount</dt>
                <dd>
                  {fmt(a.subscribeInitialNotional)} <small>{quote}</small>
                </dd>
              </div>
              <div>
                <dt>Min. subscription amount</dt>
                <dd>
                  {fmt(a.subscribeMinNotional)} <small>{quote}</small>
                </dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Min. redemption amount</dt>
                <dd>
                  {fmt(a.redeemMinQty)} <small>{p.symbol}</small>
                </dd>
              </div>
              <div>
                <dt>Min. holding to redeem</dt>
                <dd>
                  {fmt(a.redeemMinHoldingQty)} <small>{p.symbol}</small>
                </dd>
              </div>
            </>
          )}
          <div>
            <dt>Step size</dt>
            <dd>
              {rules.step} <small>{unit}</small>
            </dd>
          </div>
        </dl>
        <div className="pd-settle">
          <span className="pd-k">Settlement Period</span>
          <p>{a.settlementPeriod}</p>
        </div>
      </div>
      <div className="pd-foot">
        <button type="button" className="pd-btn is-primary" disabled={!canSubmit} onClick={submit}>
          {sub ? "Subscribe" : "Redeem"}
        </button>
      </div>

      {/* Round 2 */}
      {["risk", "conc"].map((k) => (
        <PdSheet key={k} open={gate === k} onClose={cancelGates} label={k === "risk" ? "Risk Tolerance Mismatch" : "High Portfolio Concentration"}>
          <div className="pd-msg">
            <Illo kind="warn" />
            <h2>{k === "risk" ? "Risk Tolerance Mismatch" : "High Portfolio Concentration"}</h2>
            <p>
              {k === "risk"
                ? `This product’s risk level (${RISK[p.risk]}) is higher than your risk tolerance (${RATING_NAME[u.rating]}), so it may not be suitable for you. This alert does not constitute a solicitation or recommendation to purchase any product.`
                : "Subscribing to this token will result in a high concentration of this product category in your portfolio. This alert does not constitute a solicitation or recommendation to purchase any product."}
            </p>
            <p className="pd-fine">
              By acknowledging and proceeding, you confirm that you understand the associated risks, have decided to purchase the product independently, and were not
              solicited by an employee of EXIO Limited. <b>Do you wish to continue?</b>
            </p>
            <button type="button" className="pd-btn is-primary" onClick={nextGate}>
              Acknowledge & Proceed
            </button>
            <button type="button" className="pd-btn is-outline" onClick={cancelGates}>
              Cancel
            </button>
          </div>
        </PdSheet>
      ))}
      <PdSheet open={gate === "terms"} full onClose={cancelGates} label="Product acknowledgement">
        <Agreements onDone={nextGate} onClose={cancelGates} />
      </PdSheet>
      <PdSheet open={gate === "confirm"} onClose={cancelGates} label="Confirm">
        {snap && (
          <div className="pd-doc">
            <h2 className="pd-sheet-title">{snap.instr === "subscribe" ? "Confirm to subscribe" : "Confirm to redeem"}</h2>
            <div className="pd-confirm-amt">
              <span>{snap.instr === "subscribe" ? "Subscription amount" : "Redemption amount"}</span>
              <b>
                {fmt(snap.v)} <small>{snap.unit}</small>
              </b>
            </div>
            <dl className="pd-rows">
              <div>
                <dt>Receive asset</dt>
                <dd>
                  <b>{snap.instr === "subscribe" ? p.symbol : snap.quote}</b>
                </dd>
              </div>
              <div>
                <dt>{snap.instr === "subscribe" ? "Subscription fee" : "Redemption fee"}</dt>
                <dd>
                  {fee.pct * 100}% · {fmt(snap.feeAmt)} <small>{snap.unit}</small>
                </dd>
              </div>
              <div>
                <dt>Handling fee</dt>
                <dd>
                  {fmt(fee.qty)} <small>{snap.unit}</small>
                </dd>
              </div>
              <div className="pd-row-total">
                <dt>{snap.instr === "subscribe" ? "Total subscription amount (including fees)" : "Total redemption amount (including fees)"}</dt>
                <dd>
                  {fmt(snap.total)} <small>{snap.unit}</small>
                </dd>
              </div>
            </dl>
            <div className="pd-settle">
              <span className="pd-k">Settlement Period</span>
              <p>{a.settlementPeriod}</p>
            </div>
            <button
              type="button"
              className="pd-btn is-primary"
              onClick={() => {
                setGates([]);
                setSheet("received");
              }}
            >
              {snap.instr === "subscribe" ? "Confirm to subscribe" : "Confirm to redeem"}
            </button>
            <button type="button" className="pd-btn is-outline" onClick={cancelGates}>
              Cancel
            </button>
          </div>
        )}
      </PdSheet>
      <PdSheet
        open={sheet === "received"}
        onClose={() => {
          setSheet(null);
          setAmount("");
        }}
        label="Order Received"
      >
        <div className="pd-msg">
          <Illo kind="clock" />
          <h2>Order Received</h2>
          <p>Your {snap?.instr === "redeem" ? "redemption" : "subscription"} request has been received and will be processed promptly.</p>
          <p className="pd-fine">Prototype: no order is placed and no assets are held.</p>
          <button
            type="button"
            className="pd-btn is-primary"
            onClick={() => {
              setSheet(null);
              setAmount("");
            }}
          >
            OK
          </button>
        </div>
      </PdSheet>
      <PdSheet open={sheet === "dka"} full onClose={() => setSheet(null)} label="Derivative Knowledge Assessment">
        <DkaFlow u={u} setU={setU} onClose={() => setSheet(null)} say={say} />
      </PdSheet>
      <PdSheet open={sheet === "rpq"} onClose={() => setSheet(null)} label="Suitability assessment">
        <RpqStub
          onDone={() => {
            setU({ suit: "valid" });
            setSheet(null);
            say("Suitability assessment completed");
          }}
        />
      </PdSheet>
    </div>
  );
};

const RpqStub = ({ onDone }) => (
  <div className="pd-doc">
    <h2 className="pd-sheet-title">Suitability assessment</h2>
    <div className="pd-doc-body">
      <p>The app’s existing Risk Profile Questionnaire (RPQ v2) opens here. It isn’t rebuilt for this prototype.</p>
      <p className="pd-placeholder">Attempt and waiting-period rules follow the existing RPQ logic (to be confirmed).</p>
    </div>
    <button type="button" className="pd-btn is-primary" onClick={onDone}>
      Complete assessment (demo)
    </button>
  </div>
);

/* ---------- Product detail ---------- */
/* ---------- Token detail sections (Figma 8517:601695; XAUm only for now) ---------- */
const SECTIONS = [
  ["elements", "Product Elements"],
  ["dealing", "Dealing Rules"],
  ["performance", "Performance"],
  ["documents", "Documents"],
];
const Table = ({ rows }) => (
  <dl className="pd-table">
    {rows.map(([k, v, kind]) => (
      <div key={k}>
        <dt>{k}</dt>
        <dd className={kind ? `is-${kind}` : ""}>{v}</dd>
      </div>
    ))}
  </dl>
);
const niceStep = (span) => {
  const raw = span / 6;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= raw) || mag * 10;
};
const Bars = ({ data }) => {
  const vals = data.map(([, v]) => v);
  const step = niceStep(Math.max(...vals, 0) - Math.min(...vals, 0) || 1);
  const bottom = Math.floor(Math.min(...vals, 0) / step) * step;
  const top = Math.ceil(Math.max(...vals, 0) / step) * step || (bottom < 0 ? 0 : step);
  const span = top - bottom;
  const ticks = [];
  for (let t = bottom; t <= top + 1e-9; t += step) ticks.push(+t.toFixed(4));
  const dp = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  const pos = (v) => (v - bottom) / span; // 0..1 from the bottom of the plot
  return (
    <div className="pd-bars" role="img" aria-label={`Performance by quarter: ${data.map(([q, v]) => `${q} ${v}`).join(", ")}`}>
      <div className="pd-bars-y" aria-hidden="true">
        {ticks
          .slice()
          .reverse()
          .map((t) => (
            <span key={t}>{t.toFixed(dp)}</span>
          ))}
      </div>
      <div className="pd-bars-plot">
        {ticks.map((t) => (
          <i key={t} className={`pd-bars-grid${t === 0 ? " is-zero" : ""}`} style={{ bottom: `calc(22px + (100% - 22px) * ${pos(t)})` }} />
        ))}
        {data.map(([q, v]) => (
          <div key={q} className="pd-bars-col">
            <span
              className={`pd-bar${v < 0 ? " is-neg" : ""}`}
              style={{ bottom: `${pos(Math.min(v, 0)) * 100}%`, height: `${(Math.abs(v) / span) * 100}%` }}
              title={`${q}: ${v}`}
            />
            <span className="pd-bars-x">{q}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
const DocIcon = ({ kind }) =>
  kind === "pdf" ? (
    <svg width="24" height="30" viewBox="0 0 24 30" aria-hidden="true">
      <path d="M2 1h14l7 7v20a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z" fill="#fff" stroke="#f24b4b" />
      <path d="M16 1v6a1 1 0 0 0 1 1h6" fill="none" stroke="#f24b4b" />
      <path d="M7 14c2-5 3-6 3.5-4.5S9 15 6 18s5-2 8-1-4 1.5-6-3" fill="none" stroke="#f24b4b" strokeWidth=".9" />
      <text x="12" y="25.5" textAnchor="middle" fontSize="5.5" fontWeight="700" fill="#f24b4b" fontFamily="inherit">PDF</text>
    </svg>
  ) : (
    <svg width="24" height="30" viewBox="0 0 24 30" aria-hidden="true">
      <path d="M2 1h14l7 7v20a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z" fill="#fff" stroke="rgba(0,0,0,.5)" />
      <rect x="6" y="9" width="12" height="1" rx=".5" fill="rgba(0,0,0,.6)" />
      <rect x="6" y="13" width="9" height="1" rx=".5" fill="rgba(0,0,0,.6)" />
      <rect x="6" y="17" width="6" height="1" rx=".5" fill="rgba(0,0,0,.6)" />
    </svg>
  );
const Download = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M2.5 13.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Tabs jump to each section and follow the scroll position.
const DetailSections = ({ d, scrollRef, say }) => {
  const [active, setActive] = useState("elements");
  const refs = useRef({});
  const tabsRef = useRef(null);
  const lockUntil = useRef(0); // a tab tap wins over the scroll spy while the page moves
  useEffect(() => {
    const strip = tabsRef.current;
    const btn = strip?.querySelector(".is-on");
    if (strip && btn) strip.scrollTo({ left: Math.max(0, btn.offsetLeft - 16), behavior: "smooth" });
  }, [active]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      if (Date.now() < lockUntil.current) return;
      const top = el.getBoundingClientRect().top + (tabsRef.current?.offsetHeight || 0) + 24;
      let cur = "elements";
      SECTIONS.forEach(([k]) => {
        const r = refs.current[k]?.getBoundingClientRect();
        if (r && r.top <= top) cur = k;
      });
      // At the very end the last sections can't reach the tabs: keep the tab
      // whose section is on screen, otherwise light up the last one.
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) {
        const view = el.getBoundingClientRect();
        setActive((prev) => {
          const r = refs.current[prev]?.getBoundingClientRect();
          const onScreen = r && r.top >= view.top && r.top < view.bottom;
          return onScreen && SECTIONS.findIndex(([k]) => k === prev) >= SECTIONS.findIndex(([k]) => k === cur) ? prev : SECTIONS[SECTIONS.length - 1][0];
        });
        return;
      }
      setActive(cur);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);
  const go = (k) => {
    const el = scrollRef.current;
    const target = refs.current[k];
    if (!el || !target) return;
    const y = target.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - (tabsRef.current?.offsetHeight || 0) + 8;
    lockUntil.current = Date.now() + 1200;
    el.scrollTo({ top: y, behavior: "smooth" });
    setActive(k);
  };
  return (
    <>
      <hr className="pd-divider" />
      <div className="pd-dtabs" role="tablist" aria-label="Product details" ref={tabsRef}>
        {SECTIONS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={active === k} className={active === k ? "is-on" : ""} onClick={() => go(k)}>
            {l}
          </button>
        ))}
      </div>
      <section className="pd-sec" ref={(n) => (refs.current.elements = n)}>
        <h3 className="pd-h3">Product Elements</h3>
        <Table rows={d.elements} />
      </section>
      <section className="pd-sec" ref={(n) => (refs.current.dealing = n)}>
        <h3 className="pd-h3">Dealing Rules</h3>
        <Table rows={d.dealing} />
      </section>
      <section className="pd-sec" ref={(n) => (refs.current.performance = n)}>
        <h3 className="pd-h3">Performance</h3>
        <Bars data={d.performance} />
      </section>
      <section className="pd-sec" ref={(n) => (refs.current.documents = n)}>
        <h3 className="pd-h3">Documents</h3>
        <div className="pd-docs">
          {d.documents.map(([name, kind]) => (
            <button key={name} type="button" className="pd-doc-cell" onClick={() => say("Document download isn’t in this prototype")}>
              <DocIcon kind={kind} />
              <span>{name}</span>
              <Download />
            </button>
          ))}
        </div>
      </section>
    </>
  );
};

// Every token gets the XAUm table layout. Fields we know for the product
// (name, ticker, issuer, currencies, risk, eligibility, derivatives, dealing
// frequency and the PD placeholders used by the order form) are filled in;
// everything else follows XAUm's sample content.
const RISK_WORD = ["", "Very Low", "Low", "Medium", "High", "Very High"];
const hashNum = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
function detailFor(p) {
  if (DETAIL[p.symbol]) return { ...DETAIL[p.symbol], sample: false };
  const x = DETAIL.XAUm;
  const a = attr(p);
  const base = p.currency[0].replace(/USD[CT]/, "USD");
  const dealing = p.meta.replace("Tokenised · ", "");
  const t = (dealing.match(/T\+\d/) || [])[0];
  const freq = dealing.split(" · ").filter((s) => !/T\+\d/.test(s)).join(", ") || "Daily";
  const set = (rows, map) => rows.map(([k, v, kind]) => (k in map ? [k, map[k], kind] : [k, v, kind]));
  const elements = set(x.elements, {
    "Product Name": p.name,
    "Ticker Symbol": p.symbol,
    "Risk Rating": RISK_WORD[p.risk],
    "Retail Eligible": p.badge === "RI" ? "Yes" : "No (Professional Investors only)",
    "Issuing Entity": p.issuer,
    "Derivative Exposure": a.hasDerivatives ? "Yes" : "No",
    ...(p.extra ? { Regulator: p.extra === "SFC-authorised" ? "Securities and Futures Commission (SFC)" : x.elements.find((r) => r[0] === "Regulator")[1] } : {}),
  }).map((r) => (r[0] === "Risk Rating" ? [r[0], r[1], p.risk >= 4 ? "risk" : undefined] : r));
  const dealingRows = set(x.dealing, {
    "Base Currency": base,
    "Settlement Currency": p.currency.join(", "),
    "Subscription Day": `${freq} dealing. Cut-off times follow the issuer’s dealing rules.`,
    "Redemption Day": `${freq} dealing. Cut-off times follow the issuer’s dealing rules.`,
    "Settlement Period": t ? `Subscription: ${t}. Redemption: ${t}.` : a.settlementPeriod,
    "Minimum Initial Subscription": `${fmt(a.subscribeInitialNotional)} ${base}`,
    "Minimum Subsequent Subscription": `${fmt(a.subscribeMinNotional)} ${base}`,
    "Minimum Holding": `${fmt(a.redeemMinHoldingQty)} ${p.symbol}`,
    "Minimum Redemption": `${fmt(a.redeemMinQty)} ${p.symbol}`,
    "Valuation Frequency": /Real-time/.test(dealing) ? "Real-time" : freq.split(", ")[0],
    "Subscription Fee": `${a.subscribeFeePct * 100}%`,
    "Redemption Fee": `${a.redeemPlatformFeePct * 100}%`,
  });
  // Quarterly figures around a quarter of the reference yield (illustrative).
  const h = hashNum(p.symbol);
  const q = p.yld / 4;
  const performance = ["Q1", "Q2", "Q3", "Q4"].map((k, i) => [k, +(q * (0.8 + (((h >> (i * 3)) % 9) / 20))).toFixed(2)]);
  return {
    sample: true,
    nav: { value: fmt(navOf(p), 4), unit: base, updated: "Last updated: 28-10-2026" },
    yield: `${p.yld}%`,
    overview: `${p.name} (${p.symbol}) is a tokenised product issued by ${p.issuer} and distributed on EXIO. Each token represents a unit of the underlying product, held in the PD wallet. Subscriptions and redemptions follow the issuer’s dealing rules (${dealing.toLowerCase()}), and the product is settled in ${p.currency.join(" / ")}. This overview is placeholder text for the prototype.`,
    elements,
    dealing: dealingRows,
    performance,
    documents: [
      [`${p.name} Offering Document`, "pdf"],
      [`${p.symbol} logo pack`, "doc"],
      ["Fact Sheet (August 2026)", "pdf"],
    ],
  };
}

const navOf = (p) => (p.symbol.startsWith("a") && p.symbol !== "aAAPL" ? 100 + (p.symbol.length * 37) % 400 : 1 + ((p.symbol.charCodeAt(0) * 7) % 90) / 10);

export default function PdProduct({ p, u, setU, fav, onFav, onClose, say, labelStyle = "float" }) {
  const [instr, setInstr] = useState("subscribe");
  const [order, setOrder] = useState(false);
  const [sheet, setSheet] = useState(null);
  const [more, setMore] = useState(false);
  const gSub = eligibility(u, p, "subscribe");
  const entryLocked = gSub?.shared;
  const a = attr(p);
  const tags = [RISK[p.risk], "Tokenised", ...p.meta.replace("Tokenised · ", "").split(" · "), ...p.currency, ...(p.extra ? [p.extra] : [])];
  const d = detailFor(p);
  const scrollRef = useRef(null);
  // The bar shows the token name only once the symbol + full name have
  // scrolled out of view under it.
  const nameRef = useRef(null);
  const [nameGone, setNameGone] = useState(false);
  useEffect(() => {
    const el = nameRef.current;
    const root = scrollRef.current;
    if (!el || !root) return undefined;
    const io = new IntersectionObserver(([e]) => setNameGone(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0) + 1), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [p.symbol]);

  const onBannerAction = (b) => {
    if (b.id === "dka" || b.id === "dkaWait") setSheet("dka");
    else if (b.id === "rpq") setSheet("rpq");
    else say(b.id === "pi" ? "PI application isn’t in this prototype" : b.id === "verify" ? "Verification isn’t in this prototype" : "Opens Contact us");
  };

  return (
    <div className="pd-layer">
      <div className="pd-page">
        <Top
          title={p.symbol}
          titleHidden={!nameGone}
          onBack={onClose}
          right={
            <button type="button" className="pd-link" onClick={() => say("Opens Contact us")}>
              Contact us
            </button>
          }
        />
        <Banner g={gSub} onAction={onBannerAction} flush />
        <div className="pd-scroll" ref={scrollRef}>
          <div className="pd-head">
            <img className="rw-logo" src={`${LOGO}/${p.symbol.toLowerCase()}.png`} width="48" height="48" alt="" />
            <div ref={nameRef}>
              <div className="pd-head-row">
                <h2>{p.symbol}</h2>
                <span className={`rw-badge is-${p.badge.toLowerCase()}`}>{p.badge}</span>
              </div>
              <p>{p.name}</p>
            </div>
            <button type="button" className="rw-fav" aria-pressed={fav} aria-label="Favourite" onClick={onFav}>
              <Star on={fav} />
            </button>
          </div>
          <div className="pd-tags">
            {tags.map((t, i) => (
              <span key={t + i} className={i === 0 ? `rw-risk is-r${p.risk}` : "rw-chip"}>
                {i === 0 ? `Risk: ${t.replace(" risk", "")}` : t}
              </span>
            ))}
          </div>
          <div className="pd-nav">
            <span className="pd-k pd-k-info">
              Net Asset Value <Info />
            </span>
            <b className="pd-nav-v">
              {d ? d.nav.value : fmt(navOf(p), 4)} <small>{d ? d.nav.unit : p.currency[0].replace(/USD[CT]/, "USD")}</small>
            </b>
            <span className="pd-k is-sm">{d ? d.nav.updated : "Last updated: 28-10-2026 · placeholder"}</span>
            <span className="pd-k pd-k-info pd-nav-gap">
              Indicative Annualized Yield <Info />
            </span>
            <b className="pd-nav-v">{d ? d.yield : `${p.yld}%`}</b>
          </div>
          <h3 className="pd-h3">Product Overview</h3>
          <p className={`pd-overview${more ? " is-open" : ""}`}>
            {d
              ? d.overview
              : `${p.name} is issued by ${p.issuer} and distributed on EXIO as a tokenised product. Each token represents a unit of the underlying product and is held in the PD wallet. Subscriptions and redemptions follow the issuer’s dealing rules: ${p.meta.replace("Tokenised · ", "").toLowerCase()}. Product documents, fees and dealing terms are available from the issuer. This summary is placeholder text for the prototype.`}
          </p>
          <button type="button" className="pd-link is-green" onClick={() => setMore(!more)}>
            {more ? "Show less" : "Show all"}
          </button>
          {d ? (
            <DetailSections d={d} scrollRef={scrollRef} say={say} />
          ) : (
          <dl className="pd-rows is-facts">
            <div>
              <dt>Eligibility</dt>
              <dd>{p.badge === "PI" ? "Professional investors only" : "Retail and professional investors"}</dd>
            </div>
            <div>
              <dt>Derivative exposure</dt>
              <dd>{a.hasDerivatives ? "Yes · DKA required" : "No"}</dd>
            </div>
            <div>
              <dt>Settlement currencies</dt>
              <dd>{p.currency.join(", ")}</dd>
            </div>
          </dl>
          )}
        </div>
        <div className="pd-foot">
          <button type="button" className="pd-btn is-primary" disabled={entryLocked} onClick={() => setOrder(true)}>
            Subscribe / Redeem
          </button>
        </div>
      </div>

      {order && (
        <div className="pd-layer is-order">
          <OrderPage p={p} u={u} setU={setU} instr={instr} setInstr={setInstr} onBack={() => setOrder(false)} say={say} labelStyle={labelStyle} />
        </div>
      )}
      <PdSheet open={sheet === "dka"} full onClose={() => setSheet(null)} label="Derivative Knowledge Assessment">
        <DkaFlow u={u} setU={setU} onClose={() => setSheet(null)} say={say} />
      </PdSheet>
      <PdSheet open={sheet === "rpq"} onClose={() => setSheet(null)} label="Suitability assessment">
        <RpqStub
          onDone={() => {
            setU({ suit: "valid" });
            setSheet(null);
            say("Suitability assessment completed");
          }}
        />
      </PdSheet>
    </div>
  );
}
