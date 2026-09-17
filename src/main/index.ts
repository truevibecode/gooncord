/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import "./ipcMain";

import { app, net, protocol } from "electron";
import { join } from "path";
import { pathToFileURL } from "url";

import { initCsp } from "./csp";
import { RendererSettings } from "./settings";
import { IS_VANILLA, THEMES_DIR } from "./utils/constants";
import { ensureSafePath } from "./utils/ensureSafePath";
import { installExt } from "./utils/extensions";

if (!IS_VANILLA && !IS_EXTENSION) {
    app.whenReady().then(() => {
        // Single factory for the vencord:// + equicord:// schemes (theme alias
        // kept for back-compat; *.js.map routes 404 in prod, maps are CI-only).
        const serveGoonScheme = (scheme: string) => async ({ url: unsafeUrl }: { url: string; }) => {
            let url = decodeURI(unsafeUrl).slice(`${scheme}://`.length).replace(/\?v=\d+$/, "");

            if (url.endsWith("/")) url = url.slice(0, -1);

            if (url.startsWith("/themes/")) {
                const theme = url.slice("/themes/".length);

                const safeUrl = ensureSafePath(THEMES_DIR, theme);
                if (!safeUrl) {
                    return new Response(null, {
                        status: 404
                    });
                }

                return net.fetch(pathToFileURL(safeUrl).toString());
            }

            // Source Maps! Maybe there's a better way but since the renderer is executed
            // from a string I don't think any other form of sourcemaps would work

            switch (url) {
                // Served as a real file (not eval) so Chromium can use V8 code
                // caching across restarts. See preload renderer handoff.
                case "renderer.js":
                    try {
                        return await net.fetch(pathToFileURL(join(__dirname, url)).toString());
                    } catch {
                        return new Response(null, {
                            status: 404
                        });
                    }
                case "renderer.js.map":
                case "preload.js.map":
                case "patcher.js.map":
                case "main.js.map":
                    try {
                        return await net.fetch(pathToFileURL(join(__dirname, url)).toString());
                    } catch {
                        return new Response(null, {
                            status: 404
                        });
                    }
                default:
                    return new Response(null, {
                        status: 404
                    });
            }
        };

        protocol.handle("vencord", serveGoonScheme("vencord"));
        protocol.handle("equicord", serveGoonScheme("equicord"));

        try {
            if (RendererSettings.store.enableReactDevtools)
                installExt("fmkadmapgofadopljbjfkapdkoienihi")
                    .then(() => console.info("[Equicord] Installed React Developer Tools"))
                    .catch(err => console.error("[Equicord] Failed to install React Developer Tools", err));
        } catch { }

        initCsp();
    });
}

if (IS_DISCORD_DESKTOP) {
    require("./patcher");
}
