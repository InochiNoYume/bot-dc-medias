import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { env } from "../../config/env.js";
import {
  claimCreatorNotification,
  listCreatorFeeds,
  markCreatorNotificationSent,
  releaseCreatorNotificationClaim,
  updateCreatorFeed,
  type CreatorFeed,
} from "./repository.js";

interface CreatorItem {
  id: string;
  title: string;
  url: string;
  publishedAt: string | null;
}

interface TwitchTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface TwitchStream {
  id: string;
  user_login: string;
  title: string;
  started_at: string;
}

interface TwitchStreamsResponse {
  data: TwitchStream[];
}

interface KickTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface KickChannel {
  broadcaster_user_id: number;
  slug: string;
  stream_title?: string;
  livestream?: {
    is_live?: boolean;
    title?: string;
    started_at?: string;
    id?: number;
  } | null;
}

interface KickChannelsResponse {
  data: KickChannel[];
}

let twitchAccessToken: string | null = null;
let twitchTokenExpiresAt = 0;
let kickAccessToken: string | null = null;
let kickTokenExpiresAt = 0;
let polling = false;
const EXTERNAL_REQUEST_TIMEOUT_MS = 10_000;

async function getTwitchAccessToken(): Promise<string | null> {
  if (!env.twitchClientId || !env.twitchClientSecret) return null;

  const now = Date.now();
  if (twitchAccessToken && twitchTokenExpiresAt > now + 60_000) return twitchAccessToken;

  const body = new URLSearchParams({
    client_id: env.twitchClientId,
    client_secret: env.twitchClientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error("Twitch OAuth respondió " + response.status);

  const token = (await response.json()) as TwitchTokenResponse;
  twitchAccessToken = token.access_token;
  twitchTokenExpiresAt = now + token.expires_in * 1000;
  return twitchAccessToken;
}

async function getKickAccessToken(): Promise<string | null> {
  if (!env.kickClientId || !env.kickClientSecret) return null;

  const now = Date.now();
  if (kickAccessToken && kickTokenExpiresAt > now + 60_000) return kickAccessToken;

  const body = new URLSearchParams({
    client_id: env.kickClientId,
    client_secret: env.kickClientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch("https://id.kick.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error("Kick OAuth respondió " + response.status);

  const token = (await response.json()) as KickTokenResponse;
  kickAccessToken = token.access_token;
  kickTokenExpiresAt = now + token.expires_in * 1000;
  return kickAccessToken;
}

async function fetchYouTube(feed: CreatorFeed): Promise<CreatorItem | null> {
  const response = await fetch(
    "https://www.youtube.com/feeds/videos.xml?channel_id=" + encodeURIComponent(feed.external_id),
    { signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS) },
  );
  if (!response.ok) throw new Error("YouTube respondió " + response.status);

  const xml = await response.text();
  const entry = xml.match(/<entry>[\s\S]*?<\/entry>/)?.[0];
  if (!entry) return null;

  const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
  const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
  const publishedAt = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? null;
  if (!id || !title) return null;

  return {
    id,
    title: decodeXml(title),
    url: "https://www.youtube.com/watch?v=" + id,
    publishedAt,
  };
}

async function fetchTwitch(feed: CreatorFeed): Promise<CreatorItem | null> {
  const token = await getTwitchAccessToken();
  if (!token) return null;

  const login = feed.external_id.trim().replace(/^@/, "").toLowerCase();
  if (!login) return null;

  const response = await fetch(
    "https://api.twitch.tv/helix/streams?user_login=" + encodeURIComponent(login),
    {
      headers: {
        Authorization: "Bearer " + token,
        "Client-Id": env.twitchClientId,
      },
      signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
    },
  );

  if (response.status === 401) {
    twitchAccessToken = null;
    twitchTokenExpiresAt = 0;
    return null;
  }
  if (!response.ok) throw new Error("Twitch Helix respondió " + response.status);

  const payload = (await response.json()) as TwitchStreamsResponse;
  const stream = payload.data[0];
  if (!stream) return null;

  return {
    id: stream.id,
    title: stream.title,
    url: "https://www.twitch.tv/" + encodeURIComponent(stream.user_login),
    publishedAt: stream.started_at,
  };
}

async function fetchKick(feed: CreatorFeed): Promise<CreatorItem | null> {
  const token = await getKickAccessToken();
  if (!token) return null;

  const slug = feed.external_id.trim().replace(/^@/, "").toLowerCase();
  if (!slug) return null;

  const response = await fetch(
    "https://api.kick.com/public/v1/channels?slug=" + encodeURIComponent(slug),
    {
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
    },
  );

  if (response.status === 401) {
    kickAccessToken = null;
    kickTokenExpiresAt = 0;
    return null;
  }
  if (!response.ok) throw new Error("Kick API respondió " + response.status);

  const payload = (await response.json()) as KickChannelsResponse;
  const channel = payload.data[0];
  const live = channel?.livestream;
  if (!channel || !live?.is_live) return null;

  const streamId = String(live.id ?? live.started_at ?? channel.broadcaster_user_id);
  return {
    id: streamId,
    title: live.title ?? channel.stream_title ?? "Directo en Kick",
    url: "https://kick.com/" + encodeURIComponent(channel.slug || slug),
    publishedAt: live.started_at ?? null,
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchLatest(feed: CreatorFeed): Promise<CreatorItem | null> {
  switch (feed.platform) {
    case "youtube":
      return fetchYouTube(feed);
    case "twitch":
      return fetchTwitch(feed);
    case "kick":
      return fetchKick(feed);
    case "tiktok":
      return null;
  }
}

function isDue(feed: CreatorFeed, now: number): boolean {
  if (!feed.last_checked_at) return true;
  const lastChecked = Date.parse(feed.last_checked_at);
  if (!Number.isFinite(lastChecked)) return true;
  return now - lastChecked >= feed.poll_interval_seconds * 1000;
}

async function checkFeed(client: Client, feed: CreatorFeed): Promise<void> {
  if (!feed.enabled || !isDue(feed, Date.now())) return;

  const checkedAt = new Date().toISOString();
  const item = await fetchLatest(feed);
  if (!item) {
    await updateCreatorFeed(feed.guild_id, feed.id, { last_checked_at: checkedAt });
    return;
  }

  if (!feed.last_external_item_id) {
    await updateCreatorFeed(feed.guild_id, feed.id, {
      last_external_item_id: item.id,
      last_checked_at: checkedAt,
    });
    return;
  }

  if (feed.last_external_item_id === item.id) {
    await updateCreatorFeed(feed.guild_id, feed.id, { last_checked_at: checkedAt });
    return;
  }

  const claimResult = await claimCreatorNotification({
    feedId: feed.id,
    externalItemId: item.id,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
  });

  if (claimResult.status === "already_sent") {
    await updateCreatorFeed(feed.guild_id, feed.id, {
      last_external_item_id: item.id,
      last_checked_at: checkedAt,
    });
    return;
  }

  if (claimResult.status === "in_progress") {
    await updateCreatorFeed(feed.guild_id, feed.id, { last_checked_at: checkedAt });
    return;
  }

  const channel = await client.channels.fetch(feed.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    await releaseCreatorNotificationClaim(feed.id, item.id, claimResult.claimedAt);
    return;
  }

  const mention = feed.mention_role_id ? "<@&" + feed.mention_role_id + "> " : "";
  const embed = new EmbedBuilder()
    .setTitle(feed.display_name + (feed.platform === "kick" ? " está en directo" : " publicó contenido"))
    .setDescription("[" + item.title + "](" + item.url + ")")
    .addFields({ name: "Plataforma", value: feed.platform, inline: true })
    .setTimestamp(item.publishedAt ? new Date(item.publishedAt) : new Date());

  try {
    await (channel as TextChannel).send({
      ...(mention ? { content: mention } : {}),
      embeds: [embed],
    });

    const markedSent = await markCreatorNotificationSent({
      feedId: feed.id,
      externalItemId: item.id,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt,
      claimedAt: claimResult.claimedAt,
    });
    if (!markedSent) {
      throw new Error("CREATOR_NOTIFICATION_CLAIM_LOST");
    }

    await updateCreatorFeed(feed.guild_id, feed.id, {
      last_external_item_id: item.id,
      last_checked_at: checkedAt,
    });
  } catch (error) {
    await releaseCreatorNotificationClaim(feed.id, item.id, claimResult.claimedAt).catch(() => undefined);
    throw error;
  }
}

export function registerCreatorNotifications(client: Client): void {
  const run = async (): Promise<void> => {
    if (polling) return;
    polling = true;
    try {
      const now = Date.now();
      for (const guild of client.guilds.cache.values()) {
        const feeds = await listCreatorFeeds(guild.id).catch(() => []);
        for (const feed of feeds) {
          if (!isDue(feed, now)) continue;
          await checkFeed(client, feed).catch((error) => console.error("[CREATORS]", error));
        }
      }
    } finally {
      polling = false;
    }
  };

  client.once("ready", () => {
    void run();
    const timer = setInterval(() => void run(), 30_000);
    timer.unref();
  });
}
