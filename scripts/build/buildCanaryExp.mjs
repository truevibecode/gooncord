#!/usr/bin/node
/*
 * CANARY EXPERIMENT ONLY (exp/canary-risky). Does not touch dist/desktop
 * (Stable) or dist/equibop. Builds a split ESM renderer into
 * dist/canary-exp so heavy dynamic imports (jsqr/ffmpeg/gifenc/fflate,
 * streamparser, native-file-system-adapter) become real on-demand chunks.
 */

// @ts-check

// @ts-check

import { readdir, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

import { BUILD_TIMESTAMP, commonOpts, exists, globPlugins, IS_DEV, IS_REPORTER, IS_COMPANION_TEST, IS_STANDALONE, IS_UPDATER_DISABLED, resolvePluginName, VERSION, commonRendererPlugins, watch, buildOrWatchAll, stringifyValues, IS_ANTI_CRASH_TEST } from "./common.mjs";

const defines = stringifyValues({
    IS_STANDALONE,
    IS_DEV,
    IS_REPORTER,
    IS_COMPANION_TEST,
    IS_UPDATER_DISABLED,
    IS_ANTI_CRASH_TEST,
    IS_WEB: false,
    IS_EXTENSION: false,
    IS_USERSCRIPT: false,
    VERSION,
    BUILD_TIMESTAMP
});

if (defines.IS_STANDALONE === "false") {
    defines["process.platform"] = JSON.stringify(process.platform);
}

/**
 * @type {import("esbuild").BuildOptions}
 */
const nodeCommonOpts = {
    ...commonOpts,
    define: defines,
    format: "cjs",
    platform: "node",
    target: ["esnext"],
    external: ["electron", "original-fs", "~pluginNatives", ...commonOpts.external]
};

const sourceMapFooter = s => watch ? "" : `//# sourceMappingURL=vencord://${s}.js.map`;
const sourcemap = watch ? "inline" : "external";

/**
 * Mirrors globNativesPlugin in build.mjs (locals can't be imported).
 * @type {import("esbuild").Plugin}
 */
const globNativesPlugin = {
    name: "glob-natives-plugin",
    setup: build => {
        const filter = /^~pluginNatives$/;
        build.onResolve({ filter }, args => {
            return {
                namespace: "import-natives",
                path: args.path
            };
        });

        build.onLoad({ filter, namespace: "import-natives" }, async () => {
            const pluginDirs = ["plugins", "equicordplugins", "userplugins"];
            let code = "";
            let natives = "\n";
            let i = 0;
            /**
             * @type {string[]}
             */
            const watchFiles = [];
            for (const dir of pluginDirs) {
                const dirPath = join("src", dir);
                if (!await exists(dirPath)) continue;
                const plugins = await readdir(dirPath, { withFileTypes: true });
                for (const file of plugins) {
                    const fileName = file.name;
                    const nativePath = join(dirPath, fileName, "native.ts");
                    const indexNativePath = join(dirPath, fileName, "native/index.ts");

                    watchFiles.push(resolve(nativePath), resolve(indexNativePath));

                    if (!(await exists(nativePath)) && !(await exists(indexNativePath)))
                        continue;

                    const pluginName = await resolvePluginName(dirPath, file);

                    const mod = `p${i}`;
                    code += `import * as ${mod} from "./${dir}/${fileName}/native";\n`;
                    natives += `${JSON.stringify(pluginName)}:${mod},\n`;
                    i++;
                }
            }
            code += `export default {${natives}};`;
            return {
                contents: code,
                resolveDir: "./src",
                watchDirs: pluginDirs.map(d => resolve("src", d)),
                watchFiles,
            };
        });
    }
};

/** @type {import("esbuild").BuildOptions[]} */
const buildConfigs = ([
    // Canary-exp main (same as desktop patcher, different outdir)
    {
        ...nodeCommonOpts,
        entryPoints: [join(dirname(fileURLToPath(import.meta.url)), "../../src/main/index.ts")],
        outfile: "dist/canary-exp/patcher.js",
        footer: { js: "//# sourceURL=file:///VencordPatcher\n" + sourceMapFooter("patcher") },
        sourcemap,
        plugins: [
            ...nodeCommonOpts.plugins,
            globNativesPlugin
        ],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "true",
            IS_VESKTOP: "false",
            IS_EQUIBOP: "false"
        }
    },
    // Canary-exp renderer: ESM + splitting so dynamic imports become real chunks.
    {
        ...commonOpts,
        entryPoints: [join(dirname(fileURLToPath(import.meta.url)), "../../src/Vencord.ts")],
        outdir: "dist/canary-exp",
        entryNames: "renderer",
        chunkNames: "chunks/[name]-[hash]",
        assetNames: "assets/[name]-[hash]",
        format: "esm",
        splitting: true,
        target: ["esnext"],
        footer: { js: "//# sourceURL=file:///VencordRenderer\n" + sourceMapFooter("renderer") },
        sourcemap,
        metafile: true,
        plugins: [
            globPlugins("discordDesktop"),
            ...commonOpts.plugins
        ],
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "true",
            IS_VESKTOP: "false",
            IS_EQUIBOP: "false"
        }
    },
    // Canary-exp preload: loads renderer via dynamic file:// import.
    {
        ...nodeCommonOpts,
        entryPoints: [join(dirname(fileURLToPath(import.meta.url)), "../../src/preloadCanaryExp.ts")],
        outfile: "dist/canary-exp/preload.js",
        footer: { js: "//# sourceURL=file:///VencordPreload\n" + sourceMapFooter("preload") },
        sourcemap,
        define: {
            ...defines,
            IS_DISCORD_DESKTOP: "true",
            IS_VESKTOP: "false",
            IS_EQUIBOP: "false"
        }
    },
]);

const results = [];
const origBuild = (await import("esbuild")).build;
for (const cfg of buildConfigs) {
    const res = await origBuild(cfg).catch(error => {
        console.error(error.message);
        process.exit(1);
    });
    if (res?.metafile) results.push(res.metafile);
}

await writeFile("dist/canary-exp/package.json", JSON.stringify({
    name: "equicord",
    main: "patcher.js"
}));

if (results[1]) {
    await writeFile("dist/canary-exp/meta.json", JSON.stringify(results[1]));
    const outputs = results[1].outputs;
    const rows = Object.entries(outputs)
        .map(([name, meta]) => ({ name, bytes: meta.bytes }))
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 25);
    console.log("\n[canary-exp] largest outputs:");
    for (const r of rows) console.log(`  ${(r.bytes / 1024).toFixed(1)}kb  ${r.name}`);
}
