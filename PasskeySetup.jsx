import React, { useEffect, useRef, useState } from "react";
import PhoneLayer from "./PhoneLayer";
import { OtpInput, DevicePasskey } from "./AuthSheet";
import { slideBack } from "./backOut";
import "./PasskeySetup.css";

// Set up passkey (2026-11-06), Figma EXIO Mobile › Security Rebuild:
//   17795:46099 Set up passkey → 17825:278799 Security verification (1/2) SMS
//   → 19832:108559 Security verification (2/2) authenticator
//   → 17825:282735 OS "Save a passkey?" → 17795:11404 Passkey added successfully.
// Entry: "Set up" on the passkey invitation (PasskeyPromo) shown after a
// sign-in without a passkey.
// The code steps submit themselves: once the 6th digit is in, Next shows a
// spinner and the next step loads (same sheet, content slides across).
// Any 6 digits pass except 000000, which shows the wrong-code error.

const IMG = `${import.meta.env.BASE_URL}images`;
const PHONE = "+85291****21";
const RESEND = 60;
const EMPTY = Array(6).fill("");
const DEMO = { sms: "482913", totp: "736104" };
const USER_ID = "1909060568272666624";

const BENEFITS = [
  ["Faster verification", "Use biometrics or your device PIN instead of verification codes."],
  ["Effective on all devices", "Use your passkey to verify on all paired devices."],
  ["Secure your account", "Add a layer of security to help protect your account against phishing."],
];

const BackIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const WarnIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.5" fill="#F7A042" />
    <path d="M8 4.6v4.2" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="8" cy="11.1" r=".9" fill="#fff" />
  </svg>
);
const Spinner = () => <span className="pk-spin" aria-hidden="true" />;

