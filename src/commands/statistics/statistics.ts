import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { supabase } from "../../database/supabase.js";

interface TicketRow {
  status: "open" | "claimed" | "closed";
  owner_id: string;
  claimed_by: string | null;
  closed_by: string | null;
  created_at: string;
  claimed_at: string | null;
  closed_at: string | null;
}

interface ModerationRow {
  moderator_id: string;
  action: string;
  status: string;
}

interface RatingRow {
  rating: number;
}

interface SuggestionRow {
  status: "pending" | "approved" | "rejected" | "implemented";
  upvotes: number;
  downvotes: number;
}

async function countRows(table: string, guildId: string): Promise<number> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("guild_id", guildId);
  if (error) throw error;
  return count ?? 0;
}

async function getTicketStats(guildId: string) {
  const { data, error } = await supabase
    .from("tickets")
    .select("status,owner_id,claimed_by,closed_by,created_at,claimed_at,closed_at")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;

  const tickets = (data ?? []) as TicketRow[];
  const open = tickets.filter((ticket) => ticket.status === "open").length;
  const claimed = tickets.filter((ticket) => ticket.status === "claimed").length;
  const closed = tickets.filter((ticket) => ticket.status === "closed").length;
  const responseTimes = tickets
    .filter((ticket) => ticket.claimed_at)
    .map((ticket) => new Date(ticket.claimed_at as string).getTime() - new Date(ticket.created_at).getTime())
    .filter((value) => Number.isFinite(value) && value >= 0);
  const avgResponseMinutes = responseTimes.length
    ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length / 60_000
    : 0;

  const staffCounts = new Map<string, number>();
  for (const ticket of tickets) {
    const staffId = ticket.closed_by ?? ticket.claimed_by;
    if (staffId) staffCounts.set(staffId, (staffCounts.get(staffId) ?? 0) + 1);
  }
  const topStaff = [...staffCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return { total: await countRows("tickets", guildId), open, claimed, closed, avgResponseMinutes, topStaff };
}

async function getModerationStats(guildId: string) {
  const { data, error } = await supabase.from("moderation_cases").select("moderator_id,action,status").eq("guild_id", guildId).limit(1000);
  if (error) throw error;
  const cases = (data ?? []) as ModerationRow[];
  const actions = new Map<string, number>();
  const staff = new Map<string, number>();
  for (const item of cases) {
    if (item.status === "completed") {
      actions.set(item.action, (actions.get(item.action) ?? 0) + 1);
      staff.set(item.moderator_id, (staff.get(item.moderator_id) ?? 0) + 1);
    }
  }
  return {
    total: await countRows("moderation_cases", guildId),
    completed: cases.filter((item) => item.status === "completed").length,
    pending: cases.filter((item) => item.status === "pending").length,
    failed: cases.filter((item) => item.status === "failed").length,
    actions: [...actions.entries()].sort((a, b) => b[1] - a[1]),
    staff: [...staff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  };
}

async function getRatingStats(guildId: string) {
  const { data, error } = await supabase.from("ticket_ratings").select("rating").eq("guild_id", guildId).limit(1000);
  if (error) throw error;
  const ratings = (data ?? []) as RatingRow[];
  const average = ratings.length ? ratings.reduce((sum, item) => sum + Number(item.rating), 0) / ratings.length : 0;
  return { count: ratings.length, average };
}

async function getSuggestionStats(guildId: string) {
  const { data, error } = await supabase.from("community_suggestions").select("status,upvotes,downvotes").eq("guild_id", guildId).limit(1000);
  if (error) throw error;
  const suggestions = (data ?? []) as SuggestionRow[];
  const byStatus = new Map<string, number>();
  let votes = 0;
  for (const suggestion of suggestions) {
    byStatus.set(suggestion.status, (byStatus.get(suggestion.status) ?? 0) + 1);
    votes += Number(suggestion.upvotes) + Number(suggestion.downvotes);
  }
  return { total: await countRows("community_suggestions", guildId), byStatus: [...byStatus.entries()], votes };
}

export const data = new SlashCommandBuilder()
  .setName("estadisticas")
  .setDescription("Consulta estadísticas del servidor.")
  .addSubcommand((subcommand) => subcommand.setName("servidor").setDescription("Muestra un resumen general del servidor."))
  .addSubcommand((subcommand) => subcommand.setName("tickets").setDescription("Muestra estadísticas de tickets."))
  .addSubcommand((subcommand) => subcommand.setName("moderacion").setDescription("Muestra estadísticas de moderación."))
  .addSubcommand((subcommand) => subcommand.setName("staff").setDescription("Muestra actividad del Staff."));

function formatMinutes(minutes: number): string {
  if (!minutes) return "Sin datos";
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function staffList(entries: Array<[string, number]>): string {
  if (!entries.length) return "Sin datos";
  return entries.map(([id, count], index) => `${index + 1}. <@${id}> — **${count}**`).join("\n");
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand !== "servidor" && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Necesitas el permiso Gestionar servidor.", ephemeral: true });
    return;
  }

  try {
    if (subcommand === "tickets") {
      const stats = await getTicketStats(interaction.guild.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Estadísticas de tickets").addFields(
        { name: "Total", value: String(stats.total), inline: true },
        { name: "Abiertos", value: String(stats.open), inline: true },
        { name: "Reclamados", value: String(stats.claimed), inline: true },
        { name: "Cerrados", value: String(stats.closed), inline: true },
        { name: "Respuesta media", value: formatMinutes(stats.avgResponseMinutes), inline: true },
        { name: "Top Staff", value: staffList(stats.topStaff), inline: false },
      ).setFooter({ text: "Basado en el historial disponible" }).setTimestamp()] });
      return;
    }

    if (subcommand === "moderacion") {
      const stats = await getModerationStats(interaction.guild.id);
      const actions = stats.actions.length ? stats.actions.map(([action, count]) => `${action}: **${count}**`).join("\n") : "Sin datos";
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Estadísticas de moderación").addFields(
        { name: "Casos totales", value: String(stats.total), inline: true },
        { name: "Completados", value: String(stats.completed), inline: true },
        { name: "Pendientes", value: String(stats.pending), inline: true },
        { name: "Fallidos", value: String(stats.failed), inline: true },
        { name: "Acciones", value: actions, inline: false },
        { name: "Top Staff", value: staffList(stats.staff), inline: false },
      ).setTimestamp()] });
      return;
    }

    if (subcommand === "staff") {
      const [tickets, moderation] = await Promise.all([getTicketStats(interaction.guild.id), getModerationStats(interaction.guild.id)]);
      const combined = new Map<string, number>();
      for (const [id, count] of tickets.topStaff) combined.set(id, (combined.get(id) ?? 0) + count);
      for (const [id, count] of moderation.staff) combined.set(id, (combined.get(id) ?? 0) + count);
      const top = [...combined.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Actividad del Staff").addFields(
        { name: "Actividad combinada", value: staffList(top), inline: false },
        { name: "Tickets cerrados/reclamados", value: staffList(tickets.topStaff), inline: false },
        { name: "Acciones de moderación", value: staffList(moderation.staff), inline: false },
      ).setFooter({ text: "La actividad se calcula desde los registros del bot" }).setTimestamp()] });
      return;
    }

    const [tickets, moderation, ratings, suggestions] = await Promise.all([
      getTicketStats(interaction.guild.id),
      getModerationStats(interaction.guild.id),
      getRatingStats(interaction.guild.id),
      getSuggestionStats(interaction.guild.id),
    ]);
    const suggestionStatus = suggestions.byStatus.length
      ? suggestions.byStatus.map(([status, count]) => `${status}: **${count}**`).join("\n")
      : "Sin datos";
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Estadísticas de ${interaction.guild.name}`).addFields(
      { name: "Tickets", value: `Total: **${tickets.total}**\nAbiertos: **${tickets.open}**\nCerrados: **${tickets.closed}**`, inline: true },
      { name: "Moderación", value: `Casos: **${moderation.total}**\nCompletados: **${moderation.completed}**`, inline: true },
      { name: "Valoraciones", value: ratings.count ? `${ratings.average.toFixed(2)}/5 (${ratings.count})` : "Sin valoraciones", inline: true },
      { name: "Sugerencias", value: `Total: **${suggestions.total}**\nVotos: **${suggestions.votes}**`, inline: true },
      { name: "Estado de sugerencias", value: suggestionStatus, inline: false },
    ).setFooter({ text: "Estadísticas almacenadas por el bot" }).setTimestamp()] });
  } catch (error) {
    console.error("[STATS] Error:", error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "No se pudieron obtener las estadísticas.", ephemeral: true });
    } else {
      await interaction.reply({ content: "No se pudieron obtener las estadísticas.", ephemeral: true });
    }
  }
}
