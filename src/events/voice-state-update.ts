import { ChannelType, GatewayDispatchEvents, PermissionFlagsBits } from "discord-api-types/v10";
import { fetchModeratorRoleIds } from "~/interactions/helpers";
import { EventHandler } from "~/core/types";
import { VoiceTemporaryRoomAccessMode } from "~/db";

/** Maximum number of channels allowed inside a single Discord category. */
const DISCORD_CATEGORY_LIMIT = 50;

/** Replace template variables in a room name. Supported: {username} */
function resolveRoomName(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

const handler: EventHandler<GatewayDispatchEvents.VoiceStateUpdate, "db"> = {
  event: GatewayDispatchEvents.VoiceStateUpdate,
  services: ["db"],
  handler: async ({ data, db, api }) => {
    const guildId = data.guild_id;
    if (!guildId) return;

    const config = db.serverConfigs.get(guildId, true);
    if (!config.voice.enabled || !config.voice.triggerChannelId) return;

    const userId = data.user_id;
    const newChannelId = data.channel_id;

    let prevChannelId: string | null = null;
    for (const [channelId, room] of db.voiceTemporaryRooms.entries()) {
      if (room.guildId === guildId && room.members.includes(userId)) {
        await db.voiceTemporaryRooms.put(channelId, { ...room, members: room.members.filter((id) => id !== userId) });
        prevChannelId = channelId;
        break;
      }
    }

    if (prevChannelId) {
      const count = db.voiceTemporaryRooms.get(prevChannelId)?.members.length ?? 0;
      if (count === 0) {
        await db.voiceTemporaryRooms.remove(prevChannelId);
        await api.channels.delete(prevChannelId).catch(() => {});
      }
    }

    if (newChannelId === config.voice.triggerChannelId) {
      const emptyRooms: string[] = [];
      for (const [channelId, room] of db.voiceTemporaryRooms.entries()) {
        if (room.guildId === guildId && room.members.length === 0) emptyRooms.push(channelId);
      }
      for (const channelId of emptyRooms) {
        await db.voiceTemporaryRooms.remove(channelId);
        await api.channels.delete(channelId).catch(() => {});
      }

      const displayName = data.member?.nick ?? data.member?.user?.global_name ?? data.member?.user?.username ?? "User";
      const roomName = resolveRoomName(config.voice.nameTemplate, { username: displayName });

      const targetParentId = await resolveTargetCategory(api, guildId, config.voice.triggerChannelId, db);

      const categoryOverwrites =
        config.voice.categoryPermissionSync && targetParentId
          ? (((await api.channels.get(targetParentId).catch(() => null)) as any)?.permission_overwrites ?? [])
          : [];

      const superUserPerms = (PermissionFlagsBits.Connect | PermissionFlagsBits.ViewChannel).toString();

      const moderatorRoleIds = config.voice.promoteServerMods ? await fetchModeratorRoleIds(api, guildId) : [];
      const modRoleOverwrites = moderatorRoleIds.map((id) => ({
        id,
        type: 0,
        allow: superUserPerms,
        deny: "0",
      }));

      const newChannel = await api.guilds.createChannel(guildId, {
        name: roomName,
        type: ChannelType.GuildVoice,
        ...(targetParentId ? { parent_id: targetParentId } : {}),
        permission_overwrites: [...categoryOverwrites, ...modRoleOverwrites, { id: userId, type: 1, allow: superUserPerms, deny: "0" }],
      });

      await db.voiceTemporaryRooms.put(newChannel.id, {
        guildId: guildId,
        ownerId: userId,
        accessMode: VoiceTemporaryRoomAccessMode.Open,
        members: [],
        whitelist: [],
        blacklist: [],
        moderators: [],
      });

      await api.guilds.editMember(guildId, userId, { channel_id: newChannel.id });
    } else if (newChannelId) {
      const room = db.voiceTemporaryRooms.get(newChannelId);
      if (room && !room.members.includes(userId)) {
        await db.voiceTemporaryRooms.put(newChannelId, { ...room, members: [...room.members, userId] });
      }
    }
  },
};

/**
 * Determines the parent category ID for a new temporary room.
 *
 * Priority:
 * 1. Configured categories (in order) — skips full ones (≥ DISCORD_CATEGORY_LIMIT channels)
 * 2. Falls back to the creation channel's own category if no categories configured
 */
async function resolveTargetCategory(api: any, guildId: string, creationChannelId: string, db: any): Promise<string | null | undefined> {
  const categoryIds: string[] = db.serverConfigCategories.get(guildId) ?? [];

  if (categoryIds.length > 0) {
    const allChannels: any[] = await api.guilds.getChannels(guildId).catch(() => []);
    const countByCategory = new Map<string, number>();
    for (const ch of allChannels) {
      const parentId = ch.parent_id as string | null | undefined;
      if (parentId) {
        countByCategory.set(parentId, (countByCategory.get(parentId) ?? 0) + 1);
      }
    }

    for (const catId of categoryIds) {
      if ((countByCategory.get(catId) ?? 0) < DISCORD_CATEGORY_LIMIT) {
        return catId;
      }
    }

    return categoryIds.at(-1);
  }

  const creationChannel = await api.channels.get(creationChannelId).catch(() => null);
  return creationChannel?.parent_id as string | null | undefined;
}

export default handler;
