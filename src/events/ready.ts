import type { Client } from "discord.js";
import { env } from "../config/env.js";
import { ensureGuild } from "../database/repositories/guildRepository.js";

export function registerReadyEvent(client: Client): void {
  client.once("ready", async (readyClient) => {
    for (const guild of readyClient.guilds.cache.values()) {
      if (!env.allowedGuildIds.includes(guild.id)) {
        console.log(`[GUILD BLOCKED] ${guild.name} (${guild.id}) no está autorizado. Saliendo del servidor.`);
        await guild.leave().catch((error) => {
          console.error(`[GUILD ERROR] No se pudo salir de ${guild.id}`, error);
        });
        continue;
      }

      try {
        await ensureGuild(guild.id, guild.name);
      } catch (error) {
        console.error(`[GUILD ERROR] ${guild.id}`, error);
      }
    }

    console.log(`[READY] ${readyClient.user.tag} conectado en ${readyClient.guilds.cache.size} servidor(es).`);
  });
}
