/*
315 * Gooncord, a Discord client mod
316 * Copyright (c) 2026 truevibecode and contributors
317 * SPDX-License-Identifier: GPL-3.0-or-later
318 */

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { OpenExternalIcon, ResetIcon } from "@components/Icons";
import { Paragraph } from "@components/Paragraph";
import { findStoreLazy } from "@webpack";
import { Modal, ModalProps, NavigationRouter, React, showToast, Toasts, useMemo, useState, UserStore } from "@webpack/common";

const CollectiblesCategoryStore = findStoreLazy("CollectiblesCategoryStore");

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

    const currentUser = UserStore?.getCurrentUser();

    // Pull catalog directly from store
    const liveCatalog = useMemo(() => {
        const store = CollectiblesCategoryStore;
        const list: LiveProduct[] = [];
        if (!store?.products) return list;

        const productsMap: Map<string, any> = store.products;
        productsMap.forEach((p, skuId) => {
            const category = store.getCategoryForProduct?.(skuId) || store.getCategory?.(p.categorySkuId);
            const categoryName = category?.name || "Discord Shop";

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
                name: p.name || "Item",
                type,
                categoryName,
                priceMoney,
                priceOrbs,
                description: p.summary || p.description || "",
                asset
            });
        });

        return list;
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
            modalProps.onClose?.();
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
        <Modal
            {...modalProps}
            size="dynamic"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    display: "flex",
                    flexDirection: "row",
                    width: "880px",
                    height: "600px",
                    background: "rgba(18, 19, 24, 0.95)",
                    backdropFilter: "blur(20px)",
                    borderRadius: "28px",
                    overflow: "hidden",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    boxShadow: "0 24px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
                    color: "#ffffff"
                }}
            >
                {/* Left: Dreamy Cloud Profile Card Preview */}
                <div style={{
                    width: "350px",
                    background: "linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%)",
                    borderRight: "1px solid rgba(255, 255, 255, 0.06)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: "28px 20px",
                    position: "relative"
                }}>
                    <Heading tag="h3" style={{ color: "#ffffff", fontWeight: 700, fontSize: "16px", marginBottom: "20px", letterSpacing: "0.5px" }}>
                        ✨ Live Preview
                    </Heading>

                    {/* Dreamy Cloud Card Frame */}
                    <div style={{
                        width: "100%",
                        background: "rgba(0, 0, 0, 0.45)",
                        borderRadius: "24px",
                        padding: "20px",
                        position: "relative",
                        overflow: "hidden",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        boxShadow: "0 12px 32px rgba(0,0,0,0.5)"
                    }}>
                        {/* Dreamy Soft Cloud Aura */}
                        <div style={{
                            position: "absolute",
                            top: "-30px",
                            left: "50%",
                            transform: "translateX(-50%)",
                            width: "220px",
                            height: "90px",
                            background: "radial-gradient(circle, rgba(168, 192, 255, 0.25) 0%, rgba(238, 156, 167, 0) 70%)",
                            filter: "blur(20px)",
                            pointerEvents: "none"
                        }} />

                        {/* Profile Banner */}
                        <div style={{
                            height: "70px",
                            borderRadius: "16px",
                            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                            overflow: "hidden"
                        }}>
                            {selectedEffect && (
                                <div style={{
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    color: "#ffffff",
                                    textShadow: "0 2px 8px rgba(0,0,0,0.6)",
                                    background: "rgba(0,0,0,0.25)",
                                    padding: "4px 10px",
                                    borderRadius: "20px",
                                    backdropFilter: "blur(4px)"
                                }}>
                                    ✨ {selectedEffect.name}
                                </div>
                            )}
                        </div>

                        {/* Avatar & Active Decoration */}
                        <div style={{ position: "relative", width: "72px", height: "72px", marginTop: "-36px", marginBottom: "12px", marginLeft: "8px" }}>
                            <img
                                src={currentUser?.getAvatarURL(void 0, 72, true) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                alt="Avatar"
                                style={{ width: "72px", height: "72px", borderRadius: "50%", border: "4px solid rgba(18, 19, 24, 0.95)" }}
                            />
                            {selectedDeco && (
                                <div style={{
                                    position: "absolute",
                                    inset: "-8px",
                                    borderRadius: "50%",
                                    border: "2px solid rgba(255, 215, 0, 0.8)",
                                    boxShadow: "0 0 16px rgba(255, 215, 0, 0.4)",
                                    pointerEvents: "none"
                                }} />
                            )}
                        </div>

                        {/* Username & Nameplate */}
                        <div style={{ padding: "0 4px" }}>
                            <Flex alignItems="center" gap="8px">
                                <span style={{ fontWeight: 800, fontSize: "17px", color: "#ffffff" }}>
                                    {currentUser?.username || "User"}
                                </span>
                                {selectedNameplate && (
                                    <span style={{
                                        fontSize: "10px",
                                        fontWeight: 700,
                                        padding: "3px 8px",
                                        borderRadius: "8px",
                                        background: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
                                        color: "#000"
                                    }}>
                                        {selectedNameplate.name}
                                    </span>
                                )}
                            </Flex>
                            <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.5)", marginTop: "2px" }}>
                                @{currentUser?.username || "user"}
                            </div>
                        </div>

                        {/* Mini Chat Message Preview Bubble */}
                        <div style={{
                            marginTop: "16px",
                            padding: "10px 12px",
                            borderRadius: "14px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.06)",
                            display: "flex",
                            alignItems: "center",
                            gap: "10px"
                        }}>
                            <img
                                src={currentUser?.getAvatarURL(void 0, 32, true) || "https://cdn.discordapp.com/embed/avatars/0.png"}
                                alt=""
                                style={{ width: "30px", height: "30px", borderRadius: "50%" }}
                            />
                            <div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff" }}>{currentUser?.username}</div>
                                <div style={{ fontSize: "12px", color: "rgba(255, 255, 255, 0.8)", marginTop: "2px" }}>
                                    Clean combo check ☁️✨
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Reset & Jump Controls */}
                    <div style={{ marginTop: "auto", width: "100%", display: "flex", gap: "8px" }}>
                        <Button size="small" variant="secondary" onClick={clearAll} style={{ flex: 1, borderRadius: "12px" }}>
                            <ResetIcon style={{ marginRight: "4px" }} /> Reset
                        </Button>
                        <Button size="small" variant="primary" onClick={() => jumpToShop()} style={{ flex: 1, borderRadius: "12px" }}>
                            Shop <OpenExternalIcon style={{ marginLeft: "4px" }} />
                        </Button>
                    </div>
                </div>

                {/* Right: Minimalist & Clean Catalog */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "28px 24px" }}>
                    <Flex justifyContent="space-between" alignItems="center" style={{ marginBottom: "16px" }}>
                        <div>
                            <Heading tag="h2" style={{ margin: 0, color: "#ffffff", fontWeight: 800, fontSize: "20px" }}>
                                Shop Combo Studio
                            </Heading>
                            <Paragraph color="text-subtle" style={{ margin: "2px 0 0", fontSize: "13px", color: "rgba(255, 255, 255, 0.6)" }}>
                                Mix & match decos, effects, and nameplates with live prices.
                            </Paragraph>
                        </div>
                    </Flex>

                    {/* Clean Search Input */}
                    <input
                        type="text"
                        placeholder="Search items, effects, nameplates..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "12px 16px",
                            borderRadius: "14px",
                            background: "rgba(255, 255, 255, 0.05)",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            color: "#ffffff",
                            fontSize: "14px",
                            outline: "none",
                            marginBottom: "12px",
                            boxSizing: "border-box"
                        }}
                    />

                    {/* Dreamy Pill Filter Tabs */}
                    <div style={{ display: "flex", gap: "6px", marginBottom: "14px" }}>
                        {[
                            { key: "all", label: "All" },
                            { key: "decoration", label: "Decos" },
                            { key: "effect", label: "Effects" },
                            { key: "nameplate", label: "Nameplates" }
                        ].map(t => (
                            <button
                                key={t.key}
                                onClick={() => setSelectedTab(t.key as any)}
                                style={{
                                    padding: "6px 14px",
                                    borderRadius: "18px",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    border: "none",
                                    cursor: "pointer",
                                    background: selectedTab === t.key ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.04)",
                                    color: selectedTab === t.key ? "#ffffff" : "rgba(255, 255, 255, 0.5)",
                                    transition: "all 0.15s ease"
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <Divider style={{ margin: "0 0 12px", opacity: 0.1 }} />

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
                            <div style={{ textAlign: "center", color: "rgba(255, 255, 255, 0.4)", padding: "50px 0" }}>
                                No collectibles found matching search.
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
                                            background: isSelected ? "rgba(255, 255, 255, 0.1)" : "rgba(255, 255, 255, 0.03)",
                                            borderRadius: "14px",
                                            border: isSelected ? "1px solid rgba(255, 255, 255, 0.3)" : "1px solid rgba(255, 255, 255, 0.05)",
                                            transition: "background 0.15s ease"
                                        }}
                                    >
                                        <div style={{ maxWidth: "280px" }}>
                                            <div style={{ fontWeight: 700, fontSize: "14px", color: "#ffffff" }}>
                                                {item.name}
                                            </div>
                                            <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.5)", marginTop: "2px" }}>
                                                {item.categoryName} • {item.description || item.type}
                                            </div>
                                        </div>

                                        <Flex alignItems="center" gap="10px">
                                            <div style={{ textAlign: "right" }}>
                                                {item.priceMoney && (
                                                    <div style={{ fontWeight: 700, fontSize: "13px", color: "#ffffff" }}>
                                                        {item.priceMoney}
                                                    </div>
                                                )}
                                                {item.priceOrbs != null && (
                                                    <div style={{ color: "#d8b4fe", fontSize: "11px", fontWeight: 700 }}>
                                                        🟣 {item.priceOrbs}
                                                    </div>
                                                )}
                                            </div>

                                            <Button
                                                size="small"
                                                variant={isSelected ? "danger" : "primary"}
                                                style={{ borderRadius: "10px" }}
                                                onClick={() => {
                                                    if (item.type === "decoration") setSelectedDeco(isSelected ? null : item);
                                                    else if (item.type === "effect") setSelectedEffect(isSelected ? null : item);
                                                    else if (item.type === "nameplate") setSelectedNameplate(isSelected ? null : item);
                                                    showToast(isSelected ? `Removed ${item.name}` : `Equipped ${item.name}`, Toasts.Type.SUCCESS);
                                                }}
                                            >
                                                {isSelected ? "Remove" : "Preview"}
                                            </Button>

                                            <Button size="small" variant="secondary" style={{ borderRadius: "10px" }} onClick={() => jumpToShop(item.skuId)}>
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
