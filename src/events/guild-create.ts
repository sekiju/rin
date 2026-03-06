import { EventHandler } from "~/core/types";
import { GatewayDispatchEvents } from "discord-api-types/v10";

const handler: EventHandler<GatewayDispatchEvents.GuildCreate, "db"> = {
  event: GatewayDispatchEvents.GuildCreate,
  services: ["db"],
  handler: async ({ data: guild, db }) => {
    let config = await db.getConfig(guild.id);
    if (!config) return;

    if (config.voice_channel_id) {
      const exists = guild.channels.some((c) => c.id === config.voice_channel_id);
      if (!exists) {
        config.voice_channel_id = null;
        await db.setConfig(config);
      }
    }
  },
};

export default handler;
