import type { Client, Message } from "discord.js";
import { getTicketByChannel, touchTicketActivity } from "../modules/tickets/actions.js";
import type { TicketRecord } from "../modules/tickets/types.js";

const ACTIVITY_WRITE_INTERVAL_MS = 15_000;
const TICKET_LOOKUP_CACHE_MS = 15_000;
const NON_TICKET_LOOKUP_CACHE_MS = 5_000;

const lastActivityWrites = new Map<string, number>();
const ticketLookupCache = new Map<string, { ticket: TicketRecord | null; expiresAt: number }>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  const activityCutoff = now - ACTIVITY_WRITE_INTERVAL_MS * 2;

  for (const [ticketId, timestamp] of lastActivityWrites) {
    if (timestamp < activityCutoff) lastActivityWrites.delete(ticketId);
  }

  for (const [channelKey, entry] of ticketLookupCache) {
    if (entry.expiresAt <= now) ticketLookupCache.delete(channelKey);
  }
}, 60_000);
cleanupTimer.unref();

async function getCachedTicket(guildId: string, channelId: string): Promise<TicketRecord | null> {
  const key = guildId + ":" + channelId;
  const now = Date.now();
  const cached = ticketLookupCache.get(key);
  if (cached && cached.expiresAt > now) return cached.ticket;

  const ticket = await getTicketByChannel(guildId, channelId);
  ticketLookupCache.set(key, {
    ticket,
    expiresAt: now + (ticket ? TICKET_LOOKUP_CACHE_MS : NON_TICKET_LOOKUP_CACHE_MS),
  });
  return ticket;
}

export function registerTicketActivityEvent(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    try {
      if (!message.guild || message.author.bot || message.channel.isDMBased()) return;

      const ticket = await getCachedTicket(message.guild.id, message.channel.id);
      if (!ticket || ticket.status === "closed") return;

      const now = Date.now();
      const lastWrite = lastActivityWrites.get(ticket.id) ?? 0;
      if (now - lastWrite < ACTIVITY_WRITE_INTERVAL_MS) return;

      lastActivityWrites.set(ticket.id, now);
      await touchTicketActivity(message.guild.id, ticket.id);
    } catch (error) {
      console.error("[TICKET ACTIVITY ERROR]", error);
    }
  });
}
