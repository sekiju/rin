import { REST } from "@discordjs/rest";
import { GatewayDispatchEvents, GatewayIntentBits } from "discord-api-types/v10";
import { WebSocketManager } from "@discordjs/ws";
import { Client } from "@discordjs/core";
import { buildDependencyTree, registerHandlers } from "~/core/boostrap";
import { join } from "path";
import { loadHandlers } from "~/core/loader";
import * as db from "~/db";
import { initialPresence } from "~/config/presence";
import { applicationCommands } from "~/config/commands";

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error("DISCORD_TOKEN is not defined");

let applicationId = atob(token.split(".")[0]!);

process.title = "Rin";

process.on("uncaughtException", (err) => {
  console.error(`Unhandled Exception: ${err}`);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

const rest = new REST({ version: "10" }).setToken(token);
const gateway = new WebSocketManager({
  token,
  intents:
    GatewayIntentBits.Guilds | GatewayIntentBits.GuildMessages | GatewayIntentBits.GuildVoiceStates | GatewayIntentBits.MessageContent,
  rest,
  shardCount: null,
  initialPresence,
});

const client = new Client({ rest, gateway });

const handlers = await loadHandlers(join(import.meta.dir, "events"));

const tree = buildDependencyTree(handlers, { applicationId }, { db });

registerHandlers(client, tree);

client.once(GatewayDispatchEvents.Ready, (c) => {
  console.info(`[Shard ${c.shardId}] ${c.data.user.username}#${c.data.user.discriminator} is ready!`);
  applicationId = c.data.user.id;

  c.api.applicationCommands.bulkOverwriteGlobalCommands(c.data.user.id, applicationCommands);
});

gateway.connect();
