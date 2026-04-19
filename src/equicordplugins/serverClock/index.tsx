/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { addMemberListDecorator, removeMemberListDecorator } from "@api/MemberListDecorators";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { EquicordDevs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { GuildMemberStore, GuildRoleStore, SelectedGuildStore, UserStore } from "@webpack/common";

import { TimeDisplay } from "./components/TimeDisplay";

const TIMEZONE_ABBREVIATIONS: Record<string, number> = {
    est: -5,
    cst: -6,
    mst: -7,
    pst: -8,
    cet: 1,
    eet: 2,
    ist: 5.5,
    jst: 9,
    aest: 10,
    kst: 9,
    wib: 7,
    trt: 3,
};

const OFFSET_REGEX = /\b(?:GMT|UTC)\s*([+-]?\d{1,2}(?:\.\d+)?)\b/i;

interface TimezoneResult {
    offset: number;
    name: string;
}

const timezoneCache = new Map<string, TimezoneResult | null>();

function getCacheKey(guildId: string, userId: string): string {
    return `${guildId}:${userId}`;
}

const ABBREVIATION_REGEX = new RegExp(
    `(?<=^|[^a-zA-Z])(${Object.keys(TIMEZONE_ABBREVIATIONS).join("|")})(?=$|[^a-zA-Z])`,
    "i"
);

function matchTimezoneInText(text: string): TimezoneResult | null {
    const offsetMatch = text.match(OFFSET_REGEX);
    if (offsetMatch) {
        const offset = parseFloat(offsetMatch[1]);
        return { offset, name: offsetMatch[0] };
    }

    const abbrMatch = text.match(ABBREVIATION_REGEX);
    if (abbrMatch) {
        const matched = abbrMatch[1];
        const key = matched.toLowerCase();
        return { offset: TIMEZONE_ABBREVIATIONS[key], name: matched.toUpperCase() };
    }

    return null;
}

function parseTimezone(guildId: string, userId: string): TimezoneResult | null {
    const key = getCacheKey(guildId, userId);
    if (timezoneCache.has(key)) return timezoneCache.get(key)!;

    const member = GuildMemberStore.getMember(guildId, userId);
    const user = UserStore.getUser(userId);

    // Check nickname first — most servers put timezone info here
    if (member?.nick) {
        const result = matchTimezoneInText(member.nick);
        if (result) {
            timezoneCache.set(key, result);
            return result;
        }
    }

    // Then global display name
    if (user?.globalName) {
        const result = matchTimezoneInText(user.globalName);
        if (result) {
            timezoneCache.set(key, result);
            return result;
        }
    }

    // Then username
    if (user?.username) {
        const result = matchTimezoneInText(user.username);
        if (result) {
            timezoneCache.set(key, result);
            return result;
        }
    }

    // Finally scan role names
    if (member?.roles) {
        for (const roleId of member.roles) {
            const role = GuildRoleStore.getRole(guildId, roleId);
            if (!role?.name) continue;

            const result = matchTimezoneInText(role.name);
            if (result) {
                timezoneCache.set(key, result);
                return result;
            }
        }
    }

    timezoneCache.set(key, null);
    return null;
}

const settings = definePluginSettings({
    showInMemberList: {
        type: OptionType.BOOLEAN,
        description: "Show in member list",
        default: true,
        restartNeeded: true,
    },
    showInPopouts: {
        type: OptionType.BOOLEAN,
        description: "Show in user popouts",
        default: true,
        restartNeeded: true,
    },
    showInProfiles: {
        type: OptionType.BOOLEAN,
        description: "Show in user profiles",
        default: true,
        restartNeeded: true,
    },
    use24Hour: {
        type: OptionType.BOOLEAN,
        description: "Use 24-hour format",
        default: true,
    },
});

function ServerClockIndicator({ userId, isProfile }: { userId?: string; isProfile?: boolean; }) {
    if (!userId) return null;

    const guildId = SelectedGuildStore.getGuildId();
    if (!guildId) return null;

    const tz = parseTimezone(guildId, userId);
    if (!tz) return null;

    if (isProfile) {
        return (
            <div className="vc-serverclock-profile">
                <TimeDisplay
                    utcOffset={tz.offset}
                    timezoneName={tz.name}
                    use24Hour={settings.store.use24Hour}
                />
            </div>
        );
    }

    return (
        <TimeDisplay
            utcOffset={tz.offset}
            timezoneName={tz.name}
            use24Hour={settings.store.use24Hour}
            small
        />
    );
}

export default definePlugin({
    name: "ServerClock",
    description: "Shows teammates' local time next to their name based on timezone info in nicknames, display names, or roles (e.g., GMT+3, EST, CET).",
    authors: [EquicordDevs.UnknownHacker9991],
    dependencies: ["MemberListDecoratorsAPI"],
    settings,

    patches: [
        {
            find: "#{intl::USER_PROFILE_PRONOUNS}",
            replacement: {
                match: /(?<=children:\[\i," ",\i)(?=\])/,
                replace: ",$self.ServerClockIndicator({userId:arguments[0]?.user?.id,isProfile:true})",
            },
            predicate: () => settings.store.showInPopouts || settings.store.showInProfiles,
        },
    ],

    start() {
        timezoneCache.clear();
        if (settings.store.showInMemberList) {
            addMemberListDecorator("ServerClock", ({ user }) =>
                user == null ? null : <ServerClockIndicator userId={user.id} />
            );
        }
    },

    stop() {
        timezoneCache.clear();
        removeMemberListDecorator("ServerClock");
    },

    ServerClockIndicator: ErrorBoundary.wrap(ServerClockIndicator, { noop: true }),
});
