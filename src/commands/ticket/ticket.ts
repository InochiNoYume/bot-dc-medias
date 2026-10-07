import {
  ActionRowBuilder, EmbedBuilder, ModalBuilder, PermissionFlagsBits, SlashCommandBuilder,
  TextInputBuilder, TextInputStyle, type ChatInputCommandInteraction, ChannelType, type TextChannel,
} from "discord.js";
import {
  createTicketPanel, deleteTicketCategory, listTicketCategories, createTicketCategory,
  updateTicketCategoryConfig, getTicketCategory, countTicketsForCategory, getTicketPanelByChannel,
} from "../../modules/tickets/repository.js";
import { buildTicketPanel } from "../../modules/tickets/panel.js";
import { getTicketByChannel, listTicketLogs } from "../../modules/tickets/actions.js";
import { setTicketArchiveCategory } from "../../database/repositories/guildRepository.js";

export const data = new SlashCommandBuilder()
  .setName("ticket").setDescription("Gestiona el sistema de tickets.")
  .addSubcommand((s) => s.setName("categorias").setDescription("Muestra las categorías disponibles."))
  .addSubcommand((s) => s.setName("historial").setDescription("Muestra el historial del ticket actual."))
  .addSubcommandGroup((g) => g.setName("archivo").setDescription("Configura el archivado de tickets cerrados.")
    .addSubcommand((s) => s.setName("configurar").setDescription("Define la categoría para tickets cerrados.").addChannelOption((o) => o.setName("categoria").setDescription("Categoría de Discord para archivar tickets.").addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand((s) => s.setName("desactivar").setDescription("Desactiva el archivado automático.")))
  .addSubcommandGroup((g) => g.setName("categoria").setDescription("Administra categorías.")
    .addSubcommand((s) => s.setName("crear").setDescription("Crea una categoría."))
    .addSubcommand((s) => s.setName("eliminar").setDescription("Elimina una categoría.").addStringOption((o) => o.setName("id").setDescription("ID de la categoría.").setRequired(true)))
    .addSubcommand((s) => s.setName("configurar").setDescription("Configura el canal y el rol de atención.")
      .addStringOption((o) => o.setName("id").setDescription("ID de la categoría.").setRequired(true))
      .addChannelOption((o) => o.setName("canal").setDescription("Categoría de Discord donde se crearán los tickets.").addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption((o) => o.setName("rol").setDescription("Rol que tendrá acceso a los tickets."))
      .addIntegerOption((o) => o.setName("cierre").setDescription("Minutos de inactividad; usa 0 para desactivar (0-10080).").setMinValue(0).setMaxValue(10080))
      .addBooleanOption((o) => o.setName("quitar_rol").setDescription("Quita el rol de atención configurado."))
      .addBooleanOption((o) => o.setName("quitar_canal").setDescription("Quita la categoría de Discord configurada."))))
  .addSubcommandGroup((g) => g.setName("panel").setDescription("Administra paneles.")
    .addSubcommand((s) => s.setName("publicar").setDescription("Publica el panel de tickets.").addChannelOption((o) => o.setName("canal").setDescription("Canal donde se publicará.").addChannelTypes(ChannelType.GuildText).setRequired(true))));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);

  if (group === "archivo") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true });
      return;
    }
    const action = interaction.options.getSubcommand();
    if (action === "configurar") {
      const category = interaction.options.getChannel("categoria", true);
      if (category.type !== ChannelType.GuildCategory) {
        await interaction.reply({ content: "Debes seleccionar una categoría de Discord.", ephemeral: true });
        return;
      }
      await setTicketArchiveCategory(interaction.guild.id, category.id);
      await interaction.reply({ content: `Archivado de tickets configurado en ${category}.`, ephemeral: true });
      return;
    }
    if (action === "desactivar") {
      await setTicketArchiveCategory(interaction.guild.id, null);
      await interaction.reply({ content: "El archivado automático de tickets ha sido desactivado.", ephemeral: true });
      return;
    }
  }

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
      const autoCloseInput = interaction.options.getInteger("cierre");
      const autoCloseMinutes = autoCloseInput === 0 ? null : autoCloseInput;
      const removeRole = interaction.options.getBoolean("quitar_rol") ?? false;
      const removeChannel = interaction.options.getBoolean("quitar_canal") ?? false;
      if (!discordCategory && !role && autoCloseInput === null && !removeRole && !removeChannel) {
        await interaction.reply({ content: "Debes indicar al menos un cambio de configuración.", ephemeral: true });
        return;
      }
      if (removeRole && role) {
        await interaction.reply({ content: "No puedes indicar un rol y quitar el rol al mismo tiempo.", ephemeral: true });
        return;
      }
      if (removeChannel && discordCategory) {
        await interaction.reply({ content: "No puedes indicar una categoría y quitarla al mismo tiempo.", ephemeral: true });
        return;
      }
      if (discordCategory && discordCategory.type !== ChannelType.GuildCategory) {
        await interaction.reply({ content: "El canal indicado debe ser una categoría de Discord.", ephemeral: true });
        return;
      }
      const staffRoleIds = removeRole ? [] : role ? Array.from(new Set([...category.staff_role_ids, role.id])) : category.staff_role_ids;
      const updated = await updateTicketCategoryConfig(interaction.guild.id, category.id, {
        discordCategoryId: removeChannel ? null : discordCategory?.id ?? category.discord_category_id,
        staffRoleIds,
        autoCloseMinutes: autoCloseInput === null ? category.auto_close_minutes : autoCloseMinutes,
      });
      await interaction.reply({
        content: `Configuración actualizada para **${updated.name}**.\nCategoría de Discord: ${updated.discord_category_id ? `<#${updated.discord_category_id}>` : "Sin configurar"}\nRoles de atención: ${updated.staff_role_ids.length ? updated.staff_role_ids.map((roleId) => `<@&${roleId}>`).join(", ") : "Ninguno"}\nCierre automático: ${updated.auto_close_minutes ? `${updated.auto_close_minutes} min` : "Desactivado"}`,
        ephemeral: true,
      });
      return;
    }

    if (action === "eliminar") {
      const categoryId = interaction.options.getString("id", true);
      const existingCategory = await getTicketCategory(interaction.guild.id, categoryId);
      if (!existingCategory) {
        await interaction.reply({ content: "No existe una categoría con ese ID.", ephemeral: true });
        return;
      }
      const ticketCount = await countTicketsForCategory(interaction.guild.id, categoryId);
      if (ticketCount > 0) {
        await interaction.reply({ content: `No puedes eliminar esta categoría porque tiene **${ticketCount}** ticket(s) asociados. Conserva la categoría para mantener el historial.`, ephemeral: true });
        return;
      }
      await deleteTicketCategory(interaction.guild.id, categoryId);
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
    const existingPanel = await getTicketPanelByChannel(interaction.guild.id, textChannel.id);
    if (existingPanel) {
      await interaction.reply({ content: "Este canal ya tiene un panel de tickets registrado. Si el mensaje fue eliminado, habrá que repararlo antes de publicar otro.", ephemeral: true });
      return;
    }
    const message = await textChannel.send(buildTicketPanel(categories));
    try {
      await createTicketPanel({
        guildId: interaction.guild.id, channelId: textChannel.id, messageId: message.id,
        title: "Soporte", description: "Selecciona una categoría para abrir un ticket.",
      });
    } catch (error) {
      await message.delete().catch(() => undefined);
      throw error;
    }
    await interaction.reply({ content: "Panel de tickets publicado correctamente.", ephemeral: true });
    return;
  }

  if (interaction.options.getSubcommand() === "historial") {
    if (interaction.channel?.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "Este subcomando debe utilizarse dentro de un ticket.", ephemeral: true });
      return;
    }
    const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);
    if (!ticket) {
      await interaction.reply({ content: "Este canal no corresponde a un ticket.", ephemeral: true });
      return;
    }
    const logs = await listTicketLogs(ticket.id, 12);
    const embed = new EmbedBuilder().setTitle(`Historial del Ticket #${ticket.display_number ?? ticket.ticket_number}`).setDescription(
      logs.length ? logs.map((log) => `**${log.action}** · <@${log.actor_id}> · <t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:R>`).join("\\n") : "No hay acciones registradas todavía.",
    );
    await interaction.reply({ embeds: [embed], ephemeral: true });
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
