import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { initiateDeviceFlow, pollDeviceToken } = require("../electron/auth/device-code-flow.cjs");

test("initiateDeviceFlow parses valid device authorization response", async () => {
	const mockFetch = async () =>
		Response.json({
			device_code: "dev_12345",
			user_code: "ABCD-EFGH",
			verification_uri: "https://github.com/login/device",
			expires_in: 900,
			interval: 5,
		});

	const result = await initiateDeviceFlow({
		clientId: "test_client",
		endpoint: "https://auth.example.com/device/code",
		fetch: mockFetch,
	});

	assert.equal(result.deviceCode, "dev_12345");
	assert.equal(result.userCode, "ABCD-EFGH");
	assert.equal(result.verificationUri, "https://github.com/login/device");
	assert.equal(result.expiresIn, 900);
	assert.equal(result.interval, 5);
});

test("initiateDeviceFlow throws on network error", async () => {
	const mockFetch = async () => new Response("Internal error", { status: 500 });

	await assert.rejects(
		initiateDeviceFlow({
			clientId: "test_client",
			endpoint: "https://auth.example.com/device/code",
			fetch: mockFetch,
		}),
		/Device authorization request failed/,
	);
});

test("pollDeviceToken polls and resolves token upon user approval", async () => {
	let attempts = 0;
	const mockFetch = async () => {
		attempts++;
		if (attempts === 1) {
			return Response.json({ error: "authorization_pending" });
		}
		return Response.json({
			access_token: "gho_test_token_123",
			token_type: "Bearer",
			scope: "read:user",
		});
	};

	const result = await pollDeviceToken({
		clientId: "test_client",
		deviceCode: "dev_12345",
		endpoint: "https://auth.example.com/token",
		interval: 0.01,
		expiresIn: 10,
		fetch: mockFetch,
	});

	assert.equal(result.accessToken, "gho_test_token_123");
	assert.equal(result.tokenType, "Bearer");
	assert.deepEqual(result.scope, ["read:user"]);
	assert.equal(attempts, 2);
});

test("pollDeviceToken backs off on slow_down and fails on access_denied", async () => {
	let attempts = 0;
	const mockFetch = async () => {
		attempts++;
		if (attempts === 1) {
			return Response.json({ error: "slow_down" });
		}
		return Response.json({ error: "access_denied" });
	};

	await assert.rejects(
		pollDeviceToken({
			clientId: "test_client",
			deviceCode: "dev_12345",
			endpoint: "https://auth.example.com/token",
			interval: 0.01,
			expiresIn: 10,
			fetch: mockFetch,
		}),
		(err: any) => err.code === "cancelled",
	);
});

test("pollDeviceToken cancels immediately on abort signal", async () => {
	const controller = new AbortController();
	const mockFetch = async () => {
		controller.abort();
		return Response.json({ error: "authorization_pending" });
	};

	await assert.rejects(
		pollDeviceToken({
			clientId: "test_client",
			deviceCode: "dev_12345",
			endpoint: "https://auth.example.com/token",
			interval: 1,
			expiresIn: 10,
			fetch: mockFetch,
			signal: controller.signal,
		}),
		(err: any) => err.code === "cancelled",
	);
});
