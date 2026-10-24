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

/** Standard descriptor catalog for supported OAuth providers. */
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
		docsUrl: "https://github.com/login/device",
		envVarAlternative: "COPILOT_GITHUB_TOKEN",
	},
	{
		id: "claude",
		name: "Claude (Anthropic)",
		flowType: "pkce-loopback",
		supported: true,
		docsUrl: "https://claude.ai",
		envVarAlternative: "ANTHROPIC_API_KEY",
	},
	{
		id: "google-antigravity",
		name: "Google Antigravity",
		flowType: "device-code",
		supported: true,
		docsUrl: "https://ai.google.dev",
		envVarAlternative: "GEMINI_API_KEY",
	},
	{
		id: "grok",
		name: "Grok (xAI)",
		flowType: "device-code",
		supported: true,
		docsUrl: "https://auth.x.ai",
		envVarAlternative: "XAI_API_KEY",
	},
] as const;
