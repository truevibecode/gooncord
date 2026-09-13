/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { InfoIcon } from "@components/Icons";
import { copyWithToast, openUserProfile } from "@utils/discord";
import { LazyComponent } from "@utils/react";
import { Channel, RenderModalProps, type User } from "@vencord/discord-types";
import { find, findByCodeLazy } from "@webpack";
import { Alerts, ChannelStore, closeAllModals, ContextMenuApi, FluxDispatcher, GuildStore, Menu, Modal, NavigationRouter, openModal, React, TabBar, TextInput, Tooltip, useMemo, useRef, useState } from "@webpack/common";

import { DBMessageRecord, deleteMessageIDB, deleteMessagesBulkIDB } from "../db";
import { cl, clearLogs, settings } from "../index";
import { LoggedMessage, LoggedMessageJSON } from "../types";
import { messageJsonToMessageClass } from "../utils";
import { importLogs } from "../utils/settingsUtils";
import { useMessages } from "./hooks";

export interface MessagePreviewProps {
    className: string;
    author: User;
    message: LoggedMessage;
    channel: Channel,
    compact: boolean;
    isGroupStart: boolean;
    hideSimpleEmbedContent: boolean;
}

const PrivateChannelRecord = findByCodeLazy(".is_message_request_timestamp,");
const MessagePreview = LazyComponent<MessagePreviewProps>(() => find(m => m?.type?.toString().includes("previewLinkTarget:") && !m?.type?.toString().includes("HAS_THREAD")));

export enum LogTabs {
    DELETED = "Deleted",
    EDITED = "Edited",
    GHOST_PING = "Ghost Pinged"
}

interface Props {
    modalProps: RenderModalProps;
    initalQuery?: string;
}

export function LogsModal({ modalProps, initalQuery }: Props) {
    const [currentTab, setCurrentTab] = useState(LogTabs.DELETED);
    const [queryEh, setQuery] = useState(initalQuery ?? "");
    const [sortNewest, setSortNewest] = useState(settings.store.sortNewest);
    const [numDisplayedMessages, setNumDisplayedMessages] = useState(settings.store.messagesToDisplayAtOnceInLogs);
    const contentRef = useRef<HTMLDivElement | null>(null);

    const { messages, total, statusTotal, pending, reset } = useMessages(queryEh, currentTab, sortNewest, numDisplayedMessages);

    return (
        <Modal
            {...modalProps}
            size="lg"
            title={
                <div className={cl("modal")}>
                    <TabBar
                        type="top"
                        look="brand"
                        className={cl("modal-tab-bar")}
                        selectedItem={currentTab}
                        onItemSelect={e => {
                            setCurrentTab(e);
                            setNumDisplayedMessages(settings.store.messagesToDisplayAtOnceInLogs);
                            contentRef.current?.firstElementChild?.scrollTo(0, 0);
                        }}
                    >
                        <TabBar.Item
                            className={cl("modal-tab-bar-item")}
                            id={LogTabs.DELETED}
                        >
                            Deleted
                        </TabBar.Item>
                        <TabBar.Item
                            className={cl("modal-tab-bar-item")}
                            id={LogTabs.EDITED}
                        >
                            Edited
                        </TabBar.Item>
                        <TabBar.Item
                            className={cl("modal-tab-bar-item")}
                            id={LogTabs.GHOST_PING}
                        >
                            Ghost Pinged
                        </TabBar.Item>
                    </TabBar>
                    <div className={cl("modal-filter")}>
                        <TextInput value={queryEh} onChange={e => setQuery(e)} placeholder="Filter Messages" />
                    </div>
                </div>
            }
            actions={[
                {
                    text: `Sort ${sortNewest ? "Oldest First" : "Newest First"}`,
                    variant: "secondary",
                    onClick: () => {
                        setSortNewest(e => {
                            const val = !e;
                            settings.store.sortNewest = val;
                            return val;
                        });
                        contentRef.current?.firstElementChild?.scrollTo(0, 0);
                    }
                },
                {
                    text: "Clear Visible Logs",
                    variant: "critical-secondary",
                    disabled: messages?.length === 0,
                    onClick: () => Alerts.show({
                        title: "Clear Logs",
                        body: `Are you sure you want to clear ${messages.length} logs`,
                        confirmText: "Clear",
                        confirmVariant: "critical-primary",
                        cancelText: "Cancel",
                        onConfirm: async () => {
                            await deleteMessagesBulkIDB(messages.map(e => e.message_id));
                            reset();
                        }
                    })
                },
                {
                    text: "Clear All Logs",
                    variant: "critical-primary",
                    onClick: () => Alerts.show({
                        title: "Clear Logs",
                        body: "Are you sure you want to clear all the logs",
                        confirmText: "Clear",
                        confirmVariant: "critical-primary",
                        cancelText: "Cancel",
                        onConfirm: async () => {
                            await clearLogs();
                            reset();
                        }
                    })
                }
            ]}
        >
            <div style={{ opacity: modalProps.transitionState === 1 ? "1" : "0" }} className={`${cl("modal-content-container")} ${cl("modal-root")}`} ref={contentRef}>
                {
                    modalProps.transitionState === 1 &&
                    <div>
                        {pending && (
                            <LoadingLogs tab={currentTab} />
                        )}

                        {!pending && messages != null && total === 0 && (
                            <EmptyLogs
                                hasQuery={queryEh.length !== 0}
                                reset={reset}
                            />
                        )}

                        {!pending && messages != null && (
                            <LogsContentMemo
                                visibleMessages={messages}
                                canLoadMore={messages.length < statusTotal && messages.length >= settings.store.messagesToDisplayAtOnceInLogs}
                                tab={currentTab}
                                sortNewest={sortNewest}
                                reset={reset}
                                handleLoadMore={() => setNumDisplayedMessages(e => e + settings.store.messagesToDisplayAtOnceInLogs)}
                            />
                        )}
                    </div>
                }
            </div>
        </Modal>
    );
}

