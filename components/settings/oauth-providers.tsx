"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { OAUTH_PROVIDERS, type OAuthProviderId, type OAuthProviderStatus, type OAuthAccount } from "@/src/core";

export function OAuthProvidersSection({ onSelectKey }: { onSelectKey?: (keyId: string) => void }) {
	const [statuses, setStatuses] = useState<Record<string, OAuthProviderStatus>>({});
	const [busyProvider, setBusyProvider] = useState<string | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});

	const isDesktop = typeof window !== "undefined" && !!window.lh?.oauth;

	const refreshProvider = async (id: OAuthProviderId) => {
		if (!window.lh?.oauth) return;
		try {
			const s = await window.lh.oauth.status(id);
			setStatuses((prev) => ({ ...prev, [id]: s }));
		} catch {
			// Browser fallback
		}
	};

	const refreshAll = () => {
		if (!window.lh?.oauth) return;
		for (const p of OAUTH_PROVIDERS) {
			if (p.id !== "chatgpt") {
				refreshProvider(p.id);
			}
		}
	};

	useEffect(() => {
		if (!window.lh?.oauth) return;
		refreshAll();

		const cleanups = OAUTH_PROVIDERS.filter((p) => p.id !== "chatgpt").map((p) =>
			window.lh!.oauth!.onChange(p.id, () => {
				refreshProvider(p.id);
			}),
		);

		return () => {
			for (const c of cleanups) c();
		};
	}, []);

	const handleLogin = async (id: OAuthProviderId) => {
		if (!window.lh?.oauth) return;
		setBusyProvider(id);
		setErrors((prev) => ({ ...prev, [id]: "" }));
		try {
			const s = await window.lh.oauth.login(id);
			setStatuses((prev) => ({ ...prev, [id]: s }));
		} catch (err: any) {
			setErrors((prev) => ({ ...prev, [id]: err?.message || `${id} sign-in failed.` }));
		} finally {
			setBusyProvider(null);
		}
	};

	const handleCancel = async (id: OAuthProviderId) => {
		if (!window.lh?.oauth) return;
		setBusyProvider(id);
		try {
			const s = await window.lh.oauth.cancel(id);
			setStatuses((prev) => ({ ...prev, [id]: s }));
		} finally {
			setBusyProvider(null);
		}
	};

	const handleDisconnect = async (id: OAuthProviderId, accountId: string) => {
		if (!window.lh?.oauth) return;
		setBusyProvider(id);
		try {
			const s = await window.lh.oauth.disconnect(id, accountId);
			setStatuses((prev) => ({ ...prev, [id]: s }));
		} finally {
			setBusyProvider(null);
		}
	};

	const interactiveProviders = OAUTH_PROVIDERS.filter((p) => p.id !== "chatgpt");

	return (
		<div className="flex flex-col gap-3 font-mono text-xs" data-testid="oauth-providers-section">
			{interactiveProviders.map((provider) => {
				const status = statuses[provider.id];
				const isBusy = busyProvider === provider.id;
				const activeAccount = status?.accounts?.find((a) => a.id === status?.activeAccountId) || status?.accounts?.[0];
				const isConnected = !!activeAccount?.connected;
				const isPending = !!status?.pending;
				const devicePrompt = status?.devicePrompt;
				const providerError = errors[provider.id] || status?.error;

				return (
					<div
						key={provider.id}
						className="border border-[#222222] bg-[#111111] p-3 text-foreground"
						style={{ borderRadius: 0 }}
						data-testid={`oauth-provider-${provider.id}`}
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="flex items-center gap-2">
								<span
									className={`inline-block h-2 w-2 ${isConnected ? "bg-emerald-500" : "bg-neutral-600"}`}
									style={{ borderRadius: 0 }}
									aria-hidden="true"
								/>
								<span className="font-semibold text-foreground">{provider.name}</span>
								<span className="text-[10px] text-muted-foreground uppercase tracking-wider">
									({provider.flowType === "device-code" ? "Device Flow" : "PKCE OAuth"})
								</span>
							</div>

							<div className="flex items-center gap-2">
								{isConnected ? (
									<>
										<span className="text-muted-foreground">
											{activeAccount.displayName || activeAccount.email || activeAccount.username}
										</span>
										<Button
											type="button"
											size="xs"
											variant="ghost"
											disabled={isBusy}
											onClick={() => handleDisconnect(provider.id, activeAccount.id)}
											className="border border-[#333333] hover:border-red-500 hover:text-red-400"
											style={{ borderRadius: 0 }}
										>
											Disconnect
										</Button>
									</>
								) : isPending ? (
									<Button
										type="button"
										size="xs"
										variant="ghost"
										disabled={isBusy}
										onClick={() => handleCancel(provider.id)}
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
										disabled={isBusy || !isDesktop}
										onClick={() => handleLogin(provider.id)}
										className="border border-cyan-800 text-cyan-400 hover:bg-cyan-950/40"
										style={{ borderRadius: 0 }}
									>
										{isDesktop ? `Sign in with ${provider.name}` : "Desktop app required"}
									</Button>
								)}
							</div>
						</div>

						{/* In-flight Device Code Prompt */}
						{isPending && devicePrompt && (
							<div
								className="mt-3 border border-cyan-900/60 bg-[#0b0b0b] p-3"
								style={{ borderRadius: 0 }}
								data-testid={`device-prompt-${provider.id}`}
							>
								<p className="text-muted-foreground">
									To authorize, enter this verification code in your browser:
								</p>
								<div className="my-2 flex items-center gap-3">
									<span
										className="border border-cyan-500 bg-[#161b22] px-3 py-1 font-mono text-base font-bold tracking-widest text-cyan-300"
										style={{ borderRadius: 0 }}
									>
										{devicePrompt.userCode}
									</span>
									<a
										href={devicePrompt.verificationUri}
										target="_blank"
										rel="noreferrer"
										className="text-cyan-400 underline underline-offset-4 hover:text-cyan-300"
									>
										Open Verification Page &rarr;
									</a>
								</div>
								<p className="text-[10px] text-muted-foreground">
									Waiting for authorization. This code expires in {Math.round(devicePrompt.expiresIn / 60)} minutes.
								</p>
							</div>
						)}

						{/* In-flight PKCE browser wait note */}
						{isPending && !devicePrompt && (
							<p className="mt-2 text-[11px] text-cyan-400">
								Browser sign-in window opened. Complete authorization in your browser...
							</p>
						)}

						{providerError && <p className="mt-2 text-xs text-red-400">{providerError}</p>}
					</div>
				);
			})}
		</div>
	);
}
