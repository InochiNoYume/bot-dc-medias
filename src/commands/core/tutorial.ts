import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";

type TutorialSection = {
  title: string;
  description: string;
  fields: Array<{ name: string; value: string }>;
};

const sections: Record<"general" | "tickets" | "moderation", TutorialSection> = {
  general: {
    title: "Tutorial del bot",
    description: "Guía rápida para dejar el bot funcionando correctamente en este servidor.",
    fields: [
      { name: "1. Configuración inicial", value: "Usa `/setup` con permiso Administrar servidor. Esto registra el servidor y habilita la configuración de los módulos." },
      { name: "2. Tickets", value: "Primero crea una categoría con `/ticket categoria crear`. Debes vincular una categoría real de Discord y un rol de atención. Después publica el panel con `/ticket panel publicar`." },
      { name: "3. Moderación", value: "Configura las herramientas de moderación desde `/config` y utiliza los comandos de moderación cuando corresponda." },
      { name: "4. Registros", value: "Configura los canales de logs desde `/config` para registrar acciones importantes del servidor." },
      { name: "5. AutoMod", value: "Configura filtros, spam, menciones y protección desde los comandos de AutoMod." },
      { name: "6. Creadores", value: "Añade y administra feeds de YouTube, Twitch, Kick y TikTok desde los comandos de creadores." },
      { name: "Importante", value: "La mayoría de configuraciones requieren Administrar servidor. Si un módulo no funciona, revisa primero permisos del bot, categorías, canales y roles configurados." },
    ],
  },
  tickets: {
    title: "Tutorial de tickets",
    description: "Orden recomendado para configurar el sistema de tickets.",
    fields: [
      { name: "Paso 1", value: "Crea o elige una categoría de canales de Discord donde se crearán los tickets." },
      { name: "Paso 2", value: "Asegúrate de tener un rol para el equipo de atención." },
      { name: "Paso 3", value: "Ejecuta `/ticket categoria crear` y completa nombre, descripción, categoría de Discord, rol, prioridad, máximo de tickets y cierre automático." },
      { name: "Paso 4", value: "Publica el panel con `/ticket panel publicar` en un canal de texto." },
      { name: "Paso 5", value: "Prueba el botón del panel con una cuenta sin permisos de administración. El ticket debe aparecer dentro de la categoría configurada y solo ser visible para el usuario, el bot y el equipo de atención." },
      { name: "Mantenimiento", value: "Usa `/ticket categorias` para revisar IDs y configuración. Usa `/ticket categoria configurar` para modificar una categoría y `/ticket panel reparar` si el mensaje del panel fue eliminado." },
    ],
  },
  moderation: {
    title: "Tutorial de moderación",
    description: "Referencia rápida para el equipo de moderación.",
    fields: [
      { name: "Sanciones", value: "Usa los comandos de moderación disponibles para advertir, sancionar y consultar el historial de usuarios." },
      { name: "Buenas prácticas", value: "Comprueba el objetivo antes de sancionar, deja un motivo claro y evita sanciones sin contexto." },
      { name: "Permisos", value: "Los comandos sensibles comprueban los permisos de Discord y el alcance del servidor antes de ejecutarse." },
    ],
  },
};

export const data = new SlashCommandBuilder()
  .setName("tutorial")
  .setDescription("Muestra una guía para configurar y usar el bot.")
  .addStringOption((option) => option
    .setName("modulo")
    .setDescription("Parte del bot que quieres aprender a configurar.")
    .addChoices(
      { name: "General", value: "general" },
      { name: "Tickets", value: "tickets" },
      { name: "Moderación", value: "moderation" },
    ));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: "Este comando solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  const key = (interaction.options.getString("modulo") ?? "general") as keyof typeof sections;
  const section = sections[key];
  const embed = new EmbedBuilder()
    .setTitle(section.title)
    .setDescription(section.description)
    .addFields(section.fields)
    .setFooter({ text: "Usa /tutorial modulo:<opción> para consultar una sección concreta." })
    .setTimestamp();

  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    embed.addFields({ name: "Administrador", value: "Tienes acceso a las funciones de configuración. Empieza por `/setup` si todavía no has inicializado el servidor." });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
