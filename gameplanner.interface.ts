import * as Discord from "discord.js";
import { Command } from "./commands/command.interface";

export interface DiscordClient extends Discord.Client {
  commands?: Discord.Collection<string, Command>; 
}