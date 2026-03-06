import type { Client } from "@discordjs/core";
import type { EventHandler, Services, EventContext } from "./types";

type BoundHandler = (data: any) => Promise<void>;

export function buildDependencyTree(
  handlers: EventHandler[],
  context: EventContext,
  services: Partial<Services>,
): Map<string, BoundHandler> {
  const tree = new Map<string, BoundHandler>();

  for (const handler of handlers) {
    for (const dep of handler.services ?? []) {
      if (services[dep] == null) {
        throw new Error(
          `Handler "${handler.event}" requires service "${dep}" but it's not available.\n` + `Check your environment variables.`,
        );
      }
    }

    const injected = Object.fromEntries((handler.services ?? []).map((s) => [s, services[s]])) as Pick<
      Services,
      (typeof handler.services)[number]
    >;

    const bound: BoundHandler = (data) => handler.handler({ ...context, ...injected, data: data.data, api: data.api });

    tree.set(handler.event, bound);
  }

  return tree;
}

export function registerHandlers(client: Client, tree: Map<string, BoundHandler>) {
  for (const [event, handler] of tree) {
    client.on(event as any, async (data) => {
      try {
        await handler(data);
      } catch (err) {
        console.error(`[${event}] Unhandled error:`, err);
      }
    });
  }
}
