import { GatewayDispatchEvents } from "discord-api-types/v10";
import type { EventHandler } from "~/core/types";
import { router } from "~/interactions";

const handler: EventHandler<GatewayDispatchEvents.InteractionCreate, "db"> = {
  event: GatewayDispatchEvents.InteractionCreate,
  services: ["db"],
  handler: async ({ data: interaction, api, db }) => {
    const guildId = interaction.guild_id;
    if (!guildId) return;

    const invokerId: string = (interaction as any).member?.user?.id ?? (interaction as any).user?.id;

    await router.dispatch(interaction, { guildId, invokerId, api, db });
  },
};

export default handler;
