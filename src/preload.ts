/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
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

import { debounce } from "@shared/debounce";
import { IpcEvents } from "@shared/IpcEvents";
import { contextBridge, webFrame } from "electron/renderer";

import VencordNative, { invoke } from "./VencordNative";

contextBridge.exposeInMainWorld("VencordNative", VencordNative);

// Discord
if (location.protocol !== "data:") {
    invoke(IpcEvents.INIT_FILE_WATCHERS);

    if (IS_DISCORD_DESKTOP) {
        // File handoff: the renderer loads as vencord://renderer.js (real
        // script element) so Chromium can use V8 code caching across restarts
        // instead of re-parsing a 3.4MB eval string every boot. Falls back to
        // the classic eval handoff if the scheme isn't servable yet.
        // Never swallow errors: silent catch = "looks vanilla", no diagnostics.
        void (async () => {
            const loadViaScriptTag = `new Promise((res, rej) => { try { var s = document.createElement("script"); s.src = "vencord://renderer.js"; s.onload = function () { res(0); }; s.onerror = function () { rej(new Error("renderer script tag failed")); }; (document.head || document.documentElement).appendChild(s); } catch (e) { rej(e); } })`;
            try {
                await webFrame.executeJavaScript(loadViaScriptTag);
            } catch (err: any) {
                try {
                    await webFrame.executeJavaScript(await invoke<string>(IpcEvents.PRELOAD_GET_RENDERER_JS));
                } catch (err2: any) {
                    console.error("[Gooncord] Renderer eval failed:", err2?.message ?? err2, err2?.stack?.slice(0, 2000) ?? "");
                }
            }
        })();
        // Not supported in sandboxed preload scripts but Discord doesn't support it either so who cares
        const discordPreload = process.env.DISCORD_PRELOAD;
        if (discordPreload) require(discordPreload);
        else console.error("[Gooncord] DISCORD_PRELOAD env missing, skipping Discord preload.");
    }
} // Monaco popout
else {
    contextBridge.exposeInMainWorld("setCss", debounce(VencordNative.quickCss.set));
    contextBridge.exposeInMainWorld("getCurrentCss", VencordNative.quickCss.get);
    contextBridge.exposeInMainWorld("getTheme", VencordNative.quickCss.getEditorTheme);
}
