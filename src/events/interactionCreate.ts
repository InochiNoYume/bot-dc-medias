import {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type Client,
  type Guild,
  type GuildMember,
  type Interaction,
  type TextChannel,
} from "discord.js";
import { commands } from "../commands/index.js";
import { createTicketRecord, countOpenTicketsForUser, getTicketCategory } from "../modules/tickets/repository.js";
import {
  addTicketMember,
  createTicketRating,
  getTicketRating,
  getTicketByChannel,
  getTicketById,
  removeTicketMember,
  updateTicket,
  transitionTicket,
  touchTicketActivity,
  logTicketAction,
} from "../modules/tickets/actions.js";
import { PRIORITY_LABELS, memberMenus, priorityMenu, ratingMenu, ticketControls, ticketEmbed } from "../modules/tickets/ui.js";
import { TICKET_OPEN_PREFIX } from "../modules/tickets/panel.js";
import { createTicketTranscript } from "../modules/tickets/transcripts.js";
import { getGuildSettings } from "../database/repositories/guildRepository.js";
import { sendGuildActionLog } from "../modules/logging/service.js";

const commandMap = new Map(commands.map((command) => [command.data.name, command]));
const commandCooldowns = new Map<string, number>();
const COMMAND_COOLDOWN_MS = 1500;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, expiresAt] of commandCooldowns) if (expiresAt <= now) commandCooldowns.delete(key);
}, 60_000);
cleanupTimer.unref();

function isStaff(member: GuildMember, staffRoleIds: string[]): boolean {
  return member.permissions.has(PermissionFlagsBits.ManageGuild) || staffRoleIds.some((id) => member.roles.cache.has(id));
}

async function refreshTicketMessage(channel: TextChannel, ticketId: string): Promise<void> {
  const ticket = await getTicketById(channel.guild.id, ticketId);
  if (!ticket) return;
  const category = await getTicketCategory(channel.guild.id, ticket.category_id);
  if (!category) return;
  const messages = await channel.messages.fetch({ limit: 20 });
  const message = messages.find((item) => item.author.id === channel.client.user?.id && item.embeds.some((embed) => embed.title?.startsWith("Ticket #")));
  if (!message) return;
  await message.edit({
    embeds: [ticketEmbed({ display_number: ticket.display_number, status: ticket.status, priority: ticket.priority, ownerId: ticket.owner_id, categoryName: category.name, claimedBy: ticket.claimed_by })],
    components: ticketControls(ticket.id, ticket.status),
  });
}

async function ticketLog(guild: Guild, ticketId: string, actorId: string, action: string, details?: Record<string, unknown>): Promise<void> {
  await logTicketAction({ guildId: guild.id, ticketId, actorId, action, details });
  await sendGuildActionLog(
    guild,
    "ticket_action",
    `Ticket: ${action}`,
    `Se registró la acción **${action}** en el ticket.`,
    [{ name: "Ticket", value: `#${ticketId}`, inline: true }, { name: "Actor", value: `<@${actorId}>`, inline: true }],
  );
}

