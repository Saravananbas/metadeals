/**
 * When a deal has a coupon, pressing Buy Now copies the code first (the click itself allows it) and says so, then the link opens the store as usual.
 * Browser only; never blocks or delays the navigation.
 */
export function copyCouponOnBuy(code: string | null | undefined): void {
  if (!code || typeof document === "undefined") return;
  const done = () => showToast(`Coupon ${code} copied. Paste it at checkout.`);
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(done).catch(() => legacyCopy(code) && done());
  else if (legacyCopy(code)) done();
}

function legacyCopy(text: string): boolean {
  try {
    const box = document.createElement("textarea");
    box.value = text; box.setAttribute("readonly", ""); box.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(box); box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  } catch { return false; }
}

function showToast(text: string) {
  document.getElementById("coupon-copy-toast")?.remove();
  const el = document.createElement("div");
  el.id = "coupon-copy-toast"; el.setAttribute("role", "status"); el.textContent = text;
  el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2000;max-width:calc(100% - 24px);padding:12px 18px;border-radius:12px;background:#2a0f5c;color:#fff;font:700 14px system-ui,sans-serif;box-shadow:0 12px 32px rgba(40,10,90,.35)";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
