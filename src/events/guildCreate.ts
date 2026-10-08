import type { Client, Guild } from "discord.js";
import { ensureGuild } from "../database/repositories/guildRepository.js";

export function registerGuildCreateEvent(client: Client): void {
  client.on("guildCreate", async (guild: Guild) => {
    try {
      await ensureGuild(guild.id, guild.name);
      console.log(`[GUILD] Configuración creada para ${guild.name} (${guild.id}).`);
    } catch (error) {
      console.error(`[GUILD ERROR] No se pudo registrar ${guild.id}`, error);
    }
  });
}
