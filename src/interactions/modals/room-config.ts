import { MessageFlags } from "discord-api-types/v10";
import type { VoiceTemporaryRoomAccessMode } from "~/db";
import { requireRoomMod } from "~/interactions/guards";
import { buildRoomPermissionOverwrites, fetchModeratorRoleIds, getModalComponent, replyEphemeral } from "~/interactions/helpers";
import type { InteractionCtx } from "~/interactions/router";

export async function handleRoomConfigModal(ctx: InteractionCtx) {
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

  const channelName: string = getModalComponent(comps, "channel_name")?.value ?? "";
  const userLimitRaw: string = getModalComponent(comps, "user_limit")?.value ?? "";
  const accessMode = (getModalComponent(comps, "access_mode")?.values?.[0] ?? "open") as VoiceTemporaryRoomAccessMode;
  const nsfw: boolean = Boolean(getModalComponent(comps, "nsfw_mode")?.value);

  const userLimit = Math.max(0, Math.min(99, parseInt(userLimitRaw) || 0));

  const moderatorIds = room.moderators;
  const whitelistIds = room.whitelist;
  const blacklistIds = room.blacklist;

  const config = db.serverConfigs.get(guildId);
  const moderatorRoleIds = config?.server_mods_as_room_mods ? await fetchModeratorRoleIds(api, guildId) : [];

  const permissionOverwrites = buildRoomPermissionOverwrites(
    guildId,
    room.owner_id,
    accessMode,
    moderatorIds,
    whitelistIds,
    blacklistIds,
    moderatorRoleIds,
    config?.room_category_sync ?? false,
  );

  await api.channels.edit(channelId, {
    name: channelName || undefined,
    user_limit: userLimit,
    nsfw,
    permission_overwrites: permissionOverwrites,
  });

  await db.voiceTemporaryRooms.put(channelId, { ...room, access_mode: accessMode });

  const accessModeLabel = { open: "Открытый", locked: "Закрытый", hidden: "Невидимый" }[accessMode];

  await api.interactions.reply(i.id, i.token, {
    content: [
      "Настройки комнаты обновлены",
      `-# - Название: ${channelName}`,
      `-# - Кол-во участников: ${userLimit === 0 ? "Без ограничений" : userLimit}`,
      `-# - Доступ: ${accessModeLabel}`,
      `-# - NSFW: ${nsfw ? "Включён" : "Выключен"}`,
    ].join("\n"),
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
