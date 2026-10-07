import {
  AuditLogEvent,
  EmbedBuilder,
  type Client,
  type Guild,
  type GuildChannel,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type PartialMessage,
  type Role,
  type TextChannel,
} from "discord.js";
import { getGuildLogConfig } from "../../database/repositories/logRepository.js";

export const LOG_EVENTS = [
  "member_join", "member_leave", "member_update",
  "message_delete", "message_bulk_delete", "message_update",
  "channel_create", "channel_delete", "channel_update",
  "role_create", "role_delete", "role_update",
  "ban_add", "ban_remove", "guild_update",
  "thread_create", "thread_delete", "thread_update",
  "invite_create", "invite_delete", "webhook_update",
  "moderation_action", "ticket_action", "ticket_rating",
] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];

const EVENT_LABELS: Record<LogEvent, string> = {
  member_join: "Entradas", member_leave: "Salidas", member_update: "Miembros modificados",
  message_delete: "Mensajes eliminados", message_bulk_delete: "Mensajes eliminados en masa", message_update: "Mensajes editados",
  channel_create: "Canales creados", channel_delete: "Canales eliminados", channel_update: "Canales modificados",
  role_create: "Roles creados", role_delete: "Roles eliminados", role_update: "Roles modificados",
  ban_add: "Baneos", ban_remove: "Desbaneos", guild_update: "Servidor modificado",
  thread_create: "Hilos creados", thread_delete: "Hilos eliminados", thread_update: "Hilos modificados",
  invite_create: "Invitaciones creadas", invite_delete: "Invitaciones eliminadas", webhook_update: "Webhooks modificados",
  moderation_action: "Acciones de moderación", ticket_action: "Acciones de tickets", ticket_rating: "Valoraciones de tickets",
};

function truncate(value: string, max = 900): string {
  return value.length <= max ? value : value.slice(0, max - 3) + "...";
}

function formatUser(user: { id: string; tag?: string }): string {
  return "<@" + user.id + ">" + (user.tag ? " (" + user.tag + ")" : "");
}

async function getLogChannel(guild: Guild): Promise<TextChannel | null> {
  const config = await getGuildLogConfig(guild.id);
  if (!config?.channel_id || !config.enabled_events.length) return null;
  const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
  return channel as TextChannel;
}

async function getAuditExecutor(guild: Guild, type: AuditLogEvent, targetId?: string): Promise<{ id: string; tag?: string } | null> {
  try {
    const logs = await guild.fetchAuditLogs({ limit: 10, type });
    const now = Date.now();
    const entry = logs.entries.find((item) => {
      if (now - item.createdTimestamp > 15_000) return false;
      if (!targetId) return true;
      const target = item.target;
      return Boolean(target && "id" in target && target.id === targetId);
    });
    const executor = entry?.executor;
    if (!executor) return null;\n    return executor.tag ? { id: executor.id, tag: executor.tag } : { id: executor.id };
  } catch {
    return null;
  }
}

function addActor(embed: EmbedBuilder, actor: { id: string; tag?: string } | null): EmbedBuilder {
  if (!actor) return embed;
  return embed.addFields({ name: "Responsable", value: formatUser(actor), inline: true });
}

function diffField(label: string, before: string | number | boolean | null | undefined, after: string | number | boolean | null | undefined) {
  if (before === after) return null;
  return { name: label, value: "Antes: " + String(before ?? "N/A") + "\nAhora: " + String(after ?? "N/A"), inline: false };
}

export async function sendGuildLog(guild: Guild, event: LogEvent, embed: EmbedBuilder): Promise<void> {
  try {
    const config = await getGuildLogConfig(guild.id);
    if (!config?.channel_id || !config.enabled_events.includes(event)) return;
    const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
    await channel.send({ embeds: [embed.setFooter({ text: "Evento: " + event }).setTimestamp()] });
  } catch (error) {
    console.error("[LOG SERVICE]", error);
  }
}

export function logEventLabel(event: LogEvent): string { return EVENT_LABELS[event]; }

export async function sendGuildActionLog(guild: Guild, event: Extract<LogEvent, "moderation_action" | "ticket_action" | "ticket_rating">, title: string, description: string, fields: { name: string; value: string; inline?: boolean }[] = []): Promise<void> {
  await sendGuildLog(guild, event, new EmbedBuilder().setTitle(title).setDescription(description).addFields(fields));
}

