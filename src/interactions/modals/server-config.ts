import { MessageFlags, PermissionFlagsBits } from "discord-api-types/v10";
import type { ServerConfig } from "~/db";
import { getModalComponent, hasPermission } from "~/interactions/helpers";
import type { InteractionCtx } from "~/interactions/router";

export async function handleServerConfigModal(ctx: InteractionCtx) {
  const { interaction, guildId, api, db } = ctx;
  const i = interaction as any;

  const comps = i.data.components as any[];

  const newConfig: ServerConfig = {
    guild_id: guildId,
    room_channel_id: getModalComponent(comps, "room_channel")?.values?.[0] ?? null,
    room_name_template: getModalComponent(comps, "room_name_template")?.value?.trim() || null,
    room_category_sync: Boolean(getModalComponent(comps, "room_category_sync")?.value),
    server_mods_as_room_mods: Boolean(getModalComponent(comps, "server_mods_as_room_mods")?.value),
  };
  const newCategoryIds: string[] = getModalComponent(comps, "room_categories")?.values ?? [];

  const prevConfig = await db.getConfig(guildId);
  const voiceRoomChanged = newConfig.room_channel_id !== prevConfig?.room_channel_id;

  const resolvedChannel = i.data.resolved?.channels?.[newConfig.room_channel_id];
  const requiredPerms = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.MoveMembers;
  if (voiceRoomChanged && !hasPermission(BigInt(resolvedChannel?.permissions || "0"), requiredPerms)) {
    await api.interactions.reply(i.id, i.token, {
      content: `У бота недостаточно прав для канала <#${newConfig.room_channel_id}>. Необходимые права: Просмотр канала, Управление каналом, Перемещение участников.\n-# Настройки не были изменены.`,
      allowed_mentions: {},
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db.setConfig({ ...(prevConfig || {}), ...newConfig });
  await db.setServerConfigCategories(guildId, newCategoryIds);

  const categoriesText = newCategoryIds.length > 0 ? newCategoryIds.map((id) => `<#${id}>`).join(", ") : "*(Не заданы)*";
  const templateText = newConfig.room_name_template ? `\`${newConfig.room_name_template}\`` : "*(По умолчанию)*";

  await api.interactions.reply(i.id, i.token, {
    content: [
      "Настройки обновлены",
      `-# - Голосовой канал для создания комнат: ${newConfig.room_channel_id ? `<#${newConfig.room_channel_id}>` : "*(Не задан)*"}`,
      `-# - Категории комнат: ${categoriesText}`,
      `-# - Шаблон имени комнаты: ${templateText}`,
      `-# - Синхронизация с категорией: ${newConfig.room_category_sync ? "Включена" : "Выключена"}`,
      `-# - Модераторы сервера как модераторы комнат: ${newConfig.server_mods_as_room_mods ? "Включено" : "Выключено"}`,
    ].join("\n"),
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
