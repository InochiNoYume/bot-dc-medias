import {
  PermissionFlagsBits,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import {
  getAutomodConfig,
  upsertAutomodConfig,
} from "../../modules/automod/repository.js";
import { clearAutomodConfigCache, stopRaidProtection } from "../../modules/automod/service.js";

export const data = new SlashCommandBuilder()
  .setName("automod")
  .setDescription("Configura la protección automática.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
  .addSubcommand((s) => s.setName("activar").setDescription("Activa AutoMod."))
  .addSubcommand((s) => s.setName("desactivar").setDescription("Desactiva AutoMod."))
  .addSubcommand((s) => s.setName("estado").setDescription("Muestra el estado."))
  .addSubcommand((s) =>
    s
      .setName("palabra")
      .setDescription("Gestiona palabras bloqueadas.")
      .addStringOption((o) =>
        o
          .setName("accion")
          .setDescription("Acción")
          .setRequired(true)
          .addChoices({ name: "añadir", value: "add" }, { name: "quitar", value: "remove" }),
      )
      .addStringOption((o) =>
        o.setName("valor").setDescription("Palabra").setRequired(true).setMaxLength(100),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("patron")
      .setDescription("Gestiona patrones bloqueados.")
      .addStringOption((o) =>
        o
          .setName("accion")
          .setDescription("Acción")
          .setRequired(true)
          .addChoices({ name: "añadir", value: "add" }, { name: "quitar", value: "remove" }),
      )
      .addStringOption((o) =>
        o.setName("valor").setDescription("Patrón o enlace").setRequired(true).setMaxLength(200),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("limites")
      .setDescription("Configura spam y menciones.")
      .addIntegerOption((o) => o.setName("mensajes").setDescription("Mensajes").setMinValue(2).setMaxValue(30))
      .addIntegerOption((o) => o.setName("ventana").setDescription("Segundos").setMinValue(2).setMaxValue(60))
      .addIntegerOption((o) => o.setName("menciones").setDescription("Menciones").setMinValue(1).setMaxValue(50)),
  )
  .addSubcommand((s) =>
    s
      .setName("accion")
      .setDescription("Configura la acción.")
      .addStringOption((o) =>
        o
          .setName("tipo")
          .setDescription("Tipo")
          .setRequired(true)
          .addChoices({ name: "Eliminar", value: "delete" }, { name: "Eliminar + timeout", value: "timeout" }),
      )
      .addIntegerOption((o) =>
        o.setName("segundos").setDescription("Timeout").setMinValue(10).setMaxValue(86400),
      ),
  )
  .addSubcommand((s) =>
    s
      .setName("confianza")
      .setDescription("Gestiona roles exentos de AutoMod.")
      .addStringOption((o) =>
        o
          .setName("accion")
          .setDescription("Acción")
          .setRequired(true)
          .addChoices({ name: "añadir", value: "add" }, { name: "quitar", value: "remove" }),
      )
      .addRoleOption((o) => o.setName("rol").setDescription("Rol exento").setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName("cuarentena")
      .setDescription("Configura el rol aplicado durante un raid.")
      .addRoleOption((o) => o.setName("rol").setDescription("Rol de cuarentena")),
  )
  .addSubcommand((s) =>
    s
      .setName("raid")
      .setDescription("Configura anti-raid.")
      .addBooleanOption((o) => o.setName("activo").setDescription("Activo").setRequired(true))
      .addIntegerOption((o) => o.setName("entradas").setDescription("Umbral").setMinValue(3).setMaxValue(50))
      .addIntegerOption((o) => o.setName("ventana").setDescription("Segundos").setMinValue(5).setMaxValue(120))
      .addStringOption((o) =>
        o
          .setName("accion")
          .setDescription("Respuesta")
          .addChoices(
            { name: "Solo alertar", value: "alert" },
            { name: "Timeout", value: "timeout" },
            { name: "Expulsar", value: "kick" },
          ),
      )
      .addIntegerOption((o) =>
        o.setName("timeout").setDescription("Timeout anti-raid").setMinValue(10).setMaxValue(86400),
      )
      .addBooleanOption((o) => o.setName("bloqueo").setDescription("Bloqueo de canales")),
  );

export async function execute(i: ChatInputCommandInteraction): Promise<void> {
  if (!i.guild) {
    await i.reply({ content: "Solo puede utilizarse dentro de un servidor.", ephemeral: true });
    return;
  }

  if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await i.reply({ content: "Necesitas el permiso Gestionar servidor.", ephemeral: true });
    return;
  }

  const subcommand = i.options.getSubcommand();
  const current = await getAutomodConfig(i.guild.id);

  if (subcommand === "activar" || subcommand === "desactivar") {
    const enabled = subcommand === "activar";
    if (!enabled) {
      await stopRaidProtection(i.guild);
    }
    const config = await upsertAutomodConfig(i.guild.id, { enabled });
    clearAutomodConfigCache(i.guild.id);
    await i.reply({ content: "AutoMod " + (config.enabled ? "activado." : "desactivado."), ephemeral: true });
    return;
  }

  if (subcommand === "estado") {
    if (!current) {
      await i.reply({ content: "AutoMod aún no está configurado.", ephemeral: true });
      return;
    }

    const trustedRoles = current.trusted_role_ids.length
      ? current.trusted_role_ids.map((id) => "<@&" + id + ">").join(", ")
      : "Ninguno";

    await i.reply({
      content:
        "Estado: **" + (current.enabled ? "Activo" : "Inactivo") +
        "**\nAnti-raid: **" + (current.raid_enabled ? "Activo" : "Inactivo") +
        "** (" + current.raid_action + ", " + current.raid_join_threshold + "/" + current.raid_window_seconds + "s)" +
        "\nPalabras: **" + current.bad_words.length +
        "**\nPatrones: **" + current.blocked_patterns.length +
        "**\nSpam: **" + current.max_messages + "/" + current.message_window_seconds +
        "s**\nMenciones: **" + current.max_mentions +
        "**\nAcción: **" + current.action +
        "**\nRoles de confianza: " + trustedRoles +
        "\nCuarentena: " + (current.raid_quarantine_role_id ? "<@&" + current.raid_quarantine_role_id + ">" : "Ninguna") +
        "\nRaid persistente: **" + (current.raid_active_until ? "Activo" : "Inactivo") + "**",
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "palabra" || subcommand === "patron") {
    const action = i.options.getString("accion", true);
    const value = i.options.getString("valor", true).trim();
    if (!value) {
      await i.reply({ content: "Debes indicar un valor válido.", ephemeral: true });
      return;
    }

    const key = subcommand === "palabra" ? "bad_words" : "blocked_patterns";
    const list = current?.[key] ?? [];

    if (action === "add" && !list.includes(value) && list.length >= 100) {
      await i.reply({ content: "Has alcanzado el máximo de 100 entradas para esta lista.", ephemeral: true });
      return;
    }

    const next = action === "add"
      ? [...new Set([...list, value])]
      : list.filter((item) => item !== value);

    await upsertAutomodConfig(i.guild.id, { [key]: next });
    clearAutomodConfigCache(i.guild.id);
    await i.reply({ content: "Configuración actualizada.", ephemeral: true });
    return;
  }

  if (subcommand === "limites") {
    const patch: Record<string, number> = {};
    const messages = i.options.getInteger("mensajes");
    const window = i.options.getInteger("ventana");
    const mentions = i.options.getInteger("menciones");

    if (messages !== null) patch.max_messages = messages;
    if (window !== null) patch.message_window_seconds = window;
    if (mentions !== null) patch.max_mentions = mentions;

    if (!Object.keys(patch).length) {
      await i.reply({ content: "Indica al menos un límite para cambiar.", ephemeral: true });
      return;
    }

    await upsertAutomodConfig(i.guild.id, patch);
    clearAutomodConfigCache(i.guild.id);
    await i.reply({ content: "Límites actualizados.", ephemeral: true });
    return;
  }

  if (subcommand === "accion") {
    const type = i.options.getString("tipo", true) as "delete" | "timeout";
    const seconds = i.options.getInteger("segundos");
    await upsertAutomodConfig(i.guild.id, {
      action: type,
      ...(seconds !== null ? { timeout_seconds: seconds } : {}),
    });
    clearAutomodConfigCache(i.guild.id);
    await i.reply({ content: "Acción actualizada.", ephemeral: true });
    return;
  }

  if (subcommand === "confianza") {
    const action = i.options.getString("accion", true);
    const role = i.options.getRole("rol", true);
    if (role.id === i.guild.id || role.managed) {
      await i.reply({ content: "Ese rol no puede utilizarse como rol de confianza.", ephemeral: true });
      return;
    }

    const list = current?.trusted_role_ids ?? [];
    const next = action === "add"
      ? [...new Set([...list, role.id])]
      : list.filter((id) => id !== role.id);

    await upsertAutomodConfig(i.guild.id, { trusted_role_ids: next });
    clearAutomodConfigCache(i.guild.id);
    await i.reply({
      content: "Rol de confianza " + (action === "add" ? "añadido." : "quitado."),
      ephemeral: true,
    });
    return;
  }

  if (subcommand === "cuarentena") {
    const selectedRole = i.options.getRole("rol");
    if (!selectedRole) {
      await upsertAutomodConfig(i.guild.id, { raid_quarantine_role_id: null });
      clearAutomodConfigCache(i.guild.id);
      await i.reply({ content: "Rol de cuarentena desactivado.", ephemeral: true });
      return;
    }

    const role = i.guild.roles.cache.get(selectedRole.id);
    if (!role || role.id === i.guild.id || role.managed || !role.editable) {
      await i.reply({
        content: "Ese rol no es válido o está por encima del bot.",
        ephemeral: true,
      });
      return;
    }

    await upsertAutomodConfig(i.guild.id, { raid_quarantine_role_id: role.id });
    clearAutomodConfigCache(i.guild.id);
    await i.reply({ content: "Rol de cuarentena configurado.", ephemeral: true });
    return;
  }

  const active = i.options.getBoolean("activo", true);
  const entries = i.options.getInteger("entradas");
  const window = i.options.getInteger("ventana");
  const action = i.options.getString("accion") as "alert" | "timeout" | "kick" | null;
  const timeout = i.options.getInteger("timeout");
  const lockdown = i.options.getBoolean("bloqueo");

  if (!active) {
    await stopRaidProtection(i.guild);
  }

  await upsertAutomodConfig(i.guild.id, {
    raid_enabled: active,
    ...(entries !== null ? { raid_join_threshold: entries } : {}),
    ...(window !== null ? { raid_window_seconds: window } : {}),
    ...(action ? { raid_action: action } : {}),
    ...(timeout !== null ? { raid_timeout_seconds: timeout } : {}),
    ...(lockdown !== null ? { raid_lockdown: lockdown } : {}),
  });

  clearAutomodConfigCache(i.guild.id);
  await i.reply({ content: "Configuración anti-raid actualizada.", ephemeral: true });
}
