import { Message } from "discord.js";

export interface Command {
  name: string;
  description: string;
  aliases?: string[];
  usage?: string;
  cooldown?: number,
  guildOnly?: boolean,
  args?: boolean,
  execute: (message: Message, args?: string[]) => Promise<Message> | void;
}