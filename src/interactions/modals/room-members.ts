import { MessageFlags } from "discord-api-types/v10";
import { requireRoomMod } from "~/interactions/guards";
import { buildRoomPermissionOverwrites, getModalComponent, replyEphemeral } from "~/interactions/helpers";
import type { InteractionCtx } from "~/interactions/router";

export async function handleRoomMembersModal(ctx: InteractionCtx) {
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

  const moderatorIds: string[] = getModalComponent(comps, "moderators")?.values ?? [];
  const whitelistIds: string[] = getModalComponent(comps, "user_whitelist")?.values ?? [];
  const blacklistIds: string[] = getModalComponent(comps, "user_blacklist")?.values ?? [];

  const permissionOverwrites = buildRoomPermissionOverwrites(guildId, room.owner_id, room.access_mode, moderatorIds, whitelistIds, blacklistIds);

  // TODO: Нужна проверка чтобы один пользователь не был в нескольких списках.

  await api.channels.edit(channelId, { permission_overwrites: permissionOverwrites });

  await db.setVoiceTemporaryRoomModerators(channelId, moderatorIds);
  await db.setVoiceTemporaryRoomWhitelist(channelId, whitelistIds);
  await db.setVoiceTemporaryRoomBlacklist(channelId, blacklistIds);

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
