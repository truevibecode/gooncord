/*
 * Gooncord, a modification for Discord's desktop app
 * Gooncord-native injector — no Equilotl / Equibop / Equicord binary needed.
 *
 * Working method (verified on this repo):
 * - Discord loads `resources/app.asar` first. We turn that path into a
 *   directory shim: rename vanilla `app.asar` file -> `_app.asar`,
 *   create `app.asar/` dir with `package.json` + `index.js` that requires
 *   the absolute path to `dist/desktop/patcher.js` built from current src.
 * - `src/main/patcher.ts` then resolves `_app.asar` as the real Discord
 *   (`join(dirname(injectorPath), "..", "_app.asar")`) and loads it.
 * - Legacy upstream style (`resources/app/` folder shim) is also detected
 *   and migrated/updated so old Equicord/Vencord installs don't linger.
 *
 * Usage:
 *   node scripts/gooncordInject.mjs --install [--branch stable|ptb|canary|all] [--location <path-to-resources-or-app-version>]
 *   node scripts/gooncordInject.mjs --uninstall [...]
 *   node scripts/gooncordInject.mjs --repair [...]
 */

import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { basename, dirname, join, resolve, sep } from "path";
import { fileURLToPath } from "url";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const PATCHER_JS = join(BASE_DIR, "dist", "desktop", "patcher.js");

const STUB_PACKAGE = JSON.stringify({ name: "discord", main: "index.js" });
const makeStubIndex = patcherPath => `require(${JSON.stringify(patcherPath)});\n`;

const isAlreadyPatchedAsarDir = resources => {
    // Equilotl/Gooncord style: app.asar is a dir, _app.asar is the vanilla file
    try {
        return existsSync(join(resources, "_app.asar"))
            && existsSync(join(resources, "app.asar"))
            && lstatSync(join(resources, "app.asar")).isDirectory();
    } catch { return false; }
};

const isLegacyAppDirPatched = resources => {
    try {
        return existsSync(join(resources, "_app.asar"))
            && existsSync(join(resources, "app"))
            && lstatSync(join(resources, "app")).isDirectory();
    } catch { return false; }
};

