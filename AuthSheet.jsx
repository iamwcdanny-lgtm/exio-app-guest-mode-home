import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import "./AuthSheet.css";

// Sign up / Sign in, presented over the guest Home the way each platform
// presents a modal task (EXIO Mobile, Figma 19377:102791 and 19408:120715):
//   ios     -> page sheet: slides up, Home shrinks into a card behind it on a
//              black backdrop, and dragging the sheet down dismisses it.
//   android -> full-screen page that slides up over Home. No drag to dismiss;
//              the back gesture / button closes it instead.
// On both, the browser's back action closes the sheet (it pushes a history
// entry while open), as does the X and Escape.
//
// `labelStyle` picks how the form fields are labelled, so the three options
// can be compared in the same flow:
//   trad  -> label above the field (current design)
//   float -> floating label: sits in the field until it is focused or filled
//   ifta  -> infield top-aligned: small label fixed at the top of the field

const FIELDS = {
  username: { label: "Username", placeholder: "chantaiman.88", hint: "You can use letters, numbers and full stops", autoComplete: "username" },
  email: { label: "Email", placeholder: "name@example.com", type: "email", autoComplete: "email", inputMode: "email", emailHosts: true, lateError: true },
  password: { label: "Login password", placeholder: "Create a password", password: true, autoComplete: "new-password", strength: true },
  referral: { label: "Referral code", placeholder: "EX8K2Q", autoComplete: "off" },
  account: { label: "Username / Email", placeholder: "chantaiman.88", autoComplete: "username", emailHosts: true },
  loginPassword: { label: "Login password", placeholder: "Enter your password", password: true, autoComplete: "current-password" },
};

const VALIDATE = {
  username: (v) =>
    !v ? "Enter a username." : /[^a-zA-Z0-9.]/.test(v) ? "Use letters, numbers and full stops only." : v.length < 3 ? "Enter at least 3 characters." : "",
  email: (v) => (!v ? "Enter your email." : /^\S+@\S+\.\S+$/.test(v) ? "" : "Enter a valid email address."),
  password: (v) => {
    if (!v) return "Enter a password.";
    const miss = PASSWORD_RULES.find((r) => !r.test(v));
    return miss ? (typeof miss.error === "function" ? miss.error(v) : miss.error) : "";
  },
  referral: () => "",
  account: (v) => (v ? "" : "Enter your username or email."),
  loginPassword: (v) => (v ? "" : "Enter your password."),
};

// What a new password must contain. While the field is focused these show
// as a checklist under it, ticking off as the user types.
// EX.IO's password criteria (wording as in the live app).
const PASSWORD_RULES = [
  { label: "8-20 characters", test: (v) => v.length >= 8 && v.length <= 20, error: (v) => (v.length > 20 ? "Use 20 characters or fewer." : "Use at least 8 characters.") },
  { label: "At least 1 digit", test: (v) => /\d/.test(v), error: "Add at least 1 digit." },
  { label: "At least 1 lowercase (a-z)", test: (v) => /[a-z]/.test(v), error: "Add at least 1 lowercase letter (a-z)." },
  { label: "At least 1 uppercase (A-Z)", test: (v) => /[A-Z]/.test(v), error: "Add at least 1 uppercase letter (A-Z)." },
  { label: "At least 1 special character (e.g. !*& @)", test: (v) => /[^A-Za-z0-9]/.test(v), error: "Add at least 1 special character, such as ! or @." },
];
// Label for how many of the five rules are met.
const STRENGTH = ["", "Weak", "Weak", "Fair", "Good", "Strong"];

const REQUIRED = { signup: ["username", "email", "password"], signin: ["account", "loginPassword"] };

const EMPTY = Object.fromEntries(Object.keys(FIELDS).map((k) => [k, ""]));

// Sheet motion (iOS-like spring approximated with a cubic curve).
const DURATION_MS = 450;
// Drag-to-dismiss: release past this share of the sheet's height, or flick
// down faster than this (px/ms), and it closes; otherwise it springs back.
const DISMISS_SHARE = 0.25;
const DISMISS_VELOCITY = 0.6;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* ---------- Icons (24px grid, 1.75 stroke, currentColor) ---------- */
const Icon = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const BackIcon = () => (
  <Icon size={24}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);
// Icons for the verification methods (20px, 1.5 stroke).
const MethodIcon = ({ kind }) => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === "sms" && (
      <>
        <path d="M3.5 4.75c0-.69.56-1.25 1.25-1.25h10.5c.69 0 1.25.56 1.25 1.25v7.5c0 .69-.56 1.25-1.25 1.25H8.5l-3.25 3v-3h-.5c-.69 0-1.25-.56-1.25-1.25v-7.5Z" />
        <path d="M7 7.25h6M7 10h4" />
      </>
    )}
    {kind === "email" && (
      <>
        <rect x="3" y="4.5" width="14" height="11" rx="1.5" />
        <path d="m3.5 5.5 6.5 5 6.5-5" />
      </>
    )}
    {kind === "totp" && (
      <>
        <rect x="4" y="8.5" width="12" height="8.5" rx="1.5" />
        <path d="M6.75 8.5V6.25a3.25 3.25 0 0 1 6.5 0V8.5" />
        <path d="M10 12v1.5" />
      </>
    )}
  </svg>
);

