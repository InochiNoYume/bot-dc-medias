import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import {
  countRows,
  getCreatorStats,
  getModerationCases,
  getRatings,
  getSuggestions,
  getTicketCategories,
  getTickets,
} from "../../modules/statistics/repository.js";

export const data = new SlashCommandBuilder()
  .setName("estadisticas")
  .setDescription("Consulta estadísticas del servidor.")
  .addSubcommand((subcommand) => subcommand.setName("servidor").setDescription("Muestra un resumen general del servidor."))
  .addSubcommand((subcommand) => subcommand.setName("tickets").setDescription("Muestra estadísticas de tickets."))
  .addSubcommand((subcommand) => subcommand.setName("moderacion").setDescription("Muestra estadísticas de moderación."))
  .addSubcommand((subcommand) => subcommand.setName("staff").setDescription("Muestra actividad del Staff."));

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "Sin datos";
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function averageDuration(rows: Array<{ start: string; end: string | null }>): number {
  const values = rows
    .filter((row) => row.end)
    .map((row) => new Date(row.end as string).getTime() - new Date(row.start).getTime())
    .filter((value) => Number.isFinite(value) && value >= 0);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length / 60_000 : 0;
}

function staffList(entries: Array<[string, number]>, limit = 10): string {
  if (!entries.length) return "Sin datos";
  return entries
    .slice(0, limit)
    .map(([id, count], index) => `${index + 1}. <@${id}> — **${count}**`)
    .join("\n");
}

function mapCounts(values: string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

async function buildTicketStats(guildId: string) {
  const [tickets, categories] = await Promise.all([getTickets(guildId), getTicketCategories(guildId)]);
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const open = tickets.filter((ticket) => ticket.status === "open").length;
  const claimed = tickets.filter((ticket) => ticket.status === "claimed").length;
  const closed = tickets.filter((ticket) => ticket.status === "closed").length;
  const avgResponseMinutes = averageDuration(tickets.map((ticket) => ({ start: ticket.created_at, end: ticket.claimed_at })));
  const avgCloseMinutes = averageDuration(tickets.map((ticket) => ({ start: ticket.created_at, end: ticket.closed_at })));
  const staff = mapCounts(
    tickets.map((ticket) => ticket.closed_by ?? ticket.claimed_by).filter((id): id is string => Boolean(id)),
  );
  const categoryCounts = new Map<string, number>();
  for (const ticket of tickets) {
    const name = categoryNames.get(ticket.category_id) ?? ticket.category_id;
    categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + 1);
  }

  return {
    total: tickets.length,
    open,
    claimed,
    closed,
    avgResponseMinutes,
    avgCloseMinutes,
    staff,
    categories: [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]),
    priorities: mapCounts(tickets.map((ticket) => ticket.priority)),
  };
}

async function buildModerationStats(guildId: string) {
  const cases = await getModerationCases(guildId);
  const completed = cases.filter((item) => item.status === "completed");
  return {
    total: cases.length,
    completed: completed.length,
    pending: cases.filter((item) => item.status === "pending").length,
    failed: cases.filter((item) => item.status === "failed").length,
    actions: mapCounts(completed.map((item) => item.action)),
    staff: mapCounts(completed.map((item) => item.moderator_id)),
  };
}

async function buildRatingStats(guildId: string) {
  const ratings = await getRatings(guildId);
  const average = ratings.length ? ratings.reduce((sum, item) => sum + Number(item.rating), 0) / ratings.length : 0;
  return { count: ratings.length, average };
}

async function buildSuggestionStats(guildId: string) {
  const suggestions = await getSuggestions(guildId);
  const byStatus = mapCounts(suggestions.map((suggestion) => suggestion.status));
  const votes = suggestions.reduce((sum, suggestion) => sum + Number(suggestion.upvotes) + Number(suggestion.downvotes), 0);
  return { total: suggestions.length, byStatus, votes };
}

