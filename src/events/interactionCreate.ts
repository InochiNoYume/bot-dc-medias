import { ActionRowBuilder, ChannelType, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle, type Client, type Guild, type GuildMember, type Interaction, type TextChannel } from "discord.js";
import { commands } from "../commands/index.js";
import { createTicketCategory, createTicketRecord, countOpenTicketsForUser, getTicketCategory } from "../modules/tickets/repository.js";
import { addTicketMember, createTicketRating, getTicketByChannel, getTicketById, removeTicketMember, updateTicket, touchTicketActivity } from "../modules/tickets/actions.js";
import { PRIORITY_LABELS, memberMenus, priorityMenu, ratingMenu, ticketControls, ticketEmbed } from "../modules/tickets/ui.js";
import { TICKET_OPEN_PREFIX } from "../modules/tickets/panel.js";
import { createTicketTranscript } from "../modules/tickets/transcripts.js";
import { logTicketAction } from "../modules/tickets/actions.js";
import { getGuildSettings } from "../database/repositories/guildRepository.js";
import { sendGuildActionLog } from "../modules/logging/service.js";

const commandMap = new Map(commands.map((command) => [command.data.name, command]));


async function logTicketActionAndDiscord(
  guild: Guild,
  input: { guildId: string; ticketId: string; actorId: string; action: string; details?: Record<string, unknown> },
): Promise<void> {
  await logTicketAction(input);
  const details = input.details ? Object.entries(input.details).map(([key, value]) => ({ name: key, value: String(value), inline: true })) : [];
  await sendGuildActionLog(
    guild,
    "ticket_action",
    `Ticket: ${input.action}`,
    `Se registró la acción **${input.action}** en el ticket.`,
    [{ name: "Ticket", value: `#${input.ticketId}`, inline: true }, { name: "Actor", value: `<@${input.actorId}>`, inline: true }, ...details],
  );
}

function isStaff(member: GuildMember, staffRoleIds: string[]): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || staffRoleIds.some((roleId) => member.roles.cache.has(roleId));
}

async function refreshTicketMessage(channel: TextChannel, ticketId: string): Promise<void> {
  const messages = await channel.messages.fetch({ limit: 20 });
  const message = messages.find((item) => item.author.id === channel.client.user?.id && item.embeds.some((embed) => embed.title?.startsWith("Ticket #")));
  if (!message) return;
  const ticket = await getTicketById(channel.guild.id, ticketId);
  if (!ticket) return;
  const category = await getTicketCategory(channel.guild.id, ticket.category_id);
  if (!category) return;
  await message.edit({
    embeds: [ticketEmbed({
      display_number: ticket.display_number,
      status: ticket.status,
      priority: ticket.priority,
      ownerId: ticket.owner_id,
      categoryName: category.name,
      claimedBy: ticket.claimed_by,
    })],
    components: ticketControls(ticket.id, ticket.status),
  });
}

