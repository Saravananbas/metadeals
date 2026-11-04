import test from "node:test";
import assert from "node:assert/strict";
import {
  rupeesToPaise,
  paiseToRupees,
  paiseToRupeeInputString,
  formatINR,
  formatPaise,
} from "../src/features/deals/currency";

test("rupeesToPaise converts rupee strings and numbers to exact integer paise", () => {
  // Required prompt examples:
  assert.equal(rupeesToPaise("₹10,000"), 1000000);
  assert.equal(rupeesToPaise("₹6,999"), 699900);
  assert.equal(rupeesToPaise("₹6,999.50"), 699950);
  assert.equal(rupeesToPaise("₹285"), 28500);
  assert.equal(rupeesToPaise("₹1.25"), 125);

  // Numeric values without floating-point errors
  assert.equal(rupeesToPaise(10000), 1000000);
  assert.equal(rupeesToPaise(6999), 699900);
  assert.equal(rupeesToPaise(6999.5), 699950);
  assert.equal(rupeesToPaise(285), 28500);
  assert.equal(rupeesToPaise(1.25), 125);

  // Formats with Rs, INR, spaces, decimals
  assert.equal(rupeesToPaise("Rs. 499"), 49900);
  assert.equal(rupeesToPaise("INR 1,499.99"), 149999);
  assert.equal(rupeesToPaise("0.5"), 50);
  assert.equal(rupeesToPaise("0.05"), 5);
  assert.equal(rupeesToPaise(0), 0);
  assert.equal(rupeesToPaise("0"), 0);

  // Floating-point precision danger tests:
  // In IEEE 754: 19.99 * 100 === 1998.9999999999998
  assert.equal(rupeesToPaise(19.99), 1999);
  assert.equal(rupeesToPaise("19.99"), 1999);
  assert.equal(rupeesToPaise(29.99), 2999);
  assert.equal(rupeesToPaise("29.99"), 2999);
});

test("rupeesToPaise rejects invalid, negative, or malformed rupee values", () => {
  assert.throws(() => rupeesToPaise(""), /cannot be empty/);
  assert.throws(() => rupeesToPaise("   "), /cannot be empty/);
  assert.throws(() => rupeesToPaise("-100"), /Invalid rupee format/);
  assert.throws(() => rupeesToPaise(-50), /must be a non-negative finite number/);
  assert.throws(() => rupeesToPaise("abc"), /Invalid rupee format/);
  assert.throws(() => rupeesToPaise("10.999"), /Invalid rupee format/); // max 2 decimals
  assert.throws(() => rupeesToPaise(NaN), /must be a non-negative finite number/);
  assert.throws(() => rupeesToPaise(Infinity), /must be a non-negative finite number/);
});

test("paiseToRupees and paiseToRupeeInputString convert database paise for admin inputs", () => {
  assert.equal(paiseToRupees(1000000), 10000);
  assert.equal(paiseToRupees(699950), 6999.5);
  assert.equal(paiseToRupees(125), 1.25);
  assert.equal(paiseToRupees(0), 0);

  assert.equal(paiseToRupeeInputString(1000000), "10000");
  assert.equal(paiseToRupeeInputString(699950), "6999.50");
  assert.equal(paiseToRupeeInputString(28500), "285");
  assert.equal(paiseToRupeeInputString(125), "1.25");
  assert.equal(paiseToRupeeInputString(0), "0");
});

test("formatINR and formatPaise format amounts in Indian numbering system", () => {
  // 1 Lakh = 1,00,000
  const formattedLakh = formatINR(100000);
  assert.ok(formattedLakh.includes("1,00,000"));

  // 10 Lakhs = 10,00,000
  const formattedTenLakhs = formatINR(1000000);
  assert.ok(formattedTenLakhs.includes("10,00,000"));

  // 1 Crore = 1,00,00,000
  const formattedCrore = formatINR(10000000);
  assert.ok(formattedCrore.includes("1,00,00,000"));

  // Decimals formatting
  const formattedDecimal = formatINR(6999.5);
  assert.ok(formattedDecimal.includes("6,999.50"));

  // formatPaise
  assert.ok(formatPaise(1000000).includes("10,000"));
  assert.ok(formatPaise(699950).includes("6,999.50"));
  assert.ok(formatPaise(125).includes("1.25"));
});

