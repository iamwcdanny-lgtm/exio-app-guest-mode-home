import React, { createContext, useContext, useEffect, useReducer, useRef } from "react";
import { slideBack } from "./backOut";
import PhoneLayer from "./PhoneLayer";
import TokenSheet from "./TokenSheet";
import "./OtcSession.css";

// OTC chat trading, ported from the standalone app demo
// (iamwcdanny-lgtm/job-chatTradingDemo, index.html, app mode only; the web
// mode, guest landing, EN/中 toggle and reviewer tools stay in that repo).
//
// One session for the whole app: the Trade > OTC panel starts it, the chat
// covers the phone, and when minimised it lives on as a floating bubble on
// every tab (red dot on any update).
//
// Flow: Get quote → Terms sheet (first time, scroll to the end) → connecting
// → chat with the EXIO Trading Desk → quote card with a 20s TTL → Accept
// (12s locked confirm sheet) or Reject → executed: confirmation summary,
// post-trade terms, order in Processing after 5s, filled 30–60s later.
// Free text: "cancel", "trade" (guided new trade with pills), quote words,
// greetings. 30s idle in chat asks whether to go back to the app.

export const IMG = `${import.meta.env.BASE_URL}images/otc`;

export const CCY = {
  USD: { icon: "flag-usd.svg", dp: 2, usd: 1, name: "US Dollar" },
  HKD: { icon: "hkd.svg", dp: 2, usd: 0.1282, name: "Hong Kong Dollar" },
  BTC: { icon: "coin-btc.svg", dp: 6, usd: 127250, name: "Bitcoin" },
  ETH: { icon: "coin-eth.svg", dp: 4, usd: 3420, name: "Ethereum" },
  USDT: { icon: "usdt.png", dp: 2, usd: 1, name: "Tether USD", pi: true },
  USDC: { icon: "usdc.png", dp: 2, usd: 1, name: "USD Coin", pi: true },
};
export const TOKENS = Object.keys(CCY);
export const PI_TOKENS = TOKENS.filter((k) => CCY[k].pi);

const MIN_USD = 100;
const USER_NAME = "Danny Cheung";
const TRADER = "Alex";
const CONV_ID = "#396878";
const QUOTE = { spread: 0.0018, ttl: 20 };

