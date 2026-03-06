import { MessageFlags } from "discord-api-types/v10";
import type { VoiceTemporaryRoomAccessMode } from "~/db";
import { requireRoomMod } from "~/interactions/guards";
import { buildRoomPermissionOverwrites, getModalComponent, replyEphemeral } from "~/interactions/helpers";
import type { InteractionCtx } from "~/interactions/router";

export async function handleRoomConfigModal(ctx: InteractionCtx) {
  const { interaction, guildId, api, db } = ctx;
  const i = interaction as any;

  const channelId = i.data.custom_id.split(":")[1]!;

  const room = await db.getVoiceTemporaryRoom(channelId);
  if (!room) {
    await replyEphemeral(ctx, "Комната больше не существует.");
    return;
  }

  if (!(await requireRoomMod(ctx, room))) return;

  const comps = i.data.components as any[];

  const channelName: string = getModalComponent(comps, "channel_name")?.value ?? "";
  const userLimitRaw: string = getModalComponent(comps, "user_limit")?.value ?? "";
  const accessMode = (getModalComponent(comps, "access_mode")?.values?.[0] ?? "open") as VoiceTemporaryRoomAccessMode;

  const userLimit = Math.max(0, Math.min(99, parseInt(userLimitRaw) || 0));

  // Fetch current lists from DB to rebuild permission overwrites
  const moderatorIds = (await db.getVoiceTemporaryRoomModerators(channelId)).map((m: any) => m.user_id);
  const whitelistIds = await db.getVoiceTemporaryRoomWhitelist(channelId);
  const blacklistIds = await db.getVoiceTemporaryRoomBlacklist(channelId);

  const permissionOverwrites = buildRoomPermissionOverwrites(guildId, room.owner_id, accessMode, moderatorIds, whitelistIds, blacklistIds);

  await api.channels.edit(channelId, {
    name: channelName || undefined,
    user_limit: userLimit,
    permission_overwrites: permissionOverwrites,
  });

  await db.setVoiceTemporaryRoomAccessMode(channelId, accessMode);

  const accessModeLabel = { open: "Открытый", locked: "Закрытый", hidden: "Невидимый" }[accessMode];

  await api.interactions.reply(i.id, i.token, {
    content: [
      "Настройки комнаты обновлены",
      `-# - Название: ${channelName}`,
      `-# - Кол-во участников: ${userLimit === 0 ? "Без ограничений" : userLimit}`,
      `-# - Доступ: ${accessModeLabel}`,
    ].join("\n"),
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
