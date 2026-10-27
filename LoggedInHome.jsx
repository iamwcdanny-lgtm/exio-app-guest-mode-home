import React, { useEffect, useRef, useState } from "react";
import "./LoggedInHome.css";

// Logged-in Home, empty custody wallet (Figma: Home Custody NoAssets, 19497:35542).
const IMG = `${import.meta.env.BASE_URL}images/home`;
const ICONS = `${import.meta.env.BASE_URL}images/onboarding/icons`;

const ACTIONS = [
  { key: "deposit", label: "Deposit", primary: true },
  { key: "withdraw", label: "Withdraw" },
  { key: "transfer", label: "Transfer" },
  { key: "history", label: "History" },
];

// Wallet tabs. Watchlist is a list of favourites rather than a wallet.
const TABS = [
  { key: "watchlist", label: "Watchlist" },
  { key: "custody", label: "Custody", wallet: "custody" },
  { key: "trading", label: "Trading", wallet: "trading" },
  { key: "otc", label: "OTC", wallet: "OTC" },
];

const LoggedInHome = ({ welcome = "" }) => {
  const [hidden, setHidden] = useState(false);
  const [tab, setTab] = useState("custody");
  const [hideSmall, setHideSmall] = useState(true);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const say = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  };
  // A short "you're in" note when arriving from sign in / sign up.
  useEffect(() => {
    if (welcome) say(welcome);
  }, [welcome]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const notHere = (what) => say(`${what} isn’t in this prototype`);
  const current = TABS.find((t) => t.key === tab);
  const mask = (v) => (hidden ? "******" : v);

  return (
    <div className="lh">
      <div className="lh-scroll">
        <div className="lh-header">
          <button type="button" className="lh-icon-btn" aria-label="Account" onClick={() => notHere("Account")}>
            <img src={`${ICONS}/avatar.svg`} width="24" height="24" alt="" />
          </button>
          <div className="lh-header-actions">
            <button type="button" className="lh-icon-btn" aria-label="Customer service" onClick={() => notHere("Customer service")}>
              <img src={`${ICONS}/customer-service.svg`} width="24" height="24" alt="" />
            </button>
            <button type="button" className="lh-icon-btn" aria-label="Notifications" onClick={() => notHere("Notifications")}>
              <img src={`${ICONS}/bell.svg`} width="24" height="24" alt="" />
            </button>
          </div>
        </div>

        <div className="lh-summary">
          <div className="lh-total">
            <div className="lh-total-label">
              <span>Total value</span>
              <button
                type="button"
                className={`lh-eye${hidden ? " is-off" : ""}`}
                aria-label={hidden ? "Show balances" : "Hide balances"}
                aria-pressed={hidden}
                onClick={() => setHidden((h) => !h)}
              >
                <img src={`${IMG}/eye.svg`} width="16" height="16" alt="" />
              </button>
            </div>
            <div className="lh-total-value">
              <span className="lh-amount">{mask("182,230.34")}</span>
              <span className="lh-ccy">USD</span>
            </div>
          </div>

          <div className="lh-actions">
            {ACTIONS.map((a) => (
              <button key={a.key} type="button" className="lh-action" onClick={() => notHere(a.label)}>
                <span className={`lh-action-icon${a.primary ? " is-primary" : ""}`}>
                  <img src={`${IMG}/${a.key}.svg`} width="20" height="20" alt="" />
                </span>
                <span className="lh-action-label">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button type="button" className="lh-banner" onClick={() => notHere("This campaign")}>
          <span className="lh-banner-img">
            <img src={`${IMG}/banner-fiat.jpg`} width="100" height="100" alt="" />
          </span>
          <span className="lh-banner-text">
            <span className="lh-banner-title">Seamless Fiat Gateway</span>
            <span className="lh-banner-sub">Unlock Crypto with HKD and USD</span>
          </span>
          <span className="lh-banner-pager">1/3</span>
        </button>

        <div className="lh-tabs" role="tablist" aria-label="Wallets">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`lh-tab${tab === t.key ? " is-on" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.key === "watchlist" && <img src={`${IMG}/star.svg`} width="12" height="12" alt="" />}
              {t.label}
            </button>
          ))}
        </div>

        {current.wallet ? (
          <section className="lh-wallet" aria-label={`${current.label} wallet`}>
            <div className="lh-wallet-total">
              <span>Total {current.wallet} value</span>
              <span className="lh-wallet-amount">
                <b>{mask("0.00")}</b> USD
              </span>
            </div>

            <div className="lh-wallet-tools">
              <button
                type="button"
                className={`lh-hide-small${hideSmall ? " is-on" : ""}`}
                aria-pressed={hideSmall}
                onClick={() => setHideSmall((v) => !v)}
              >
                {hideSmall ? (
                  <img src={`${IMG}/check-circle.svg`} width="16" height="16" alt="" />
                ) : (
                  <span className="lh-ring" aria-hidden="true" />
                )}
                Hide assets &lt;1 USD
              </button>
              <span className="lh-vdivider" aria-hidden="true" />
              <button type="button" className="lh-outline-btn" onClick={() => notHere("Deposit")}>
                Deposit
              </button>
            </div>

            <div className="lh-list-head">
              <span className="lh-col-name">
                {current.label} assets
                <img src={`${IMG}/drop-down-light.svg`} width="12" height="12" alt="" />
              </span>
              <span className="lh-col-price">
                Price <i>(USD)</i>
              </span>
              <span className="lh-col-qty">
                Qty
                <span className="lh-hdivider" aria-hidden="true" />
                Total <i>(USD)</i>
                <img src={`${IMG}/drop-down-dark.svg`} width="12" height="12" alt="" />
              </span>
            </div>

            <div className="lh-empty">
              <div className="lh-empty-box">
                <img src={`${IMG}/no-file.svg`} width="24" height="24" alt="" />
                <p>
                  <button type="button" className="lh-inline-link" onClick={() => notHere("Deposit")}>
                    Deposit
                  </button>{" "}
                  your account to get started
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="lh-wallet" aria-label="Watchlist">
            <div className="lh-empty">
              <div className="lh-empty-box">
                <img src={`${IMG}/star.svg`} width="24" height="24" alt="" />
                <p>No favourites yet</p>
              </div>
            </div>
          </section>
        )}
      </div>

      <div className={`lh-toast${toast ? " is-shown" : ""}`} role="status">
        {toast}
      </div>
    </div>
  );
};

export default LoggedInHome;