export const fmtDp = (n, dp) => Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
export const fmtCcy = (n, c) => fmtDp(n, CCY[c]?.dp ?? 2);
const rcvFmt = (n) => (n >= 1000 ? fmtDp(n, 2) : Number(n).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 }));
const rfmt = (r) => (r >= 100 ? fmtDp(r, 2) : Number(r).toLocaleString("en-US", { maximumFractionDigits: 6 }));
const fmtTTL = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const pad = (n) => String(n).padStart(2, "0");
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const nowDateTime = () => {
  const d = new Date();
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const newOrderId = () => `OTC-${Math.floor(10000 + Math.random() * 90000)}-${Math.floor(1000 + Math.random() * 9000)}`;

const START = () => ({
  // Balances per account (the OTC account is what a trade can spend).
  bal: {
    otc: { USD: 20029.62, HKD: 235000, BTC: 0.532161, ETH: 3.1234, USDT: 30000, USDC: 0 },
    custody: { USD: 60000, HKD: 620000, BTC: 1.2, ETH: 30, USDT: 80000, USDC: 5000 },
    trading: { USD: 9000, HKD: 95000, BTC: 0.25, ETH: 5, USDT: 12000, USDC: 0 },
    // RWA+ subscriptions are paid from the PD account (PdFlow).
    pd: { USD: 20029.62, HKD: 156400, BTC: 0, ETH: 0, USDT: 8000, USDC: 12500 },
  },
  orders: [
    { id: "OTC-25061-7720", state: "ongoing", buy: "ETH", pay: "USD", payAmt: 50000, rate: 3420, time: "07-07-2026 14:05" },
    { id: "OTC-25060-8841", state: "filled", buy: "BTC", pay: "USD", payAmt: 50000, rate: 127250, time: "11-06-2026 14:33" },
    { id: "OTC-25059-3310", state: "filled", buy: "ETH", pay: "HKD", payAmt: 93000, rate: 26598, time: "10-06-2026 09:48" },
  ],
  termsAccepted: false,
  // Session
  active: false,
  view: null, // "req" | "chat"
  minimized: false,
  red: false,
  onOtc: false, // the OTC page is on screen (Trade tab, OTC venue)
  ended: false,
  typing: false,
  msgs: [],
  deal: { buy: "BTC", pay: "USD", amount: 0 },
  chosen: null,
  lastQuote: null,
  awaitingNewTrade: false,
  awaitingQuoteMsg: false,
  // Overlays
  sheet: null, // "terms" | "idle" | "confirm" | "postTrade"
  confirm: null, // { v, expired }
  record: null, // trade record page
  transfer: false,
});

const Ctx = createContext(null);
export const useOtc = () => useContext(Ctx);

export function OtcProvider({ children }) {
  const S = useRef(null);
  if (!S.current) S.current = START();
  const s = S.current;
  const [, bump] = useReducer((x) => x + 1, 0);
  const T = useRef([]); // session timers
  const idle = useRef(0);
  const ping = useRef(0);
  const lock = useRef(0);
  const ntCallback = useRef(null);
  const mid = useRef(0);

  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    T.current.push(id);
    return id;
  };
  const clearT = () => {
    T.current.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    T.current = [];
  };
  useEffect(() => () => clearT(), []);

  const push = (m) => {
    s.msgs = [...s.msgs, { id: ++mid.current, at: nowDateTime(), ...m }];
    bump();
  };
  const setRed = () => {
    if (s.minimized) {
      s.red = true;
      bump();
    }
  };
  // Trader "types" for a moment, then the callback posts.
  const typeThen = (ms, fn) => {
    s.typing = true;
    bump();
    later(() => {
      s.typing = false;
      fn();
      bump();
    }, ms);
  };

  /* ---------- Idle prompt (30s) and trader ping (60s after minimising) ---------- */
  const clearIdle = () => clearTimeout(idle.current);
  const resetIdle = () => {
    clearIdle();
    idle.current = setTimeout(() => {
      if (!s.active || s.minimized || s.view !== "chat" || s.sheet) return;
      s.sheet = "idle";
      bump();
    }, 30000);
  };
  const clearPing = () => clearTimeout(ping.current);
  const schedulePing = () => {
    clearPing();
    if (!s.msgs.some((m) => m.k === "quote" && m.status === "live")) return;
    ping.current = setTimeout(() => {
      typeThen(1400, () => {
        push({ k: "desk", text: "Hey, your quote is expiring soon — come back to accept it 👆" });
        setRed();
      });
    }, 60000);
  };

  /* ---------- Quotes ---------- */
  const rateNow = () => (CCY[s.deal.buy].usd / CCY[s.deal.pay].usd) * (1 + QUOTE.spread);
  const appendQuote = () => {
    const rate = rateNow();
    const q = { rate, pay: s.deal.amount, recv: s.deal.amount / rate, buy: s.deal.buy, payCcy: s.deal.pay };
    s.lastQuote = q;
    push({ k: "quote", ...q, ttl: QUOTE.ttl, status: "live" });
  };
  const pushFailedOrder = (state) => {
    const q = s.lastQuote;
    if (!q) return;
    s.orders = [{ id: newOrderId(), state, buy: q.buy, pay: q.payCcy, payAmt: q.pay, rate: q.rate, time: nowDateTime() }, ...s.orders];
  };
  const reqMsg = () => `Hi, I would like to buy ${s.deal.buy} and pay ${fmtCcy(s.deal.amount, s.deal.pay)} ${s.deal.pay}. Can I get a quote?`;

  // TTL countdown for live quote cards.
  const hasLive = s.msgs.some((m) => m.k === "quote" && m.status === "live");
  useEffect(() => {
    if (!hasLive) return undefined;
    const iv = setInterval(() => {
      let expired = false;
      s.msgs = s.msgs.map((m) => {
        if (m.k !== "quote" || m.status !== "live") return m;
        const ttl = m.ttl - 1;
        if (ttl <= 0) {
          expired = true;
          return { ...m, ttl: 0, status: "expired" };
        }
        return { ...m, ttl };
      });
      bump();
      if (expired) {
        setRed();
        pushFailedOrder("expired");
        typeThen(1400, () => {
          push({ k: "desk", text: "The quote has expired. Feel free to ask for a new quote, or any inquiry." });
          setRed();
        });
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [hasLive]); // eslint-disable-line react-hooks/exhaustive-deps

  const traderQuoted = () => {
    s.view = "chat";
    const first = s.msgs.length === 0;
    if (first) {
      push({
        k: "disclaimer",
        text: "This chat is being recorded and monitored for compliance and audit purposes. To protect your account security, please remember that no official representative will ask for your password or verification codes.",
      });
      push({ k: "user", text: reqMsg() });
      push({ k: "sys", text: `Quote request sent · ${nowDateTime()}` });
    }
    if (s.minimized) setRed();
    else resetIdle();
    bump();
    typeThen(1500, () => {
      if (first) push({ k: "desk", text: "Hello, let me take a look to see what I can do for you!" });
      later(() => typeThen(1500, () => appendQuote()), 600);
    });
  };

  const startSession = () => {
    clearT();
    clearPing();
    s.active = true;
    s.minimized = false;
    s.ended = false;
    s.red = false;
    s.awaitingNewTrade = false;
    s.view = "req";
    s.record = null;
    bump();
    later(traderQuoted, 2200);
  };

  const continueQuoting = () => {
    s.awaitingNewTrade = false;
    push({ k: "user", text: reqMsg() });
    push({ k: "sys", text: `Quote request sent · ${nowDateTime()}` });
    later(
      () =>
        typeThen(1500, () => {
          appendQuote();
          if (s.minimized) setRed();
          else {
            s.view = "chat";
            resetIdle();
          }
        }),
      600,
    );
  };

  /* ---------- Public: from the OTC panel ---------- */
  // Every way into the chat (Get quote, an order row, a re-quote) shows the
  // Terms sheet first until it has been accepted once.
  const afterTerms = useRef(null);
  const withTerms = (fn) => {
    if (s.termsAccepted) return fn();
    afterTerms.current = fn;
    s.sheet = "terms";
    bump();
  };
  const requestQuote = (deal) =>
    withTerms(() => {
      s.deal = { ...deal };
      s.msgs = [];
      startSession();
    });
  const acceptTerms = () => {
    s.termsAccepted = true;
    s.sheet = null;
    const fn = afterTerms.current;
    afterTerms.current = null;
    if (fn) fn();
    else bump();
  };

  /* ---------- Minimise / restore ---------- */
  const minimize = () => {
    clearIdle();
    s.minimized = true;
    s.sheet = null;
    // No dot for things already seen in the chat: the dot only means a new
    // update arrived while minimised (setRed).
    bump();
    schedulePing();
  };
  const restore = () => {
    clearPing();
    s.minimized = false;
    s.red = false;
    bump();
    if (s.view === "chat") resetIdle();
  };
  const endSession = () => {
    clearT();
    clearIdle();
    clearPing();
    Object.assign(s, { active: false, view: null, minimized: false, red: false, ended: false, typing: false, sheet: null });
    bump();
  };

  /* ---------- Quote actions ---------- */
  const accept = (m) => {
    clearIdle();
    s.chosen = m;
    s.sheet = "confirm";
    s.confirm = { v: 12, expired: false };
    bump();
    clearInterval(lock.current);
    lock.current = setInterval(() => {
      if (!s.confirm) return clearInterval(lock.current);
      s.confirm = { ...s.confirm, v: s.confirm.v - 1 };
      if (s.confirm.v <= 0) {
        s.confirm = { v: 0, expired: true };
        clearInterval(lock.current);
      }
      bump();
    }, 1000);
  };
  const closeConfirm = () => {
    clearInterval(lock.current);
    s.confirm = null;
    s.sheet = null;
    bump();
    resetIdle();
  };
  const reject = () => {
    pushFailedOrder("rejected");
    s.msgs = s.msgs.map((m) => (m.k === "quote" && m.status === "live" ? { ...m, status: "rejected" } : m));
    push({ k: "user", text: "Reject quote" });
    push({ k: "sys", tone: "reject", text: `${USER_NAME} has rejected the quote · ${nowDateTime()}` });
    typeThen(1400, () => {
      push({ k: "desk", text: "Sure, please feel free to ask for a new quote, or any inquiry." });
      setRed();
    });
  };

  const execute = () => {
    clearInterval(lock.current);
    const q = s.chosen;
    s.confirm = null;
    s.sheet = null;
    s.msgs = s.msgs.map((m) => (m.k === "quote" && m.status === "live" ? { ...m, status: m.id === q.id ? "accepted" : "rejected" } : m));
    push({ k: "stamp", text: `Quote accepted by ${USER_NAME} · ${nowTime()}` });
    push({ k: "sys", text: "Executing trade…", tag: "executing" });
    s.minimized = false;
    s.red = false;
    s.view = "chat";
    // The trade spends the OTC balance now; the purchase lands when filled.
    s.bal.otc[q.payCcy] = Math.max(0, (s.bal.otc[q.payCcy] || 0) - q.pay);
    bump();
    later(() => {
      s.msgs = s.msgs.filter((m) => m.tag !== "executing");
      push({ k: "sys", text: `Quote confirmed, order in execution · ${nowTime()}` });
      typeThen(1200, () => {
        push({ k: "desk", text: "Quote confirmed. See quote summary below. The order will be executed shortly.", card: "summary", q });
        push({ k: "desk", card: "postTrade" });
        typeThen(1200, () => {
          push({ k: "desk", text: "Anything else I can do for you?" });
          resetIdle();
        });
        const id = newOrderId();
        later(() => {
          s.orders = [{ id, state: "ongoing", buy: q.buy, pay: q.payCcy, payAmt: q.pay, rate: q.rate, time: nowDateTime() }, ...s.orders];
          bump();
        }, 5000);
        later(
          () => {
            push({ k: "sys", text: `Order filled · ${nowTime()}` });
            typeThen(1200, () => {
              const at = nowDateTime();
              s.orders = s.orders.map((o) => (o.id === id ? { ...o, state: "filled", time: at } : o));
              s.bal.otc[q.buy] = (s.bal.otc[q.buy] || 0) + q.recv;
              push({ k: "desk", text: "Your order has been filled! See execution summary below.", card: "exec", q, at });
              setRed();
            });
          },
          (30 + Math.floor(Math.random() * 31)) * 1000,
        );
      });
    }, 1800);
  };

  /* ---------- Free text ---------- */
  const parseNewTrade = (txt) => {
    const up = txt.toUpperCase();
    const token = TOKENS.find((k) => up.includes(k));
    const num = txt.replace(/,/g, "").match(/\d+(\.\d+)?/);
    const amount = num ? parseFloat(num[0]) : 0;
    const pay = TOKENS.find((k) => up.includes(k) && k !== token) || s.deal.pay;
    return { token, amount, pay };
  };
  const newTradeFlow = () => {
    typeThen(1400, () => push({ k: "desk", text: "What would you like to buy?", pills: { step: "buy" } }));
    resetIdle();
  };
  const pickPill = (msgId, sym) => {
    const m = s.msgs.find((x) => x.id === msgId);
    if (!m || m.pills.picked) return;
    s.msgs = s.msgs.map((x) => (x.id === msgId ? { ...x, pills: { ...x.pills, picked: sym } } : x));
    bump();
    resetIdle();
    if (m.pills.step === "buy") {
      if (sym === "Other") {
        typeThen(1000, () => push({ k: "desk", text: "Sure! Type the token symbol you'd like to buy (e.g. DOGE, LINK)." }));
        ntCallback.current = (t) => paySten(t.trim().toUpperCase());
        return;
      }
      paySten(sym);
    } else {
      const buy = m.pills.buy;
      typeThen(1200, () => push({ k: "desk", text: `How much ${sym} would you like to spend?` }));
      const awaitAmt = (t) => {
        const val = parseFloat(t.replace(/,/g, ""));
        if (!val || val * (CCY[sym]?.usd || 1) < MIN_USD) {
          typeThen(1000, () => push({ k: "desk", text: `Minimum trade is ${fmtCcy(MIN_USD / (CCY[sym]?.usd || 1), sym)} ${sym} — please enter a higher amount.` }));
          ntCallback.current = awaitAmt;
          return;
        }
        s.deal = { buy: CCY[buy] ? buy : "BTC", pay: sym, amount: val };
        continueQuoting();
      };
      ntCallback.current = awaitAmt;
    }
  };
  function paySten(buy) {
    typeThen(1200, () => push({ k: "desk", text: "What would you like to pay with?", pills: { step: "pay", buy } }));
  }

  const send = (txt) => {
    const t = txt.trim();
    if (!t) return;
    push({ k: "user", text: t });
    resetIdle();
    const low = t.toLowerCase();
    if (low === "cancel" || low === "cancel trade") {
      ntCallback.current = null;
      s.awaitingNewTrade = false;
      push({ k: "sys", text: `Trade cancelled · ${nowTime()}` });
      typeThen(1400, () => push({ k: "desk", text: "Got it, please tell me if you want to request a new quote." }));
      return;
    }
    if (ntCallback.current) {
      const fn = ntCallback.current;
      ntCallback.current = null;
      fn(t);
      return;
    }
    if (s.awaitingNewTrade) {
      s.awaitingNewTrade = false;
      const p = parseNewTrade(t);
      if (p.token && p.amount >= MIN_USD) {
        s.deal = { buy: p.token, pay: p.pay, amount: p.amount };
        typeThen(1200, () => {
          push({ k: "desk", text: `Got it — getting you a quote to buy ${p.token} with ${fmtCcy(p.amount, p.pay)} ${p.pay}…` });
          later(continueQuoting, 1000);
        });
      } else {
        typeThen(1200, () => {
          push({ k: "desk", text: "Sorry, could you clarify the token and amount? (e.g. BTC, 10,000 USDT)" });
          s.awaitingNewTrade = true;
        });
      }
      return;
    }
    if (low === "trade" || low === "wanna trade") return newTradeFlow();
    const KW = ["quote", "trade", "buy", "sell", "price", "exchange", "swap", "convert", "order", "rate", "how much", "btc", "eth", "usdt", "usd", "amount"];
    if (KW.some((k) => low.includes(k))) {
      s.awaitingQuoteMsg = false;
      continueQuoting();
      return;
    }
    if (s.awaitingQuoteMsg) {
      s.awaitingQuoteMsg = false;
      typeThen(1400, () =>
        push({ k: "desk", text: "Sorry, we are currently only providing quote service. Please stay tuned for more service in the near future." }),
      );
      return;
    }
    s.awaitingQuoteMsg = true;
    typeThen(1200, () => push({ k: "desk", text: "Hi there! How can I help you?" }));
  };

  /* ---------- Orders ---------- */
  const openOrder = (o) => {
    if (o.state !== "filled" && !s.termsAccepted) return withTerms(() => openOrder(o));
    if (o.state === "ongoing") {
      clearT();
      s.active = true;
      s.minimized = false;
      s.red = false;
      s.view = "chat";
      s.deal = { buy: o.buy, pay: o.pay, amount: o.payAmt };
      s.msgs = [];
      push({ k: "sys", text: `Order placed · with the desk · ${nowTime()}` });
      typeThen(1200, () => push({ k: "desk", text: "Your order is being filled — Will update you here 👇", card: "order", o }));
    } else if (o.state === "filled") {
      s.record = { buy: o.buy, pay: o.pay, rate: o.rate, payAmt: o.payAmt, recv: o.payAmt / o.rate, time: o.time, id: o.id };
      bump();
    } else {
      s.deal = { buy: o.buy, pay: o.pay, amount: o.payAmt };
      s.msgs = [];
      startSession();
    }
  };

  /* ---------- Transfer between accounts ---------- */
  const transfer = (from, to, sym, amt) => {
    s.bal[from][sym] = (s.bal[from][sym] || 0) - amt;
    s.bal[to][sym] = (s.bal[to][sym] || 0) + amt;
    bump();
  };

  const api = {
    s,
    requestQuote,
    acceptTerms,
    minimize,
    restore,
    endSession,
    accept,
    reject,
    execute,
    closeConfirm,
    send,
    pickPill,
    openOrder,
    transfer,
    resetIdle,
    set: (patch) => {
      Object.assign(s, patch);
      bump();
    },
    setOnOtc: (v) => {
      if (s.onOtc === v) return;
      s.onOtc = v;
      bump();
    },
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <OtcOverlay />
    </Ctx.Provider>
  );
}

/* ====================================================================== */
/* UI                                                                     */
/* ====================================================================== */

const Tk = ({ c, size = 16 }) => (CCY[c] ? <img className="oc-tk" src={`${IMG}/${CCY[c].icon}`} width={size} height={size} alt="" /> : <span className="oc-tk is-blank" style={{ width: size, height: size }} />);

const Sheet = ({ open, onClose, children, className = "" }) => (
  <>
    <div className={`oc-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
    <div className={`oc-sheet${open ? " is-open" : ""} ${className}`} role="dialog" aria-modal="true" aria-hidden={!open}>
      <span className="oc-grab" aria-hidden="true" />
      {open && children}
    </div>
  </>
);

const TERMS = [
  {
    h: "Section 1: Trade Terms",
    li: [
      "Statement of account issued by a custodian within the last 12 months",
      "The All-in Price includes a markup of up to 3%.",
      "A Trade is confirmed as final and cannot be cancelled or modified by you.",
      "You acknowledge and agree that the assets specified in an OTC trade confirmation will be locked pending settlement, which is expected within 0–2 business days following the Trade Date.",
    ],
  },
  {
    h: "Section 2: Important Information",
    li: [
      "Within 2 business days following the Trade Date, the designated third-party counterparty shall transfer the relevant assets to EXIO for trade settlement. Should the counterparty fail to deliver, EXIO reserves the right to cancel the Trade pursuant to the Trading Rules for Off-Platform Trading and the Client Terms and Conditions.",
      "In the event of a Trade cancellation, EXIO will promptly notify you via email with a Notification of Order Cancellation. Upon cancellation, your locked assets will be released, and you will receive a subsequent email confirming the unlocking of your assets.",
      "Please review Part 4 of the Client Terms and Conditions for details of the risks associated with off-platform transactions and Virtual Assets.",
    ],
  },
];

const TermsBody = ({ onEnd }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onEnd) return undefined;
    const check = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 16) onEnd();
    };
    check();
    el.addEventListener("scroll", check);
    return () => el.removeEventListener("scroll", check);
  }, [onEnd]);
  return (
    <div className="oc-terms" ref={ref}>
      {TERMS.map((sec) => (
        <section key={sec.h}>
          <h3>{sec.h}</h3>
          <ol>
            {sec.li.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
};

const TermsSheet = () => {
  const { s, acceptTerms, set } = useOtc();
  const [read, setRead] = React.useState(false);
  const open = s.sheet === "terms";
  useEffect(() => {
    if (!open) setRead(false);
  }, [open]);
  return (
    <Sheet open={open} onClose={() => set({ sheet: null })} className="is-tall">
      <h2 className="oc-sheet-title">Terms and Information</h2>
      <TermsBody onEnd={() => setRead(true)} />
      <div className="oc-sheet-foot">
        <p className="oc-fine">
          By using the OTC Chat Trading service, you agree to the Trade Terms and acknowledge the risks of off-platform Virtual Asset transactions as set out in the client Terms and Conditions.
        </p>
        <button type="button" className="oc-btn is-primary" disabled={!read} onClick={acceptTerms}>
          {read ? "Start chat" : "Scroll down and continue"}
        </button>
        <p className="oc-conv">Conversation ID {CONV_ID}</p>
      </div>
    </Sheet>
  );
};

const PostTradeSheet = () => {
  const { s, set } = useOtc();
  return (
    <Sheet open={s.sheet === "postTrade"} onClose={() => set({ sheet: null })} className="is-tall">
      <h2 className="oc-sheet-title">Terms and Information</h2>
      <TermsBody />
      <div className="oc-sheet-foot">
        <button type="button" className="oc-btn is-primary" onClick={() => set({ sheet: null })}>
          Close
        </button>
      </div>
    </Sheet>
  );
};

const IdleSheet = () => {
  const { s, set, resetIdle, minimize } = useOtc();
  const keep = () => {
    set({ sheet: null });
    resetIdle();
  };
  return (
    <Sheet open={s.sheet === "idle"} onClose={keep}>
      <h2 className="oc-sheet-title">Still there?</h2>
      <p className="oc-sheet-text">You have been inactive for a while. Back to the app?</p>
      <div className="oc-sheet-foot is-stack">
        <button type="button" className="oc-btn is-primary" onClick={keep}>
          Keep chatting
        </button>
        <button type="button" className="oc-btn is-outline" onClick={minimize}>
          Back to app
        </button>
      </div>
    </Sheet>
  );
};

const ConfirmSheet = () => {
  const { s, execute, closeConfirm } = useOtc();
  const q = s.chosen;
  const c = s.confirm;
  return (
    <Sheet open={s.sheet === "confirm"} onClose={closeConfirm}>
      {q && c && (
        <>
          <h2 className="oc-sheet-title">Accept quote</h2>
          <div className="oc-cs">
            <div className="oc-cs-swap">
              <div className="oc-cs-head">
                <span>Pay</span>
                <span>Receive</span>
              </div>
              <div className="oc-cs-row">
                <span className="oc-cs-side">
                  <Tk c={q.payCcy} size={24} />
                  <b>{fmtCcy(q.pay, q.payCcy)}</b>
                  <i>{q.payCcy}</i>
                </span>
                <span className="oc-cs-arrow">→</span>
                <span className="oc-cs-side is-end">
                  <b>{rcvFmt(q.recv)}</b>
                  <i>{q.buy}</i>
                  <Tk c={q.buy} size={24} />
                </span>
              </div>
            </div>
            <div className="oc-rows">
              <div>
                <span>Price</span>
                <b>
                  1 {q.buy} = {rfmt(q.rate)} {q.payCcy}
                </b>
              </div>
              <div>
                <span>Status</span>
                <b className="oc-status">
                  {c.expired ? (
                    "Expired"
                  ) : (
                    <>
                      <i />
                      Available (0:{pad(c.v)})
                    </>
                  )}
                </b>
              </div>
              <div>
                <span>Order ID</span>
                <b className="is-muted">{CONV_ID}</b>
              </div>
            </div>
          </div>
          <div className="oc-alert">
            <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="10" fill="#d28025" />
              <path d="M10 5.5v5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="10" cy="14.5" r="1.1" fill="#fff" />
            </svg>
            <p>Tap “Confirm” to execute this Trade. Executed Trades are final and cannot be cancelled or modified; your assets will be locked pending settlement (0–2 business days).</p>
          </div>
          <div className="oc-sheet-foot is-stack">
            {c.expired ? (
              <button type="button" className="oc-btn is-outline" onClick={closeConfirm}>
                Quote expired, back to the chat
              </button>
            ) : (
              <>
                <button type="button" className="oc-btn is-primary" onClick={execute}>
                  Confirm
                </button>
                <button type="button" className="oc-btn is-outline" onClick={closeConfirm}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
};

/* ---------- Chat pieces ---------- */

const QuoteCard = ({ m }) => {
  const { accept, reject } = useOtc();
  const live = m.status === "live";
  return (
    <div className={`oc-qcard is-${m.status}`}>
      <div className="oc-qcard-head">
        <span className={`oc-ttl is-${m.status}${live && m.ttl <= 10 ? " is-low" : ""}`}>
          {m.status === "accepted" ? (
            <>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <circle cx="6" cy="6" r="6" fill="#00bf80" />
                <path d="M3.5 6.2L5.2 7.9L8.5 4.5" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              Quote accepted
            </>
          ) : m.status === "rejected" ? (
            "Rejected"
          ) : m.status === "expired" ? (
            "Expired"
          ) : (
            <>
              <i />
              Available ({fmtTTL(m.ttl)})
            </>
          )}
        </span>
        <span className="oc-oid">Order ID {CONV_ID}</span>
      </div>
      <div className="oc-qrate">
        <b>1</b> <i>{m.buy}</i> <b>=</b> <b>{rfmt(m.rate)}</b> <i>{m.payCcy}</i>
      </div>
      <div className="oc-legs">
        <span>
          <Tk c={m.payCcy} />
          <b className="is-out">-{fmtCcy(m.pay, m.payCcy)}</b>
          <i>{m.payCcy}</i>
        </span>
        <span>
          <Tk c={m.buy} />
          <b className="is-in">+{rcvFmt(m.recv)}</b>
          <i>{m.buy}</i>
        </span>
      </div>
      {live && (
        <div className="oc-qactions">
          <button type="button" className="oc-btn is-primary is-sm" onClick={() => accept(m)}>
            Accept
          </button>
          <button type="button" className="oc-btn is-outline is-sm" onClick={reject}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
};

const Summary = ({ q }) => (
  <div className="oc-qconf">
    <div className="oc-oid">Order ID {CONV_ID}</div>
    <div className="oc-qconf-row">
      <span>Rate</span>
      <span>
        <b>1</b> <i>{q.buy}</i> <b>=</b> <b>{rfmt(q.rate)}</b> <i>{q.payCcy}</i>
      </span>
    </div>
    <div className="oc-qconf-row">
      <span>Paid</span>
      <span>
        <Tk c={q.payCcy} /> <b>{fmtCcy(q.pay, q.payCcy)}</b> <i>{q.payCcy}</i>
      </span>
    </div>
    <div className="oc-qconf-row">
      <span>Received</span>
      <span>
        <Tk c={q.buy} /> <b>{rcvFmt(q.recv)}</b> <i>{q.buy}</i>
      </span>
    </div>
  </div>
);

const ExecCard = ({ q, at }) => {
  const { set } = useOtc();
  const [d, t] = at.split(" ");
  return (
    <div className="oc-exec">
      <img src={`${IMG}/result-success.png`} width="80" height="80" alt="" />
      <b className="oc-exec-title">Order filled</b>
      <div className="oc-qconf-row">
        <span>Order ID</span>
        <b>396878</b>
      </div>
      <div className="oc-qconf-row">
        <span>Executed time</span>
        <b>
          {d}&nbsp;&nbsp;{t}
        </b>
      </div>
      <hr />
      <Summary q={q} />
      <button
        type="button"
        className="oc-link"
        onClick={() => set({ record: { buy: q.buy, pay: q.payCcy, rate: q.rate, payAmt: q.pay, recv: q.recv, time: at, id: "396878" } })}
      >
        View transaction
      </button>
    </div>
  );
};

const OrderCard = ({ o }) => {
  const qty = o.payAmt / o.rate;
  return (
    <div className="oc-qconf">
      <div className="oc-ordhead">
        <span>
          <Tk c={o.buy} size={20} /> Buy {o.buy}
        </span>
        <span className="oc-filling">
          <i /> Filling
        </span>
      </div>
      <div className="oc-qconf-row">
        <span>You paid</span>
        <b>
          {fmtCcy(o.payAmt, o.pay)} {o.pay}
        </b>
      </div>
      <div className="oc-qconf-row">
        <span>You received</span>
        <b>
          {rcvFmt(qty)} {o.buy}
        </b>
      </div>
      <div className="oc-qconf-row">
        <span>{o.time}</span>
      </div>
    </div>
  );
};

const Pills = ({ m }) => {
  const { pickPill } = useOtc();
  const list = m.pills.step === "buy" ? ["BTC", "ETH", "USD", "HKD", "USDT", "USDC"] : ["BTC", "ETH", "USD", "HKD", "USDT", "USDC"];
  const picked = m.pills.picked;
  return (
    <div className="oc-pills">
      {list.map((c) => {
        const off = !!picked || CCY[c]?.pi || (m.pills.step === "pay" && c === m.pills.buy);
        return (
          <button key={c} type="button" className={`oc-pill${picked === c ? " is-sel" : ""}`} disabled={off && picked !== c} onClick={() => pickPill(m.id, c)}>
            <Tk c={c} />
            {c}
            {CCY[c]?.pi && <span className="oc-pi">PI</span>}
          </button>
        );
      })}
      {m.pills.step === "buy" && (
        <button type="button" className={`oc-pill is-custom${picked === "Other" ? " is-sel" : ""}`} disabled={!!picked && picked !== "Other"} onClick={() => pickPill(m.id, "Other")}>
          Other
        </button>
      )}
    </div>
  );
};

const Msg = ({ m }) => {
  const { set } = useOtc();
  if (m.k === "disclaimer") return <div className="oc-disclaimer">{m.text}</div>;
  if (m.k === "sys") return <div className={`oc-sys${m.tone === "reject" ? " is-reject" : ""}`}>{m.text}</div>;
  if (m.k === "stamp") return <div className="oc-stamp">{m.text}</div>;
  if (m.k === "user")
    return (
      <div className="oc-ubub">
        <span>{m.text}</span>
        <small>{m.at}</small>
      </div>
    );
  if (m.k === "quote")
    return (
      <div className="oc-bubble is-wide">
        <QuoteCard m={m} />
        <small>{m.at}</small>
      </div>
    );
  // desk
  return (
    <div className={`oc-bubble${m.card ? " is-wide" : ""}`}>
      {m.text && <div>{m.text}</div>}
      {m.pills && <Pills m={m} />}
      {m.card === "summary" && <Summary q={m.q} />}
      {m.card === "exec" && <ExecCard q={m.q} at={m.at} />}
      {m.card === "order" && <OrderCard o={m.o} />}
      {m.card === "postTrade" && (
        <>
          <div className="oc-pt-lead">These trade terms and information apply to the order you have just confirmed.</div>
          <button type="button" className="oc-pt" onClick={() => set({ sheet: "postTrade" })}>
            <span className="oc-pt-ico">
              <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden="true">
                <path d="M11 1H3a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V7l-6-6z" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M11 1v6h6" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="oc-pt-txt">
              <b>Terms and Information</b>
              <small>OTC | Post-Trade</small>
            </span>
            <span className="oc-pt-arr">›</span>
          </button>
        </>
      )}
      <small>{m.at}</small>
    </div>
  );
};

const Desk = ({ status }) => {
  const { minimize } = useOtc();
  return (
    <header className="oc-desk">
      <img className="oc-av" src={`${IMG}/trader.png`} width="40" height="40" alt="" />
      <div className="oc-desk-text">
        <b>EXIO Trading Desk</b>
        <span>{status}</span>
      </div>
      <button type="button" className="oc-min" aria-label="Minimise chat" onClick={minimize}>
        <img src={`${IMG}/minimize.svg`} width="24" height="24" alt="" />
      </button>
    </header>
  );
};

const ChatScreen = () => {
  const { s, send, resetIdle } = useOtc();
  const [text, setText] = React.useState("");
  const listRef = useRef(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.msgs.length, s.typing]);
  const submit = () => {
    send(text);
    setText("");
  };
  return (
    <div className="oc-ps-body" onClick={resetIdle}>
      <Desk
        status={
          <>
            <em>Online</em>&nbsp;&nbsp;·&nbsp;&nbsp;Trader {TRADER}&nbsp;&nbsp;·&nbsp;&nbsp;Conversation ID {CONV_ID}
          </>
        }
      />
      <div className="oc-chat" ref={listRef}>
        {s.msgs.map((m) => (
          <Msg key={m.id} m={m} />
        ))}
        {s.typing && <div className="oc-sys">{TRADER} is typing…</div>}
      </div>
      <div className="oc-inputbar">
        <input
          type="text"
          value={text}
          placeholder="Message / counter…"
          aria-label="Message"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button type="button" className={`oc-send${text.trim() ? " is-on" : ""}`} aria-label="Send" onClick={submit}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path
              d="M.02 17.16l1.52-6.58c.06-.28.3-.5.6-.54l8.5-.88c.24-.02.24-.38 0-.42l-8.5-.82c-.3-.02-.54-.24-.6-.52L.02.84C-.12.27.48-.19 1 .07l16.62 8.33c.5.26.5.98 0 1.24L1 17.93c-.52.26-1.12-.2-.98-.77z"
              fill="#fff"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};

const Connecting = () => {
  const { minimize } = useOtc();
  return (
    <div className="oc-ps-body">
      <Desk status={`Connecting... · Conversation ID ${CONV_ID}`} />
      <div className="oc-center">
        <span className="oc-spinner" />
        <h2>Connecting you to our trader...</h2>
        <p>Our trader will quote you shortly</p>
      </div>
      <div className="oc-foot">
        <button type="button" className="oc-btn is-outline" onClick={minimize}>
          Cancel
        </button>
      </div>
    </div>
  );
};

/* ---------- Trade record (receipt) ---------- */
const Record = () => {
  const { s, set } = useOtc();
  const r = s.record;
  if (!r) return null;
  return (
    <div className="oc-screen oc-page">
      <header className="oc-appbar">
        <button type="button" className="oc-back" aria-label="Back" onClick={(e) => slideBack(e, () => set({ record: null }))}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="rgba(0,0,0,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1>Trade record</h1>
        <span />
      </header>
      <div className="oc-page-body">
        <div className="oc-record">
          <div className="oc-record-top">
            <span>{r.time}</span>
            <span className="oc-done-pill">Completed</span>
          </div>
          <b className="oc-record-head">
            Buy {r.buy} · Pay {r.pay}
          </b>
          <hr />
          <div className="oc-qconf-row">
            <span>Quantity</span>
            <b>
              {rcvFmt(r.recv)} {r.buy}
            </b>
          </div>
          <div className="oc-qconf-row">
            <span>Amount</span>
            <b>
              {fmtCcy(r.payAmt, r.pay)} {r.pay}
            </b>
          </div>
          <div className="oc-qconf-row">
            <span>Price</span>
            <b>
              {rfmt(r.rate)} {r.pay}
            </b>
          </div>
          <div className="oc-qconf-row">
            <span>Counterparty</span>
            <b>EXIO Trading Desk</b>
          </div>
        </div>
        <p className="oc-fine is-center">Chat log retained for audit trail</p>
      </div>
      <div className="oc-foot is-row">
        <button type="button" className="oc-btn is-outline">
          Export receipt
        </button>
        <button type="button" className="oc-btn is-primary" onClick={() => set({ record: null })}>
          Trade again
        </button>
      </div>
    </div>
  );
};

/* ---------- Transfer between accounts (to top up the OTC account) ---------- */
const ACCTS = [
  ["custody", "Custody account"],
  ["trading", "Trading account"],
  ["otc", "OTC account"],
  ["pd", "PD account"],
];
const acctName = (k) => ACCTS.find((a) => a[0] === k)?.[1];

const Transfer = () => {
  const { s, set, transfer } = useOtc();
  const t = s.transfer;
  const [amt, setAmt] = React.useState("");
  const [pick, setPick] = React.useState(null); // "asset" | "from" | "to"
  const [done, setDone] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const amtRef = useRef(null);
  useEffect(() => {
    setAmt("");
    setDone(false);
  }, [!!t]);
  if (!t) return null;
  const upd = (p) => set({ transfer: { ...t, ...p } });
  const avail = t.from ? s.bal[t.from][t.asset] || 0 : 0;
  const v = parseFloat(amt.replace(/,/g, "")) || 0;
  const over = !!t.from && v > avail + 1e-9;
  const can = t.from && t.to && t.from !== t.to && v > 0 && !over;
  const submit = () => {
    if (!can) return;
    transfer(t.from, t.to, t.asset, v);
    setAmt("");
    setDone(true);
  };
  return (
    <div className="oc-screen oc-page is-xfer">
      <header className="oc-appbar">
        <button type="button" className="oc-back" aria-label="Back" onClick={(e) => slideBack(e, () => set({ transfer: null }))}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="rgba(0,0,0,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h1>Transfer</h1>
        <button type="button" className="oc-back" aria-label="Transfer history">
          <img src={`${import.meta.env.BASE_URL}images/trade/history.svg`} width="24" height="24" alt="" />
        </button>
      </header>
      {done && (
        <div className="oc-success" role="status">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="7" fill="#00B27A" />
            <path d="M5 8l2.5 2.5L11 5.5" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <b>Transfer success</b>
            <span>Assets have been successfully transferred.</span>
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => setDone(false)}>
            ×
          </button>
        </div>
      )}
      {/* Figma OTC Chat Trading 7312:13933, fields in the OTC / RWA+ style
          (2026-11-03): From / To pickers with the swap on the seam, then an
          amount field whose chip picks the asset, Avail. + Max in its head. */}
      <div className="oc-page-body oc-xfer otc otc-style-ifta">
        <div className="oc-xpair">
          {[
            ["from", "From"],
            ["to", "To"],
          ].map(([k, l], i) => (
            <React.Fragment key={k}>
              {i === 1 && (
                <button type="button" className="otc-swap oc-xswap" aria-label="Swap accounts" onClick={() => upd({ from: t.to, to: t.from })}>
                  <img src={`${import.meta.env.BASE_URL}images/trade/up-down.svg`} width="16" height="16" alt="" />
                </button>
              )}
              <button type="button" className="oc-xpick" aria-haspopup="dialog" onClick={() => setPick(k)}>
                <span className="otc-label">{l}</span>
                <span className="oc-xpick-row">
                  <b className={t[k] ? "" : "is-placeholder"}>{t[k] ? acctName(t[k]) : "Choose account"}</b>
                  <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" />
                </span>
              </button>
            </React.Fragment>
          ))}
        </div>
        <div className="otc-fields oc-xamt-wrap">
          <div className={`otc-amount is-pay is-up${focused ? " is-focused" : ""}${over ? " is-error" : ""}${t.from ? "" : " is-dim"}`}>
            <div className="otc-amount-box" onMouseDown={(e) => {
              if (e.target === amtRef.current || e.target.closest("button")) return;
              e.preventDefault();
              amtRef.current?.focus();
            }}>
              <div className="otc-amount-head">
                <label className="otc-label" htmlFor="oc-xamt">
                  Transfer amount
                </label>
                <span className="otc-avail">
                  Avail.
                  <b>
                    {t.from ? fmtCcy(avail, t.asset) : "-"} {t.asset}
                  </b>
                  <button type="button" className="otc-all" disabled={!t.from} onMouseDown={(e) => e.preventDefault()} onClick={() => setAmt(avail > 0 ? String(+avail.toFixed(CCY[t.asset].dp)) : "")}>
                    Max
                  </button>
                </span>
              </div>
              <div className="otc-amount-row">
                <input
                  ref={amtRef}
                  id="oc-xamt"
                  className="otc-input"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={amt}
                  disabled={!t.from}
                  aria-invalid={over || undefined}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onChange={(e) => setAmt(e.target.value.replace(/[^\d.]/g, ""))}
                />
                <button type="button" className="otc-chip" aria-label={`Asset: ${t.asset}`} aria-haspopup="dialog" onClick={() => setPick("asset")}>
                  <img src={`${IMG}/${CCY[t.asset].icon}`} width="20" height="20" alt="" />
                  <b>{t.asset}</b>
                  <img src={`${IMG}/arrow-down.svg`} width="12" height="12" alt="" />
                </button>
              </div>
            </div>
          </div>
          {over && <p className="otc-note">Exceeds your available balance.</p>}
        </div>
      </div>
      <div className="oc-foot">
        <button type="button" className="oc-btn is-primary" disabled={!can} onClick={submit}>
          Transfer
        </button>
      </div>
      {/* Asset: the shared currency sheet, with the From account's balances. */}
      <TokenSheet
        open={pick === "asset"}
        title="Asset"
        value={t.asset}
        onPick={(c) => {
          upd({ asset: c });
          setAmt("");
        }}
        onClose={() => setPick(null)}
        options={TOKENS.map((c) => ({
          value: c,
          name: CCY[c].name,
          icon: <img src={`${IMG}/${CCY[c].icon}`} alt="" />,
          balance: t.from ? fmtCcy(s.bal[t.from][c] || 0, c) : "-",
          disabled: !!CCY[c].pi,
          tag: CCY[c].pi ? "PI" : undefined,
        }))}
      />
      {/* Accounts: same cell as the currency sheet, the asset's balance on the right. */}
      <TokenSheet
        open={pick === "from" || pick === "to"}
        title="Select account"
        value={pick === "to" ? t.to : t.from}
        onPick={(k) => {
          upd(pick === "from" ? { from: k } : { to: k });
          setAmt("");
        }}
        onClose={() => setPick(null)}
        options={ACCTS.map(([k, name]) => ({
          value: k,
          label: name,
          balance: fmtCcy(s.bal[k][t.asset] || 0, t.asset),
          unit: t.asset,
          disabled: k === (pick === "to" ? t.from : t.to),
        }))}
      />
    </div>
  );
};

const CheckMark = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="9" r="7.5" fill="#00D690" />
    <path d="M5.75 9.25l2.25 2.25 4.25-4.5" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/* ---------- Red dot (Figma OTC Chat Trading, "red-dot logic" 9820:10207) ----------
   A minimised chat with an update (trader reply, quote expired…) shows one
   red dot, on whichever entry point leads back to it from where the user is:
   - another tab        → the Trade tab in the bottom nav
   - Trade, Order book  → the "OTC" segment
   - the OTC page       → the floating chat button (only shown there)
   Opening the chat clears it. */
export const useOtcUpdate = () => {
  const { s } = useOtc();
  return s.active && s.minimized && s.red;
};
export const OtcDot = ({ className = "" }) => (useOtcUpdate() ? <span className={`oc-dot ${className}`} aria-label="New chat update" /> : null);

/* ---------- Floating bubble ---------- */
const Bubble = () => {
  const { s, restore } = useOtc();
  const [docked, setDocked] = React.useState(false);
  const show = s.active && s.minimized && s.onOtc;
  useEffect(() => {
    setDocked(false);
    if (!show || s.red) return undefined;
    const t = setTimeout(() => setDocked(true), 5000);
    return () => clearTimeout(t);
  }, [show, s.red]);
  if (!show) return null;
  return (
    <button
      type="button"
      className={`oc-bubble-btn${docked ? " is-docked" : ""}${s.ended ? " is-ended" : ""}`}
      aria-label={s.red ? "Open chat (new update)" : "Open chat"}
      onClick={() => (docked ? setDocked(false) : restore())}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 2C2.9 2 2 2.9 2 4v11c0 1.1.9 2 2 2v4l4-4h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2H4z" fill="#fff" />
      </svg>
      {s.red && <span className="oc-red" />}
    </button>
  );
};

/* ---------- Chat as an iOS page sheet (2026-11-02) ----------
   Same presentation as the sign-up sheet: the app behind shrinks into a
   rounded card on black (.mhc-phone.as-open, --as-p 0→1) and the chat slides
   up 10px below it. Android: a full-screen page sliding up. Dragging the
   handle / header down more than 120px minimises the chat to the bubble. */
const PageSheet = ({ open, children }) => {
  const { minimize } = useOtc();
  const [shown, setShown] = React.useState(open);
  const [drag, setDrag] = React.useState(0);
  const ref = useRef(null);
  const start = useRef(null);
  const phone = () => ref.current?.closest(".mhc-phone");
  const setP = (p) => phone()?.style.setProperty("--as-p", String(p));
  useEffect(() => {
    if (open) setShown(true);
  }, [open]);
  useEffect(() => {
    const ph = phone();
    if (!ph) return undefined;
    if (open) {
      ph.classList.add("as-open");
      setP(0);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setP(1)));
      return () => cancelAnimationFrame(r);
    }
    if (!shown) return undefined;
    setP(0);
    const t = setTimeout(() => {
      ph.classList.remove("as-open");
      ph.style.removeProperty("--as-p");
      setShown(false);
    }, 450);
    return () => clearTimeout(t);
  }, [open, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDown = (e) => {
    // Drag from the handle or the desk header (top 80px), not from buttons.
    if (e.target.closest("button, input")) return;
    const top = ref.current?.getBoundingClientRect().top ?? 0;
    if (e.clientY - top > 80) return;
    start.current = e.clientY;
    phone()?.classList.add("as-dragging");
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (start.current == null) return;
    const dy = Math.max(0, e.clientY - start.current);
    setDrag(dy);
    const h = ref.current?.offsetHeight || 1;
    setP(1 - Math.min(dy / h, 1));
  };
  const onUp = () => {
    if (start.current == null) return;
    start.current = null;
    phone()?.classList.remove("as-dragging");
    const far = drag > 120;
    setDrag(0);
    if (far) minimize();
    else setP(1);
  };
  if (!shown) return null;
  return (
    <>
      <div className="oc-ps-scrim" aria-hidden="true" onClick={minimize} />
      <div
        className="oc-ps"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Chat with the EXIO Trading Desk"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="oc-ps-grip">
          <span className="oc-grab" aria-hidden="true" />
        </div>
        {children}
      </div>
    </>
  );
};

function OtcOverlay() {
  const { s } = useOtc();
  const chatOpen = s.active && !s.minimized;
  const last = useRef(null);
  if (chatOpen) last.current = s.view;
  return (
    <PhoneLayer className="oc-layer">
      <PageSheet open={chatOpen}>{(chatOpen ? s.view : last.current) === "req" ? <Connecting /> : <ChatScreen />}</PageSheet>
      <Record />
      <Transfer />
      <Bubble />
      <TermsSheet />
      <IdleSheet />
      <ConfirmSheet />
      <PostTradeSheet />
    </PhoneLayer>
  );
}
