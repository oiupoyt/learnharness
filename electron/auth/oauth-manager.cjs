"use strict";

const path = require("node:path");
const { createGitHubProvider } = require("./providers/github.cjs");
const { createClaudeProvider } = require("./providers/claude.cjs");
const { createAntigravityProvider } = require("./providers/antigravity.cjs");
const { createGrokProvider } = require("./providers/grok.cjs");
const { OAUTH_PROVIDERS } = require("./descriptors.cjs");

function createOAuthManager({ userDataDir, safeStorage, openExternal, fetch = globalThis.fetch, chatgptInstance, onProviderChange = () => {} }) {
	const authFile = path.join(userDataDir, "auth.json");

	const github = createGitHubProvider({
		storeFile: path.join(userDataDir, "github-credentials.enc.json"),
		authFile,
		safeStorage,
		openExternal,
		fetch,
		onChange: () => onProviderChange("github-copilot"),
	});

	const claude = createClaudeProvider({
		storeFile: path.join(userDataDir, "claude-credentials.enc.json"),
		authFile,
		safeStorage,
		openExternal,
		fetch,
		onChange: () => onProviderChange("claude"),
	});

	const antigravity = createAntigravityProvider({
		storeFile: path.join(userDataDir, "antigravity-credentials.enc.json"),
		authFile,
		safeStorage,
		openExternal,
		fetch,
		onChange: () => onProviderChange("google-antigravity"),
	});

	const grok = createGrokProvider({
		storeFile: path.join(userDataDir, "grok-credentials.enc.json"),
		authFile,
		safeStorage,
		openExternal,
		fetch,
		onChange: () => onProviderChange("grok"),
	});

	function getProvider(providerId) {
		if (providerId === "github-copilot") return github;
		if (providerId === "claude") return claude;
		if (providerId === "google-antigravity") return antigravity;
		if (providerId === "grok") return grok;
		if (providerId === "chatgpt") {
			return {
				id: "chatgpt",
				async status() {
					if (!chatgptInstance) {
						return {
							providerId: "chatgpt",
							available: false,
							supported: true,
							pending: false,
							devicePrompt: null,
							activeAccountId: null,
							accounts: [],
							error: "ChatGPT service not initialized.",
						};
					}
					const s = await chatgptInstance.status();
					return {
						providerId: "chatgpt",
						available: s.available,
						supported: true,
						pending: s.pending,
						devicePrompt: null,
						activeAccountId: s.activeId,
						accounts: (s.accounts || []).map((a) => ({
							id: a.id,
							providerId: "chatgpt",
							email: a.email,
							displayName: a.email || a.id,
							connected: a.connected,
						})),
						error: s.error || null,
					};
				},
				async login(accountId) {
					if (!chatgptInstance) throw new Error("ChatGPT service not initialized.");
					await chatgptInstance.login(accountId);
					return this.status();
				},
				async cancel() {
					if (!chatgptInstance) return this.status();
					chatgptInstance.cancelLogin();
					return this.status();
				},
				async disconnect(accountId) {
					if (!chatgptInstance) return this.status();
					await chatgptInstance.disconnect(accountId);
					return this.status();
				},
			};
		}
		throw new Error(`Unknown OAuth provider: ${providerId}`);
	}

	return {
		listProviders() {
			return OAUTH_PROVIDERS;
		},
		async status(providerId) {
			const p = getProvider(providerId);
			return await p.status();
		},
		async login(providerId, accountId) {
			const p = getProvider(providerId);
			return await p.login(accountId);
		},
		async cancel(providerId) {
			const p = getProvider(providerId);
			return await p.cancel();
		},
		async disconnect(providerId, accountId) {
			const p = getProvider(providerId);
			return await p.disconnect(accountId);
		},
	};
}

module.exports = { createOAuthManager };
