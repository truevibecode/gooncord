/*
 * Gooncord, a Discord client mod
 * Copyright (c) 2026 truevibecode and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface CollectibleItem {
    id: string;
    skuId: string;
    name: string;
    type: "avatar_decoration" | "profile_effect" | "nameplate";
    category: string;
    asset?: string;
    priceMoney?: string;
    priceOrbs?: number;
    description?: string;
    thumbnailUrl?: string;
    effectPayload?: Record<string, any>;
    nameplatePayload?: Record<string, any>;
}

export const KNOWN_COLLECTIBLES: CollectibleItem[] = [
    // Anime / Fantasy Collectibles
    {
        id: "cyberpunk_halo",
        skuId: "114400000000000001",
        name: "Cyberpunk Halo",
        type: "avatar_decoration",
        category: "Cyberpunk",
        asset: "a_cyber_halo_neon",
        priceMoney: "$4.99",
        priceOrbs: 450,
        description: "Futuristic neon glowing halo over avatar"
    },
    {
        id: "cyber_glitch_effect",
        skuId: "114400000000000002",
        name: "Cyber Glitch",
        type: "profile_effect",
        category: "Cyberpunk",
        priceMoney: "$6.99",
        priceOrbs: 600,
        description: "Holographic scanlines and digital distortion across profile",
        effectPayload: {
            skuId: "114400000000000002",
            title: "Cyber Glitch",
            type: 1
        }
    },
    {
        id: "neon_matrix_nameplate",
        skuId: "114400000000000003",
        name: "Neon Matrix",
        type: "nameplate",
        category: "Cyberpunk",
        asset: "nameplate_cyber_grid",
        priceMoney: "$3.99",
        priceOrbs: 350,
        description: "Animated terminal code stream behind username"
    },
    // Dark / Void Collectibles
    {
        id: "void_reaper_horns",
        skuId: "114400000000000004",
        name: "Void Horns",
        type: "avatar_decoration",
        category: "Void",
        asset: "a_void_flame_horns",
        priceMoney: "$5.99",
        priceOrbs: 500,
        description: "Obsidian horns surrounded by purple void flames"
    },
    {
        id: "abyssal_smoke_effect",
        skuId: "114400000000000005",
        name: "Abyssal Rift",
        type: "profile_effect",
        category: "Void",
        priceMoney: "$7.99",
        priceOrbs: 700,
        description: "Dark cosmic void portal swirling behind the profile banner",
        effectPayload: {
            skuId: "114400000000000005",
            title: "Abyssal Rift",
            type: 1
        }
    },
    {
        id: "dark_matter_nameplate",
        skuId: "114400000000000006",
        name: "Dark Matter",
        type: "nameplate",
        category: "Void",
        asset: "nameplate_void_matter",
        priceMoney: "$3.99",
        priceOrbs: 350,
        description: "Floating anti-gravity shards behind username"
    },
    // Mystic / Floral
    {
        id: "cherry_blossom_crown",
        skuId: "114400000000000007",
        name: "Sakura Crown",
        type: "avatar_decoration",
        category: "Sakura",
        asset: "a_sakura_petals_float",
        priceMoney: "$4.99",
        priceOrbs: 450,
        description: "Gently falling cherry blossom petals around your avatar"
    },
    {
        id: "sakura_bloom_effect",
        skuId: "114400000000000008",
        name: "Sakura Bloom",
        type: "profile_effect",
        category: "Sakura",
        priceMoney: "$6.99",
        priceOrbs: 600,
        description: "Spring breeze blowing soft petals across profile card",
        effectPayload: {
            skuId: "114400000000000008",
            title: "Sakura Bloom",
            type: 1
        }
    },
    {
        id: "sakura_branch_nameplate",
        skuId: "114400000000000009",
        name: "Sakura Branch",
        type: "nameplate",
        category: "Sakura",
        asset: "nameplate_sakura_petals",
        priceMoney: "$3.99",
        priceOrbs: 350,
        description: "Delicate spring blossom branch framing your tag"
    }
];