const CloseIcon = () => (
  <Icon size={24}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
const ClearIcon = () => (
  <Icon size={16}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
  </Icon>
);
const EyeIcon = () => (
  <Icon>
    <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);
const EyeOffIcon = () => (
  <Icon>
    <path d="M3 3l18 18" />
    <path d="M10.6 5.6A9.7 9.7 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.9 3.7M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.3-1" />
    <path d="M9.9 9.9a3 3 0 004.2 4.2" />
  </Icon>
);
const ChevronIcon = () => (
  <Icon size={14}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

const Logo = () => (
  <svg className="as-logo" viewBox="0 0 301 91" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="EX.IO">
    <path d="M164 91C169.523 91 174 86.5228 174 81C174 75.4772 169.523 71 164 71C158.477 71 154 75.4772 154 81C154 86.5228 158.477 91 164 91Z" fill="black" fillOpacity="0.75" />
    <path
      d="M267.67 89.3796C233.531 98.1986 203.207 67.7542 211.992 33.4797C215.992 17.8745 228.249 5.57892 243.782 1.5524C277.921 -7.27647 308.264 23.1777 299.461 57.4522C295.46 73.0476 283.203 85.3531 267.66 89.3698L267.67 89.3796ZM263.825 22.1269C244.125 15.7336 226.117 33.8136 232.484 53.6025C234.803 60.7913 240.476 66.4972 247.637 68.8149C267.337 75.2082 285.345 57.1282 278.987 37.3491C276.669 30.1603 270.995 24.4544 263.825 22.1269ZM201.926 80.5802V10.4795C201.926 3.21211 194.502 -2.31698 186.852 1.13011C183.36 2.70143 181.208 6.31548 181.208 10.1554V80.9042C181.208 84.754 183.35 88.3582 186.852 89.9295C194.502 93.3766 201.926 87.8475 201.926 80.5802ZM65.5284 55.3211H21.5004C25.3643 64.7196 34.5787 71.3585 45.3192 71.3585H65.5382C70.9378 71.3585 75.32 75.7582 75.32 81.1792C75.32 86.6003 70.9378 91 65.5382 91H45.3192C20.3266 91 0 70.5826 0 45.5004C0 20.4181 20.3266 0.000719748 45.3192 0.000719748H65.5382C70.9378 0.000719748 75.32 4.40042 75.32 9.82149C75.32 15.2426 70.9378 19.6423 65.5382 19.6423H45.3192C34.5787 19.6423 25.3643 26.2811 21.5004 35.6796H65.5284C70.928 35.6796 75.3102 40.0793 75.3102 45.5004C75.3102 50.9214 70.928 55.3211 65.5284 55.3211ZM163.151 0.462296C149.114 0.629249 136.603 7.23863 128.396 17.4621C120.199 6.97347 107.541 0.177494 93.299 0.000719748C88.232 -0.0582049 83.6737 3.50674 83.0379 8.55461C82.2944 14.5453 86.9212 19.6423 92.7414 19.6423C105.037 19.6423 115.337 28.3336 117.881 39.9222C118.292 41.7979 118.38 43.7228 118.37 45.6477C118.37 45.6673 118.37 45.6771 118.37 45.6968C118.36 47.5725 118.252 49.4483 117.832 51.2848C115.23 62.6867 105.106 71.2308 92.9958 71.3585C87.9875 71.4076 83.5759 75.0412 83.0183 80.04C82.3531 85.9718 86.9604 91 92.7316 91C106.984 91 119.71 84.3513 128.024 74.0002C133.033 80.4034 139.714 85.4414 147.402 88.4171L147.392 88.3877C146.522 86.2566 146.062 83.9781 146.062 81.6506C146.062 76.9956 147.94 72.4486 151.217 69.1488C151.344 69.0309 151.471 68.9131 151.608 68.7952C145.094 65.3089 140.232 59.1021 138.559 51.6874C138.188 50.067 138.051 48.3975 138.021 46.728C138.021 46.5315 138.021 46.3449 138.021 46.1485C138.021 43.8308 138.207 41.5033 138.804 39.2642C141.748 28.2453 151.775 20.1038 163.669 20.1038C169.49 20.1038 174.116 15.0069 173.373 9.01619C172.747 3.97813 168.189 0.403371 163.131 0.462296H163.151Z"
      fill="black"
      fillOpacity="0.9"
    />
  </svg>
);

/* ---------- One form field, in any of the three label styles ---------- */
// Pressing an icon button must not blur the input (that would hide the clear
// button before its click lands, and drop the keyboard on mobile).
const keepFocus = (e) => e.preventDefault();

// Circle that fills green with a tick once on. Shared by the password rules
// and the marketing-consent checkbox so both read as the same control.
export const RuleIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="7" className="as-rule-ring" />
    <path d="M5 8.2l2 2 4-4.2" className="as-rule-tick" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Strength bar and rule checklist for a new password. Opens while the field
// is focused; each rule ticks off as soon as the value meets it.
const PasswordStrength = ({ id, value, open }) => {
  const met = PASSWORD_RULES.map((r) => r.test(value));
  const score = met.filter(Boolean).length;
  return (
    <div className={`as-strength${open ? " is-open" : ""}`} data-score={score} aria-hidden={!open}>
      <div className="as-strength-inner">
        <div className="as-strength-card" id={id}>
          <div className="as-strength-head">
            <div className="as-strength-bar" aria-hidden="true">
              {PASSWORD_RULES.map((r, i) => (
                <span key={r.label} className={i < score ? "is-on" : ""} />
              ))}
            </div>
            <span className="as-strength-label" aria-live="polite">
              {value ? STRENGTH[score] : ""}
            </span>
          </div>
          <p className="as-rules-title">Your password needs to contain:</p>
          <ul className="as-rules">
            {PASSWORD_RULES.map((r, i) => (
              <li key={r.label} className={met[i] ? "is-met" : ""}>
                <RuleIcon met={met[i]} />
                {r.label}
                <span className="as-sr">{met[i] ? " (done)" : " (not yet)"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

// Common email hosts, offered once "@" is typed (narrowed by what follows it).
const EMAIL_HOSTS = ["gmail.com", "outlook.com", "hotmail.com", "icloud.com", "yahoo.com", "yahoo.com.hk"];
const hostSuggestions = (value) => {
  const at = value.indexOf("@");
  if (at < 1 || value.indexOf("@", at + 1) !== -1) return [];
  const typed = value.slice(at + 1).toLowerCase();
  return EMAIL_HOSTS.filter((h) => h.startsWith(typed) && h !== typed);
};

const Field = ({ name, labelStyle, value, error, onChange, onBlur, inputRef }) => {
  const def = FIELDS[name];
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const ownRef = useRef(null);
  const ref = inputRef || ownRef;
  const id = `as-field-${name}`;
  const hintId = `${id}-hint`;
  const strengthId = `${id}-strength`;
  const showStrength = Boolean(def.strength) && focused;
  // The checklist replaces the hint (and any error) while it is open.
  const hint = showStrength ? "" : error || def.hint;
  const up = focused || value !== "";
  const hosts = def.emailHosts && focused ? hostSuggestions(value) : [];
  const pickHost = (host) => {
    const next = `${value.slice(0, value.indexOf("@") + 1)}${host}`;
    onChange(name, next);
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      // type="email" inputs don't support selection ranges.
      try {
        el.setSelectionRange(next.length, next.length);
      } catch {
        /* ignore */
      }
    });
  };

  // Floating label: while the label sits inside the empty field it stands in
  // for the placeholder, so the example only shows once the label has moved up.
  const placeholder = labelStyle === "float" && !focused ? "" : def.placeholder;

  const cls = [
    "as-field",
    focused && "is-focused",
    value !== "" && "has-value",
    up && "is-up",
    error && "is-error",
  ]
    .filter(Boolean)
    .join(" ");

  const label = (
    <label className="as-label" htmlFor={id}>
      {def.label}
    </label>
  );

  const input = (
    <input
      ref={ref}
      id={id}
      className="as-input"
      type={def.password && !shown ? "password" : def.type || "text"}
      inputMode={def.inputMode}
      autoComplete={def.autoComplete}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      placeholder={placeholder}
      value={value}
      aria-invalid={error ? true : undefined}
      aria-describedby={showStrength ? strengthId : hint ? hintId : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onBlur(name);
      }}
      onChange={(e) => onChange(name, e.target.value)}
    />
  );

  const actions = (
    <>
      {focused && value !== "" && (
        <button
          type="button"
          className="as-icon-btn"
          aria-label={`Clear ${def.label.toLowerCase()}`}
          onMouseDown={keepFocus}
          onClick={() => {
            onChange(name, "", { clearError: true });
            ref.current?.focus();
          }}
        >
          <ClearIcon />
        </button>
      )}
      {def.password && (
        <button
          type="button"
          className="as-icon-btn"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          onMouseDown={keepFocus}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeIcon /> : <EyeOffIcon />}
        </button>
      )}
    </>
  );

  // Tapping anywhere in the box (padding, the IFTA label row) focuses the input.
  const focusInput = (e) => {
    if (e.target === ref.current || e.target.closest("button")) return;
    e.preventDefault();
    ref.current?.focus();
  };

  return (
    <div className={cls}>
      {labelStyle === "trad" && label}
      <div className="as-box" onMouseDown={focusInput}>
        {labelStyle === "ifta" ? (
          <div className="as-ifta">
            {label}
            {input}
          </div>
        ) : (
          input
        )}
        {actions}
      </div>
      {labelStyle === "float" && label}
      {hosts.length > 0 && (
        <div className="as-hosts" role="listbox" aria-label="Email suggestions">
          {hosts.map((h) => (
            <button
              key={h}
              type="button"
              role="option"
              aria-selected="false"
              className="as-host"
              onMouseDown={keepFocus}
              onClick={() => pickHost(h)}
            >
              @{h}
            </button>
          ))}
        </div>
      )}
      {def.strength && <PasswordStrength id={strengthId} value={value} open={showStrength} />}
      {hint && (
        <p id={hintId} className={`as-hint${error ? " is-error" : ""}`} aria-live={error ? "polite" : undefined}>
          {hint}
        </p>
      )}
    </div>
  );
};

/* ---------- The two pages ---------- */
const SignUp = ({ fieldProps, referralOpen, onToggleReferral, marketing, onToggleMarketing, referralRef }) => (
  <>
    <Logo />
    <h1 className="as-title" id="as-title">
      Let’s get you started
    </h1>
    <div className="as-form">
      <Field name="username" {...fieldProps("username")} />
      <Field name="email" {...fieldProps("email")} />
      <Field name="password" {...fieldProps("password")} />
      <button type="button" className={`as-disclosure${referralOpen ? " is-open" : ""}`} aria-expanded={referralOpen} onClick={onToggleReferral}>
        Referral code <ChevronIcon />
      </button>
      {referralOpen && <Field name="referral" {...fieldProps("referral")} inputRef={referralRef} />}
      <label className={`as-check${marketing ? " is-on" : ""}`}>
        <input type="checkbox" checked={marketing} onChange={onToggleMarketing} />
        <RuleIcon size={20} />
        <span>I wish to receive direct marketing materials (e.g. newsletters, promotions, personalized offers) and communication from EX.IO.</span>
      </label>
    </div>
  </>
);

const SignIn = ({ fieldProps, onForgot }) => (
  <>
    <h1 className="as-title as-title-signin" id="as-title">
      Sign in to EX.IO
    </h1>
    <div className="as-form">
      <Field name="account" {...fieldProps("account")} />
      <Field name="loginPassword" {...fieldProps("loginPassword")} />
      <button type="button" className="as-link as-forgot" onClick={onForgot}>
        Forgot your password?
      </button>
    </div>
  </>
);

/* ---------- Email OTP (step 2 of sign up) ---------- */
const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;
const EMPTY_CODE = Array(OTP_LENGTH).fill("");

// "chantaiman@exio.com" -> "ch***@exio.com"
const maskEmail = (email) => {
  const [local, domain] = (email || "").split("@");
  if (!local || !domain) return "your email";
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
};

// One box per digit. Typing moves to the next box, Backspace on an empty box
// goes back, and pasting (or the phone's one-time-code autofill) spreads the
// digits across the boxes.
const OtpInput = ({ code, onChange, error, disabled }) => {
  const refs = useRef([]);
  const focusBox = (i) => {
    const el = refs.current[Math.max(0, Math.min(OTP_LENGTH - 1, i))];
    el?.focus();
    el?.select();
  };
  const fill = (start, digits) => {
    const next = [...code];
    let i = start;
    for (const d of digits) {
      if (i >= OTP_LENGTH) break;
      next[i++] = d;
    }
    onChange(next);
    focusBox(i >= OTP_LENGTH ? OTP_LENGTH - 1 : i);
  };
  return (
    <div className={`as-otp${error ? " is-error" : ""}`} role="group" aria-label="Verification code">
      {code.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          id={`as-otp-${i}`}
          className="as-otp-box"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={i === 0 ? OTP_LENGTH : 1}
          aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          value={d}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, "").split("");
            if (digits.length === 0) {
              const next = [...code];
              next[i] = "";
              onChange(next);
              return;
            }
            // A single new digit replaces this box; several (autofill) spread out.
            fill(i, digits.length > 1 && d ? digits.filter((x, k) => !(k === 0 && x === d)) : digits);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !code[i] && i > 0) {
              e.preventDefault();
              const next = [...code];
              next[i - 1] = "";
              onChange(next);
              focusBox(i - 1);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              focusBox(i - 1);
            } else if (e.key === "ArrowRight") {
              e.preventDefault();
              focusBox(i + 1);
            }
          }}
          onPaste={(e) => {
            const digits = e.clipboardData.getData("text").replace(/\D/g, "").split("");
            if (!digits.length) return;
            e.preventDefault();
            fill(digits.length >= OTP_LENGTH ? 0 : i, digits);
          }}
        />
      ))}
    </div>
  );
};

