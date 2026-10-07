import type { Client } from "discord.js";

export function registerReadyEvent(client: Client): void {
  client.once("ready", (readyClient) => {
    console.log(`[READY] ${readyClient.user.tag} conectado en ${readyClient.guilds.cache.size} servidor(es).`);
  });
}
