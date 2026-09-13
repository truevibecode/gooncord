/*
 * Gooncord, a Discord client mod
 * Copyright (c) 2026 truevibecode and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import { definePluginSettings } from "@api/Settings";
import { CopyIcon, OpenExternalIcon } from "@components/Icons";
import definePlugin, { OptionType } from "@utils/types";
import { Menu, showToast, Toasts } from "@webpack/common";

const HOVER_CONTAINER_CLASS = "gc-quick-media-actions-container";

export const settings = definePluginSettings({
    allowGifs: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Allow copying and downloading GIFs in addition to static images."
    },
    showDownloadButton: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Display a quick 1-click Download button beside the Copy button on hover."
    },
    randomizeFilename: {
        type: OptionType.BOOLEAN,
        default: true,
        description: "Automatically randomize the filename when downloading images and GIFs."
    }
});

function getRandomString(length = 10): string {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let res = "";
    for (let i = 0; i < length; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
}

function isGifUrl(url: string) {
    if (!url) return false;
    const clean = url.split("?")[0].toLowerCase();
    return clean.endsWith(".gif") || url.includes("/gifs/") || clean.endsWith(".gifv");
}

function getMediaUrlFromElement(el: HTMLElement): string | null {
    if (!el) return null;
    let url: string | null = null;

    if (el instanceof HTMLImageElement && el.src) {
        url = el.src;
    } else {
        const img = el.querySelector("img");
        if (img?.src) url = img.src;
        else if (el.dataset?.src) url = el.dataset.src;
    }

    if (!url) return null;
    if (!settings.store.allowGifs && isGifUrl(url)) return null;

    return url;
}

export async function copyMediaFromUrl(url: string) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();

        if (isGifUrl(url) || blob.type === "image/gif") {
            // For GIFs, copy the direct animated image / URL or blob
            try {
                await navigator.clipboard.write([
                    new ClipboardItem({
                        [blob.type]: blob
                    })
                ]);
                showToast("GIF copied to clipboard!", Toasts.Type.SUCCESS);
                return;
            } catch {
                // Fallback to text URL copy if browser refuses gif clipboard item
                await navigator.clipboard.writeText(url);
                showToast("GIF URL copied to clipboard!", Toasts.Type.SUCCESS);
                return;
            }
        }

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
        showToast("Failed to copy media", Toasts.Type.FAILURE);
    }
}

export async function downloadMediaFromUrl(url: string) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = blobUrl;

        // Determine extension (URL may be blob:/relative, so guard the parse)
        let pathname: string;
        try {
            pathname = new URL(url).pathname;
        } catch {
            pathname = url.split("?")[0];
        }
        const originalName = pathname.substring(pathname.lastIndexOf("/") + 1) || "download";
        const dotIndex = originalName.lastIndexOf(".");
        const ext = dotIndex !== -1 ? originalName.substring(dotIndex) : (isGifUrl(url) ? ".gif" : ".png");

        let filename = originalName;
        if (settings.store.randomizeFilename) {
            filename = `${getRandomString(12)}${ext}`;
        } else if (!filename.includes(".")) {
            filename += ext;
        }

        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);

        showToast(`Downloaded ${filename}!`, Toasts.Type.SUCCESS);
    } catch (e) {
        showToast("Failed to download media", Toasts.Type.FAILURE);
    }
}

let hoverListener: ((e: MouseEvent) => void) | null = null;
const wiredWrappers = new WeakSet<HTMLElement>();
const wrapperAbort = new WeakMap<HTMLElement, AbortController>();
let gcObserver: MutationObserver | null = null;

function setupHoverObserver() {
    hoverListener = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target || !document.contains(target)) return;

        const wrapper = target.closest<HTMLElement>(
            "[class*='imageWrapper'], [class*='imageContainer'], [class*='visualMediaItemContainer'], [class*='mediaItem']"
        );
        if (!wrapper || !document.contains(wrapper)) return;

        // Prefer the tightest wrapper so the strip anchors on the image,
        // not on a broad grid/carousel box (fixes "middle of client").
        const tight = (target as HTMLElement).closest<HTMLElement>("[class*='imageWrapper']") ?? wrapper;
        const anchor = tight.contains(target as Node) ? tight : wrapper;

        // Guard: viewport-sized or empty anchor = wrong match, skip.
        const rect = anchor.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (rect.width >= window.innerWidth * 0.92 && rect.height >= window.innerHeight * 0.92) return;
        // Guard: anchor must actually contain an image.
        if (!(anchor instanceof HTMLImageElement) && !anchor.querySelector("img")) return;

        const existingContainer = anchor.querySelector(`:scope > .${HOVER_CONTAINER_CLASS}`);
        if (existingContainer && !wiredWrappers.has(anchor)) {
            existingContainer.remove(); // cloned ghost from React recycle, rebuild below
        } else if (existingContainer) {
            return;
        }

        const mediaUrl = getMediaUrlFromElement(anchor);

        if (!mediaUrl) {
            anchor.querySelector(`:scope > .${HOVER_CONTAINER_CLASS}`)?.remove();
            return;
        }

        // Container holding both Copy & Download buttons, docked top-LEFT
        // so it never covers Discord's native top-right edit actions.
        const container = document.createElement("div");
        container.className = HOVER_CONTAINER_CLASS;
        Object.assign(container.style, {
            position: "absolute",
            top: "8px",
            left: "8px",
            right: "auto",
            display: "flex",
            flexDirection: "row",
            gap: "6px",
            maxWidth: "calc(100% - 16px)",
            zIndex: "100",
            opacity: "0",
            visibility: "hidden",
            transform: "scale(0.95)",
            transition: "opacity 0.15s ease, transform 0.15s ease, visibility 0.15s",
            pointerEvents: "none"
        });

        const makeBtn = (title: string, svgPath: string, onClick: () => void) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.title = title;
            btn.setAttribute("aria-label", title);
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="${svgPath}"/></svg>`;
            Object.assign(btn.style, {
                width: "30px",
                height: "30px",
                borderRadius: "6px",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                color: "#ffffff",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "background-color 0.12s ease, transform 0.12s ease",
                backdropFilter: "blur(4px)"
            });

            btn.addEventListener("mouseenter", () => {
                btn.style.backgroundColor = "rgba(0, 0, 0, 0.9)";
                btn.style.transform = "scale(1.08)";
            });
            btn.addEventListener("mouseleave", () => {
                btn.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
                btn.style.transform = "scale(1)";
            });
            btn.addEventListener("click", ev => {
                ev.preventDefault();
                ev.stopPropagation();
                onClick();
            });

            return btn;
        };

        // Copy button
        const copyBtn = makeBtn(
            "Copy Media",
            "M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z",
            () => {
                const cur = getMediaUrlFromElement(anchor);
                if (cur) copyMediaFromUrl(cur);
            }
        );
        container.appendChild(copyBtn);

        // Download button (if setting enabled)
        if (settings.store.showDownloadButton) {
            const downloadBtn = makeBtn(
                "Download Media",
                "M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z",
                () => {
                    const cur = getMediaUrlFromElement(anchor);
                    if (cur) downloadMediaFromUrl(cur);
                }
            );
            container.appendChild(downloadBtn);
        }

        const show = () => {
            container.style.opacity = "1";
            container.style.visibility = "visible";
            container.style.pointerEvents = "auto";
            container.style.transform = "scale(1)";
        };
        const hide = () => {
            container.style.opacity = "0";
            container.style.visibility = "hidden";
            container.style.pointerEvents = "none";
            container.style.transform = "scale(0.95)";
        };

        // Correct positioned ancestor: respect computed style instead of
        // blindly downgrading sticky/fixed wrappers to relative.
        if (getComputedStyle(anchor).position === "static") {
            anchor.style.position = "relative";
        }

        // Abortable per-wrapper listeners so stop()/recycle can clean up.
        // mouseleave alone gets missed on fast moves/scroll; pointerleave covers it.
        wrapperAbort.get(anchor)?.abort();
        const ac = new AbortController();
        wrapperAbort.set(anchor, ac);
        anchor.addEventListener("mouseenter", show, { signal: ac.signal });
        anchor.addEventListener("mouseleave", hide, { signal: ac.signal });
        anchor.addEventListener("pointerleave", hide, { signal: ac.signal });
        wiredWrappers.add(anchor);

        anchor.appendChild(container);
        show();
    };

    document.addEventListener("mouseover", hoverListener, { passive: true });

    // GC: drop orphaned strips when React recycles/removes wrappers.
    gcObserver?.disconnect();
    gcObserver = new MutationObserver(muts => {
        for (const m of muts) {
            m.removedNodes.forEach(n => {
                if (!(n instanceof HTMLElement)) return;
                if (n.classList?.contains(HOVER_CONTAINER_CLASS)) return;
                if (n.matches?.("[class*='imageWrapper'],[class*='imageContainer'],[class*='visualMediaItemContainer'],[class*='mediaItem']")) {
                    n.querySelector(`.${HOVER_CONTAINER_CLASS}`)?.remove();
                    wrapperAbort.get(n as HTMLElement)?.abort();
                }
                n.querySelectorAll?.(`.${HOVER_CONTAINER_CLASS}`).forEach(el => {
                    const w = el.parentElement;
                    if (!w || !document.contains(w) || !w.querySelector("img")) el.remove();
                });
            });
        }
    });
    gcObserver.observe(document.body, { childList: true, subtree: true });
}

function removeHoverObserver() {
    if (hoverListener) {
        document.removeEventListener("mouseover", hoverListener);
        hoverListener = null;
    }
    gcObserver?.disconnect();
    gcObserver = null;
    document.querySelectorAll(`.${HOVER_CONTAINER_CLASS}`).forEach(el => el.remove());
}

const imageMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    const url = props?.src || props?.itemSrc || props?.href;
    if (!url) return;
    if (!settings.store.allowGifs && isGifUrl(url)) return;

    if (children.some(child => child?.props?.id === "quick-copy-media")) return;

    const copyGroup = findGroupChildrenByChildId("copy-link", children)
        ?? findGroupChildrenByChildId("copy-native-link", children)
        ?? children;

    copyGroup.unshift(
        <Menu.MenuItem
            label="Quick Copy Media"
            key="quick-copy-media"
            id="quick-copy-media"
            leadingAccessory={{ type: "icon", icon: CopyIcon }}
            action={() => copyMediaFromUrl(url)}
        />
    );
};

export default definePlugin({
    name: "QuickImageCopy",
    description: "Displays fast 1-click 'Copy' and 'Download' buttons on images and GIFs on hover, with customizable options and toast alerts.",
    tags: ["Media", "Utility"],
    authors: [{ name: "ldvy", id: 0n }],
    settings,

    start() {
        setupHoverObserver();
        addContextMenuPatch(["image-context", "message", "message-actions"], imageMenuPatch);
    },

    stop() {
        removeHoverObserver();
        removeContextMenuPatch(["image-context", "message", "message-actions"], imageMenuPatch);
    }
});