// Prototype stand-ins for what the account has on file when signing in.
const DEMO_EMAIL = "chantaiman@exio.com";
const DEMO_PHONE = "+852 9123 4521";
// "+852 9123 4521" -> "+85291****21"
const maskPhone = (phone) => {
  const digits = phone.replace(/\D/g, "");
  return `+${digits.slice(0, 5)}****${digits.slice(-2)}`;
};

// The 6-digit step. `kind`: "email" (code sent by email), "sms" (code sent by
// SMS) or "totp" (code from an authenticator app: nothing is sent, so no resend).
const OtpStep = ({ kind, title, sentTo, code, onCodeChange, error, verifying, resendIn, onResend, onPaste }) => (
  <>
    <h1 className="as-title as-title-otp" id="as-title">
      {title}
    </h1>
    <p className="as-subtitle">
      {kind === "totp" ? (
        <>Open your authenticator app and enter the 6-digit code for EX.IO.</>
      ) : (
        <>
          Enter the 6-digit code we sent {kind === "sms" ? "by SMS " : ""}to <strong>{sentTo}</strong>. It expires in{" "}
          {kind === "sms" ? "5" : "10"} minutes.
        </>
      )}
    </p>
    <OtpInput code={code} onChange={onCodeChange} error={error} disabled={verifying} />
    {error && (
      <p className="as-hint is-error" aria-live="polite">
        {error}
      </p>
    )}
    <div className="as-otp-actions">
      {kind === "totp" ? (
        <span />
      ) : resendIn > 0 ? (
        <span className="as-resend">Resend in {resendIn}s</span>
      ) : (
        <button type="button" className="as-link" onClick={onResend}>
          Resend code
        </button>
      )}
      <button type="button" className="as-link" onClick={onPaste} disabled={verifying}>
        Paste
      </button>
    </div>
  </>
);

