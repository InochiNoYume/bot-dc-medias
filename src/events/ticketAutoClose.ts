import { ChannelType, type Client, type TextChannel } from "discord.js";
import { listInactiveTickets } from "../modules/tickets/repository.js";
import { createTicketTranscript } from "../modules/tickets/transcripts.js";
import { logTicketAction, updateTicket } from "../modules/tickets/actions.js";
import { ratingMenu } from "../modules/tickets/ui.js";

const INTERVAL_MS = 60_000;

async function processInactiveTickets(client: Client): Promise<void> {
  const tickets = await listInactiveTickets();
  const now = Date.now();

  for (const ticket of tickets) {
    const minutes = ticket.category.auto_close_minutes;
    if (!minutes) continue;
    const lastActivity = new Date(ticket.last_activity_at).getTime();
    if (!Number.isFinite(lastActivity) || now - lastActivity < minutes * 60_000) continue;

    const guild = client.guilds.cache.get(ticket.guild_id);
    if (!guild) continue;

    const channel = guild.channels.cache.get(ticket.channel_id);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await updateTicket(ticket.id, { status: "closed", closedBy: client.user?.id ?? "system", closeReason: "Cierre automático por inactividad." });
      await logTicketAction({ guildId: ticket.guild_id, ticketId: ticket.id, actorId: client.user?.id ?? "system", action: "auto_closed", details: { inactiveMinutes: minutes } });
      continue;
    }

    const textChannel = channel as TextChannel;
    await createTicketTranscript(ticket.id, ticket.guild_id, textChannel);
    await updateTicket(ticket.id, { status: "closed", closedBy: client.user?.id ?? "system", closeReason: "Cierre automático por inactividad." });
    await textChannel.permissionOverwrites.edit(ticket.owner_id, { SendMessages: false });
    await logTicketAction({ guildId: ticket.guild_id, ticketId: ticket.id, actorId: client.user?.id ?? "system", action: "auto_closed", details: { inactiveMinutes: minutes } });

    await textChannel.send({ content: "Este ticket se ha cerrado automáticamente por inactividad. El usuario puede valorar la atención recibida.", components: ratingMenu(ticket.id) });
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
    setInterval(() => void run(), INTERVAL_MS);
  });
}