interface LogContentProps {
    sortNewest: boolean;
    tab: LogTabs;
    visibleMessages: DBMessageRecord[];
    canLoadMore: boolean;
    reset: () => void;
    handleLoadMore: () => void;
}

function LogsContent({ visibleMessages, canLoadMore, sortNewest, tab, reset, handleLoadMore }: LogContentProps) {
    if (visibleMessages.length === 0)
        return <NoResults tab={tab} />;

    // Read once per list render, not per row (settings proxy trap per row otherwise).
    const showFrom = settings.store.ShowWhereMessageIsFrom;
    const MemoRow = getLMessageMemo();
    return (
        <div className={cl("modal-content-inner")}>
            {visibleMessages
                .map(({ message }, i) => (
                    <MemoRow
                        key={message.id}
                        message={message}
                        reset={reset}
                        showFrom={showFrom}
                        isGroupStart={isGroupStart(message, visibleMessages[i - 1]?.message, sortNewest)}
                    />
                ))}
            {
                canLoadMore &&
                <Button
                    style={{ marginTop: "1rem", width: "100%" }}
                    size="small" onClick={() => handleLoadMore()}
                >
                    Load More
                </Button>
            }
        </div>
    );
}

const LogsContentMemo = LazyComponent(() => LogsContent);

function NoResults({ tab }: { tab: LogTabs; }) {
    const generateSuggestedTabs = (tab: LogTabs) => {
        switch (tab) {
            case LogTabs.DELETED:
                return { nextTab: LogTabs.EDITED, lastTab: LogTabs.GHOST_PING };
            case LogTabs.EDITED:
                return { nextTab: LogTabs.GHOST_PING, lastTab: LogTabs.DELETED };
            case LogTabs.GHOST_PING:
                return { nextTab: LogTabs.DELETED, lastTab: LogTabs.EDITED };
            default:
                return { nextTab: "", lastTab: "" };
        }
    };

    const { nextTab, lastTab } = generateSuggestedTabs(tab);

    return (
        <div className={cl("modal-empty-logs", "modal-content-inner")} style={{ textAlign: "center" }}>
            <BaseText size="lg">
                No results in <b>{tab}</b>.
            </BaseText>
            <BaseText size="lg" style={{ marginTop: "0.2rem" }}>
                Maybe try <b>{nextTab}</b> or <b>{lastTab}</b>
            </BaseText>
        </div>
    );
}

