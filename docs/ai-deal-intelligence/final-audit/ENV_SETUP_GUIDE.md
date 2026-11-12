# Environment Setup Guide — MetaDeals4U

This step-by-step guide explains how to generate, configure, and register every environment variable for the MetaDeals4U application.

---

## 1. Core Secrets Generation

In your PowerShell terminal, generate strong cryptographic secrets for session encryption and CSRF security:

```powershell
# Generate NEXTAUTH_SECRET (32 bytes base64)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

# Generate AUTH_SESSION_SECRET (32 bytes hex)
-join ((1..32 | ForEach-Object { "{0:x2}" -f (Get-Random -Minimum 0 -Maximum 256) }))
```

Place these into `.env`:
```env
NEXTAUTH_URL=http://localhost:4123
NEXTAUTH_SECRET=<generated_base64_secret>
AUTH_SESSION_SECRET=<generated_hex_secret>
```

---

## 2. OpenRouter API Configuration

1. Visit [OpenRouter Keys](https://openrouter.ai/settings/keys) and create a key.
2. In `.env`, add:
   ```env
   OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxx
   OPENROUTER_DEFAULT_MODEL=meta-llama/llama-3.1-8b-instruct
   OPENROUTER_MATCH_MODEL=deepseek/deepseek-chat
   OPENROUTER_ENABLED=true
   ```

---

## 3. Email Delivery (Live OTP for Signup/Reset)

Currently, `EMAIL_PROVIDER=local-preview` is active, which outputs OTP codes to the local outbox/console for security testing. To send real emails:
1. Sign up at [Resend](https://resend.com/).
2. Create an API Key in the Resend dashboard.
3. Verify your domain (e.g. `metadeals4u.com`) in Resend DNS settings.
4. Update `.env`:
   ```env
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   EMAIL_FROM=MetaDeals4U <auth@metadeals4u.com>
   ```

---

## 4. Telegram Bot Configuration (Agent 1 Alerts & Approval)

1. Open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot` and follow instructions to get the **HTTP API Bot Token**.
3. Create a private channel or group for deal notifications and add your bot as an Administrator.
4. Retrieve the chat ID (e.g. using [@userinfobot](https://t.me/userinfobot) or checking updates via `https://api.telegram.org/bot<TOKEN>/getUpdates`).
5. Update `.env`:
   ```env
   TELEGRAM_MOCK=false
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
   TELEGRAM_CHAT_ID=-100xxxxxxxxxx
   ```

---

## 5. Cuelinks Affiliate Integration (Live Link Conversion)

1. Sign up or log into [Cuelinks Publisher Portal](https://www.cuelinks.com/).
2. Navigate to **Account Settings > API Credentials** to retrieve your API token and Channel ID.
3. Update `.env`:
   ```env
   CUELINKS_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   CUELINKS_CAMPAIGN_ID=12345
   CUELINKS_CHANNEL_ID=67890
   ```

