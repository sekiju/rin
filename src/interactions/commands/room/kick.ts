import { MessageFlags } from "discord-api-types/v10";
import { requireRoom, requireRoomMod } from "~/interactions/guards";
import { replyEphemeral } from "~/interactions/helpers";
import type { InteractionCtx } from "~/interactions/router";

export async function handleRoomKickCommand(ctx: InteractionCtx) {
  const { interaction, guildId, invokerId, api, db } = ctx;
  const i = interaction as any;

  const targetUserId = i.data?.options?.[0]?.options?.[0]?.value as string | undefined;
  if (!targetUserId) return;

  const found = await requireRoom(ctx);
  if (!found) return;
  const { channelId: roomChannelId, room } = found;

  if (!(await requireRoomMod(ctx, room))) return;

  if (targetUserId === invokerId) {
    await replyEphemeral(ctx, "Нельзя кикнуть себя.");
    return;
  }

  if (targetUserId === room.ownerId) {
    await replyEphemeral(ctx, "Нельзя кикнуть владельца комнаты.");
    return;
  }

  let targetChannelId: string | null = null;
  for (const [channelId, r] of db.voiceTemporaryRooms.entries()) {
    if (r.guildId === guildId && r.members.includes(targetUserId)) {
      targetChannelId = channelId;
      break;
    }
  }
  if (targetChannelId !== roomChannelId) {
    await replyEphemeral(ctx, "Этот участник не находится в вашей комнате.");
    return;
  }

  await api.guilds.editMember(guildId, targetUserId, { channel_id: null });

  await api.interactions.reply(i.id, i.token, {
    content: `Участник <@${targetUserId}> кикнут из комнаты.`,
    allowed_mentions: {},
    flags: MessageFlags.Ephemeral,
  });
}
