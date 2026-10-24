"use strict";

const fail = (code, message) => {
	const err = new Error(message || code);
	err.code = code;
	return err;
};

/**
 * RFC 8628 Device Authorization Flow Primitive.
 */
async function initiateDeviceFlow({
	clientId,
	scope = "read:user",
	endpoint,
	fetch = globalThis.fetch,
	signal,
}) {
	const body = new URLSearchParams({
		client_id: clientId,
		scope,
	});

	const res = await fetch(endpoint, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		},
		body: body.toString(),
		signal,
	});

	if (!res.ok) {
		throw fail("network", `Device authorization request failed (${res.status}).`);
	}

	const data = await res.json();
	if (!data.device_code || !data.user_code || !data.verification_uri) {
		throw fail("protocol", "Invalid device code response from provider.");
	}

	return {
		deviceCode: data.device_code,
		userCode: data.user_code,
		verificationUri: data.verification_uri,
		verificationUriComplete: data.verification_uri_complete || null,
		expiresIn: Number(data.expires_in) || 900,
		interval: Math.max(Number(data.interval) || 5, 1),
	};
}

/**
 * Poll the token endpoint until user approves or code expires.
 */
async function pollDeviceToken({
	clientId,
	deviceCode,
	endpoint,
	interval = 5,
	expiresIn = 900,
	fetch = globalThis.fetch,
	signal,
}) {
	const deadline = Date.now() + expiresIn * 1000;
	let currentInterval = interval;

	const sleep = (ms) =>
		new Promise((resolve, reject) => {
			if (signal?.aborted) return reject(fail("cancelled", "Sign-in cancelled."));
			const timer = setTimeout(resolve, ms);
			signal?.addEventListener(
				"abort",
				() => {
					clearTimeout(timer);
					reject(fail("cancelled", "Sign-in cancelled."));
				},
				{ once: true },
			);
		});

	while (Date.now() < deadline) {
		if (signal?.aborted) throw fail("cancelled", "Sign-in cancelled.");
		await sleep(currentInterval * 1000);

		const body = new URLSearchParams({
			client_id: clientId,
			device_code: deviceCode,
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
		});

		let res;
		try {
			res = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
					Accept: "application/json",
				},
				body: body.toString(),
				signal,
			});
		} catch (err) {
			if (signal?.aborted) throw fail("cancelled", "Sign-in cancelled.");
			throw fail("network", "Failed to contact authorization server.");
		}

		const data = await res.json();

		if (data.access_token) {
			return {
				accessToken: data.access_token,
				tokenType: data.token_type || "Bearer",
				scope: data.scope ? data.scope.split(/[\s,]+/) : [],
				refreshToken: data.refresh_token,
				expiresIn: data.expires_in ? Number(data.expires_in) : null,
			};
		}

		const error = data.error;
		if (error === "authorization_pending") {
			continue;
		}
		if (error === "slow_down") {
			currentInterval += 5;
			continue;
		}
		if (error === "expired_token") {
			throw fail("timeout", "Device code expired. Please initiate sign-in again.");
		}
		if (error === "access_denied") {
			throw fail("cancelled", "Sign-in was denied by the user.");
		}

		throw fail("protocol", data.error_description || `Device authorization error: ${error}`);
	}

	throw fail("timeout", "Device sign-in timed out. Please try again.");
}

module.exports = { initiateDeviceFlow, pollDeviceToken };
