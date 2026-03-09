import { GatewayDispatchEvents } from "discord-api-types/v10";
import { EventHandler } from "~/core/types";

const handler: EventHandler<GatewayDispatchEvents.GuildCreate, "db"> = {
  event: GatewayDispatchEvents.GuildCreate,
  services: ["db"],
  handler: async ({ data: guild, db }) => {
    const config = db.serverConfigs.get(guild.id);
    if (!config) return;

    if (config.voice.triggerChannelId) {
      const exists = guild.channels.some((c) => c.id === config.voice.triggerChannelId);
      if (!exists) {
        await db.serverConfigs.put(guild.id, { ...config, voice: { ...config.voice, triggerChannelId: null } });
      }
    }
  },
};

export default handler;
