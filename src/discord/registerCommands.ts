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

  console.log(`[COMMANDS] ${payload.length} comando(s) registrados globalmente.`);
}
