import { type Client, type GuildMember, type Message, PermissionFlagsBits } from "discord.js";
import { getAutomodConfig, upsertAutomodConfig, type AutomodConfig } from "./repository.js";
import { sendGuildActionLog } from "../logging/service.js";

const buckets = new Map<string, number[]>();
const joins = new Map<string, number[]>();
const activeRaidTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lockdowns = new Map<string, Map<string, { sendMessages: boolean | null }>>();
const configCache = new Map<string, { config: AutomodConfig | null; expires: number }>();

const normalize = (value: string): string =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

async function getCachedAutomodConfig(guildId: string): Promise<AutomodConfig | null> {
  const cached = configCache.get(guildId);
  if (cached && cached.expires > Date.now()) return cached.config;
  const config = await getAutomodConfig(guildId);
  configCache.set(guildId, { config, expires: Date.now() + 15000 });
  return config;
}

function match(content: string, list: string[]): string | null {
  const normalizedContent = normalize(content);
  for (const raw of list) {
    const pattern = raw.trim();
    if (!pattern) continue;
    try {
      if (new RegExp(pattern, "iu").test(content) || normalizedContent.includes(normalize(pattern))) {
        return pattern;
      }
    } catch {
      if (normalizedContent.includes(normalize(pattern))) return pattern;
    }
  }
  return null;
}

function trimBuckets(map: Map<string, number[]>, now: number, windowMs: number): void {
  if (map.size < 10000) return;
  for (const [key, timestamps] of map) {
    const active = timestamps.filter((timestamp) => now - timestamp < windowMs);
    if (active.length) map.set(key, active);
    else map.delete(key);
  }
}

function spam(message: Message, max: number, seconds: number): boolean {
  const key = message.guildId + ":" + message.author.id;
  const now = Date.now();
  const windowMs = seconds * 1000;
  const timestamps = (buckets.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
  timestamps.push(now);
  buckets.set(key, timestamps);
  trimBuckets(buckets, now, windowMs);
  return timestamps.length >= max;
}

function raidThresholdReached(guildId: string, max: number, seconds: number): boolean {
  const now = Date.now();
  const windowMs = seconds * 1000;
  const timestamps = (joins.get(guildId) ?? []).filter((timestamp) => now - timestamp < windowMs);
  timestamps.push(now);
  joins.set(guildId, timestamps);
  trimBuckets(joins, now, windowMs);
  return timestamps.length >= max;
}

function isTrusted(member: GuildMember, config: AutomodConfig): boolean {
  return config.trusted_role_ids.some((roleId) => member.roles.cache.has(roleId));
}

async function punish(message: Message, reason: string, timeoutSeconds: number): Promise<void> {
  if (message.deletable) await message.delete().catch(() => undefined);
  if (timeoutSeconds > 0 && message.member?.moderatable) {
    await message.member.timeout(timeoutSeconds * 1000, "AutoMod: " + reason).catch(() => undefined);
  }
  if (message.guild) {
    await sendGuildActionLog(
      message.guild,
      "moderation_action",
      "AutoMod",
      "Se detectó: **" + reason + "**.",
      [
        { name: "Usuario", value: "<@" + message.author.id + ">", inline: true },
        { name: "Canal", value: "<#" + message.channelId + ">", inline: true },
      ],
    );
  }
}

async function releaseLockdown(guildId: string, guild: GuildMember["guild"]): Promise<void> {
  const states = lockdowns.get(guildId);
  if (!states) return;

  for (const [channelId, previous] of states) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !("permissionOverwrites" in channel)) continue;
    await channel.permissionOverwrites
      .edit(guild.roles.everyone, { SendMessages: previous.sendMessages }, { reason: "Anti-raid finalizado" })
      .catch(() => undefined);
  }

  lockdowns.delete(guildId);
}

async function persistRaidEnd(guildId: string): Promise<void> {
  try {
    const current = await getAutomodConfig(guildId);
    if (!current?.raid_active_until) return;
    if (new Date(current.raid_active_until).getTime() > Date.now()) return;
    await upsertAutomodConfig(guildId, {
      raid_active_until: null,
      raid_started_at: null,
      raid_join_count: 0,
    });
    clearAutomodConfigCache(guildId);
  } catch (error) {
    console.error("[RAID STATE ERROR]", error);
  }
}

function scheduleRaidEnd(guildId: string, guild: GuildMember["guild"], until: number): void {
  const previous = activeRaidTimers.get(guildId);
  if (previous) clearTimeout(previous);

  const delay = Math.max(1000, until - Date.now() + 1000);
  activeRaidTimers.set(
    guildId,
    setTimeout(() => {
      activeRaidTimers.delete(guildId);
      void (async () => {
        await releaseLockdown(guildId, guild);
        await persistRaidEnd(guildId);
      })();
    }, delay),
  );
}

