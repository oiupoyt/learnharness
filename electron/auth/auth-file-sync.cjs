"use strict";

const fs = require("node:fs");
const path = require("node:path");

/**
 * Sync an OAuth token to the app's auth.json so the Next.js server and pi-ai engines
 * immediately pick it up on the next request without a restart.
 */
function syncAuthVar(authFile, key, value) {
	if (!authFile) return;
	try {
		let map = {};
		if (fs.existsSync(authFile)) {
			try {
				map = JSON.parse(fs.readFileSync(authFile, "utf8")) || {};
			} catch {
				map = {};
			}
		}
		if (value === null || value === undefined) {
			delete map[key];
		} else {
			map[key] = value;
		}
		fs.mkdirSync(path.dirname(authFile), { recursive: true });
		const tmp = `${authFile}.tmp-${process.pid}`;
		fs.writeFileSync(tmp, JSON.stringify(map, null, 2), { mode: 0o600 });
		fs.renameSync(tmp, authFile);
		if (process.env) {
			if (value === null || value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	} catch (err) {
		console.error(`[auth-file-sync] Failed to sync ${key} to ${authFile}:`, err);
	}
}

module.exports = { syncAuthVar };