export function registerInteractionEvent(client: Client): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commandMap.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      const interactionChannelId = interaction.channelId;
      if (interaction.guild && interactionChannelId && (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isModalSubmit())) {
        const activeTicket = await getTicketByChannel(interaction.guild.id, interactionChannelId);
        if (activeTicket && activeTicket.status !== "closed") {
          await touchTicketActivity(activeTicket.id);
        }
      }

      if (interaction.isModalSubmit() && interaction.customId === "ticket:category:create") {
        if (!interaction.guild) return;
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true });
          return;
        }
        const name = interaction.fields.getTextInputValue("name").trim();
        const description = interaction.fields.getTextInputValue("description").trim();
        const priority = interaction.fields.getTextInputValue("priority").trim().toLowerCase();
        const maxOpen = Number(interaction.fields.getTextInputValue("maxOpen").trim());
        const autoCloseRaw = Number(interaction.fields.getTextInputValue("autoClose").trim());
        if (!["low", "normal", "high", "urgent"].includes(priority)) {
          await interaction.reply({ content: "La prioridad indicada no es válida.", ephemeral: true });
          return;
        }
        if (!Number.isInteger(maxOpen) || maxOpen < 1 || maxOpen > 20) {
          await interaction.reply({ content: "El máximo debe estar entre 1 y 20.", ephemeral: true });
          return;
        }
        if (!Number.isInteger(autoCloseRaw) || autoCloseRaw < 0 || autoCloseRaw > 10080 || (autoCloseRaw > 0 && autoCloseRaw < 5)) {
          await interaction.reply({ content: "El cierre automático debe ser 0 (desactivado) o un valor entre 5 y 10080 minutos.", ephemeral: true });
          return;
        }
        const category = await createTicketCategory({
          guildId: interaction.guild.id, name, description, discordCategoryId: null, staffRoleIds: [],
          priority, maxOpenPerUser: maxOpen, autoCloseMinutes: autoCloseRaw === 0 ? null : autoCloseRaw,
        });
        await interaction.reply({ content: `Categoría creada: **${category.name}**\nID: \`${category.id}\``, ephemeral: true });
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket:close:")) {
        if (!interaction.guild) return;
        const ticketId = interaction.customId.slice("ticket:close:".length);
        const ticket = await getTicketById(interaction.guild.id, ticketId);
        if (!ticket) {
          await interaction.reply({ content: "No se encontró el ticket.", ephemeral: true });
          return;
        }
        const member = interaction.member as GuildMember;
        const category = await getTicketCategory(interaction.guild.id, ticket.category_id);
        const staff = isStaff(member, category?.staff_role_ids ?? []);
        const owner = interaction.user.id === ticket.owner_id;
        if (!staff && !owner) {
          await interaction.reply({ content: "No tienes permiso para cerrar este ticket.", ephemeral: true });
          return;
        }
        const reason = interaction.fields.getTextInputValue("reason").trim();
        if (interaction.channel?.type === ChannelType.GuildText) {
          await createTicketTranscript(ticket.id, interaction.guild.id, interaction.channel);
        }
        await updateTicket(ticket.id, { status: "closed", closedBy: interaction.user.id, closeReason: reason || null });
        await logTicketActionAndDiscord(interaction.guild, { guildId: interaction.guild.id, ticketId: ticket.id, actorId: interaction.user.id, action: "closed", details: { reason: reason || null } });
        if (interaction.channel?.type === ChannelType.GuildText) {
          await interaction.channel.permissionOverwrites.edit(ticket.owner_id, { SendMessages: false });
          await refreshTicketMessage(interaction.channel, ticket.id);
          await interaction.channel.send({ content: reason ? `El ticket ha sido cerrado. Motivo: **${reason}**` : "El ticket ha sido cerrado. El usuario puede valorar la atención recibida.", components: ratingMenu(ticket.id) });
          const settings = await getGuildSettings(interaction.guild.id);
          const archiveCategoryId = settings?.ticket_archive_category_id;
          const archiveCategory = archiveCategoryId ? interaction.guild.channels.cache.get(archiveCategoryId) : undefined;
          if (archiveCategory?.type === ChannelType.GuildCategory) {
            await interaction.channel.setParent(archiveCategory.id, { lockPermissions: false });
            await updateTicket(ticket.id, { archivedAt: new Date().toISOString() });
            await logTicketAction({ guildId: interaction.guild.id, ticketId: ticket.id, actorId: interaction.user.id, action: "archived", details: { categoryId: archiveCategory.id } });
          }
        }
        await interaction.reply({ content: "Ticket cerrado correctamente.", ephemeral: true });
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith(TICKET_OPEN_PREFIX)) {
        if (!interaction.guild) {
          await interaction.reply({ content: "Este botón solo funciona dentro de un servidor.", ephemeral: true });
          return;
        }
        const categoryId = interaction.customId.slice(TICKET_OPEN_PREFIX.length);
        const category = await getTicketCategory(interaction.guild.id, categoryId);
        if (!category || !category.enabled) {
          await interaction.reply({ content: "Esta categoría ya no está disponible.", ephemeral: true });
          return;
        }
        const openCount = await countOpenTicketsForUser(interaction.guild.id, interaction.user.id, category.id);
        if (openCount >= category.max_open_per_user) {
          await interaction.reply({ content: "Ya alcanzaste el máximo de tickets abiertos para esta categoría.", ephemeral: true });
          return;
        }
        const parent = category.discord_category_id ? interaction.guild.channels.cache.get(category.discord_category_id) : undefined;
        const parentId = parent && typeof parent !== "string" && parent.type === ChannelType.GuildCategory ? parent.id : undefined;
        const botMember = interaction.guild.members.me;
        if (!botMember) {
          await interaction.reply({ content: "No pude identificar al bot dentro del servidor.", ephemeral: true });
          return;
        }
        const channel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20)}`,
          type: ChannelType.GuildText,
          ...(parentId ? { parent: parentId } : {}),
          permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
            ...category.staff_role_ids.map((roleId) => ({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
          ],
        });
        try {
          const ticket = await createTicketRecord({ guildId: interaction.guild.id, channelId: channel.id, ownerId: interaction.user.id, categoryId: category.id, priority: category.priority });
          await channel.send({
            content: `<@${interaction.user.id}>`,
            embeds: [ticketEmbed({ display_number: ticket.display_number, status: ticket.status, priority: ticket.priority, ownerId: ticket.owner_id, categoryName: category.name, claimedBy: ticket.claimed_by })],
            components: ticketControls(ticket.id, ticket.status),
          });
          await sendGuildActionLog(interaction.guild, "ticket_action", "Ticket creado", `Se creó el ticket #${ticket.display_number ?? ticket.id}.`, [{ name: "Usuario", value: `<@${interaction.user.id}>`, inline: true }, { name: "Categoría", value: category.name, inline: true }]);
          await interaction.reply({ content: `Tu ticket fue creado: <#${channel.id}>`, ephemeral: true });
        } catch (error) {
          await channel.delete().catch(() => undefined);
          throw error;
        }
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith("ticket:")) {
        const [, action, ticketId] = interaction.customId.split(":");
        if (!interaction.guild || !ticketId) return;
        const ticket = await getTicketById(interaction.guild.id, ticketId);
        if (!ticket) {
          await interaction.reply({ content: "No encontré este ticket.", ephemeral: true });
          return;
        }
        const category = await getTicketCategory(interaction.guild.id, ticket.category_id);
        if (!category) {
          await interaction.reply({ content: "La categoría de este ticket ya no existe.", ephemeral: true });
          return;
        }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const staff = isStaff(member, category.staff_role_ids);
        const owner = ticket.owner_id === interaction.user.id;

        if (action === "claim") {
          if (!staff) { await interaction.reply({ content: "Solo el personal autorizado puede tomar tickets.", ephemeral: true }); return; }
          if (ticket.status === "closed") { await interaction.reply({ content: "Este ticket está cerrado.", ephemeral: true }); return; }
          if (ticket.claimed_by && ticket.claimed_by !== interaction.user.id) {
            await interaction.reply({ content: `Este ticket ya está siendo atendido por <@${ticket.claimed_by}>.`, ephemeral: true }); return;
          }
          const next = ticket.claimed_by === interaction.user.id ? { status: "open" as const, claimedBy: null } : { status: "claimed" as const, claimedBy: interaction.user.id };
          await updateTicket(ticket.id, next);
          await logTicketAction({ guildId: interaction.guild.id, ticketId: ticket.id, actorId: interaction.user.id, action: next.status === "claimed" ? "claimed" : "unclaimed" });
          if (interaction.channel?.type === ChannelType.GuildText) await refreshTicketMessage(interaction.channel, ticket.id);
          await interaction.reply({ content: ticket.claimed_by === interaction.user.id ? "Has liberado el ticket." : "Has tomado el ticket.", ephemeral: true });
          return;
        }

        if (action === "close") {
          if (!staff && !owner) { await interaction.reply({ content: "No tienes permiso para cerrar este ticket.", ephemeral: true }); return; }
          if (ticket.status === "closed") { await interaction.reply({ content: "El ticket ya está cerrado.", ephemeral: true }); return; }
          const modal = new ModalBuilder().setCustomId(`ticket:close:${ticket.id}`).setTitle("Cerrar ticket");
          const reason = new TextInputBuilder().setCustomId("reason").setLabel("Motivo del cierre").setStyle(TextInputStyle.Paragraph).setPlaceholder("Indica brevemente el motivo del cierre...").setRequired(false).setMaxLength(500);
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reason));
          await interaction.showModal(modal);
          return;
        }

        if (action === "reopen") {
          if (!staff) { await interaction.reply({ content: "Solo el personal autorizado puede reabrir tickets.", ephemeral: true }); return; }
          if (ticket.status !== "closed") { await interaction.reply({ content: "Este ticket ya está abierto.", ephemeral: true }); return; }
          await updateTicket(ticket.id, { status: "open" });
          await logTicketAction({ guildId: interaction.guild.id, ticketId: ticket.id, actorId: interaction.user.id, action: "reopened" });
          if (interaction.channel?.type === ChannelType.GuildText) {
            if (category.discord_category_id) {
              const originalCategory = interaction.guild.channels.cache.get(category.discord_category_id);
              if (originalCategory?.type === ChannelType.GuildCategory) {
                await interaction.channel.setParent(originalCategory.id, { lockPermissions: false });
              }
            }
            await interaction.channel.permissionOverwrites.edit(ticket.owner_id, { SendMessages: true, ViewChannel: true, ReadMessageHistory: true });
            await refreshTicketMessage(interaction.channel, ticket.id);
          }
          await interaction.reply({ content: "Ticket reabierto correctamente.", ephemeral: true });
          return;
        }

        if (action === "priority") {
          if (!staff) { await interaction.reply({ content: "Solo el personal autorizado puede cambiar la prioridad.", ephemeral: true }); return; }
          await interaction.reply({ content: "Selecciona la nueva prioridad.", components: priorityMenu(ticket.id), ephemeral: true });
          return;
        }

        if (action === "members") {
          if (!staff) { await interaction.reply({ content: "Solo el personal autorizado puede gestionar usuarios.", ephemeral: true }); return; }
          await interaction.reply({ content: "Gestiona los usuarios con acceso a este ticket.", components: memberMenus(ticket.id), ephemeral: true });
          return;
        }
      }

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith("ticket:")) {
        const [, action, maybeMode, maybeTicketId] = interaction.customId.split(":");
        const ticketId = maybeTicketId ?? maybeMode;
        if (!interaction.guild || !ticketId) return;
        const ticket = await getTicketById(interaction.guild.id, ticketId);
        if (!ticket) { await interaction.reply({ content: "No encontré este ticket.", ephemeral: true }); return; }
        const category = await getTicketCategory(interaction.guild.id, ticket.category_id);
        if (!category) { await interaction.reply({ content: "La categoría ya no existe.", ephemeral: true }); return; }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (action === "priority") {
          if (!isStaff(member, category.staff_role_ids)) { await interaction.reply({ content: "No tienes permiso para cambiar la prioridad.", ephemeral: true }); return; }
          const priority = interaction.values[0] as "low" | "normal" | "high" | "urgent";
          await updateTicket(ticket.id, { priority });
          await logTicketAction({ guildId: interaction.guild.id, ticketId: ticket.id, actorId: interaction.user.id, action: "priority_changed", details: { priority } });
          if (interaction.channel?.type === ChannelType.GuildText) await refreshTicketMessage(interaction.channel, ticket.id);
          await interaction.update({ content: `Prioridad actualizada a **${PRIORITY_LABELS[priority]}**.`, components: [] });
          return;
        }
        if (action === "rating") {
          if (interaction.user.id !== ticket.owner_id) { await interaction.reply({ content: "Solo el creador del ticket puede valorar la atención.", ephemeral: true }); return; }
          if (ticket.status !== "closed") { await interaction.reply({ content: "El ticket todavía está abierto.", ephemeral: true }); return; }
          const rating = Number(interaction.values[0]);
          await createTicketRating({ ticketId: ticket.id, guildId: interaction.guild.id, userId: interaction.user.id, rating });
          await sendGuildActionLog(interaction.guild, "ticket_rating", "Valoración de ticket", `El ticket #${ticket.display_number ?? ticket.id} recibió una valoración de **${rating}/5**.`, [{ name: "Usuario", value: `<@${interaction.user.id}>`, inline: true }]);
          await interaction.update({ content: "Gracias por tu valoración.", components: [] });
          return;
        }
      }

      if (interaction.isUserSelectMenu() && interaction.customId.startsWith("ticket:member:")) {
        const [, , mode, ticketId] = interaction.customId.split(":");
        if (!interaction.guild || !ticketId) return;
        const ticket = await getTicketById(interaction.guild.id, ticketId);
        if (!ticket) { await interaction.reply({ content: "No encontré este ticket.", ephemeral: true }); return; }
        const category = await getTicketCategory(interaction.guild.id, ticket.category_id);
        if (!category) { await interaction.reply({ content: "La categoría ya no existe.", ephemeral: true }); return; }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!isStaff(member, category.staff_role_ids)) { await interaction.reply({ content: "No tienes permiso para gestionar usuarios.", ephemeral: true }); return; }
        const targetId = interaction.values[0];
        if (!targetId) { await interaction.reply({ content: "Debes seleccionar un usuario.", ephemeral: true }); return; }
        if (interaction.channel?.type !== ChannelType.GuildText) { await interaction.reply({ content: "El ticket no está en un canal de texto.", ephemeral: true }); return; }
        if (mode === "add") {
          await addTicketMember(ticket.id, targetId);
          await logTicketAction({ guildId: interaction.guild.id, ticketId: ticket.id, actorId: interaction.user.id, action: "member_added", details: { userId: targetId } });
          await interaction.channel.permissionOverwrites.edit(targetId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
          await interaction.reply({ content: "Usuario añadido al ticket.", ephemeral: true });
        } else {
          if (targetId === ticket.owner_id) { await interaction.reply({ content: "No puedes retirar al creador del ticket.", ephemeral: true }); return; }
          await removeTicketMember(ticket.id, targetId);
          await logTicketAction({ guildId: interaction.guild.id, ticketId: ticket.id, actorId: interaction.user.id, action: "member_removed", details: { userId: targetId } });
          await interaction.channel.permissionOverwrites.delete(targetId).catch(() => undefined);
          await interaction.reply({ content: "Usuario retirado del ticket.", ephemeral: true });
        }
      }
    } catch (error) {
      console.error("[INTERACTION ERROR]", error);
      const content = "Ocurrió un error procesando esta interacción.";
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) await interaction.followUp({ content, ephemeral: true }).catch(() => undefined);
        else await interaction.reply({ content, ephemeral: true }).catch(() => undefined);
      }
    }
  });
}
