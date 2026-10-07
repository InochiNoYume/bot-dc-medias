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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

registerReadyEvent(client);
registerGuildCreateEvent(client);
registerInteractionEvent(client);
registerTicketActivityEvent(client);
registerTicketAutoClose(client);
registerLoggingEvents(client);

async function bootstrap(): Promise<void> {
  await verifyDatabaseConnection();
  await registerCommands();
  await client.login(env.discordToken);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[SHUTDOWN] ${signal}`);
  client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

bootstrap().catch((error: unknown) => {
  console.error("[BOOT ERROR]", error);
  process.exit(1);
});