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

  // Commands are registered globally. Do not also register the same payload
  // in DEV_GUILD_ID, otherwise Discord can expose duplicate command entries
  // in that guild (one global + one guild-scoped copy).
  console.log(`[COMMANDS] ${payload.length} comando(s) registrados globalmente.`);
}
