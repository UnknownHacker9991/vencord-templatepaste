/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@api/Styles";
import ErrorBoundary from "@components/ErrorBoundary";
import { ModalCloseButton, ModalContent, ModalHeader, ModalProps, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { GuildRoleStore, GuildStore, ScrollerThin, Text, TextInput, useMemo, useState } from "@webpack/common";

import openRoleMembersModal from "./RoleMembersModal";

const cl = classNameFactory("vc-rolemembers-");

function AllRolesModalComponent({ guildId, modalProps }: { guildId: string; modalProps: ModalProps; }) {
    const guild = GuildStore.getGuild(guildId);
    const [search, setSearch] = useState("");

    const roles = useMemo(() => {
        return GuildRoleStore.getSortedRoles(guildId);
    }, [guildId]);

    const filtered = useMemo(() => {
        if (!search) return roles;
        const q = search.toLowerCase();
        return roles.filter(r => r.name.toLowerCase().includes(q));
    }, [roles, search]);

    return (
        <ModalRoot {...modalProps} size={ModalSize.MEDIUM}>
            <ModalHeader separator={false}>
                <div className={cl("header")}>
                    <Text variant="heading-lg/semibold">
                        {guild?.name ?? "Server"} — Roles
                    </Text>
                    <Text variant="text-sm/normal" className={cl("subtitle")}>
                        {filtered.length} Role{filtered.length !== 1 ? "s" : ""}
                    </Text>
                </div>
                <ModalCloseButton onClick={modalProps.onClose} />
            </ModalHeader>

            <div className={cl("search")}>
                <TextInput
                    placeholder="Search roles..."
                    value={search}
                    onChange={setSearch}
                />
            </div>

            <ModalContent>
                {filtered.length === 0 ? (
                    <div className={cl("empty")}>
                        <Text variant="text-md/normal">
                            No roles match your search.
                        </Text>
                    </div>
                ) : (
                    <ScrollerThin fade className={cl("scroller")}>
                        {filtered.map(role => (
                            <div
                                key={role.id}
                                className={cl("row")}
                                onClick={() => {
                                    modalProps.onClose();
                                    openRoleMembersModal(guildId, role.id, () => openAllRolesModal(guildId));
                                }}
                            >
                                <span
                                    className={cl("role-dot")}
                                    style={{ backgroundColor: role.colorString ?? "var(--primary-300)" }}
                                />
                                <Text variant="text-md/semibold" style={{ color: role.colorString ?? "var(--text-normal)" }}>
                                    {role.name}
                                </Text>
                            </div>
                        ))}
                    </ScrollerThin>
                )}
            </ModalContent>
        </ModalRoot>
    );
}

const AllRolesModal = ErrorBoundary.wrap(AllRolesModalComponent);

export default function openAllRolesModal(guildId: string) {
    openModal(modalProps => (
        <AllRolesModal guildId={guildId} modalProps={modalProps} />
    ));
}