function countList(entries: Array<[string, number]>): string {
  return entries.length ? entries.map(([name, count]) => `${name}: **${count}**`).join("\n") : "Sin datos";
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
    const guildId = interaction.guild.id;

    if (subcommand === "tickets") {
      const stats = await buildTicketStats(guildId);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Estadísticas de tickets").addFields(
        { name: "Total", value: String(stats.total), inline: true },
        { name: "Abiertos", value: String(stats.open), inline: true },
        { name: "Reclamados", value: String(stats.claimed), inline: true },
        { name: "Cerrados", value: String(stats.closed), inline: true },
        { name: "Respuesta media", value: formatMinutes(stats.avgResponseMinutes), inline: true },
        { name: "Cierre medio", value: formatMinutes(stats.avgCloseMinutes), inline: true },
        { name: "Prioridades", value: countList(stats.priorities), inline: false },
        { name: "Categorías", value: countList(stats.categories), inline: false },
        { name: "Top Staff", value: staffList(stats.staff), inline: false },
      ).setFooter({ text: "Basado en todo el historial disponible" }).setTimestamp()] });
      return;
    }

    if (subcommand === "moderacion") {
      const stats = await buildModerationStats(guildId);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Estadísticas de moderación").addFields(
        { name: "Casos totales", value: String(stats.total), inline: true },
        { name: "Completados", value: String(stats.completed), inline: true },
        { name: "Pendientes", value: String(stats.pending), inline: true },
        { name: "Fallidos", value: String(stats.failed), inline: true },
        { name: "Acciones", value: countList(stats.actions), inline: false },
        { name: "Top Staff", value: staffList(stats.staff), inline: false },
      ).setTimestamp()] });
      return;
    }

    if (subcommand === "staff") {
      const [tickets, moderation] = await Promise.all([buildTicketStats(guildId), buildModerationStats(guildId)]);
      const combined = new Map<string, number>();
      for (const [id, count] of tickets.staff) combined.set(id, (combined.get(id) ?? 0) + count);
      for (const [id, count] of moderation.staff) combined.set(id, (combined.get(id) ?? 0) + count);
      const top = [...combined.entries()].sort((a, b) => b[1] - a[1]);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Actividad del Staff").addFields(
        { name: "Actividad combinada", value: staffList(top), inline: false },
        { name: "Tickets", value: staffList(tickets.staff), inline: false },
        { name: "Moderación", value: staffList(moderation.staff), inline: false },
      ).setFooter({ text: "Calculado desde los registros históricos del bot" }).setTimestamp()] });
      return;
    }

    const [tickets, moderation, ratings, suggestions, creators] = await Promise.all([
      buildTicketStats(guildId),
      buildModerationStats(guildId),
      buildRatingStats(guildId),
      buildSuggestionStats(guildId),
      getCreatorStats(guildId),
    ]);
    const suggestionStatus = countList(suggestions.byStatus);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`Estadísticas de ${interaction.guild.name}`).addFields(
      { name: "Tickets", value: `Total: **${tickets.total}**\nAbiertos: **${tickets.open}**\nCerrados: **${tickets.closed}**`, inline: true },
      { name: "Moderación", value: `Casos: **${moderation.total}**\nCompletados: **${moderation.completed}**`, inline: true },
      { name: "Valoraciones", value: ratings.count ? `${ratings.average.toFixed(2)}/5 (${ratings.count})` : "Sin valoraciones", inline: true },
      { name: "Sugerencias", value: `Total: **${suggestions.total}**\nVotos: **${suggestions.votes}`, inline: true },
      { name: "Creadores", value: `Feeds: **${creators.feeds}**\nNotificaciones: **${creators.notifications}**`, inline: true },
      { name: "Estado de sugerencias", value: suggestionStatus, inline: false },
    ).setFooter({ text: "Estadísticas aisladas por servidor" }).setTimestamp()] });
  } catch (error) {
    console.error("[STATS] Error:", error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "No se pudieron obtener las estadísticas.", ephemeral: true });
    } else {
      await interaction.reply({ content: "No se pudieron obtener las estadísticas.", ephemeral: true });
    }
  }
}
