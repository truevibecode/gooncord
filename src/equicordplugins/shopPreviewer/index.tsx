/*
 * Gooncord, a Discord client mod
 * Copyright (c) 2026 truevibecode and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addHeaderBarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { PaintbrushIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import { openModal } from "@webpack/common";

import { ShopPreviewerModal } from "./ui";

function openShopPreviewer() {
    openModal(modalProps => (
        <ShopPreviewerModal onClose={modalProps.onClose} />
    ));
}

export default definePlugin({
    name: "ShopPreviewer",
    description: "Multi-slot Shop & Collectibles Studio: search and preview Avatar Decos, Profile Effects, and Nameplates simultaneously with Orbs/Fiat prices and Jump to Shop shortcuts.",
    tags: ["Media", "Utility"],
    authors: [{ name: "Onyx", id: 0n }],

    start() {
        addHeaderBarButton({
            id: "gc-shop-previewer-btn",
            icon: PaintbrushIcon,
            tooltip: "Shop Combo Studio & Previewer",
            onClick: openShopPreviewer
        });
    },

    stop() {
        removeHeaderBarButton("gc-shop-previewer-btn");
    }
});
