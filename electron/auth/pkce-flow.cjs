"use strict";

const crypto = require("node:crypto");
const http = require("node:http");

const fail = (code, message) => {
	const err = new Error(message || code);
	err.code = code;
	return err;
};

const randomString = () => crypto.randomBytes(32).toString("base64url");

function sha256Base64Url(str) {
	return crypto.createHash("sha256").update(str).digest("base64url");
}

/**
 * Standard RFC 7636 PKCE Authorization Code Loopback Flow Primitive.
 */
async function startPkceLoopback({
	authorizeEndpoint,
	clientId,
	scopes = [],
	extraParams = {},
	openExternal = async () => {},
	timeoutMs = 120000,
	signal,
}) {
	const verifier = randomString();
	const challenge = sha256Base64Url(verifier);
	const expectedState = randomString();

	const listener = http.createServer();
	let timer = null;
	let consumed = false;

	const cleanup = () => {
		if (timer) clearTimeout(timer);
		try {
			listener.close();
			listener.closeAllConnections();
		} catch {}
	};

	await new Promise((resolve, reject) => {
		listener.once("error", reject);
		listener.listen(0, "127.0.0.1", resolve);
	});

	const port = listener.address().port;
	const redirectUri = `http://127.0.0.1:${port}/auth/callback`;

	const authUrl = new URL(authorizeEndpoint);
	authUrl.searchParams.set("response_type", "code");
	authUrl.searchParams.set("client_id", clientId);
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("scope", Array.isArray(scopes) ? scopes.join(" ") : scopes);
	authUrl.searchParams.set("state", expectedState);
	authUrl.searchParams.set("code_challenge", challenge);
	authUrl.searchParams.set("code_challenge_method", "S256");

	for (const [key, val] of Object.entries(extraParams)) {
		if (val !== undefined && val !== null) {
			authUrl.searchParams.set(key, String(val));
		}
	}

	const codePromise = new Promise((resolve, reject) => {
		if (signal?.aborted) {
			cleanup();
			return reject(fail("cancelled", "OAuth sign-in cancelled."));
		}

		const onAbort = () => {
			cleanup();
			reject(fail("cancelled", "OAuth sign-in cancelled."));
		};

		if (signal) {
			signal.addEventListener("abort", onAbort, { once: true });
		}

		timer = setTimeout(() => {
			cleanup();
			signal?.removeEventListener("abort", onAbort);
			reject(fail("timeout", "OAuth sign-in timed out."));
		}, timeoutMs);

		listener.on("request", async (req, res) => {
			let callbackUrl;
			try {
				callbackUrl = new URL(req.url || "/", redirectUri);
			} catch {
				res.writeHead(400).end();
				return;
			}

			res.setHeader("Cache-Control", "no-store");
			res.setHeader("Content-Security-Policy", "default-src 'none'");

			if (
				req.method !== "GET" ||
				callbackUrl.pathname !== "/auth/callback" ||
				consumed
			) {
				res.writeHead(404).end();
				return;
			}

			const params = callbackUrl.searchParams;
			if (params.get("state") !== expectedState) {
				res.writeHead(400, { "Content-Type": "text/plain" }).end("State mismatch.");
				cleanup();
				signal?.removeEventListener("abort", onAbort);
				reject(fail("identity", "OAuth state validation failed."));
				return;
			}

			consumed = true;

			if (params.has("error")) {
				const errParam = params.get("error");
				res.writeHead(200, { "Content-Type": "text/plain" }).end(
					"Sign-in was not completed. You may close this window.",
				);
				cleanup();
				signal?.removeEventListener("abort", onAbort);
				reject(fail(errParam === "access_denied" ? "cancelled" : "identity", `OAuth error: ${errParam}`));
				return;
			}

			const code = params.get("code");
			if (!code) {
				res.writeHead(400, { "Content-Type": "text/plain" }).end("Missing authorization code.");
				cleanup();
				signal?.removeEventListener("abort", onAbort);
				reject(fail("protocol", "No code returned in callback."));
				return;
			}

			res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end(
				"Authentication successful! You may return to LearnHarness and close this tab.",
			);
			cleanup();
			signal?.removeEventListener("abort", onAbort);
			resolve({ code, verifier, redirectUri });
		});
	});

	await openExternal(authUrl.toString());

	return codePromise;
}

module.exports = { startPkceLoopback, randomString, sha256Base64Url };
