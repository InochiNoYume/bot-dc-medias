import { Client, GatewayIntentBits } from "discord.js";
import { env } from "./config/env.js";
import { registerCommands } from "./discord/registerCommands.js";
import { registerInteractionEvent } from "./events/interactionCreate.js";
import { registerGuildCreateEvent } from "./events/guildCreate.js";
import { registerReadyEvent } from "./events/ready.js";
import { verifyDatabaseConnection } from "./services/health.js";
import { registerTicketActivityEvent } from "./events/ticketActivity.js";

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

async function bootstrap(): Promise<void> {
  await verifyDatabaseConnection();
  await registerCommands();
  await client.login(env.discordToken);
}

bootstrap().catch((error: unknown) => {
  console.error("[BOOT ERROR]", error);
  process.exit(1);
});