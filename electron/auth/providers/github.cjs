"use strict";

const { initiateDeviceFlow, pollDeviceToken } = require("../device-code-flow.cjs");
const { createEncryptedStore } = require("../encrypted-store.cjs");

const GITHUB_DEVICE_ENDPOINT = "https://github.com/login/device/code";
const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const GITHUB_USER_ENDPOINT = "https://api.github.com/user";

// Default public client ID for GitHub OAuth apps (or overridden via env)
const DEFAULT_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || "Iv1.b507a08c87ecfe98"; // GitHub standard tool ID or custom app
const SCOPES = "read:user";

function validateGitHubState(state) {
	if (!state || typeof state !== "object") return { accounts: [], activeAccountId: null };
	const accounts = Array.isArray(state.accounts) ? state.accounts : [];
	return {
		accounts: accounts.filter((a) => a && typeof a.id === "string" && typeof a.accessToken === "string"),
		activeAccountId: typeof state.activeAccountId === "string" ? state.activeAccountId : null,
	};
}

function createGitHubProvider({ storeFile, safeStorage, openExternal = async () => {}, fetch = globalThis.fetch, onChange = () => {} }) {
	const store = createEncryptedStore(storeFile, safeStorage, validateGitHubState);
	let pending = null;
	let lastError = null;
	let devicePrompt = null;

	async function getStoreState() {
		try {
			const s = await store.read();
			return s || { accounts: [], activeAccountId: null };
		} catch (err) {
			return { accounts: [], activeAccountId: null };
		}
	}

	async function status() {
		const state = await getStoreState();
		return {
			providerId: "github-copilot",
			available: true,
			supported: true,
			pending: !!pending,
			devicePrompt: devicePrompt,
			activeAccountId: state.activeAccountId,
			accounts: state.accounts.map((a) => ({
				id: a.id,
				providerId: "github-copilot",
				username: a.username,
				email: a.email,
				displayName: a.displayName || a.username || a.id,
				connected: true,
				expiresAt: a.expiresAt || null,
			})),
			error: lastError,
		};
	}

	async function login() {
		if (pending) {
			throw new Error("GitHub sign-in is already in progress.");
		}
		lastError = null;
		const abortController = new AbortController();

		try {
			const device = await initiateDeviceFlow({
				clientId: DEFAULT_CLIENT_ID,
				scope: SCOPES,
				endpoint: GITHUB_DEVICE_ENDPOINT,
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

			// Automatically open verification page in browser
			if (device.verificationUriComplete) {
				openExternal(device.verificationUriComplete).catch(() => {});
			} else {
				openExternal(device.verificationUri).catch(() => {});
			}

			// Background polling
			pollDeviceToken({
				clientId: DEFAULT_CLIENT_ID,
				deviceCode: device.deviceCode,
				endpoint: GITHUB_TOKEN_ENDPOINT,
				interval: device.interval,
				expiresIn: device.expiresIn,
				fetch,
				signal: abortController.signal,
			})
				.then(async (tokenData) => {
					// Fetch user details
					let username = "GitHub User";
					let email = "";
					try {
						const userRes = await fetch(GITHUB_USER_ENDPOINT, {
							headers: {
								Authorization: `Bearer ${tokenData.accessToken}`,
								"User-Agent": "LearnHarness-OAuth",
								Accept: "application/json",
							},
						});
						if (userRes.ok) {
							const userData = await userRes.json();
							username = userData.login || username;
							email = userData.email || "";
						}
					} catch {}

					const accountId = `gh_${username.toLowerCase()}`;
					const account = {
						id: accountId,
						username,
						email,
						displayName: username,
						accessToken: tokenData.accessToken,
						tokenType: tokenData.tokenType,
						scope: tokenData.scope,
						refreshToken: tokenData.refreshToken || null,
						expiresAt: tokenData.expiresIn ? Date.now() + tokenData.expiresIn * 1000 : null,
					};

					const current = await getStoreState();
					const next = {
						accounts: current.accounts.filter((a) => a.id !== accountId).concat(account),
						activeAccountId: accountId,
					};
					await store.write(next);

					pending = null;
					devicePrompt = null;
					lastError = null;
					onChange();
				})
				.catch((err) => {
					if (!abortController.signal.aborted) {
						lastError = err.message || "GitHub sign-in failed.";
						pending = null;
						devicePrompt = null;
						onChange();
					}
				});

			return await status();
		} catch (err) {
			pending = null;
			devicePrompt = null;
			lastError = err.message || "Failed to start GitHub device flow.";
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
		onChange();
		return await status();
	}

	return {
		id: "github-copilot",
		status,
		login,
		cancel,
		disconnect,
	};
}

module.exports = { createGitHubProvider };