export function registerInteractionEvent(client: Client): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commandMap.get(interaction.commandName);
        if (!command) return;
        const key = `${interaction.user.id}:${interaction.commandName}`;
        const now = Date.now();
        const expiresAt = commandCooldowns.get(key) ?? 0;
        if (expiresAt > now) {
          await interaction.reply({ content: `Espera **${Math.max(1, Math.ceil((expiresAt - now) / 1000))}s** antes de volver a usar este comando.`, ephemeral: true });
          return;
        }
        commandCooldowns.set(key, now + COMMAND_COOLDOWN_MS);
        await command.execute(interaction);
        return;
      }

      if (interaction.guild && (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isUserSelectMenu() || interaction.isModalSubmit())) {
        const activeTicket = await getTicketByChannel(interaction.guild.id, interaction.channelId);
        if (activeTicket && activeTicket.status !== "closed") await touchTicketActivity(interaction.guild.id, activeTicket.id);
      }

      if (interaction.isModalSubmit() && interaction.customId === "ticket:category:create") {
        if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true });
          return;
        }
        const priority = interaction.fields.getTextInputValue("priority").trim().toLowerCase();
        const maxOpen = Number(interaction.fields.getTextInputValue("maxOpen").trim());
        const autoClose = Number(interaction.fields.getTextInputValue("autoClose").trim());
        if (!["low", "normal", "high", "urgent"].includes(priority) || !Number.isInteger(maxOpen) || maxOpen < 1 || maxOpen > 20 || !Number.isInteger(autoClose) || autoClose < 0 || autoClose > 10080 || (autoClose > 0 && autoClose < 5)) {
          await interaction.reply({ content: "Los valores de la categoría no son válidos.", ephemeral: true });
          return;
        }
        const { createTicketCategory } = await import("../modules/tickets/repository.js");
        const category = await createTicketCategory({
          guildId: interaction.guild.id,
          name: interaction.fields.getTextInputValue("name").trim(),
          description: interaction.fields.getTextInputValue("description").trim(),
          discordCategoryId: null,
          staffRoleIds: [],
          priority,
          maxOpenPerUser: maxOpen,
          autoCloseMinutes: autoClose === 0 ? null : autoClose,
        });
        await interaction.reply({ content: `Categoría creada: **${category.name}**\nID: \`${category.id}\``, ephemeral: true });
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId.startsWith("ticket:close:")) {
        if (!interaction.guild) return;
        const ticketId = interaction.customId.slice("ticket:close:".length);
        const ticket = await getTicketById(interaction.guild.id, ticketId);
        if (!ticket) { await interaction.reply({ content: "No se encontró el ticket.", ephemeral: true }); return; }
        const member = interaction.member as GuildMember;
        const category = await getTicketCategory(interaction.guild.id, ticket.category_id);
        if (!category || (!isStaff(member, category.staff_role_ids) && interaction.user.id !== ticket.owner_id)) {
          await interaction.reply({ content: "No tienes permiso para cerrar este ticket.", ephemeral: true });
          return;
        }
        const reason = interaction.fields.getTextInputValue("reason").trim();
        if (interaction.channel?.type === ChannelType.GuildText) await createTicketTranscript(ticket.id, interaction.guild.id, interaction.channel);
        await transitionTicket({ guildId: interaction.guild.id, ticketId: ticket.id, fromStatuses: ["open", "claimed"], toStatus: "closed", closedBy: interaction.user.id, closeReason: reason || null });
        await ticketLog(interaction.guild, ticket.id, interaction.user.id, "closed", { reason: reason || null });
        if (interaction.channel?.type === ChannelType.GuildText) {
          await interaction.channel.permissionOverwrites.edit(ticket.owner_id, { SendMessages: false });
          await refreshTicketMessage(interaction.channel, ticket.id);
          await interaction.channel.send({ content: reason ? `El ticket ha sido cerrado. Motivo: **${reason}**` : "El ticket ha sido cerrado.", components: ratingMenu(ticket.id) });
          const settings = await getGuildSettings(interaction.guild.id);
          const archiveId = settings?.ticket_archive_category_id;
          const archive = archiveId ? interaction.guild.channels.cache.get(archiveId) : undefined;
          if (archive?.type === ChannelType.GuildCategory) {
            await interaction.channel.permissionOverwrites.edit(ticket.owner_id, { ViewChannel: false, SendMessages: false });
            await interaction.channel.setParent(archive.id, { lockPermissions: false });
            await updateTicket(interaction.guild.id, ticket.id, { archivedAt: new Date().toISOString() });
          }
        }
        await interaction.reply({ content: "Ticket cerrado correctamente.", ephemeral: true });
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith(TICKET_OPEN_PREFIX)) {
        if (!interaction.guild) return;
        const categoryId = interaction.customId.slice(TICKET_OPEN_PREFIX.length);
        const category = await getTicketCategory(interaction.guild.id, categoryId);
        if (!category?.enabled) { await interaction.reply({ content: "Esta categoría ya no está disponible.", ephemeral: true }); return; }
        if (await countOpenTicketsForUser(interaction.guild.id, interaction.user.id, category.id) >= category.max_open_per_user) {
          await interaction.reply({ content: "Ya alcanzaste el máximo de tickets abiertos para esta categoría.", ephemeral: true });
          return;
        }
        const parent = category.discord_category_id ? interaction.guild.channels.cache.get(category.discord_category_id) : undefined;
        const parentId = parent?.type === ChannelType.GuildCategory ? parent.id : undefined;
        const botMember = interaction.guild.members.me;
        if (!botMember?.permissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels])) {
          await interaction.reply({ content: "El bot necesita permisos para gestionar canales y tickets.", ephemeral: true });
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
            ...category.staff_role_ids.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
          ],
        });
        try {
          const ticket = await createTicketRecord({ guildId: interaction.guild.id, channelId: channel.id, ownerId: interaction.user.id, categoryId: category.id, priority: category.priority });
          await channel.send({ content: `<@${interaction.user.id}>`, embeds: [ticketEmbed({ display_number: ticket.display_number, status: ticket.status, priority: ticket.priority, ownerId: ticket.owner_id, categoryName: category.name, claimedBy: ticket.claimed_by })], components: ticketControls(ticket.id, ticket.status) });
          await sendGuildActionLog(interaction.guild, "ticket_action", "Ticket creado", `Se creó el ticket #${ticket.display_number ?? ticket.id}.`, [{ name: "Usuario", value: `<@${interaction.user.id}>`, inline: true }, { name: "Categoría", value: category.name, inline: true }]);
          await interaction.reply({ content: `Tu ticket fue creado: <#${channel.id}>`, ephemeral: true });
        } catch (error) {
          await channel.delete().catch(() => undefined);
          if (error instanceof Error && error.message === "TICKET_LIMIT_REACHED") await interaction.reply({ content: "Ya alcanzaste el máximo de tickets abiertos.", ephemeral: true });
          else throw error;
        }
        return;
      }

      if (interaction.isButton() && interaction.customId.startsWith("ticket:")) {
        const [, action, ticketId] = interaction.customId.split(":");
        if (!interaction.guild || !ticketId) return;
        const ticket = await getTicketById(interaction.guild.id, ticketId);
        if (!ticket) { await interaction.reply({ content: "No encontré este ticket.", ephemeral: true }); return; }
        const category = await getTicketCategory(interaction.guild.id, ticket.category_id);
        if (!category) { await interaction.reply({ content: "La categoría ya no existe.", ephemeral: true }); return; }
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const staff = isStaff(member, category.staff_role_ids);
        const owner = ticket.owner_id === interaction.user.id;

        if (action === "claim") {
          if (!staff) { await interaction.reply({ content: "Solo el personal autorizado puede tomar tickets.", ephemeral: true }); return; }
          if (ticket.status === "closed") { await interaction.reply({ content: "Este ticket está cerrado.", ephemeral: true }); return; }
          if (ticket.claimed_by && ticket.claimed_by !== interaction.user.id) { await interaction.reply({ content: `Este ticket ya está siendo atendido por <@${ticket.claimed_by}>.`, ephemeral: true }); return; }
          const claiming = ticket.claimed_by !== interaction.user.id;
          await transitionTicket({ guildId: interaction.guild.id, ticketId: ticket.id, fromStatuses: ["open", "claimed"], toStatus: claiming ? "claimed" : "open", claimedBy: claiming ? interaction.user.id : null, expectedClaimedBy: ticket.claimed_by });
          await ticketLog(interaction.guild, ticket.id, interaction.user.id, claiming ? "claimed" : "unclaimed");
          if (interaction.channel?.type === ChannelType.GuildText) await refreshTicketMessage(interaction.channel, ticket.id);
          await interaction.reply({ content: claiming ? "Has tomado el ticket." : "Has liberado el ticket.", ephemeral: true });
          return;
        }

        if (action === "close") {
          if (!staff && !owner) { await interaction.reply({ content: "No tienes permiso para cerrar este ticket.", ephemeral: true }); return; }
          if (ticket.status === "closed") { await interaction.reply({ content: "El ticket ya está cerrado.", ephemeral: true }); return; }
          const modal = new ModalBuilder().setCustomId(`ticket:close:${ticket.id}`).setTitle("Cerrar ticket");
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Motivo del cierre").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)));
          await interaction.showModal(modal);
          return;
        }

        if (action === "reopen") {
          if (!staff) { await interaction.reply({ content: "Solo el personal autorizado puede reabrir tickets.", ephemeral: true }); return; }
          if (ticket.status !== "closed") { await interaction.reply({ content: "Este ticket ya está abierto.", ephemeral: true }); return; }
          await transitionTicket({ guildId: interaction.guild.id, ticketId: ticket.id, fromStatuses: ["closed"], toStatus: "open" });
          await ticketLog(interaction.guild, ticket.id, interaction.user.id, "reopened");
          if (interaction.channel?.type === ChannelType.GuildText) {
            if (category.discord_category_id) {
              const original = interaction.guild.channels.cache.get(category.discord_category_id);
              if (original?.type === ChannelType.GuildCategory) await interaction.channel.setParent(original.id, { lockPermissions: false });
            }
            await interaction.channel.permissionOverwrites.edit(ticket.owner_id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
            await refreshTicketMessage(interaction.channel, ticket.id);
          }
          await interaction.reply({ content: "Ticket reabierto correctamente.", ephemeral: true });
          return;
        }

        if (action === "priority") {
          if (!staff || ticket.status === "closed") { await interaction.reply({ content: "No puedes cambiar la prioridad de este ticket.", ephemeral: true }); return; }
          await interaction.reply({ content: "Selecciona la nueva prioridad.", components: priorityMenu(ticket.id), ephemeral: true });
          return;
        }

        if (action === "members") {
          if (!staff || ticket.status === "closed") { await interaction.reply({ content: "No puedes gestionar usuarios en este ticket.", ephemeral: true }); return; }
          await interaction.reply({ content: "Gestiona los usuarios con acceso a este ticket.", components: memberMenus(ticket.id), ephemeral: true });
        }
        return;
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
          if (!isStaff(member, category.staff_role_ids) || ticket.status === "closed") { await interaction.reply({ content: "No tienes permiso para cambiar la prioridad.", ephemeral: true }); return; }
          const priority = interaction.values[0] as "low" | "normal" | "high" | "urgent";
          await updateTicket(interaction.guild.id, ticket.id, { priority });
          await ticketLog(interaction.guild, ticket.id, interaction.user.id, "priority_changed", { priority });
          if (interaction.channel?.type === ChannelType.GuildText) await refreshTicketMessage(interaction.channel, ticket.id);
          await interaction.update({ content: `Prioridad actualizada a **${PRIORITY_LABELS[priority]}**.`, components: [] });
          return;
        }
        if (action === "rating") {
          if (interaction.user.id !== ticket.owner_id || ticket.status !== "closed") { await interaction.reply({ content: "No puedes valorar este ticket.", ephemeral: true }); return; }
          if (await getTicketRating(interaction.guild.id, ticket.id)) { await interaction.update({ content: "Este ticket ya tiene una valoración.", components: [] }); return; }
          const rating = Number(interaction.values[0]);
          await createTicketRating({ ticketId: ticket.id, guildId: interaction.guild.id, userId: interaction.user.id, rating });
          await sendGuildActionLog(interaction.guild, "ticket_rating", "Valoración de ticket", `El ticket #${ticket.display_number ?? ticket.id} recibió **${rating}/5**.`, [{ name: "Usuario", value: `<@${interaction.user.id}>`, inline: true }]);
          await interaction.update({ content: "Gracias por tu valoración.", components: [] });
        }
        return;
      }

      if (interaction.isUserSelectMenu() && interaction.customId.startsWith("ticket:member:")) {
        const [, , mode, ticketId] = interaction.customId.split(":");
        if (!interaction.guild || !ticketId) return;
        const ticket = await getTicketById(interaction.guild.id, ticketId);
        if (!ticket || ticket.status === "closed" || interaction.channel?.type !== ChannelType.GuildText) { await interaction.reply({ content: "No puedes gestionar usuarios en este ticket.", ephemeral: true }); return; }
        const category = await getTicketCategory(interaction.guild.id, ticket.category_id);
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!category || !isStaff(member, category.staff_role_ids)) { await interaction.reply({ content: "No tienes permiso para gestionar usuarios.", ephemeral: true }); return; }
        const targetId = interaction.values[0];
        if (!targetId) { await interaction.reply({ content: "Debes seleccionar un usuario.", ephemeral: true }); return; }
        if (mode === "add") {
          const target = await interaction.guild.members.fetch(targetId).catch(() => null);
          if (!target || target.user.bot) { await interaction.reply({ content: "El usuario seleccionado no es válido.", ephemeral: true }); return; }
          await interaction.channel.permissionOverwrites.edit(targetId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
          await addTicketMember(interaction.guild.id, ticket.id, targetId);
          await ticketLog(interaction.guild, ticket.id, interaction.user.id, "member_added", { userId: targetId });
          await interaction.reply({ content: "Usuario añadido al ticket.", ephemeral: true });
        } else {
          if (targetId === ticket.owner_id) { await interaction.reply({ content: "No puedes retirar al creador del ticket.", ephemeral: true }); return; }
          await removeTicketMember(interaction.guild.id, ticket.id, targetId);
          await interaction.channel.permissionOverwrites.delete(targetId).catch(() => undefined);
          await ticketLog(interaction.guild, ticket.id, interaction.user.id, "member_removed", { userId: targetId });
          await interaction.reply({ content: "Usuario retirado del ticket.", ephemeral: true });
        }
      }
    } catch (error) {
      console.error("[INTERACTION ERROR]", error);
      if (interaction.isRepliable()) {
        const content = "Ocurrió un error procesando esta interacción.";
        if (interaction.replied || interaction.deferred) await interaction.followUp({ content, ephemeral: true }).catch(() => undefined);
        else await interaction.reply({ content, ephemeral: true }).catch(() => undefined);
      }
    }
  });
}
