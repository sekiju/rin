import { APIApplicationCommandInteraction, APIModalSubmitInteraction, InteractionType } from "discord-api-types/v10";
import type { APIInteraction } from "discord-api-types/v10";
import type { API } from "@discordjs/core";
import type { API as API2 } from "@discordjs/core/http-only";
import type * as db from "~/db";

export interface InteractionCtx<T extends APIInteraction = APIInteraction> {
  interaction: T;
  guildId: string;
  invokerId: string;
  api: API | API2;
  db: typeof db;
}

export type CommandCtx = InteractionCtx<APIApplicationCommandInteraction>;
export type ModalCtx = InteractionCtx<APIModalSubmitInteraction>;

type HandlerFn = (ctx: InteractionCtx) => Promise<void>;

interface Route {
  match: (i: APIInteraction) => boolean;
  handle: HandlerFn;
}

export class InteractionRouter {
  private routes: Route[] = [];

  command(name: string, fn: HandlerFn): this {
    this.routes.push({
      match: (i) => i.type === InteractionType.ApplicationCommand && (i.data as any).name === name,
      handle: fn,
    });
    return this;
  }

  subcommand(command: string, sub: string, fn: HandlerFn): this {
    this.routes.push({
      match: (i) =>
        i.type === InteractionType.ApplicationCommand && (i.data as any).name === command && (i.data as any).options?.[0]?.name === sub,
      handle: fn,
    });
    return this;
  }

  subcommandGroup(command: string, group: string, sub: string, fn: HandlerFn): this {
    this.routes.push({
      match: (i) =>
        i.type === InteractionType.ApplicationCommand &&
        (i.data as any).name === command &&
        (i.data as any).options?.[0]?.name === group &&
        (i.data as any).options?.[0]?.options?.[0]?.name === sub,
      handle: fn,
    });
    return this;
  }

  modal(pattern: string | RegExp, fn: HandlerFn): this {
    this.routes.push({
      match: (i) => {
        if (i.type !== InteractionType.ModalSubmit) return false;
        const id = (i.data as any).custom_id ?? "";
        return typeof pattern === "string" ? id === pattern : pattern.test(id);
      },
      handle: fn,
    });
    return this;
  }

  async dispatch(interaction: APIInteraction, base: Omit<InteractionCtx, "interaction">): Promise<void> {
    for (const route of this.routes) {
      if (route.match(interaction)) {
        await route.handle({ ...base, interaction });
        return;
      }
    }
  }
}
