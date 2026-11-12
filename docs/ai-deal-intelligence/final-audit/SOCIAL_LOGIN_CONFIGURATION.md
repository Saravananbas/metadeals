# Social Login Configuration & Verification

**Audit Date**: November 8, 2026  
**Implementation Source**: `src/server/customer/options.ts` & `src/features/customer/CustomerAccount.tsx`

---

## 1. Summary of Social Providers in NextAuth

In MetaDeals4U, customer social authentication is handled via NextAuth. Providers are dynamically registered in `customerProviders()` (`src/server/customer/options.ts`). If a provider's credentials are not present in `.env`, the provider is **not registered**, and the corresponding button in the UI is rendered disabled with the message:
> *"Unavailable sign-in options are awaiting provider setup."*

Below are the exact requirements for enabling each provider.

---

## 2. Provider Breakdown

### 2.1 Google OAuth 2.0
- **Provider ID**: `google`
- **Required Env Variables**:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
- **Authorized JavaScript Origins**:
  - `http://localhost:4123` (Development)
  - `https://metadeals4u.com` (Production)
- **Authorized Redirect URIs (Exact)**:
  - `http://localhost:4123/api/auth/callback/google` (Development)
  - `https://metadeals4u.com/api/auth/callback/google` (Production)
- **Setup Portal**: [Google Cloud Console > Credentials](https://console.cloud.google.com/apis/credentials)

---

### 2.2 Microsoft Account (Azure AD)
- **Provider ID**: `azure-ad`
- **Required Env Variables**:
  - `AZURE_AD_CLIENT_ID`
  - `AZURE_AD_CLIENT_SECRET`
  - `AZURE_AD_TENANT_ID` (Defaults to `common` if supporting personal accounts)
- **Authorized Redirect URIs (Exact)**:
  - `http://localhost:4123/api/auth/callback/azure-ad`
  - `https://metadeals4u.com/api/auth/callback/azure-ad`
- **Setup Portal**: [Azure Active Directory > App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)

---

### 2.3 Facebook Login
- **Provider ID**: `facebook`
- **Required Env Variables**:
  - `FACEBOOK_CLIENT_ID`
  - `FACEBOOK_CLIENT_SECRET`
- **Valid OAuth Redirect URIs (Exact)**:
  - `http://localhost:4123/api/auth/callback/facebook`
  - `https://metadeals4u.com/api/auth/callback/facebook`
- **Setup Portal**: [Meta for Developers > Facebook Login > Settings](https://developers.facebook.com/apps/)

---

### 2.4 Apple Sign In
- **Provider ID**: `apple`
- **Required Env Variables**:
  - `APPLE_CLIENT_ID` (Service ID, e.g. `com.metadeals4u.service`)
  - `APPLE_CLIENT_SECRET` (A signed JWT with 6-month max validity)
- **Special Requirements**:
  1. **Strict HTTPS Requirement**: `customerProviders()` explicitly requires `NEXTAUTH_URL` to begin with `https://` before initializing Apple provider, because Apple OAuth rejects HTTP loopback callbacks.
  2. **Client Secret Generation**: Apple does not provide a static secret string. You must generate a JWT signed using an ES256 key (`.p8` file downloaded from Apple Developer) containing:
     - `iss`: Apple Team ID
     - `iat`: Issue timestamp
     - `exp`: Expiration timestamp (max 180 days)
     - `aud`: `https://appleid.apple.com`
     - `sub`: Your `APPLE_CLIENT_ID`
- **Return URL (Exact)**:
  - `https://metadeals4u.com/api/auth/callback/apple`
- **Setup Portal**: [Apple Developer Member Center](https://developer.apple.com/account/resources/identifiers/list/serviceId)

