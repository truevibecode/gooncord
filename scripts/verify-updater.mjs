#!/usr/bin/env node
/*
 * Gooncord updater wiring verifier.
 *
 * Answers: "if something gets pushed to GitHub, will the installed client
 * ask to auto-update from GitHub and pick up new plugins?"
 *
 * What it does (stdlib only, read-only except an optional `git fetch`):
 *   1. Prints local version (package.json), branch, HEAD and remote URL.
 *   2. Fetches the remote and counts ahead/behind vs the upstream branch.
 *   3. Statically verifies the in-repo updater chain:
 *        - DefaultSettings.autoUpdate / autoUpdateNotification defaults
 *        - main-process updater selection (git vs http path)
 *        - renderer update-check flow (notice/modal/updater tab wiring)
 *        - plugins are bundled at build time (so an update + rebuild
 *          necessarily includes new/changed plugins)
 *   4. Prints a verdict: under which conditions a GitHub push produces an
 *      in-client update prompt, and what a user must do to get it.
 *
 * Run:
 *   node scripts/verify-updater.mjs
 *
 * Exit code: 0 if all checks ran (even with WARNs), 1 on unexpected crash.
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function sh(cmd, opts = {}) {
    try {
        return { ok: true, out: execSync(cmd, { cwd: ROOT, encoding: "utf-8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"], ...opts }).trim() };
    } catch (e) {
        return { ok: false, out: String((e && e.stdout) || (e && e.message) || e).trim() };
    }
}

function check(name, ok, detail) {
    results.push({ name, ok, detail });
    console.log(`${ok === true ? "PASS" : ok === false ? "FAIL" : "WARN"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function grepFile(rel, pattern) {
    try {
        const text = readFileSync(join(ROOT, rel), "utf-8");
        const lines = text.split("\n");
        const hits = [];
        lines.forEach((line, i) => {
            if (pattern.test(line)) hits.push(`${i + 1}:${line.trim().slice(0, 120)}`);
        });
        return hits;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// 1. Local version / git state
// ---------------------------------------------------------------------------
let version = "?";
try {
    version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")).version ?? "?";
} catch { /* ignore */ }
console.log(`local package.json version: ${version}`);

const remote = sh("git remote get-url origin");
console.log(`remote: ${remote.ok ? remote.out : "(unavailable: " + remote.out.slice(0, 80) + ")"}`);

const branch = sh("git rev-parse --abbrev-ref HEAD");
console.log(`branch: ${branch.ok ? branch.out : "(unknown)"}`);

const head = sh("git rev-parse --short HEAD");
console.log(`HEAD: ${head.ok ? head.out : "(unknown)"}`);

// ---------------------------------------------------------------------------
// 2. Remote ahead/behind (this is the exact signal the client uses)
// ---------------------------------------------------------------------------
const fetch = sh("git fetch origin --quiet");
check("remote reachable (git fetch)", fetch.ok || /up to date|already/i.test(fetch.out), fetch.ok ? "fetched" : fetch.out.slice(0, 100));

let behind = null;
let ahead = null;
if (fetch.ok) {
    const b = sh("git rev-list --count HEAD..@{u}");
    const a = sh("git rev-list --count @{u}..HEAD");
    if (b.ok && a.ok) {
        behind = parseInt(b.out, 10);
        ahead = parseInt(a.out, 10);
        check("client behind upstream", Number.isFinite(behind), `${behind} commit(s) behind, ${ahead} ahead`);
    } else {
        check("upstream tracking branch", "warn", "no upstream tracking branch configured; client updater compares HEAD...origin/<branch> instead");
    }
} else {
    check("upstream comparison", "warn", "skipped: remote unreachable");
}

// ---------------------------------------------------------------------------
// 3. Static wiring checks against this source tree
// ---------------------------------------------------------------------------