function EmptyLogs({ hasQuery, reset: forceUpdate }: { hasQuery: boolean; reset: () => void; }) {
    return (
        <div className={cl("modal-empty-logs", "modal-content-inner")} style={{ textAlign: "center" }}>
            <Flex flexDirection="column" style={{ position: "relative" }}>

                <BaseText size="lg">
                    Empty eh
                </BaseText>

                {!hasQuery && (
                    <>
                        <Tooltip text="ML Enhanced now stores logs in indexeddb. You need to import your old logs from the logs directory. Importing wont overwrite existing logs">
                            {({ onMouseEnter, onMouseLeave }) => (
                                <div
                                    className={cl("modal-info-icon")}
                                    onMouseEnter={onMouseEnter}
                                    onMouseLeave={onMouseLeave}
                                >
                                    <InfoIcon />
                                </div>
                            )}
                        </Tooltip>

                        <Button onClick={() => importLogs().then(() => forceUpdate())}>
                            Import Logs
                        </Button>
                    </>
                )}
            </Flex>
        </div>
    );
}

function LoadingLogs({ tab }: { tab: LogTabs; }) {
    return (
        <div className={cl("modal-empty-logs", "modal-content-inner")} style={{ textAlign: "center" }}>
            <Flex flexDirection="column" style={{ position: "relative" }}>
                <BaseText size="lg">
                    Loading {tab} Logs...
                </BaseText>
            </Flex>
        </div>
    );

}

