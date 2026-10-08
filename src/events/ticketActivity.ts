import type { Client, Message } from "discord.js";
import { getTicketByChannel, touchTicketActivity } from "../modules/tickets/actions.js";

export function registerTicketActivityEvent(client: Client): void {
  client.on("messageCreate", async (message: Message) => {
    try {
      if (!message.guild || message.author.bot || message.channel.isDMBased()) return;
      const ticket = await getTicketByChannel(message.guild.id, message.channel.id);
      if (!ticket || ticket.status === "closed") return;
      await touchTicketActivity(message.guild.id, ticket.id);
    } catch (error) {
      console.error("[TICKET ACTIVITY ERROR]", error);
    }
  });
}
