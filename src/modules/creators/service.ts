import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { env } from "../../config/env.js";
import {
  listCreatorFeeds,
  markCreatorNotificationSent,
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

let twitchAccessToken: string | null = null;
let twitchTokenExpiresAt = 0;

async function getTwitchAccessToken(): Promise<string | null> {
  if (!env.twitchClientId || !env.twitchClientSecret) return null;

  const now = Date.now();
  if (twitchAccessToken && twitchTokenExpiresAt > now + 60_000) {
    return twitchAccessToken;
  }

  const body = new URLSearchParams({
    client_id: env.twitchClientId,
    client_secret: env.twitchClientSecret,
    grant_type: "client_credentials",
  });

  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error("Twitch OAuth respondió " + response.status);
  }

  const token = (await response.json()) as TwitchTokenResponse;
  twitchAccessToken = token.access_token;
  twitchTokenExpiresAt = now + token.expires_in * 1000;
  return twitchAccessToken;
}

async function fetchYouTube(feed: CreatorFeed): Promise<CreatorItem | null> {
  const response = await fetch(
    "https://www.youtube.com/feeds/videos.xml?channel_id=" +
      encodeURIComponent(feed.external_id),
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
    "https://api.twitch.tv/helix/streams?user_login=" +
      encodeURIComponent(login),
    {
      headers: {
        Authorization: "Bearer " + token,
        "Client-Id": env.twitchClientId,
      },
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
    default:
      return null;
  }
}

async function checkFeed(client: Client, feed: CreatorFeed): Promise<void> {
  if (!feed.enabled) return;

  const item = await fetchLatest(feed);

  if (!item) {
    await updateCreatorFeed(feed.id, {
      last_checked_at: new Date().toISOString(),
    });
    return;
  }

  if (!feed.last_external_item_id) {
    await updateCreatorFeed(feed.id, {
      last_external_item_id: item.id,
      last_checked_at: new Date().toISOString(),
    });
    return;
  }

  if (feed.last_external_item_id === item.id) {
    await updateCreatorFeed(feed.id, {
      last_checked_at: new Date().toISOString(),
    });
    return;
  }

  const channel = await client.channels.fetch(feed.channel_id).catch(() => null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;

  const mention = feed.mention_role_id ? "<@&" + feed.mention_role_id + "> " : "";
  const embed = new EmbedBuilder()
    .setTitle(feed.display_name + " publicó contenido")
    .setDescription("[" + item.title + "](" + item.url + ")")
    .addFields({ name: "Plataforma", value: feed.platform, inline: true })
    .setTimestamp(item.publishedAt ? new Date(item.publishedAt) : new Date());

  await (channel as TextChannel).send({
    ...(mention ? { content: mention } : {}),
    embeds: [embed],
  });

  await markCreatorNotificationSent({
    feedId: feed.id,
    externalItemId: item.id,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
  });

  await updateCreatorFeed(feed.id, {
    last_external_item_id: item.id,
    last_checked_at: new Date().toISOString(),
  });
}

export function registerCreatorNotifications(client: Client): void {
  const run = async (): Promise<void> => {
    for (const guild of client.guilds.cache.values()) {
      const feeds = await listCreatorFeeds(guild.id).catch(() => []);

      for (const feed of feeds) {
        await checkFeed(client, feed).catch((error) =>
          console.error("[CREATORS]", error),
        );
      }
    }
  };

  client.once("ready", () => {
    void run();
    setInterval(() => void run(), 120_000);
  });
}