async function applyRaidAction(member: GuildMember, config: AutomodConfig): Promise<void> {
  if (config.raid_quarantine_role_id) {
    const role = member.guild.roles.cache.get(config.raid_quarantine_role_id);
    if (role && role.id !== member.guild.id && !role.managed && role.editable && member.manageable) {
      await member.roles.add(role, "Anti-raid: entrada durante detección").catch(() => undefined);
    }
  }

  if (config.raid_action === "timeout" && member.moderatable) {
    await member.timeout(config.raid_timeout_seconds * 1000, "Anti-raid").catch(() => undefined);
  }

  if (config.raid_action === "kick" && member.kickable) {
    await member.kick("Anti-raid: entrada durante detección").catch(() => undefined);
  }

  if (config.raid_lockdown && !lockdowns.has(member.guild.id)) {
    const locked = new Map<string, { sendMessages: boolean | null }>();

    for (const channel of member.guild.channels.cache.values()) {
      if (!channel.isTextBased() || !("permissionOverwrites" in channel)) continue;
      const existing = channel.permissionOverwrites.cache.get(member.guild.roles.everyone.id);
      if (existing?.deny.has(PermissionFlagsBits.SendMessages)) continue;

      const previous = existing?.allow.has(PermissionFlagsBits.SendMessages) ? true : null;
      try {
        await channel.permissionOverwrites.edit(
          member.guild.roles.everyone,
          { SendMessages: false },
          { reason: "Anti-raid lockdown" },
        );
        locked.set(channel.id, { sendMessages: previous });
      } catch {
        // Ignore channels where the bot cannot modify the overwrite.
      }
    }

    lockdowns.set(member.guild.id, locked);
  }

  const activeUntil = Date.now() + config.raid_window_seconds * 1000;
  await upsertAutomodConfig(member.guild.id, {
    raid_active_until: new Date(activeUntil).toISOString(),
    raid_started_at: config.raid_started_at ?? new Date().toISOString(),
    raid_join_count: config.raid_join_count + 1,
  });
  clearAutomodConfigCache(member.guild.id);
  scheduleRaidEnd(member.guild.id, member.guild, activeUntil);

  await sendGuildActionLog(
    member.guild,
    "moderation_action",
    "Protección anti-raid",
    "Se activó la protección por entradas masivas.",
    [
      {
        name: "Umbral",
        value: config.raid_join_threshold + "/" + config.raid_window_seconds + "s",
        inline: true,
      },
      { name: "Acción", value: config.raid_action, inline: true },
      { name: "Usuario", value: "<@" + member.id + ">", inline: true },
      { name: "Lockdown", value: config.raid_lockdown ? "Activo" : "No", inline: true },
    ],
  );
}

export function registerAutomodEvents(client: Client): void {
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot || !message.content) return;

    try {
      const config = await getCachedAutomodConfig(message.guild.id);
      if (!config?.enabled || (message.member && isTrusted(message.member, config))) return;

      const mentions =
        message.mentions.users.size +
        message.mentions.roles.size +
        (message.mentions.everyone ? config.max_mentions : 0);

      let reason: string | null = null;
      if (mentions >= config.max_mentions) reason = "spam de menciones";
      else if (match(message.content, config.bad_words)) reason = "palabra bloqueada";
      else if (match(message.content, config.blocked_patterns)) reason = "contenido bloqueado";
      else if (spam(message, config.max_messages, config.message_window_seconds)) reason = "spam de mensajes";

      if (reason) {
        await punish(message, reason, config.action === "timeout" ? config.timeout_seconds : 0);
      }
    } catch (error) {
      console.error("[AUTOMOD ERROR]", error);
    }
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      const config = await getCachedAutomodConfig(member.guild.id);
      if (!config?.enabled || !config.raid_enabled || isTrusted(member, config)) return;

      const now = Date.now();
      const persistedUntil = config.raid_active_until ? new Date(config.raid_active_until).getTime() : 0;

      if (persistedUntil > now) {
        await applyRaidAction(member, config);
        return;
      }

      if (raidThresholdReached(member.guild.id, config.raid_join_threshold, config.raid_window_seconds)) {
        await applyRaidAction(member, {
          ...config,
          raid_join_count: config.raid_join_count + config.raid_join_threshold,
          raid_started_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("[RAID ERROR]", error);
    }
  });
}

export function clearAutomodConfigCache(guildId?: string): void {
  if (guildId) configCache.delete(guildId);
  else configCache.clear();
}
