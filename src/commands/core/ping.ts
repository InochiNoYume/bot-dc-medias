import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Comprueba el estado del bot.");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    content: `Pong! ${interaction.client.ws.ping}ms`,
    ephemeral: true,
  });
}
