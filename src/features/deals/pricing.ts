export const formatINR = (value: number) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0,
}).format(value);

export function getSavings(original: number, price: number) {
  if (!Number.isFinite(original) || !Number.isFinite(price) || original <= 0 || price < 0 || price >= original) {
    return { amount: 0, percent: 0 };
  }
  const amount = original - price;
  // Round down so the displayed discount never overstates the actual saving.
  return { amount, percent: Math.floor((amount / original) * 100) };
}
