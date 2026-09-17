/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Message } from "@vencord/discord-types";
import { MessageCache, MessageStore } from "@webpack/common";

/**
 * Update and re-render a message
 * @param channelId The channel id of the message
 * @param messageId The message id
 * @param fields The fields of the message to change. Leave empty if you just want to re-render
 */
export function updateMessage(channelId: string, messageId: string, fields?: Partial<Message & Record<string, any>>) {
    const channelMessageCache = MessageCache.getOrCreate(channelId);
    if (!channelMessageCache.has(messageId)) return;

    // To cause a message to re-render, we basically need to create a new instance of the message and obtain a new reference
    // If we have fields to modify we can use the merge method of the class, otherwise we just create a new instance with the old fields
    const newChannelMessageCache = channelMessageCache.update(messageId, (oldMessage: any) => {
        return fields ? oldMessage.merge(fields) : new oldMessage.constructor(oldMessage);
    });

    MessageCache.commit(newChannelMessageCache);
    MessageStore.emitChange();
}

// Batched variant: coalesces rapid successive updates into a single store emit.
// Same commits as updateMessage, just one emit per microtask. Use in hot paths.
const pendingBatched = new Map<string, { channelId: string; messageId: string; fields?: Partial<Message & Record<string, any>>; }>();
let batchedFlushScheduled = false;
export function updateMessageBatched(channelId: string, messageId: string, fields?: Partial<Message & Record<string, any>>) {
    pendingBatched.set(channelId + ":" + messageId, { channelId, messageId, fields });
    if (batchedFlushScheduled) return;
    batchedFlushScheduled = true;
    queueMicrotask(() => {
        batchedFlushScheduled = false;
        if (!pendingBatched.size) return;
        const jobs = [...pendingBatched.values()];
        pendingBatched.clear();
        for (const { channelId: cid, messageId: mid, fields: f } of jobs) {
            const cache = MessageCache.getOrCreate(cid);
            if (!cache.has(mid)) continue;
            const next = cache.update(mid, (oldMessage: any) =>
                f ? oldMessage.merge(f) : new oldMessage.constructor(oldMessage));
            MessageCache.commit(next);
        }
        MessageStore.emitChange();
    });
}
