"use strict";

const { initiateDeviceFlow, pollDeviceToken } = require("../device-code-flow.cjs");
const { startPkceLoopback } = require("../pkce-flow.cjs");
const { createEncryptedStore } = require("../encrypted-store.cjs");
const { syncAuthVar } = require("../auth-file-sync.cjs");

// Standard Google Cloud / OAuth client for developer workstation CLI
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/auth";
const GOOGLE_DEVICE_CODE_URL = "https://oauth2.googleapis.com/device/code";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || "636973214072-tfl8s1aeq0e1o5f9aae9v0v0s57e1u1e.apps.googleusercontent.com";
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
	let devicePrompt = null;

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
			devicePrompt,
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

		try {
			// Try Device Code flow first
			let device;
			try {
				device = await initiateDeviceFlow({
					clientId: GOOGLE_CLIENT_ID,
					scope: GOOGLE_SCOPES.join(" "),
					endpoint: GOOGLE_DEVICE_CODE_URL,
					fetch,
					signal: abortController.signal,
				});
			} catch (err) {
				// Fallback to PKCE loopback if device code is not supported by the client ID
				const { code, verifier, redirectUri } = await startPkceLoopback({
					authorizeEndpoint: GOOGLE_AUTH_URL,
					clientId: GOOGLE_CLIENT_ID,
					scopes: GOOGLE_SCOPES,
					openExternal,
					timeoutMs: 180000,
					signal: abortController.signal,
				});

				const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
					method: "POST",
					headers: { "Content-Type": "application/x-www-form-urlencoded" },
					body: new URLSearchParams({
						client_id: GOOGLE_CLIENT_ID,
						code,
						code_verifier: verifier,
						redirect_uri: redirectUri,
						grant_type: "authorization_code",
					}).toString(),
					signal: abortController.signal,
				});

				const tokenData = await tokenRes.json();
				if (!tokenData.access_token) throw new Error("Google OAuth did not return an access token.");

				const accountId = "google_account";
				const account = {
					id: accountId,
					displayName: "Google Account",
					accessToken: tokenData.access_token,
					refreshToken: tokenData.refresh_token || null,
					expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : null,
				};

				const current = await getStoreState();
				const next = {
					accounts: current.accounts.filter((a) => a.id !== accountId).concat(account),
					activeAccountId: accountId,
				};
				await store.write(next);
				syncAuthVar(authFile, "GEMINI_API_KEY", tokenData.access_token);

				pending = null;
				onChange();
				return await status();
			}

			devicePrompt = {
				userCode: device.userCode,
				verificationUri: device.verificationUri,
				expiresIn: device.expiresIn,
			};
			pending = abortController;
			onChange();

			if (device.verificationUriComplete) {
				openExternal(device.verificationUriComplete).catch(() => {});
			} else {
				openExternal(device.verificationUri).catch(() => {});
			}

			pollDeviceToken({
				clientId: GOOGLE_CLIENT_ID,
				deviceCode: device.deviceCode,
				endpoint: GOOGLE_TOKEN_URL,
				interval: device.interval,
				expiresIn: device.expiresIn,
				fetch,
				signal: abortController.signal,
			})
				.then(async (tokenData) => {
					const accountId = "google_account";
					const account = {
						id: accountId,
						displayName: "Google Account",
						accessToken: tokenData.accessToken,
						refreshToken: tokenData.refreshToken || null,
						expiresAt: tokenData.expiresIn ? Date.now() + tokenData.expiresIn * 1000 : null,
					};

					const current = await getStoreState();
					const next = {
						accounts: current.accounts.filter((a) => a.id !== accountId).concat(account),
						activeAccountId: accountId,
					};
					await store.write(next);

					syncAuthVar(authFile, "GEMINI_API_KEY", tokenData.accessToken);

					pending = null;
					devicePrompt = null;
					lastError = null;
					onChange();
				})
				.catch((err) => {
					if (!abortController.signal.aborted) {
						lastError = err.message || "Google sign-in failed.";
						pending = null;
						devicePrompt = null;
						onChange();
					}
				});

			return await status();
		} catch (err) {
			pending = null;
			devicePrompt = null;
			lastError = err.message || "Failed to start Google sign-in flow.";
			onChange();
			throw err;
		}
	}

	async function cancel() {
		if (pending) {
			pending.abort();
			pending = null;
			devicePrompt = null;
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
