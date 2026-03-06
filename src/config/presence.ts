import { GatewayPresenceUpdateData, PresenceUpdateStatus } from "discord-api-types/v10";

export const initialPresence = {
  since: null,
  activities: [],
  status: PresenceUpdateStatus.Online,
  afk: false,
} satisfies GatewayPresenceUpdateData;
