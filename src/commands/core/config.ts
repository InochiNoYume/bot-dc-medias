import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getGuildSettings } from "../../database/repositories/guildRepository.js";
import { getGuildLogConfig } from "../../database/repositories/logRepository.js";
import { getAutomodConfig } from "../../modules/automod/repository.js";
import { listCreatorFeeds } from "../../modules/creators/repository.js";
import { listTicketCategories } from "../../modules/tickets/repository.js";

export const data = new SlashCommandBuilder()
  .setName("config")
  .setDescription("Consulta la configuración general del bot.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
  .addSubcommand((subcommand) =>
    subcommand.setName("estado").setDescription("Muestra el estado de los módulos configurables."),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Necesitas el permiso Gestionar servidor.", ephemeral: true });
    return;
  }

  const [settings, logConfig, automod, creatorFeeds, ticketCategories] = await Promise.all([
    getGuildSettings(interaction.guild.id),
    getGuildLogConfig(interaction.guild.id),
    getAutomodConfig(interaction.guild.id),
    listCreatorFeeds(interaction.guild.id),
    listTicketCategories(interaction.guild.id),
  ]);

  const embed = new EmbedBuilder()
    .setTitle("Configuración del bot")
    .setDescription("Resumen de la configuración actual de este servidor.")
    .addFields(
      { name: "Configuración inicial", value: settings?.setup_completed ? "Configurada" : "Pendiente", inline: true },
      { name: "Tickets", value: ticketCategories.length ? `${ticketCategories.length} categoría(s)` : "Sin categorías", inline: true },
      { name: "Registros", value: logConfig?.channel_id ? `Activos · <#${logConfig.channel_id}>` : "No configurados", inline: true },
      { name: "AutoMod", value: automod.enabled ? "Activo" : "Inactivo", inline: true },
      { name: "Anti-Raid", value: automod.enabled && automod.raid_enabled ? "Activo" : "Inactivo", inline: true },
      { name: "Creadores", value: creatorFeeds.length ? `${creatorFeeds.filter((feed) => feed.enabled).length}/${creatorFeeds.length} activos` : "Sin configuraciones", inline: true },
      { name: "Archivo de tickets", value: settings?.ticket_archive_category_id ? `<#${settings.ticket_archive_category_id}>` : "Desactivado", inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
