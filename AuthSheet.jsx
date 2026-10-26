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
  email: { label: "Email", placeholder: "name@example.com", type: "email", autoComplete: "email", inputMode: "email" },
  password: { label: "Login password", placeholder: "8+ characters", password: true, autoComplete: "new-password" },
  referral: { label: "Referral code", placeholder: "EX8K2Q", autoComplete: "off" },
  account: { label: "Username / Email", placeholder: "chantaiman.88", autoComplete: "username" },
  loginPassword: { label: "Login password", placeholder: "Enter your password", password: true, autoComplete: "current-password" },
};

const VALIDATE = {
  username: (v) =>
    !v ? "Enter a username." : /[^a-zA-Z0-9.]/.test(v) ? "Use letters, numbers and full stops only." : v.length < 3 ? "Enter at least 3 characters." : "",
  email: (v) => (!v ? "Enter your email." : /^\S+@\S+\.\S+$/.test(v) ? "" : "Enter a valid email address."),
  password: (v) => (!v ? "Enter a password." : v.length < 8 ? "Use at least 8 characters." : ""),
  referral: () => "",
  account: (v) => (v ? "" : "Enter your username or email."),
  loginPassword: (v) => (v ? "" : "Enter your password."),
};

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
const CloseIcon = () => (
  <Icon size={24}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);
const ClearIcon = () => (
  <Icon>
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
const CheckCircleIcon = () => (
  <Icon size={20}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.2l2.4 2.4 4.6-4.8" />
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

const Field = ({ name, labelStyle, value, error, onChange, onBlur, inputRef }) => {
  const def = FIELDS[name];
  const [focused, setFocused] = useState(false);
  const [shown, setShown] = useState(false);
  const ownRef = useRef(null);
  const ref = inputRef || ownRef;
  const id = `as-field-${name}`;
  const hintId = `${id}-hint`;
  const hint = error || def.hint;
  const up = focused || value !== "";

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
      aria-describedby={hint ? hintId : undefined}
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
        <CheckCircleIcon />
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

/* ---------- The sheet ---------- */
// `mode`: null (closed), "signup" or "signin". `screenRef` is the Home screen
// behind the sheet; `phoneRef` is the frame both sit in (it carries the
// open-progress variable both animate from).
const AuthSheet = ({ mode, onModeChange, onClose, labelStyle, platform, phoneRef, screenRef }) => {
  // What is rendered: stays on the last page while the sheet animates closed.
  const [page, setPage] = useState(mode);
  const [mounted, setMounted] = useState(Boolean(mode));
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState(EMPTY);
  const [referralOpen, setReferralOpen] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [fading, setFading] = useState(false);
  const [toast, setToast] = useState("");
  const sheetRef = useRef(null);
  const scrollRef = useRef(null);
  const referralRef = useRef(null);
  const returnFocus = useRef(null);
  const closeTimer = useRef(null);
  const toastTimer = useRef(null);
  const ios = platform === "ios";

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

  // Move focus into the dialog (not into a field, so no keyboard pops up).
  useEffect(() => {
    if (mounted) sheetRef.current?.focus({ preventScroll: true });
  }, [mounted]);

  // Escape closes.
  useEffect(() => {
    if (!mode) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  // Switching between the two pages: a quick cross-fade, back at the top.
  const switchTo = (next) => {
    if (next === page) return;
    setFading(true);
    setTimeout(
      () => {
        onModeChange(next);
        setPage(next);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setFading(false);
      },
      reducedMotion() ? 0 : 160
    );
  };

  /* ----- Drag to dismiss (iOS page sheet only) ----- */
  const drag = useRef(null);
  const startDrag = (y, target) => {
    if (!ios || !mode) return;
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
    e.preventDefault(); // no text selection while dragging the sheet
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
    // Once a field shows an error, it updates live as it is corrected.
    setErrors((er) => (opts.clearError ? { ...er, [name]: "" } : er[name] ? { ...er, [name]: VALIDATE[name](value) } : er));
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

  const required = REQUIRED[page] || [];
  const ready = required.every((k) => !VALIDATE[k](values[k]));

  const showToast = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1800);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const submit = (e) => {
    e.preventDefault();
    if (!ready) {
      setErrors((er) => ({ ...er, ...Object.fromEntries(required.map((k) => [k, VALIDATE[k](values[k])])) }));
      // Take the user to the first problem.
      const first = required.find((k) => VALIDATE[k](values[k]));
      document.getElementById(`as-field-${first}`)?.focus();
      return;
    }
    document.activeElement?.blur?.();
    showToast("Looks good — this is a prototype");
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
          <button type="button" className="as-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <form className="as-body" noValidate onSubmit={submit}>
          <div ref={scrollRef} className={`as-scroll${fading ? " is-fading" : ""}`}>
            {page === "signin" ? (
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

          <div className="as-footer">
            <div className={`as-toast${toast ? " is-shown" : ""}`} role="status">
              {toast}
            </div>
            <button type="submit" className={`as-submit${ready ? " is-ready" : ""}`}>
              Next
            </button>
            <p className="as-switch">
              {page === "signin" ? "Don’t have an account? " : "Have an account? "}
              <button type="button" className="as-link" onClick={() => switchTo(page === "signin" ? "signup" : "signin")}>
                {page === "signin" ? "Sign up" : "Sign in"}
              </button>
            </p>
          </div>
        </form>
      </section>
    </>
  );
};

export default AuthSheet;
