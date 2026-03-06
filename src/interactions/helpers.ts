import { MessageFlags, PermissionFlagsBits } from "discord-api-types/v10";
import type { VoiceTemporaryRoomAccessMode } from "~/db";
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

export function buildRoomPermissionOverwrites(
  guildId: string,
  ownerId: string,
  accessMode: VoiceTemporaryRoomAccessMode,
  moderatorIds: string[],
  whitelistIds: string[],
  blacklistIds: string[],
): any[] {
  const perms = PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel;

  const everyoneDeny =
    accessMode === "open"
      ? 0n
      : accessMode === "locked"
        ? PermissionFlagsBits.Connect
        : PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel;

  const memberOverwrites = new Map<string, { allow: bigint; deny: bigint }>();

  for (const id of whitelistIds) memberOverwrites.set(id, { allow: perms, deny: 0n });
  for (const id of moderatorIds) {
    if (!blacklistIds.includes(id)) memberOverwrites.set(id, { allow: perms, deny: 0n });
  }
  for (const id of blacklistIds) memberOverwrites.set(id, { allow: 0n, deny: perms });

  memberOverwrites.set(ownerId, { allow: perms, deny: 0n });

  return [
    { id: guildId, type: 0, allow: "0", deny: everyoneDeny.toString() },
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
