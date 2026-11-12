# Environment Variable Registry — MetaDeals4U Platform

**File Location**: `docs/ai-deal-intelligence/final-audit/ENVIRONMENT_VARIABLE_REGISTRY.md`  
**Audit Date**: November 8, 2026  
**Note**: Never store raw credentials or secrets in this document. Only variable keys and metadata are cataloged.

---

## Registry Matrix

| Group | Variable Name | Required? | Current Status in `.env` | Purpose & Module | Official Provider Portal URL |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Database** | `POSTGRES_HOST` | Yes | Configured | PostgreSQL Host (`src/server/db/client.ts`) | Self-hosted / Managed Cloud |
| **Database** | `POSTGRES_PORT` | Yes | Configured | PostgreSQL Port (55432) | Self-hosted / Managed Cloud |
| **Database** | `POSTGRES_DB` | Yes | Configured | PostgreSQL Database Name | Self-hosted / Managed Cloud |
| **Database** | `POSTGRES_USER` | Yes | Configured | PostgreSQL User | Self-hosted / Managed Cloud |
| **Database** | `POSTGRES_PASSWORD` | Yes | Configured | PostgreSQL Password | Self-hosted / Managed Cloud |
| **Database** | `POSTGRES_SSL` | No | Configured (`false`) | SSL Connection toggle | Self-hosted / Managed Cloud |
| **Cache & Queue** | `REDIS_HOST` | Yes | Configured | Redis host (`src/server/cache/redis.ts`) | Self-hosted / Redis Cloud |
| **Cache & Queue** | `REDIS_PORT` | Yes | Configured | Redis port (6380) | Self-hosted / Redis Cloud |
| **Cache & Queue** | `REDIS_PASSWORD` | No | Empty | Optional Redis password | Self-hosted / Redis Cloud |
| **Cache & Queue** | `REDIS_DB` | No | Configured (`0`) | Redis database index | Self-hosted / Redis Cloud |
| **Admin & NextAuth** | `NEXTAUTH_URL` | Yes | Configured (`http://localhost:4123`) | Base URL for OAuth callbacks | Framework Setting |
| **Admin & NextAuth** | `NEXTAUTH_SECRET` | Yes | Configured | NextAuth encryption secret | Generate via `openssl rand -base64 32` |
| **Admin & NextAuth** | `AUTH_SESSION_SECRET` | Yes | Configured | Admin MFA & session HMAC pepper | Generate via `openssl rand -hex 32` |
| **Social Login (Google)** | `GOOGLE_CLIENT_ID` | Optional | Not Configured | Customer Google OAuth Login | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| **Social Login (Google)** | `GOOGLE_CLIENT_SECRET`| Optional | Not Configured | Customer Google OAuth Secret | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) |
| **Social Login (Microsoft)**| `AZURE_AD_CLIENT_ID` | Optional | Not Configured | Customer Microsoft Account Login | [Azure Portal App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) |
| **Social Login (Microsoft)**| `AZURE_AD_CLIENT_SECRET`| Optional | Not Configured | Customer Microsoft Account Secret | [Azure Portal App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) |
| **Social Login (Microsoft)**| `AZURE_AD_TENANT_ID` | Optional | Not Configured | Microsoft Tenant ID (`common` or specific) | [Azure Portal](https://portal.azure.com/) |
| **Social Login (Facebook)** | `FACEBOOK_CLIENT_ID` | Optional | Not Configured | Customer Facebook Login | [Meta for Developers](https://developers.facebook.com/apps/) |
| **Social Login (Facebook)** | `FACEBOOK_CLIENT_SECRET`| Optional| Not Configured | Customer Facebook Secret | [Meta for Developers](https://developers.facebook.com/apps/) |
| **Social Login (Apple)** | `APPLE_CLIENT_ID` | Optional | Not Configured | Customer Apple ID Service Identifier | [Apple Developer Member Center](https://developer.apple.com/account/resources/identifiers/list/serviceId) |
| **Social Login (Apple)** | `APPLE_CLIENT_SECRET` | Optional | Not Configured | Generated ES256 Signed JWT Secret | [Apple Developer Keys](https://developer.apple.com/account/resources/authkeys/list) |
| **Email (OTP / Reset)** | `EMAIL_PROVIDER` | Optional | Configured (`local-preview`) | Email provider (`resend`, `sendgrid`, `local-preview`) | Provider Setting |
| **Email (OTP / Reset)** | `RESEND_API_KEY` | Optional | Not Configured | Resend API Key for sending live OTPs | [Resend Console](https://resend.com/api-keys) |
| **Email (OTP / Reset)** | `EMAIL_FROM` | Optional | Not Configured | Verified sender email address | Resend / Custom Domain DNS |
| **AI Gateway** | `OPENROUTER_API_KEY` | Proposed | Not Configured | Centralized LLM Gateway Key | [OpenRouter Keys](https://openrouter.ai/settings/keys) |
| **AI Gateway** | `OPENROUTER_DEFAULT_MODEL`| Proposed| Not Configured | Default model ID for extraction | OpenRouter Models |
| **Telegram Bot** | `TELEGRAM_BOT_TOKEN` | Optional | Configured (`mock_bot_token`) | Bot token for Agent 1 alerts & callbacks | Telegram [@BotFather](https://t.me/BotFather) |
| **Telegram Bot** | `TELEGRAM_CHAT_ID` | Optional | Configured (`@mock_deals_channel`)| Channel/Chat ID for approval alerts | Telegram Group/Channel Details |
| **Telegram Bot** | `TELEGRAM_MOCK` | Optional | Configured (`true`) | Set to `false` for live Telegram delivery | System Toggle |
| **Affiliate (Cuelinks)**| `CUELINKS_API_KEY` | Optional | Configured (Mock) | Cuelinks V3 API access | [Cuelinks Merchant Portal](https://www.cuelinks.com/) |
| **Affiliate (Cuelinks)**| `CUELINKS_CAMPAIGN_ID` | Optional | Configured (Mock) | Default publisher campaign ID | Cuelinks Dashboard |
| **Affiliate (Cuelinks)**| `CUELINKS_CHANNEL_ID` | Optional | Configured (Mock) | Sub-channel ID for conversion tagging | Cuelinks Dashboard |

