# OAuth & Provider Authentication Architecture

LearnHarness supports multi-provider authentication for models and tools through two primary methods:
1. **Bring Your Own Key (BYOK)**: Stored in `auth.json` (mode 0600) or injected via `.env.local`.
2. **Official Public-Client OAuth**: Encrypted using OS-level secure storage (`safeStorage` via GNOME Keyring / KWallet / Keychain / DPAPI).

Per engineering policy, LearnHarness uses **only official public-client OAuth and device-code flows**. It stores tokens in encrypted safeStorage envelopes and seamlessly federates them into the server model engine without requiring manual copy-pasting.

---

## Provider Support Matrix

| Provider | Status | Flow Type | Endpoint / Method | Notes & Engine Binding |
| :--- | :--- | :--- | :--- | :--- |
| **ChatGPT (Codex)** | **Supported** | OAuth 2.0 PKCE Loopback | `https://auth.openai.com/api/accounts/authorize` | Dynamic loopback listener on `http://127.0.0.1:<ephemeral-port>/auth/callback`. Stores encrypted tokens in `userData/chatgpt-credentials.enc.json`. |
| **GitHub Copilot** | **Supported** | RFC 8628 Device Code | `https://github.com/login/device/code` | Prompts user with 8-character verification code to enter on `https://github.com/login/device`. Automatically exchanges for a Copilot session token and reflects `COPILOT_GITHUB_TOKEN` to `auth.json` and the model catalog. |
| **Claude (Anthropic)** | **Supported** | OAuth 2.0 PKCE Loopback | `https://claude.ai/oauth/authorize` | Ephemeral loopback listener. Uses official Anthropic OAuth scopes (`org:create_api_key user:profile user:inference user:sessions:claude_code`). Reflects `ANTHROPIC_OAUTH_TOKEN` to `auth.json`. |
| **Google Antigravity** | **Supported** | Device Code / PKCE | `https://oauth2.googleapis.com/device/code` | Device Code flow with Google Cloud & Antigravity scopes (`cloud-platform`, `userinfo.email`). Reflects token to `GEMINI_API_KEY` in `auth.json`. |
| **Grok (xAI)** | **Supported** | RFC 8628 Device Code | `https://auth.x.ai/oauth2/device/code` | Device Authorization Flow for xAI / Grok CLI with `grok-cli:access api:access` scopes. Reflects token to `XAI_API_KEY` in `auth.json`. |

---

## Technical Details

### 1. Security & Storage
- Raw OAuth tokens and client secrets **never enter the UI renderer process** or chat records.
- All tokens are stored in encrypted JSON envelopes via Electron's `safeStorage`:
  - `chatgpt-credentials.enc.json`
  - `github-credentials.enc.json`
  - `claude-credentials.enc.json`
  - `antigravity-credentials.enc.json`
  - `grok-credentials.enc.json`
- Storage fails closed: if OS secure storage (`safeStorage.isEncryptionAvailable()`) is unavailable, credentials are never written to disk in plaintext.

### 2. Engine Seam & Live Model Discovery
- When an OAuth account connects, `auth-file-sync.cjs` safely synchronizes the token into `userData/auth.json` and the running server environment (`process.env`).
- `src/server/model-catalog.ts` immediately detects the connected provider:
  - `github-copilot` models (`gpt-5.3-codex`, `claude-sonnet-5.5`, `claude-opus-5.5`, `gemini-3.8-flash`, etc.)
  - `anthropic` models (`claude-sonnet-4-6`, `claude-opus-4-8`, etc.)
  - `google` Gemini models
  - `xai` Grok models
  - `chatgpt` subscription models
  All become live and selectable in the model picker without requiring an application restart.
- Disconnecting an account removes the token from both the encrypted store and `auth.json`.

### 3. Development Launcher (`learnharness-dev`)
To test authentication flows without touching production configuration:
```bash
learnharness-dev              # Starts desktop app in dev mode with isolated state
learnharness-dev --web        # Starts web dev server only
learnharness-dev --clean      # Cleans .dev-state before launching
```
- Development state is kept strictly inside `.dev-state/` (git-ignored).
- Production state in `~/.config/LearnHarness` remains untouched.
