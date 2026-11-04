"use client";

import { useEffect, useRef } from "react";
import "./toast.css";

/** Turns wallet-kit wording into one plain line. */
export function walletMessage(text: string): string {
  if (/closed the modal|declined|rejected|denied|cancel/i.test(text)) return "Wallet request cancelled.";
  return text;
}

/** A dismissible error toast in the top-right corner. Clears itself after a few seconds. */
export function Toast({ message, onClose }: { message?: string; onClose: () => void }) {
  // The pages re-render every second; keep the timer tied to the message, not the callback.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => close.current(), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;
  return (
    <div className="toast" role="alert">
      <span>{walletMessage(message)}</span>
      <button type="button" aria-label="Dismiss" onClick={onClose}>×</button>
    </div>
  );
}