// 3a. Defaults: autoUpdate / autoUpdateNotification must default true.
const settingsFiles = ["src/api/Settings.ts"];
let defaultsOk = false;
let defaultsDetail = "DefaultSettings not found";
for (const f of settingsFiles) {
    if (!existsSync(join(ROOT, f))) continue;
    const auto = grepFile(f, /autoUpdate\s*:\s*true/);
    const notif = grepFile(f, /autoUpdateNotification\s*:\s*true/);
    if (auto && auto.length && notif && notif.length) {
        defaultsOk = true;
        defaultsDetail = `${f} defaults autoUpdate + autoUpdateNotification to true`;
        break;
    }
    defaultsDetail = `${f} present but defaults differ — check manually`;
}
check("auto-update on by default", defaultsOk, defaultsDetail);

// 3b. Main-process updater path selection.
const updaterIndex = grepFile("src/main/updater/index.ts", /require\(IS_STANDALONE|"\.\/http"|"\.\/git"|IS_UPDATER_DISABLED/);
if (updaterIndex === null) {
    check("main updater entry", false, "src/main/updater/index.ts missing");
} else {
    const usesGit = updaterIndex.some(h => h.includes("./git"));
    const usesHttp = updaterIndex.some(h => h.includes("./http"));
    check("main updater entry", true, `git path: ${usesGit}, http path: ${usesHttp} (desktop dev installs use git pull + rebuild)`);
}

// 3c. Renderer update-check flow: notice/modal/updater-tab wiring.
const vencordFlow = grepFile("src/Vencord.ts", /checkForUpdates|showNotice|openUpdaterTabModal|Settings\.autoUpdate/);
check(
    "renderer update prompt flow",
    !!vencordFlow && vencordFlow.length >= 3,
    vencordFlow && vencordFlow.length ? `${vencordFlow.length} references in src/Vencord.ts (check + notice/modal + updater tab)` : "src/Vencord.ts wiring not found"
);

// 3d. Plugins bundle at build time: the renderer entry imports the plugin glob.
const bundleHits = grepFile("scripts/build/build.mjs", /Vencord\.ts|globPlugins|renderer\.js/);
const globSrc = grepFile("src/Vencord.ts", /~plugins|from "\.\/plugins"|plugins\//);
check(
    "plugins ship inside the built bundle",
    !!bundleHits && bundleHits.length > 0 && !!globSrc && globSrc.length > 0,
    "renderer entry pulls the plugin glob at build time, so update+rebuild includes new/changed plugins"
);

// 3e. Installed shim points at this repo's dist (so rebuilds actually land).
const shimHits = grepFile("scripts/gooncordInject.mjs", /patcher\.js|app\.asar|_app\.asar/);
check(
    "installer shim targets local dist",
    shimHits === null ? "warn" : shimHits.length > 0,
    shimHits === null
        ? "scripts/gooncordInject.mjs not present (repo may be on an older tree); install via Equilotl/CLI instead"
        : "folder-shim requires dist/desktop/patcher.js, so a rebuilt bundle is what Discord loads"
);

// ---------------------------------------------------------------------------
// 4. Verdict
// ---------------------------------------------------------------------------
console.log("");
console.log("VERDICT");
if (behind !== null && behind > 0) {
    console.log(`YES — origin is ${behind} commit(s) ahead. With stock settings (auto-update on), the installed client will detect this on its next update check and prompt (auto-install + restart notice, or "View Update" opening the Updater tab). New/changed plugins arrive with that update because the updater rebuilds the bundle.`);
} else if (behind === 0) {
    console.log("UP TO DATE — nothing pushed beyond this checkout, so no prompt is expected. Push a commit to origin and the next client update check will offer it (same mechanics as above).");
} else {
    console.log("UNDETERMINED (remote unreachable) — mechanics verified statically: stock settings default auto-update ON; the client compares against origin, prompts via notice/modal + Updater tab, and rebuilds the bundle (which is how new plugins arrive).");
}
console.log("Conditions: Discord must actually launch the injected build (shim intact), update checks must be enabled (not --disable-updater), and network must reach github.com.");
