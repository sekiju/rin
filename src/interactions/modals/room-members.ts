import { MessageFlags } from "discord-api-types/v10";
import { requireRoomMod } from "~/interactions/guards";
import { buildRoomPermissionOverwrites, fetchModeratorRoleIds, getModalComponent, replyEphemeral } from "~/interactions/helpers";
import type { InteractionCtx } from "~/interactions/router";

export async function handleRoomMembersModal(ctx: InteractionCtx) {
  const { interaction, guildId, api, db } = ctx;
  const i = interaction as any;

  const channelId = i.data.custom_id.split(":")[1]!;

  const room = db.voiceTemporaryRooms.get(channelId);
  if (!room) {
    await replyEphemeral(ctx, "Комната больше не существует.");
    return;
  }

  if (!(await requireRoomMod(ctx, room))) return;

  const comps = i.data.components as any[];

  const moderatorIds: string[] = getModalComponent(comps, "moderators")?.values ?? [];
  const whitelistIds: string[] = getModalComponent(comps, "user_whitelist")?.values ?? [];
  const blacklistIds: string[] = getModalComponent(comps, "user_blacklist")?.values ?? [];

  const listByUser = new Map<string, string>();
  const conflicts: string[] = [];
  for (const [listName, ids] of [
    ["Модераторы", moderatorIds],
    ["Белый список", whitelistIds],
    ["Чёрный список", blacklistIds],
  ] as const) {
    for (const id of ids) {
      if (listByUser.has(id)) {
        conflicts.push(`<@${id}> (${listByUser.get(id)} и ${listName})`);
      } else {
        listByUser.set(id, listName);
      }
    }
  }
  if (conflicts.length > 0) {
    await replyEphemeral(ctx, `Участник не может быть в нескольких списках одновременно:\n${conflicts.map((c) => `-# ${c}`).join("\n")}`);
    return;
  }

  const config = db.serverConfigs.get(guildId);
  const moderatorRoleIds = config?.server_mods_as_room_mods ? await fetchModeratorRoleIds(api, guildId) : [];

  const permissionOverwrites = buildRoomPermissionOverwrites(
    guildId,
    room.ownerId,
    room.accessMode,
    moderatorIds,
    whitelistIds,
    blacklistIds,
    moderatorRoleIds,
    config?.room_category_sync ?? false,
  );

  await api.channels.edit(channelId, { permission_overwrites: permissionOverwrites });

  await db.voiceTemporaryRooms.put(channelId, { ...room, moderators: moderatorIds, whitelist: whitelistIds, blacklist: blacklistIds });

  const mention = (ids: string[]) => (ids.length > 0 ? ids.map((id) => `<@${id}>`).join(", ") : "*(Нет)*");

  await api.interactions.reply(i.id, i.token, {
    content: [
      "Список участников обновлён",
      `-# - Модераторы: ${mention(moderatorIds)}`,
      `-# - Белый список: ${mention(whitelistIds)}`,
      `-# - Чёрный список: ${mention(blacklistIds)}`,
    ].join("\n"),
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
