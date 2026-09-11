/*
100 * Gooncord, a Discord client mod
101 * Copyright (c) 2026 truevibecode and contributors
102 * SPDX-License-Identifier: GPL-3.0-or-later
103 */

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { CopyIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import { Menu, showToast, Toasts } from "@webpack/common";

const HOVER_BTN_CLASS = "gc-quick-image-copy-btn";

function isGifUrl(url: string) {
    if (!url) return false;
    const clean = url.split("?")[0].toLowerCase();
    return clean.endsWith(".gif") || url.includes("/gifs/") || clean.endsWith(".gifv");
}

function getImageUrlFromElement(el: HTMLElement): string | null {
    if (!el) return null;
    let url: string | null = null;

    if (el instanceof HTMLImageElement && el.src) {
        url = el.src;
    } else {
        const img = el.querySelector("img");
        if (img?.src) url = img.src;
        else if (el.dataset?.src) url = el.dataset.src;
    }

    if (!url || isGifUrl(url)) return null;
    return url;
}

export async function copyImageFromUrl(url: string) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();

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

// Hover button injection observer
let hoverListener: ((e: MouseEvent) => void) | null = null;

function setupHoverObserver() {
    hoverListener = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target) return;

        const wrapper = target.closest<HTMLElement>("[class*='imageWrapper'], [class*='imageContainer'], [class*='visualMediaItemContainer']");
        if (!wrapper) return;

        const existingBtn = wrapper.querySelector(`.${HOVER_BTN_CLASS}`);
        const imgUrl = getImageUrlFromElement(wrapper);

        if (!imgUrl) {
            existingBtn?.remove();
            return;
        }

        if (existingBtn) return;

        // Create hover button
        const btn = document.createElement("button");
        btn.className = HOVER_BTN_CLASS;
        btn.title = "Copy Image";
        btn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"/>
            </svg>
        `;

        Object.assign(btn.style, {
            position: "absolute",
            top: "8px",
            right: "8px",
            width: "32px",
            height: "32px",
            borderRadius: "6px",
            backgroundColor: "rgba(0, 0, 0, 0.65)",
            color: "#ffffff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: "0",
            transition: "opacity 0.15s ease, transform 0.15s ease, background-color 0.15s ease",
            zIndex: "100",
            backdropFilter: "blur(4px)"
        });

        const show = () => {
            btn.style.opacity = "1";
            btn.style.transform = "scale(1)";
        };
        const hide = () => {
            btn.style.opacity = "0";
            btn.style.transform = "scale(0.95)";
        };

        wrapper.style.position = wrapper.style.position || "relative";
        wrapper.addEventListener("mouseenter", show);
        wrapper.addEventListener("mouseleave", hide);

        btn.addEventListener("mouseenter", () => {
            btn.style.backgroundColor = "rgba(0, 0, 0, 0.85)";
            btn.style.transform = "scale(1.08)";
        });
        btn.addEventListener("mouseleave", () => {
            btn.style.backgroundColor = "rgba(0, 0, 0, 0.65)";
            btn.style.transform = "scale(1)";
        });

        btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const currentUrl = getImageUrlFromElement(wrapper);
            if (currentUrl) copyImageFromUrl(currentUrl);
        });

        wrapper.appendChild(btn);
        show();
    };

    document.addEventListener("mouseover", hoverListener, { passive: true });
}

function removeHoverObserver() {
    if (hoverListener) {
        document.removeEventListener("mouseover", hoverListener);
        hoverListener = null;
    }
    document.querySelectorAll(`.${HOVER_BTN_CLASS}`).forEach(el => el.remove());
}

export default definePlugin({
    name: "QuickImageCopy",
    description: "Displays a clean 1-click 'Copy Image' button on non-GIF images when hovering, with automatic clipboard PNG conversion and toast alerts.",
    tags: ["Media", "Utility"],
    authors: [{ name: "Onyx", id: 0n }],

    start() {
        setupHoverObserver();
    },

    stop() {
        removeHoverObserver();
    }
});
