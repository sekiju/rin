import { MessageFlags, PermissionFlagsBits } from "discord-api-types/v10";
import { getModalComponent, hasPermission } from "~/interactions/helpers";
import type { ModalCtx } from "~/interactions/router";
import { parseComponents } from "~/utils/modal";
import { ROOM_MODAL_COMPONENTS } from "~/interactions/commands/settings/room";

export async function handleServerRoomsConfigModal(ctx: ModalCtx) {
  const { interaction, guildId, api, db } = ctx;

  const comps = interaction.data.components;
  const parsed = parseComponents(ROOM_MODAL_COMPONENTS, comps);

  const triggerChannelId = parsed.room_channel[0] ?? null;
  const categories: string[] = getModalComponent(comps, "room_categories")?.values ?? [];
  const nameTemplate = parsed.room_name_template.trim() || "{username}";
  const categoryPermissionSync = parsed.room_category_sync;
  const promoteServerMods = parsed.server_mods_as_room_mods;

  const prevConfig = db.serverConfigs.get(guildId, true);
  const voiceRoomChanged = triggerChannelId !== prevConfig.voice.triggerChannelId;

  const resolvedChannel = triggerChannelId ? interaction.data.resolved?.channels?.[triggerChannelId] : null;
  const requiredPerms = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.MoveMembers;
  if (voiceRoomChanged && triggerChannelId && !hasPermission(BigInt(resolvedChannel?.permissions || "0"), requiredPerms)) {
    await api.interactions.reply(interaction.id, interaction.token, {
      content: `У бота недостаточно прав для канала <#${triggerChannelId}>. Необходимые права: Просмотр канала, Управление каналом, Перемещение участников.\n-# Настройки не были изменены.`,
      allowed_mentions: {},
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db.serverConfigs.put(guildId, {
    ...prevConfig,
    voice: { ...prevConfig.voice, triggerChannelId, nameTemplate, categories, categoryPermissionSync, promoteServerMods },
  });

  const categoriesText = categories.length > 0 ? categories.map((id) => `<#${id}>`).join(", ") : "*(Не заданы)*";
  const templateText = nameTemplate !== "{username}" ? `\`${nameTemplate}\`` : "*(По умолчанию)*";

  await api.interactions.reply(interaction.id, interaction.token, {
    content: [
      "Настройки голосовых комнат обновлены",
      `-# - Голосовой канал для создания комнат: ${triggerChannelId ? `<#${triggerChannelId}>` : "*(Не задан)*"}`,
      `-# - Категории комнат: ${categoriesText}`,
      `-# - Шаблон имени комнаты: ${templateText}`,
      `-# - Синхронизация с категорией: ${categoryPermissionSync ? "Включена" : "Выключена"}`,
      `-# - Модераторы сервера как модераторы комнат: ${promoteServerMods ? "Включено" : "Выключено"}`,
    ].join("\n"),
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
