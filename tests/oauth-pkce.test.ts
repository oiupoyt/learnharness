import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { startPkceLoopback, randomString, sha256Base64Url } = require("../electron/auth/pkce-flow.cjs");

test("PKCE verifier and challenge generation", () => {
	const verifier = randomString();
	assert.ok(typeof verifier === "string" && verifier.length > 20);
	const challenge = sha256Base64Url(verifier);
	assert.ok(typeof challenge === "string" && challenge.length > 20);
	assert.notEqual(verifier, challenge);
});

test("startPkceLoopback starts ephemeral server and handles valid authorization callback", async () => {
	let openedUrl: string = "";
	const openExternal = async (url: string) => {
		openedUrl = url;
	};

	const flowPromise = startPkceLoopback({
		authorizeEndpoint: "https://auth.example.com/oauth/authorize",
		clientId: "test_client_id",
		scopes: ["openid", "profile"],
		openExternal,
		timeoutMs: 5000,
	});

	// Wait for server to bind and call openExternal
	await new Promise((r) => setTimeout(r, 50));
	assert.ok(openedUrl.length > 0, "openExternal was called");

	const parsed = new URL(openedUrl);
	assert.equal(parsed.searchParams.get("client_id"), "test_client_id");
	assert.equal(parsed.searchParams.get("scope"), "openid profile");
	assert.equal(parsed.searchParams.get("code_challenge_method"), "S256");

	const redirectUri = parsed.searchParams.get("redirect_uri");
	const state = parsed.searchParams.get("state");
	assert.ok(redirectUri && state);

	// Simulate browser callback with valid code and matching state
	const callbackUrl = new URL(redirectUri);
	callbackUrl.searchParams.set("code", "valid_auth_code_123");
	callbackUrl.searchParams.set("state", state);

	const callbackRes = await fetch(callbackUrl.toString());
	assert.equal(callbackRes.status, 200);

	const result = await flowPromise;
	assert.equal(result.code, "valid_auth_code_123");
	assert.ok(result.verifier);
});

test("startPkceLoopback rejects invalid state parameter", async () => {
	let openedUrl: string = "";
	const openExternal = async (url: string) => {
		openedUrl = url;
	};

	const flowPromise = startPkceLoopback({
		authorizeEndpoint: "https://auth.example.com/oauth/authorize",
		clientId: "test_client_id",
		openExternal,
		timeoutMs: 2000,
	});

	await new Promise((r) => setTimeout(r, 50));
	const parsed = new URL(openedUrl);
	const redirectUri = parsed.searchParams.get("redirect_uri")!;

	// Callback with bad state
	const callbackUrl = new URL(redirectUri);
	callbackUrl.searchParams.set("code", "some_code");
	callbackUrl.searchParams.set("state", "tampered_state");

	const rejected = assert.rejects(flowPromise, /OAuth state validation failed/);
	const callbackRes = await fetch(callbackUrl.toString());
	assert.equal(callbackRes.status, 400);

	await rejected;
});
