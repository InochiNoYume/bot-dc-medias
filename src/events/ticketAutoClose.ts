import { ChannelType, type Client, type TextChannel } from "discord.js";
import { listInactiveTickets } from "../modules/tickets/repository.js";
import { createTicketTranscript } from "../modules/tickets/transcripts.js";
import { logTicketAction, transitionTicket, updateTicket } from "../modules/tickets/actions.js";
import { ratingMenu } from "../modules/tickets/ui.js";
import { getGuildSettings } from "../database/repositories/guildRepository.js";
import { sendGuildActionLog } from "../modules/logging/service.js";

const INTERVAL_MS = 60_000;
let processing = false;

async function processInactiveTickets(client: Client): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const tickets = await listInactiveTickets();
    const now = Date.now();
    const settingsCache = new Map<string, Awaited<ReturnType<typeof getGuildSettings>>>();

    const getCachedGuildSettings = async (guildId: string) => {
      if (settingsCache.has(guildId)) return settingsCache.get(guildId) ?? null;
      const settings = await getGuildSettings(guildId);
      settingsCache.set(guildId, settings);
      return settings;
    };

    for (const ticket of tickets) {
      const minutes = ticket.category.auto_close_minutes;
      if (!minutes) continue;
      const lastActivity = new Date(ticket.last_activity_at).getTime();
      if (!Number.isFinite(lastActivity) || now - lastActivity < minutes * 60_000) continue;

      const guild = client.guilds.cache.get(ticket.guild_id);
      if (!guild) continue;

      const channel = guild.channels.cache.get(ticket.channel_id);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await transitionTicket({ guildId: ticket.guild_id, ticketId: ticket.id, fromStatuses: ["open", "claimed"], toStatus: "closed", closedBy: client.user?.id ?? "system", closeReason: "Cierre automático por inactividad.", expectedLastActivityAt: ticket.last_activity_at });
        await logTicketAction({ guildId: ticket.guild_id, ticketId: ticket.id, actorId: client.user?.id ?? "system", action: "auto_closed", details: { inactiveMinutes: minutes } });
        await sendGuildActionLog(guild, "ticket_action", "Ticket cerrado automáticamente", `El ticket #${ticket.display_number ?? ticket.id} se cerró por inactividad.`, [{ name: "Inactividad", value: `${minutes} minutos`, inline: true }]);
        continue;
      }

      const textChannel = channel as TextChannel;
      try {
        await transitionTicket({ guildId: ticket.guild_id, ticketId: ticket.id, fromStatuses: ["open", "claimed"], toStatus: "closed", closedBy: client.user?.id ?? "system", closeReason: "Cierre automático por inactividad.", expectedLastActivityAt: ticket.last_activity_at });
      } catch (error) {
        if (error instanceof Error && error.message === "TICKET_STATE_CONFLICT") continue;
        throw error;
      }
      await createTicketTranscript(ticket.id, ticket.guild_id, textChannel);
      await textChannel.permissionOverwrites.edit(ticket.owner_id, { SendMessages: false });
      await logTicketAction({ guildId: ticket.guild_id, ticketId: ticket.id, actorId: client.user?.id ?? "system", action: "auto_closed", details: { inactiveMinutes: minutes } });

      await textChannel.send({ content: "Este ticket se ha cerrado automáticamente por inactividad. El usuario puede valorar la atención recibida.", components: ratingMenu(ticket.id) });
      const settings = await getCachedGuildSettings(ticket.guild_id);
      const archiveCategoryId = settings?.ticket_archive_category_id;
      const archiveCategory = archiveCategoryId ? guild.channels.cache.get(archiveCategoryId) : undefined;
      if (archiveCategory?.type === ChannelType.GuildCategory) {
        await textChannel.permissionOverwrites.edit(ticket.owner_id, { ViewChannel: false, SendMessages: false });
        await textChannel.setParent(archiveCategory.id, { lockPermissions: false });
        await updateTicket(ticket.guild_id, ticket.id, { archivedAt: new Date().toISOString() });
        await logTicketAction({ guildId: ticket.guild_id, ticketId: ticket.id, actorId: client.user?.id ?? "system", action: "archived", details: { categoryId: archiveCategory.id } });
        await sendGuildActionLog(guild, "ticket_action", "Ticket archivado", `El ticket #${ticket.display_number ?? ticket.id} fue archivado.`, [{ name: "Categoría", value: `<#${archiveCategory.id}>`, inline: true }]);
      }
    }
  } finally {
    processing = false;
  }
}

export function registerTicketAutoClose(client: Client): void {
  const run = async () => {
    try {
      await processInactiveTickets(client);
    } catch (error) {
      console.error("[TICKET AUTO-CLOSE ERROR]", error);
    }
  };

  client.once("ready", () => {
    void run();
    const timer = setInterval(() => void run(), INTERVAL_MS);
    timer.unref();
  });
}
