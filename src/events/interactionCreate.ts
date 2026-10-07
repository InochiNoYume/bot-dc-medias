import type { Client, Interaction } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { commands } from "../commands/index.js";
import { createTicketCategory } from "../modules/tickets/repository.js";

const commandMap = new Map(commands.map(command => [command.data.name, command]));

export function registerInteractionEvent(client: Client): void {
  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commandMap.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction);
        return;
      }

      if (interaction.isModalSubmit() && interaction.customId === "ticket:category:create") {
        if (!interaction.guild) return;
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
          await interaction.reply({ content: "Necesitas el permiso Administrar servidor.", ephemeral: true }); return;
        }
        const name = interaction.fields.getTextInputValue("name").trim();
        const description = interaction.fields.getTextInputValue("description").trim();
        const priority = interaction.fields.getTextInputValue("priority").trim().toLowerCase();
        const maxOpen = Number(interaction.fields.getTextInputValue("maxOpen").trim());
        if (!["low", "normal", "high", "urgent"].includes(priority)) {
          await interaction.reply({ content: "La prioridad indicada no es válida.", ephemeral: true }); return;
        }
        if (!Number.isInteger(maxOpen) || maxOpen < 1 || maxOpen > 20) {
          await interaction.reply({ content: "El máximo debe estar entre 1 y 20.", ephemeral: true }); return;
        }
        const category = await createTicketCategory({
          guildId: interaction.guild.id, name, description, discordCategoryId: null,
          staffRoleIds: [], priority, maxOpenPerUser: maxOpen, autoCloseMinutes: null,
        });
        await interaction.reply({ content: "Categoría creada: **" + category.name + "**\nID: `" + category.id + "`", ephemeral: true });
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
