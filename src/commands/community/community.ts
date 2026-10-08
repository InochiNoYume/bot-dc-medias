import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { supabase } from "../../database/supabase.js";

type SuggestionStatus = "pending" | "approved" | "rejected" | "implemented";

interface CommunitySuggestion {
  id: string;
  guild_id: string;
  author_id: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  upvotes: number;
  downvotes: number;
  created_at: string;
}

const STATUS_LABELS: Record<SuggestionStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  implemented: "Implementada",
};

async function createSuggestion(guildId: string, authorId: string, title: string, description: string): Promise<CommunitySuggestion> {
  const { data, error } = await supabase.from("community_suggestions").insert({ guild_id: guildId, author_id: authorId, title, description }).select("*").single();
  if (error) throw error;
  return data as CommunitySuggestion;
}

async function listSuggestions(guildId: string): Promise<CommunitySuggestion[]> {
  const { data, error } = await supabase.from("community_suggestions").select("*").eq("guild_id", guildId).order("created_at", { ascending: false }).limit(10);
  if (error) throw error;
  return (data ?? []) as CommunitySuggestion[];
}

export async function getSuggestion(guildId: string, id: string): Promise<CommunitySuggestion | null> {
  const { data, error } = await supabase.from("community_suggestions").select("*").eq("guild_id", guildId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as CommunitySuggestion | null;
}

export async function updateSuggestionStatus(guildId: string, id: string, status: SuggestionStatus): Promise<CommunitySuggestion> {
  const { data, error } = await supabase.from("community_suggestions").update({ status, updated_at: new Date().toISOString() }).eq("guild_id", guildId).eq("id", id).select("*").single();
  if (error) throw error;
  return data as CommunitySuggestion;
}

function suggestionEmbed(suggestion: CommunitySuggestion): EmbedBuilder {
  return new EmbedBuilder().setTitle(suggestion.title).setDescription(suggestion.description).addFields(
    { name: "Estado", value: STATUS_LABELS[suggestion.status], inline: true },
    { name: "Votos", value: `A favor: **${suggestion.upvotes}**\nEn contra: **${suggestion.downvotes}**`, inline: true },
    { name: "Autor", value: `<@${suggestion.author_id}>`, inline: true },
  ).setFooter({ text: `ID: ${suggestion.id}` }).setTimestamp(new Date(suggestion.created_at));
}

export function suggestionVoteButtons(suggestionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`community:suggestion:vote:${suggestionId}:1`).setLabel("A favor").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`community:suggestion:vote:${suggestionId}:-1`).setLabel("En contra").setStyle(ButtonStyle.Danger),
  );
}