// "Try another way": a bottom sheet over the page sheet listing the other
// verification methods. `methods`: [{ kind, label, value }].
const MethodPicker = ({ open, methods, onPick, onClose }) => (
  <div className={`as-picker${open ? " is-open" : ""}`} aria-hidden={!open}>
    <div className="as-picker-scrim" onClick={onClose} />
    <div className="as-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="as-picker-title">
      <div className="as-picker-grabber" aria-hidden="true" />
      <h2 className="as-picker-title" id="as-picker-title">
        Choose verification method
      </h2>
      <div className="as-picker-list">
        {methods.map((m) => (
          <button key={m.kind} type="button" className="as-method" tabIndex={open ? 0 : -1} onClick={() => onPick(m.kind)}>
            <MethodIcon kind={m.kind} />
            <span>
              {m.label}
              {m.value && (
                <>
                  {" "}
                  <strong>{m.value}</strong>
                </>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

// Last step of sign up, once the email code is accepted: the account exists.
// Figma: 19505:35862.
const ACTIVATED_IMG = `${import.meta.env.BASE_URL}images/home/account-activated.png`;
// Confetti for "Account activated": one burst from the success icon plus a
// shot from each bottom corner, falling under gravity for about 3s. Drawn on a
// canvas over the sheet (no clicks blocked). Skipped under reduced motion.
// Green, purple and blue only (brand greens weighted a little heavier).
const CONFETTI_COLORS = ["#00dd95", "#00e59a", "#36cdca", "#8f7cff", "#a77bff", "#019ff8", "#4f8cff"];
const Confetti = () => {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reducedMotion()) return undefined;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const parts = [];
    const shoot = (x, y, n, angle, spread, speed) => {
      for (let i = 0; i < n; i++) {
        const a = angle + rnd(-spread, spread);
        const v = speed * rnd(0.55, 1.1);
        parts.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          size: rnd(8, 13),
          ratio: rnd(0.35, 0.7),
          rot: rnd(0, Math.PI * 2),
          vr: rnd(-0.25, 0.25),
          tilt: rnd(0, Math.PI * 2),
          vt: rnd(0.08, 0.2),
          color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
          round: Math.random() < 0.25,
        });
      }
    };
    // Burst from the icon (about 124px below the sheet top), then side cannons.
    shoot(w / 2, 124, 110, -Math.PI / 2, Math.PI, 9);
    shoot(0, h * 0.72, 70, -Math.PI / 3, 0.35, 15);
    shoot(w, h * 0.72, 70, (-2 * Math.PI) / 3, 0.35, 15);
    const start = performance.now();
    const LIFE = 3200;
    let raf = 0;
    const frame = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      const fade = t > LIFE - 700 ? Math.max(0, (LIFE - t) / 700) : 1;
      for (const p of parts) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.32;
        p.x += p.vx + Math.sin(p.tilt) * 0.6;
        p.y += p.vy;
        p.rot += p.vr;
        p.tilt += p.vt;
        if (p.y > h + 20) continue;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.tilt));
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, (-p.size * p.ratio) / 2, p.size, p.size * p.ratio);
        }
        ctx.restore();
      }
      if (t < LIFE) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="as-confetti" aria-hidden="true" />;
};

const AccountActivated = () => (
  <div className="as-done">
    <img className="as-done-img" src={ACTIVATED_IMG} width="120" height="120" alt="" />
    <h1 className="as-done-title" id="as-title">
      Account activated
    </h1>
    <p className="as-done-text">
      Your account has been successfully created. Now, we’ll ask you for information such as name and date of birth to
      verify your identity. You’ll also need to submit photo ID.
    </p>
  </div>
);

// Passkey sign-in (Figma: passkey_modal, 18706:103683): a bottom sheet over
// the page sheet. "Start verification" hands over to the device.
const PASSKEY_IMG = `${import.meta.env.BASE_URL}images/home/passkey.svg`;
const PasskeySheet = ({ open, onStart, onOther, onClose }) => (
  <div className={`as-picker as-passkey${open ? " is-open" : ""}`} aria-hidden={!open}>
    <div className="as-picker-scrim" onClick={onClose} />
    <div className="as-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="as-passkey-title">
      <div className="as-picker-grabber" aria-hidden="true" />
      <img className="as-passkey-img" src={PASSKEY_IMG} width="120" height="120" alt="" />
      <h2 className="as-passkey-title" id="as-passkey-title">
        Complete verification with passkey
      </h2>
      <p className="as-passkey-text">Please follow the instructions on your device to complete verification</p>
      <button type="button" className="as-submit is-ready" tabIndex={open ? 0 : -1} onClick={onStart}>
        Start verification
      </button>
      <p className="as-switch">
        Passkey not available?{" "}
        <button type="button" className="as-link" tabIndex={open ? 0 : -1} onClick={onOther}>
          Try another way
        </button>
      </p>
    </div>
  </div>
);

