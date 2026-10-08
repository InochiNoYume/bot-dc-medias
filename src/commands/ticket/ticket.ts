import {
  EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder,
  type ChatInputCommandInteraction, ChannelType, type TextChannel,
} from "discord.js";
import {
  createTicketPanel, deleteTicketCategory, listTicketCategories, createTicketCategory,
  updateTicketCategoryConfig, getTicketCategory, countTicketsForCategory, getTicketPanelByChannel, updateTicketPanelMessage,
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
  .addSubcommandGroup((g) => g.setName("categoria").setDescription("Administra categorías de tickets.")
    .addSubcommand((s) => s.setName("crear").setDescription("Crea una categoría de tickets ya vinculada a Discord.")
      .addStringOption((o) => o.setName("nombre").setDescription("Nombre visible de la categoría.").setRequired(true).setMaxLength(80))
      .addStringOption((o) => o.setName("descripcion").setDescription("Descripción que verá el usuario.").setRequired(true).setMaxLength(500))
      .addChannelOption((o) => o.setName("canal").setDescription("Categoría de Discord donde se crearán los tickets.").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addRoleOption((o) => o.setName("rol").setDescription("Rol que atenderá los tickets.").setRequired(true))
      .addStringOption((o) => o.setName("prioridad").setDescription("Prioridad inicial de los tickets.").setRequired(true).addChoices(
        { name: "Baja", value: "low" }, { name: "Normal", value: "normal" }, { name: "Alta", value: "high" }, { name: "Urgente", value: "urgent" },
      )))
      .addIntegerOption((o) => o.setName("maximos").setDescription("Máximo de tickets abiertos por usuario.").setMinValue(1).setMaxValue(20))
      .addIntegerOption((o) => o.setName("cierre").setDescription("Minutos de inactividad; 0 desactiva el cierre automático.").setMinValue(0).setMaxValue(10080)))
    .addSubcommand((s) => s.setName("eliminar").setDescription("Elimina una categoría de tickets.").addStringOption((o) => o.setName("id").setDescription("ID de la categoría.").setRequired(true)))
    .addSubcommand((s) => s.setName("configurar").setDescription("Modifica una categoría existente.")
      .addStringOption((o) => o.setName("id").setDescription("ID de la categoría.").setRequired(true))
      .addChannelOption((o) => o.setName("canal").setDescription("Nueva categoría de Discord.").addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption((o) => o.setName("rol").setDescription("Añade un rol de atención."))
      .addIntegerOption((o) => o.setName("cierre").setDescription("Minutos de inactividad; 0 desactiva el cierre automático.").setMinValue(0).setMaxValue(10080))
      .addRoleOption((o) => o.setName("quitar_rol").setDescription("Quita un rol de atención."))
      .addBooleanOption((o) => o.setName("quitar_canal").setDescription("Desvincula la categoría de Discord."))))
  .addSubcommandGroup((g) => g.setName("panel").setDescription("Administra paneles de tickets.")
    .addSubcommand((s) => s.setName("publicar").setDescription("Publica el panel de tickets.").addChannelOption((o) => o.setName("canal").setDescription("Canal donde se publicará.").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName("reparar").setDescription("Repara el panel registrado en un canal.").addChannelOption((o) => o.setName("canal").setDescription("Canal del panel registrado.").addChannelTypes(ChannelType.GuildText).setRequired(true))));

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
      await setTicketArchiveCategory(interaction.guild.id, category.id);
      await interaction.reply({ content: `Archivado de tickets configurado en ${category}.`, ephemeral: true });
      return;
    }
    await setTicketArchiveCategory(interaction.guild.id, null);
    await interaction.reply({ content: "El archivado automático de tickets ha sido desactivado.", ephemeral: true });
    return;
  }

  if (group === "categoria") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true });
      return;
    }

    const action = interaction.options.getSubcommand();

    if (action === "crear") {
      const name = interaction.options.getString("nombre", true).trim();
      const description = interaction.options.getString("descripcion", true).trim();
      const discordCategory = interaction.options.getChannel("canal", true);
      const role = interaction.options.getRole("rol", true);
      const priority = interaction.options.getString("prioridad") ?? "normal";
      const maxOpen = interaction.options.getInteger("maximos") ?? 1;
      const autoClose = interaction.options.getInteger("cierre") ?? 0;
      if (discordCategory.type !== ChannelType.GuildCategory) {
        await interaction.reply({ content: "El canal indicado debe ser una categoría de Discord.", ephemeral: true });
        return;
      }
      const duplicate = (await listTicketCategories(interaction.guild.id)).find((category) => category.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        await interaction.reply({ content: `Ya existe una categoría de tickets llamada **${duplicate.name}**.`, ephemeral: true });
        return;
      }
      const category = await createTicketCategory({
        guildId: interaction.guild.id,
        name,
        description,
        discordCategoryId: discordCategory.id,
        staffRoleIds: [role.id],
        priority,
        maxOpenPerUser: maxOpen,
        autoCloseMinutes: autoClose === 0 ? null : autoClose,
      });
      await interaction.reply({
        content: `Categoría creada correctamente.\n\n**${category.name}**\n${category.description}\nCategoría de Discord: ${discordCategory}\nRol de atención: ${role}\nID: \`${category.id}\``,
        ephemeral: true,
      });
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
      const removeRole = interaction.options.getRole("quitar_rol");
      const removeChannel = interaction.options.getBoolean("quitar_canal") ?? false;
      if (!discordCategory && !role && autoCloseInput === null && !removeRole && !removeChannel) {
        await interaction.reply({ content: "Debes indicar al menos un cambio de configuración.", ephemeral: true });
        return;
      }
      if (removeRole && role) {
        await interaction.reply({ content: "No puedes añadir y quitar un rol en la misma configuración.", ephemeral: true });
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
      if (removeRole && !category.staff_role_ids.includes(removeRole.id)) {
        await interaction.reply({ content: "Ese rol no está configurado en esta categoría.", ephemeral: true });
        return;
      }
      const staffRoleIds = removeRole
        ? category.staff_role_ids.filter((roleId) => roleId !== removeRole.id)
        : role
          ? Array.from(new Set([...category.staff_role_ids, role.id]))
          : category.staff_role_ids;
      const updated = await updateTicketCategoryConfig(interaction.guild.id, category.id, {
        discordCategoryId: removeChannel ? null : discordCategory?.id ?? category.discord_category_id,
        staffRoleIds,
        autoCloseMinutes: autoCloseInput === null ? category.auto_close_minutes : autoCloseMinutes,
      });
      if (!updated.discord_category_id) {
        await interaction.reply({ content: "La categoría quedó sin categoría de Discord. Los tickets ya no podrán crearse con ella hasta volver a vincularla.", ephemeral: true });
        return;
      }
      await interaction.reply({
        content: `Configuración actualizada para **${updated.name}**.\nCategoría de Discord: <#${updated.discord_category_id}>\nRoles de atención: ${updated.staff_role_ids.length ? updated.staff_role_ids.map((roleId) => `<@&${roleId}>`).join(", ") : "Ninguno"}\nCierre automático: ${updated.auto_close_minutes ? `${updated.auto_close_minutes} min` : "Desactivado"}`,
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
    const action = interaction.options.getSubcommand();
    const categories = await listTicketCategories(interaction.guild.id);
    if (action === "reparar") {
      const channel = interaction.options.getChannel("canal", true);
      if (channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "El canal indicado no es válido.", ephemeral: true });
        return;
      }
      const panel = await getTicketPanelByChannel(interaction.guild.id, channel.id);
      if (!panel) {
        await interaction.reply({ content: "No existe un panel registrado en ese canal.", ephemeral: true });
        return;
      }
      if (!categories.length) {
        await interaction.reply({ content: "No hay categorías de tickets habilitadas para reconstruir el panel.", ephemeral: true });
        return;
      }
      if (categories.length > 25) {
        await interaction.reply({ content: "Hay más de 25 categorías habilitadas. Reduce las categorías antes de reparar el panel.", ephemeral: true });
        return;
      }
      const textChannel = channel as TextChannel;
      const message = await textChannel.messages.fetch(panel.message_id).catch(() => null);
      if (message) {
        await message.edit(buildTicketPanel(categories));
        await interaction.reply({ content: "Panel de tickets reparado correctamente.", ephemeral: true });
        return;
      }
      const replacement = await textChannel.send(buildTicketPanel(categories));
      await updateTicketPanelMessage(interaction.guild.id, panel.id, replacement.id);
      await interaction.reply({ content: "El panel anterior no existía. Se creó uno nuevo y se actualizó el registro.", ephemeral: true });
      return;
    }
    if (!categories.length) {
      await interaction.reply({ content: "Primero debes crear al menos una categoría.", ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel("canal", true);
    if (channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "El canal indicado no es válido.", ephemeral: true });
      return;
    }
    if (categories.length > 25) {
      await interaction.reply({ content: "No puedes publicar un panel con más de 25 categorías habilitadas. Reduce las categorías antes de publicarlo.", ephemeral: true });
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
    const logs = await listTicketLogs(interaction.guild.id, ticket.id, 12);
    const embed = new EmbedBuilder().setTitle(`Historial del Ticket #${ticket.display_number ?? ticket.ticket_number}`).setDescription(
      logs.length ? logs.map((log) => `**${log.action}** · <@${log.actor_id}> · <t:${Math.floor(new Date(log.created_at).getTime() / 1000)}:R>`).join("\n") : "No hay acciones registradas todavía.",
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
    categories.map((c) => `**${c.name}**\n${c.description ?? "Sin descripción"}\nDiscord: ${c.discord_category_id ? `<#${c.discord_category_id}>` : "Sin vincular"}\nAtención: ${c.staff_role_ids.length ? c.staff_role_ids.map((roleId) => `<@&${roleId}>`).join(", ") : "Sin rol"}\nID: \`${c.id}\``).join("\n\n"),
  );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
