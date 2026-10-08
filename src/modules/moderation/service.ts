import { PermissionFlagsBits, type GuildMember, type User } from "discord.js";
import type { ModerationAction } from "./types.js";
import { createModerationCase, updateModerationCase } from "./repository.js";
import { sendGuildActionLog } from "../logging/service.js";

function ensureTargetCanBeModerated(target: GuildMember, moderator: GuildMember, bot: GuildMember): void {
  if (target.id === moderator.id) throw new Error("No puedes aplicar esta acción sobre ti mismo.");
  if (target.id === bot.id) throw new Error("No puedes aplicar esta acción sobre el bot.");
  if (target.id === target.guild.ownerId) throw new Error("No puedes aplicar esta acción sobre el propietario del servidor.");
  if (target.roles.highest.position >= bot.roles.highest.position) throw new Error("Mi rol debe estar por encima del usuario objetivo.");
  if (target.roles.highest.position >= moderator.roles.highest.position && moderator.id !== target.guild.ownerId) throw new Error("Tu rol debe estar por encima del usuario objetivo.");
}

export function requiredModerationPermission(action: ModerationAction): bigint {
  if (action === "ban" || action === "unban" || action === "kick") return PermissionFlagsBits.BanMembers;
  return PermissionFlagsBits.ModerateMembers;
}

export async function executeModerationAction(input: { action: ModerationAction; targetUser: User; targetMember?: GuildMember | null; moderator: GuildMember; bot: GuildMember; reason: string; durationSeconds?: number | undefined }): Promise<number> {
  const guild = input.moderator.guild;
  if (!input.moderator.permissions.has(requiredModerationPermission(input.action)) && !input.moderator.permissions.has(PermissionFlagsBits.ManageGuild)) {
    throw new Error("No tienes el permiso necesario para esta acción.");
  }
  if (input.targetMember) ensureTargetCanBeModerated(input.targetMember, input.moderator, input.bot);
  const record = await createModerationCase({ guildId: guild.id, targetId: input.targetUser.id, moderatorId: input.moderator.id, action: input.action, reason: input.reason, durationSeconds: input.durationSeconds ?? null });
  try {
    if (input.action === "warn") {
      await input.targetUser.send("Has recibido una advertencia en " + guild.name + ". Motivo: " + input.reason).catch(() => undefined);
    } else if (input.action === "timeout") {
      if (!input.targetMember || !input.targetMember.moderatable) throw new Error("No puedo aplicar timeout a este usuario.");
      await input.targetMember.timeout((input.durationSeconds ?? 0) * 1000, input.reason);
    } else if (input.action === "kick") {
      if (!input.targetMember || !input.targetMember.kickable) throw new Error("No puedo expulsar a este usuario.");
      await input.targetMember.kick(input.reason);
    } else if (input.action === "ban") {
      if (input.targetMember && !input.targetMember.bannable) throw new Error("No puedo bloquear a este usuario.");
      await guild.members.ban(input.targetUser.id, { reason: input.reason });
    } else if (input.action === "unban") {
      await guild.members.unban(input.targetUser.id, input.reason);
    }
    await updateModerationCase(guild.id, record.id, "completed");
    await sendGuildActionLog(
      guild,
      "moderation_action",
      `Moderación #${record.case_number}`,
      `Se ejecutó la acción **${input.action}** sobre <@${input.targetUser.id}>.`,
      [
        { name: "Usuario", value: `${input.targetUser.tag}\\n${input.targetUser.id}`, inline: true },
        { name: "Moderador", value: `<@${input.moderator.id}>`, inline: true },
        { name: "Motivo", value: input.reason || "Sin motivo indicado", inline: false },
      ],
    );
    return record.case_number;
  } catch (error) {
    await updateModerationCase(guild.id, record.id, "failed", { error: error instanceof Error ? error.message : "Unknown error" }).catch(() => undefined);
    await sendGuildActionLog(
      guild,
      "moderation_action",
      `Moderación #${record.case_number} fallida`,
      `No se pudo ejecutar **${input.action}** sobre <@${input.targetUser.id}>.`,
      [{ name: "Error", value: error instanceof Error ? error.message : "Error desconocido", inline: false }],
    );
    throw error;
  }
}

export function hasModerationPermission(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.ModerateMembers) || member.permissions.has(PermissionFlagsBits.ManageGuild);
}
