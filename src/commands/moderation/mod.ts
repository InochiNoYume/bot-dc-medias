import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction, type GuildMember } from "discord.js";
import { getModerationCase, listModerationCases, createModerationNote, listModerationNotes } from "../../modules/moderation/repository.js";
import { executeModerationAction, hasModerationPermission } from "../../modules/moderation/service.js";

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
    .addUserOption((o) => o.setName("usuario").setDescription("Usuario objetivo.").setRequired(true)));

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
