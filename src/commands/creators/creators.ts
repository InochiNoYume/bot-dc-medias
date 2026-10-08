import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import {
  createCreatorFeed,
  deleteCreatorFeed,
  listCreatorFeeds,
  updateCreatorFeed,
} from "../../modules/creators/repository.js";

export const data = new SlashCommandBuilder()
  .setName("creador")
  .setDescription("Configura notificaciones de creadores.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
  .addSubcommand((s) => s.setName("agregar").setDescription("Añade un creador.")
    .addStringOption((o) => o.setName("plataforma").setDescription("Plataforma").setRequired(true)
      .addChoices(
        { name: "YouTube", value: "youtube" },
        { name: "Twitch", value: "twitch" },
        { name: "Kick", value: "kick" },
        { name: "TikTok", value: "tiktok" },
      ))
    .addStringOption((o) => o.setName("id").setDescription("ID, usuario o canal del creador").setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName("nombre").setDescription("Nombre visible").setRequired(true).setMaxLength(100))
    .addChannelOption((o) => o.setName("canal").setDescription("Canal donde anunciar").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addRoleOption((o) => o.setName("rol").setDescription("Rol a mencionar")))
  .addSubcommand((s) => s.setName("listar").setDescription("Lista los creadores configurados."))
  .addSubcommand((s) => s.setName("eliminar").setDescription("Elimina una configuración.").addStringOption((o) => o.setName("id").setDescription("ID de configuración").setRequired(true)))
  .addSubcommand((s) => s.setName("activar").setDescription("Activa una configuración.").addStringOption((o) => o.setName("id").setDescription("ID de configuración").setRequired(true)))
  .addSubcommand((s) => s.setName("desactivar").setDescription("Desactiva una configuración.").addStringOption((o) => o.setName("id").setDescription("ID de configuración").setRequired(true)))
  .addSubcommand((s) => s.setName("intervalo").setDescription("Cambia el intervalo de consulta.")
    .addStringOption((o) => o.setName("id").setDescription("ID de configuración").setRequired(true))
    .addIntegerOption((o) => o.setName("segundos").setDescription("Entre 60 y 3600 segundos").setRequired(true).setMinValue(60).setMaxValue(3600)));

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
  const feeds = await listCreatorFeeds(interaction.guild.id);

  if (subcommand === "listar") {
    const content = feeds.length
      ? feeds.map((item) => item.id + " · " + item.display_name + " · " + item.platform + " · <#" + item.channel_id + "> · " + (item.enabled ? "Activo" : "Inactivo") + " · " + item.poll_interval_seconds + "s").join("\n")
      : "No hay creadores configurados.";
    await interaction.reply({ content, ephemeral: true });
    return;
  }

  if (subcommand === "agregar") {
    const platform = interaction.options.getString("plataforma", true) as "youtube" | "twitch" | "kick" | "tiktok";
    if (platform === "tiktok") {
      await interaction.reply({
        content: "TikTok requiere autorización OAuth del creador (scope video.list). Esta integración se habilitará cuando el bot tenga el flujo de autorización necesario.",
        ephemeral: true,
      });
      return;
    }

    const externalId = interaction.options.getString("id", true).trim();
    const existing = feeds.find((feed) => feed.platform === platform && feed.external_id === externalId);
    if (existing) {
      await interaction.reply({ content: "Ese creador ya está configurado en este servidor.", ephemeral: true });
      return;
    }

    const channel = interaction.options.getChannel("canal", true);
    const feed = await createCreatorFeed({
      guildId: interaction.guild.id,
      platform,
      externalId,
      displayName: interaction.options.getString("nombre", true).trim(),
      channelId: channel.id,
      mentionRoleId: interaction.options.getRole("rol")?.id ?? null,
    });
    await interaction.reply({ content: "Creador configurado. ID: " + feed.id + ".", ephemeral: true });
    return;
  }

  const id = interaction.options.getString("id", true);
  const feed = feeds.find((item) => item.id === id);
  if (!feed) {
    await interaction.reply({ content: "No encontré una configuración con ese ID.", ephemeral: true });
    return;
  }

  if (subcommand === "eliminar") {
    await deleteCreatorFeed(interaction.guild.id, id);
    await interaction.reply({ content: "Configuración eliminada.", ephemeral: true });
    return;
  }

  if (subcommand === "activar" || subcommand === "desactivar") {
    await updateCreatorFeed(feed.id, { enabled: subcommand === "activar" });
    await interaction.reply({ content: "Configuración " + (subcommand === "activar" ? "activada" : "desactivada") + ".", ephemeral: true });
    return;
  }

  const seconds = interaction.options.getInteger("segundos", true);
  await updateCreatorFeed(feed.id, { poll_interval_seconds: seconds });
  await interaction.reply({ content: "Intervalo actualizado a " + seconds + " segundos.", ephemeral: true });
}
