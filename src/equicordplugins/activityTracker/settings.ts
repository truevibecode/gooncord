/*
 * Gooncord Activity Tracker — persisted toggles.
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    trackOnline: {
        description: "Count time while Discord is running on this device.",
        type: OptionType.BOOLEAN,
        default: true
    },
    trackActive: {
        description: "Count time while the Discord window is visible.",
        type: OptionType.BOOLEAN,
        default: true
    },
    trackVc: {
        description: "Count time spent in voice channels.",
        type: OptionType.BOOLEAN,
        default: true
    },
    vcMilestones: {
        description: "Toast when you hit 30m / 1h / 2h / 4h in voice per day.",
        type: OptionType.BOOLEAN,
        default: true
    },
    showTab: {
        description: "Show the Activity tab under Gooncord settings. Tracking keeps running either way.",
        type: OptionType.BOOLEAN,
        default: true,
        restartNeeded: true
    }
});
