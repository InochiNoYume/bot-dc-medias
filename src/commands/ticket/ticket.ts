import {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  ChannelType,
  type TextChannel,
} from "discord.js";
import {
  createTicketPanel,
  deleteTicketCategory,
  listTicketCategories,
  createTicketCategory,
  updateTicketCategoryConfig,
  getTicketCategory,
  countTicketsForCategory,
  getTicketPanelByChannel,
  updateTicketPanelMessage,
} from "../../modules/tickets/repository.js";
import { buildTicketPanel } from "../../modules/tickets/panel.js";
import { getTicketByChannel, listTicketLogs } from "../../modules/tickets/actions.js";
import { setTicketArchiveCategory } from "../../database/repositories/guildRepository.js";

export const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Gestiona el sistema de tickets.")
  .addSubcommand((s) => s.setName("categorias").setDescription("Muestra las categorías disponibles."))
  .addSubcommand((s) => s.setName("historial").setDescription("Muestra el historial del ticket actual."))
  .addSubcommandGroup((g) => g.setName("archivo").setDescription("Configura el archivado de tickets cerrados.")
    .addSubcommand((s) => s.setName("configurar").setDescription("Define la categoría para tickets cerrados.")
      .addChannelOption((o) => o.setName("categoria").setDescription("Categoría de Discord para archivar tickets.").addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand((s) => s.setName("desactivar").setDescription("Desactiva el archivado automático.")))
  .addSubcommandGroup((g) => g.setName("categoria").setDescription("Administra categorías de tickets.")
    .addSubcommand((s) => s.setName("crear").setDescription("Crea una categoría de tickets.")
      .addStringOption((o) => o.setName("nombre").setDescription("Nombre visible.").setRequired(true).setMaxLength(80))
      .addStringOption((o) => o.setName("descripcion").setDescription("Descripción.").setRequired(true).setMaxLength(500))
      .addChannelOption((o) => o.setName("canal").setDescription("Categoría de Discord.").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addRoleOption((o) => o.setName("rol").setDescription("Rol de atención.").setRequired(true))
      .addStringOption((o) => o.setName("prioridad").setDescription("Prioridad inicial.").setRequired(true).addChoices(
        { name: "Baja", value: "low" },
        { name: "Normal", value: "normal" },
        { name: "Alta", value: "high" },
        { name: "Urgente", value: "urgent" },
      ))
      .addIntegerOption((o) => o.setName("maximos").setDescription("Máximo de tickets abiertos por usuario.").setMinValue(1).setMaxValue(20))
      .addIntegerOption((o) => o.setName("cierre").setDescription("Minutos de inactividad; 0 desactiva el cierre automático.").setMinValue(0).setMaxValue(10080))
    )
    .addSubcommand((s) => s.setName("eliminar").setDescription("Elimina una categoría.").addStringOption((o) => o.setName("id").setDescription("ID de la categoría.").setRequired(true)))
    .addSubcommand((s) => s.setName("configurar").setDescription("Modifica una categoría.")
      .addStringOption((o) => o.setName("id").setDescription("ID de la categoría.").setRequired(true))
      .addChannelOption((o) => o.setName("canal").setDescription("Nueva categoría de Discord.").addChannelTypes(ChannelType.GuildCategory))
      .addRoleOption((o) => o.setName("rol").setDescription("Añade un rol de atención."))
      .addIntegerOption((o) => o.setName("cierre").setDescription("Minutos de inactividad; 0 desactiva el cierre automático.").setMinValue(0).setMaxValue(10080))
      .addRoleOption((o) => o.setName("quitar_rol").setDescription("Quita un rol de atención."))
      .addBooleanOption((o) => o.setName("quitar_canal").setDescription("Desvincula la categoría de Discord.")))
  .addSubcommandGroup((g) => g.setName("panel").setDescription("Administra paneles de tickets.")
    .addSubcommand((s) => s.setName("publicar").setDescription("Publica el panel.").addChannelOption((o) => o.setName("canal").setDescription("Canal de texto.").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand((s) => s.setName("reparar").setDescription("Repara un panel registrado.").addChannelOption((o) => o.setName("canal").setDescription("Canal del panel.").addChannelTypes(ChannelType.GuildText).setRequired(true))));

function requireManageGuild(interaction: ChatInputCommandInteraction): boolean {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  const group = interaction.options.getSubcommandGroup(false);
  const action = interaction.options.getSubcommand();

  if (group === "archivo") {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true });
      return;
    }
    if (action === "configurar") {
      const category = interaction.options.getChannel("categoria", true);
      await setTicketArchiveCategory(interaction.guild.id, category.id);
      await interaction.reply({ content: `Archivado configurado en ${category}.`, ephemeral: true });
    } else {
      await setTicketArchiveCategory(interaction.guild.id, null);
      await interaction.reply({ content: "El archivado automático ha sido desactivado.", ephemeral: true });
    }
    return;
  }

  if (group === "categoria") {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true });
      return;
    }

    if (action === "crear") {
      const name = interaction.options.getString("nombre", true).trim();
      const description = interaction.options.getString("descripcion", true).trim();
      const discordCategory = interaction.options.getChannel("canal", true);
      const role = interaction.options.getRole("rol", true);
      const priority = interaction.options.getString("prioridad", true) as "low" | "normal" | "high" | "urgent";
      const maxOpen = interaction.options.getInteger("maximos") ?? 1;
      const autoClose = interaction.options.getInteger("cierre") ?? 0;
      const duplicate = (await listTicketCategories(interaction.guild.id)).find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        await interaction.reply({ content: `Ya existe la categoría **${duplicate.name}**.`, ephemeral: true });
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
      await interaction.reply({ content: `Categoría creada: **${category.name}**\nID: \`${category.id}\``, ephemeral: true });
      return;
    }

    if (action === "eliminar") {
      const id = interaction.options.getString("id", true);
      const category = await getTicketCategory(interaction.guild.id, id);
      if (!category) {
        await interaction.reply({ content: "No existe una categoría con ese ID.", ephemeral: true });
        return;
      }
      const count = await countTicketsForCategory(interaction.guild.id, id);
      if (count > 0) {
        await interaction.reply({ content: `No puedes eliminarla porque tiene **${count}** ticket(s) asociados.`, ephemeral: true });
        return;
      }
      await deleteTicketCategory(interaction.guild.id, id);
      await interaction.reply({ content: "Categoría eliminada correctamente.", ephemeral: true });
      return;
    }

    const id = interaction.options.getString("id", true);
    const category = await getTicketCategory(interaction.guild.id, id);
    if (!category) {
      await interaction.reply({ content: "No existe una categoría con ese ID.", ephemeral: true });
      return;
    }
    const discordCategory = interaction.options.getChannel("canal");
    const role = interaction.options.getRole("rol");
    const autoCloseInput = interaction.options.getInteger("cierre");
    const removeRole = interaction.options.getRole("quitar_rol");
    const removeChannel = interaction.options.getBoolean("quitar_canal") ?? false;
    if (!discordCategory && !role && autoCloseInput === null && !removeRole && !removeChannel) {
      await interaction.reply({ content: "Debes indicar al menos un cambio.", ephemeral: true });
      return;
    }
    if (removeRole && role || removeChannel && discordCategory) {
      await interaction.reply({ content: "No puedes añadir y quitar el mismo recurso a la vez.", ephemeral: true });
      return;
    }
    const updated = await updateTicketCategoryConfig(interaction.guild.id, id, {
      discordCategoryId: removeChannel ? null : discordCategory?.id ?? category.discord_category_id,
      staffRoleIds: removeRole
        ? category.staff_role_ids.filter((roleId) => roleId !== removeRole.id)
        : role
          ? Array.from(new Set([...category.staff_role_ids, role.id]))
          : category.staff_role_ids,
      autoCloseMinutes: autoCloseInput === null ? category.auto_close_minutes : autoCloseInput === 0 ? null : autoCloseInput,
    });
    await interaction.reply({
      content: `Categoría **${updated.name}** actualizada.\nDiscord: ${updated.discord_category_id ? `<#${updated.discord_category_id}>` : "Sin categoría"}\nRoles: ${updated.staff_role_ids.length ? updated.staff_role_ids.map((roleId) => `<@&${roleId}>`).join(", ") : "Ninguno"}\nCierre: ${updated.auto_close_minutes ? `${updated.auto_close_minutes} min` : "Desactivado"}`,
      ephemeral: true,
    });
    return;
  }

  if (group === "panel") {
    if (!requireManageGuild(interaction)) {
      await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true });
      return;
    }
    const channel = interaction.options.getChannel("canal", true);
    if (channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "El canal indicado no es válido.", ephemeral: true });
      return;
    }
    const categories = await listTicketCategories(interaction.guild.id);
    if (!categories.length) {
      await interaction.reply({ content: "Primero debes crear al menos una categoría.", ephemeral: true });
      return;
    }
    if (categories.length > 25) {
      await interaction.reply({ content: "No puedes tener más de 25 categorías en un panel.", ephemeral: true });
      return;
    }
    const textChannel = channel as TextChannel;
    const panel = await getTicketPanelByChannel(interaction.guild.id, textChannel.id);
    if (action === "reparar") {
      if (!panel) {
        await interaction.reply({ content: "No existe un panel registrado en ese canal.", ephemeral: true });
        return;
      }
      const message = await textChannel.messages.fetch(panel.message_id).catch(() => null);
      if (message) {
        await message.edit(buildTicketPanel(categories));
      } else {
        const replacement = await textChannel.send(buildTicketPanel(categories));
        await updateTicketPanelMessage(interaction.guild.id, panel.id, replacement.id);
      }
      await interaction.reply({ content: "Panel reparado correctamente.", ephemeral: true });
      return;
    }
    if (panel) {
      await interaction.reply({ content: "Este canal ya tiene un panel registrado. Usa `reparar` si necesitas reconstruirlo.", ephemeral: true });
      return;
    }
    const message = await textChannel.send(buildTicketPanel(categories));
    try {
      await createTicketPanel({
        guildId: interaction.guild.id,
        channelId: textChannel.id,
        messageId: message.id,
        title: "Soporte",
        description: "Selecciona una categoría para abrir un ticket.",
      });
    } catch (error) {
      await message.delete().catch(() => undefined);
      throw error;
    }
    await interaction.reply({ content: "Panel publicado correctamente.", ephemeral: true });
    return;
  }

  if (action === "categorias") {
    const categories = await listTicketCategories(interaction.guild.id);
    if (!categories.length) {
      await interaction.reply({ content: "No hay categorías configuradas.", ephemeral: true });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle("Categorías de tickets")
      .setDescription(categories.map((item) => `**${item.name}** — \`${item.id}\`\n${item.description}`).join("\n\n"));
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (action === "historial") {
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
    const embed = new EmbedBuilder()
      .setTitle(`Historial del Ticket #${ticket.display_number ?? ticket.id}`)
      .setDescription(logs.length ? logs.map((log) => `**${log.action}** — <@${log.actor_id}>\n${log.details ? `\`${JSON.stringify(log.details)}\`` : ""}`).join("\n\n") : "Sin acciones registradas.");
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}
