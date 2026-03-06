import type { VoiceTemporaryRoom } from "~/db";
import { replyEphemeral } from "./helpers";
import type { InteractionCtx } from "./router";

export async function requireRoom(ctx: InteractionCtx): Promise<VoiceTemporaryRoom | null> {
  const room = await ctx.db.getUserCurrentVoiceRoom(ctx.invokerId, ctx.guildId);
  if (!room) {
    await replyEphemeral(ctx, "Вы не находитесь в голосовой комнате.");
    return null;
  }
  return room;
}

export async function requireRoomMod(
  ctx: InteractionCtx,
  room: Pick<VoiceTemporaryRoom, "owner_id" | "channel_id">,
): Promise<boolean> {
  const isMod =
    room.owner_id === ctx.invokerId ||
    (await ctx.db.isVoiceTemporaryRoomModerator(room.channel_id, ctx.invokerId));
  if (!isMod) {
    await replyEphemeral(ctx, "Вы не являетесь владельцем или модератором этой комнаты.");
    return false;
  }
  return true;
}
