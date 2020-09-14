import { Command } from "./command.interface";

module.exports = <Command>{
  name: "ping",
  description: "Ping!",
  cooldown: 5,
  execute(message) {
    message.channel.send("Pong!");
  },
};
