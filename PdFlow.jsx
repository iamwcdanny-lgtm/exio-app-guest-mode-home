import React, { useEffect, useMemo, useRef, useState } from "react";
import { LOGO, RISK, Star, CloseIcon } from "./RwaPage";
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
const BALANCE = { USD: 20029.62, HKD: 156400.0, USDC: 12500.0, USDT: 8000.0 };
const FIAT = new Set(["USD", "HKD"]);
const FLAG = { USD: "🇺🇸", HKD: "🇭🇰", USDC: "◎", USDT: "₮" };
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
  redeemHandlingFeeQty: 0.1,
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

const Top = ({ title, onBack, right }) => (
  <header className="pd-top">
    <button type="button" className="pd-icon" aria-label="Back" onClick={onBack}>
      <Back />
    </button>
    <h1>{title}</h1>
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
        <button type="button" className="pd-icon" aria-label="Close" onClick={onClose}>
          <CloseIcon size={20} />
        </button>
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
  const bal = sub ? BALANCE[quote] ?? 0 : hold;
  const unit = sub ? quote : p.symbol;
  const d = sub ? 2 : 2;

  // Amount rules (api §5.5)
  const rules = sub
    ? {
        min: hold > 0 ? a.subscribeMinNotional : Math.max(a.subscribeInitialNotional, a.subscribeMinNotional),
        initial: hold === 0,
        max: Math.min(bal, a.subscribeMaxNotional),
        maxBy: bal < a.subscribeMaxNotional ? "balance" : "limit",
        step: FIAT.has(quote) ? a.subscribeLotSize : a.subscribeLotSize,
      }
    : { min: a.redeemMinQty, max: Math.min(hold, a.redeemMaxQty), maxBy: hold < a.redeemMaxQty ? "balance" : "limit", step: a.redeemLotSize };
  const holdingLow = !sub && hold < a.redeemMinHoldingQty;
  const v = num(amount);
  let err = "";
  if (amount !== "" && !holdingLow) {
    if (!(v > 0)) err = "Enter an amount greater than 0.";
    else if (v > rules.max + 1e-9)
      err = `${rules.maxBy === "balance" ? (sub ? "Exceeds your available balance. " : "Exceeds your available holding. ") : ""}You can ${sub ? "subscribe" : "redeem"} up to ${fmt(rules.max, d)} ${unit}.`;
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
    setSnap({ instr, quote, v, unit });
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
  const fee = sub ? { pct: a.subscribeFeePct, qty: a.subscribeHandlingFeeQty } : { pct: a.redeemPlatformFeePct, qty: a.redeemHandlingFeeQty };
  const from = sub ? quote : p.symbol;
  const to = sub ? p.symbol : quote;
  // Fields use the same input style as the rest of the app (OtcPanel's
  // field classes): Traditional = label above a grey box, Floating = white
  // outlined box with the label on the border, IFTA = grey box, label inside.
  const [focused, setFocused] = useState(false);
  const up = focused || amount !== "";
  const AssetBox = ({ s, label, id }) => {
    const pick = s !== p.symbol && p.currency.length > 1;
    return (
      <div className="otc-pick">
        <label className="otc-label" htmlFor={id}>
          {label}
        </label>
        <div className="otc-pick-box">
          <span className="otc-ccy">
            {s === p.symbol ? <img src={`${LOGO}/${p.symbol.toLowerCase()}.png`} width="18" height="18" alt="" /> : <span className="pd-flag">{FLAG[s]}</span>}
            {s}
          </span>
          {pick && (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <select id={id} value={quote} onChange={(e) => setQuote(e.target.value)} aria-label={label}>
                {p.currency.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>
    );
  };
  const amountLabel = (
    <label className="otc-label" htmlFor="pd-amount">
      {sub ? "Subscription amount" : "Redemption amount"}
    </label>
  );
  const avail = (
    <span className="otc-avail">
      {sub ? "Avail." : "Holding"}
      <b>
        {fmt(bal)} {unit}
      </b>
    </span>
  );

  return (
    <div className="pd-page">
      <Top title="Subscription / Redeem" onBack={onBack} />
      {top && <Banner g={g} onAction={onBannerAction} flush />}
      <div className="pd-scroll">
        <div className="pd-seg" role="tablist" aria-label="Instruction">
          {["subscribe", "redeem"].map((k) => (
            <button key={k} type="button" role="tab" aria-selected={instr === k} className={instr === k ? "is-on" : ""} onClick={() => setInstr(k)}>
              {k === "subscribe" ? "Subscribe" : "Redeem"}
            </button>
          ))}
        </div>
        {g && !top && <Banner g={g} onAction={onBannerAction} />}

        <div className={`otc otc-style-${labelStyle} pd-otc${g ? " is-disabled" : ""}`}>
          <div className="otc-pair">
            <AssetBox s={from} label="From" id="pd-from" />
            <span className="pd-arrow" aria-hidden="true">
              →
            </span>
            <AssetBox s={to} label="To" id="pd-to" />
          </div>

          <div className={`otc-amount${focused ? " is-focused" : ""}${up ? " is-up" : ""}${err ? " is-error" : ""}`}>
            {labelStyle === "trad" && (
              <div className="otc-amount-head">
                {amountLabel}
                {avail}
              </div>
            )}
            <div
              className="otc-amount-box"
              onMouseDown={(e) => {
                if (e.target === inputRef.current || e.target.closest("button")) return;
                e.preventDefault();
                inputRef.current?.focus();
              }}
            >
              {labelStyle === "ifta" && (
                <div className="otc-amount-head">
                  {amountLabel}
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
                <span className="otc-unit">{unit}</span>
                <span className="otc-vdiv" aria-hidden="true" />
                <button
                  type="button"
                  className="otc-all"
                  disabled={!!g || holdingLow}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setAmount(String(+floorStep(rules.max, rules.step).toFixed(6)))}
                >
                  Max
                </button>
              </div>
              {labelStyle === "float" && amountLabel}
            </div>
            {labelStyle === "float" && <div className="otc-amount-foot">{avail}</div>}
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
            <dd>{fee.pct * 100}% of {sub ? "subscription" : "redemption"} amount</dd>
          </div>
          <div>
            <dt>Handling fee</dt>
            <dd>
              {fmt(fee.qty)} <small>{quote}</small>
            </dd>
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
                <dd>{fee.pct * 100}% of amount</dd>
              </div>
              <div>
                <dt>Handling fee</dt>
                <dd>
                  {fmt(fee.qty)} <small>{snap.quote}</small>
                </dd>
              </div>
              <div>
                <dt>{snap.instr === "subscribe" ? "Actual subscription amount" : "Actual redemption amount"}</dt>
                <dd title="Final net settlement isn’t provided yet">--</dd>
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
          onBack={onClose}
          right={
            <button type="button" className="pd-link" onClick={() => say("Opens Contact us")}>
              Contact us
            </button>
          }
        />
        <Banner g={gSub} onAction={onBannerAction} flush />
        <div className="pd-scroll">
          <div className="pd-head">
            <img className="rw-logo" src={`${LOGO}/${p.symbol.toLowerCase()}.png`} width="48" height="48" alt="" />
            <div>
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
            <span className="pd-k">Net Asset Value</span>
            <b className="pd-nav-v">
              {fmt(navOf(p), 4)} <small>{p.currency[0].replace(/USD[CT]/, "USD")}</small>
            </b>
            <span className="pd-k is-sm">Last updated: 28-10-2026 · placeholder</span>
            <span className="pd-k pd-nav-gap">Indicative Annualized Yield</span>
            <b className="pd-nav-v">{p.yld}%</b>
          </div>
          <h3 className="pd-h3">Product Overview</h3>
          <p className={`pd-overview${more ? " is-open" : ""}`}>
            {p.name} is issued by {p.issuer} and distributed on EXIO as a tokenised product. Each token represents a unit of the underlying product and is held in
            the PD wallet. Subscriptions and redemptions follow the issuer’s dealing rules: {p.meta.replace("Tokenised · ", "").toLowerCase()}. Product documents,
            fees and dealing terms are available from the issuer. This summary is placeholder text for the prototype.
          </p>
          <button type="button" className="pd-link is-green" onClick={() => setMore(!more)}>
            {more ? "Show less" : "Show all"}
          </button>
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
