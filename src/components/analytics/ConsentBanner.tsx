"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CONSENT_EVENT, getConsent, setConsent } from "@/lib/analytics-client";

export function ConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const sync = () => setVisible(getConsent() === null);
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  if (!visible || pathname.startsWith("/admin")) return null;
  return (
    <div
      role="dialog"
      aria-label="Privacy choices"
      style={{
        position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 1000, maxWidth: 560, margin: "0 auto",
        background: "#fff", border: "1px solid #d9d4f2", borderRadius: 14, padding: 16, boxShadow: "0 8px 30px rgba(40,20,120,.18)",
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.5 }}>
        We count visits to improve MetaDeals4U. If you accept, we also remember what you open and how long you stay, and link it to your account if you sign in.
        We never sell your personal details. Read our <Link href="/cookies" style={{ textDecoration: "underline" }}>Cookie Policy</Link> and <Link href="/privacy" style={{ textDecoration: "underline" }}>Privacy Policy</Link>.
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={() => setConsent("declined")} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #c9c3e8", background: "#fff", cursor: "pointer" }}>
          Decline
        </button>
        <button type="button" onClick={() => setConsent("accepted")} style={{ padding: "8px 14px", borderRadius: 10, border: 0, background: "#5b21d6", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
          Accept
        </button>
      </div>
    </div>
  );
}
