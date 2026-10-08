import type { Client, Guild } from "discord.js";
import { env } from "../config/env.js";
import { ensureGuild } from "../database/repositories/guildRepository.js";

export function registerGuildCreateEvent(client: Client): void {
  client.on("guildCreate", async (guild: Guild) => {
    if (!env.allowedGuildIds.includes(guild.id)) {
      console.log(`[GUILD BLOCKED] ${guild.name} (${guild.id}) no está autorizado. Saliendo del servidor.`);
      await guild.leave().catch((error) => {
        console.error(`[GUILD ERROR] No se pudo salir de ${guild.id}`, error);
      });
      return;
    }

    try {
      await ensureGuild(guild.id, guild.name);
      console.log(`[GUILD] Configuración creada para ${guild.name} (${guild.id}).`);
    } catch (error) {
      console.error(`[GUILD ERROR] No se pudo registrar ${guild.id}`, error);
    }
  });
}
