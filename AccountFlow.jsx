import React, { useEffect, useRef, useState } from "react";
import PhoneLayer from "./PhoneLayer";
import { slideBack } from "./backOut";
import "./AccountFlow.css";

// Account pages (mock, 2026-11-07), from the live app's screens:
// Account → Account security / Identity verification / Account info /
// Professional investor / Settings / About, plus the new entrance
// "Whitelist addresses" (crypto addresses + bank accounts), which opens the
// same Manage whitelist address page as Select address › Manage.
const LOGO = `${import.meta.env.BASE_URL}images/account/exio-logo.svg`;
const USER = { name: "june2222", email: "as***@faf.com", initial: "J" };
const PI_EXPIRY = "2027-01-28";

/* ---------- Icons (24px outline, green accent like the app) ---------- */
const G = "#4fd1a1";
const K = "rgba(0,0,0,0.85)";
const ic = (children) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={K} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const I = {
  security: ic(
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path d="M12 14v2.5" stroke={G} />
    </>,
  ),
  whitelist: ic(
    <>
      <rect x="3.5" y="5.5" width="17" height="14" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M14.5 14.5h3" stroke={G} />
      <path d="M6.5 3.5h11" />
    </>,
  ),
  verify: ic(
    <>
      <path d="M12 3l2.2 1.6 2.7-.1.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.1L12 21l-2.2-1.6-2.7.1-.8-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.8-2.6 2.7.1z" />
      <path d="M9 12.2l2.1 2.1 4-4.2" stroke={G} />
    </>,
  ),
  info: ic(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" stroke={G} />
      <path d="M12 7.8v.2" stroke={G} />
    </>,
  ),
  referral: ic(
    <>
      <circle cx="6" cy="12" r="2.3" />
      <circle cx="17.5" cy="6" r="2.3" stroke={G} />
      <circle cx="17.5" cy="18" r="2.3" />
      <path d="M8.1 11l7.3-3.9M8.1 13l7.3 3.9" />
    </>,
  ),
  pi: ic(
    <>
      <circle cx="6.5" cy="15" r="3.2" />
      <circle cx="17.5" cy="15" r="3.2" />
      <path d="M9.7 15h4.6M3.3 15V6.5M20.7 15V6.5" />
    </>,
  ),
  settings: ic(
    <>
      <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
      <circle cx="12" cy="12" r="2.8" stroke={G} />
    </>,
  ),
  support: ic(
    <>
      <path d="M4.5 13v-1a7.5 7.5 0 0 1 15 0v1" />
      <rect x="3.5" y="13" width="3.5" height="5" rx="1.5" />
      <rect x="17" y="13" width="3.5" height="5" rx="1.5" />
      <path d="M19 18.5c0 1.5-1.5 2.5-4 2.5" stroke={G} />
    </>,
  ),
  faq: ic(
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.6a2.3 2.3 0 1 1 3 2.2c-.6.2-.8.7-.8 1.3v.4" stroke={G} />
      <path d="M12 16.3v.2" stroke={G} />
    </>,
  ),
  about: ic(
    <>
      <path d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-8l-4 3v-3H5A1.5 1.5 0 0 1 3.5 16V6A1.5 1.5 0 0 1 5 4.5z" />
      <path d="M12 10v4.5" stroke={G} />
      <path d="M12 7.5v.2" stroke={G} />
    </>,
  ),
  passkey: ic(
    <>
      <circle cx="9.5" cy="7.5" r="3.5" />
      <path d="M3.5 19.5a6 6 0 0 1 9-5.2" />
      <circle cx="17.5" cy="14.5" r="2" stroke={G} />
      <path d="M17.5 16.5v4M17.5 18.5h1.5" stroke={G} />
    </>,
  ),
  email: ic(
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M8 10l4 3.5 4-3.5" stroke={G} />
    </>,
  ),
  mobile: ic(
    <>
      <rect x="6.5" y="3" width="11" height="18" rx="2" />
      <path d="M11 6h2" />
      <path d="M12 17.2v.3" stroke={G} />
    </>,
  ),
  twofa: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 5H3.5v14H5M19 5h1.5v14H19" stroke={K} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <text x="12" y="15.3" textAnchor="middle" fontSize="8" fontWeight="700" fill={G} fontFamily="Manrope, sans-serif">
        2FA
      </text>
    </svg>
  ),
  password: ic(
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <rect x="8" y="11" width="8" height="6" rx="1.2" stroke={G} />
      <path d="M9.8 11V9.5a2.2 2.2 0 0 1 4.4 0V11" stroke={G} />
    </>,
  ),
  wdPassword: ic(
    <>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M7 9.5v.2M10 9.5v.2M13 9.5v.2" strokeWidth="2.2" />
      <path d="M17.5 13l2.5 1v2.2c0 1.5-1.1 2.6-2.5 3-1.4-.4-2.5-1.5-2.5-3V14z" stroke={G} />
    </>,
  ),
  antiPhish: ic(
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
      <path d="M13.5 7.5V13a2 2 0 1 1-4 0" stroke={G} />
    </>,
  ),
  // Professional investor benefits
  pairs: ic(
    <>
      <circle cx="12" cy="13" r="7" />
      <circle cx="12" cy="13" r="1.6" fill={K} />
      <path d="M5 6.5a6 6 0 0 1 4-3" stroke={G} />
    </>,
  ),
  custody: ic(
    <>
      <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.4" stroke={G} />
    </>,
  ),
  products: ic(
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <path d="M16.75 3.5l3.25 3.25-3.25 3.25-3.25-3.25z" stroke={G} />
    </>,
  ),
  quick: ic(
    <>
      <circle cx="12" cy="13" r="7" stroke={G} />
      <path d="M12 9.5V13l2.2 1.6" />
      <path d="M4.5 5.5l2 1.8" />
    </>,
  ),
};

