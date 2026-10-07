import { SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Inicia la configuración del bot en este servidor.");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    content: "El sistema de configuración base está preparado. Los módulos se habilitarán progresivamente.",
    ephemeral: true,
  });
}