interface LMessageProps {
    message: LoggedMessageJSON;
    isGroupStart: boolean,
    showFrom: boolean,
    reset: () => void;
}
// Memo: rows previously re-rendered on every parent update (new wrapper identity each map).
// Compare by stable id + group + flag; message objects are stable unless reloaded.
function LMessageCompare(a: LMessageProps, b: LMessageProps) {
    return a.message.id === b.message.id
        && a.isGroupStart === b.isGroupStart
        && a.showFrom === b.showFrom
        && (a.message.editHistory?.length ?? 0) === (b.message.editHistory?.length ?? 0);
}
// Lazily created at first render, NOT module top-level: React from
// @webpack/common is an unassigned `let` until Discord's webpack loads, so
// calling React.memo at import time throws and kills the whole renderer.
let LMessageMemo: any = null;
function getLMessageMemo() {
    if (!LMessageMemo) LMessageMemo = React.memo(LMessage, LMessageCompare);
    return LMessageMemo;
}
function LMessage({ message: loggedMessage, isGroupStart, showFrom, reset, }: LMessageProps) {
    const log = useMemo(() => ({ message: loggedMessage }), [loggedMessage]);
    const message = useMemo(() => messageJsonToMessageClass(log), [log]);

    if (!message) return null;

    const channel = ChannelStore.getChannel(message?.channel_id);
    const guild = GuildStore.getGuild(channel?.guild_id);

    return (
        <div
            className={cl("modal-msg-row")}
            onContextMenu={e => {
                ContextMenuApi.openContextMenu(e, () =>
                    <Menu.Menu
                        navId="message-logger"
                        onClose={() => FluxDispatcher.dispatch({ type: "CONTEXT_MENU_CLOSE" })}
                        aria-label="Message Logger"
                    >

                        <Menu.MenuItem
                            key="jump-to-message"
                            id="jump-to-message"
                            label="Jump To Message"
                            action={() => {
                                NavigationRouter.transitionTo(`/channels/${ChannelStore.getChannel(message.channel_id)?.guild_id ?? "@me"}/${message.channel_id}${message.id ? "/" + message.id : ""}`);
                                closeAllModals();
                            }}
                        />
                        <Menu.MenuItem
                            key="open-user-profile"
                            id="open-user-profile"
                            label="Open user profile"
                            action={() => {
                                closeAllModals();
                                openUserProfile(message.author.id);
                            }}
                        />

                        <Menu.MenuItem
                            key="copy-content"
                            id="copy-content"
                            label="Copy Content"
                            action={() => copyWithToast(message.content)}
                        />

                        <Menu.MenuItem
                            key="copy-user-id"
                            id="copy-user-id"
                            label="Copy User ID"
                            action={() => copyWithToast(message.author.id)}
                        />

                        <Menu.MenuItem
                            key="copy-message-id"
                            id="copy-message-id"
                            label="Copy Message ID"
                            action={() => copyWithToast(message.id)}
                        />

                        <Menu.MenuItem
                            key="copy-channel-id"
                            id="copy-channel-id"
                            label="Copy Channel ID"
                            action={() => copyWithToast(message.channel_id)}
                        />

                        {
                            log.message.guildId != null
                            && (
                                <Menu.MenuItem
                                    key="copy-server-id"
                                    id="copy-server-id"
                                    label="Copy Server ID"
                                    action={() => copyWithToast(log.message.guildId!)}
                                />
                            )
                        }

                        <Menu.MenuItem
                            key="delete-log"
                            id="delete-log"
                            label="Delete Log"
                            color="danger"
                            action={() =>
                                deleteMessageIDB(log.message.id).then(() => reset())
                            }
                        />

                    </Menu.Menu>
                );
            }}>
            <MessagePreview
                className={`${cl("modal-msg-preview")} ${message.deleted ? "messagelogger-deleted" : ""}`}
                author={message.author}
                message={message}
                channel={ChannelStore.getChannel(message.channel_id) || new PrivateChannelRecord({ id: "" })}
                compact={false}
                isGroupStart={isGroupStart}
                hideSimpleEmbedContent={false}
            />
            {showFrom && channel?.isDM() && message?.author && (
                <span className={`${cl("modal-from")} ${message.deleted ? cl("modal-from-deleted") : cl("modal-from-edited")}`}>From {message.author.username}'s DMs</span>
            )}
            {showFrom && channel?.isGroupDM() && channel?.name && (
                <span className={`${cl("modal-from")} ${message.deleted ? cl("modal-from-deleted") : cl("modal-from-edited")}`}>From {channel.name} Group DM</span>
            )}
            {showFrom && !channel?.isDM() && !channel?.isGroupDM() && channel?.name && guild?.name && (
                <span className={`${cl("modal-from")} ${message.deleted ? cl("modal-from-deleted") : cl("modal-from-edited")}`}>From {channel.name} in {guild.name}</span>
            )}
        </div>
    );
}

export const openLogModal = (initalQuery?: string) => openModal(modalProps => <LogsModal modalProps={modalProps} initalQuery={initalQuery} />);

function isGroupStart(
    currentMessage: LoggedMessageJSON | undefined,
    previousMessage: LoggedMessageJSON | undefined,
    sortNewest: boolean
) {
    if (!currentMessage || !previousMessage) return true;

    if (currentMessage.id === previousMessage.id) return true;

    const [newestMessage, oldestMessage] = sortNewest
        ? [previousMessage, currentMessage]
        : [currentMessage, previousMessage];

    if (newestMessage.author.id !== oldestMessage.author.id) return true;

    const timeDifferenceInMinutes = Math.abs(
        (new Date(newestMessage.timestamp)?.getTime() - new Date(oldestMessage.timestamp)?.getTime()) / (1000 * 60)
    );

    return timeDifferenceInMinutes >= 5;
}
