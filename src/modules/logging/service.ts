import { EmbedBuilder, type Client, type Guild, type GuildChannel, type Message, type Role, type GuildMember, type PartialMessage, type TextChannel } from "discord.js";
import { getGuildLogConfig } from "../../database/repositories/logRepository.js";

export const LOG_EVENTS = [
  "member_join",
  "member_leave",
  "message_delete",
  "message_update",
  "channel_create",
  "channel_delete",
  "channel_update",
  "role_create",
  "role_delete",
  "role_update",
  "ban_add",
  "ban_remove",
] as const;

export type LogEvent = (typeof LOG_EVENTS)[number];

const EVENT_LABELS: Record<LogEvent, string> = {
  member_join: "Entradas",
  member_leave: "Salidas",
  message_delete: "Mensajes eliminados",
  message_update: "Mensajes editados",
  channel_create: "Canales creados",
  channel_delete: "Canales eliminados",
  channel_update: "Canales modificados",
  role_create: "Roles creados",
  role_delete: "Roles eliminados",
  role_update: "Roles modificados",
  ban_add: "Baneos",
  ban_remove: "Desbaneos",
};

function truncate(value: string, max = 900): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 3) + "...";
}

async function getLogChannel(guild: Guild): Promise<TextChannel | null> {
  const config = await getGuildLogConfig(guild.id);
  if (!config?.channel_id || !config.enabled_events.length) return null;
  const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return null;
  return channel as TextChannel;
}

export async function sendGuildLog(
  guild: Guild,
  event: LogEvent,
  embed: EmbedBuilder,
): Promise<void> {
  try {
    const config = await getGuildLogConfig(guild.id);
    if (!config?.channel_id || !config.enabled_events.includes(event)) return;
    const channel = await guild.channels.fetch(config.channel_id).catch(() => null);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
    await channel.send({ embeds: [embed.setFooter({ text: `Evento: ${event}` }).setTimestamp()] });
  } catch (error) {
    console.error("[LOG SERVICE]", error);
  }
}

export function logEventLabel(event: LogEvent): string {
  return EVENT_LABELS[event];
}

export function registerLoggingEvents(client: Client): void {
  client.on("guildMemberAdd", async (member: GuildMember) => {
    await sendGuildLog(member.guild, "member_join", new EmbedBuilder()
      .setTitle("Miembro ingresó")
      .setDescription(`<@${member.id}> (${member.user.tag}) ingresó al servidor.`)
      .addFields({ name: "Usuario", value: `<@${member.id}>\n` + `${member.id}`, inline: true }));
  });

  client.on("guildMemberRemove", async (member: GuildMember) => {
    await sendGuildLog(member.guild, "member_leave", new EmbedBuilder()
      .setTitle("Miembro salió")
      .setDescription(`<@${member.id}> (${member.user.tag}) salió del servidor.`)
      .addFields({ name: "Usuario", value: `${member.user.tag}\n${member.id}`, inline: true }));
  });

  client.on("messageDelete", async (message: Message | PartialMessage) => {
    if (!message.guild || message.author?.bot) return;
    const content = message.content ? truncate(message.content) : "Contenido no disponible.";
    await sendGuildLog(message.guild, "message_delete", new EmbedBuilder()
      .setTitle("Mensaje eliminado")
      .setDescription(`Mensaje eliminado en <#${message.channelId}>.`)
      .addFields(
        { name: "Autor", value: message.author ? `<@${message.author.id}>` : "Desconocido", inline: true },
        { name: "Contenido", value: content, inline: false },
      ));
  });

  client.on("messageUpdate", async (oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage) => {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    const before = oldMessage.content ? truncate(oldMessage.content) : "Contenido no disponible.";
    const after = newMessage.content ? truncate(newMessage.content) : "Contenido no disponible.";
    await sendGuildLog(newMessage.guild, "message_update", new EmbedBuilder()
      .setTitle("Mensaje editado")
      .setDescription(`Mensaje editado en <#${newMessage.channelId}>.`)
      .addFields(
        { name: "Autor", value: newMessage.author ? `<@${newMessage.author.id}>` : "Desconocido", inline: true },
        { name: "Antes", value: before, inline: false },
        { name: "Después", value: after, inline: false },
      ));
  });

  client.on("channelCreate", async (channel: GuildChannel) => {
    await sendGuildLog(channel.guild, "channel_create", new EmbedBuilder()
      .setTitle("Canal creado")
      .setDescription(`Se creó <#${channel.id}>.`)
      .addFields({ name: "Tipo", value: channel.type.toString(), inline: true }));
  });

  client.on("channelDelete", async (channel: GuildChannel) => {
    await sendGuildLog(channel.guild, "channel_delete", new EmbedBuilder()
      .setTitle("Canal eliminado")
      .setDescription(`Se eliminó el canal #${channel.name}.`)
      .addFields({ name: "ID", value: channel.id, inline: true }));
  });

  client.on("channelUpdate", async (oldChannel: GuildChannel, newChannel: GuildChannel) => {
    if (oldChannel.name === newChannel.name && oldChannel.parentId === newChannel.parentId) return;
    await sendGuildLog(newChannel.guild, "channel_update", new EmbedBuilder()
      .setTitle("Canal modificado")
      .setDescription(`Se modificó <#${newChannel.id}>.`)
      .addFields(
        { name: "Nombre anterior", value: oldChannel.name, inline: true },
        { name: "Nombre actual", value: newChannel.name, inline: true },
      ));
  });

  client.on("roleCreate", async (role: Role) => {
    await sendGuildLog(role.guild, "role_create", new EmbedBuilder()
      .setTitle("Rol creado")
      .setDescription(`Se creó el rol <@&${role.id}>.`));
  });

  client.on("roleDelete", async (role: Role) => {
    await sendGuildLog(role.guild, "role_delete", new EmbedBuilder()
      .setTitle("Rol eliminado")
      .setDescription(`Se eliminó el rol ${role.name}.`)
      .addFields({ name: "ID", value: role.id, inline: true }));
  });

  client.on("roleUpdate", async (oldRole: Role, newRole: Role) => {
    if (oldRole.name === newRole.name && oldRole.position === newRole.position && oldRole.permissions.bitfield === newRole.permissions.bitfield) return;
    await sendGuildLog(newRole.guild, "role_update", new EmbedBuilder()
      .setTitle("Rol modificado")
      .setDescription(`Se modificó el rol <@&${newRole.id}>.`)
      .addFields(
        { name: "Nombre anterior", value: oldRole.name, inline: true },
        { name: "Nombre actual", value: newRole.name, inline: true },
      ));
  });

  client.on("guildBanAdd", async (ban) => {
    await sendGuildLog(ban.guild, "ban_add", new EmbedBuilder()
      .setTitle("Usuario baneado")
      .setDescription(`<@${ban.user.id}> fue baneado.`)
      .addFields({ name: "Usuario", value: `${ban.user.tag}\n${ban.user.id}`, inline: true }));
  });

  client.on("guildBanRemove", async (ban) => {
    await sendGuildLog(ban.guild, "ban_remove", new EmbedBuilder()
      .setTitle("Usuario desbaneado")
      .setDescription(`<@${ban.user.id}> fue desbaneado.`)
      .addFields({ name: "Usuario", value: `${ban.user.tag}\n${ban.user.id}`, inline: true }));
  });
}
