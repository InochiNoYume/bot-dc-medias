import * as ping from "./core/ping.js";
import * as setup from "./core/setup.js";
import type { Command } from "../core/command.js";

export const commands: Command[] = [ping, setup];