import { ChannelType, ComponentType, SelectMenuDefaultValueType, TextInputStyle } from "discord-api-types/v10";
import type { InteractionCtx } from "~/interactions/router";

export async function handleSettingsCommand(ctx: InteractionCtx) {
  const { interaction, guildId, api, db } = ctx;
  const i = interaction as any;

  let config = await db.getConfig(guildId);
  config ||= { guild_id: guildId, voice_channel_id: null, room_name_template: null };

  const categoryIds = await db.getServerConfigCategories(guildId);

  // TODO: Нужно добавить опции: синхронизация с категорией + модерация сервера дискорд
  await api.interactions.createModal(i.id, i.token, {
    title: "Настройки сервера",
    custom_id: "server-config-modal",
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
          default_values: config.voice_channel_id
            ? [{ id: config.voice_channel_id, type: SelectMenuDefaultValueType.Channel }]
            : [],
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
    ],
  } as any);
}
