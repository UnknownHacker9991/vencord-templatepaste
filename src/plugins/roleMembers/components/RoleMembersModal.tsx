/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import ErrorBoundary from "@components/ErrorBoundary";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { FluxDispatcher, GuildMemberStore, GuildRoleStore, ScrollerThin, Text, TextInput, useEffect, useMemo, UserStore,useState, useStateFromStores } from "@webpack/common";

const cl = classNameFactory("vc-rolemembers-");

function RoleMembersModalComponent({ guildId, roleId, modalProps, onBack }: { guildId: string; roleId: string; modalProps: ModalProps; onBack?: () => void; }) {
    const role = GuildRoleStore.getRole(guildId, roleId);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    const memberIds = useStateFromStores(
        [GuildMemberStore],
        () => GuildMemberStore.getMemberIds(guildId),
        null,
        (old, current) => old.length === current.length
    );

    useEffect(() => {
        FluxDispatcher.dispatch({
            type: "GUILD_MEMBERS_REQUEST",
            guildIds: [guildId],
            query: "",
            presences: false
        });

        const timer = setTimeout(() => setLoading(false), 1500);
        return () => clearTimeout(timer);
    }, [guildId]);

    useEffect(() => {
        if (memberIds.length > 0) {
            setLoading(false);
        }
    }, [memberIds.length]);

    const members = useMemo(() => {
        const result: Array<{ userId: string; nick: string | undefined; joinedAt: string | undefined; }> = [];

        for (const userId of memberIds) {
            const member = GuildMemberStore.getMember(guildId, userId);
            if (!member) continue;

            if (roleId === guildId || member.roles.includes(roleId)) {
                result.push({ userId, nick: member.nick, joinedAt: member.joinedAt });
            }
        }

        return result;
    }, [memberIds, guildId, roleId]);

    const filtered = useMemo(() => {
        if (!search) return members;
        const q = search.toLowerCase();
        return members.filter(m => {
            const user = UserStore.getUser(m.userId);
            if (!user) return false;
            const displayName = m.nick ?? user.globalName ?? user.username;
            return displayName.toLowerCase().includes(q) || user.username.toLowerCase().includes(q);
        });
    }, [members, search]);

    const roleName = role?.name ?? "Unknown Role";
    const roleColor = role?.colorString ?? "var(--primary-300)";

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false}>
                {onBack && (
                    <button className={cl("back-button")} onClick={() => {
                        modalProps.onClose();
                        onBack();
                    }}>
                        ← Back
                    </button>
                )}
                <div className={cl("header")}>
                    <div className={cl("header-row")}>
                        <span
                            className={cl("role-dot")}
                            style={{ backgroundColor: roleColor }}
                        />
                        <Text variant="heading-lg/semibold" style={{ color: roleColor }}>
                            {roleName}
                        </Text>
                    </div>
                    <Text variant="text-sm/normal" className={cl("subtitle")}>
                        {loading ? "Loading members..." : `${filtered.length} Member${filtered.length !== 1 ? "s" : ""}`}
                    </Text>
                </div>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>

            <div className={cl("search")}>
                <TextInput
                    placeholder="Search members..."
                    value={search}
                    onChange={setSearch}
                />
            </div>

            <ModalContent>
                {loading ? (
                    <div className={cl("empty")}>
                        <Text variant="text-md/normal">
                            Loading members...
                        </Text>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className={cl("empty")}>
                        <Text variant="text-md/normal">
                            {search ? "No members match your search." : "No cached members with this role."}
                        </Text>
                    </div>
                ) : (
                    <ScrollerThin fade className={cl("scroller")}>
                        {filtered.map(({ userId, nick, joinedAt }) => (
                            <MemberRow
                                key={userId}
                                userId={userId}
                                nick={nick}
                                joinedAt={joinedAt}
                                guildId={guildId}
                            />
                        ))}
                    </ScrollerThin>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

function MemberRow({ userId, nick, joinedAt, guildId }: { userId: string; nick: string | undefined; joinedAt: string | undefined; guildId: string; }) {
    const user = UserStore.getUser(userId);
    if (!user) return null;

    const displayName = nick ?? user.globalName ?? user.username;
    const formattedDate = joinedAt ? formatJoinDate(joinedAt) : "Unknown";

    return (
        <div className={cl("row")}>
            <img
                src={user.getAvatarURL(guildId, 32, false)}
                className={cl("avatar")}
            />
            <div className={cl("row-info")}>
                <Text variant="text-md/semibold" className={cl("row-name")}>
                    {displayName}
                </Text>
                <Text variant="text-xs/normal">
                    {user.username !== displayName ? `${user.username} · ` : ""}Joined {formattedDate}
                </Text>
            </div>
        </div>
    );
}

function formatJoinDate(iso: string): string {
    try {
        const date = new Date(iso);
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    } catch {
        return "Unknown";
    }
}

const RoleMembersModal = ErrorBoundary.wrap(RoleMembersModalComponent);

export default function openRoleMembersModal(guildId: string, roleId: string, onBack?: () => void) {
    openModal(modalProps => (
        <RoleMembersModal guildId={guildId} roleId={roleId} modalProps={modalProps} onBack={onBack} />
    ));
}
