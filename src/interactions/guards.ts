import type { VoiceTemporaryRoom } from "~/db";
import { replyEphemeral } from "./helpers";
import type { InteractionCtx } from "./router";

export async function requireRoom(ctx: InteractionCtx): Promise<VoiceTemporaryRoom | null> {
  let room: VoiceTemporaryRoom | null = null;
  for (const [, r] of ctx.db.voiceTemporaryRooms.entries()) {
    if (r.guild_id === ctx.guildId && r.members.includes(ctx.invokerId)) {
      room = r;
      break;
    }
  }
  if (!room) {
    await replyEphemeral(ctx, "Вы не находитесь в голосовой комнате.");
    return null;
  }
  return room;
}

export async function requireRoomMod(ctx: InteractionCtx, room: Pick<VoiceTemporaryRoom, "owner_id" | "channel_id">): Promise<boolean> {
  const isMod = room.owner_id === ctx.invokerId || (ctx.db.voiceTemporaryRooms.get(room.channel_id)?.moderators.includes(ctx.invokerId) ?? false);
  if (!isMod) {
    await replyEphemeral(ctx, "Вы не являетесь владельцем или модератором этой комнаты.");
    return false;
  }
  return true;
}
