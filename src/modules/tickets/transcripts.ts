import type { TextChannel } from "discord.js";
import { supabase } from "../../database/supabase.js";

export async function createTicketTranscript(ticketId: string, guildId: string, channel: TextChannel): Promise<void> {
  const messages: string[] = [];
  let before: string | undefined;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;

    for (const message of Array.from(batch.values()).reverse()) {
      const timestamp = message.createdAt.toISOString();
      const author = `${message.author.tag} (${message.author.id})`;
      const content = message.content || "[sin contenido]";
      const attachments = message.attachments.size
        ? ` | Adjuntos: ${Array.from(message.attachments.values()).map((file) => file.url).join(", ")}`
        : "";
      messages.push(`[${timestamp}] ${author}: ${content}${attachments}`);
    }

    if (batch.size < 100) break;
    before = batch.last()?.id;
    if (!before) break;
  }

  const transcript = messages.join("\n");
  const { error } = await supabase.from("ticket_transcripts").upsert({
    ticket_id: ticketId,
    guild_id: guildId,
    content: transcript,
  }, { onConflict: "ticket_id" });

  if (error) throw error;
}
