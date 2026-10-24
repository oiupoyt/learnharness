"use strict";

const OAUTH_PROVIDERS = [
	{
		id: "chatgpt",
		name: "ChatGPT (Codex)",
		flowType: "pkce-loopback",
		supported: true,
		docsUrl: "https://auth.openai.com",
	},
	{
		id: "github-copilot",
		name: "GitHub Copilot",
		flowType: "device-code",
		supported: true,
		docsUrl: "https://github.com/login/device",
	},
	{
		id: "claude",
		name: "Claude (Anthropic)",
		flowType: "pkce-loopback",
		supported: true,
		docsUrl: "https://claude.ai",
	},
	{
		id: "google-antigravity",
		name: "Google Antigravity",
		flowType: "device-code",
		supported: true,
		docsUrl: "https://ai.google.dev",
	},
	{
		id: "grok",
		name: "Grok (xAI)",
		flowType: "device-code",
		supported: true,
		docsUrl: "https://auth.x.ai",
	},
];

module.exports = { OAUTH_PROVIDERS };
