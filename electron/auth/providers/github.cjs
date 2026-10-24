"use strict";

const { initiateDeviceFlow, pollDeviceToken } = require("../device-code-flow.cjs");
const { createEncryptedStore } = require("../encrypted-store.cjs");
const { syncAuthVar } = require("../auth-file-sync.cjs");

const GITHUB_DEVICE_ENDPOINT = "https://github.com/login/device/code";
const GITHUB_TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const GITHUB_USER_ENDPOINT = "https://api.github.com/user";
const COPILOT_TOKEN_ENDPOINT = "https://api.github.com/copilot_internal/v2/token";

// Standard GitHub OAuth App Client ID (supports Device Flow)
const DEFAULT_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || "Iv1.b507a08c87ecfe98";
const SCOPES = "read:user";

function validateGitHubState(state) {
	if (!state || typeof state !== "object") return { accounts: [], activeAccountId: null };
	const accounts = Array.isArray(state.accounts) ? state.accounts : [];
	return {
		accounts: accounts.filter((a) => a && typeof a.id === "string" && typeof a.accessToken === "string"),
		activeAccountId: typeof state.activeAccountId === "string" ? state.activeAccountId : null,
	};
}

function createGitHubProvider({ storeFile, authFile, safeStorage, openExternal = async () => {}, fetch = globalThis.fetch, onChange = () => {} }) {
	const store = createEncryptedStore(storeFile, safeStorage, validateGitHubState);
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
			providerId: "github-copilot",
			available: true,
			supported: true,
			pending: !!pending,
			devicePrompt,
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

			if (device.verificationUriComplete) {
				openExternal(device.verificationUriComplete).catch(() => {});
			} else {
				openExternal(device.verificationUri).catch(() => {});
			}

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

					// Attempt to exchange GitHub token for a Copilot session token
					let copilotToken = tokenData.accessToken;
					try {
						const copilotRes = await fetch(COPILOT_TOKEN_ENDPOINT, {
							headers: {
								Authorization: `Bearer ${tokenData.accessToken}`,
								"User-Agent": "GitHubCopilotChat/0.35.0",
								"Editor-Version": "vscode/1.107.0",
								"Editor-Plugin-Version": "copilot-chat/0.35.0",
								Accept: "application/json",
							},
						});
						if (copilotRes.ok) {
							const cData = await copilotRes.json();
							if (cData && typeof cData.token === "string") {
								copilotToken = cData.token;
							}
						}
					} catch {}

					const accountId = `gh_${username.toLowerCase()}`;
					const account = {
						id: accountId,
						username,
						email,
						displayName: username,
						accessToken: tokenData.accessToken,
						copilotToken,
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

					// Sync COPILOT_GITHUB_TOKEN into auth.json and process.env so models immediately run
					syncAuthVar(authFile, "COPILOT_GITHUB_TOKEN", copilotToken);

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
		syncAuthVar(authFile, "COPILOT_GITHUB_TOKEN", null);
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
