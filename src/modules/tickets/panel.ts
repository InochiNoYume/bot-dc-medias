import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type TextChannel } from "discord.js";
import type { TicketCategory } from "./types.js";

export const TICKET_OPEN_PREFIX = "ticket:open:";

export function buildTicketPanel(categories: TicketCategory[], title = "Soporte", description = "Selecciona una categoría para abrir un ticket.") {
  const embed = new EmbedBuilder().setTitle(title).setDescription(description).setFooter({ text: "Sistema de Tickets" });
  const buttons = categories.slice(0, 25).map((category) =>
    new ButtonBuilder().setCustomId(TICKET_OPEN_PREFIX + category.id).setLabel(category.name.slice(0, 80)).setStyle(ButtonStyle.Primary)
  );
  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + 5)));
  return { embeds: [embed], components: rows };
}

export async function sendTicketPanel(channel: TextChannel, categories: TicketCategory[]): Promise<string> {
  const message = await channel.send(buildTicketPanel(categories));
  return message.id;
}
