/**
 * Client-safe OAuth contracts for multi-provider login support.
 * Credentials, secrets, and raw tokens NEVER enter this contract or cross
 * into the renderer.
 */

export type OAuthProviderId =
	| "chatgpt"
	| "github-copilot"
	| "claude"
	| "google-antigravity"
	| "grok";

export type OAuthFlowType = "pkce-loopback" | "device-code" | "unsupported";

export interface OAuthProviderDescriptor {
	id: OAuthProviderId;
	name: string;
	flowType: OAuthFlowType;
	supported: boolean;
	unsupportedReason?: string;
	docsUrl?: string;
	envVarAlternative?: string;
}

export interface OAuthAccount {
	id: string;
	providerId: OAuthProviderId;
	email?: string;
	username?: string;
	displayName: string;
	connected: boolean;
	expiresAt?: number;
}

export interface OAuthDeviceCodePrompt {
	userCode: string;
	verificationUri: string;
	expiresIn: number;
}

export interface OAuthProviderStatus {
	providerId: OAuthProviderId;
	available: boolean;
	supported: boolean;
	unsupportedReason?: string;
	pending: boolean;
	devicePrompt?: OAuthDeviceCodePrompt | null;
	activeAccountId: string | null;
	accounts: OAuthAccount[];
	error: string | null;
}

export interface OAuthControlBridge {
	status(providerId: OAuthProviderId): Promise<OAuthProviderStatus>;
	login(providerId: OAuthProviderId, accountId?: string): Promise<OAuthProviderStatus>;
	cancel(providerId: OAuthProviderId): Promise<OAuthProviderStatus>;
	disconnect(providerId: OAuthProviderId, accountId: string): Promise<OAuthProviderStatus>;
	listProviders(): Promise<OAuthProviderDescriptor[]>;
	onChange(providerId: OAuthProviderId, callback: () => void): () => void;
}

/** Standard descriptor catalog for supported and unsupported providers. */
export const OAUTH_PROVIDERS: readonly OAuthProviderDescriptor[] = [
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
] as const;