// Also used by the withdraw security verification (2026-11-13: "Try another way" =
// SMS, then authenticator); `extra` adds a line under the CTA there.
// The SMS → authenticator steps on their own, for a bottom sheet (VerifySheet) or a
// page in the add-address page sheet (2026-11-13). `open` resets and focuses them.
export const VerifySteps = ({ open, onDone, extra = null, lastLabel = "Next", onBusy }) => {
  const [step, setStep] = useState("sms");
  const [code, setCode] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState(RESEND);
  const [n, setN] = useState(0); // re-keys the body so the next step slides in
  const timer = useRef(null);
  const root = useRef(null);
  // Its own first box: another sheet with these steps (closed, off-screen) may be mounted too.
  const focus = (ms) => setTimeout(() => root.current?.querySelector("#as-otp-0")?.focus({ preventScroll: true }), ms);
  useEffect(() => {
    clearTimeout(timer.current);
    if (!open) return undefined;
    setStep("sms");
    setCode(EMPTY);
    setError("");
    setBusy(false);
    setLeft(RESEND);
    setN(0);
    // After the sheet has slid in, and without scrolling: focusing a box
    // while it is still off-screen makes the browser scroll the phone screen.
    const t = focus(320);
    return () => clearTimeout(t);
  }, [open]);
  useEffect(() => {
    if (!open || step !== "sms" || !left) return undefined;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [open, step, left]);
  const submit = (c) => {
    setBusy(true);
    timer.current = setTimeout(() => {
      setBusy(false);
      if (c.join("") === "000000") {
        // Copy from the Figma "OTP code (demo)" Error state; the authenticator step has no resend.
        setError(step === "sms" ? "That code isn’t right. Check it and try again, or resend a new one." : "That code isn’t right. Check your authenticator app and try again.");
        focus(0);
        return;
      }
      if (step === "sms") {
        setStep("totp");
        setCode(EMPTY);
        setError("");
        setN((k) => k + 1);
        focus(320);
      } else onDone();
    }, 900);
  };
  // The 6th digit submits the step on its own.
  const change = (c) => {
    setCode(c);
    setError("");
    if (c.every(Boolean) && !busy) submit(c);
  };
  const full = code.every(Boolean);
  useEffect(() => onBusy?.(busy), [busy]);
  return (
        <div className="pk-step" key={n} ref={root} data-anim={n ? "next" : "first"}>
          {/* One row: the title names this step, the tag says where it sits. */}
          <div className="pk-title-row">
            <h2 className="pk-title" id="pk-title">
              {step === "sms" ? "SMS verification" : "Authenticator verification"}
            </h2>
            <span className="pk-step-tag" aria-label={`Step ${step === "sms" ? 1 : 2} of 2`}>
              Step {step === "sms" ? 1 : 2} of 2
            </span>
          </div>
          <p className="pk-sub">
            {step === "sms" ? (
              <>
                Enter the 6-digit code we sent by SMS to <b>{PHONE}</b>. It expires in 5 minutes.
              </>
            ) : (
              <>Open your authenticator app and enter the 6-digit code for EX.IO.</>
            )}
          </p>
          <OtpInput code={code} error={Boolean(error)} disabled={busy || !open} onChange={change} />
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
            <button type="button" className="as-link" disabled={busy} tabIndex={open ? 0 : -1} onClick={() => change(DEMO[step].split(""))}>
              Paste
            </button>
          </div>
          <button
            type="button"
            className={`oc-btn is-primary pk-cta${busy ? " is-busy" : ""}`}
            disabled={!full || busy || Boolean(error)}
            tabIndex={open ? 0 : -1}
            aria-busy={busy || undefined}
            onClick={() => full && !busy && !error && submit(code)}
          >
            {busy ? <Spinner /> : step === "totp" ? lastLabel : "Next"}
            <span className="pk-sr">{busy ? "Verifying" : ""}</span>
          </button>
          {extra}
        </div>
  );
};

export const VerifySheet = ({ open, onClose, onDone, extra = null, lastLabel = "Next" }) => {
  const [busy, setBusy] = useState(false);
  return (
    <PhoneLayer className="tks-layer pk-layer">
      <div className={`tks-scrim${open ? " is-open" : ""}`} onClick={busy ? undefined : onClose} aria-hidden="true" />
      <div className={`tks-sheet pk-sheet as-style-float${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-labelledby="pk-title" aria-hidden={!open}>
        <span className="tks-grab" aria-hidden="true" />
        <VerifySteps open={open} onDone={onDone} extra={extra} lastLabel={lastLabel} onBusy={setBusy} />
      </div>
    </PhoneLayer>
  );
};

// iOS "Save a passkey?" (Figma 17825:282735); Android keeps the Google
// Password Manager prompt from sign-in.
const FaceIdBig = () => (
  <svg width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="#0a84ff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 21v-7a7 7 0 0 1 7-7h7M51 7h7a7 7 0 0 1 7 7v7M65 51v7a7 7 0 0 1-7 7h-7M21 65h-7a7 7 0 0 1-7-7v-7" />
    <path d="M25 27v5M47 27v5M36 27v13h-3M27 50c5 4.5 13 4.5 18 0" />
  </svg>
);
const IosSave = ({ onAdd, onCancel }) => (
  <div className="pk-os" role="dialog" aria-modal="true" aria-labelledby="pk-os-title">
    <div className="pk-os-scrim" />
    <div className="pk-os-sheet">
      <button type="button" className="pk-os-x" aria-label="Close" onClick={onCancel}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <span className="pk-os-icon">
        <FaceIdBig />
        <img src={`${IMG}/passkey/app-icon.svg`} width="50" height="50" alt="" />
      </span>
      <h2 id="pk-os-title">Save a passkey?</h2>
      <p>
        "EX.IO" supports passkeys, a stronger alternative to passwords that cannot be leaked or stolen. A passkey for “{USER_ID}” will be saved in
        "Passwords".
      </p>
      <button type="button" className="pk-os-btn is-primary" onClick={onAdd}>
        Add Passkey
      </button>
      <button type="button" className="pk-os-btn" onClick={onCancel}>
        Save on Other Device
      </button>
    </div>
  </div>
);

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
              <img src={`${IMG}/passkey/result-success.svg`} width="120" height="120" alt="" />
              <h2>Passkey added successfully</h2>
              <p>You have successfully linked a passkey</p>
            </div>
          ) : (
            <div className="oc-page-body pk-body">
              <img className="pk-illu" src={`${IMG}/home/passkey.svg`} width="120" height="120" alt="" />
              <ul className="pk-list">
                {BENEFITS.map(([t, d]) => (
                  <li key={t}>
                    <img src={`${IMG}/passkey/benefit-check.svg`} width="24" height="24" alt="" />
                    <span>
                      <b>{t}</b>
                      <small>{d}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="oc-foot pk-foot">
            {!done && (
              <p className="pk-alert">
                <WarnIcon />
                <span>To ensure the safety of your assets, withdrawals will be disabled for 4 hours after adding or removing a passkey.</span>
              </p>
            )}
            <button type="button" className="oc-btn is-primary" onClick={done ? onClose : () => setSheet(true)}>
              {done ? "Back to account security" : "Add passkey"}
            </button>
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
          {device === "ask" && platform === "ios" ? (
            <IosSave onAdd={create} onCancel={() => setDevice(null)} />
          ) : (
            <DevicePasskey mode="create" platform={platform} stage={device} account={account} onContinue={create} onCancel={() => setDevice(null)} />
          )}
        </PhoneLayer>
      )}
    </>
  );
}
