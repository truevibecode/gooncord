/*
 * Gooncord, a Discord client mod
 * Copyright (c) 2026 truevibecode and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { OpenExternalIcon, ResetIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { findByPropsLazy, findStoreLazy } from "@webpack";
import { Modal, ModalProps, NavigationRouter, React, showToast, Toasts, useEffect, useMemo, useState, UserStore } from "@webpack/common";

import { KNOWN_COLLECTIBLES } from "./catalog";

const CollectiblesCategoryStore = findStoreLazy("CollectiblesCategoryStore");
const CollectiblesActions = findByPropsLazy("fetchCollectiblesCategories");

export interface LiveProduct {
    skuId: string;
    name: string;
    type: "decoration" | "effect" | "nameplate";
    categoryName: string;
    priceMoney?: string;
    priceOrbs?: number;
    description?: string;
    asset?: string;
}

export function ShopPreviewerModal({ modalProps }: { modalProps: ModalProps }) {
    const [search, setSearch] = useState("");
    const [selectedTab, setSelectedTab] = useState<"all" | "decoration" | "effect" | "nameplate">("all");
    const [selectedDeco, setSelectedDeco] = useState<LiveProduct | null>(null);
    const [selectedEffect, setSelectedEffect] = useState<LiveProduct | null>(null);
    const [selectedNameplate, setSelectedNameplate] = useState<LiveProduct | null>(null);
    const [, forceUpdate] = useState(0);

    const currentUser = UserStore?.getCurrentUser();

    // Trigger Discord Collectibles fetch if store is empty on open
    useEffect(() => {
        try {
            CollectiblesActions?.fetchCollectiblesCategories?.({ noCache: false })
                ?.then(() => forceUpdate(n => n + 1))
                ?.catch(() => {});
        } catch {}
    }, []);

    // Load from live store or fallback to catalog
    const liveCatalog = useMemo(() => {
        const store = CollectiblesCategoryStore;
        const list: LiveProduct[] = [];

        if (store?.products && store.products.size > 0) {
            const productsMap: Map<string, any> = store.products;
            productsMap.forEach((p, skuId) => {
                const category = store.getCategoryForProduct?.(skuId) || store.getCategory?.(p.categorySkuId);
                const categoryName = category?.name || "Shop";

                let type: LiveProduct["type"] = "decoration";
                let asset: string | undefined = undefined;

                if (p.items) {
                    for (const item of p.items) {
                        if (item.type === 0 || item.asset) {
                            type = "decoration";
                            asset = item.asset;
                        } else if (item.type === 1 || item.effects || item.animationType) {
                            type = "effect";
                            asset = item.id || p.skuId;
                        } else if (item.type === 2 || item.palette) {
                            type = "nameplate";
                            asset = item.asset;
                        }
                    }
                }

                if (!asset) {
                    if (p.name?.toLowerCase().includes("effect")) type = "effect";
                    else if (p.name?.toLowerCase().includes("nameplate")) type = "nameplate";
                }

                const priceMoney = p.price?.amount != null ? `$${(p.price.amount / 100).toFixed(2)}` : undefined;
                const priceOrbs = p.orbPrice?.amount ?? p.orbPrice ?? undefined;

                list.push({
                    skuId: p.skuId,
                    name: p.name || "Shop Item",
                    type,
                    categoryName,
                    priceMoney,
                    priceOrbs,
                    description: p.summary || p.description || "",
                    asset
                });
            });
        }

        // Merge or fallback to catalog if Discord store returned nothing yet
        if (list.length === 0) {
            KNOWN_COLLECTIBLES.forEach(k => {
                list.push({
                    skuId: k.skuId,
                    name: k.name,
                    type: k.type,
                    categoryName: k.category,
                    priceMoney: k.priceMoney,
                    priceOrbs: k.priceOrbs,
                    description: k.description,
                    asset: k.asset
                });
            });
        }

        return list;
    }, [CollectiblesCategoryStore?.products?.size]);

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
            modalProps.onClose?.();
        } catch {
            showToast("Could not open Shop", Toasts.Type.FAILURE);
        }
    };

    const clearAll = () => {
        setSelectedDeco(null);
        setSelectedEffect(null);
        setSelectedNameplate(null);
        showToast("Cleared combo preview", Toasts.Type.MESSAGE);
    };

    return (
        <Modal {...modalProps} size="dynamic">
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    display: "flex",
                    flexDirection: "row",
                    width: "740px",
                    height: "480px",
                    backgroundColor: "var(--background-primary, #313338)",
                    border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                    borderRadius: "8px",
                    overflow: "hidden",
                    boxShadow: "var(--elevation-high, 0 8px 16px rgba(0,0,0,0.3))",
                    color: "var(--text-normal, #dbdee1)",
                    fontFamily: "var(--font-primary)",
                    boxSizing: "border-box"
                }}
            >
                {/* Left Column: Minimal Boxy Preview Dock */}
                <div style={{
                    width: "280px",
                    minWidth: "280px",
                    backgroundColor: "var(--background-secondary, #2b2d31)",
                    borderRight: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                    display: "flex",
                    flexDirection: "column",
                    padding: "16px",
                    gap: "12px",
                    boxSizing: "border-box"
                }}>
                    <Heading tag="h3" style={{
                        color: "var(--header-secondary, #b5bac1)",
                        fontWeight: 700,
                        fontSize: "12px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        margin: 0
                    }}>
                        Live Preview
                    </Heading>

                    {/* Compact Boxy Profile Card */}
                    <div style={{
                        backgroundColor: "var(--card-background-default, #232428)",
                        border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                        borderRadius: "4px",
                        overflow: "hidden"
                    }}>
                        {/* Profile Banner */}
                        <div style={{
                            height: "60px",
                            background: "linear-gradient(135deg, var(--brand-500, #5865f2) 0%, #3c4270 100%)",
                            position: "relative",
                            display: "flex",
                            alignItems: "flex-end",
                            padding: "6px 8px"
                        }}>
                            {selectedEffect && (
                                <div style={{
                                    fontSize: "10px",
                                    fontWeight: 600,
                                    color: "var(--header-primary, #ffffff)",
                                    backgroundColor: "rgba(0,0,0,0.65)",
                                    border: "1px solid var(--border-subtle, rgba(255,255,255,0.15))",
                                    borderRadius: "3px",
                                    padding: "2px 6px"
                                }}>
                                    ✨ {selectedEffect.name}
                                </div>
                            )}
                        </div>

                        {/* Avatar & User Info */}
                        <div style={{ padding: "0 10px 10px" }}>
                            <div style={{ position: "relative", width: "52px", height: "52px", marginTop: "-26px", marginBottom: "8px" }}>
                                <img
                                    src={currentUser?.getAvatarURL(void 0, 52, true) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                    alt="Avatar"
                                    style={{
                                        width: "52px",
                                        height: "52px",
                                        borderRadius: "50%",
                                        border: "3px solid var(--card-background-default, #232428)",
                                        backgroundColor: "var(--background-secondary, #2b2d31)"
                                    }}
                                />
                                {selectedDeco && (
                                    <div style={{
                                        position: "absolute",
                                        inset: "-4px",
                                        borderRadius: "50%",
                                        border: "2px solid var(--brand-500, #5865f2)",
                                        pointerEvents: "none"
                                    }} />
                                )}
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                <Flex alignItems="center" gap="6px">
                                    <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--header-primary, #ffffff)" }}>
                                        {currentUser?.username || "User"}
                                    </span>
                                    {selectedNameplate && (
                                        <span style={{
                                            fontSize: "9px",
                                            fontWeight: 700,
                                            padding: "1px 5px",
                                            borderRadius: "3px",
                                            backgroundColor: "var(--brand-500, #5865f2)",
                                            color: "#ffffff",
                                            textTransform: "uppercase"
                                        }}>
                                            {selectedNameplate.name}
                                        </span>
                                    )}
                                </Flex>
                                <span style={{ fontSize: "11px", color: "var(--text-muted, #949ba4)" }}>
                                    @{currentUser?.username || "user"}
                                </span>
                            </div>

                            {/* Mini Message Preview */}
                            <div style={{
                                marginTop: "10px",
                                padding: "8px",
                                backgroundColor: "var(--background-secondary, #2b2d31)",
                                border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                                borderRadius: "4px",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px"
                            }}>
                                <img
                                    src={currentUser?.getAvatarURL(void 0, 24, true) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                    alt=""
                                    style={{ width: "24px", height: "24px", borderRadius: "50%" }}
                                />
                                <span style={{ fontSize: "11px", color: "var(--text-normal, #dbdee1)", lineHeight: 1.3 }}>
                                    Previewing cosmetic combination
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ marginTop: "auto", display: "flex", gap: "8px" }}>
                        <Button size="small" variant="secondary" onClick={clearAll} style={{ flex: 1, borderRadius: "4px" }}>
                            <ResetIcon style={{ marginRight: "4px" }} /> Reset
                        </Button>
                        <Button size="small" variant="primary" onClick={() => jumpToShop()} style={{ flex: 1, borderRadius: "4px" }}>
                            Shop <OpenExternalIcon style={{ marginLeft: "4px" }} />
                        </Button>
                    </div>
                </div>

                {/* Right Column: Search & Catalog */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "16px 20px", minWidth: 0 }}>
                    <div style={{ marginBottom: "10px" }}>
                        <Heading tag="h2" style={{ margin: "0 0 2px", color: "var(--header-primary, #ffffff)", fontWeight: 700, fontSize: "16px" }}>
                            Collectibles Studio
                        </Heading>
                        <Paragraph color="text-subtle" style={{ margin: 0, fontSize: "12px", color: "var(--text-muted, #949ba4)" }}>
                            Mix & match decorations, avatar effects, and nameplates with live prices.
                        </Paragraph>
                    </div>

                    <input
                        type="text"
                        placeholder="Search items by name or category..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: "100%",
                            height: "34px",
                            padding: "6px 10px",
                            borderRadius: "4px",
                            backgroundColor: "var(--background-tertiary, #1e1f22)",
                            border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                            color: "var(--text-normal, #dbdee1)",
                            fontSize: "13px",
                            outline: "none",
                            marginBottom: "8px",
                            boxSizing: "border-box"
                        }}
                    />

                    {/* Segmented Filter Bar */}
                    <div style={{
                        display: "flex",
                        gap: "4px",
                        backgroundColor: "var(--background-secondary, #2b2d31)",
                        padding: "3px",
                        border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                        borderRadius: "4px",
                        marginBottom: "10px"
                    }}>
                        {[
                            { key: "all", label: "All" },
                            { key: "decoration", label: "Decorations" },
                            { key: "effect", label: "Effects" },
                            { key: "nameplate", label: "Nameplates" }
                        ].map(t => (
                            <button
                                key={t.key}
                                onClick={() => setSelectedTab(t.key as any)}
                                style={{
                                    flex: 1,
                                    height: "26px",
                                    borderRadius: "3px",
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    border: selectedTab === t.key ? "1px solid var(--border-subtle, rgba(255,255,255,0.15))" : "1px solid transparent",
                                    cursor: "pointer",
                                    backgroundColor: selectedTab === t.key ? "var(--background-primary, #313338)" : "transparent",
                                    color: selectedTab === t.key ? "var(--header-primary, #ffffff)" : "var(--interactive-normal, #949ba4)",
                                    transition: "background-color 0.12s ease"
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Product Items List */}
                    <div style={{
                        flex: 1,
                        overflowY: "auto",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        paddingRight: "4px"
                    }}>
                        {filteredList.length === 0 ? (
                            <div style={{ textAlign: "center", color: "var(--text-muted, #949ba4)", padding: "40px 0", fontSize: "13px" }}>
                                No items match your filter.
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
                                            height: "48px",
                                            padding: "0 12px",
                                            backgroundColor: isSelected ? "rgba(88, 101, 242, 0.12)" : "var(--card-background-default, #232428)",
                                            borderRadius: "4px",
                                            border: isSelected ? "1px solid var(--brand-500, #5865f2)" : "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
                                            transition: "background-color 0.12s ease",
                                            boxSizing: "border-box"
                                        }}
                                    >
                                        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", paddingRight: "8px" }}>
                                            <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--header-primary, #ffffff)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {item.name}
                                            </div>
                                            <div style={{ fontSize: "11px", color: "var(--text-muted, #949ba4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                {item.categoryName}
                                            </div>
                                        </div>

                                        <Flex alignItems="center" gap="8px" style={{ flexShrink: 0 }}>
                                            <div style={{ textAlign: "right" }}>
                                                {item.priceMoney && (
                                                    <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--text-positive, #23a55a)" }}>
                                                        {item.priceMoney}
                                                    </div>
                                                )}
                                                {item.priceOrbs != null && (
                                                    <div style={{ color: "var(--text-muted, #949ba4)", fontSize: "10px", fontWeight: 600 }}>
                                                        {item.priceOrbs} Orbs
                                                    </div>
                                                )}
                                            </div>

                                            <Button
                                                size="small"
                                                variant={isSelected ? "danger" : "primary"}
                                                style={{ height: "28px", padding: "0 10px", borderRadius: "4px" }}
                                                onClick={() => {
                                                    if (item.type === "decoration") setSelectedDeco(isSelected ? null : item);
                                                    else if (item.type === "effect") setSelectedEffect(isSelected ? null : item);
                                                    else if (item.type === "nameplate") setSelectedNameplate(isSelected ? null : item);
                                                    showToast(isSelected ? `Removed ${item.name}` : `Equipped ${item.name}`, Toasts.Type.SUCCESS);
                                                }}
                                            >
                                                {isSelected ? "Remove" : "Preview"}
                                            </Button>

                                            <Button
                                                size="small"
                                                variant="secondary"
                                                style={{ height: "28px", padding: "0 10px", borderRadius: "4px" }}
                                                onClick={() => jumpToShop(item.skuId)}
                                            >
                                                Shop
                                            </Button>
                                        </Flex>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </Modal>
    );
}
