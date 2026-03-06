import { ChannelType, GatewayDispatchEvents, PermissionFlagsBits } from "discord-api-types/v10";
import { EventHandler } from "~/core/types";

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

    const config = await db.getConfig(guildId);
    if (!config?.voice_channel_id) return;

    const userId = data.user_id;
    const newChannelId = data.channel_id;

    // Step 1: Remove user from any temp room they were in
    const prevChannelId = await db.removeUserFromVoiceTemporaryRooms(userId, guildId);

    // Step 2 (Rule 2): If they left a temp room, delete it if now empty
    if (prevChannelId) {
      const count = await db.countVoiceTemporaryRoomMembers(prevChannelId);
      if (count === 0) {
        await db.deleteVoiceTemporaryRoom(prevChannelId);
        await api.channels.delete(prevChannelId).catch(() => {});
      }
    }

    if (newChannelId === config.voice_channel_id) {
      // Rule 3: Clean up stale empty temp rooms before creating a new one
      const emptyRooms = await db.getEmptyVoiceTemporaryRooms(guildId);
      for (const channelId of emptyRooms) {
        await db.deleteVoiceTemporaryRoom(channelId);
        await api.channels.delete(channelId).catch(() => {});
      }

      // Resolve the room name from the configured template
      const displayName = data.member?.nick ?? data.member?.user?.global_name ?? data.member?.user?.username ?? "User";
      const roomName = resolveRoomName(config.room_name_template ?? "{username}", { username: displayName });

      // Determine which category to place the new channel in
      const targetParentId = await resolveTargetCategory(api, guildId, config.voice_channel_id, db);

      // Rule 1: Create a new temporary room for the user
      // Grant the owner immediate control over their room
      const ownerPerms =
        PermissionFlagsBits.Connect |
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.ManageChannels |
        PermissionFlagsBits.MoveMembers |
        PermissionFlagsBits.PrioritySpeaker;

      const newChannel = await api.guilds.createChannel(guildId, {
        name: roomName,
        type: ChannelType.GuildVoice,
        ...(targetParentId ? { parent_id: targetParentId } : {}),
        permission_overwrites: [{ id: userId, type: 1, allow: ownerPerms.toString(), deny: "0" }],
      });

      await db.createVoiceTemporaryRoom({
        channel_id: newChannel.id,
        guild_id: guildId,
        owner_id: userId,
        access_mode: "open",
      });

      // Move user — triggers another VoiceStateUpdate where they'll be added to members
      await api.guilds.editMember(guildId, userId, { channel_id: newChannel.id });
    } else if (newChannelId) {
      // User joined some other channel — track them if it's a temp room
      const room = await db.getVoiceTemporaryRoom(newChannelId);
      if (room) {
        await db.addVoiceTemporaryRoomMember(newChannelId, userId, guildId);
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
async function resolveTargetCategory(
  api: any,
  guildId: string,
  creationChannelId: string,
  db: any,
): Promise<string | null | undefined> {
  const categoryIds: string[] = await db.getServerConfigCategories(guildId);

  if (categoryIds.length > 0) {
    // Count existing channels per category to detect full ones
    const allChannels: any[] = await api.guilds.getChannels(guildId).catch(() => []);
    const countByCategory = new Map<string, number>();
    for (const ch of allChannels) {
      const parentId = ch.parent_id as string | null | undefined;
      if (parentId) {
        countByCategory.set(parentId, (countByCategory.get(parentId) ?? 0) + 1);
      }
    }

    // Return first category that isn't full
    for (const catId of categoryIds) {
      if ((countByCategory.get(catId) ?? 0) < DISCORD_CATEGORY_LIMIT) {
        return catId;
      }
    }

    // All configured categories are full — use the last one anyway
    return categoryIds.at(-1);
  }

  // No categories configured: fall back to the creation channel's own category
  const creationChannel = await api.channels.get(creationChannelId).catch(() => null);
  return creationChannel?.parent_id as string | null | undefined;
}

export default handler;
