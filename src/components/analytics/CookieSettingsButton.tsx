"use client";
import { openConsentChoices } from "@/lib/analytics-client";

/** Footer link that reopens the privacy choices (accepting or declining analytics can be changed any time). */
export function CookieSettingsButton() {
  return <button type="button" onClick={openConsentChoices} style={{ background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", textDecoration: "underline", cursor: "pointer" }}>Cookie settings</button>;
}
