"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { OAUTH_PROVIDERS, type OAuthProviderStatus, type OAuthAccount } from "@/src/core";

export function OAuthProvidersSection({ onSelectKey }: { onSelectKey?: (keyId: string) => void }) {
	const [githubStatus, setGithubStatus] = useState<OAuthProviderStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isDesktop = typeof window !== "undefined" && !!window.lh?.oauth;

	const refreshGithub = async () => {
		if (!window.lh?.oauth) return;
		try {
			const s = await window.lh.oauth.status("github-copilot");
			setGithubStatus(s);
		} catch {
			// Browser mode fallback
		}
	};

	useEffect(() => {
		if (!window.lh?.oauth) return;
		refreshGithub();
		const cleanup = window.lh.oauth.onChange("github-copilot", () => {
			refreshGithub();
		});
		return cleanup;
	}, []);

	const handleGithubLogin = async () => {
		if (!window.lh?.oauth) return;
		setBusy(true);
		setError(null);
		try {
			const s = await window.lh.oauth.login("github-copilot");
			setGithubStatus(s);
		} catch (err: any) {
			setError(err?.message || "GitHub sign-in could not be started.");
		} finally {
			setBusy(false);
		}
	};

	const handleGithubCancel = async () => {
		if (!window.lh?.oauth) return;
		setBusy(true);
		try {
			const s = await window.lh.oauth.cancel("github-copilot");
			setGithubStatus(s);
		} finally {
			setBusy(false);
		}
	};

	const handleGithubDisconnect = async (accountId: string) => {
		if (!window.lh?.oauth) return;
		setBusy(true);
		try {
			const s = await window.lh.oauth.disconnect("github-copilot", accountId);
			setGithubStatus(s);
		} finally {
			setBusy(false);
		}
	};

	const unsupportedProviders = OAUTH_PROVIDERS.filter((p) => !p.supported);
	const activeGhAccount = githubStatus?.accounts?.find(
		(a) => a.id === githubStatus?.activeAccountId,
	) || githubStatus?.accounts?.[0];

	return (
		<div className="flex flex-col gap-4 font-mono text-xs" data-testid="oauth-providers-section">
			{/* GitHub Copilot Device Flow Connection */}
			<div
				className="border border-[#222222] bg-[#111111] p-3 text-foreground"
				style={{ borderRadius: 0 }}
				data-testid="oauth-provider-github"
			>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<span
							className={`inline-block h-2 w-2 ${
								activeGhAccount?.connected ? "bg-emerald-500" : "bg-neutral-600"
							}`}
							style={{ borderRadius: 0 }}
							aria-hidden="true"
						/>
						<span className="font-semibold text-foreground">GitHub Copilot</span>
						<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
							(Device Flow)
						</span>
					</div>

					<div className="flex items-center gap-2">
						{activeGhAccount?.connected ? (
							<>
								<span className="text-muted-foreground">
									{activeGhAccount.displayName || activeGhAccount.username}
								</span>
								<Button
									type="button"
									size="xs"
									variant="ghost"
									disabled={busy}
									onClick={() => handleGithubDisconnect(activeGhAccount.id)}
									className="border border-[#333333] hover:border-red-500 hover:text-red-400"
									style={{ borderRadius: 0 }}
								>
									Disconnect
								</Button>
							</>
						) : githubStatus?.pending && githubStatus?.devicePrompt ? (
							<Button
								type="button"
								size="xs"
								variant="ghost"
								disabled={busy}
								onClick={handleGithubCancel}
								className="border border-[#333333] text-muted-foreground hover:text-foreground"
								style={{ borderRadius: 0 }}
							>
								Cancel
							</Button>
						) : (
							<Button
								type="button"
								size="xs"
								variant="ghost"
								disabled={busy || !isDesktop}
								onClick={handleGithubLogin}
								className="border border-cyan-800 text-cyan-400 hover:bg-cyan-950/40"
								style={{ borderRadius: 0 }}
							>
								{isDesktop ? "Connect with GitHub" : "Desktop app required"}
							</Button>
						)}
					</div>
				</div>

				{/* Active device verification prompt */}
				{githubStatus?.pending && githubStatus?.devicePrompt && (
					<div
						className="mt-3 border border-cyan-900/60 bg-[#0b0b0b] p-3"
						style={{ borderRadius: 0 }}
						data-testid="github-device-prompt"
					>
						<p className="text-muted-foreground">
							To complete sign-in, enter this one-time code on GitHub:
						</p>
						<div className="my-2 flex items-center gap-3">
							<span
								className="border border-cyan-500 bg-[#161b22] px-3 py-1 font-mono text-base font-bold tracking-widest text-cyan-300"
								style={{ borderRadius: 0 }}
							>
								{githubStatus.devicePrompt.userCode}
							</span>
							<a
								href={githubStatus.devicePrompt.verificationUri}
								target="_blank"
								rel="noreferrer"
								className="text-cyan-400 underline underline-offset-4 hover:text-cyan-300"
							>
								Open GitHub Verification Page &rarr;
							</a>
						</div>
						<p className="text-[10px] text-muted-foreground">
							Waiting for authorization. This code expires in {Math.round(githubStatus.devicePrompt.expiresIn / 60)} minutes.
						</p>
					</div>
				)}

				{error && <p className="mt-2 text-xs text-red-400">{error}</p>}
			</div>

			{/* Officially Unsupported OAuth Providers (Stubs with Clear Blockers) */}
			<div className="flex flex-col gap-2" data-testid="oauth-unsupported-providers">
				<div className="text-[11px] text-muted-foreground uppercase tracking-wider">
					API Key Providers (No Public 3rd-Party OAuth)
				</div>

				{unsupportedProviders.map((provider) => (
					<div
						key={provider.id}
						className="border border-[#222222] bg-[#0e0e0e] p-2.5 text-foreground"
						style={{ borderRadius: 0 }}
						data-testid={`oauth-stub-${provider.id}`}
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<span className="font-semibold text-neutral-300">{provider.name}</span>
								<span
									className="border border-[#333333] px-1.5 py-0.5 text-[9px] text-neutral-400 uppercase tracking-widest"
									style={{ borderRadius: 0 }}
								>
									API Key Only
								</span>
							</div>

							{provider.envVarAlternative && (
								<button
									type="button"
									onClick={() => onSelectKey?.(provider.envVarAlternative!)}
									className="cursor-pointer text-[11px] text-cyan-400 underline underline-offset-2 hover:text-cyan-300"
								>
									Configure {provider.envVarAlternative}
								</button>
							)}
						</div>

						<p className="mt-1 text-[11px] text-neutral-400 leading-relaxed">
							{provider.unsupportedReason}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}
