import React, { useEffect, useRef, useState } from "react";
import PhoneLayer from "./PhoneLayer";
import { OtpInput, DevicePasskey } from "./AuthSheet";
import { slideBack } from "./backOut";
import "./PasskeySetup.css";

// Set up passkey (2026-11-06). Prototype entry: the Markets tab in the bottom nav.
//   Set up passkey (page) → Security verification sheet:
//     Step 1 of 2 · SMS code → Step 2 of 2 · Authenticator code (same sheet,
//     content slides across) → the device's own passkey prompt (simulated)
//     → Passkey set up.
// Stepper: a text eyebrow ("Step 1 of 2 · SMS code") above an unchanged title,
// plus "Next: authenticator code" on step 1, so the user knows to have the
// app ready. A progress bar was avoided: next to "expires in 5 minutes" and
// the resend countdown it reads as a timer.
// Any 6 digits pass except 000000, which shows the wrong-code error.

const IMG = `${import.meta.env.BASE_URL}images/home`;
const PHONE = "+85291****21";
const RESEND = 60;
const EMPTY = Array(6).fill("");
const DEMO = { sms: "482913", totp: "736104" };

const STEPS = {
  sms: { n: 1, label: "SMS code", next: "Authenticator code", cta: "Next" },
  totp: { n: 2, label: "Authenticator code", next: null, cta: "Verify" },
};

const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Benefit = ({ title, text, icon }) => (
  <li className="pk-benefit">
    <span className="pk-benefit-icon" aria-hidden="true">
      {icon}
    </span>
    <span>
      <b>{title}</b>
      <small>{text}</small>
    </span>
  </li>
);

const VerifySheet = ({ open, onClose, onDone }) => {
  const [step, setStep] = useState("sms");
  const [code, setCode] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(RESEND);
  const [dir, setDir] = useState(0); // re-keys the body so the next step slides in
  useEffect(() => {
    if (!open) return;
    setStep("sms");
    setCode(EMPTY);
    setError("");
    setBusy(false);
    setLeft(RESEND);
    // After the sheet has slid in, and without scrolling: focusing a box
    // while it is still off-screen makes the browser scroll the phone screen.
    const t = setTimeout(() => document.getElementById("as-otp-0")?.focus({ preventScroll: true }), 320);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open || step !== "sms" || !left) return undefined;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [open, step, left]);
  const s = STEPS[step];
  const full = code.every(Boolean);
  const submit = () => {
    if (!full || busy) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (code.join("") === "000000") {
        setError(step === "sms" ? "Incorrect code. Check the SMS and try again." : "Incorrect code. Check your authenticator app and try again.");
        return;
      }
      if (step === "sms") {
        setStep("totp");
        setCode(EMPTY);
        setError("");
        setDir((d) => d + 1);
        setTimeout(() => document.getElementById("as-otp-0")?.focus({ preventScroll: true }), 320);
      } else onDone();
    }, 700);
  };
  return (
    <PhoneLayer className="tks-layer pk-layer">
      <div className={`tks-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <div className={`tks-sheet pk-sheet as-style-float${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="pk-title" aria-hidden={!open}>
        <span className="tks-grab" aria-hidden="true" />
        <div className="pk-step" key={dir} data-dir={dir ? "next" : "first"}>
          <p className="pk-eyebrow" aria-live="polite">
            Step {s.n} of 2 <span aria-hidden="true">·</span> {s.label}
          </p>
          <h2 className="pk-title" id="pk-title">
            Security verification
          </h2>
          <p className="pk-sub">
            {step === "sms" ? (
              <>
                Enter the 6-digit code we sent by SMS to <b>{PHONE}</b>. It expires in 5 minutes.
              </>
            ) : (
              <>Open your authenticator app and enter the 6-digit code for EX.IO.</>
            )}
          </p>
          <OtpInput
            code={code}
            error={Boolean(error)}
            disabled={busy || !open}
            onChange={(c) => {
              setCode(c);
              setError("");
            }}
          />
          {error && (
            <p className="pk-error" role="alert">
              {error}
            </p>
          )}
          <div className="as-otp-actions pk-actions">
            {step === "totp" ? (
              <span />
            ) : left > 0 ? (
              <span className="as-resend">Resend in {left}s</span>
            ) : (
              <button type="button" className="as-link" onClick={() => setLeft(RESEND)} tabIndex={open ? 0 : -1}>
                Resend code
              </button>
            )}
            <button
              type="button"
              className="as-link"
              disabled={busy}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                setCode(DEMO[step].split(""));
                setError("");
              }}
            >
              Paste
            </button>
          </div>
          {s.next && (
            <p className="pk-next">
              Next: a code from your authenticator app
            </p>
          )}
          <button type="button" className="oc-btn is-primary pk-cta" disabled={!full || busy} tabIndex={open ? 0 : -1} onClick={submit}>
            {busy ? "Verifying…" : s.cta}
          </button>
        </div>
      </div>
    </PhoneLayer>
  );
};

