import { readdirSync } from "fs";
import { join } from "path";
import type { EventHandler } from "./types";

export async function loadHandlers(eventsDir: string): Promise<EventHandler[]> {
  const files = readdirSync(eventsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

  const handlers = await Promise.all(files.map((f) => import(join(eventsDir, f)).then((m) => m.default as EventHandler)));

  return handlers.filter(Boolean);
}
