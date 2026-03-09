import { MessageFlags } from "discord-api-types/v10";
import type { VoiceTemporaryRoom } from "~/db";
import { requireRoom, requireRoomMod } from "~/interactions/guards";
import { replyEphemeral } from "~/interactions/helpers";
import type { InteractionCtx } from "~/interactions/router";

export async function handleRoomKickCommand(ctx: InteractionCtx) {
  const { interaction, guildId, invokerId, api, db } = ctx;
  const i = interaction as any;

  const targetUserId = i.data?.options?.[0]?.options?.[0]?.value as string | undefined;
  if (!targetUserId) return;

  const room = await requireRoom(ctx);
  if (!room) return;

  if (!(await requireRoomMod(ctx, room))) return;

  if (targetUserId === invokerId) {
    await replyEphemeral(ctx, "Нельзя кикнуть себя.");
    return;
  }

  if (targetUserId === room.ownerId) {
    await replyEphemeral(ctx, "Нельзя кикнуть владельца комнаты.");
    return;
  }

  let targetRoom: VoiceTemporaryRoom | null = null;
  for (const [, r] of db.voiceTemporaryRooms.entries()) {
    if (r.guildId === guildId && r.members.includes(targetUserId)) {
      targetRoom = r;
      break;
    }
  }
  if (targetRoom?.channel_id !== room.channel_id) {
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
