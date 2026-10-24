import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "learnharness-dev.sh");

test("learnharness-dev launcher script exists and is executable", () => {
	assert.ok(fs.existsSync(SCRIPT), "scripts/learnharness-dev.sh exists");
	const stats = fs.statSync(SCRIPT);
	assert.ok(stats.mode & 0o111, "scripts/learnharness-dev.sh has executable permissions");
});

test("learnharness-dev --help displays usage and options", () => {
	const res = spawnSync(SCRIPT, ["--help"], { encoding: "utf8" });
	assert.equal(res.status, 0, "exits with status 0");
	assert.match(res.stdout, /learnharness-dev/);
	assert.match(res.stdout, /--web/);
	assert.match(res.stdout, /--clean/);
	assert.match(res.stdout, /--port/);
});

test("learnharness-dev verifies numeric port requirement", () => {
	const res = spawnSync(SCRIPT, ["--port", "invalid"], { encoding: "utf8" });
	assert.notEqual(res.status, 0, "fails with non-numeric port");
	assert.match(res.stderr, /error: --port must be a numeric port/);
});

test("learnharness-dev maintains isolation from production launcher", () => {
	const userBin = path.join(os.homedir(), ".local", "bin");
	const prodLauncher = path.join(userBin, "learnharness");
	const devLauncher = path.join(userBin, "learnharness-dev");

	assert.ok(fs.existsSync(devLauncher), "dev launcher exists in ~/.local/bin");
	const resolvedDev = fs.realpathSync(devLauncher);
	assert.equal(resolvedDev, fs.realpathSync(SCRIPT), "dev launcher resolves to repo script");

	if (fs.existsSync(prodLauncher)) {
		const resolvedProd = fs.realpathSync(prodLauncher);
		assert.notEqual(resolvedProd, resolvedDev, "production launcher is distinct from dev launcher");
		assert.match(resolvedProd, /AppRun/, "production launcher points to AppRun package");
	}
});
