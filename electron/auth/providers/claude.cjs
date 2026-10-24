"use strict";

const { startPkceLoopback } = require("../pkce-flow.cjs");
const { createEncryptedStore } = require("../encrypted-store.cjs");
const { syncAuthVar } = require("../auth-file-sync.cjs");

const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const CLAUDE_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const CLAUDE_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLAUDE_SCOPES = [
	"org:create_api_key",
	"user:profile",
	"user:inference",
	"user:sessions:claude_code",
	"user:mcp_servers",
	"user:file_upload",
];

function validateClaudeState(state) {
	if (!state || typeof state !== "object") return { accounts: [], activeAccountId: null };
	const accounts = Array.isArray(state.accounts) ? state.accounts : [];
	return {
		accounts: accounts.filter((a) => a && typeof a.id === "string" && typeof a.accessToken === "string"),
		activeAccountId: typeof state.activeAccountId === "string" ? state.activeAccountId : null,
	};
}

function createClaudeProvider({ storeFile, authFile, safeStorage, openExternal = async () => {}, fetch = globalThis.fetch, onChange = () => {} }) {
	const store = createEncryptedStore(storeFile, safeStorage, validateClaudeState);
	let pending = null;
	let lastError = null;

	async function getStoreState() {
		try {
			const s = await store.read();
			return s || { accounts: [], activeAccountId: null };
		} catch {
			return { accounts: [], activeAccountId: null };
		}
	}

	async function status() {
		const state = await getStoreState();
		return {
			providerId: "claude",
			available: true,
			supported: true,
			pending: !!pending,
			devicePrompt: null,
			activeAccountId: state.activeAccountId,
			accounts: state.accounts.map((a) => ({
				id: a.id,
				providerId: "claude",
				email: a.email,
				displayName: a.displayName || a.email || "Claude Pro Account",
				connected: true,
				expiresAt: a.expiresAt || null,
			})),
			error: lastError,
		};
	}

	async function login() {
		if (pending) throw new Error("Claude sign-in is already in progress.");
		lastError = null;
		const abortController = new AbortController();
		pending = abortController;
		onChange();

		try {
			const { code, verifier, redirectUri } = await startPkceLoopback({
				authorizeEndpoint: CLAUDE_AUTHORIZE_URL,
				clientId: CLAUDE_CLIENT_ID,
				scopes: CLAUDE_SCOPES,
				openExternal,
				timeoutMs: 180000,
				signal: abortController.signal,
			});

			const tokenRes = await fetch(CLAUDE_TOKEN_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json",
				},
				body: new URLSearchParams({
					grant_type: "authorization_code",
					client_id: CLAUDE_CLIENT_ID,
					code,
					code_verifier: verifier,
					redirect_uri: redirectUri,
				}).toString(),
				signal: abortController.signal,
			});

			if (!tokenRes.ok) {
				const errText = await tokenRes.text().catch(() => "");
				throw new Error(`Claude token exchange failed (${tokenRes.status}): ${errText}`);
			}

			const tokenData = await tokenRes.json();
			const accessToken = tokenData.access_token;
			if (!accessToken) throw new Error("No access token returned from Claude.");

			const accountId = "claude_pro";
			const account = {
				id: accountId,
				displayName: "Claude Pro / Subscription",
				accessToken,
				refreshToken: tokenData.refresh_token || null,
				expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
			};

			const current = await getStoreState();
			const next = {
				accounts: current.accounts.filter((a) => a.id !== accountId).concat(account),
				activeAccountId: accountId,
			};
			await store.write(next);

			// Synchronize token into auth.json and process.env so Anthropic models immediately work
			syncAuthVar(authFile, "ANTHROPIC_OAUTH_TOKEN", accessToken);

			pending = null;
			lastError = null;
			onChange();
			return await status();
		} catch (err) {
			pending = null;
			if (!abortController.signal.aborted) {
				lastError = err.message || "Claude sign-in failed.";
			}
			onChange();
			throw err;
		}
	}

	async function cancel() {
		if (pending) {
			pending.abort();
			pending = null;
			lastError = "Sign-in cancelled.";
			onChange();
		}
		return await status();
	}

	async function disconnect(accountId) {
		const current = await getStoreState();
		const next = {
			accounts: current.accounts.filter((a) => a.id !== accountId),
			activeAccountId: current.activeAccountId === accountId ? null : current.activeAccountId,
		};
		await store.write(next);
		syncAuthVar(authFile, "ANTHROPIC_OAUTH_TOKEN", null);
		onChange();
		return await status();
	}

	return {
		id: "claude",
		status,
		login,
		cancel,
		disconnect,
	};
}

module.exports = { createClaudeProvider };