export default function PasskeySetup({ open, onClose, onSetUp, platform = "ios", account = "" }) {
  const [sheet, setSheet] = useState(false);
  const [device, setDevice] = useState(null); // null | "ask" | "scan" | "ok"
  const [done, setDone] = useState(false);
  const timer = useRef(null);
  useEffect(() => {
    if (open) {
      setSheet(false);
      setDevice(null);
      setDone(false);
    }
    return () => clearTimeout(timer.current);
  }, [open]);
  if (!open) return null;
  const create = () => {
    setDevice("scan");
    timer.current = setTimeout(() => {
      setDevice("ok");
      timer.current = setTimeout(() => {
        setDevice(null);
        setDone(true);
        onSetUp?.();
      }, 700);
    }, 1400);
  };
  return (
    <>
      <PhoneLayer className="oc-layer pk-page-layer">
        <div className="oc-screen oc-page pk-page">
          <header className="oc-appbar">
            <button type="button" className="oc-back" aria-label="Back" onClick={(e) => slideBack(e, onClose)}>
              <BackIcon />
            </button>
            <h1>Set up passkey</h1>
            <span />
          </header>
          {done ? (
            <div className="oc-page-body pk-body pk-done">
              <img className="pk-done-icon" src={`${IMG}/check-circle.svg`} width="72" height="72" alt="" />
              <h2>Passkey set up</h2>
              <p>
                Next time, sign in with {platform === "ios" ? "Face ID" : "your fingerprint"} instead of a password. You can manage passkeys in
                Settings → Security.
              </p>
            </div>
          ) : (
            <div className="oc-page-body pk-body">
              <img className="pk-illu" src={`${IMG}/passkey.svg`} width="120" height="120" alt="" />
              <h2>Sign in with a passkey</h2>
              <p className="pk-lead">Use {platform === "ios" ? "Face ID" : "your fingerprint or screen lock"} instead of a password. Your passkey stays on your device.</p>
              <ul className="pk-benefits">
                <Benefit
                  title="Faster sign-in"
                  text="No password or code to type"
                  icon={
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M11 2L4 11h5l-1 7 7-9h-5l1-7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                  }
                />
                <Benefit
                  title="Phishing-resistant"
                  text="Only works on the real EX.IO app and site"
                  icon={
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <path d="M10 2l6 2.5v4.6c0 3.9-2.5 7-6 8.9-3.5-1.9-6-5-6-8.9V4.5L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                      <path d="M7.2 10l2 2 3.8-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  }
                />
                <Benefit
                  title="Synced across your devices"
                  text={platform === "ios" ? "Saved in iCloud Keychain" : "Saved in Google Password Manager"}
                  icon={
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <rect x="2.5" y="4" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                      <rect x="11.5" y="8" width="6" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M5 14.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  }
                />
              </ul>
              <p className="pk-note">To keep your account safe, we’ll verify it’s you with an SMS code and your authenticator app first.</p>
            </div>
          )}
          <div className="oc-foot">
            {done ? (
              <button type="button" className="oc-btn is-primary" onClick={onClose}>
                Done
              </button>
            ) : (
              <button type="button" className="oc-btn is-primary" onClick={() => setSheet(true)}>
                Set up passkey
              </button>
            )}
          </div>
        </div>
      </PhoneLayer>
      <VerifySheet
        open={sheet}
        onClose={() => setSheet(false)}
        onDone={() => {
          setSheet(false);
          setTimeout(() => setDevice("ask"), 320);
        }}
      />
      {device && (
        <PhoneLayer className="pk-device-layer">
          <DevicePasskey mode="create" platform={platform} stage={device} account={account} onContinue={create} onCancel={() => setDevice(null)} />
        </PhoneLayer>
      )}
    </>
  );
}
