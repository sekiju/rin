import type { VoiceTemporaryRoom } from "~/db";
import { replyEphemeral } from "./helpers";
import type { InteractionCtx } from "./router";

export async function requireRoom(ctx: InteractionCtx): Promise<{ channelId: string; room: VoiceTemporaryRoom } | null> {
  for (const [channelId, room] of ctx.db.voiceTemporaryRooms.entries()) {
    if (room.guildId === ctx.guildId && room.members.includes(ctx.invokerId)) {
      return { channelId, room };
    }
  }
  await replyEphemeral(ctx, "Вы не находитесь в голосовой комнате.");
  return null;
}

export async function requireRoomMod(ctx: InteractionCtx, room: Pick<VoiceTemporaryRoom, "ownerId" | "moderators">): Promise<boolean> {
  const isMod = room.ownerId === ctx.invokerId || room.moderators.includes(ctx.invokerId);
  if (!isMod) {
    await replyEphemeral(ctx, "Вы не являетесь владельцем или модератором этой комнаты.");
    return false;
  }
  return true;
}
