"use strict";

const { startPkceLoopback } = require("../pkce-flow.cjs");
const { createEncryptedStore } = require("../encrypted-store.cjs");
const { syncAuthVar } = require("../auth-file-sync.cjs");

// Google OAuth 2.0 Desktop PKCE client
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "884354919052-36trc1jjb3tguiac32ov6cod268c5blh.apps.googleusercontent.com";
const GOOGLE_SCOPES = [
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
];

function validateAntigravityState(state) {
	if (!state || typeof state !== "object") return { accounts: [], activeAccountId: null };
	const accounts = Array.isArray(state.accounts) ? state.accounts : [];
	return {
		accounts: accounts.filter((a) => a && typeof a.id === "string" && typeof a.accessToken === "string"),
		activeAccountId: typeof state.activeAccountId === "string" ? state.activeAccountId : null,
	};
}

function createAntigravityProvider({ storeFile, authFile, safeStorage, openExternal = async () => {}, fetch = globalThis.fetch, onChange = () => {} }) {
	const store = createEncryptedStore(storeFile, safeStorage, validateAntigravityState);
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
			providerId: "google-antigravity",
			available: true,
			supported: true,
			pending: !!pending,
			devicePrompt: null,
			activeAccountId: state.activeAccountId,
			accounts: state.accounts.map((a) => ({
				id: a.id,
				providerId: "google-antigravity",
				email: a.email,
				displayName: a.displayName || a.email || "Google Account",
				connected: true,
				expiresAt: a.expiresAt || null,
			})),
			error: lastError,
		};
	}

	async function login() {
		if (pending) throw new Error("Google Antigravity sign-in is already in progress.");
		lastError = null;
		const abortController = new AbortController();
		pending = abortController;
		onChange();

		try {
			const { code, verifier, redirectUri } = await startPkceLoopback({
				authorizeEndpoint: GOOGLE_AUTH_URL,
				clientId: GOOGLE_CLIENT_ID,
				scopes: GOOGLE_SCOPES,
				extraParams: {
					access_type: "offline",
					prompt: "consent",
				},
				openExternal,
				timeoutMs: 180000,
				signal: abortController.signal,
			});

			const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					client_id: GOOGLE_CLIENT_ID,
					code,
					code_verifier: verifier,
					redirect_uri: redirectUri,
					grant_type: "authorization_code",
				}).toString(),
				signal: abortController.signal,
			});

			if (!tokenRes.ok) {
				const errBody = await tokenRes.json().catch(() => ({}));
				throw new Error(errBody.error_description || `Google token exchange failed (${tokenRes.status})`);
			}

			const tokenData = await tokenRes.json();
			const accessToken = tokenData.access_token;
			if (!accessToken) throw new Error("No access token returned from Google.");

			// Fetch user info for account display
			let email = "";
			try {
				const uRes = await fetch(GOOGLE_USERINFO_URL, {
					headers: { Authorization: `Bearer ${accessToken}` },
					signal: abortController.signal,
				});
				if (uRes.ok) {
					const uData = await uRes.json();
					email = uData.email || "";
				}
			} catch {}

			const accountId = email ? `google_${email.replace(/[^a-zA-Z0-9]/g, "_")}` : "google_antigravity";
			const account = {
				id: accountId,
				email,
				displayName: email || "Google Antigravity Account",
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

			// Synchronize into auth.json and process.env so Gemini models immediately run
			syncAuthVar(authFile, "GEMINI_API_KEY", accessToken);

			pending = null;
			lastError = null;
			onChange();
			return await status();
		} catch (err) {
			pending = null;
			if (!abortController.signal.aborted) {
				lastError = err.message || "Google Antigravity sign-in failed.";
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
		syncAuthVar(authFile, "GEMINI_API_KEY", null);
		onChange();
		return await status();
	}

	return {
		id: "google-antigravity",
		status,
		login,
		cancel,
		disconnect,
	};
}

module.exports = { createAntigravityProvider };
