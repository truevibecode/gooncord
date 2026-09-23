/*
 * Purge — persisted knobs for the in-client message cleanup engine.
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    deleteDelayMs: {
        description: "Base wait between deletions in milliseconds. Higher is safer against lockouts.",
        type: OptionType.NUMBER,
        default: 1500,
        restartNeeded: false
    },
    deleteJitterMs: {
        description: "Extra random wait ceiling in milliseconds, so deletions don't look robotic.",
        type: OptionType.NUMBER,
        default: 1000,
        restartNeeded: false
    },
    archiveBeforeDelete: {
        description: "Download a JSON archive of matched messages before deleting anything.",
        type: OptionType.BOOLEAN,
        default: true
    },
    confirmBeforeDelete: {
        description: "Always ask for confirmation before a deletion run starts.",
        type: OptionType.BOOLEAN,
        default: true
    }
});
