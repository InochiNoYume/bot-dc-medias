import * as ping from "./core/ping.js";
import * as setup from "./core/setup.js";
import * as config from "./core/config.js";
import * as tutorial from "./core/tutorial.js";
import * as ticket from "./ticket/ticket.js";
import * as moderation from "./moderation/mod.js";
import * as logs from "./logs/logs.js";
import * as automod from "./automod/automod.js";
import * as creators from "./creators/creators.js";
import * as community from "./community/community.js";
import * as statistics from "./statistics/statistics.js";
import type { Command } from "../core/command.js";

export const commands: Command[] = [ping, setup, config, tutorial, ticket, moderation, logs, automod, creators, community, statistics];
