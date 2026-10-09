# Bot DC Medias

Bot de Discord multi-servidor enfocado exclusivamente en **Tickets** y **Notificaciones**.

## Stack

- Node.js 22+
- TypeScript
- Discord.js v14
- Supabase PostgreSQL
- GitHub Actions / hosting externo

## Funciones actuales

### Tickets

- Categorías de tickets por servidor.
- Roles de atención por categoría.
- Límite de tickets abiertos por usuario.
- Prioridades: baja, normal, alta y urgente.
- Paneles para abrir tickets.
- Crear, configurar, listar y eliminar categorías.
- Publicar y reparar paneles.
- Tomar y liberar tickets.
- Cerrar y reabrir tickets.
- Motivo de cierre.
- Gestión de usuarios dentro del ticket.
- Historial y registro de acciones.
- Transcripciones al cerrar.
- Archivado de tickets cerrados.
- Cierre automático por inactividad.
- Valoración de atención de 1 a 5.
- Protección multi-guild y operaciones atómicas para evitar duplicados o límites inconsistentes.

### Notificaciones

- YouTube.
- Twitch.
- Kick.
- TikTok queda preparado como plataforma, pero no se realiza scraping ni se simula una integración sin API/OAuth válido.
- Configuración independiente por servidor.
- Canal y rol de notificación por feed.
- Activar/desactivar feeds.
- Intervalo de comprobación configurable.
- Dedupe y control de publicaciones repetidas.
- Polling con protección contra solapamientos y reclamaciones concurrentes.

## Seguridad y configuración

- Los secretos se mantienen en variables de entorno.
- La configuración de producción se almacena por `guild_id` en Supabase.
- No se hardcodean IDs de servidores, canales, roles o categorías de producción.
- El backend utiliza la clave `SUPABASE_SERVICE_ROLE_KEY`; nunca debe exponerse al cliente.

## Variables de entorno

Obligatorias:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Opcionales para notificaciones:

- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `KICK_CLIENT_ID`
- `KICK_CLIENT_SECRET`

## Base de datos

Las migraciones de `supabase/migrations` deben aplicarse en orden en el proyecto de Supabase antes de usar el bot en un entorno nuevo.

## Desarrollo

```bash
npm install
npm run check
npm run build
npm run dev
```

## Producción

```bash
npm run build
npm start
```

El archivo `.env` debe permanecer fuera del repositorio. En el hosting se deben configurar las variables de entorno de forma segura.

## CI

GitHub Actions ejecuta `npm ci`, `npm run check` y `npm run build` en los cambios dirigidos a `main`.

## Alcance

El bot ya no incluye comandos ni flujo activo de Moderación, AutoMod, Logs independientes, Community, Statistics ni otros módulos administrativos fuera de Tickets y Notificaciones. Los registros internos utilizados por Tickets forman parte del propio sistema de tickets.
