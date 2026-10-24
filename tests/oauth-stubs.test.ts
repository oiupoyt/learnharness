import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createStubProvider } = require("../electron/auth/providers/stubs.cjs");
const { createOAuthManager } = require("../electron/auth/oauth-manager.cjs");

test("unsupported provider stubs report supported: false and provide clear reasoning", async () => {
	for (const id of ["claude", "google-antigravity", "grok"]) {
		const stub = createStubProvider(id);
		const status = await stub.status();

		assert.equal(status.providerId, id);
		assert.equal(status.supported, false);
		assert.ok(status.unsupportedReason && status.unsupportedReason.length > 10);

		// Must reject login cleanly without faking or scraping
		await assert.rejects(
			stub.login(),
			(err: any) => err.code === "unsupported" && typeof err.message === "string",
		);
	}
});

test("createOAuthManager lists all providers and routes operations appropriately", async () => {
	const manager = createOAuthManager({
		userDataDir: "/tmp/fake-userdata",
		safeStorage: {
			isEncryptionAvailable: () => true,
			encryptString: (s: string) => Buffer.from(s),
			decryptString: (b: Buffer) => b.toString(),
		},
		openExternal: async () => {},
	});

	const providers = manager.listProviders();
	assert.ok(Array.isArray(providers));
	assert.ok(providers.some((p: any) => p.id === "chatgpt"));
	assert.ok(providers.some((p: any) => p.id === "github-copilot"));
	assert.ok(providers.some((p: any) => p.id === "claude"));
	assert.ok(providers.some((p: any) => p.id === "google-antigravity"));
	assert.ok(providers.some((p: any) => p.id === "grok"));

	const claudeStatus = await manager.status("claude");
	assert.equal(claudeStatus.supported, false);
	assert.match(claudeStatus.unsupportedReason, /Anthropic does not offer/);

	await assert.rejects(manager.login("grok"), /xAI does not provide a third-party OAuth flow/);
});
