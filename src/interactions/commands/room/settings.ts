import { ComponentType, TextInputStyle } from "discord-api-types/v10";
import { VoiceTemporaryRoomAccessMode } from "~/db";
import { requireRoom, requireRoomMod } from "~/interactions/guards";
import type { InteractionCtx } from "~/interactions/router";

export async function handleRoomSettingsCommand(ctx: InteractionCtx) {
  const { interaction, api } = ctx;
  // fixme: strict type
  const i = interaction as any;

  const found = await requireRoom(ctx);
  if (!found) return;
  const { channelId, room } = found;

  if (!(await requireRoomMod(ctx, room))) return;

  const channel = (await api.channels.get(channelId).catch(() => null)) as any;

  const accessModeDefaults = (current: VoiceTemporaryRoomAccessMode) => [
    { label: "Открытый", value: "open", default: current === VoiceTemporaryRoomAccessMode.Open },
    { label: "Закрытый", value: "locked", default: current === VoiceTemporaryRoomAccessMode.Locked },
    { label: "Невидимый", value: "hidden", default: current === VoiceTemporaryRoomAccessMode.Hidden },
  ];

  await api.interactions.createModal(i.id, i.token, {
    title: "Настройки комнаты",
    custom_id: `voice-room-config-modal:${channelId}`,
    components: [
      {
        type: ComponentType.Label,
        label: "Название канала",
        component: {
          type: ComponentType.TextInput,
          custom_id: "channel_name",
          style: TextInputStyle.Short,
          value: channel?.name ?? "",
          min_length: 2,
          max_length: 100,
          required: true,
        },
      },
      {
        type: ComponentType.Label,
        label: "Кол-во участников",
        description: "Оставьте пустым — без ограничений",
        component: {
          type: ComponentType.TextInput,
          custom_id: "user_limit",
          style: TextInputStyle.Short,
          value: channel?.user_limit ? String(channel.user_limit) : "",
          max_length: 2,
          required: false,
        },
      },
      {
        type: ComponentType.Label,
        label: "Доступ к каналу",
        component: {
          type: ComponentType.StringSelect,
          custom_id: "access_mode",
          required: true,
          options: accessModeDefaults(room.accessMode),
        },
      },
      {
        type: ComponentType.Label,
        label: "NSFW-режим",
        component: {
          type: ComponentType.Checkbox,
          custom_id: "nsfw_mode",
          default: channel?.nsfw ?? false,
        },
      },
    ],
  });
}
