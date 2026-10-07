import type { Client, Interaction } from "discord.js";
import { commands } from "../commands/index.js";

const commandMap = new Map(commands.map((command) => [command.data.name, command]));

export function registerInteractionEvent(client: Client): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandMap.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[COMMAND ERROR] /${interaction.commandName}`, error);

      const content = "Ocurrió un error ejecutando este comando.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, ephemeral: true }).catch(() => undefined);
      } else {
        await interaction.reply({ content, ephemeral: true }).catch(() => undefined);
      }
    }
  });
}
