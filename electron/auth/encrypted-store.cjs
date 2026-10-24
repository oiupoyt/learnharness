"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const fail = (code, message) => {
	const err = new Error(message || code);
	err.code = code;
	return err;
};

/**
 * Generalized encrypted envelope store using Electron's safeStorage.
 * No plaintext fallback: requires native OS secure storage.
 */
function createEncryptedStore(filePath, safeStorage, validator = (s) => s) {
	function checkSecure() {
		if (
			!safeStorage ||
			typeof safeStorage.isEncryptionAvailable !== "function" ||
			!safeStorage.isEncryptionAvailable() ||
			(typeof safeStorage.getSelectedStorageBackend === "function" &&
				safeStorage.getSelectedStorageBackend() === "basic_text")
		) {
			throw fail("secure_storage", "Secure credential storage is unavailable on this system.");
		}
	}

	return {
		checkSecure,
		async read() {
			checkSecure();
			try {
				const content = await fs.readFile(filePath, "utf8");
				const envelope = JSON.parse(content);
				if (
					!envelope ||
					envelope.version !== 1 ||
					typeof envelope.encrypted !== "string" ||
					!envelope.encrypted
				) {
					throw fail("storage", "Corrupted credential envelope.");
				}
				const decryptedJson = safeStorage.decryptString(Buffer.from(envelope.encrypted, "base64"));
				const state = JSON.parse(decryptedJson);
				return validator(state);
			} catch (err) {
				if (err.code === "ENOENT") return null;
				if (err.code === "secure_storage") throw err;
				throw fail("storage", "Failed to decrypt stored credentials.");
			}
		},
		async write(state) {
			checkSecure();
			validator(state);
			const tempFile = `${filePath}.${crypto.randomUUID()}.tmp`;
			let handle = null;
			try {
				const encrypted = safeStorage
					.encryptString(JSON.stringify(state))
					.toString("base64");
				await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
				handle = await fs.open(tempFile, "wx", 0o600);
				await handle.writeFile(JSON.stringify({ version: 1, encrypted }));
				await handle.sync();
				await handle.close();
				handle = null;
				await fs.rename(tempFile, filePath);
				if (process.platform !== "win32") {
					const dir = await fs.open(path.dirname(filePath), "r");
					try {
						await dir.sync();
					} finally {
						await dir.close();
					}
				}
			} catch (err) {
				if (err.code === "secure_storage") throw err;
				throw fail("storage", "Failed to securely save credentials.");
			} finally {
				if (handle) {
					await handle.close().catch(() => {});
				}
				await fs.unlink(tempFile).catch(() => {});
			}
		},
	};
}

module.exports = { createEncryptedStore };
