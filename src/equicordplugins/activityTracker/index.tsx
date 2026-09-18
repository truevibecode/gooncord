/*
 * Gooncord Activity Tracker — online / active / voice time with graphs.
 * Per-device tracking (IndexedDB), merge slices across devices via export.
 */

import SettingsPlugin from "@plugins/_core/settings";
import { ClockIcon } from "@components/Icons";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";
import { SelectedChannelStore, UserStore } from "@webpack/common";

import "./styles.css";

import { ActivityTab } from "./components/ActivityTab";
import { settings } from "./settings";
import { tracker } from "./tracker";

export { settings };

export default definePlugin({
    name: "ActivityTracker",
    description: "Tracks your online, active and voice time with graphs on a dedicated Activity tab. Per-device — export/import to merge.",
    tags: ["Utility", "Voice"],
    authors: [{ name: "ldvy", id: 0n }],
    enabledByDefault: true,
    settings,

    flux: {
        VOICE_CHANNEL_SELECT({ channelId, currentVoiceChannelId }: { channelId: string | null; currentVoiceChannelId: string | null; }) {
            tracker.onVoiceSelect(channelId, currentVoiceChannelId);
        },

        CONNECTION_OPEN() {
            // Account (re)login: switch slices so two accounts never mix.
            void tracker.ensureUser(UserStore.getCurrentUser()?.id ?? null).then(() => {
                tracker.resumeVc(SelectedChannelStore.getVoiceChannelId() ?? null);
            });
        }
    },

    async start() {
        tracker.flags = () => ({
            trackOnline: settings.store.trackOnline,
            trackActive: settings.store.trackActive,
            trackVc: settings.store.trackVc,
            vcMilestones: settings.store.vcMilestones
        });

        await tracker.ensureUser(UserStore.getCurrentUser()?.id ?? null);
        tracker.resumeVc(SelectedChannelStore.getVoiceChannelId() ?? null);
        tracker.start();

        if (settings.store.showTab && !SettingsPlugin.customEntries.some(e => e.key === "equicord_activity")) {
            SettingsPlugin.customEntries.push({
                key: "equicord_activity",
                title: "Activity",
                Component: ActivityTab,
                Icon: ClockIcon
            });
        }
    },

    stop() {
        tracker.stop();
        removeFromArray(SettingsPlugin.customEntries, e => e.key === "equicord_activity");
    }
});
