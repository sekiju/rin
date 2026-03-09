import { MessageFlags, PermissionFlagsBits } from "discord-api-types/v10";
import type { ServerConfig } from "~/db";
import { getModalComponent, hasPermission } from "~/interactions/helpers";
import type { ModalCtx } from "~/interactions/router";
import { parseComponents } from "~/utils/modal";
import { ROOM_MODAL_COMPONENTS } from "~/interactions/commands/settings/room";

export async function handleServerRoomsConfigModal(ctx: ModalCtx) {
  const { interaction, guildId, api, db } = ctx;

  const comps = interaction.data.components;

  const parsed = parseComponents(ROOM_MODAL_COMPONENTS, interaction.data.components);

  const newConfig: Partial<ServerConfig> = {
    guild_id: guildId,
    room_channel_id: parsed.room_channel[0] ?? null,
    room_name_template: parsed.room_name_template.trim() || null,
    room_category_sync: parsed.room_category_sync,
    server_mods_as_room_mods: parsed.server_mods_as_room_mods,
  };
  const newCategoryIds: string[] = getModalComponent(comps, "room_categories")?.values ?? [];

  const prevConfig = await db.getConfig(guildId);
  const voiceRoomChanged = newConfig.room_channel_id !== prevConfig?.room_channel_id;

  const resolvedChannel = interaction.data.resolved?.channels?.[newConfig.room_channel_id];
  const requiredPerms = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.MoveMembers;
  if (voiceRoomChanged && !hasPermission(BigInt(resolvedChannel?.permissions || "0"), requiredPerms)) {
    await api.interactions.reply(interaction.id, interaction.token, {
      content: `У бота недостаточно прав для канала <#${newConfig.room_channel_id}>. Необходимые права: Просмотр канала, Управление каналом, Перемещение участников.\n-# Настройки не были изменены.`,
      allowed_mentions: {},
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db.setConfig({ ...prevConfig, ...newConfig });
  await db.setServerConfigCategories(guildId, newCategoryIds);

  const categoriesText = newCategoryIds.length > 0 ? newCategoryIds.map((id) => `<#${id}>`).join(", ") : "*(Не заданы)*";
  const templateText = newConfig.room_name_template ? `\`${newConfig.room_name_template}\`` : "*(По умолчанию)*";

  await api.interactions.reply(interaction.id, interaction.token, {
    content: [
      "Настройки голосовых комнат обновлены",
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
