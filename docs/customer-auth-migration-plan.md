# Customer signup: additive migration plan
Add Customer (verified shoppers only), CustomerIdentity (unique provider/subject),
CustomerSignupChallenge (one expiring pending signup per normalized email), and
CustomerRateLimit (bounded request windows). These tables have no administrative
role or relationship to the existing User/admin sessions. Existing identity,
catalog and draft M4 models are unchanged. No sample offers are inserted.

Before applying: create and verify a pg_dump; record row fingerprints of existing
public tables. Apply only the reviewed customer migration using migrate deploy,
never migrate dev/reset or db push. Compare existing rows afterward. No M4
migration is included. Challenge attempts are atomic, capped at five, expire
after ten minutes, and store only keyed OTP hashes and Argon2 password hashes.
Customer is created only after verification; customer sessions use a separate
NextAuth endpoint/cookie and never satisfy admin authentication.
