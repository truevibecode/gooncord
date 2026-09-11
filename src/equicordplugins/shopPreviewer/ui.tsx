/*
 * Gooncord, a Discord client mod
 * Copyright (c) 2026 truevibecode and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { OpenExternalIcon, PaintbrushIcon, ResetIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { findByCodeLazy, findComponentByCodeLazy, findStoreLazy } from "@webpack";
import { NavigationRouter, React, showToast, Toasts, useMemo, useState, UserStore } from "@webpack/common";

const CollectiblesCategoryStore = findStoreLazy("CollectiblesCategoryStore");

// Lazy Discord native profile customization preview
const UserProfilePreview = findComponentByCodeLazy(
    "disabledInputs",
    "hideMessageInput",
    "pendingAvatarDecoration",
    "pendingProfileEffect"
);

export interface LiveProduct {
    skuId: string;
    name: string;
    type: "decoration" | "effect" | "nameplate" | "other";
    categoryName: string;
    priceMoney?: string;
    priceOrbs?: number;
    description?: string;
    decorationData?: { asset: string; skuId: string };
    effectData?: { id: string; skuId: string };
    nameplateData?: { asset: string; skuId: string; label?: string };
    rawItem: any;
}

export function ShopPreviewerModal({ onClose }: { onClose: () => void }) {
    const [search, setSearch] = useState("");
    const [selectedTab, setSelectedTab] = useState<"all" | "decoration" | "effect" | "nameplate">("all");
    const [selectedDeco, setSelectedDeco] = useState<LiveProduct | null>(null);
    const [selectedEffect, setSelectedEffect] = useState<LiveProduct | null>(null);
    const [selectedNameplate, setSelectedNameplate] = useState<LiveProduct | null>(null);

    const currentUser = UserStore?.getCurrentUser();

    // Ingest live catalog from Discord CollectiblesCategoryStore
    const liveCatalog = useMemo(() => {
        const store = CollectiblesCategoryStore;
        const productsList: LiveProduct[] = [];
        if (!store?.products) return productsList;

        const productsMap: Map<string, any> = store.products;
        productsMap.forEach((p, skuId) => {
            const category = store.getCategoryForProduct?.(skuId) || store.getCategory?.(p.categorySkuId);
            const categoryName = category?.name || "Shop Item";

            let type: LiveProduct["type"] = "other";
            let decorationData: LiveProduct["decorationData"] = undefined;
            let effectData: LiveProduct["effectData"] = undefined;
            let nameplateData: LiveProduct["nameplateData"] = undefined;

            // Type 0 / 1 / 2 detection
            if (p.items) {
                for (const item of p.items) {
                    if (item.type === 0 || item.asset) {
                        type = "decoration";
                        decorationData = { asset: item.asset, skuId: p.skuId };
                    } else if (item.type === 1 || item.effects || item.animationType) {
                        type = "effect";
                        effectData = { id: item.id || p.skuId, skuId: p.skuId };
                    } else if (item.type === 2 || item.palette) {
                        type = "nameplate";
                        nameplateData = { asset: item.asset, skuId: p.skuId, label: p.name };
                    }
                }
            }

            if (type === "other") {
                if (p.name?.toLowerCase().includes("effect")) type = "effect";
                else if (p.name?.toLowerCase().includes("nameplate")) type = "nameplate";
                else type = "decoration";
            }

            const priceMoney = p.price?.amount != null ? `$${(p.price.amount / 100).toFixed(2)}` : undefined;
            const priceOrbs = p.orbPrice?.amount ?? p.orbPrice ?? undefined;

            productsList.push({
                skuId: p.skuId,
                name: p.name || "Unnamed Item",
                type,
                categoryName,
                priceMoney,
                priceOrbs,
                description: p.summary || p.description || "",
                decorationData,
                effectData,
                nameplateData,
                rawItem: p
            });
        });

        return productsList;
    }, []);

    const filteredList = useMemo(() => {
        const q = search.trim().toLowerCase();
        return liveCatalog.filter(p => {
            if (selectedTab !== "all" && p.type !== selectedTab) return false;
            if (!q) return true;
            return (
                p.name.toLowerCase().includes(q) ||
                p.categoryName.toLowerCase().includes(q) ||
                p.description?.toLowerCase().includes(q)
            );
        });
    }, [liveCatalog, search, selectedTab]);

    const jumpToShop = (skuId?: string) => {
        try {
            NavigationRouter.transitionTo("/shop");
            showToast("Opening Discord Shop...", Toasts.Type.SUCCESS);
            onClose();
        } catch {
            showToast("Could not transition to Shop", Toasts.Type.FAILURE);
        }
    };

    const clearAll = () => {
        setSelectedDeco(null);
        setSelectedEffect(null);
        setSelectedNameplate(null);
        showToast("Cleared combo preview", Toasts.Type.MESSAGE);
    };

    return (
        <div style={{
            display: "flex",
            flexDirection: "row",
            width: "920px",
            height: "640px",
            background: "var(--background-floating)",
            color: "var(--text-normal)",
            borderRadius: "8px",
            overflow: "hidden",
            boxShadow: "var(--elevation-high)"
        }}>
            {/* Left Column: Authentic Discord Profile Popout & Mini Message Preview */}
            <div style={{
                width: "380px",
                background: "var(--background-secondary-alt)",
                borderRight: "1px solid var(--border-subtle)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "24px 16px",
                position: "relative",
                overflowY: "auto"
            }}>
                <Heading tag="h3" style={{ color: "var(--header-primary)", fontWeight: 700, marginBottom: "16px", width: "100%", textAlign: "center" }}>
                    Live Profile Preview
                </Heading>

                {/* Discord Native User Profile Card Preview */}
                <div style={{
                    width: "340px",
                    position: "relative",
                    borderRadius: "8px",
                    overflow: "hidden",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.4)"
                }}>
                    {UserProfilePreview && currentUser ? (
                        <UserProfilePreview
                            user={currentUser}
                            canUsePremiumCustomization={true}
                            pendingAvatarDecoration={selectedDeco?.decorationData}
                            pendingProfileEffect={selectedEffect?.effectData}
                            disabledInputs={true}
                            hideMessageInput={false}
                            hideCustomStatus={false}
                        />
                    ) : (
                        /* High-Fidelity Custom Fallback Popout Matching Discord UI */
                        <div style={{
                            background: "var(--background-surface-high, #111214)",
                            padding: "16px",
                            borderRadius: "8px",
                            color: "var(--text-normal)",
                            position: "relative"
                        }}>
                            {/* Profile Banner */}
                            <div style={{
                                height: "90px",
                                background: "var(--brand-experiment, #5865F2)",
                                margin: "-16px -16px 0",
                                borderRadius: "8px 8px 0 0",
                                position: "relative"
                            }}>
                                {selectedEffect && (
                                    <div style={{
                                        position: "absolute",
                                        inset: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        background: "rgba(255,255,255,0.15)",
                                        color: "#fff",
                                        fontWeight: 600,
                                        fontSize: "12px"
                                    }}>
                                        ✨ {selectedEffect.name}
                                    </div>
                                )}
                            </div>

                            {/* Avatar with Decoration Frame */}
                            <div style={{ position: "relative", width: "80px", height: "80px", marginTop: "-40px", marginBottom: "12px" }}>
                                <img
                                    src={currentUser?.getAvatarURL(void 0, 80, true) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                    alt="Avatar"
                                    style={{ width: "80px", height: "80px", borderRadius: "50%", border: "6px solid var(--background-surface-high, #111214)" }}
                                />
                                {selectedDeco && (
                                    <div style={{
                                        position: "absolute",
                                        inset: "-10px",
                                        pointerEvents: "none",
                                        border: "2px dashed var(--brand-experiment)",
                                        borderRadius: "50%"
                                    }} />
                                )}
                            </div>

                            {/* Username and Nameplate */}
                            <Flex alignItems="center" gap="8px">
                                <span style={{ fontWeight: 700, fontSize: "18px", color: "var(--header-primary)" }}>
                                    {currentUser?.username || "User"}
                                </span>
                                {selectedNameplate && (
                                    <span style={{
                                        fontSize: "11px",
                                        padding: "2px 8px",
                                        borderRadius: "4px",
                                        background: "var(--brand-experiment)",
                                        color: "#fff",
                                        fontWeight: 600
                                    }}>
                                        🏷️ {selectedNameplate.name}
                                    </span>
                                )}
                            </Flex>

                            <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "4px" }}>
                                @{currentUser?.username || "user"}
                            </div>

                            <Divider style={{ margin: "16px 0 12px" }} />

                            {/* Mini Chat Message Preview */}
                            <div style={{
                                background: "var(--background-secondary, #232428)",
                                padding: "10px 12px",
                                borderRadius: "6px",
                                display: "flex",
                                alignItems: "center",
                                gap: "10px"
                            }}>
                                <img
                                    src={currentUser?.getAvatarURL(void 0, 32, true) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                    alt=""
                                    style={{ width: "32px", height: "32px", borderRadius: "50%" }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                                        <span style={{ fontWeight: 600, color: "var(--header-primary)" }}>{currentUser?.username}</span>
                                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>12:00 PM</span>
                                    </div>
                                    <div style={{ fontSize: "13px", color: "var(--text-normal)", marginTop: "2px" }}>
                                        Check out my full profile combo!
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Combo Management Controls */}
                <div style={{ marginTop: "auto", paddingTop: "16px", width: "100%" }}>
                    <Flex gap="8px" justifyContent="center">
                        <Button size="small" variant="secondary" onClick={clearAll}>
                            <ResetIcon style={{ marginRight: "4px" }} /> Reset Preview
                        </Button>
                        <Button size="small" variant="primary" onClick={() => jumpToShop()}>
                            Open Shop <OpenExternalIcon style={{ marginLeft: "4px" }} />
                        </Button>
                    </Flex>
                </div>
            </div>

            {/* Right Column: High-Contrast Searchable Shop Catalog */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "20px" }}>
                <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: "12px" }}>
                    <div>
                        <Heading tag="h2" style={{ margin: 0, color: "var(--header-primary)", fontWeight: 700 }}>
                            Shop Combo Studio
                        </Heading>
                        <Paragraph color="text-subtle" style={{ margin: "2px 0 0", fontSize: "13px" }}>
                            Browse live Discord shop items, preview combos simultaneously, and inspect real prices.
                        </Paragraph>
                    </div>
                </Flex>

                {/* Search Bar & Category Filters */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <input
                        type="text"
                        placeholder="Search avatar decorations, profile effects, nameplates..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            flex: 1,
                            padding: "10px 14px",
                            borderRadius: "6px",
                            background: "var(--input-background, #1e1f22)",
                            border: "1px solid var(--input-border-default, #3b3e45)",
                            color: "var(--text-normal, #dbdee1)",
                            fontSize: "14px",
                            outline: "none"
                        }}
                    />
                </div>

                {/* Filter Tabs */}
                <Flex gap="6px" style={{ marginBottom: "12px" }}>
                    {[
                        { key: "all", label: "All Items" },
                        { key: "decoration", label: "Avatar Decos" },
                        { key: "effect", label: "Profile Effects" },
                        { key: "nameplate", label: "Nameplates" }
                    ].map(t => (
                        <button
                            key={t.key}
                            onClick={() => setSelectedTab(t.key as any)}
                            style={{
                                padding: "6px 12px",
                                borderRadius: "16px",
                                fontSize: "12px",
                                fontWeight: 600,
                                border: "none",
                                cursor: "pointer",
                                background: selectedTab === t.key ? "var(--brand-experiment, #5865F2)" : "var(--background-secondary, #2b2d31)",
                                color: selectedTab === t.key ? "#fff" : "var(--text-muted, #949ba4)",
                                transition: "background 0.15s ease, color 0.15s ease"
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </Flex>

                <Divider style={{ margin: "0 0 12px" }} />

                {/* Scrollable Products List */}
                <div style={{
                    flex: 1,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    paddingRight: "4px"
                }}>
                    {filteredList.length === 0 ? (
                        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "40px 0" }}>
                            No items found matching your search.
                        </div>
                    ) : (
                        filteredList.map(item => {
                            const isSelected =
                                selectedDeco?.skuId === item.skuId ||
                                selectedEffect?.skuId === item.skuId ||
                                selectedNameplate?.skuId === item.skuId;

                            return (
                                <div
                                    key={item.skuId}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        padding: "12px 16px",
                                        background: isSelected ? "var(--background-modifier-selected, #35373c)" : "var(--background-secondary, #2b2d31)",
                                        borderRadius: "8px",
                                        border: isSelected ? "1px solid var(--brand-experiment, #5865F2)" : "1px solid var(--border-subtle, #3b3e45)"
                                    }}
                                >
                                    <div style={{ maxWidth: "320px" }}>
                                        <Flex alignItems="center" gap="8px">
                                            <span style={{ fontWeight: 700, fontSize: "15px", color: "var(--header-primary, #f2f3f5)" }}>
                                                {item.name}
                                            </span>
                                            <span style={{
                                                fontSize: "10px",
                                                textTransform: "uppercase",
                                                padding: "2px 6px",
                                                borderRadius: "4px",
                                                fontWeight: 700,
                                                background: "var(--background-tertiary, #1e1f22)",
                                                color: "var(--text-muted, #949ba4)"
                                            }}>
                                                {item.type}
                                            </span>
                                        </Flex>
                                        <div style={{ fontSize: "12px", color: "var(--text-muted, #949ba4)", marginTop: "2px" }}>
                                            {item.categoryName} • {item.description || "Discord Collectibles Item"}
                                        </div>
                                    </div>

                                    <Flex alignItems="center" gap="14px">
                                        <div style={{ textAlign: "right" }}>
                                            {item.priceMoney && (
                                                <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-normal, #dbdee1)" }}>
                                                    {item.priceMoney}
                                                </div>
                                            )}
                                            {item.priceOrbs != null && (
                                                <div style={{ color: "var(--brand-experiment, #5865F2)", fontSize: "12px", fontWeight: 600 }}>
                                                    🟣 {item.priceOrbs} Orbs
                                                </div>
                                            )}
                                        </div>

                                        <Button
                                            size="small"
                                            variant={isSelected ? "danger" : "primary"}
                                            onClick={() => {
                                                if (item.type === "decoration") {
                                                    setSelectedDeco(isSelected ? null : item);
                                                } else if (item.type === "effect") {
                                                    setSelectedEffect(isSelected ? null : item);
                                                } else if (item.type === "nameplate") {
                                                    setSelectedNameplate(isSelected ? null : item);
                                                }
                                                showToast(isSelected ? `Removed ${item.name}` : `Applied ${item.name}`, Toasts.Type.SUCCESS);
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
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
