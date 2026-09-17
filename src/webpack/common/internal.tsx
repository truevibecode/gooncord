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

import { Logger } from "@utils/Logger";
import { LazyComponent, LazyComponentWrapper } from "@utils/react";
import { FilterFn, lazyWebpackSearchHistory, waitFor } from "@webpack";
import { ComponentType } from "react";

const logger = new Logger("Webpack");

export function waitForComponent<T extends ComponentType<any> = ComponentType<any> & Record<string, any>>(name: string, filter: FilterFn | string | string[], fallbackValue: ComponentType<any> | null = null) {
    if (IS_REPORTER) lazyWebpackSearchHistory.push(["waitForComponent", Array.isArray(filter) ? filter : [filter]]);

    let myValue: T | null = null;

    const lazyComponent = LazyComponent(() => {
        if (myValue) return myValue;

        const error = new Error(`Vencord could not find the ${name} Component`);
        logger.error(error);

        if (IS_DEV) throw error;

        return fallbackValue!;
    }) as LazyComponentWrapper<T>;

    waitFor(filter, (v: any) => {
        myValue = v;
        Object.assign(lazyComponent, v);
    }, { isIndirect: true });

    return lazyComponent;
}

export function waitForStore(name: string, cb: (v: any) => void) {
    if (IS_REPORTER) lazyWebpackSearchHistory.push(["waitForStore", [name]]);

    let set = pendingStoreCbs.get(name);
    if (!set) pendingStoreCbs.set(name, set = new Set());
    set.add(cb);
    registerStoreDispatcher();
}

// Multiplexed dispatcher: ~70 waitForStore calls share ONE subscription
// instead of testing every module against 70 displayName filters.
// Re-registers itself while names remain (runFactoryWithWrap deletes a
// subscription on first match, so one-shot registration can't multiplex).
const pendingStoreCbs = new Map<string, Set<(v: any) => void>>();
let storeDispatcherActive = false;
function registerStoreDispatcher() {
    if (storeDispatcherActive) return;
    storeDispatcherActive = true;
    waitFor((m: any) => {
        if (m == null || (typeof m !== "object" && typeof m !== "function")) return false;
        const dn = (m as any).constructor?.displayName;
        return typeof dn === "string" && pendingStoreCbs.has(dn);
    }, (store: any) => {
        storeDispatcherActive = false;
        const dn = store?.constructor?.displayName;
        const cbs = typeof dn === "string" ? pendingStoreCbs.get(dn) : undefined;
        if (dn) pendingStoreCbs.delete(dn);
        if (cbs) for (const fn of cbs) {
            try { fn(store); } catch (e) { logger.error("Error in waitForStore callback:\n", e); }
        }
        if (pendingStoreCbs.size > 0) registerStoreDispatcher();
    }, { isIndirect: true });
}
