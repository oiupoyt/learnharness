"use strict";

const { initiateDeviceFlow, pollDeviceToken } = require("../device-code-flow.cjs");
const { createEncryptedStore } = require("../encrypted-store.cjs");
const { syncAuthVar } = require("../auth-file-sync.cjs");

const XAI_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828";
const XAI_DEVICE_CODE_URL = "https://auth.x.ai/oauth2/device/code";
const XAI_TOKEN_URL = "https://auth.x.ai/oauth2/token";
const XAI_SCOPE = "openid profile email offline_access grok-cli:access api:access";

function validateGrokState(state) {
	if (!state || typeof state !== "object") return { accounts: [], activeAccountId: null };
	const accounts = Array.isArray(state.accounts) ? state.accounts : [];
	return {
		accounts: accounts.filter((a) => a && typeof a.id === "string" && typeof a.accessToken === "string"),
		activeAccountId: typeof state.activeAccountId === "string" ? state.activeAccountId : null,
	};
}

function createGrokProvider({ storeFile, authFile, safeStorage, openExternal = async () => {}, fetch = globalThis.fetch, onChange = () => {} }) {
	const store = createEncryptedStore(storeFile, safeStorage, validateGrokState);
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
			providerId: "grok",
			available: true,
			supported: true,
			pending: !!pending,
			devicePrompt,
			activeAccountId: state.activeAccountId,
			accounts: state.accounts.map((a) => ({
				id: a.id,
				providerId: "grok",
				displayName: a.displayName || "Grok Premium Account",
				connected: true,
				expiresAt: a.expiresAt || null,
			})),
			error: lastError,
		};
	}

	async function login() {
		if (pending) throw new Error("Grok sign-in is already in progress.");
		lastError = null;
		const abortController = new AbortController();

		try {
			const device = await initiateDeviceFlow({
				clientId: XAI_CLIENT_ID,
				scope: XAI_SCOPE,
				endpoint: XAI_DEVICE_CODE_URL,
				fetch,
				signal: abortController.signal,
			});

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
				clientId: XAI_CLIENT_ID,
				deviceCode: device.deviceCode,
				endpoint: XAI_TOKEN_URL,
				interval: device.interval,
				expiresIn: device.expiresIn,
				fetch,
				signal: abortController.signal,
			})
				.then(async (tokenData) => {
					const accountId = "grok_premium";
					const account = {
						id: accountId,
						displayName: "Grok / X Premium",
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

					// Sync to auth.json and process.env so xAI models immediately work
					syncAuthVar(authFile, "XAI_API_KEY", tokenData.accessToken);

					pending = null;
					devicePrompt = null;
					lastError = null;
					onChange();
				})
				.catch((err) => {
					if (!abortController.signal.aborted) {
						lastError = err.message || "Grok sign-in failed.";
						pending = null;
						devicePrompt = null;
						onChange();
					}
				});

			return await status();
		} catch (err) {
			pending = null;
			devicePrompt = null;
			lastError = err.message || "Failed to start Grok device flow.";
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
		syncAuthVar(authFile, "XAI_API_KEY", null);
		onChange();
		return await status();
	}

	return {
		id: "grok",
		status,
		login,
		cancel,
		disconnect,
	};
}

module.exports = { createGrokProvider };
