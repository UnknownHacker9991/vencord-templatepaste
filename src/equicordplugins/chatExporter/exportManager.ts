/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts } from "@webpack/common";

import { downloadFile, ExportOptions, ExportProgress, fetchMessages } from "./exporter";
import { renderHtml } from "./htmlRenderer";

export interface ExportJob {
    id: string;
    label: string;
    progress: ExportProgress;
    abortController: AbortController;
}

export interface ServerExportJob {
    id: string;
    label: string;
    progress: ExportProgress;
    currentChannel: string;
    channelsDone: number;
    totalChannels: number;
    abortController: AbortController;
}

type Listener = () => void;

const channelJobs = new Map<string, ExportJob>();
const serverJobs = new Map<string, ServerExportJob>();
const listeners = new Set<Listener>();

function notify() {
    for (const fn of listeners) fn();
}

export function subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

export function getChannelJob(channelId: string): ExportJob | undefined {
    return channelJobs.get(channelId);
}

export function getServerJob(guildId: string): ServerExportJob | undefined {
    return serverJobs.get(guildId);
}

export function cancelChannelJob(channelId: string) {
    const job = channelJobs.get(channelId);
    if (job) {
        job.abortController.abort();
        channelJobs.delete(channelId);
        notify();
    }
}

export function cancelServerJob(guildId: string) {
    const job = serverJobs.get(guildId);
    if (job) {
        job.abortController.abort();
        serverJobs.delete(guildId);
        notify();
    }
}

export function startChannelExport(
    options: ExportOptions,
    channelName: string,
    serverName: string,
) {
    if (channelJobs.has(options.channelId)) return;

    const controller = new AbortController();
    const job: ExportJob = {
        id: options.channelId,
        label: `#${channelName}`,
        progress: { fetched: 0, total: options.messageLimit, status: "fetching" },
        abortController: controller,
    };
    channelJobs.set(options.channelId, job);
    notify();

    const onProgress = (p: ExportProgress) => {
        job.progress = p;
        notify();
    };

    (async () => {
        try {
            const messages = await fetchMessages(options, onProgress, controller.signal);
            if (controller.signal.aborted) return;

            job.progress = { fetched: messages.length, total: options.messageLimit, status: "rendering" };
            notify();

            const safeName = (serverName + "-" + channelName).replace(/[^a-zA-Z0-9-_]/g, "_");
            const date = new Date().toISOString().split("T")[0];
            const filename = `${safeName}-${date}`;

            if (options.format === "json") {
                downloadFile(JSON.stringify(messages, null, 2), filename + ".json", "application/json");
            } else {
                const html = renderHtml(messages, channelName, serverName);
                downloadFile(html, filename + ".html", "text/html");
            }

            job.progress = { fetched: messages.length, total: options.messageLimit, status: "done" };
            notify();
            showToast(`Export of #${channelName} complete (${messages.length} messages)`, Toasts.Type.SUCCESS);
        } catch (e: any) {
            if (!controller.signal.aborted) {
                job.progress = {
                    fetched: job.progress.fetched,
                    total: job.progress.total,
                    status: "error",
                    error: e?.message ?? "Unknown error"
                };
                notify();
                showToast(`Export of #${channelName} failed`, Toasts.Type.FAILURE);
            }
        } finally {
            // Clean up finished jobs after a short delay so the modal can still read final state
            setTimeout(() => {
                if (job.progress.status === "done" || job.progress.status === "error") {
                    channelJobs.delete(options.channelId);
                    notify();
                }
            }, 5000);
        }
    })();
}

interface ServerExportParams {
    guildId: string;
    guildName: string;
    channels: Array<{ id: string; name: string; }>;
    format: "html" | "json";
    messageLimit: number | null;
    combineFiles: boolean;
}

export function startServerExport(params: ServerExportParams) {
    const { guildId, guildName, channels, format, messageLimit, combineFiles } = params;
    if (serverJobs.has(guildId)) return;

    const controller = new AbortController();
    const job: ServerExportJob = {
        id: guildId,
        label: guildName,
        progress: { fetched: 0, total: null, status: "fetching" },
        currentChannel: "",
        channelsDone: 0,
        totalChannels: channels.length,
        abortController: controller,
    };
    serverJobs.set(guildId, job);
    notify();

    (async () => {
        const allExports: Array<{ channelName: string; messages: any[]; }> = [];
        const CONCURRENCY = 3;

        // Process channels in parallel batches of CONCURRENCY
        for (let i = 0; i < channels.length; i += CONCURRENCY) {
            if (controller.signal.aborted) break;

            const batch = channels.slice(i, i + CONCURRENCY);
            const activeNames = batch.map(c => c.name).join(", ");
            job.currentChannel = activeNames;
            notify();

            const results = await Promise.allSettled(
                batch.map(ch => {
                    const options: ExportOptions = {
                        channelId: ch.id,
                        format,
                        messageLimit,
                        includeImages: true,
                        includeEmbeds: true,
                        includeReactions: true,
                        includePins: true,
                        startDate: null,
                        endDate: null,
                    };
                    return fetchMessages(
                        options,
                        p => { job.progress = p; notify(); },
                        controller.signal,
                    ).then(messages => ({ channelName: ch.name, messages }));
                })
            );

            for (const result of results) {
                if (result.status === "fulfilled") {
                    allExports.push(result.value);
                }
            }

            job.channelsDone = Math.min(i + CONCURRENCY, channels.length);
            notify();
        }

        if (controller.signal.aborted) {
            serverJobs.delete(guildId);
            notify();
            return;
        }

        job.progress = { fetched: 0, total: null, status: "rendering" };
        notify();

        const date = new Date().toISOString().split("T")[0];
        const safeName = guildName.replace(/[^a-zA-Z0-9-_]/g, "_");

        if (combineFiles) {
            if (format === "json") {
                const combined: Record<string, any[]> = {};
                for (const exp of allExports) combined[exp.channelName] = exp.messages;
                downloadFile(JSON.stringify(combined, null, 2), `${safeName}-${date}.json`, "application/json");
            } else {
                let combinedHtml = "";
                for (const exp of allExports) {
                    combinedHtml += renderHtml(exp.messages, exp.channelName, guildName);
                    combinedHtml += "\n\n";
                }
                downloadFile(combinedHtml, `${safeName}-${date}.html`, "text/html");
            }
        } else {
            for (const exp of allExports) {
                const chSafe = exp.channelName.replace(/[^a-zA-Z0-9-_]/g, "_");
                if (format === "json") {
                    downloadFile(JSON.stringify(exp.messages, null, 2), `${safeName}-${chSafe}-${date}.json`, "application/json");
                } else {
                    const html = renderHtml(exp.messages, exp.channelName, guildName);
                    downloadFile(html, `${safeName}-${chSafe}-${date}.html`, "text/html");
                }
            }
        }

        job.progress = { fetched: 0, total: null, status: "done" };
        notify();
        showToast(`Server export of ${guildName} complete (${channels.length} channels)`, Toasts.Type.SUCCESS);

        setTimeout(() => {
            if (job.progress.status === "done" || job.progress.status === "error") {
                serverJobs.delete(guildId);
                notify();
            }
        }, 5000);
    })();
}
