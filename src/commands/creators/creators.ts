import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { createCreatorFeed, deleteCreatorFeed, listCreatorFeeds } from "../../modules/creators/repository.js";

export const data = new SlashCommandBuilder()
  .setName("creador")
  .setDescription("Configura notificaciones de creadores.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
  .addSubcommand((s) => s.setName("agregar").setDescription("Añade un creador.")
    .addStringOption((o) => o.setName("plataforma").setDescription("Plataforma").setRequired(true).addChoices({ name: "YouTube", value: "youtube" }, { name: "Twitch", value: "twitch" }, { name: "Kick", value: "kick" }, { name: "TikTok", value: "tiktok" }))
    .addStringOption((o) => o.setName("id").setDescription("ID del canal o creador").setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName("nombre").setDescription("Nombre visible").setRequired(true).setMaxLength(100))
    .addChannelOption((o) => o.setName("canal").setDescription("Canal donde anunciar").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addRoleOption((o) => o.setName("rol").setDescription("Rol a mencionar")))
  .addSubcommand((s) => s.setName("listar").setDescription("Lista los creadores configurados."))
  .addSubcommand((s) => s.setName("eliminar").setDescription("Elimina una configuración.").addStringOption((o) => o.setName("id").setDescription("ID de configuración").setRequired(true)));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) { await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true }); return; }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) { await interaction.reply({ content: "Necesitas el permiso Gestionar servidor.", ephemeral: true }); return; }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "agregar") {
    const channel = interaction.options.getChannel("canal", true);
    const feed = await createCreatorFeed({ guildId: interaction.guild.id, platform: interaction.options.getString("plataforma", true) as "youtube" | "twitch" | "kick" | "tiktok", externalId: interaction.options.getString("id", true), displayName: interaction.options.getString("nombre", true), channelId: channel.id, mentionRoleId: interaction.options.getRole("rol")?.id ?? null });
    await interaction.reply({ content: "Creador configurado. ID: " + feed.id + ".", ephemeral: true }); return;
  }
  const feeds = await listCreatorFeeds(interaction.guild.id);
  if (subcommand === "listar") {
    const content = feeds.length ? feeds.map((feed) => feed.id + " · " + feed.display_name + " · " + feed.platform + " · <#" + feed.channel_id + "> · " + (feed.enabled ? "Activo" : "Inactivo")).join("\n") : "No hay creadores configurados.";
    await interaction.reply({ content, ephemeral: true }); return;
  }
  const id = interaction.options.getString("id", true);
  if (!feeds.some((feed) => feed.id === id)) { await interaction.reply({ content: "No encontré una configuración con ese ID.", ephemeral: true }); return; }
  await deleteCreatorFeed(interaction.guild.id, id);
  await interaction.reply({ content: "Configuración eliminada.", ephemeral: true });
}
