import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember, type TextChannel } from "discord.js";
import { getModerationCase, listModerationCases, createModerationNote, listModerationNotes, getModerationChannelLock, setModerationChannelLock, deleteModerationChannelLock } from "../../modules/moderation/repository.js";
import { executeModerationAction, hasModerationPermission } from "../../modules/moderation/service.js";
import { sendGuildActionLog } from "../../modules/logging/service.js";

const ACTIONS = ["warn", "timeout", "kick", "ban", "unban"] as const;

export const data = new SlashCommandBuilder()
  .setName("mod").setDescription("Herramientas de moderación.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString())
  .addSubcommand((s) => s.setName("warn").setDescription("Advierte a un usuario.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo.").setMaxLength(500)))
  .addSubcommand((s) => s.setName("timeout").setDescription("Aplica timeout.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true))
    .addIntegerOption((o) => o.setName("minutos").setDescription("Duración en minutos.").setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo.").setMaxLength(500)))
  .addSubcommand((s) => s.setName("kick").setDescription("Expulsa a un usuario.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo.").setMaxLength(500)))
  .addSubcommand((s) => s.setName("ban").setDescription("Bloquea a un usuario.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo.").setMaxLength(500)))
  .addSubcommand((s) => s.setName("unban").setDescription("Retira el bloqueo a un usuario.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true))
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo.").setMaxLength(500)))
  .addSubcommand((s) => s.setName("historial").setDescription("Muestra el historial de moderación.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true)))
  .addSubcommand((s) => s.setName("caso").setDescription("Muestra un caso.")
    .addIntegerOption((o) => o.setName("numero").setDescription("Número del caso.").setRequired(true).setMinValue(1)))
  .addSubcommand((s) => s.setName("nota").setDescription("Añade una nota interna.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true))
    .addStringOption((o) => o.setName("texto").setDescription("Nota interna.").setRequired(true).setMaxLength(1000)))
  .addSubcommand((s) => s.setName("notas").setDescription("Muestra notas internas.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true)))
  .addSubcommand((s) => s.setName("limpiar").setDescription("Elimina mensajes recientes del canal.")
    .addIntegerOption((o) => o.setName("cantidad").setDescription("Cantidad de mensajes.").setRequired(true).setMinValue(1).setMaxValue(100)))
  .addSubcommand((s) => s.setName("slowmode").setDescription("Configura el modo lento del canal.")
    .addIntegerOption((o) => o.setName("segundos").setDescription("Segundos entre mensajes.").setRequired(true).setMinValue(0).setMaxValue(21600)))
  .addSubcommand((s) => s.setName("bloquear").setDescription("Bloquea temporalmente el canal.")
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo.").setMaxLength(500)))
  .addSubcommand((s) => s.setName("desbloquear").setDescription("Desbloquea el canal.")
    .addStringOption((o) => o.setName("motivo").setDescription("Motivo.").setMaxLength(500)))
  .addSubcommand((s) => s.setName("nick").setDescription("Cambia el apodo de un usuario.")
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true))
    .addStringOption((o) => o.setName("nombre").setDescription("Nuevo apodo. Vacío para restaurar.").setMaxLength(32)));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (!hasModerationPermission(member)) {
    await interaction.reply({ content: "Necesitas permisos de moderación.", ephemeral: true });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (["limpiar", "slowmode", "bloquear", "desbloquear", "nick"].includes(subcommand)) {
    const requiredPermission = subcommand === "limpiar"
      ? PermissionFlagsBits.ManageMessages
      : subcommand === "nick"
        ? PermissionFlagsBits.ManageNicknames
        : PermissionFlagsBits.ManageChannels;
    if (!member.permissions.has(requiredPermission) && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "No tienes el permiso necesario para esta acción.", ephemeral: true });
      return;
    }
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.reply({ content: "Este comando requiere un canal de texto del servidor.", ephemeral: true });
      return;
    }

    if (subcommand === "limpiar") {
      if (!("bulkDelete" in channel)) {
        await interaction.reply({ content: "Este canal no permite limpieza masiva.", ephemeral: true });
        return;
      }
      const cantidad = interaction.options.getInteger("cantidad", true);
      const deleted = await (channel as TextChannel).bulkDelete(cantidad, true);
      await sendGuildActionLog(interaction.guild, "moderation_action", "Mensajes eliminados", "<@" + interaction.user.id + "> eliminó **" + deleted.size + "** mensajes en <#" + channel.id + ">.", [
        { name: "Solicitados", value: String(cantidad), inline: true },
        { name: "Eliminados", value: String(deleted.size), inline: true },
      ]);
      await interaction.reply({ content: "Se eliminaron **" + deleted.size + "** mensajes.", ephemeral: true });
      return;
    }

    if (subcommand === "slowmode") {
      if (!("setRateLimitPerUser" in channel)) {
        await interaction.reply({ content: "Este canal no admite modo lento.", ephemeral: true });
        return;
      }
      const seconds = interaction.options.getInteger("segundos", true);
      await (channel as TextChannel).setRateLimitPerUser(seconds);
      await sendGuildActionLog(interaction.guild, "moderation_action", "Slowmode actualizado", "<@" + interaction.user.id + "> configuró el modo lento de <#" + channel.id + "> en **" + seconds + " s**.");
      await interaction.reply({ content: seconds === 0 ? "Modo lento desactivado." : "Modo lento configurado en **" + seconds + " s**.", ephemeral: true });
      return;
    }

    if (subcommand === "bloquear" || subcommand === "desbloquear") {
      const locked = subcommand === "bloquear";
      const reason = interaction.options.getString("motivo")?.trim() || "Moderación de canal.";
      const textChannel = channel as TextChannel;
      const existingLock = await getModerationChannelLock(interaction.guild.id, textChannel.id);
      if (locked) {
        if (existingLock) {
          await interaction.reply({ content: "Este canal ya está bloqueado.", ephemeral: true });
          return;
        }
        const everyoneOverwrite = textChannel.permissionOverwrites.cache.get(interaction.guild.roles.everyone.id);
        const previousSendMessages = everyoneOverwrite
          ? everyoneOverwrite.deny.has(PermissionFlagsBits.SendMessages)
            ? false
            : everyoneOverwrite.allow.has(PermissionFlagsBits.SendMessages)
              ? true
              : null
          : null;
        await setModerationChannelLock({
          guildId: interaction.guild.id,
          channelId: textChannel.id,
          lockedBy: interaction.user.id,
          previousSendMessages,
          reason,
        });
        try {
          await textChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason });
        } catch (error) {
          await deleteModerationChannelLock(interaction.guild.id, textChannel.id).catch(() => undefined);
          throw error;
        }
        await sendGuildActionLog(interaction.guild, "moderation_action", "Canal bloqueado", "<@" + interaction.user.id + "> bloqueó <#" + textChannel.id + "> para @everyone.", [{ name: "Motivo", value: reason }]);
        await interaction.reply({ content: "Canal bloqueado para @everyone.", ephemeral: true });
      } else {
        if (!existingLock) {
          await interaction.reply({ content: "Este canal no está bloqueado por el sistema de moderación.", ephemeral: true });
          return;
        }
        await textChannel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: existingLock.previous_send_messages }, { reason });
        await deleteModerationChannelLock(interaction.guild.id, textChannel.id);
        await sendGuildActionLog(interaction.guild, "moderation_action", "Canal desbloqueado", "<@" + interaction.user.id + "> desbloqueó <#" + textChannel.id + "> y restauró la configuración anterior.", [{ name: "Motivo", value: reason }]);
        await interaction.reply({ content: "Canal desbloqueado y configuración anterior restaurada.", ephemeral: true });
      }
      return;
    }

    const target = interaction.options.getUser("usuario", true);
    const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!targetMember) {
      await interaction.reply({ content: "No encontré al usuario dentro del servidor.", ephemeral: true });
      return;
    }
    const bot = interaction.guild.members.me;
    if (!bot) {
      await interaction.reply({ content: "No pude identificar al bot en el servidor.", ephemeral: true });
      return;
    }
    if (targetMember.id === interaction.user.id) {
      await interaction.reply({ content: "No puedes cambiar tu propio apodo con este comando.", ephemeral: true });
      return;
    }
    if (targetMember.id === interaction.guild.ownerId) {
      await interaction.reply({ content: "No puedes cambiar el apodo del propietario del servidor.", ephemeral: true });
      return;
    }
    if (targetMember.roles.highest.position >= bot.roles.highest.position) {
      await interaction.reply({ content: "Mi rol debe estar por encima del usuario.", ephemeral: true });
      return;
    }
    if (targetMember.roles.highest.position >= member.roles.highest.position && member.id !== interaction.guild.ownerId) {
      await interaction.reply({ content: "Tu rol debe estar por encima del usuario.", ephemeral: true });
      return;
    }
    if (!bot.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      await interaction.reply({ content: "El bot necesita Gestionar apodos para realizar esta acción.", ephemeral: true });
      return;
    }
    const name = interaction.options.getString("nombre")?.trim() || null;
    await targetMember.setNickname(name, "Moderación");
    await sendGuildActionLog(interaction.guild, "moderation_action", "Apodo actualizado", "<@" + interaction.user.id + "> " + (name ? "cambió" : "restauró") + " el apodo de <@" + targetMember.id + ">.", [{ name: "Nuevo apodo", value: name ?? "Predeterminado", inline: true }]);
    await interaction.reply({ content: name ? "Apodo actualizado correctamente." : "Apodo restaurado correctamente.", ephemeral: true });
    return;
  }
  if (subcommand === "historial") {
    const user = interaction.options.getUser("usuario", true);
    const cases = await listModerationCases(interaction.guild.id, user.id);
    const description = cases.length
      ? cases.map((c) => "Caso #" + c.case_number + " · " + c.action + " · " + c.status + " · <t:" + Math.floor(new Date(c.created_at).getTime() / 1000) + ":R>\n" + c.reason).join("\n\n")
      : "No hay casos registrados.";
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Historial de " + user.username).setDescription(description)], ephemeral: true });
    return;
  }

  if (subcommand === "caso") {
    const number = interaction.options.getInteger("numero", true);
    const record = await getModerationCase(interaction.guild.id, number);
    if (!record) {
      await interaction.reply({ content: "No existe ese caso en este servidor.", ephemeral: true });
      return;
    }
    const embed = new EmbedBuilder().setTitle("Caso #" + record.case_number).addFields(
      { name: "Acción", value: record.action, inline: true },
      { name: "Estado", value: record.status, inline: true },
      { name: "Objetivo", value: "<@" + record.target_id + ">", inline: true },
      { name: "Moderador", value: "<@" + record.moderator_id + ">", inline: true },
      { name: "Motivo", value: record.reason.slice(0, 1024) },
    );
    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (subcommand === "nota" || subcommand === "notas") {
    const user = interaction.options.getUser("usuario", true);
    if (subcommand === "nota") {
      const note = interaction.options.getString("texto", true);
      await createModerationNote({ guildId: interaction.guild.id, userId: user.id, staffId: interaction.user.id, note });
      await interaction.reply({ content: "Nota interna guardada.", ephemeral: true });
      return;
    }
    const notes = await listModerationNotes(interaction.guild.id, user.id);
    const description = notes.length
      ? notes.map((n) => "<t:" + Math.floor(new Date(n.created_at).getTime() / 1000) + ":R> · <@" + n.staff_id + ">\n" + n.note).join("\n\n")
      : "No hay notas internas.";
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle("Notas de " + user.username).setDescription(description)], ephemeral: true });
    return;
  }

  if (!ACTIONS.includes(subcommand as typeof ACTIONS[number])) {
    await interaction.reply({ content: "Subcomando no reconocido.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("usuario", true);
  const reason = interaction.options.getString("motivo")?.trim() || "Sin motivo especificado.";
  const bot = interaction.guild.members.me;
  if (!bot) {
    await interaction.reply({ content: "No pude identificar al bot en el servidor.", ephemeral: true });
    return;
  }

  const targetMember: GuildMember | null = subcommand === "unban"
    ? null
    : await interaction.guild.members.fetch(target.id).catch(() => null);
  const durationMinutes = subcommand === "timeout" ? interaction.options.getInteger("minutos", true) : undefined;
  const caseNumber = await executeModerationAction({
    action: subcommand as typeof ACTIONS[number],
    targetUser: target,
    targetMember,
    moderator: member,
    bot,
    reason,
    durationSeconds: durationMinutes ? durationMinutes * 60 : undefined,
  });
  await interaction.reply({ content: "Acción " + subcommand + " aplicada correctamente. Caso #" + caseNumber + ".", ephemeral: true });
}
