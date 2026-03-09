import { ChannelType, ComponentType, SelectMenuDefaultValueType, TextInputStyle } from "discord-api-types/v10";
import type { CommandCtx } from "~/interactions/router";

export async function handleServerSettingsRoomCommand(ctx: CommandCtx) {
  const { interaction, guildId, api, db } = ctx;

  let config = await db.getConfig(guildId);
  config ||= {
    guild_id: guildId,
    room_channel_id: null,
    room_name_template: null,
    room_category_sync: false,
    server_mods_as_room_mods: false,
    experiment_keyboard_layout_fix: false,
  };

  const categoryIds = await db.getServerConfigCategories(guildId);

  await api.interactions.createModal(interaction.id, interaction.token, {
    title: "Настройки голосовых комнат",
    custom_id: "server-rooms-config-modal",
    components: [
      {
        type: ComponentType.Label,
        label: "Голосовой канал",
        description: "Канал для создания временных комнат",
        component: {
          type: ComponentType.ChannelSelect,
          custom_id: "room_channel",
          min_values: 0,
          max_values: 1,
          channel_types: [ChannelType.GuildVoice],
          default_values: config.room_channel_id ? [{ id: config.room_channel_id, type: SelectMenuDefaultValueType.Channel }] : [],
          required: false,
        },
      },
      {
        type: ComponentType.Label,
        label: "Категории комнат",
        description: "Категории для временных комнат по приоритету (если категория заполнена — следующая)",
        component: {
          type: ComponentType.ChannelSelect,
          custom_id: "room_categories",
          min_values: 0,
          max_values: 10,
          channel_types: [ChannelType.GuildCategory],
          default_values: categoryIds.map((id) => ({ id, type: SelectMenuDefaultValueType.Channel })),
          required: false,
        },
      },
      {
        type: ComponentType.Label,
        label: "Шаблон имени комнаты",
        component: {
          type: ComponentType.TextInput,
          custom_id: "room_name_template",
          style: TextInputStyle.Short,
          placeholder: "{username}",
          ...(config.room_name_template ? { value: config.room_name_template } : {}),
          required: false,
          max_length: 100,
        },
      },
      {
        type: ComponentType.Label,
        label: "Синхронизация с категорией",
        description: "Комнаты наследуют права доступа из родительской категории",
        component: {
          type: ComponentType.Checkbox,
          custom_id: "room_category_sync",
          default: config.room_category_sync,
        },
      },
      {
        type: ComponentType.Label,
        label: "Модераторы сервера — модераторы комнат",
        description: "Роли с правами ManageChannels/MoveMembers получают доступ ко всем комнатам",
        component: {
          type: ComponentType.Checkbox,
          custom_id: "server_mods_as_room_mods",
          default: config.server_mods_as_room_mods,
        },
      },
    ],
  });
}
