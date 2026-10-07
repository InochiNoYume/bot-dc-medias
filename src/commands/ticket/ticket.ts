import {
  ActionRowBuilder, EmbedBuilder, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder,
  TextInputBuilder, TextInputStyle, type ChatInputCommandInteraction, ChannelType, type TextChannel,
} from "discord.js";
import {
  createTicketPanel, deleteTicketCategory, listTicketCategories, createTicketCategory,
  updateTicketCategoryConfig, getTicketCategory,
} from "../../modules/tickets/repository.js";
import { buildTicketPanel } from "../../modules/tickets/panel.js";

export const data = new SlashCommandBuilder()
  .setName("ticket").setDescription("Gestiona el sistema de tickets.")
  .addSubcommand((s) => s.setName("categorias").setDescription("Muestra las categorías disponibles."))
  .addSubcommandGroup((g) => g.setName("categoria").setDescription("Administra categorías.")
    .addSubcommand((s) => s.setName("crear").setDescription("Crea una categoría."))
    .addSubcommand((s) => s.setName("eliminar").setDescription("Elimina una categoría.").addStringOption((o) => o.setName("id").setDescription("ID de la categoría.").setRequired(true)))
    .addSubcommand((s) => s.setName("configurar").setDescription("Configura el canal y el rol de atención.")
      .addStringOption((o) => o.setName("id").setDescription("ID de la categoría.").setRequired(true))
      .addChannelOption((o) => o.setName("canal").setDescription("Categoría de Discord donde se crearán los tickets.").addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption((o) => o.setName("rol").setDescription("Rol que tendrá acceso a los tickets."))
      .addIntegerOption((o) => o.setName("cierre").setDescription("Minutos de inactividad antes del cierre automático (5-10080).").setMinValue(5).setMaxValue(10080)))
  .addSubcommandGroup((g) => g.setName("panel").setDescription("Administra paneles.")
    .addSubcommand((s) => s.setName("publicar").setDescription("Publica el panel de tickets.").addChannelOption((o) => o.setName("canal").setDescription("Canal donde se publicará.").addChannelTypes(ChannelType.GuildText).setRequired(true))));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);

  if (group === "categoria") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true });
      return;
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
        new ActionRowBuilder<TextInputBuilder>().addComponents(input("autoClose", "Cierre automático en minutos (5-10080, 0 = desactivado)", TextInputStyle.Short, "0")),
      );
      await interaction.showModal(modal);
      return;
    }

    if (action === "configurar") {
      const id = interaction.options.getString("id", true);
      const category = await getTicketCategory(interaction.guild.id, id);
      if (!category) {
        await interaction.reply({ content: "No existe una categoría con ese ID.", ephemeral: true });
        return;
      }
      const discordCategory = interaction.options.getChannel("canal");
      const role = interaction.options.getRole("rol");
      const autoCloseMinutes = interaction.options.getInteger("cierre");
      if (!discordCategory && !role && autoCloseMinutes === null) {
        await interaction.reply({ content: "Debes indicar al menos un canal de categoría o un rol.", ephemeral: true });
        return;
      }
      if (discordCategory && discordCategory.type !== ChannelType.GuildCategory) {
        await interaction.reply({ content: "El canal indicado debe ser una categoría de Discord.", ephemeral: true });
        return;
      }
      const staffRoleIds = role ? Array.from(new Set([...category.staff_role_ids, role.id])) : category.staff_role_ids;
      const updated = await updateTicketCategoryConfig(interaction.guild.id, category.id, {
        discordCategoryId: discordCategory?.id ?? category.discord_category_id,
        staffRoleIds,
        autoCloseMinutes: autoCloseMinutes ?? category.auto_close_minutes,
      });
      await interaction.reply({
        content: `Configuración actualizada para **${updated.name}**.\nCategoría de Discord: ${updated.discord_category_id ? `<#${updated.discord_category_id}>` : "Sin configurar"}\nRoles de atención: ${updated.staff_role_ids.length ? updated.staff_role_ids.map((roleId) => `<@&${roleId}>`).join(", ") : "Ninguno"}\nCierre automático: ${updated.auto_close_minutes ? `${updated.auto_close_minutes} min` : "Desactivado"}`,
        ephemeral: true,
      });
      return;
    }

    if (action === "eliminar") {
      await deleteTicketCategory(interaction.guild.id, interaction.options.getString("id", true));
      await interaction.reply({ content: "Categoría eliminada correctamente.", ephemeral: true });
      return;
    }
  }

  if (group === "panel") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true });
      return;
    }
    const categories = await listTicketCategories(interaction.guild.id);
    if (!categories.length) {
      await interaction.reply({ content: "Primero debes crear al menos una categoría.", ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel("canal", true);
    if (channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "El canal indicado no es válido.", ephemeral: true });
      return;
    }
    const textChannel = channel as TextChannel;
    const message = await textChannel.send(buildTicketPanel(categories));
    await createTicketPanel({
      guildId: interaction.guild.id, channelId: textChannel.id, messageId: message.id,
      title: "Soporte", description: "Selecciona una categoría para abrir un ticket.",
    });
    await interaction.reply({ content: "Panel de tickets publicado correctamente.", ephemeral: true });
    return;
  }

  const categories = await listTicketCategories(interaction.guild.id);
  if (!categories.length) {
    await interaction.reply({ content: "Todavía no hay categorías de tickets configuradas.", ephemeral: true });
    return;
  }
  const embed = new EmbedBuilder().setTitle("Categorías de tickets").setDescription(
    categories.map((c) => `**${c.name}**\n${c.description ?? "Sin descripción"}\nID: \`${c.id}\``).join("\n\n"),
  );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