export async function voteSuggestion(guildId: string, suggestionId: string, userId: string, vote: 1 | -1): Promise<{ upvotes: number; downvotes: number; userVote: 1 | -1 | null }> {
  const { data, error } = await supabase.rpc("vote_community_suggestion", { p_guild_id: guildId, p_suggestion_id: suggestionId, p_user_id: userId, p_vote: vote });
  if (error) {
    if (error.message.includes("SUGGESTION_NOT_FOUND")) throw new Error("SUGGESTION_NOT_FOUND");
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("SUGGESTION_NOT_FOUND");
  return { upvotes: Number(row.upvotes), downvotes: Number(row.downvotes), userVote: row.user_vote === 1 || row.user_vote === -1 ? row.user_vote : null };
}

export const data = new SlashCommandBuilder()
  .setName("comunidad")
  .setDescription("Herramientas de participación de la comunidad.")
  .addSubcommand((subcommand) => subcommand.setName("encuesta").setDescription("Publica una encuesta de comunidad.")
    .addStringOption((option) => option.setName("pregunta").setDescription("Pregunta de la encuesta").setRequired(true).setMaxLength(300))
    .addStringOption((option) => option.setName("opcion1").setDescription("Primera opción").setRequired(true).setMaxLength(55))
    .addStringOption((option) => option.setName("opcion2").setDescription("Segunda opción").setRequired(true).setMaxLength(55))
    .addStringOption((option) => option.setName("opcion3").setDescription("Tercera opción").setMaxLength(55))
    .addStringOption((option) => option.setName("opcion4").setDescription("Cuarta opción").setMaxLength(55))
    .addStringOption((option) => option.setName("opcion5").setDescription("Quinta opción").setMaxLength(55))
    .addIntegerOption((option) => option.setName("duracion").setDescription("Duración en horas (1-168)").setMinValue(1).setMaxValue(168))
    .addBooleanOption((option) => option.setName("multiple").setDescription("Permitir seleccionar varias opciones")))
  .addSubcommand((subcommand) => subcommand.setName("anuncio").setDescription("Publica un anuncio de comunidad.")
    .addStringOption((option) => option.setName("titulo").setDescription("Título del anuncio").setRequired(true).setMaxLength(100))
    .addStringOption((option) => option.setName("mensaje").setDescription("Contenido del anuncio").setRequired(true).setMaxLength(2000)))
  .addSubcommandGroup((group) => group.setName("sugerencia").setDescription("Gestiona sugerencias de la comunidad.")
    .addSubcommand((subcommand) => subcommand.setName("crear").setDescription("Publica una nueva sugerencia.")
      .addStringOption((option) => option.setName("titulo").setDescription("Título de la sugerencia").setRequired(true).setMaxLength(100))
      .addStringOption((option) => option.setName("descripcion").setDescription("Descripción de la sugerencia").setRequired(true).setMaxLength(1000)))
    .addSubcommand((subcommand) => subcommand.setName("listar").setDescription("Muestra las últimas sugerencias."))
    .addSubcommand((subcommand) => subcommand.setName("estado").setDescription("Cambia el estado de una sugerencia.")
      .addStringOption((option) => option.setName("id").setDescription("ID de la sugerencia").setRequired(true).setMaxLength(36))
      .addStringOption((option) => option.setName("estado").setDescription("Nuevo estado").setRequired(true).addChoices(
        { name: "Pendiente", value: "pending" }, { name: "Aprobada", value: "approved" }, { name: "Rechazada", value: "rejected" }, { name: "Implementada", value: "implemented" },
      ))));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const group = interaction.options.getSubcommandGroup(false);

  if (!group && subcommand === "encuesta") {
    const question = interaction.options.getString("pregunta", true).trim();
    const answers = [1, 2, 3, 4, 5].map((index) => interaction.options.getString(`opcion${index}`)?.trim()).filter((value): value is string => Boolean(value));
    const duration = interaction.options.getInteger("duracion") ?? 24;
    const multiple = interaction.options.getBoolean("multiple") ?? false;
    const description = answers.map((answer, index) => `**${index + 1}.** ${answer}`).join("\n");
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(question).setDescription(description).addFields({ name: "Duración", value: `${duration} hora${duration === 1 ? "" : "s"}`, inline: true }, { name: "Selección múltiple", value: multiple ? "Sí" : "No", inline: true }).setFooter({ text: "Encuesta de comunidad" }).setTimestamp()] });
    return;
  }

  if (!group && subcommand === "anuncio") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Necesitas el permiso Gestionar servidor.", ephemeral: true });
      return;
    }
    const title = interaction.options.getString("titulo", true).trim();
    const message = interaction.options.getString("mensaje", true).trim();
    await interaction.reply({ embeds: [{ title, description: message, footer: { text: "Anuncio de comunidad" }, timestamp: new Date().toISOString() }] });
    return;
  }

  if (group === "sugerencia" && subcommand === "crear") {
    const suggestion = await createSuggestion(interaction.guild.id, interaction.user.id, interaction.options.getString("titulo", true).trim(), interaction.options.getString("descripcion", true).trim());
    await interaction.reply({ content: "Sugerencia publicada correctamente.", embeds: [suggestionEmbed(suggestion)], components: [suggestionVoteButtons(suggestion.id)] });
    return;
  }

  if (group === "sugerencia" && subcommand === "listar") {
    const suggestions = await listSuggestions(interaction.guild.id);
    if (!suggestions.length) {
      await interaction.reply({ content: "No hay sugerencias registradas.", ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: suggestions.map(suggestionEmbed), components: suggestions.slice(0, 5).map((suggestion) => suggestionVoteButtons(suggestion.id)) });
    return;
  }

  if (group === "sugerencia" && subcommand === "estado") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Necesitas el permiso Gestionar servidor.", ephemeral: true });
      return;
    }
    const id = interaction.options.getString("id", true).trim();
    const status = interaction.options.getString("estado", true) as SuggestionStatus;
    if (!await getSuggestion(interaction.guild.id, id)) {
      await interaction.reply({ content: "No se encontró una sugerencia con ese ID.", ephemeral: true });
      return;
    }
    const updated = await updateSuggestionStatus(interaction.guild.id, id, status);
    await interaction.reply({ embeds: [suggestionEmbed(updated)], components: [suggestionVoteButtons(updated.id)] });
  }
}
