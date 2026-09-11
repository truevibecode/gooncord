/*
 * Gooncord, a Discord client mod
 * Copyright (c) 2026 truevibecode and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { registerCommand, unregisterCommand } from "@api/Commands";
import { addChannelToolbarButton, addHeaderBarButton, ChannelToolbarButton, HeaderBarButton, removeChannelToolbarButton, removeHeaderBarButton } from "@api/HeaderBar";
import { PaintbrushIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import { openModal } from "@webpack/common";

import { ShopPreviewerModal } from "./ui";

export function openShopPreviewer() {
    openModal(modalProps => (
        <ShopPreviewerModal onClose={modalProps.onClose} />
    ));
}

export default definePlugin({
    name: "ShopPreviewer",
    description: "Multi-slot Shop & Collectibles Studio: search and preview Avatar Decos, Profile Effects, and Nameplates simultaneously with Orbs/Fiat prices and Jump to Shop shortcuts.",
    tags: ["Media", "Utility"],
    authors: [{ name: "Onyx", id: 0n }],
    enabledByDefault: true,

    patches: [
        // Patch Discord's Collectibles Shop Header to insert "Combo Studio" button beside "Search the Shop"
        {
            find: 'collectibles_shop_header_bar',
            replacement: {
                match: /(?<=\.ShopSearchBar,.+?\}\),)/,
                replace: "$&$self.renderShopHeaderButton(),"
            }
        }
    ],

    renderShopHeaderButton() {
        return (
            <button
                key="gc-shop-combo-studio-btn"
                onClick={openShopPreviewer}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    marginLeft: "8px",
                    padding: "6px 14px",
                    borderRadius: "4px",
                    background: "var(--brand-experiment, #5865F2)",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                    height: "34px",
                    verticalAlign: "middle"
                }}
                title="Open Gooncord Shop Combo Studio"
            >
                ✨ Combo Studio
            </button>
        );
    },

    start() {
        addHeaderBarButton("gc-shop-previewer-btn", () => (
            <HeaderBarButton
                icon={PaintbrushIcon}
                tooltip="Shop Combo Studio & Previewer"
                onClick={openShopPreviewer}
            />
        ));

        addChannelToolbarButton("gc-shop-previewer-toolbar", () => (
            <ChannelToolbarButton
                icon={PaintbrushIcon}
                tooltip="Shop Combo Studio"
                onClick={openShopPreviewer}
            />
        ));

        registerCommand({
            name: "shoppreview",
            displayName: "shoppreview",
            description: "Open the Gooncord Shop Combo Studio & Previewer",
            execute: () => {
                openShopPreviewer();
            }
        }, "ShopPreviewer");
    },

    stop() {
        removeHeaderBarButton("gc-shop-previewer-btn");
        removeChannelToolbarButton("gc-shop-previewer-toolbar");
        unregisterCommand("shoppreview");
    }
});
