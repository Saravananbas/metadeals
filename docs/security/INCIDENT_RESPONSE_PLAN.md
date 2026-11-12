# Incident response plan (small team)

## 1. Spot it
Signs: unexpected admin sign-ins or audit entries, a lockout storm, spam comments, odd redirects, a deal page showing strange content, database or hosting alerts, a report from a user.

## 2. Contain (first hour)
- **Suspected staff account compromise:** suspend the account (an admin or super admin can); sessions are revoked on suspension. Check `/api/admin/audit` for what it did.
- **Malicious deal content:** archive or delete the deal in Deal Management.
- **Abuse of a public endpoint:** set `COMMUNITY_WRITES_DISABLED=true` / `MESSAGES_WRITES_DISABLED=true`, or `COMMUNITY_ENABLED=false`, and redeploy.
- **Automated publishing misbehaving:** switch the Agent2 kill switch ON (anyone who can publish can).
- **Admin portal under attack:** set `ADMIN_ALLOWED_IPS` to your own addresses.
- **Secret exposed:** rotate it (hPanel), redeploy, then invalidate sessions by changing `AUTH_SESSION_SECRET` (this signs every staff user out).

## 3. Investigate
Collect: audit log, Hostinger runtime logs, deal and submission history, moderation history (append-only), database backup from before the event. Do not delete evidence.

## 4. Recover
Restore from the daily Hostinger backup if data was altered (restore test not yet done), re-deploy a known good build from Git, re-enable features one by one.

## 5. Tell people
If personal data of customers may have been exposed, tell affected users without delay, say what happened and what to do, and report to authorities as the law requires after legal advice. Keep a plain-language note for the owner of who knew what and when.

## 6. Learn
Write a short note (cause, fix, what to monitor), add a regression test, update `SECURITY_REMEDIATION_LOG.md`.

Contacts to fill in: owner, hosting support, legal adviser, grievance contact (see Privacy Policy).