const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Chev = () => (
  <svg className="acc-chev" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M6 3.5L10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const OkDot = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <circle cx="7" cy="7" r="7" fill="#00d690" />
    <path d="M4 7.2l2 2 4-4.2" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Verified = ({ label = "Verified" }) => (
  <span className="acc-ok">
    <OkDot />
    {label}
  </span>
);
const Avatar = ({ lg }) => <span className={`acc-avatar${lg ? " is-lg" : ""}`}>{USER.initial}</span>;
const PiTag = () => <span className="acc-pi">PI</span>;

const Bar = ({ title, onBack, right = <span /> }) => (
  <header className="oc-appbar acc-bar">
    <button type="button" className="oc-back" aria-label="Back" onClick={(e) => slideBack(e, onBack)}>
      <BackIcon />
    </button>
    {typeof title === "string" ? <h1>{title}</h1> : title}
    {right}
  </header>
);
const Row = ({ icon, label, value, onClick, chev = true }) => (
  <button type="button" className="acc-row" onClick={onClick}>
    {icon && <span className="acc-row-icon">{icon}</span>}
    <span className="acc-row-label">{label}</span>
    {value && <span className="acc-row-value">{value}</span>}
    {chev && <Chev />}
  </button>
);

/* ---------- Pages ---------- */
const AccountPage = ({ onBack, go, todo, onWhitelist }) => {
  const [banner, setBanner] = useState(true);
  return (
    <div className="oc-screen oc-page acc-page">
      <Bar title={<img className="acc-logo" src={LOGO} width="52" height="16" alt="EX.IO" />} onBack={onBack} />
      <div className="acc-body">
        <div className="acc-user">
          <Avatar />
          <span>
            <b>
              {USER.name} <PiTag />
            </b>
            <small>{USER.email}</small>
          </span>
        </div>
        {banner && (
          <div className="acc-banner">
            <span className="acc-banner-i" aria-hidden="true">
              i
            </span>
            <div>
              <b>Professional Investor status review</b>
              <p>
                Your Professional Investor status will expire on <strong>{PI_EXPIRY}</strong>
              </p>
              <button type="button" className="acc-link" onClick={() => go("pi")}>
                Review now
              </button>
            </div>
            <button type="button" className="acc-banner-x" aria-label="Dismiss" onClick={() => setBanner(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 3l10 10M13 3L3 13" stroke="rgba(0,0,0,0.8)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}
        <nav className="acc-menu">
          <Row icon={I.security} label="Account security" chev={false} onClick={() => go("security")} />
          {/* New entrance: crypto addresses and bank accounts for deposits and withdrawals. */}
          <Row icon={I.whitelist} label="Whitelist addresses" chev={false} onClick={onWhitelist} />
          <Row icon={I.verify} label="Verification" value={<Verified />} chev={false} onClick={() => go("verify")} />
          <Row icon={I.info} label="Account Info" chev={false} onClick={() => go("info")} />
          <Row icon={I.referral} label="Referral" chev={false} onClick={() => todo("Referral")} />
          <Row icon={I.pi} label="Professional investor" chev={false} onClick={() => go("pi")} />
          <Row icon={I.settings} label="Settings" chev={false} onClick={() => go("settings")} />
          <Row icon={I.support} label="Customer support" chev={false} onClick={() => todo("Customer support")} />
          <Row icon={I.faq} label="FAQ" chev={false} onClick={() => todo("FAQ")} />
          <Row icon={I.about} label="About" chev={false} onClick={() => go("about")} />
        </nav>
        <button type="button" className="acc-signout" onClick={() => todo("Sign out")}>
          Sign out
        </button>
      </div>
    </div>
  );
};

const SecurityPage = ({ onBack, todo }) => (
  <div className="oc-screen oc-page acc-page">
    <Bar title="Account Security" onBack={onBack} />
    <div className="acc-body">
      <p className="acc-last">
        Last Log in <b>2026-11-05 16:00:27</b>
      </p>
      <nav className="acc-menu is-security">
        <Row icon={I.passkey} label="Passkey" value="Manage" onClick={() => todo("Passkey management")} />
        <Row icon={I.email} label="Email" value={USER.email} onClick={() => todo("Changing email")} />
        <Row icon={I.mobile} label="Mobile" value="+85268****78" onClick={() => todo("Changing mobile")} />
        <Row
          icon={I.twofa}
          label="Authenticator app"
          value={
            <>
              <Verified label="ON" />
              Reset
            </>
          }
          onClick={() => todo("Resetting the authenticator")}
        />
        <Row icon={I.password} label="Log in password" value="Change" onClick={() => todo("Changing password")} />
        <Row icon={I.wdPassword} label="Withdrawal password" value="Change" onClick={() => todo("Changing withdrawal password")} />
        <Row icon={I.antiPhish} label="Anti-phishing code" value="S******s" onClick={() => todo("Anti-phishing code")} />
      </nav>
    </div>
  </div>
);

const VERIFY_ROWS = ["First name", "Last name", "Nationality", "Date of birth", "Residential address", "Doc type", "Doc number", "Doc issuing region", "Employment status", "Occupation"];
const VerifyPage = ({ onBack, todo }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="oc-screen oc-page acc-page">
      <Bar
        title="Identity Verification"
        onBack={onBack}
        right={
          <button type="button" className="oc-back acc-help" aria-label="Help" onClick={() => todo("Help")}>
            {I.faq}
          </button>
        }
      />
      <div className="acc-body">
        <div className="acc-id">
          <Avatar lg />
          <b>
            {USER.name} <PiTag />
          </b>
          <small>as****@faf.com</small>
          <Verified />
        </div>
        <section className="acc-card">
          <div className="acc-card-head">
            <h2>Account opening information</h2>
            <button type="button" className="acc-eye" aria-label={show ? "Hide" : "Show"} aria-pressed={show} onClick={() => setShow((v) => !v)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={K} strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                {show ? (
                  <>
                    <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </>
                ) : (
                  <path d="M3 10c2.2 2.6 5.3 4 9 4s6.8-1.4 9-4M6 13l-1.5 2M18 13l1.5 2M12 14v2.5" />
                )}
              </svg>
            </button>
            <span className="acc-edit">Edit</span>
          </div>
          <p className="acc-card-note">Change of account information and is currently under review. The procedure takes around 1 to 5 days to be completed.</p>
          <dl className="acc-kv">
            {VERIFY_ROWS.map((k) => (
              <React.Fragment key={k}>
                <dt>{k}</dt>
                <dd>{show ? "—" : "*****"}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
};

const InfoPage = ({ onBack }) => (
  <div className="oc-screen oc-page acc-page">
    <Bar title="Account Info" onBack={onBack} />
    <div className="acc-body">
      <div className="acc-user">
        <Avatar />
        <span>
          <b>
            {USER.name} <PiTag />
          </b>
          <small>{USER.email}</small>
        </span>
      </div>
      <h3 className="acc-h3">Fees</h3>
      <div className="acc-box is-2">
        <div>
          <small>Maker fee</small>
          <b>0.1%</b>
        </div>
        <div>
          <small>Taker fee</small>
          <b>0.2%</b>
        </div>
      </div>
      <h3 className="acc-h3">Trading limits</h3>
      <div className="acc-box is-2">
        <div>
          <small>
            Position limit <span className="acc-i">i</span>
          </small>
          <b>
            14,999,999.85 <em>USD</em>
          </b>
        </div>
        <div>
          <small>Order rate limit</small>
          <b>
            11 <em>/ sec</em>
          </b>
        </div>
      </div>
      <h3 className="acc-h3">Withdrawal limits</h3>
      <div className="acc-box">
        <div>
          <small>Daily withdrawal limit</small>
          <b>
            240,000,000 <em>USD</em>
          </b>
        </div>
      </div>
      <p className="acc-foot-note">
        The position limit and trading limit are evaluated and generated based on the suitability assessment results in the user’s verified information. The suitability
        assessment result will expire after 2028-01-26, and you will need to re-evaluate after it expires.
      </p>
    </div>
  </div>
);

const PiPage = ({ onBack, todo }) => (
  <div className="oc-screen oc-page acc-page">
    <Bar title="Professional Investor" onBack={onBack} />
    <div className="acc-body">
      <p className="acc-pi-lead">Your account is now a Professional Investor account</p>
      <section className="acc-card is-pi">
        <h2>
          {I.pi}
          Professional Investor
        </h2>
        <p>Your Professional Investor status will expire on {PI_EXPIRY}.</p>
        <p>Please update your information to maintain your status.</p>
        <button type="button" className="oc-btn is-primary" onClick={() => todo("Updating information")}>
          Update information
        </button>
      </section>
      <div className="acc-sec-head">
        <h3 className="acc-h3">Benefit</h3>
        <button type="button" className="acc-link" onClick={() => todo("Benefit details")}>
          View details
        </button>
      </div>
      <ul className="acc-card acc-benefits">
        <li>
          {I.pairs}Access to USDT trading pairs
        </li>
        <li>
          {I.custody}Custody account
        </li>
        <li>
          {I.products}Access more products and features
        </li>
        <li>
          {I.quick}Quick and free process
        </li>
      </ul>
      <p className="acc-foot-note is-dark">
        Professional Investor account holders may reclassify their accounts as Retail Investor accounts by providing written notice to EX.IO. Such requests will be handled
        promptly by our support team. Please contact EX.IO for further assistance.
      </p>
    </div>
  </div>
);

const SettingsPage = ({ onBack, go, todo }) => (
  <div className="oc-screen oc-page acc-page">
    <Bar title="Settings" onBack={onBack} />
    <div className="acc-body">
      <nav className="acc-menu is-plain">
        <Row label="Language" value="English" onClick={() => todo("Language")} />
        <Row label="Currency" value="HKD" onClick={() => todo("Currency")} />
        <Row label="About" onClick={() => go("about")} />
      </nav>
    </div>
  </div>
);

const XLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 4l6.6 8.6L4.3 20h1.8l5.4-6.2L16 20h4l-7-9.1L19 4h-1.8l-5 5.7L8 4z" fill={K} />
  </svg>
);
const InLogo = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" fill={K} />
    <path d="M7.5 10v6.5M7.5 7.3v.2M11 16.5V10M11 12.8c0-1.6 1-2.8 2.5-2.8s2.5 1 2.5 2.8v3.7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const AboutPage = ({ onBack, todo }) => (
  <div className="oc-screen oc-page acc-page">
    <Bar title="About" onBack={onBack} />
    <div className="acc-body is-flush">
      <div className="acc-app">
        <span className="acc-app-icon">
          <img src={LOGO} width="52" height="16" alt="" />
        </span>
        <small>Version 1.5.0 (2026102605)</small>
      </div>
      <nav className="acc-menu is-plain is-groups">
        <div>
          <Row label="Our team" onClick={() => todo("Our team")} />
          <Row label="Rate EX.IO" onClick={() => todo("Rating")} />
        </div>
        <div>
          <Row icon={<XLogo />} label="X" onClick={() => todo("X")} />
          <Row icon={<InLogo />} label="LinkedIn" onClick={() => todo("LinkedIn")} />
        </div>
        <div>
          <Row label="Check for updates" value="Up to date" onClick={() => todo("Updates")} />
          <Row label="Clear Cache" value="7.93 MB" onClick={() => todo("Clearing cache")} />
        </div>
        <div>
          <Row label="Product Disclosure" onClick={() => todo("Product Disclosure")} />
          <Row label="Privacy Policy" onClick={() => todo("Privacy Policy")} />
          <Row label="Risk Disclosure Statement" onClick={() => todo("Risk Disclosure Statement")} />
          <Row label="Terms and Conditions" onClick={() => todo("Terms and Conditions")} />
        </div>
      </nav>
    </div>
  </div>
);

const PAGES = { security: SecurityPage, verify: VerifyPage, info: InfoPage, pi: PiPage, settings: SettingsPage, about: AboutPage };

export default function AccountFlow({ open, onClose, onWhitelist }) {
  const [stack, setStack] = useState([]);
  const [toast, setToast] = useState("");
  const tt = useRef(null);
  useEffect(() => {
    if (open) setStack([]);
    return () => clearTimeout(tt.current);
  }, [open]);
  if (!open) return null;
  const go = (p) => setStack((s) => [...s.filter((x) => x !== p), p]);
  const pop = () => setStack((s) => s.slice(0, -1));
  const todo = (what) => {
    setToast(`${what} isn’t in this prototype`);
    clearTimeout(tt.current);
    tt.current = setTimeout(() => setToast(""), 1600);
  };
  return (
    <PhoneLayer className="oc-layer acc-layer">
      <AccountPage onBack={onClose} go={go} todo={todo} onWhitelist={onWhitelist} />
      {stack.map((p) => {
        const P = PAGES[p];
        return <P key={p} onBack={pop} go={go} todo={todo} />;
      })}
      {toast && (
        <div className="acc-toast" role="status">
          {toast}
        </div>
      )}
    </PhoneLayer>
  );
}
