import { ChannelType, PermissionFlagsBits, type Client, type Interaction } from "discord.js";
import { commands } from "../commands/index.js";
import { createTicketCategory, createTicketRecord, countOpenTicketsForUser, getTicketCategory } from "../modules/tickets/repository.js";
import { TICKET_OPEN_PREFIX } from "../modules/tickets/panel.js";

const commandMap=new Map(commands.map(command=>[command.data.name,command]));

export function registerInteractionEvent(client:Client):void{
  client.on("interactionCreate",async(interaction:Interaction)=>{
    try{
      if(interaction.isChatInputCommand()){const command=commandMap.get(interaction.commandName);if(!command)return;await command.execute(interaction);return;}
      if(interaction.isModalSubmit()&&interaction.customId==="ticket:category:create"){
        if(!interaction.guild)return;
        if(!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)){await interaction.reply({content:"Necesitas el permiso Administrar servidor.",ephemeral:true});return;}
        const name=interaction.fields.getTextInputValue("name").trim(),description=interaction.fields.getTextInputValue("description").trim(),priority=interaction.fields.getTextInputValue("priority").trim().toLowerCase(),maxOpen=Number(interaction.fields.getTextInputValue("maxOpen").trim());
        if(!["low","normal","high","urgent"].includes(priority)){await interaction.reply({content:"La prioridad indicada no es válida.",ephemeral:true});return;}
        if(!Number.isInteger(maxOpen)||maxOpen<1||maxOpen>20){await interaction.reply({content:"El máximo debe estar entre 1 y 20.",ephemeral:true});return;}
        const category=await createTicketCategory({guildId:interaction.guild.id,name,description,discordCategoryId:null,staffRoleIds:[],priority,maxOpenPerUser:maxOpen,autoCloseMinutes:null});
        await interaction.reply({content:"Categoría creada: **"+category.name+"**\nID: `"+category.id+"`",ephemeral:true});return;
      }
      if(interaction.isButton()&&interaction.customId.startsWith(TICKET_OPEN_PREFIX)){
        if(!interaction.guild){await interaction.reply({content:"Este botón solo funciona dentro de un servidor.",ephemeral:true});return;}
        const categoryId=interaction.customId.slice(TICKET_OPEN_PREFIX.length),category=await getTicketCategory(interaction.guild.id,categoryId);
        if(!category||!category.enabled){await interaction.reply({content:"Esta categoría ya no está disponible.",ephemeral:true});return;}
        const openCount=await countOpenTicketsForUser(interaction.guild.id,interaction.user.id,category.id);
        if(openCount>=category.max_open_per_user){await interaction.reply({content:"Ya alcanzaste el máximo de tickets abiertos para esta categoría.",ephemeral:true});return;}
        const parent=category.discord_category_id&&interaction.guild.channels.cache.get(category.discord_category_id);
        const botMember=interaction.guild.members.me;
        if(!botMember){await interaction.reply({content:"No pude identificar al bot dentro del servidor.",ephemeral:true});return;}
        const channel=await interaction.guild.channels.create({
          name:"ticket-"+interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,20),
          type:ChannelType.GuildText,
          ...(parent?.type===ChannelType.GuildCategory?{parent:parent.id}:{}),
          permissionOverwrites:[
            {id:interaction.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
            {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
            {id:botMember.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]},
            ...category.staff_role_ids.map(roleId=>({id:roleId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]})),
          ],
        });
        try{
          const ticket=await createTicketRecord({guildId:interaction.guild.id,channelId:channel.id,ownerId:interaction.user.id,categoryId:category.id,priority:category.priority});
          await channel.send({content:"<@"+interaction.user.id+">",embeds:[{title:"Ticket #"+String(ticket.display_number??ticket.ticket_number).padStart(4,"0"),description:category.description??"Tu solicitud ha sido creada.",fields:[{name:"Categoría",value:category.name,inline:true},{name:"Prioridad",value:category.priority,inline:true},{name:"Estado",value:"Abierto",inline:true}]}]});
          await interaction.reply({content:"Tu ticket fue creado: <#"+channel.id+">",ephemeral:true});
        }catch(error){await channel.delete().catch(()=>undefined);throw error;}
      }
    }catch(error){
      console.error("[INTERACTION ERROR]",error);const content="Ocurrió un error procesando esta interacción.";
      if(interaction.isRepliable()){if(interaction.replied||interaction.deferred)await interaction.followUp({content,ephemeral:true}).catch(()=>undefined);else await interaction.reply({content,ephemeral:true}).catch(()=>undefined);}
    }
  });
}
