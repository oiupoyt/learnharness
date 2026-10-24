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
		docsUrl: "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow",
	},
	{
		id: "claude",
		name: "Claude (Anthropic)",
		flowType: "unsupported",
		supported: false,
		unsupportedReason:
			"Anthropic does not offer a public third-party OAuth 2.0 authorization server for consumer Claude Pro/Team accounts. Use an Anthropic API Key (ANTHROPIC_API_KEY) in the Keys section.",
		docsUrl: "https://console.anthropic.com",
		envVarAlternative: "ANTHROPIC_API_KEY",
	},
	{
		id: "google-antigravity",
		name: "Google Antigravity",
		flowType: "unsupported",
		supported: false,
		unsupportedReason:
			"Google Antigravity is an internal developer agent suite and does not provide an official public third-party OAuth service. For official Google Gemini models, configure GEMINI_API_KEY.",
		docsUrl: "https://ai.google.dev",
		envVarAlternative: "GEMINI_API_KEY",
	},
	{
		id: "grok",
		name: "Grok (xAI)",
		flowType: "unsupported",
		supported: false,
		unsupportedReason:
			"xAI does not provide a third-party OAuth flow for Grok / X Premium consumer subscriptions. Use an official xAI API Key (XAI_API_KEY) in the Keys section.",
		docsUrl: "https://console.x.ai",
		envVarAlternative: "XAI_API_KEY",
	},
];

module.exports = { OAUTH_PROVIDERS };
