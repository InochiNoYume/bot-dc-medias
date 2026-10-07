import { type Client, type Message, type GuildMember } from "discord.js";
import { getAutomodConfig } from "./repository.js";
import { sendGuildActionLog } from "../logging/service.js";
const buckets=new Map<string,number[]>(); const joins=new Map<string,number[]>();
const normalize=(s:string)=>s.toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");
function match(content:string,list:string[]):string|null{const n=normalize(content);for(const raw of list){const p=raw.trim();if(!p)continue;try{if(new RegExp(p,"i").test(content)||n.includes(normalize(p)))return p;}catch{if(n.includes(normalize(p)))return p;}}return null;}
function spam(message:Message,max:number,seconds:number){const key=message.guildId+":"+message.author.id,now=Date.now(),b=(buckets.get(key)||[]).filter(t=>now-t<seconds*1000);b.push(now);buckets.set(key,b);return b.length>=max;}
function raid(guildId:string,max:number,seconds:number){const now=Date.now(),b=(joins.get(guildId)||[]).filter(t=>now-t<seconds*1000);b.push(now);joins.set(guildId,b);return b.length>=max;}
async function punish(message:Message,reason:string,timeout:number){if(message.deletable)await message.delete().catch(()=>undefined);if(timeout&&message.member?.moderatable)await message.member.timeout(timeout*1000,"AutoMod: "+reason).catch(()=>undefined);if(message.guild)await sendGuildActionLog(message.guild,"moderation_action","AutoMod", "Se detectó: **"+reason+"**.",[{name:"Usuario",value:"<@"+message.author.id+">",inline:true},{name:"Canal",value:"<#"+message.channelId+">",inline:true}]);}
async function applyRaidAction(member:GuildMember, config: { raid_action:"alert"|"timeout"|"kick"; raid_timeout_seconds:number; raid_quarantine_role_id:string|null; raid_lockdown:boolean }, threshold:number, window:number):Promise<void>{
  if(config.raid_quarantine_role_id){
    const role=member.guild.roles.cache.get(config.raid_quarantine_role_id);
    if(role && member.manageable) await member.roles.add(role,"Anti-raid: entrada durante detección").catch(()=>undefined);
  }
  if(config.raid_action==="timeout" && member.moderatable) await member.timeout(config.raid_timeout_seconds*1000,"Anti-raid").catch(()=>undefined);
  if(config.raid_action==="kick" && member.kickable) await member.kick("Anti-raid: entrada durante detección").catch(()=>undefined);
  if(config.raid_lockdown){
    const channels=member.guild.channels.cache.filter(ch=>ch.isTextBased() && "permissionOverwrites" in ch);
    for(const channel of channels.values()){
      if("permissionOverwrites" in channel) await channel.permissionOverwrites.edit(member.guild.roles.everyone,{SendMessages:false},{reason:"Anti-raid lockdown"}).catch(()=>undefined);
    }
  }
  await sendGuildActionLog(member.guild,"moderation_action","Protección anti-raid","Se activó la protección por entradas masivas.",[
    {name:"Umbral",value:threshold+"/"+window+"s",inline:true},
    {name:"Acción",value:config.raid_action,inline:true},
    {name:"Usuario",value:"<@"+member.id+">",inline:true},
    {name:"Lockdown",value:config.raid_lockdown?"Activo":"No",inline:true},
  ]);
}
export function registerAutomodEvents(client:Client){client.on("messageCreate",async m=>{if(!m.guild||m.author.bot||!m.content)return;try{const c=await getAutomodConfig(m.guild.id);if(!c?.enabled)return;const mentions=m.mentions.users.size+m.mentions.roles.size+(m.mentions.everyone?c.max_mentions:0);let reason:string|null=null;if(mentions>=c.max_mentions)reason="spam de menciones";else if(match(m.content,c.bad_words))reason="palabra bloqueada";else if(match(m.content,c.blocked_patterns))reason="contenido bloqueado";else if(spam(m,c.max_messages,c.message_window_seconds))reason="spam de mensajes";if(reason)await punish(m,reason,c.action==="timeout"?c.timeout_seconds:0);}catch(e){console.error("[AUTOMOD ERROR]",e);}});client.on("guildMemberAdd",async(member:GuildMember)=>{try{const c=await getAutomodConfig(member.guild.id);if(c?.enabled&&c.raid_enabled&&raid(member.guild.id,c.raid_join_threshold,c.raid_window_seconds)) await applyRaidAction(member,c,c.raid_join_threshold,c.raid_window_seconds);}catch(e){console.error("[RAID ERROR]",e);}});}
