import {
  ActionRowBuilder, EmbedBuilder, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder,
  TextInputBuilder, TextInputStyle, type ChatInputCommandInteraction,
} from "discord.js";
import { createTicketCategory, deleteTicketCategory, listTicketCategories } from "../../modules/tickets/repository.js";

export const data = new SlashCommandBuilder()
  .setName("ticket").setDescription("Gestiona el sistema de tickets.")
  .addSubcommand(s => s.setName("categorias").setDescription("Muestra las categorías disponibles."))
  .addSubcommandGroup(g => g.setName("categoria").setDescription("Administra categorías.")
    .addSubcommand(s => s.setName("crear").setDescription("Crea una categoría."))
    .addSubcommand(s => s.setName("eliminar").setDescription("Elimina una categoría.")
      .addStringOption(o => o.setName("id").setDescription("ID de la categoría.").setRequired(true))));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true }); return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  if (group === "categoria") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true }); return;
    }
    const action = interaction.options.getSubcommand();
    if (action === "crear") {
      const modal = new ModalBuilder().setCustomId("ticket:category:create").setTitle("Crear categoría de tickets");
      const input = (id: string, label: string, style: TextInputStyle, value?: string) =>
        new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(true).setMaxLength(style === TextInputStyle.Paragraph ? 500 : 100).setValue(value ?? "");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(input("name", "Nombre", TextInputStyle.Short)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(input("description", "Descripción", TextInputStyle.Paragraph)),
        new ActionRowBuilder<TextInputBuilder>().addComponents(input("priority", "Prioridad: low, normal, high, urgent", TextInputStyle.Short, "normal")),
        new ActionRowBuilder<TextInputBuilder>().addComponents(input("maxOpen", "Máximo de tickets abiertos por usuario", TextInputStyle.Short, "1")),
      );
      await interaction.showModal(modal); return;
    }
    if (action === "eliminar") {
      await deleteTicketCategory(interaction.guild.id, interaction.options.getString("id", true));
      await interaction.reply({ content: "Categoría eliminada correctamente.", ephemeral: true }); return;
    }
  }

  const categories = await listTicketCategories(interaction.guild.id);
  if (!categories.length) {
    await interaction.reply({ content: "Todavía no hay categorías de tickets configuradas.", ephemeral: true }); return;
  }
  const embed = new EmbedBuilder().setTitle("Categorías de tickets").setDescription(
    categories.map(c => "**" + c.name + "**\n" + (c.description ?? "Sin descripción") + "\nID: `" + c.id + "`").join("\n\n")
  );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
