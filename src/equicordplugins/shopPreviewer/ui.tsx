/*
 * Gooncord, a Discord client mod
 * Copyright (c) 2026 truevibecode and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { OpenExternalIcon, SearchIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { NavigationRouter, React, showToast, Toasts, useMemo, useState, UserStore } from "@webpack/common";

import { CollectibleItem, KNOWN_COLLECTIBLES } from "./catalog";

export function ShopPreviewerModal({ onClose }: { onClose: () => void; }) {
    const [search, setSearch] = useState("");
    const [selectedDeco, setSelectedDeco] = useState<CollectibleItem | null>(null);
    const [selectedEffect, setSelectedEffect] = useState<CollectibleItem | null>(null);
    const [selectedNameplate, setSelectedNameplate] = useState<CollectibleItem | null>(null);

    const currentUser = UserStore?.getCurrentUser();

    const filteredItems = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return KNOWN_COLLECTIBLES;
        return KNOWN_COLLECTIBLES.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.category.toLowerCase().includes(query) ||
            c.type.toLowerCase().includes(query) ||
            c.description?.toLowerCase().includes(query)
        );
    }, [search]);

    const jumpToShop = (skuId?: string) => {
        try {
            NavigationRouter.transitionTo("/shop");
            showToast("Navigating to Discord Shop...", Toasts.Type.SUCCESS);
            onClose();
        } catch {
            showToast("Could not open Shop", Toasts.Type.FAILURE);
        }
    };

    const clearAll = () => {
        setSelectedDeco(null);
        setSelectedEffect(null);
        setSelectedNameplate(null);
        showToast("Combo cleared", Toasts.Type.MESSAGE);
    };

    return (
        <div style={{ padding: "20px", color: "var(--text-normal)", minWidth: "520px", maxWidth: "680px" }}>
            <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: "16px" }}>
                <div>
                    <Heading tag="h2" style={{ margin: 0 }}>Shop Combo Studio & Previewer</Heading>
                    <Paragraph color="text-subtle" style={{ margin: "4px 0 0" }}>
                        Search, mix & match avatar decos, profile effects, and nameplates with live prices.
                    </Paragraph>
                </div>
            </Flex>

            {/* Real-time Combo Preview Panel */}
            <div style={{
                background: "var(--background-secondary-alt)",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "16px",
                border: "1px solid var(--border-subtle)",
                position: "relative",
                overflow: "hidden"
            }}>
                <Flex alignItems="center" gap="16px">
                    <div style={{ position: "relative", width: "80px", height: "80px" }}>
                        <img
                            src={currentUser?.getAvatarURL(void 0, 80, true) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                            alt="Avatar"
                            style={{ width: "80px", height: "80px", borderRadius: "50%" }}
                        />
                        {selectedDeco && (
                            <div style={{
                                position: "absolute",
                                inset: "-8px",
                                pointerEvents: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: "bold",
                                fontSize: "10px",
                                color: "var(--brand-experiment)"
                            }}>
                                [Deco: {selectedDeco.name}]
                            </div>
                        )}
                    </div>

                    <div style={{ flex: 1 }}>
                        <Flex alignItems="center" gap="8px">
                            <span style={{ fontWeight: 700, fontSize: "16px", color: "var(--text-strong)" }}>
                                {currentUser?.username || "User"}
                            </span>
                            {selectedNameplate && (
                                <span style={{
                                    fontSize: "11px",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: "var(--background-accent)",
                                    color: "var(--text-normal)",
                                    fontWeight: 600
                                }}>
                                    🏷️ {selectedNameplate.name}
                                </span>
                            )}
                        </Flex>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                            {selectedEffect ? `✨ Active Effect: ${selectedEffect.name}` : "No profile effect selected"}
                        </div>
                    </div>

                    <Flex flexDirection="column" gap="6px" alignItems="flex-end">
                        <Button size="small" variant="secondary" onClick={clearAll}>
                            Clear Combo
                        </Button>
                        <Button size="small" variant="primary" onClick={() => jumpToShop()}>
                            Shop <OpenExternalIcon style={{ marginLeft: "4px" }} />
                        </Button>
                    </Flex>
                </Flex>
            </div>

            {/* Search Input */}
            <div style={{ marginBottom: "16px", position: "relative" }}>
                <input
                    type="text"
                    placeholder="Search decorations, effects, nameplates..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: "6px",
                        background: "var(--input-background)",
                        border: "1px solid var(--input-border-default)",
                        color: "var(--text-normal)",
                        fontSize: "14px",
                        outline: "none",
                        boxSizing: "border-box"
                    }}
                />
            </div>

            <Divider style={{ margin: "12px 0" }} />

            {/* Catalog Grid */}
            <div style={{ maxHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {filteredItems.map(item => {
                    const isSelected =
                        selectedDeco?.id === item.id ||
                        selectedEffect?.id === item.id ||
                        selectedNameplate?.id === item.id;

                    return (
                        <div
                            key={item.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "10px 14px",
                                background: isSelected ? "var(--background-modifier-selected)" : "var(--background-secondary)",
                                borderRadius: "6px",
                                border: isSelected ? "1px solid var(--brand-experiment)" : "1px solid var(--border-subtle)"
                            }}
                        >
                            <div>
                                <Flex alignItems="center" gap="8px">
                                    <span style={{ fontWeight: 600, color: "var(--text-strong)" }}>{item.name}</span>
                                    <span style={{
                                        fontSize: "10px",
                                        textTransform: "uppercase",
                                        padding: "1px 5px",
                                        borderRadius: "3px",
                                        background: "var(--background-tertiary)",
                                        color: "var(--text-muted)"
                                    }}>
                                        {item.type.replace("_", " ")}
                                    </span>
                                </Flex>
                                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                                    {item.description}
                                </div>
                            </div>

                            <Flex alignItems="center" gap="12px">
                                <div style={{ textAlign: "right", fontSize: "12px" }}>
                                    <div style={{ fontWeight: 600, color: "var(--text-normal)" }}>{item.priceMoney || "—"}</div>
                                    <div style={{ color: "var(--brand-experiment)", fontSize: "11px" }}>🟣 {item.priceOrbs} Orbs</div>
                                </div>

                                <Button
                                    size="small"
                                    variant={isSelected ? "danger" : "primary"}
                                    onClick={() => {
                                        if (item.type === "avatar_decoration") {
                                            setSelectedDeco(isSelected ? null : item);
                                        } else if (item.type === "profile_effect") {
                                            setSelectedEffect(isSelected ? null : item);
                                        } else if (item.type === "nameplate") {
                                            setSelectedNameplate(isSelected ? null : item);
                                        }
                                        showToast(isSelected ? `Removed ${item.name}` : `Applied ${item.name} to preview`, Toasts.Type.SUCCESS);
                                    }}
                                >
                                    {isSelected ? "Remove" : "Preview"}
                                </Button>

                                <Button size="small" variant="secondary" onClick={() => jumpToShop(item.skuId)}>
                                    Buy
                                </Button>
                            </Flex>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
