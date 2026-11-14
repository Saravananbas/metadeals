# Mobile authentication validation (13 Nov 2026)

## Architecture finding (the key fact)
The three screenshots are **not the responsive website in a browser: they are the installed MetaDeals4U Android app** (Flutter, package `in.metadeals4u.app`). Its sign-in screen is the website's `/account` page inside a web view, under the app's own "MetaDeals4U / Skip for now" bar. The third screenshot (Chrome address bar on `staging.metadeals4u.in`) is the phone's Chrome, opened by the app.

## Issue 2: Google sign-in does not return to the app. Root cause
1. Google refuses OAuth inside embedded web views (policy `disallowed_useragent`).
2. The app therefore hands every non-MetaDeals4U address to the phone's Chrome (`mobile/lib/web_tab.dart`, `launchUrl(... externalApplication)`).
3. Chrome completes the whole flow correctly (screenshot 3 shows the profile signed in as the Google account), but the session cookie lives in **Chrome**, a different cookie jar from the app's web view. The app never learns about it. There is nothing to "return" to: no deep link or app link exists, by design.

The web OAuth itself works: state and PKCE cookies (`__Secure-md-customer-state/pkce/nonce`), `redirect` callback that only allows our own origin (open-redirect safe), verified provider email required, HttpOnly Secure session cookie. No change was made to any of that and nothing was weakened.

## Fix (this change)
- In the app (user agent contains `MetaDeals4UApp`) the Google and Apple buttons are hidden; email/password sign-in, sign-up and TOTP are untouched. This stops the broken hand-off instead of hiding it.
- Earlier the Google button was hidden only for Google, and **that change had not been deployed to staging**, which is why the button still appeared. Apple has the same web-view limitation, so it is now hidden too. **Needs a staging deploy to take effect in the app.**
- Not done (on purpose): native Google/Apple sign-in in the app. The correct secure design is a separate project: Google Sign-In SDK on Android (ID token verified by the server, new endpoint that issues a session cookie into the web view) and Sign in with Apple on iOS, or Chrome Custom Tab plus a one-time code returned by an app link. It needs a deep-link/app-link domain association and security review. Not started.

## Issue 1: Sign Up at the top
`src/features/customer/CustomerAccount.tsx`, `account.module.css`: a gradient "Sign Up" pill at the top right of the page header (becomes "Sign In" on the registration screen). It switches the existing form mode (no second registration flow); validation, email code and passwords are unchanged. The bottom "New here? Create an account" link stays. Header spacing shrinks under 520 px so nothing scrolls sideways.
The app's own bar still shows "Skip for now" (guest browsing unchanged).

## Tests executed (what was actually run)
| Check | Result |
|---|---|
| `tsc --noEmit`, eslint on changed files | pass |
| `tests/mobile-api.test.ts` | pass |
| Local page at 360 px wide (browser pane emulation): Sign Up visible without scrolling; click opens "Create account"; button becomes "Sign In"; no horizontal scroll | pass |
| Full production build, full auth regression | **not run** this round |
| Google login on desktop / Android Chrome / Samsung Internet / iPhone Safari | **not tested.** The user's own Android Chrome run (screenshots) showed the browser flow completing |
| Cancel, invalid callback, expired state, new vs existing Google account | **not tested** this round (the NextAuth state and callback handling is unchanged) |
| iPhone / Samsung Internet layout | **not tested** |

## Remaining configuration
- Deploy to staging (owner approval) so the app stops showing Google/Apple.
- Google Cloud Console: the consent screen shows "metadeals4u.in", so the OAuth client is the production domain's; for staging the authorised redirect URI must be `https://staging.metadeals4u.in/api/auth/callback/google` (check it in the console; not changed or verified here).
- Rebuild the app only if app files change; the app needs no change for this fix.
