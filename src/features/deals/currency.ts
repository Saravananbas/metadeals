/**
 * Shared Indian Rupee (INR / ₹) currency utilities.
 * Handles safe exact conversions between Rupee strings/numbers and database integer paise,
 * and formats monetary amounts using the official Indian numbering system (en-IN).
 */

/**
 * Safely converts an INR rupee value (number or string, e.g. "₹10,000", "6999.50", "285", 1.25)
 * into an integer paise amount without floating-point precision loss.
 */
export function rupeesToPaise(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error("Invalid rupee amount: must be a non-negative finite number.");
    }
    // Convert to fixed 2-decimal string to avoid floating point issues (e.g. 19.99 * 100)
    input = input.toFixed(2);
  }

  if (typeof input !== "string") {
    throw new Error("Invalid rupee amount: input must be a string or number.");
  }

  // Remove currency symbol, spaces, commas, and common prefixes like 'Rs.' or 'INR'
  const cleaned = input
    .replace(/[₹\s,]/g, "")
    .replace(/^(rs\.?|inr)/i, "")
    .trim();

  if (!cleaned) {
    throw new Error("Rupee amount cannot be empty.");
  }

  // Match optional leading digits, followed by optional decimal point and 1-2 digits
  const match = cleaned.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) {
    throw new Error(`Invalid rupee format: "${input}". Expected valid positive number (e.g. 1999 or 1999.50).`);
  }

  const integerPart = match[1];
  let fractionalPart = match[2] || "00";

  // If fractional part is 1 digit (e.g. ".5"), it means 50 paise
  if (fractionalPart.length === 1) {
    fractionalPart += "0";
  }

  const paiseBig = BigInt(integerPart) * BigInt(100) + BigInt(fractionalPart);
  const paise = Number(paiseBig);

  if (!Number.isSafeInteger(paise) || paise < 0) {
    throw new Error(`Rupee amount out of safe range: "${input}".`);
  }

  return paise;
}

/**
 * Converts integer paise from database to a float rupee value.
 */
export function paiseToRupees(paise: number): number {
  if (!Number.isFinite(paise) || paise < 0) {
    return 0;
  }
  return paise / 100;
}

/**
 * Converts integer paise into an exact string representation suitable for HTML number inputs
 * (e.g. 699950 -> "6999.50", 1000000 -> "10000", 125 -> "1.25").
 */
export function paiseToRupeeInputString(paise: number): string {
  if (!Number.isFinite(paise) || paise < 0) {
    return "0";
  }
  if (paise % 100 === 0) {
    return (paise / 100).toString();
  }
  const rupees = paise / 100;
  return rupees.toFixed(2);
}

/**
 * Formats a Rupee value using the Indian numbering system (en-IN) with the ₹ symbol.
 * E.g. 100000 -> "₹1,00,000", 6999.5 -> "₹6,999.50"
 */
export function formatINR(
  rupees: number,
  options?: {
    decimals?: "auto" | "always" | "never";
  }
): string {
  if (!Number.isFinite(rupees)) return "₹0";

  const decimals = options?.decimals ?? "auto";
  const hasDecimals = rupees % 1 !== 0;

  const minDecimals = decimals === "always" ? 2 : decimals === "never" ? 0 : hasDecimals ? 2 : 0;
  const maxDecimals = decimals === "never" ? 0 : 2;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(rupees);
}

/**
 * Formats database integer paise into an Indian Rupee string (en-IN).
 * E.g. 1000000 -> "₹10,000", 699950 -> "₹6,999.50"
 */
export function formatPaise(
  paise: number,
  options?: {
    decimals?: "auto" | "always" | "never";
  }
): string {
  return formatINR(paiseToRupees(paise), options);
}

