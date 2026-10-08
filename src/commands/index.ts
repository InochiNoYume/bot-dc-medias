import * as ticket from "./ticket/ticket.js";
import * as notifications from "./notifications/notifications.js";
import type { Command } from "../core/command.js";

export const commands: Command[] = [ticket, notifications];
