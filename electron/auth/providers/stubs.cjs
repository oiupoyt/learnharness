"use strict";

const { OAUTH_PROVIDERS } = require("../descriptors.cjs");

function createStubProvider(providerId) {
	const descriptor = OAUTH_PROVIDERS.find((p) => p.id === providerId) || {
		id: providerId,
		name: providerId,
		supported: false,
		unsupportedReason: "OAuth login is not supported for this provider.",
	};

	return {
		id: providerId,
		async status() {
			return {
				providerId,
				available: true,
				supported: false,
				unsupportedReason: descriptor.unsupportedReason,
				pending: false,
				devicePrompt: null,
				activeAccountId: null,
				accounts: [],
				error: null,
			};
		},
		async login() {
			const err = new Error(
				descriptor.unsupportedReason ||
					`${descriptor.name} does not offer an official public OAuth flow for third-party apps. Please configure an API key instead.`,
			);
			err.code = "unsupported";
			throw err;
		},
		async cancel() {
			return this.status();
		},
		async disconnect() {
			return this.status();
		},
	};
}

module.exports = { createStubProvider };
