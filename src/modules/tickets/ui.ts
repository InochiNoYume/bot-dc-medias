import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { TicketPriority, TicketStatus } from "./types.js";

export function ticketControls(status:TicketStatus){
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ticket:claim").setLabel(status==="claimed"?"Unclaim":"Claim").setStyle(status==="claimed"?ButtonStyle.Secondary:ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ticket:priority").setLabel("Prioridad").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(status==="closed"?"ticket:reopen":"ticket:close").setLabel(status==="closed"?"Reabrir":"Cerrar").setStyle(status==="closed"?ButtonStyle.Success:ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket:members").setLabel("Usuarios").setStyle(ButtonStyle.Secondary)
  )];
}
export function ticketEmbed(ticket:{display_number:number|null;status:TicketStatus;priority:TicketPriority;ownerId:string;categoryName:string}){
 return new EmbedBuilder().setTitle("Ticket #"+String(ticket.display_number??0).padStart(4,"0"))
 .setDescription("Gestiona tu solicitud mediante los controles disponibles.")
 .addFields({name:"Categoría",value:ticket.categoryName,inline:true},{name:"Prioridad",value:ticket.priority,inline:true},{name:"Estado",value:ticket.status,inline:true},{name:"Usuario",value:"<@"+ticket.ownerId+">"});
}
