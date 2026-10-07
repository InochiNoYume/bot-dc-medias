import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { ensureGuild, setSetupCompleted } from "../../database/repositories/guildRepository.js";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Inicia la configuración del bot en este servidor.");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  if (!interaction.memberPermissions?.has("ManageGuild")) {
    await interaction.reply({ content: "Necesitas el permiso Gestionar servidor para utilizar este comando.", ephemeral: true });
    return;
  }

  await ensureGuild(interaction.guild.id, interaction.guild.name);
  await setSetupCompleted(interaction.guild.id, true);

  const embed = new EmbedBuilder()
    .setTitle("Configuración inicial")
    .setDescription("La configuración base de este servidor quedó registrada. Los módulos podrán configurarse individualmente desde Discord.")
    .addFields(
      { name: "Servidor", value: interaction.guild.name, inline: true },
      { name: "Estado", value: "Configurado", inline: true },
    )
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("setup:modules")
      .setLabel("Ver módulos")
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}