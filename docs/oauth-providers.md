# OAuth & Provider Authentication Architecture

LearnHarness supports multi-provider authentication for models and tools through two primary methods:
1. **Bring Your Own Key (BYOK)**: Stored in `auth.json` (mode 0600) or injected via `.env.local`.
2. **Official Public-Client OAuth**: Encrypted using OS-level secure storage (`safeStorage` via GNOME Keyring / KWallet / Keychain / DPAPI).

Per engineering policy, LearnHarness uses **only official, documented public-client OAuth and device-code flows**. It never scrapes consumer web interfaces, reverse-engineers private endpoints, or captures session cookies.

---

## Provider Status & Support Matrix

| Provider | Status | Flow Type | Endpoint / Method | Notes & Configuration |
| :--- | :--- | :--- | :--- | :--- |
| **ChatGPT (Codex)** | **Supported** | OAuth 2.0 PKCE Loopback | `https://auth.openai.com/api/accounts/authorize` | Dynamic loopback listener on `http://127.0.0.1:<ephemeral-port>/auth/callback`. Stores encrypted tokens in `userData/chatgpt-credentials.enc.json`. |
| **GitHub Copilot** | **Supported** | RFC 8628 Device Code | `https://github.com/login/device/code` | Device Authorization Flow. Prompts user with 8-character code to enter on `https://github.com/login/device`. Stores encrypted tokens in `userData/github-credentials.enc.json`. |
| **Claude (Anthropic)** | **Unsupported (Blocked)** | N/A (API Key required) | `https://console.anthropic.com` | Anthropic does not provide a public third-party OAuth 2.0 authorization server for consumer Claude Pro accounts. Users must configure `ANTHROPIC_API_KEY`. |
| **Google Antigravity** | **Unsupported (Blocked)** | N/A (API Key required) | `https://ai.google.dev` | Google Antigravity is an internal developer agent tool (`agy`), not a public third-party OAuth provider. For Google models, configure `GEMINI_API_KEY` in Keys. |
| **Grok (xAI)** | **Unsupported (Blocked)** | N/A (API Key required) | `https://console.x.ai` | xAI does not offer an official third-party OAuth flow for consumer X / Grok Premium subscriptions. Access requires `XAI_API_KEY`. |

---

## Technical Details

### 1. Security & Storage
- Raw OAuth tokens and client secrets **never enter the UI renderer process** or chat records.
- All tokens are stored in encrypted JSON envelopes via Electron's `safeStorage`:
  - `chatgpt-credentials.enc.json`
  - `github-credentials.enc.json`
- Storage fails closed: if OS secure storage (`safeStorage.isEncryptionAvailable()`) is unavailable, credentials are never written to disk in plaintext.

### 2. Device Code Flow (GitHub Copilot)
- **Device Authorization Request**: POST to `https://github.com/login/device/code` requesting `read:user` scope.
- **Verification UI**: Presents `user_code` and opens `https://github.com/login/device`.
- **Token Polling**: Polls `https://github.com/login/oauth/access_token` respecting `interval` and `slow_down` instructions.
- **Revocation / Disconnect**: Immediately purges stored tokens from disk and wipes runtime memory.

### 3. Development Launcher (`learnharness-dev`)
To test authentication flows without touching production configuration:
```bash
learnharness-dev              # Starts desktop app in dev mode with isolated state
learnharness-dev --web        # Starts web dev server only
learnharness-dev --clean      # Cleans .dev-state before launching
```
- Development state is kept strictly inside `.dev-state/` (git-ignored).
- Production state in `~/.config/LearnHarness` remains untouched.
