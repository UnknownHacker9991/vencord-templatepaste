/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import { EquicordDevs } from "@utils/constants";
import { getCurrentGuild } from "@utils/discord";
import definePlugin from "@utils/types";
import { GuildRoleStore, Menu, SelectedGuildStore } from "@webpack/common";

import openAllRolesModal from "./components/AllRolesModal";
import openRoleMembersModal from "./components/RoleMembersModal";

const devContextMenuPatch: NavContextMenuPatchCallback = (children, { id }: { id: string; }) => {
    const guild = getCurrentGuild();
    if (!guild) return;

    const role = GuildRoleStore.getRole(guild.id, id);
    if (!role) return;

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-role-members"
                label="View Role Members"
                action={() => openRoleMembersModal(guild.id, id)}
            />
        </Menu.MenuGroup>
    );
};

const guildContextMenuPatch: NavContextMenuPatchCallback = (children, { guild }: { guild: any; }) => {
    if (!guild?.id) return;

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-view-all-roles"
                label="View All Roles"
                action={() => openAllRolesModal(guild.id)}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: "RoleMembers",
    description: "Click role pills on profiles and in server settings to see a list of members with that role. Right click a server to view all roles.",
    authors: [EquicordDevs.UnknownHacker9991],

    patches: [
        {
            find: "#{intl::COLLAPSE_ROLES}",
            replacement: {
                match: /(?<=\.id\)\),\i\(\))(?=,\i\?)/,
                replace: ",$self.RolePillClickWrapper(arguments[0])"
            }
        },
        {
            find: "#{intl::GUILD_SETTINGS_EDIT_ROLE}",
            replacement: {
                match: /onClick:(\i),/,
                replace: "onClick:(e)=>{if(e.shiftKey){$self.onSettingsRoleClick(arguments[0]);return;}$1(e)},"
            }
        }
    ],

    RolePillClickWrapper: ErrorBoundary.wrap(({ guild }: { guild: { id: string; }; }) => {
        if (!guild?.id) return null;

        const onClick = (e: React.MouseEvent<HTMLElement>) => {
            if (e.button !== 0 || e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;

            let el = e.target as HTMLElement | null;
            while (el && el !== e.currentTarget) {
                const itemId = el.getAttribute("data-list-item-id");
                if (itemId?.startsWith("roles-")) {
                    const roleId = itemId.slice("roles-".length);
                    if (roleId) {
                        openRoleMembersModal(guild.id, roleId);
                        return;
                    }
                }
                el = el.parentElement;
            }
        };

        return (
            <span
                style={{ display: "none" }}
                ref={el => {
                    const parent = el?.parentElement;
                    if (!parent) return;

                    if ((parent as any).__vcRoleMembersHandler) return;
                    (parent as any).__vcRoleMembersHandler = true;

                    parent.addEventListener("click", onClick as any, true);
                    }}
            />
        );
    }, { noop: true }),

    onSettingsRoleClick(props: any) {
    const roleId = props?.role?.id;
    const guildId = SelectedGuildStore.getGuildId();
    if (!roleId || !guildId) return;
    openRoleMembersModal(guildId, roleId);
},

    contextMenus: {
        "dev-context": devContextMenuPatch,
        "guild-context": guildContextMenuPatch,
        "guild-header-popout": guildContextMenuPatch
    }
});
