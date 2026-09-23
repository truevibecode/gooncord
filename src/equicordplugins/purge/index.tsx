/*
 * Purge — bulk self-message cleanup inside the client (scope A).
 * No tokens: auth comes from the running session. Own messages only.
 */

import { TrashIcon } from "@components/Icons";
import definePlugin from "@utils/types";

import "./styles.css";

import { PurgeButton } from "./components/PurgeButton";
import { settings } from "./settings";

export { settings };

export default definePlugin({
    name: "Purge",
    description: "Preview and bulk-delete your own messages per channel, with progress, stop, and archives. Header button, runs in background.",
    tags: ["Utility"],
    authors: [{ name: "ldvy", id: 0n }],
    enabledByDefault: true,
    settings,

    headerBarButton: {
        icon: TrashIcon,
        render: PurgeButton
    }
});
