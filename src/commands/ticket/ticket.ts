import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { listTicketCategories } from "../../modules/tickets/repository.js";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Gestiona el sistema de tickets.")
  .addSubcommand((subcommand) =>
    subcommand.setName("categorias").setDescription("Muestra las categorías de tickets disponibles."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  const categories = await listTicketCategories(interaction.guild.id);

  if (categories.length === 0) {
    await interaction.reply({
      content: "Todavía no hay categorías de tickets configuradas en este servidor.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: categories.map((category) => `• **${category.name}** — ${category.description ?? "Sin descripción"}`).join("\n"),
    ephemeral: true,
  });
}