const readShimTarget = shimIndex => {
    try {
        const content = readFileSync(shimIndex, "utf-8");
        const m = content.match(/require\((["'])(.+?)\1\)/);
        return m ? m[2] : content.trim().slice(0, 200);
    } catch { return "<unreadable>"; }
};

function patchResourcesDir(resources, patcherJsPath) {
    const appAsar = join(resources, "app.asar");
    const _appAsar = join(resources, "_app.asar");
    const legacyApp = join(resources, "app");

    // Case 1: already on Gooncord app.asar-dir method — just refresh shim.
    if (isAlreadyPatchedAsarDir(resources)) {
        writeFileSync(join(appAsar, "package.json"), STUB_PACKAGE);
        writeFileSync(join(appAsar, "index.js"), makeStubIndex(patcherJsPath));
        return "refreshed";
    }

    // Case 1b: packed-asar shim (old canary-exp / Equilotl style) — both
    // app.asar and _app.asar are files, and app.asar is tiny (shim archive)
    // while _app.asar is the real vanilla asar (megabytes). Tear it down
    // and fall through to a fresh Gooncord folder-shim patch.
    try {
        if (existsSync(appAsar) && existsSync(_appAsar)
            && !lstatSync(appAsar).isDirectory() && !lstatSync(_appAsar).isDirectory()) {
            const small = statSync(appAsar).size;
            const big = statSync(_appAsar).size;
            if (small < 100 * 1024 && big > 1024 * 1024) {
                rmSync(appAsar, { force: true });
                renameSync(_appAsar, appAsar);
            } else {
                return "skip";
            }
        }
    } catch { return "skip"; }

    // Case 2: legacy app/ folder shim (upstream Vencord style) — migrate it to
    // the app.asar-dir method so there is exactly one working shim.
    if (isLegacyAppDirPatched(resources)) {
        // Remove stale legacy shim, restore vanilla, then fall through to fresh patch.
        rmSync(legacyApp, { recursive: true, force: true });
        if (existsSync(appAsar)) {
            // app.asar shouldn't exist here, but if it's a leftover file remove it
            try { if (!lstatSync(appAsar).isDirectory()) rmSync(appAsar, { force: true }); } catch {}
        }
        renameSync(_appAsar, appAsar);
    }

    // Case 3: vanilla — app.asar is a file, no _app.asar marker.
    if (!existsSync(appAsar) || existsSync(_appAsar)) return "skip";
    try {
        if (lstatSync(appAsar).isDirectory()) return "skip";
    } catch { return "skip"; }

    renameSync(appAsar, _appAsar);
    try {
        mkdirSync(appAsar);
        writeFileSync(join(appAsar, "package.json"), STUB_PACKAGE);
        writeFileSync(join(appAsar, "index.js"), makeStubIndex(patcherJsPath));
        return "patched";
    } catch (err) {
        // Roll back on partial failure.
        try { rmSync(join(appAsar, "index.js"), { force: true }); } catch {}
        try { rmSync(join(appAsar, "package.json"), { force: true }); } catch {}
        try { rmSync(appAsar, { recursive: true, force: true }); } catch {}
        try { renameSync(_appAsar, appAsar); } catch {}
        throw err;
    }
}

function unpatchResourcesDir(resources) {
    const appAsar = join(resources, "app.asar");
    const _appAsar = join(resources, "_app.asar");
    const legacyApp = join(resources, "app");
    let removed = false;

    // Remove Gooncord app.asar-dir shim.
    if (isAlreadyPatchedAsarDir(resources)) {
        rmSync(appAsar, { recursive: true, force: true });
        removed = true;
    }
    // Remove packed-asar shim (tiny app.asar file + big _app.asar backup).
    try {
        if (!removed && existsSync(appAsar) && existsSync(_appAsar)
            && !lstatSync(appAsar).isDirectory() && !lstatSync(_appAsar).isDirectory()) {
            if (statSync(appAsar).size < 100 * 1024 && statSync(_appAsar).size > 1024 * 1024) {
                rmSync(appAsar, { force: true });
                removed = true;
            }
        }
    } catch {}
    // Remove legacy app/ shim if present.
    if (existsSync(legacyApp)) {
        try {
            if (lstatSync(legacyApp).isDirectory()) {
                rmSync(legacyApp, { recursive: true, force: true });
                removed = true;
            }
        } catch {}
    }
    // Restore vanilla asar.
    if (removed && existsSync(_appAsar) && !existsSync(appAsar)) {
        renameSync(_appAsar, appAsar);
        return "unpatched";
    }
    return removed ? "shim-removed" : "skip";
}

function findResourcesDirs() {
    const dirs = [];
    const pushIfResources = p => {
        try { if (statSync(p).isDirectory()) dirs.push(p); } catch {}
    };

    if (process.platform === "win32") {
        const local = process.env.LOCALAPPDATA;
        const bases = ["Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"]
            .map(n => local ? join(local, n) : null)
            .filter(Boolean);
        for (const base of bases) {
            let entries = [];
            try { entries = readdirSync(base); } catch { continue; }
            for (const name of entries) {
                if (!name.startsWith("app-")) continue;
                const resources = join(base, name, "resources");
                pushIfResources(resources);
            }
        }
    } else if (process.platform === "darwin") {
        for (const appName of ["Discord.app", "Discord Canary.app", "Discord PTB.app", "Discord Development.app"]) {
            for (const prefix of ["/Applications", join(process.env.HOME ?? "", "Applications")]) {
                const resources = join(prefix, appName, "Contents", "Resources");
                pushIfResources(resources);
                // New updater versioned layout: .../Contents/Frameworks/.../Versions/<ver>/Resources
                try {
                    for (const v of readdirSync(join(prefix, appName, "Contents", "Frameworks"))) {
                        pushIfResources(join(prefix, appName, "Contents", "Frameworks", v, "Resources"));
                    }
                } catch {}
            }
        }
    } else {
        for (const p of [
            "/opt/discord/resources",
            "/opt/discordcanary/resources",
            "/opt/discordptb/resources",
            "/opt/Discord/resources",
            "/usr/lib/discord/resources",
            "/usr/share/discord/resources"
        ]) pushIfResources(p);
        // Flatpak / home layouts
        const home = process.env.HOME;
        if (home) {
            for (const p of [
                join(home, ".config/discord/resources"),
                join(home, ".config/discordcanary/resources")
            ]) pushIfResources(p);
        }
    }
    return [...new Set(dirs)];
}

function parseArgs() {
    const args = process.argv.slice(2);
    // Support both `node x.mjs --install` and `node x.mjs -- --install` (pnpm style)
    const flat = args.filter(a => a !== "--");
    const get = name => {
        const i = flat.indexOf(name);
        if (i !== -1) return true;
        return false;
    };
    const getVal = name => {
        const i = flat.findIndex(a => a === name || a.startsWith(name + "="));
        if (i === -1) return null;
        const a = flat[i];
        if (a.includes("=")) return a.split("=").slice(1).join("=");
        return flat[i + 1] ?? null;
    };
    return {
        install: get("--install") || get("--repair"),
        repair: get("--repair"),
        uninstall: get("--uninstall"),
        branch: (getVal("--branch") || "all").toLowerCase(),
        location: getVal("--location")
    };
}

function filterByBranch(dirs, branch) {
    if (!branch || branch === "all" || branch === "auto") return dirs;
    const want = branch.toLowerCase();
    const match = d => {
        const low = d.toLowerCase();
        if (want === "stable") return low.includes(`${"discord"}${sep}app-`) && !low.includes("ptb") && !low.includes("canary") && !low.includes("development");
        if (want === "ptb") return low.includes("ptb");
        if (want === "canary") return low.includes("canary");
        if (want === "dev" || want === "development") return low.includes("development");
        return true;
    };
    return dirs.filter(match);
}

function resolveLocationToResources(location) {
    const abs = resolve(location);
    // Caller may pass .../resources, .../app-1.2.3, or the Discord base dir.
    const candidates = [abs];
    try {
        if (statSync(abs).isDirectory() && basename(abs).startsWith("app-")) {
            candidates.push(join(abs, "resources"));
        }
    } catch {}
    try {
        if (statSync(abs).isDirectory() && !abs.endsWith("resources")) {
            for (const name of readdirSync(abs)) {
                if (name.startsWith("app-")) candidates.push(join(abs, name, "resources"));
            }
        }
    } catch {}
    return candidates.filter(p => {
        try { return statSync(p).isDirectory(); } catch { return false; }
    });
}

const opts = parseArgs();

if (!opts.install && !opts.uninstall) {
    console.log("Gooncord injector — native, no Equilotl/Equibop binary.");
    console.log("");
    console.log("Usage:");
    console.log("  node scripts/gooncordInject.mjs --install   [--branch stable|ptb|canary|all] [--location <path>]");
    console.log("  node scripts/gooncordInject.mjs --repair    (same as --install, overwrites shim)");
    console.log("  node scripts/gooncordInject.mjs --uninstall [...]");
    process.exit(1);
}

if ((opts.install || opts.repair) && !existsSync(PATCHER_JS)) {
    console.error(`[Gooncord] Missing build output: ${PATCHER_JS}`);
    console.error("[Gooncord] Run `pnpm build` first so dist/desktop/patcher.js exists from current src.");
    process.exit(1);
}

let targets;
if (opts.location) {
    targets = resolveLocationToResources(opts.location);
    if (!targets.length) {
        console.error(`[Gooncord] --location did not resolve to any resources dir: ${opts.location}`);
        process.exit(1);
    }
} else {
    targets = filterByBranch(findResourcesDirs(), opts.branch);
}

if (!targets.length) {
    console.error("[Gooncord] No Discord installs found. Pass --location <path-to-Discord-resources> explicitly.");
    process.exit(1);
}

console.log(`[Gooncord] Patcher: ${PATCHER_JS}`);
let acted = 0;
for (const resources of targets) {
    const appAsar = join(resources, "app.asar");
    const shimIndex = join(appAsar, "index.js");
    if (opts.uninstall) {
        const res = unpatchResourcesDir(resources);
        console.log(`[Gooncord] ${resources}: ${res}`);
        if (res !== "skip") acted++;
    } else {
        const before = existsSync(shimIndex) ? readShimTarget(shimIndex) : "<none>";
        const res = patchResourcesDir(resources, PATCHER_JS);
        const after = existsSync(shimIndex) ? readShimTarget(shimIndex) : "<none>";
        console.log(`[Gooncord] ${resources}: ${res}`);
        console.log(`           shim before: ${before}`);
        console.log(`           shim after:  ${after}`);
        if (res !== "skip") acted++;
    }
}

if (!acted) {
    console.log("[Gooncord] Nothing to do — already in desired state or no vanilla app.asar found.");
} else if (opts.uninstall) {
    console.log(`[Gooncord] Uninjected ${acted} install(s). Restart Discord.`);
} else {
    console.log(`[Gooncord] Injected ${acted} install(s) from current src. Restart Discord (close from tray).`);
}
