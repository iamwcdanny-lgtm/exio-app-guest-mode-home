import React, { useEffect } from "react";
import PhoneLayer from "./PhoneLayer";
import "./TokenSheet.css";

// Bottom sheet for picking a currency / token in an amount field (PD order
// form and OTC). Replaces the native dropdown, 2026-11-02.
//   options: [{ value, icon (node), name, balance (string, optional) }]
const Check = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M4.5 10.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Close = () => (
  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const ChipCaret = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export default function TokenSheet({ open, title = "Select currency", options, value, onPick, onClose, balanceLabel = "Avail." }) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  return (
    <PhoneLayer className="tks-layer">
      <div className={`tks-scrim${open ? " is-open" : ""}`} onClick={onClose} aria-hidden="true" />
      <div className={`tks-sheet${open ? " is-open" : ""}`} role="dialog" aria-modal="true" aria-label={title} aria-hidden={!open}>
        <div className="tks-head">
          <h2>{title}</h2>
          <button type="button" className="tks-close" aria-label="Close" onClick={onClose} tabIndex={open ? 0 : -1}>
            <Close />
          </button>
        </div>
        <div className="tks-list" role="radiogroup" aria-label={title}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={o.value === value}
              className={`tks-row${o.value === value ? " is-on" : ""}`}
              tabIndex={open ? 0 : -1}
              onClick={() => {
                onPick(o.value);
                onClose();
              }}
            >
              <span className="tks-icon">{o.icon}</span>
              <span className="tks-text">
                <b>{o.value}</b>
                {o.name && <small>{o.name}</small>}
              </span>
              {o.balance !== undefined && (
                <span className="tks-bal">
                  <b>{o.balance}</b>
                  <small>{balanceLabel}</small>
                </span>
              )}
              <span className="tks-check">{o.value === value && <Check />}</span>
            </button>
          ))}
        </div>
      </div>
    </PhoneLayer>
  );
}
