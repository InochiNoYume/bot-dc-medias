import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./config/env.js";
import { registerCommands } from "./discord/registerCommands.js";
import { registerInteractionEvent } from "./events/interactionCreate.js";
import { registerGuildCreateEvent } from "./events/guildCreate.js";
import { registerReadyEvent } from "./events/ready.js";
import { verifyDatabaseConnection } from "./services/health.js";
import { registerTicketActivityEvent } from "./events/ticketActivity.js";
import { registerTicketAutoClose } from "./events/ticketAutoClose.js";
import { registerLoggingEvents } from "./modules/logging/service.js";
import { registerAutomodEvents } from "./modules/automod/service.js";
import { registerCreatorNotifications } from "./modules/creators/service.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("error", (error) => {
  console.error("[DISCORD CLIENT ERROR]", error);
});

registerReadyEvent(client);
registerGuildCreateEvent(client);
registerInteractionEvent(client);
registerTicketActivityEvent(client);
registerTicketAutoClose(client);
registerLoggingEvents(client);
registerAutomodEvents(client);
registerCreatorNotifications(client);

async function bootstrap(): Promise<void> {
  await verifyDatabaseConnection();
  await registerCommands();
  await client.login(env.discordToken);
}

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SHUTDOWN] ${signal}`);
  client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("[UNHANDLED REJECTION]", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[UNCAUGHT EXCEPTION]", error);
  void shutdown("UNCAUGHT_EXCEPTION");
});

bootstrap().catch((error: unknown) => {
  console.error("[BOOT ERROR]", error);
  process.exit(1);
});
