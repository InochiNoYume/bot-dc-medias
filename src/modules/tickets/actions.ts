import { supabase } from "../../database/supabase.js";
import type { TicketPriority, TicketRecord, TicketStatus } from "./types.js";

export async function getTicketByChannel(guildId:string,channelId:string):Promise<TicketRecord|null>{
  const{data,error}=await supabase.from("tickets").select("*").eq("guild_id",guildId).eq("channel_id",channelId).maybeSingle();
  if(error)throw error;return data as TicketRecord|null;
}
export async function updateTicket(ticketId:string,changes:{status?:TicketStatus;priority?:TicketPriority;claimedBy?:string|null;}):Promise<TicketRecord>{
  const p:Record<string,unknown>={};
  if(changes.status!==undefined)p.status=changes.status;
  if(changes.priority!==undefined)p.priority=changes.priority;
  if(changes.claimedBy!==undefined)p.claimed_by=changes.claimedBy;
  if(changes.status==="claimed")p.claimed_at=new Date().toISOString();
  if(changes.status==="closed")p.closed_at=new Date().toISOString();
  if(changes.status==="open"){p.closed_at=null;p.claimed_by=null;}
  const{data,error}=await supabase.from("tickets").update(p).eq("id",ticketId).select("*").single();
  if(error)throw error;return data as TicketRecord;
}
export async function addTicketMember(ticketId:string,userId:string):Promise<void>{
  const{error}=await supabase.from("ticket_members").upsert({ticket_id:ticketId,user_id:userId});if(error)throw error;
}
export async function removeTicketMember(ticketId:string,userId:string):Promise<void>{
  const{error}=await supabase.from("ticket_members").delete().eq("ticket_id",ticketId).eq("user_id",userId);if(error)throw error;
}
