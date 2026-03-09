import { MessageFlags, PermissionFlagsBits } from "discord-api-types/v10";
import { hasPermission } from "~/interactions/helpers";
import type { ModalCtx } from "~/interactions/router";
import { parseComponents } from "~/utils/modal";
import { ROOM_MODAL_COMPONENTS } from "~/interactions/commands/settings/room";

export async function handleServerRoomsConfigModal(ctx: ModalCtx) {
  const { interaction, guildId, api, db } = ctx;

  const comps = interaction.data.components;
  const parsed = parseComponents(ROOM_MODAL_COMPONENTS, comps);

  const triggerChannelId = parsed.triggerChannelId[0] ?? null;
  const nameTemplate = parsed.nameTemplate.trim() || "{username}";

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

  console.log("parsed", parsed);

  await db.serverConfigs.put(guildId, {
    ...prevConfig,
    voice: {
      ...prevConfig.voice,
      enabled: parsed.enabled,
      triggerChannelId,
      nameTemplate,
      categories: parsed.categories,
      categoryPermissionSync: parsed.categoryPermissionSync,
    },
  });

  const categoriesText = parsed.categories.length ? parsed.categories.map((id) => `<#${id}>`).join(", ") : "*(Не заданы)*";

  await api.interactions.reply(interaction.id, interaction.token, {
    content: [
      "Настройки голосовых комнат обновлены",
      `-# - Статус: ${parsed.enabled ? "Включена" : "Выключена"}`,
      `-# - Голосовой канал для создания комнат: ${triggerChannelId ? `<#${triggerChannelId}>` : "*(Не задан)*"}`,
      `-# - Категории комнат: ${categoriesText}`,
      `-# - Шаблон имени комнаты: \`${nameTemplate}\``,
      `-# - Синхронизация с категорией: ${parsed.categoryPermissionSync ? "Включена" : "Выключена"}`,
    ].join("\n"),
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
