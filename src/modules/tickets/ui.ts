import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, UserSelectMenuBuilder } from "discord.js";
import type { TicketPriority, TicketStatus } from "./types.js";

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

export function ticketControls(ticketId: string, status: TicketStatus) {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`ticket:claim:${ticketId}`).setLabel(status === "claimed" ? "Liberar" : "Tomar ticket").setStyle(status === "claimed" ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`ticket:priority:${ticketId}`).setLabel("Prioridad").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`ticket:${status === "closed" ? "reopen" : "close"}:${ticketId}`).setLabel(status === "closed" ? "Reabrir" : "Cerrar").setStyle(status === "closed" ? ButtonStyle.Success : ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`ticket:members:${ticketId}`).setLabel("Usuarios").setStyle(ButtonStyle.Secondary),
  )];
}

export function ticketEmbed(ticket: { display_number: number | null; status: TicketStatus; priority: TicketPriority; ownerId: string; categoryName: string; claimedBy?: string | null }) {
  return new EmbedBuilder()
    .setTitle(`Ticket #${String(ticket.display_number ?? 0).padStart(4, "0")}`)
    .setDescription("Gestiona tu solicitud mediante los controles disponibles.")
    .addFields(
      { name: "Categoría", value: ticket.categoryName, inline: true },
      { name: "Prioridad", value: PRIORITY_LABELS[ticket.priority], inline: true },
      { name: "Estado", value: ticket.status === "closed" ? "Cerrado" : ticket.status === "claimed" ? "Atendido" : "Abierto", inline: true },
      { name: "Usuario", value: `<@${ticket.ownerId}>`, inline: true },
      { name: "Responsable", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Sin asignar", inline: true },
    );
}

export function priorityMenu(ticketId: string) {
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`ticket:priority:select:${ticketId}`).setPlaceholder("Selecciona una prioridad").addOptions(
      ...(["low", "normal", "high", "urgent"] as TicketPriority[]).map((value) =>
        new StringSelectMenuOptionBuilder().setLabel(PRIORITY_LABELS[value]).setValue(value),
      ),
    ),
  )];
}

export function memberMenus(ticketId: string) {
  return [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder().setCustomId(`ticket:member:add:${ticketId}`).setPlaceholder("Añadir usuario al ticket").setMinValues(1).setMaxValues(1),
    ),
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder().setCustomId(`ticket:member:remove:${ticketId}`).setPlaceholder("Retirar usuario del ticket").setMinValues(1).setMaxValues(1),
    ),
  ];
}

export function ratingMenu(ticketId: string) {
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder().setCustomId(`ticket:rating:${ticketId}`).setPlaceholder("Valora la atención recibida").addOptions(
      ...[1, 2, 3, 4, 5].map((rating) =>
        new StringSelectMenuOptionBuilder().setLabel(`${rating}/5`).setValue(String(rating)).setDescription(rating === 5 ? "Excelente" : rating === 4 ? "Muy buena" : rating === 3 ? "Buena" : rating === 2 ? "Mejorable" : "Deficiente"),
      ),
    ),
  )];
}
