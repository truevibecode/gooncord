/*
240 * Gooncord, a Discord client mod
241 * Copyright (c) 2026 truevibecode and contributors
242 * SPDX-License-Identifier: GPL-3.0-or-later
243 */

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { CopyIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import { Menu, showToast, Toasts } from "@webpack/common";

function isGifUrl(url: string) {
    if (!url) return false;
    const clean = url.split("?")[0].toLowerCase();
    return clean.endsWith(".gif") || url.includes("/gifs/") || clean.endsWith(".gifv");
}

function getImageUrl(props: Record<string, any>): string | null {
    if (!props) return null;
    let url: string | null = null;

    if (typeof props.itemSrc === "string") url = props.itemSrc;
    else if (typeof props.src === "string") url = props.src;
    else if (typeof props.href === "string" && !props.href.startsWith("http")) url = props.href;
    else if (props.target instanceof HTMLElement) {
        const img = props.target.querySelector("img") || props.target.closest("img");
        if (img?.src) url = img.src;
    }

    if (!url || isGifUrl(url)) return null;
    return url;
}

async function copyImageFromUrl(url: string) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        
        // Ensure image/png for clipboard API compatibility
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context failed");
        ctx.drawImage(bitmap, 0, 0);

        canvas.toBlob(async (pngBlob) => {
            if (!pngBlob) {
                showToast("Failed to convert image", Toasts.Type.FAILURE);
                return;
            }
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        "image/png": pngBlob
                    })
                ]);
                showToast("Image copied to clipboard!", Toasts.Type.SUCCESS);
            } catch (err) {
                showToast("Clipboard write failed", Toasts.Type.FAILURE);
            }
        }, "image/png");
    } catch (e) {
        showToast("Failed to copy image", Toasts.Type.FAILURE);
    }
}

const imageMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    const url = getImageUrl(props);
    if (!url) return;

    if (children.some(child => child?.props?.id === "quick-copy-image")) return;

    const copyLinkGroup = findGroupChildrenByChildId("copy-link", children)
        ?? findGroupChildrenByChildId("copy-native-link", children)
        ?? children;

    copyLinkGroup.unshift(
        <Menu.MenuItem
            label="Copy Image (Quick)"
            key="quick-copy-image"
            id="quick-copy-image"
            leadingAccessory={{ type: "icon", icon: CopyIcon }}
            action={() => copyImageFromUrl(url)}
        />
    );
};

const messageMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    const url = getImageUrl(props);
    if (!url) return;

    if (children.some(child => child?.props?.id === "quick-copy-image")) return;

    const copyGroup = findGroupChildrenByChildId("copy-link", children)
        ?? findGroupChildrenByChildId("open-native-link", children);

    if (copyGroup && !copyGroup.some(child => child?.props?.id === "quick-copy-image")) {
        copyGroup.unshift(
            <Menu.MenuItem
                label="Copy Image (Quick)"
                key="quick-copy-image"
                id="quick-copy-image"
                leadingAccessory={{ type: "icon", icon: CopyIcon }}
                action={() => copyImageFromUrl(url)}
            />
        );
    }
};

export default definePlugin({
    name: "QuickImageCopy",
    description: "Adds a fast 1-click 'Copy Image (Quick)' button to non-GIF images with instant canvas PNG clipboard conversion.",
    tags: ["Media", "Utility"],
    authors: [{ name: "Onyx", id: 0n }],

    start() {
        addContextMenuPatch(["image-context", "message", "message-actions"], imageMenuPatch);
        addContextMenuPatch("message", messageMenuPatch);
    },

    stop() {
        removeContextMenuPatch(["image-context", "message", "message-actions"], imageMenuPatch);
        removeContextMenuPatch("message", messageMenuPatch);
    }
});
