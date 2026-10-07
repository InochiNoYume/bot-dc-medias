import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type TextChannel,\n  type StringSelectMenuBuilder,
} from "discord.js";
import {
  getGuildLogConfig,
  setGuildLogConfig,
} from "../../database/repositories/logRepository.js";
import { LOG_EVENTS, logEventLabel } from "../../modules/logging/service.js";

export const data = new SlashCommandBuilder()
  .setName("logs")
  .setDescription("Configura los registros del servidor.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
  .addSubcommand((subcommand) =>
    subcommand
      .setName("configurar")
      .setDescription("Define el canal donde se enviarán los registros.")
      .addChannelOption((option) =>
        option
          .setName("canal")
          .setDescription("Canal de texto para los registros.")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("estado")
      .setDescription("Muestra la configuración actual de registros."),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("eventos")
      .setDescription("Selecciona qué eventos se registrarán."),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("desactivar")
      .setDescription("Desactiva los registros del servidor."),
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

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "configurar") {
    const channel = interaction.options.getChannel("canal", true);
    if (channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "Debes seleccionar un canal de texto.", ephemeral: true });
      return;
    }

    const config = await setGuildLogConfig(interaction.guild.id, channel.id);
    await interaction.reply({
      content: `El canal de registros quedó configurado en <#${config.channel_id}>. Se activaron ${config.enabled_events.length} tipos de eventos.`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "eventos") {
    const config = await getGuildLogConfig(interaction.guild.id);
    if (!config?.channel_id) {
      await interaction.reply({ content: "Primero configura un canal de registros con /logs configurar.", ephemeral: true });
      return;
    }
    const options = LOG_EVENTS.map((event) => ({
      label: logEventLabel(event),
      value: event,
      default: config.enabled_events.includes(event),
    }));
    const { ActionRowBuilder } = await import("discord.js");
    const menu = new StringSelectMenuBuilder()
      .setCustomId("logs:events")
      .setPlaceholder("Selecciona los eventos activos")
      .setMinValues(0)
      .setMaxValues(options.length)
      .addOptions(options);
    await interaction.reply({ content: "Selecciona los eventos que quieres registrar. Los no seleccionados quedarán desactivados.", components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)], ephemeral: true });
    return;
  }

  if (subcommand === "desactivar") {
    await setGuildLogConfig(interaction.guild.id, null);
    await interaction.reply({ content: "Los registros automáticos fueron desactivados.", ephemeral: true });
    return;
  }

  const config = await getGuildLogConfig(interaction.guild.id);
  if (!config?.channel_id) {
    await interaction.reply({ content: "Los registros no están configurados.", ephemeral: true });
    return;
  }

  const enabled = new Set(config.enabled_events);
  const lines = LOG_EVENTS.map((event) => `${enabled.has(event) ? "Activo" : "Inactivo"} — ${logEventLabel(event)}`);
  await interaction.reply({
    content: `Canal: <#${config.channel_id}>\n\n${lines.join("\n")}`,
    ephemeral: true,
  });
}
