"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useBackdropDismiss } from "@/components/backdrop-dismiss";
import {
	OAUTH_PROVIDERS,
	type OAuthProviderId,
	type OAuthProviderStatus,
	type OAuthAccount,
	type OAuthProviderDescriptor,
} from "@/src/core";

function ProviderIcon({ id }: { id: OAuthProviderId }) {
	if (id === "github-copilot") {
		return (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
				<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
			</svg>
		);
	}
	if (id === "claude") {
		return (
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
			</svg>
		);
	}
	if (id === "google-antigravity") {
		return (
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
			</svg>
		);
	}
	if (id === "grok") {
		return (
			<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
			</svg>
		);
	}
	return null;
}

function AccountDialog({
	children,
	onClose,
	busy,
	title,
}: {
	children: React.ReactNode;
	onClose: () => void;
	busy: boolean;
	title: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const closeRef = useRef(onClose);
	closeRef.current = onClose;
	const backdropDismiss = useBackdropDismiss(onClose);

	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		const focusable = () => [
			...(ref.current?.querySelectorAll<HTMLElement>(
				'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])',
			) ?? []),
		];
		focusable()[0]?.focus();

		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopImmediatePropagation();
				closeRef.current();
			} else if (event.key === "Tab") {
				const items = focusable();
				const first = items[0];
				const last = items.at(-1);
				if (!first) {
					event.preventDefault();
					return;
				}
				if (event.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) {
					event.preventDefault();
					last?.focus();
				} else if (!event.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) {
					event.preventDefault();
					first.focus();
				}
			}
		};

		document.addEventListener("keydown", key, true);
		return () => {
			document.removeEventListener("keydown", key, true);
			if (previous?.isConnected) previous.focus();
		};
	}, []);

	return createPortal(
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80"
			data-testid="subscription-dialog-backdrop"
			{...backdropDismiss}
		>
			<div
				ref={ref}
				role="dialog"
				aria-modal="true"
				aria-label={title}
				aria-busy={busy}
				onClick={(event) => event.stopPropagation()}
				className="settings-dialog-pop mx-4 max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-md border border-border bg-card p-5 shadow-xl"
			>
				{children}
			</div>
		</div>,
		document.body,
	);
}

