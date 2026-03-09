import { GatewayDispatchEvents } from "discord-api-types/v10";
import { EventHandler } from "~/core/types";

const handler: EventHandler<GatewayDispatchEvents.GuildDelete, "db"> = {
  event: GatewayDispatchEvents.GuildDelete,
  services: ["db"],
  handler: async ({ data: guild, db }) => {
    if (guild.unavailable === true) return;
    await db.serverConfigs.remove(guild.id);
    await db.serverConfigCategories.remove(guild.id);
  },
};

export default handler;
