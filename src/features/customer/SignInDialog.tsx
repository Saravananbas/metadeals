"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CustomerAccount } from "./CustomerAccount";

type Options = { providers: { google: boolean; apple: boolean }; delivery: "local" | "resend" | "unavailable" };

/** The sign-in and sign-up form in a pop-up (used by "Post a Deal" for visitors). After signing in the member lands on `redirectTo`. */
export function SignInDialog({ redirectTo, onClose }: { redirectTo: string; onClose: () => void }) {
  const [options, setOptions] = useState<Options | null>(null);
  useEffect(() => {
    fetch("/api/v1/customer/auth-options", { cache: "no-store" }).then((r) => r.json()).then(setOptions).catch(() => onClose());
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = overflow; };
  }, [onClose]);
  // Drawn on the page itself: inside the sticky header (which blurs its background) a fixed pop-up would be trapped in the header.
  return createPortal(
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, display: "grid", placeItems: "center", padding: 12, background: "color-mix(in srgb, var(--md-black) 55%, transparent)", overflow: "auto" }}>
      <div role="dialog" aria-modal="true" aria-label="Sign in to post a deal" onClick={(e) => e.stopPropagation()} style={{ position: "relative", width: "min(980px, 100%)", maxHeight: "94vh", overflow: "auto", borderRadius: 20, background: "var(--md-white)" }}>
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, zIndex: 2, display: "grid", placeItems: "center", width: 36, height: 36, border: 0, borderRadius: "50%", background: "var(--md-purple-50)", cursor: "pointer" }}><X size={18} /></button>
        {options ? <CustomerAccount providers={options.providers} delivery={options.delivery} redirectTo={redirectTo} embedded /> : <p style={{ padding: 32, textAlign: "center" }}>Loading…</p>}
      </div>
    </div>
  , document.body);
}
