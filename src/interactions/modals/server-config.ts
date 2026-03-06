import { ComponentType, MessageFlags, PermissionFlagsBits } from "discord-api-types/v10";
import type { ServerConfig } from "~/db";
import { hasPermission } from "~/interactions/helpers";
import type { InteractionCtx } from "~/interactions/router";

export async function handleServerConfigModal(ctx: InteractionCtx) {
  const { interaction, guildId, api, db } = ctx;
  const i = interaction as any;

  const newConfig: ServerConfig = { guild_id: guildId, voice_channel_id: null, room_name_template: null };
  let newCategoryIds: string[] = [];

  for (const component of i.data.components) {
    if (component.type === ComponentType.Label) {
      const c = component.component ?? component;
      if (!c) continue;
      if (c.type === ComponentType.ChannelSelect) {
        if (c.custom_id === "room_channel" && Array.isArray(c.values) && c.values.length > 0)
          newConfig.voice_channel_id = c.values[0]!;
        if (c.custom_id === "room_categories" && Array.isArray(c.values)) newCategoryIds = c.values;
      }
    } else if (component.type === ComponentType.ActionRow) {
      for (const inner of component.components) {
        if (inner.type === ComponentType.TextInput && inner.custom_id === "room_name_template") {
          newConfig.room_name_template = inner.value?.trim() || null;
        }
      }
    }
  }

  const prevConfig = await db.getConfig(guildId);
  const voiceRoomChanged = newConfig.voice_channel_id !== prevConfig?.voice_channel_id;

  const resolvedChannel = i.data.resolved?.channels?.[newConfig.voice_channel_id];
  const requiredPerms = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.MoveMembers;
  if (voiceRoomChanged && !hasPermission(BigInt(resolvedChannel?.permissions || "0"), requiredPerms)) {
    await api.interactions.reply(i.id, i.token, {
      content: `У бота недостаточно прав для канала <#${newConfig.voice_channel_id}>. Необходимые права: Просмотр канала, Управление каналом, Перемещение участников.\n-# Настройки не были изменены.`,
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
      `-# - Голосовой канал для создания комнат: ${newConfig.voice_channel_id ? `<#${newConfig.voice_channel_id}>` : "*(Не задан)*"}`,
      `-# - Категории комнат: ${categoriesText}`,
      `-# - Шаблон имени комнаты: ${templateText}`,
    ].join("\n"),
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