export function registerLoggingEvents(client: Client): void {
  client.on("guildMemberAdd", async (member: GuildMember | PartialGuildMember) => {
    await sendGuildLog(member.guild, "member_join", new EmbedBuilder().setTitle("Miembro ingresó").setDescription(formatUser(member.user) + " ingresó al servidor.").addFields({ name: "ID", value: member.id, inline: true }));
  });

  client.on("guildMemberRemove", async (member: GuildMember | PartialGuildMember) => {
    const actor = await getAuditExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
    const embed = new EmbedBuilder().setTitle(actor ? "Miembro expulsado" : "Miembro salió").setDescription(formatUser(member.user) + (actor ? " fue expulsado del servidor." : " salió del servidor.")).addFields({ name: "ID", value: member.id, inline: true });
    addActor(embed, actor);
    await sendGuildLog(member.guild, "member_leave", embed);
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    const roleChanges = [
      ...newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id)).map((role) => "+ " + role.name),
      ...oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id)).map((role) => "- " + role.name),
    ];
    const fields = [
      diffField("Apodo", oldMember.nickname, newMember.nickname),
      diffField("Timeout", oldMember.communicationDisabledUntilTimestamp, newMember.communicationDisabledUntilTimestamp),
      roleChanges.length ? { name: "Roles modificados", value: truncate(roleChanges.join("\n")), inline: false } : null,
    ].filter((field): field is { name: string; value: string; inline: boolean } => field !== null);
    if (!fields.length) return;
    const actor = await getAuditExecutor(newMember.guild, roleChanges.length ? AuditLogEvent.MemberRoleUpdate : AuditLogEvent.MemberUpdate, newMember.id);
    const embed = new EmbedBuilder().setTitle("Miembro modificado").setDescription(formatUser(newMember.user) + " fue modificado.").addFields(fields);
    addActor(embed, actor);
    await sendGuildLog(newMember.guild, "member_update", embed);
  });

  client.on("messageDelete", async (message: Message | PartialMessage) => {
    if (!message.guild || message.author?.bot) return;
    const attachments = message.attachments?.size ? Array.from(message.attachments.values()).map((attachment) => attachment.url).join("\n") : null;
    const actor = message.author ? await getAuditExecutor(message.guild, AuditLogEvent.MessageDelete, message.author.id) : null;
    const embed = new EmbedBuilder().setTitle("Mensaje eliminado").setDescription("Mensaje eliminado en <#" + message.channelId + ">.").addFields(
      { name: "Autor", value: message.author ? formatUser(message.author) : "Desconocido", inline: true },
      { name: "Contenido", value: message.content ? truncate(message.content) : "Contenido no disponible.", inline: false },
      ...(attachments ? [{ name: "Adjuntos", value: truncate(attachments), inline: false }] : []),
    );
    addActor(embed, actor);
    await sendGuildLog(message.guild, "message_delete", embed);
  });

  client.on("messageDeleteBulk", async (messages) => {
    const first = messages.first();
    if (!first?.guild) return;
    const actor = await getAuditExecutor(first.guild, AuditLogEvent.MessageBulkDelete, first.channelId);
    const embed = new EmbedBuilder().setTitle("Mensajes eliminados en masa").setDescription("Se eliminaron **" + messages.size + "** mensajes en <#" + first.channelId + ">.").addFields({ name: "Cantidad", value: String(messages.size), inline: true });
    addActor(embed, actor);
    await sendGuildLog(first.guild, "message_bulk_delete", embed);
  });

  client.on("messageUpdate", async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
    if (!newMessage.guild || newMessage.author?.bot || oldMessage.content === newMessage.content) return;
    await sendGuildLog(newMessage.guild, "message_update", new EmbedBuilder().setTitle("Mensaje editado").setDescription("Mensaje editado en <#" + newMessage.channelId + ">.").addFields(
      { name: "Autor", value: newMessage.author ? formatUser(newMessage.author) : "Desconocido", inline: true },
      { name: "Antes", value: oldMessage.content ? truncate(oldMessage.content) : "Contenido no disponible.", inline: false },
      { name: "Después", value: newMessage.content ? truncate(newMessage.content) : "Contenido no disponible.", inline: false },
    ));
  });

  client.on("channelCreate", async (channel: GuildChannel) => {
    const actor = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelCreate, channel.id);
    const embed = new EmbedBuilder().setTitle("Canal creado").setDescription("Se creó <#" + channel.id + ">.").addFields({ name: "Tipo", value: channel.type.toString(), inline: true });
    addActor(embed, actor); await sendGuildLog(channel.guild, "channel_create", embed);
  });

  client.on("channelDelete", async (channel) => {
    if (!(("guild" in channel) && channel.guild)) return;
    const actor = await getAuditExecutor(channel.guild, AuditLogEvent.ChannelDelete, channel.id);
    const embed = new EmbedBuilder().setTitle("Canal eliminado").setDescription("Se eliminó el canal #" + channel.name + ".").addFields({ name: "ID", value: channel.id, inline: true });
    addActor(embed, actor); await sendGuildLog(channel.guild, "channel_delete", embed);
  });

  client.on("channelUpdate", async (oldChannel, newChannel) => {
    if (!(("guild" in oldChannel) && ("guild" in newChannel) && oldChannel.guild && newChannel.guild) || oldChannel.isDMBased() || newChannel.isDMBased()) return;
    const fields = [
      diffField("Nombre", oldChannel.name, newChannel.name),
      diffField("Categoría", oldChannel.parentId, newChannel.parentId),
      "topic" in oldChannel && "topic" in newChannel ? diffField("Tema", oldChannel.topic, newChannel.topic) : null,
      "rateLimitPerUser" in oldChannel && "rateLimitPerUser" in newChannel ? diffField("Slowmode", oldChannel.rateLimitPerUser, newChannel.rateLimitPerUser) : null,
      "nsfw" in oldChannel && "nsfw" in newChannel ? diffField("NSFW", oldChannel.nsfw, newChannel.nsfw) : null,
      "permissionOverwrites" in oldChannel && "permissionOverwrites" in newChannel && oldChannel.permissionOverwrites.cache.size !== newChannel.permissionOverwrites.cache.size ? { name: "Permisos", value: "Cambió la cantidad de sobrescrituras de permisos.", inline: false } : null,
    ].filter((field): field is { name: string; value: string; inline: boolean } => field !== null);
    if (!fields.length) return;
    const actor = await getAuditExecutor(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);
    const embed = new EmbedBuilder().setTitle("Canal modificado").setDescription("Se modificó <#" + newChannel.id + ">.").addFields(fields);
    addActor(embed, actor); await sendGuildLog(newChannel.guild, "channel_update", embed);
  });

  client.on("roleCreate", async (role: Role) => {
    const actor = await getAuditExecutor(role.guild, AuditLogEvent.RoleCreate, role.id);
    const embed = new EmbedBuilder().setTitle("Rol creado").setDescription("Se creó el rol <@&" + role.id + ">.");
    addActor(embed, actor); await sendGuildLog(role.guild, "role_create", embed);
  });

  client.on("roleDelete", async (role: Role) => {
    const actor = await getAuditExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    const embed = new EmbedBuilder().setTitle("Rol eliminado").setDescription("Se eliminó el rol " + role.name + ".").addFields({ name: "ID", value: role.id, inline: true });
    addActor(embed, actor); await sendGuildLog(role.guild, "role_delete", embed);
  });

  client.on("roleUpdate", async (oldRole: Role, newRole: Role) => {
    const fields = [
      diffField("Nombre", oldRole.name, newRole.name), diffField("Posición", oldRole.position, newRole.position),
      diffField("Color", oldRole.color, newRole.color), diffField("Visible por separado", oldRole.hoist, newRole.hoist),
      diffField("Mencionable", oldRole.mentionable, newRole.mentionable),
      oldRole.permissions.bitfield !== newRole.permissions.bitfield ? { name: "Permisos", value: "Los permisos del rol cambiaron.", inline: false } : null,
    ].filter((field): field is { name: string; value: string; inline: boolean } => field !== null);
    if (!fields.length) return;
    const actor = await getAuditExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
    const embed = new EmbedBuilder().setTitle("Rol modificado").setDescription("Se modificó el rol <@&" + newRole.id + ">.").addFields(fields);
    addActor(embed, actor); await sendGuildLog(newRole.guild, "role_update", embed);
  });

  client.on("guildBanAdd", async (ban) => {
    const actor = await getAuditExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    const embed = new EmbedBuilder().setTitle("Usuario baneado").setDescription(formatUser(ban.user) + " fue baneado.").addFields({ name: "ID", value: ban.user.id, inline: true });
    addActor(embed, actor); await sendGuildLog(ban.guild, "ban_add", embed);
  });

  client.on("guildBanRemove", async (ban) => {
    const actor = await getAuditExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
    const embed = new EmbedBuilder().setTitle("Usuario desbaneado").setDescription(formatUser(ban.user) + " fue desbaneado.").addFields({ name: "ID", value: ban.user.id, inline: true });
    addActor(embed, actor); await sendGuildLog(ban.guild, "ban_remove", embed);
  });

  client.on("guildUpdate", async (oldGuild, newGuild) => {
    const fields = [
      diffField("Nombre", oldGuild.name, newGuild.name),
      diffField("Nivel de verificación", oldGuild.verificationLevel, newGuild.verificationLevel),
      diffField("Canal AFK", oldGuild.afkChannelId, newGuild.afkChannelId),
      diffField("Canal de reglas", oldGuild.rulesChannelId, newGuild.rulesChannelId),
      diffField("Canal de actualizaciones", oldGuild.publicUpdatesChannelId, newGuild.publicUpdatesChannelId),
    ].filter((field): field is { name: string; value: string; inline: boolean } => field !== null);
    if (!fields.length) return;
    const actor = await getAuditExecutor(newGuild, AuditLogEvent.GuildUpdate, newGuild.id);
    const embed = new EmbedBuilder().setTitle("Servidor modificado").setDescription("Se modificó la configuración del servidor.").addFields(fields);
    addActor(embed, actor); await sendGuildLog(newGuild, "guild_update", embed);
  });

  client.on("threadCreate", async (thread) => {
    const actor = await getAuditExecutor(thread.guild, AuditLogEvent.ThreadCreate, thread.id);
    const embed = new EmbedBuilder().setTitle("Hilo creado").setDescription("Se creó el hilo <#" + thread.id + ">.").addFields({ name: "Nombre", value: thread.name, inline: true });
    addActor(embed, actor); await sendGuildLog(thread.guild, "thread_create", embed);
  });

  client.on("threadDelete", async (thread) => {
    const actor = await getAuditExecutor(thread.guild, AuditLogEvent.ThreadDelete, thread.id);
    const embed = new EmbedBuilder().setTitle("Hilo eliminado").setDescription("Se eliminó el hilo **" + thread.name + "**.").addFields({ name: "ID", value: thread.id, inline: true });
    addActor(embed, actor); await sendGuildLog(thread.guild, "thread_delete", embed);
  });

  client.on("threadUpdate", async (oldThread, newThread) => {
    const fields = [
      diffField("Nombre", oldThread.name, newThread.name), diffField("Archivado", oldThread.archived, newThread.archived),
      diffField("Bloqueado", oldThread.locked, newThread.locked), diffField("Slowmode", oldThread.rateLimitPerUser, newThread.rateLimitPerUser),
    ].filter((field): field is { name: string; value: string; inline: boolean } => field !== null);
    if (!fields.length) return;
    const actor = await getAuditExecutor(newThread.guild, AuditLogEvent.ThreadUpdate, newThread.id);
    const embed = new EmbedBuilder().setTitle("Hilo modificado").setDescription("Se modificó el hilo <#" + newThread.id + ">.").addFields(fields);
    addActor(embed, actor); await sendGuildLog(newThread.guild, "thread_update", embed);
  });

  client.on("inviteCreate", async (invite) => {
    if (!invite.guild) return;
    const actor = await getAuditExecutor(invite.guild, AuditLogEvent.InviteCreate, invite.code);
    const embed = new EmbedBuilder().setTitle("Invitación creada").setDescription("Se creó una invitación" + (invite.code ? " `" + invite.code + "`." : "."));
    addActor(embed, actor); await sendGuildLog(invite.guild, "invite_create", embed);
  });

  client.on("inviteDelete", async (invite) => {
    if (!invite.guild) return;
    const actor = await getAuditExecutor(invite.guild, AuditLogEvent.InviteDelete, invite.code);
    const embed = new EmbedBuilder().setTitle("Invitación eliminada").setDescription("Se eliminó la invitación" + (invite.code ? " `" + invite.code + "`." : "."));
    addActor(embed, actor); await sendGuildLog(invite.guild, "invite_delete", embed);
  });

  client.on("webhookUpdate", async (channel) => {
    if (!channel.guild) return;
    const actor = await getAuditExecutor(channel.guild, AuditLogEvent.WebhookUpdate, channel.id);
    const embed = new EmbedBuilder().setTitle("Webhook modificado").setDescription("Se detectó un cambio de webhook en <#" + channel.id + ">.");
    addActor(embed, actor); await sendGuildLog(channel.guild, "webhook_update", embed);
  });
}