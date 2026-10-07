import { EmbedBuilder, type Client, type TextChannel } from "discord.js";
import { getCreatorFeed, listCreatorFeeds, markCreatorNotificationSent, updateCreatorFeed, type CreatorFeed, type CreatorPlatform } from "./repository.js";

interface CreatorItem { id: string; title: string; url: string; publishedAt: string | null; }

async function fetchYouTube(feed: CreatorFeed): Promise<CreatorItem | null> {
  const response = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id="+encodeURIComponent(feed.external_id));
  if (!response.ok) throw new Error("YouTube respondió "+response.status);
  const xml = await response.text();
  const match = xml.match(/<entry>[\s\S]*?<\/entry>/);
  if (!match) return null;
  const entry = match[0];
  const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
  const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
  const publishedAt = entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? null;
  if (!id || !title) return null;
  return { id, title: decodeXml(title), url: "https://www.youtube.com/watch?v="+id, publishedAt };
}

function decodeXml(value:string):string{return value.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&#39;/g,"'");}

async function fetchLatest(feed: CreatorFeed): Promise<CreatorItem | null> {
  if (feed.platform === "youtube") return fetchYouTube(feed);
  return null;
}

async function checkFeed(client: Client, feed: CreatorFeed): Promise<void> {
  if (!feed.enabled) return;
  const item = await fetchLatest(feed);
  if (!item) { await updateCreatorFeed(feed.id,{last_checked_at:new Date().toISOString()}); return; }
  if (feed.last_external_item_id === item.id) { await updateCreatorFeed(feed.id,{last_checked_at:new Date().toISOString()}); return; }
  const { wasSent } = await import("./state.js");
  if (wasSent(feed.id,item.id)) { await updateCreatorFeed(feed.id,{last_external_item_id:item.id,last_checked_at:new Date().toISOString()}); return; }
  const channel = await client.channels.fetch(feed.channel_id).catch(()=>null);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) return;
  const mention = feed.mention_role_id ? "<@&"+feed.mention_role_id+"> " : "";
  await (channel as TextChannel).send({content:mention,embeds:[new EmbedBuilder().setTitle(feed.display_name+" publicó contenido").setDescription("["+item.title+"]("+item.url+")").addFields({name:"Plataforma",value:feed.platform,inline:true}).setTimestamp(item.publishedAt ? new Date(item.publishedAt) : new Date())]});
  await markCreatorNotificationSent({feedId:feed.id,externalItemId:item.id,title:item.title,url:item.url,publishedAt:item.publishedAt});
  await updateCreatorFeed(feed.id,{last_external_item_id:item.id,last_checked_at:new Date().toISOString()});
}

export function registerCreatorNotifications(client: Client): void {
  const run=async()=>{for(const guild of client.guilds.cache.values()){const feeds=await listCreatorFeeds(guild.id).catch(()=>[]);for(const feed of feeds){await checkFeed(client,feed).catch(error=>console.error("[CREATORS]",error));}}};
  client.once("ready",()=>{void run();setInterval(()=>void run(),120000);});
}
