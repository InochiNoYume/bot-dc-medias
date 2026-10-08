import {
  REST,
  Routes,
  type RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import { env } from "../config/env.js";
import { commands } from "../commands/index.js";

export async function registerCommands(): Promise<void> {
  const payload = commands.map((command) =>
    command.data.toJSON(),
  ) as RESTPostAPIChatInputApplicationCommandsJSONBody[];

  const rest = new REST({ version: "10" }).setToken(env.discordToken);

  await rest.put(
    Routes.applicationCommands(env.discordClientId),
    { body: payload },
  );

  // Remove legacy guild-scoped registrations created by older versions.
  // The bot now uses global commands only, so the DEV guild must not keep
  // a second copy of the same command definitions.
  await rest.put(
    Routes.applicationGuildCommands(env.discordClientId, env.devGuildId),
    { body: [] },
  );

  console.log(`[COMMANDS] ${payload.length} comando(s) registrados globalmente; comandos DEV antiguos limpiados.`);
}
