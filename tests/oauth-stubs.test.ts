import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createStubProvider } = require("../electron/auth/providers/stubs.cjs");
const { createOAuthManager } = require("../electron/auth/oauth-manager.cjs");

test("unsupported provider stubs report supported: false and reject login cleanly", async () => {
	const stub = createStubProvider("future-unsupported");
	const status = await stub.status();
	assert.equal(status.providerId, "future-unsupported");
	assert.equal(status.supported, false);
	await assert.rejects(stub.login(), (err: any) => err.code === "unsupported");
});

test("createOAuthManager lists all 5 providers and returns supported statuses", async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-oauth-mgr-"));
	try {
		const manager = createOAuthManager({
			userDataDir: tmpDir,
			safeStorage: {
				isEncryptionAvailable: () => true,
				encryptString: (s: string) => Buffer.from(s),
				decryptString: (b: Buffer) => b.toString(),
			},
			openExternal: async () => {},
		});

		const providers = manager.listProviders();
		assert.ok(Array.isArray(providers));
		assert.equal(providers.length, 5);

		for (const id of ["chatgpt", "github-copilot", "claude", "google-antigravity", "grok"]) {
			assert.ok(providers.some((p: any) => p.id === id && p.supported === true), `provider ${id} is listed and supported`);
			const status = await manager.status(id);
			assert.equal(status.providerId, id);
			assert.equal(status.supported, true);
		}
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});
