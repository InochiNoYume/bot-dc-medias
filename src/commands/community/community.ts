import { PermissionFlagsBits, PollLayoutType, PollBuilder, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("comunidad")
  .setDescription("Herramientas de participación de la comunidad.")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("encuesta")
      .setDescription("Publica una encuesta nativa de Discord.")
      .addStringOption((option) => option.setName("pregunta").setDescription("Pregunta de la encuesta").setRequired(true).setMaxLength(300))
      .addStringOption((option) => option.setName("opcion1").setDescription("Primera opción").setRequired(true).setMaxLength(55))
      .addStringOption((option) => option.setName("opcion2").setDescription("Segunda opción").setRequired(true).setMaxLength(55))
      .addStringOption((option) => option.setName("opcion3").setDescription("Tercera opción").setMaxLength(55))
      .addStringOption((option) => option.setName("opcion4").setDescription("Cuarta opción").setMaxLength(55))
      .addStringOption((option) => option.setName("opcion5").setDescription("Quinta opción").setMaxLength(55))
      .addIntegerOption((option) => option.setName("duracion").setDescription("Duración en horas (1-168)").setMinValue(1).setMaxValue(168))
      .addBooleanOption((option) => option.setName("multiple").setDescription("Permitir seleccionar varias opciones")),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("anuncio")
      .setDescription("Publica un anuncio de comunidad.")
      .addStringOption((option) => option.setName("titulo").setDescription("Título del anuncio").setRequired(true).setMaxLength(100))
      .addStringOption((option) => option.setName("mensaje").setDescription("Contenido del anuncio").setRequired(true).setMaxLength(2000)),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  if (interaction.options.getSubcommand() === "encuesta") {
    const answers = [1, 2, 3, 4, 5]
      .map((index) => interaction.options.getString(`opcion${index}`)?.trim())
      .filter((value): value is string => Boolean(value));

    const poll = new PollBuilder()
      .setQuestion({ text: interaction.options.getString("pregunta", true).trim() })
      .setAnswers(answers.map((text) => ({ text })))
      .setDuration(interaction.options.getInteger("duracion") ?? 24)
      .setAllowMultiselect(interaction.options.getBoolean("multiple") ?? false)
      .setLayout(PollLayoutType.Default);

    await interaction.reply({ poll: poll.toJSON() });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Necesitas el permiso Gestionar servidor.", ephemeral: true });
    return;
  }

  const title = interaction.options.getString("titulo", true).trim();
  const message = interaction.options.getString("mensaje", true).trim();
  await interaction.reply({
    embeds: [{ title, description: message, footer: { text: "Anuncio de comunidad" }, timestamp: new Date().toISOString() }],
  });
}
