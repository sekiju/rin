import { MessageFlags, PermissionFlagsBits } from "discord-api-types/v10";
import { VoiceTemporaryRoomAccessMode } from "~/db";
import type { InteractionCtx } from "./router";

export const hasPermission = (permissions: bigint, permission: bigint) => (permissions & permission) === permission;

/** Walk a modal component list and return the inner component for a given custom_id. */
export function getModalComponent(components: any[], customId: string): any {
  for (const comp of components) {
    // Label wrapper: { type: Label, component: { custom_id, ... } }
    const inner = comp.component ?? comp;
    if (inner?.custom_id === customId) return inner;
    // ActionRow: { type: ActionRow, components: [...] }
    for (const c of comp.components ?? []) {
      if (c.custom_id === customId) return c;
    }
  }
  return null;
}

/** Fetch IDs of guild roles that have ManageChannels or MoveMembers permissions. */
export async function fetchModeratorRoleIds(api: InteractionCtx["api"], guildId: string): Promise<string[]> {
  const modPerms = PermissionFlagsBits.ManageChannels | PermissionFlagsBits.MoveMembers;
  const roles = await (api as any).guilds.getRoles(guildId).catch(() => []);
  return (roles as any[]).filter((r) => r.id !== guildId && (BigInt(r.permissions) & modPerms) !== 0n).map((r) => r.id);
}

export function buildRoomPermissionOverwrites(
  guildId: string,
  ownerId: string,
  accessMode: VoiceTemporaryRoomAccessMode,
  moderatorIds: string[],
  whitelistIds: string[],
  blacklistIds: string[],
  moderatorRoleIds: string[] = [],
  syncWithCategory: boolean = false,
): any[] {
  const perms = PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel;

  const everyoneDeny =
    accessMode === VoiceTemporaryRoomAccessMode.Open
      ? 0n
      : accessMode === VoiceTemporaryRoomAccessMode.Locked
        ? PermissionFlagsBits.Connect
        : PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel;

  const memberOverwrites = new Map<string, { allow: bigint; deny: bigint }>();

  for (const id of whitelistIds) memberOverwrites.set(id, { allow: perms, deny: 0n });
  for (const id of moderatorIds) {
    if (!blacklistIds.includes(id)) memberOverwrites.set(id, { allow: perms, deny: 0n });
  }
  for (const id of blacklistIds) memberOverwrites.set(id, { allow: 0n, deny: perms });

  memberOverwrites.set(ownerId, { allow: perms, deny: 0n });

  const everyoneOverwrite =
    syncWithCategory && everyoneDeny === 0n ? null : { id: guildId, type: 0, allow: "0", deny: everyoneDeny.toString() };

  return [
    ...(everyoneOverwrite ? [everyoneOverwrite] : []),
    ...moderatorRoleIds.map((id) => ({ id, type: 0, allow: perms.toString(), deny: "0" })),
    ...[...memberOverwrites.entries()].map(([id, { allow, deny }]) => ({
      id,
      type: 1,
      allow: allow.toString(),
      deny: deny.toString(),
    })),
  ];
}

export async function replyEphemeral(ctx: Pick<InteractionCtx, "interaction" | "api">, content: string): Promise<void> {
  const i = ctx.interaction as any;
  await (ctx.api as any).interactions.reply(i.id, i.token, {
    content,
    flags: MessageFlags.Ephemeral,
  });
}