// Stand-in for the phone's own passkey prompt, so the path can be tried in a
// browser: iOS shows a passkey sheet then Face ID, Android a saved-passkey
// sheet then the fingerprint prompt. stage: "ask" | "scan" | "ok".
const FaceIdGlyph = ({ ok }) => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {ok ? (
      <path d="M18 33l9 9 19-20" />
    ) : (
      <>
        <path d="M6 18V12a6 6 0 0 1 6-6h6M46 6h6a6 6 0 0 1 6 6v6M58 46v6a6 6 0 0 1-6 6h-6M18 58h-6a6 6 0 0 1-6-6v-6" />
        <path d="M22 24v4M42 24v4M32 24v12h-3M24 44c4 4 12 4 16 0" />
      </>
    )}
  </svg>
);
const FingerprintGlyph = ({ ok }) => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    {ok ? (
      <path d="M16 29l8 8 16-17" />
    ) : (
      <>
        <path d="M14 16a19 19 0 0 1 28 0" />
        <path d="M11 27a17 17 0 0 1 34 0v3" />
        <path d="M17 41c2-4 3-8 3-14a8 8 0 0 1 16 0c0 5-1 10-3 14" />
        <path d="M28 27c0 7-1 13-4 18" />
        <path d="M43 37c-1 3-2 6-4 9" />
      </>
    )}
  </svg>
);
export const DevicePasskey = ({ platform, stage, account, onContinue, onCancel, mode = "signin" }) => {
  const create = mode === "create";
  if (!stage) return null;
  const ios = platform === "ios";
  if (stage === "ask") {
    return (
      <div className={`dp dp-${platform}`}>
        <div className="dp-scrim" onClick={onCancel} />
        <div className="dp-sheet" role="dialog" aria-modal="true" aria-label="Use passkey">
          {ios ? (
            <>
              <div className="dp-ios-head">
                <span className="dp-ios-key" aria-hidden="true">
                  <img src={PASSKEY_IMG} width="28" height="28" alt="" />
                </span>
                <button type="button" className="dp-x" aria-label="Cancel" onClick={onCancel}>
                  ×
                </button>
              </div>
              <p className="dp-title">{create ? "Save a passkey for “ex.io”?" : "Sign in to “ex.io”?"}</p>
              <p className="dp-sub">
                {create
                  ? "A passkey will be saved in your iCloud Keychain and available on all your devices."
                  : "Use the passkey saved in your iCloud Keychain."}
              </p>
              <div className="dp-account">
                <span className="dp-avatar" aria-hidden="true">
                  {account.slice(0, 1).toUpperCase() || "E"}
                </span>
                <span>
                  <b>{account || "chantaiman.88"}</b>
                  <i>{create ? "New passkey" : "Passkey · iCloud Keychain"}</i>
                </span>
              </div>
              <button type="button" className="dp-continue" onClick={onContinue}>
                Continue
              </button>
            </>
          ) : (
            <>
              <p className="dp-title">{create ? "Create a passkey for ex.io?" : "Use your saved passkey for ex.io?"}</p>
              <div className="dp-account">
                <span className="dp-avatar" aria-hidden="true">
                  {account.slice(0, 1).toUpperCase() || "E"}
                </span>
                <span>
                  <b>{account || "chantaiman.88"}</b>
                  <i>{create ? "Saved to Google Password Manager" : "Passkey · Google Password Manager"}</i>
                </span>
              </div>
              <div className="dp-actions">
                <button type="button" className="dp-text" onClick={onCancel}>
                  Cancel
                </button>
                <button type="button" className="dp-continue" onClick={onContinue}>
                  {create ? "Create" : "Continue"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
  // Biometric check, then a tick.
  const ok = stage === "ok";
  return (
    <div className={`dp dp-${platform} dp-bio${ok ? " is-ok" : ""}`} role="status" aria-live="polite">
      <div className="dp-scrim" />
      {ios ? (
        <div className="dp-faceid">
          <FaceIdGlyph ok={ok} />
          <span>{ok ? "Done" : "Face ID"}</span>
        </div>
      ) : (
        <div className="dp-sheet dp-finger">
          <p className="dp-title">Verify it’s you</p>
          <p className="dp-sub">Touch the fingerprint sensor</p>
          <span className="dp-finger-icon">
            <FingerprintGlyph ok={ok} />
          </span>
          {!ok && (
            <button type="button" className="dp-text" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// After signing in without a passkey: invite the user to set one up
// (Figma: passkey_modal, 19010:59697). Shown over the logged-in Home.
const PASSKEY_ILLU = `${import.meta.env.BASE_URL}images/home/passkey-illustration.jpg`;
export const PasskeyPromo = ({ open, onSetUp, onLater }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onLater();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onLater]);
  return (
    <div className={`as-picker as-passkey as-promo${open ? " is-open" : ""}`} aria-hidden={!open}>
      <div className="as-picker-scrim" onClick={onLater} />
      <div className="as-picker-sheet" role="dialog" aria-modal="true" aria-labelledby="as-promo-title">
        <div className="as-picker-grabber" aria-hidden="true" />
        <img className="as-promo-img" src={PASSKEY_ILLU} width="320" height="320" alt="" />
        <h2 className="as-passkey-title" id="as-promo-title">
          Protect your account with a passkey
        </h2>
        <p className="as-passkey-text">A faster, phishing-resistant way to verify, using the biometrics already on your device.</p>
        <button type="button" className="as-submit is-ready" tabIndex={open ? 0 : -1} onClick={onSetUp}>
          Set up now
        </button>
        <p className="as-switch as-promo-later">
          <button type="button" className="as-link" tabIndex={open ? 0 : -1} onClick={onLater}>
            Do it later
          </button>
        </p>
      </div>
    </div>
  );
};

/* ---------- The sheet ---------- */
// `mode`: null (closed), "signup" or "signin". `screenRef` is the Home screen
// behind the sheet; `phoneRef` is the frame both sit in (it carries the
// open-progress variable both animate from).
const AuthSheet = ({
  mode,
  onModeChange,
  onClose,
  onSignedIn,
  labelStyle,
  platform,
  signinCheck = "email",
  bound = { email: true },
  phoneRef,
  screenRef,
}) => {
  // What is rendered: stays on the last page while the sheet animates closed.
  const [page, setPage] = useState(mode);
  const [mounted, setMounted] = useState(Boolean(mode));
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState(EMPTY);
  const [referralOpen, setReferralOpen] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [fading, setFading] = useState(false);
  const [toast, setToast] = useState("");
  // Page-to-page motion: "fade" (Sign up <-> Sign in), "forward" / "back" (into and out of the OTP step).
  const [nav, setNav] = useState("none");
  const [code, setCode] = useState(EMPTY_CODE);
  const [otpError, setOtpError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  // Which page led to the code step ("signup" / "signin") and what kind of code it asks for.
  const [otpFrom, setOtpFrom] = useState("signup");
  const [otpKind, setOtpKind] = useState("email");
  const [pickerOpen, setPickerOpen] = useState(false);
  // Passkey path: the EXIO sheet, then the device's own prompt (simulated).
  const [passkeyOpen, setPasskeyOpen] = useState(false);
  const [deviceStage, setDeviceStage] = useState(null); // null | "ask" | "scan" | "ok"
  const deviceTimer = useRef(null);
  // Which method "Try another way" was opened from ("passkey" or the code step).
  const [pickerFrom, setPickerFrom] = useState("otp");
  const otpFromRef = useRef(otpFrom);
  otpFromRef.current = otpFrom;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pickerOpenRef = useRef(false);
  pickerOpenRef.current = pickerOpen || passkeyOpen || Boolean(deviceStage);
  const pageRef = useRef(page);
  pageRef.current = page;
  const sheetRef = useRef(null);
  const scrollRef = useRef(null);
  const referralRef = useRef(null);
  const returnFocus = useRef(null);
  const closeTimer = useRef(null);
  const toastTimer = useRef(null);
  const ios = platform === "ios";

  // Auto-focus on arrival: Sign up -> Username, Sign in -> Username / Email,
  // or the password when the username is already filled in (after sign up).
  const FIRST_FIELD = { signup: "as-field-username", signin: "as-field-account" };
  const focusFirstField = (which, id = FIRST_FIELD[which]) => {
    if (pageRef.current !== which || !id) return;
    document.getElementById(id)?.focus({ preventScroll: true });
  };

  const setProgress = useCallback(
    (p) => {
      phoneRef.current?.style.setProperty("--as-p", String(p));
    },
    [phoneRef]
  );

  // Open / close animation. The phone frame carries --as-p (0 closed, 1 open);
  // the sheet and the Home card behind it both derive their transforms from it.
  useLayoutEffect(() => {
    const phone = phoneRef.current;
    if (!phone) return undefined;
    clearTimeout(closeTimer.current);
    if (mode) {
      setPage(mode);
      if (!mounted) {
        returnFocus.current = document.activeElement;
        setMounted(true);
        setProgress(0);
        phone.classList.add("as-open");
        // Two frames so the closed position paints before animating up.
        requestAnimationFrame(() => requestAnimationFrame(() => setProgress(1)));
      }
      return undefined;
    }
    if (!mounted) return undefined;
    setProgress(0);
    closeTimer.current = setTimeout(
      () => {
        phone.classList.remove("as-open");
        setMounted(false);
        // A fresh start next time it opens.
        setValues(EMPTY);
        setErrors(EMPTY);
        setReferralOpen(false);
        setMarketing(false);
        setToast("");
        setNav("none");
        setCode(EMPTY_CODE);
        setOtpError("");
        setVerifying(false);
        setResendIn(0);
        setPickerOpen(false);
        setPasskeyOpen(false);
        setDeviceStage(null);
        clearTimeout(deviceTimer.current);
        if (returnFocus.current?.focus) returnFocus.current.focus({ preventScroll: true });
      },
      reducedMotion() ? 0 : DURATION_MS
    );
    return undefined;
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // Home is not reachable (by keyboard or screen reader) while the sheet is up.
  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return undefined;
    screen.toggleAttribute("inert", mounted);
    if (mounted) screen.setAttribute("aria-hidden", "true");
    else screen.removeAttribute("aria-hidden");
    return undefined;
  }, [mounted, screenRef]);

  // Move focus into the dialog, then (once the sheet has slid up) into the
  // page's first field so the keyboard comes up without a tap.
  useEffect(() => {
    if (!mounted) return undefined;
    sheetRef.current?.focus({ preventScroll: true });
    const which = pageRef.current;
    if (!FIRST_FIELD[which]) return undefined;
    const t = setTimeout(() => focusFirstField(which), reducedMotion() ? 0 : DURATION_MS);
    return () => clearTimeout(t);
  }, [mounted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes.
  useEffect(() => {
    if (!mode) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (pickerOpenRef.current) {
        setPickerOpen(false);
        setPasskeyOpen(false);
        setDeviceStage(null);
        clearTimeout(deviceTimer.current);
      } else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  // Switching between the two pages: a quick cross-fade, back at the top.
  const switchTo = (next, focusId) => {
    if (next === page) return;
    setNav("fade");
    setFading(true);
    setTimeout(
      () => {
        onModeChange(next);
        setPage(next);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setFading(false);
        requestAnimationFrame(() => focusFirstField(next, focusId));
      },
      reducedMotion() ? 0 : 160
    );
  };

  // Into the OTP step. It gets its own history entry, so the back gesture or
  // button returns to Sign up rather than closing the sheet.
  const goToOtp = (from, kind) => {
    setOtpFrom(from);
    setOtpKind(kind);
    window.history.pushState({ asSheet: true, otp: true }, "");
    setNav("forward");
    setCode(EMPTY_CODE);
    setOtpError("");
    setResendIn(kind === "totp" ? 0 : RESEND_SECONDS);
    onModeChange("otp");
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    requestAnimationFrame(() => document.getElementById("as-otp-0")?.focus());
  };
  // Back arrow: return to the page it came from straight away, then drop the step's
  // history entry quietly.
  const backFromOtp = () => {
    setPickerOpen(false);
    setNav("back");
    onModeChange(otpFrom);
    if (window.history.state?.otp) {
      window.__asSilentPopUntil = Date.now() + 800;
      window.history.back();
    }
  };
  useEffect(() => {
    const onPop = () => {
      if (Date.now() < (window.__asSilentPopUntil || 0)) return;
      // Back from "Account activated" leaves the flow (still logged out).
      if (pageRef.current === "done") {
        onCloseRef.current();
        return;
      }
      if (pageRef.current === "otp" && window.history.state?.asSheet && !window.history.state?.otp) {
        setNav("back");
        onModeChange(otpFromRef.current);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [onModeChange]);

  // Sign up doesn't log the user in: "Login" on "Account activated" opens the
  // sign-in page with the new username filled in and the password focused. The page's history entry is
  // dropped quietly so back / X then behave as on a fresh sign in.
  const loginAfterSignup = () => {
    const name = values.username.trim();
    setValues({ ...EMPTY, account: name });
    setErrors(EMPTY);
    setCode(EMPTY_CODE);
    setOtpError("");
    if (window.history.state?.otp) {
      window.__asSilentPopUntil = Date.now() + 800;
      window.history.back();
    }
    // Username is already there, so the password field takes focus.
    switchTo("signin", name ? "as-field-loginPassword" : undefined);
  };

  // Resend countdown.
  useEffect(() => {
    if (page !== "otp" || resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [page, resendIn]);

  const verify = (digits) => {
    setVerifying(true);
    setOtpError("");
    document.activeElement?.blur?.();
    setTimeout(() => {
      setVerifying(false);
      // Prototype: 000000 stands in for a wrong code; anything else passes.
      if (digits === "000000") {
        setOtpError("That code isn’t right. Check it and try again, or resend a new one.");
        requestAnimationFrame(() => document.getElementById("as-otp-0")?.focus());
      } else {
        // Verified: the account is in. Home switches to its logged-in state
        // behind the sheet, then the sheet closes over it.
        // Signing in with an email: greet with the part before "@" (the prototype
        // has no account lookup to find the real username).
        const who = values.account.trim().split("@")[0];
        if (onSignedIn) onSignedIn(otpFrom, who);
        else showToast(otpFrom === "signin" ? "Signed in — this is a prototype" : "Email verified — this is a prototype");
        // Sign up ends on "Account activated". The code step's history entry
        // becomes this page's, so back / Esc / X all leave the flow from here.
        if (otpFrom === "signup") {
          window.history.replaceState({ asSheet: true, otp: true, done: true }, "");
          setNav("forward");
          onModeChange("done");
          if (scrollRef.current) scrollRef.current.scrollTop = 0;
        }
      }
    }, 900);
  };
  const changeCode = (next) => {
    setCode(next);
    if (otpError) setOtpError("");
    // Check as soon as the last digit is in.
    if (next.every((d) => d !== "") && !verifying) verify(next.join(""));
  };
  // Paste: read the clipboard and fill the boxes from its first 6 digits.
  // Browsers may refuse clipboard access (or ask first), so fall back to a
  // hint about pasting into a box, which the boxes already handle.
  const pasteCode = async () => {
    let text = "";
    try {
      text = (await navigator.clipboard.readText()) || "";
    } catch {
      showToast("Can’t read the clipboard here. Long-press a box and paste.");
      document.getElementById("as-otp-0")?.focus();
      return;
    }
    const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
    if (digits.length < OTP_LENGTH) {
      showToast("No 6-digit code on the clipboard");
      return;
    }
    changeCode(digits);
  };
  // Picking another method: the code page swaps to it (a fresh code is "sent").
  const pickMethod = (kind) => {
    setPickerOpen(false);
    if (pickerFrom === "passkey") {
      goToOtp("signin", kind);
      return;
    }
    setNav("fade");
    setFading(true);
    setTimeout(
      () => {
        setOtpKind(kind);
        setCode(EMPTY_CODE);
        setOtpError("");
        setResendIn(kind === "totp" ? 0 : RESEND_SECONDS);
        setFading(false);
        requestAnimationFrame(() => document.getElementById("as-otp-0")?.focus());
      },
      reducedMotion() ? 0 : 160
    );
  };

  const resend = () => {
    setCode(EMPTY_CODE);
    setOtpError("");
    setResendIn(RESEND_SECONDS);
    showToast(`New code sent to ${sentTo}`);
    requestAnimationFrame(() => document.getElementById("as-otp-0")?.focus());
  };

  /* ----- Drag to dismiss (iOS page sheet only) ----- */
  const drag = useRef(null);
  const startDrag = (y, target) => {
    if (!ios || !mode) return;
    // Not while the method picker is up: it sits over the page sheet.
    if (pickerOpenRef.current || target.closest?.(".as-picker, .dp")) return;
    const scroller = scrollRef.current;
    // Inside the scrolling area only once it's scrolled to the top.
    if (scroller && scroller.contains(target) && scroller.scrollTop > 0) return;
    drag.current = { y0: y, y, t0: performance.now(), active: false };
  };
  // Returns true when the move belongs to the drag (so the page shouldn't scroll).
  const moveDrag = (y) => {
    const d = drag.current;
    if (!d) return false;
    const dy = y - d.y0;
    if (!d.active) {
      if (dy > 6) {
        d.active = true;
        d.y0 = y; // start from here so the sheet doesn't jump
        phoneRef.current?.classList.add("as-dragging");
      } else if (dy < -6) {
        drag.current = null; // scrolling up: let the content scroll
        return false;
      }
      return dy > 0;
    }
    d.y = y;
    const h = sheetRef.current?.offsetHeight || 1;
    setProgress(Math.min(1, Math.max(0, 1 - (y - d.y0) / h)));
    return true;
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.active) return;
    phoneRef.current?.classList.remove("as-dragging");
    const dy = d.y - d.y0;
    const v = dy / Math.max(1, performance.now() - d.t0);
    const h = sheetRef.current?.offsetHeight || 1;
    if (dy > h * DISMISS_SHARE || v > DISMISS_VELOCITY) onClose();
    else setProgress(1);
  };

  // Touch: native listeners, since touchmove must be non-passive to stop the
  // content from scrolling while the sheet is being dragged.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || !ios) return undefined;
    const ts = (e) => startDrag(e.touches[0].clientY, e.target);
    const tm = (e) => {
      if (moveDrag(e.touches[0].clientY) && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", endDrag);
    el.addEventListener("touchcancel", endDrag);
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", endDrag);
      el.removeEventListener("touchcancel", endDrag);
    };
  }); // re-bind each render so the handlers see current props

  // Mouse: drag from anywhere but the fields and buttons (keeps text selection).
  const onPointerDown = (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if (e.target.closest("input, button, label, a")) return;
    startDrag(e.clientY, e.target);
    if (!drag.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (e.pointerType === "mouse") moveDrag(e.clientY);
  };
  const onPointerUp = (e) => {
    if (e.pointerType === "mouse") endDrag();
  };

  /* ----- Form state ----- */
  const change = (name, value, opts = {}) => {
    setValues((v) => ({ ...v, [name]: value }));
    // Errors show as soon as what's typed is invalid; an empty field only
    // gets its "Enter …" error when the form is submitted.
    // Fields marked lateError (email) don't flag a format problem mid-typing:
    // the error waits until the field is left, but clears as soon as it's fixed.
    setErrors((er) => {
      if (opts.clearError || value === "") return { ...er, [name]: "" };
      const problem = VALIDATE[name](value);
      if (FIELDS[name]?.lateError) return { ...er, [name]: problem ? er[name] : "" };
      return { ...er, [name]: problem };
    });
  };
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const blur = (name) => {
    // Checked on leaving a field, but only if something was typed.
    const v = valuesRef.current[name];
    if (v !== "") setErrors((er) => ({ ...er, [name]: VALIDATE[name](v) }));
  };
  const fieldProps = (name) => ({
    labelStyle,
    value: values[name],
    error: errors[name],
    onChange: change,
    onBlur: blur,
  });

  // Where the code went. Signing in with an email shows that email; with a
  // username, the prototype's stand-in address.
  const signinEmail = values.account.includes("@") ? values.account : DEMO_EMAIL;
  const sentTo =
    otpKind === "sms" ? maskPhone(DEMO_PHONE) : maskEmail(otpFrom === "signin" ? signinEmail : values.email);
  const otpTitle =
    otpKind === "totp"
      ? "Enter authenticator code"
      : otpKind === "sms"
        ? "Check your phone"
        : otpFrom === "signin"
          ? "Check your email"
          : "Verify your email";

  // Passkey: hand over to the device, then finish signing in.
  const startPasskey = () => {
    setPasskeyOpen(false);
    setDeviceStage("ask");
  };
  const cancelPasskey = () => {
    clearTimeout(deviceTimer.current);
    setDeviceStage(null);
    setPasskeyOpen(true);
    showToast("Passkey verification was cancelled");
  };
  const continuePasskey = () => {
    setDeviceStage("scan");
    deviceTimer.current = setTimeout(() => {
      setDeviceStage("ok");
      deviceTimer.current = setTimeout(() => {
        setDeviceStage(null);
        const who = values.account.trim().split("@")[0];
        if (onSignedIn) onSignedIn("signin", who);
      }, 700);
    }, 1400);
  };
  useEffect(() => () => clearTimeout(deviceTimer.current), []);

  // The other ways to get a code, for "Try another way".
  const otherMethods = [
    { kind: "totp", label: "Enter code from authenticator app" },
    { kind: "sms", label: "Send an SMS to", value: maskPhone(DEMO_PHONE) },
    { kind: "email", label: "Code from email to", value: maskEmail(signinEmail) },
  ]
    // Only methods the account has set up; email is always bound.
    .filter((m) => m.kind === "email" || bound[m.kind])
    .filter((m) => pickerFrom === "passkey" || m.kind !== otpKind);
  // From a code page: is there anything else to switch to?
  const otherFromOtp = ["totp", "sms", "email"].filter((k) => k !== otpKind && (k === "email" || bound[k]));

  const required = REQUIRED[page] || [];
  const codeFull = code.every((d) => d !== "");
  const ready = page === "otp" ? codeFull && !verifying : required.every((k) => !VALIDATE[k](values[k]));

  const showToast = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const submit = (e) => {
    e.preventDefault();
    if (page === "done") return;
    if (page === "otp") {
      if (verifying) return;
      if (!codeFull) {
        setOtpError("Enter the 6-digit code.");
        document.getElementById(`as-otp-${code.findIndex((d) => d === "")}`)?.focus();
        return;
      }
      verify(code.join(""));
      return;
    }
    if (!ready) {
      setErrors((er) => ({ ...er, ...Object.fromEntries(required.map((k) => [k, VALIDATE[k](values[k])])) }));
      // Take the user to the first problem.
      const first = required.find((k) => VALIDATE[k](values[k]));
      document.getElementById(`as-field-${first}`)?.focus();
      return;
    }
    document.activeElement?.blur?.();
    if (page === "signup") goToOtp("signup", "email");
    else if (signinCheck === "passkey") setPasskeyOpen(true);
    else goToOtp("signin", signinCheck);
  };

  const toggleReferral = () => {
    setReferralOpen((o) => {
      if (!o) requestAnimationFrame(() => referralRef.current?.focus());
      return !o;
    });
  };

  if (!mounted) return null;

  return (
    <>
      <div className="as-scrim" aria-hidden="true" />
      <section
        ref={sheetRef}
        className={`as-sheet as-${platform} as-style-${labelStyle}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="as-title"
        tabIndex={-1}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="as-topbar">
          {page === "otp" && (
            <button type="button" className="as-close as-back" aria-label={otpFrom === "signin" ? "Back to sign in" : "Back to sign up"} onClick={backFromOtp}>
              <BackIcon />
            </button>
          )}
          <button type="button" className="as-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <form className="as-body" noValidate onSubmit={submit}>
          <div ref={scrollRef} className={`as-scroll${fading ? " is-fading" : ""}`}>
            <div key={page} className={`as-page as-enter-${nav}`}>
            {page === "done" ? (
              <AccountActivated />
            ) : page === "otp" ? (
              <OtpStep
                kind={otpKind}
                title={otpTitle}
                sentTo={sentTo}
                code={code}
                onCodeChange={changeCode}
                error={otpError}
                verifying={verifying}
                resendIn={resendIn}
                onResend={resend}
                onPaste={pasteCode}
              />
            ) : page === "signin" ? (
              <SignIn fieldProps={fieldProps} onForgot={() => showToast("Password reset isn’t in this prototype")} />
            ) : (
              <SignUp
                fieldProps={fieldProps}
                referralOpen={referralOpen}
                onToggleReferral={toggleReferral}
                marketing={marketing}
                onToggleMarketing={() => setMarketing((m) => !m)}
                referralRef={referralRef}
              />
            )}
            </div>
          </div>

          <div className="as-footer">
            <div className={`as-toast${toast ? " is-shown" : ""}`} role="status">
              {toast}
            </div>
            {page === "done" ? (
              <>
                <button type="button" className="as-submit is-ready" onClick={loginAfterSignup}>
                  Login
                </button>
              </>
            ) : (
              <button type="submit" className={`as-submit${ready ? " is-ready" : ""}`} aria-busy={verifying || undefined}>
                {page === "otp" ? (verifying ? "Verifying…" : "Verify") : "Next"}
              </button>
            )}
            {page === "otp" && otpKind === "email" && (
              <p className="as-otp-tip">
                Didn’t receive the verification code? Check your spam folder and mark it as “Not Spam”.
              </p>
            )}
            {page === "otp" && otpFrom === "signin" && otherFromOtp.length > 0 && (
              <p className="as-switch">
                Not available?{" "}
                <button
                  type="button"
                  className="as-link"
                  onClick={() => {
                    setPickerFrom("otp");
                    setPickerOpen(true);
                  }}
                >
                  Try another way
                </button>
              </p>
            )}
            {(page === "signin" || page === "signup") && (
            <p className="as-switch">
              {page === "signin" ? "Don’t have an account? " : "Have an account? "}
              <button type="button" className="as-link" onClick={() => switchTo(page === "signin" ? "signup" : "signin")}>
                {page === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
            )}
          </div>
        </form>

        {page === "done" && <Confetti />}

        <PasskeySheet
          open={passkeyOpen}
          onStart={startPasskey}
          onOther={() => {
            setPasskeyOpen(false);
            setPickerFrom("passkey");
            setPickerOpen(true);
          }}
          onClose={() => setPasskeyOpen(false)}
        />
        <DevicePasskey
          platform={platform}
          stage={deviceStage}
          account={values.account.trim().split("@")[0]}
          onContinue={continuePasskey}
          onCancel={cancelPasskey}
        />

        <MethodPicker open={pickerOpen} methods={otherMethods} onPick={pickMethod} onClose={() => setPickerOpen(false)} />
      </section>
    </>
  );
};

export default AuthSheet;
