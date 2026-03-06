import type { GatewayDispatchEvents, GatewayDispatchPayload } from "discord-api-types/v10";
import type { API } from "@discordjs/core";
import type { API as API2 } from "@discordjs/core/http-only";
import * as db from "~/db";

export interface Services {
  db: typeof db;
}

export interface EventContext {
  api: API | API2;
  applicationId: string;
}

export type EventHandler<K extends GatewayDispatchEvents = GatewayDispatchEvents, S extends keyof Services = never> = {
  event: K;
  services?: S[];
  handler: (
    ctx: EventContext & {
      data: Extract<GatewayDispatchPayload, { t: K }>["d"];
    } & Pick<Services, S>,
  ) => Promise<void>;
};
