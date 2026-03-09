import { APISelectMenuDefaultValue, ComponentType, SelectMenuDefaultValueType } from "discord-api-types/v10";
import { requireRoom, requireRoomMod } from "~/interactions/guards";
import type { InteractionCtx } from "~/interactions/router";

export async function handleRoomMembersCommand(ctx: InteractionCtx) {
  const { interaction, api } = ctx;
  const i = interaction as any;

  const room = await requireRoom(ctx);
  if (!room) return;

  if (!(await requireRoomMod(ctx, room))) return;

  const moderators = room.moderators;
  const whitelist = room.whitelist;
  const blacklist = room.blacklist;

  const toDefaultUsers = (ids: string[]) =>
    ids.map((id) => ({ id, type: SelectMenuDefaultValueType.User }) satisfies APISelectMenuDefaultValue<SelectMenuDefaultValueType.User>);

  await api.interactions.createModal(i.id, i.token, {
    title: "Участники комнаты",
    custom_id: `voice-room-members-modal:${room.channel_id}`,
    components: [
      {
        type: ComponentType.Label,
        label: "Модераторы",
        component: {
          type: ComponentType.UserSelect,
          custom_id: "moderators",
          min_values: 0,
          max_values: 10,
          default_values: toDefaultUsers(moderators),
          required: false,
        },
      },
      {
        type: ComponentType.Label,
        label: "Белый список",
        component: {
          type: ComponentType.UserSelect,
          custom_id: "user_whitelist",
          min_values: 0,
          max_values: 10,
          default_values: toDefaultUsers(whitelist),
          required: false,
        },
      },
      {
        type: ComponentType.Label,
        label: "Чёрный список",
        component: {
          type: ComponentType.UserSelect,
          custom_id: "user_blacklist",
          min_values: 0,
          max_values: 10,
          default_values: toDefaultUsers(blacklist),
          required: false,
        },
      },
    ],
  });
}
