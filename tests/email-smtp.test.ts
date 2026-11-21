import assert from "node:assert/strict";
import test from "node:test";
import { smtpSettings } from "@/server/customer/email";

const base = { SMTP_HOST: "smtp.hostinger.com", SMTP_USERNAME: "noreply@metadeals4u.in", SMTP_PASSWORD: "x", EMAIL_FROM: "MetaDeals4U <noreply@metadeals4u.in>" };

test("SMTP settings: port 465 uses TLS from the start, 587 uses STARTTLS, and missing values mean unavailable", () => {
  assert.equal(smtpSettings({ ...base })?.secure, true, "defaults to port 465 with TLS");
  const starttls = smtpSettings({ ...base, SMTP_PORT: "587" });
  assert.equal(starttls?.secure, false);
  assert.equal(starttls?.requireTLS, true, "587 must upgrade to TLS or fail, never send in the clear");
  assert.equal(smtpSettings({ ...base, SMTP_PASSWORD: "" }), null);
  assert.equal(smtpSettings({ ...base, SMTP_HOST: undefined }), null);
  assert.equal(smtpSettings({ ...base, EMAIL_FROM: undefined }), null);
  assert.equal(smtpSettings({ ...base, SMTP_PORT: "abc" }), null);
  assert.equal(smtpSettings({ ...base, SMTP_PORT: "70000" }), null);
});
