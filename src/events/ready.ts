import type { Client } from "discord.js";
import { ensureGuild } from "../database/repositories/guildRepository.js";

export function registerReadyEvent(client: Client): void {
  client.once("ready", async (readyClient) => {
    for (const guild of readyClient.guilds.cache.values()) {
      try {
        await ensureGuild(guild.id, guild.name);
      } catch (error) {
        console.error(`[GUILD ERROR] ${guild.id}`, error);
      }
    }

    console.log(`[READY] ${readyClient.user.tag} conectado en ${readyClient.guilds.cache.size} servidor(es).`);
  });
}
