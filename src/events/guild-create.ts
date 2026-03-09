import { EventHandler } from "~/core/types";
import { GatewayDispatchEvents } from "discord-api-types/v10";

const handler: EventHandler<GatewayDispatchEvents.GuildCreate, "db"> = {
  event: GatewayDispatchEvents.GuildCreate,
  services: ["db"],
  handler: async ({ data: guild, db }) => {
    const config = db.serverConfigs.get(guild.id);
    if (!config) return;

    if (config.room_channel_id) {
      const exists = guild.channels.some((c) => c.id === config.room_channel_id);
      if (!exists) {
        await db.serverConfigs.put(guild.id, { ...config, room_channel_id: null });
      }
    }
  },
};

export default handler;
