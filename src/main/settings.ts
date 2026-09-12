/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Settings } from "@api/Settings";
import { IpcEvents } from "@shared/IpcEvents";
import { SettingsStore } from "@shared/SettingsStore";
import { mergeDefaults } from "@utils/mergeDefaults";
import { ipcMain } from "electron";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

import { NATIVE_SETTINGS_FILE, SETTINGS_DIR, SETTINGS_FILE } from "./utils/constants";

mkdirSync(SETTINGS_DIR, { recursive: true });

function readSettings<T = object>(name: string, file: string): Partial<T> {
    try {
        return JSON.parse(readFileSync(file, "utf-8"));
    } catch (err: any) {
        if (err?.code !== "ENOENT")
            console.error(`Failed to read ${name} settings`, err);

        return {};
    }
}

export const RendererSettings = new SettingsStore(readSettings<Settings>("renderer", SETTINGS_FILE));

function makeDebouncedWriter(file: string, getData: () => unknown, delay = 500) {
    let timer: NodeJS.Timeout | undefined;
    return () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
            timer = undefined;
            try {
                writeFileSync(file, JSON.stringify(getData()));
            } catch (e) {
                console.error(`Failed to write ${file} settings`, e);
            }
        }, delay);
    };
}

const scheduleRendererWrite = makeDebouncedWriter(SETTINGS_FILE, () => RendererSettings.plain);
RendererSettings.addGlobalChangeListener(scheduleRendererWrite);

ipcMain.handle(IpcEvents.GET_SETTINGS_DIR, () => SETTINGS_DIR);
ipcMain.on(IpcEvents.GET_SETTINGS, e => e.returnValue = RendererSettings.plain);

ipcMain.handle(IpcEvents.SET_SETTINGS, (_, data: Settings, pathToNotify?: string) => {
    RendererSettings.setData(data, pathToNotify);
});

export interface NativeSettings {
    plugins: {
        [plugin: string]: {
            [setting: string]: any;
        };
    };
    customCspRules: Record<string, string[]>;
}

const DefaultNativeSettings: NativeSettings = {
    plugins: {},
    customCspRules: {}
};

const nativeSettings = readSettings<NativeSettings>("native", NATIVE_SETTINGS_FILE);
mergeDefaults(nativeSettings, DefaultNativeSettings);

export const NativeSettings = new SettingsStore(nativeSettings as NativeSettings);

const scheduleNativeWrite = makeDebouncedWriter(NATIVE_SETTINGS_FILE, () => NativeSettings.plain);
NativeSettings.addGlobalChangeListener(scheduleNativeWrite);