function SubscriptionRow({
	provider,
	isDesktop,
}: {
	provider: OAuthProviderDescriptor;
	isDesktop: boolean;
}) {
	const [status, setStatus] = useState<OAuthProviderStatus | null>(null);
	const [busy, setBusy] = useState(false);
	const [dialog, setDialog] = useState<"connect" | "manage" | null>(null);
	const [confirmDisconnect, setConfirmDisconnect] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = async () => {
		if (!window.lh?.oauth) return;
		try {
			const s = await window.lh.oauth.status(provider.id);
			setStatus(s);
		} catch {}
	};

	useEffect(() => {
		if (!window.lh?.oauth) return;
		refresh();
		const cleanup = window.lh.oauth.onChange(provider.id, refresh);
		return cleanup;
	}, [provider.id]);

	const handleLogin = async () => {
		if (!window.lh?.oauth) return;
		setBusy(true);
		setError(null);
		try {
			const s = await window.lh.oauth.login(provider.id);
			setStatus(s);
			// For PKCE flows (browser callback), close dialog once connected or keep open if pending
			if (!s.pending) setDialog(null);
		} catch (err: any) {
			setError(err?.message || `${provider.name} sign-in failed.`);
		} finally {
			setBusy(false);
		}
	};

	const handleCancel = async () => {
		if (!window.lh?.oauth) return;
		setBusy(true);
		try {
			const s = await window.lh.oauth.cancel(provider.id);
			setStatus(s);
			setDialog(null);
		} finally {
			setBusy(false);
		}
	};

	const handleDisconnect = async (accountId: string) => {
		if (!window.lh?.oauth) return;
		setBusy(true);
		try {
			const s = await window.lh.oauth.disconnect(provider.id, accountId);
			setStatus(s);
			setDialog(null);
			setConfirmDisconnect(false);
		} finally {
			setBusy(false);
		}
	};

	const active =
		status?.accounts?.find((a) => a.id === status?.activeAccountId && a.connected) ||
		status?.accounts?.find((a) => a.connected);

	const accounts = status?.accounts?.filter((a) => a.connected) || [];

	const notice = `LearnHarness stores your ${provider.name} account details and encrypted credentials locally on this device. When this connection is used, relevant conversation context, learning material, and tool results are sent directly to ${provider.name}. Plan limits and account permissions apply.`;

	return (
		<div className="flex flex-col gap-2" data-testid={`subscription-row-${provider.id}`}>
			<div className="flex flex-wrap items-center gap-3">
				{active ? (
					<>
						<span className="font-ui text-xs text-foreground">{provider.name}</span>
						<select
							aria-label={`${provider.name} account`}
							value={active.id}
							disabled={busy || !!status?.pending}
							onChange={() => {}}
							className="min-w-0 rounded-sm border border-border bg-background px-2 py-1 text-xs text-foreground"
						>
							{accounts.map((a) => (
								<option key={a.id} value={a.id}>
									{a.email || a.displayName || `${provider.name} account`}
								</option>
							))}
						</select>
						<Button
							type="button"
							size="xs"
							variant="ghost"
							disabled={busy}
							onClick={() => {
								setError(null);
								setConfirmDisconnect(false);
								setDialog("manage");
							}}
						>
							Manage…
						</Button>
					</>
				) : (
					<Button
						type="button"
						variant="outline"
						size="sm"
						data-testid={`continue-${provider.id}`}
						onClick={() => {
							setError(null);
							setDialog("connect");
						}}
						disabled={!isDesktop || busy}
						className="cursor-pointer gap-2 disabled:cursor-not-allowed"
					>
						<ProviderIcon id={provider.id} />
						Continue with {provider.name}
					</Button>
				)}
			</div>

			{error && !dialog && <p role="alert" className="text-xs text-red-400">{error}</p>}

			{/* Connection & Management Modal Dialog (Byte-for-byte matching ChatGPT style) */}
			{dialog && (
				<AccountDialog
					onClose={() => setDialog(null)}
					busy={busy}
					title={`${provider.name} connection`}
				>
					{dialog === "connect" ? (
						<div>
							<h2 className="text-sm font-semibold text-foreground">
								Continue with {provider.name}
							</h2>
							<p className="mt-3 text-xs leading-relaxed text-muted-foreground">
								{notice}
							</p>

							{/* Device code verification block if in-flight */}
							{status?.pending && status?.devicePrompt && (
								<div className="my-4 border border-border bg-muted/30 p-3">
									<p className="text-xs text-foreground">
										Enter this one-time code to authorize LearnHarness:
									</p>
									<div className="my-2 flex items-center gap-3">
										<span className="rounded border border-primary/50 bg-background px-3 py-1 font-mono text-base font-bold tracking-widest text-primary">
											{status.devicePrompt.userCode}
										</span>
										<a
											href={status.devicePrompt.verificationUri}
											target="_blank"
											rel="noreferrer"
											className="text-xs text-primary underline underline-offset-4 hover:opacity-80"
										>
											Open Verification Page &rarr;
										</a>
									</div>
									<p className="text-[11px] text-muted-foreground">
										Waiting for authorization. This code expires in {Math.round(status.devicePrompt.expiresIn / 60)} minutes.
									</p>
								</div>
							)}

							{status?.pending && !status?.devicePrompt && (
								<p role="status" className="mt-3 text-xs text-muted-foreground">
									Waiting for browser sign-in…
								</p>
							)}

							{error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}

							<div className="mt-5 flex items-center justify-end gap-2">
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => (status?.pending ? handleCancel() : setDialog(null))}
								>
									Cancel
								</Button>
								{!status?.pending && (
									<Button
										variant="outline"
										size="sm"
										disabled={busy}
										onClick={handleLogin}
										className="gap-2"
									>
										<ProviderIcon id={provider.id} />
										Continue
									</Button>
								)}
							</div>
						</div>
					) : confirmDisconnect && active ? (
						<div data-testid="subscription-disconnect-confirmation">
							<h2 className="text-sm font-semibold text-red-400">
								Disconnect account?
							</h2>
							<p className="mt-3 text-xs text-foreground">
								{active.email || active.displayName}
							</p>
							<p className="mt-3 text-xs text-muted-foreground">
								This removes the saved account and its credentials from this device.
							</p>
							{error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
							<div className="mt-4 flex items-center justify-end gap-2">
								<Button
									variant="ghost"
									size="sm"
									disabled={busy}
									onClick={() => setConfirmDisconnect(false)}
								>
									Cancel
								</Button>
								<Button
									variant="destructive"
									size="sm"
									disabled={busy}
									onClick={() => handleDisconnect(active.id)}
								>
									Disconnect account
								</Button>
							</div>
						</div>
					) : active ? (
						<div>
							<h2 className="text-sm font-semibold text-foreground">
								Manage {provider.name}
							</h2>
							<div className="mt-3 flex items-center justify-between text-xs text-foreground">
								<span>{active.email || active.displayName}</span>
								<span className="text-emerald-500 font-medium">Connected</span>
							</div>

							<div className="mt-4 flex items-center">
								<Button
									variant="ghost"
									size="xs"
									className="cursor-pointer text-red-400 hover:bg-red-500/10 hover:text-red-300"
									disabled={busy}
									onClick={() => setConfirmDisconnect(true)}
								>
									Disconnect account…
								</Button>
							</div>

							<p className="mt-4 text-xs leading-relaxed text-muted-foreground">
								{notice}
							</p>

							{error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}

							<div className="mt-5 flex items-center justify-end gap-2">
								<Button variant="ghost" size="sm" onClick={() => setDialog(null)}>
									Close
								</Button>
							</div>
						</div>
					) : null}
				</AccountDialog>
			)}
		</div>
	);
}

export function OAuthProvidersSection() {
	const isDesktop = typeof window !== "undefined" && !!window.lh?.oauth;
	const nonChatGptProviders = OAUTH_PROVIDERS.filter((p) => p.id !== "chatgpt");

	return (
		<div className="flex flex-col gap-3" data-testid="oauth-subscriptions-group">
			{nonChatGptProviders.map((provider) => (
				<SubscriptionRow key={provider.id} provider={provider} isDesktop={isDesktop} />
			))}
		</div>
	);
}
