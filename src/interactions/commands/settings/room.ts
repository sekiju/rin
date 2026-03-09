import {
  APILabelComponent,
  ChannelType,
  ComponentType,
  TextInputStyle
} from "discord-api-types/v10";
import type { CommandCtx } from "~/interactions/router";
import { createComponents } from "~/utils/modal";

export const ROOM_MODAL_COMPONENTS = [
  {
    type: ComponentType.Label,
    label: "Включить",
    component: {
      type: ComponentType.Checkbox,
      custom_id: "enabled",
    },
  },
  {
    type: ComponentType.Label,
    label: "Голосовой канал",
    description: "Канал для создания временных комнат",
    component: {
      type: ComponentType.ChannelSelect,
      custom_id: "triggerChannelId",
      min_values: 0,
      max_values: 1,
      channel_types: [ChannelType.GuildVoice],
      required: false,
    },
  },
  {
    type: ComponentType.Label,
    label: "Категории комнат",
    description: "Категории для временных комнат по приоритету (если категория заполнена — следующая)",
    component: {
      type: ComponentType.ChannelSelect,
      custom_id: "categories",
      min_values: 0,
      max_values: 10,
      channel_types: [ChannelType.GuildCategory],
      required: false,
    },
  },
  {
    type: ComponentType.Label,
    label: "Шаблон имени комнаты",
    component: {
      type: ComponentType.TextInput,
      custom_id: "nameTemplate",
      style: TextInputStyle.Short,
      placeholder: "{username}",
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
      custom_id: "categoryPermissionSync",
    },
  }
] as const satisfies readonly APILabelComponent[];

export async function handleServerSettingsRoomCommand(ctx: CommandCtx) {
  const { interaction, guildId, api, db } = ctx;

  const config = db.serverConfigs.get(guildId, true);

  await api.interactions.createModal(interaction.id, interaction.token, {
    title: "Настройки голосовых комнат",
    custom_id: "server-rooms-config-modal",
    components: createComponents(ROOM_MODAL_COMPONENTS, {
      enabled: config.voice.enabled,
      triggerChannelId: config.voice.triggerChannelId ? [config.voice.triggerChannelId] : [],
      categories: config.voice.categories,
      nameTemplate: config.voice.nameTemplate,
      categoryPermissionSync: config.voice.categoryPermissionSync,
    }),
  });
}
