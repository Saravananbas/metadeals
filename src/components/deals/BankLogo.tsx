/** A bank logo, or a coloured initial when no logo is uploaded yet (the colour comes from the name, so a bank always looks the same). */
export function BankLogo({ name, logoUrl, size = 20 }: { name: string; logoUrl?: string | null; size?: number }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- small uploaded logo, served by our own media endpoint
    return <img src={logoUrl} alt="" width={size} height={size} style={{ width: size, height: size, objectFit: "contain", borderRadius: 4, background: "#fff", flex: "none" }} />;
  }
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return <span aria-hidden="true" style={{ width: size, height: size, flex: "none", borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", background: `hsl(${hash} 55% 40%)`, color: "#fff", fontSize: Math.round(size * 0.5), fontWeight: 800 }}>{name.trim().charAt(0).toUpperCase()}</span>;
}
