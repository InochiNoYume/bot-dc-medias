import type { Client, Message } from "discord.js";
import { getTicketByChannel, touchTicketActivity } from "../modules/tickets/actions.js";

const ACTIVITY_WRITE_INTERVAL_MS = 15_000;
const lastActivityWrites = new Map<string, number>();
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - ACTIVITY_WRITE_INTERVAL_MS * 2;
  for (const [ticketId, timestamp] of lastActivityWrites) {
    if (timestamp < cutoff) lastActivityWrites.delete(ticketId);
  }
}, 60_000);
cleanupTimer.unref();

export function registerTicketActivityEvent(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    try {
      if (!message.guild || message.author.bot || message.channel.isDMBased()) return;
      const ticket = await getTicketByChannel(message.guild.id, message.channel.id);
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
