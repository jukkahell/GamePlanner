import { Command } from "./command.interface";
import { Message, Guild, TextChannel, GuildChannel, DMChannel, NewsChannel, MessageCollector, CollectorFilter } from "discord.js";

const reactOptions = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭"];
const timeout = 60000;

const collectorEnd = (collector: MessageCollector, message: Message) => {
  collector.on("end", (collected) => {
    if (collected.size === 0) {
      message.author.send(`En jaksanut odottaa enempää. Huutele !plan uudestaan kun tiedät plänin.`);
    }
  });
};

const publishPlan = (channel: TextChannel | DMChannel | NewsChannel, game: string, date: string, notifyTime: number, minPlayers: number, maxPlayers: number, options: string[]) => {
  let optionsText = "";
  for (let i = 0; i < options.length; i++) {
    optionsText += `${reactOptions[i]} ${options[i]}\n`;
  }
  const playerCountText = maxPlayers === 0 ? `minimissään ${minPlayers}` : `${minPlayers}-${maxPlayers}`;

  channel
    .send(
      `
Kuka haluaa pelata **${date.toLowerCase()}** peliä **${game}**?!
Pelaajamäärä ${playerCountText}
${optionsText}
`
    )
    .then(async (message) => {
      try {
        for (let i = 0; i < options.length; i++) {
          await message.react(reactOptions[i]);
        }
        const filter: CollectorFilter = (reaction) => {
          return reactOptions.indexOf(reaction.emoji.name) >= 0;
        };
        const collector = message.createReactionCollector(filter, { dispose: true, time: notifyTime * 60 * 60 * 1000 });
        collector.on("end", (collected) => {
          const maxCount = Math.max.apply(
            Math,
            collected.map((o) => o.count)
          );
          if (maxCount - 1 < minPlayers) {
            channel.send(`Ei saatu tarpeeksi pelaajia (${minPlayers}) ${date} pelille ${game}.`);
            return;
          }
          const maxReaction = collected.find((o) => o.count == maxCount);
          const users = maxReaction.users.cache.filter((u) => !u.bot).map((u) => `<@${u.id}>`);
          const time = options[reactOptions.indexOf(maxReaction.emoji.name)];
          channel.send(`${users.join(" ")} ${game} pelit alkaa ${time}.`);
        });
      } catch (error) {
        console.error("One of the emojis failed to react.", error);
      }
    });
};

const collectTimes = (channel: TextChannel, game: string, date: string, notifyTime: number, minPlayers: number, maxPlayers: number, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m) => m.content.length >= 5 && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m) => {
    collector.stop();
    message.author.send(
      `Jatkossa voit halutessasi postata plänin suoraan kanavalle näin:\n!plan "${game}" ${date} ${notifyTime} ${minPlayers} ${maxPlayers} ${m.content}`
    );
    publishPlan(channel, game, date, notifyTime, minPlayers, maxPlayers, m.content.split(" "));
  });
  collectorEnd(collector, message);
};

const collectMaxPlayers = (channel: TextChannel, game: string, date: string, notifyTime: number, minPlayers: number, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m: Message) => !isNaN(<any> m.content) && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m: Message) => {
    collector.stop();
    const playerCountText = m.content === '0' ? `minimissään ${minPlayers} pelaajaa` : `${minPlayers}-${m.content} pelaajaa`;
    message.author.send(
      `${date} ${game}, ${playerCountText}. Mitä annetaan vaihtoehdoiksi? Voit antaa useamman ajankohdan välilyönnillä eroteltuna.`
    );
    collectTimes(channel, game, date, notifyTime, minPlayers, parseInt(m.content), message);
  });
  collectorEnd(collector, message);
};

const collectMinPlayers = (channel: TextChannel, game: string, date: string, notifyTime: number, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m) => !isNaN(m.content) && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m: Message) => {
    collector.stop();
    message.author.send(
      `${date} ${game} minimissään ${m.content} pelaajalla. Mikä on maksimi pelaajamäärä? Anna 0, jos ei ole maksimia.`
    );
    collectMaxPlayers(channel, game, date, notifyTime, parseInt(m.content), message);
  });
  collectorEnd(collector, message);
};

const collectNotifyTime = (channel: TextChannel, game: string, date: string, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m) => !isNaN(m.content) && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m: Message) => {
    collector.stop();
    message.author.send(`Kerään ${m.content} tuntia ääniä pelille ${game}! Mikä on minimi pelaajamäärä?`);
    collectMinPlayers(channel, game, date, parseInt(m.content), message);
  });
  collectorEnd(collector, message);
};

const collectDate = (channel: TextChannel, game: string, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m) => m.content.length >= 2 && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m: Message) => {
    collector.stop();
    const date: string = m.content.charAt(0).toUpperCase() + m.content.slice(1);
    message.author.send(`${date} on hyvä päivä pelata ${game}! Kuinka monta tuntia kerään ääniä?`);
    collectNotifyTime(channel, game, date, message);
  });
  collectorEnd(collector, message);
};

const collectGame = (channel: TextChannel, message: Message) => {
  message.author.send(`OK plänätään. Mitä peliä pelataan?`).then(dm => {
    const collector = dm.channel.createMessageCollector(
      (m) => m.content.length >= 2 && m.author.id === message.author.id,
      { time: timeout }
    );
    collector.on("collect", (m: Message) => {
      collector.stop();
      message.author.send(`${m.content} on hyvä peli! Minä päivänä?`);
      collectDate(channel, m.content, m);
    });
    collectorEnd(collector, message);
  });
};

const channelHasPermissions = (channel: GuildChannel, message: Message) => {
  return channel.permissionsFor(message.client.user).has(["SEND_MESSAGES", "VIEW_CHANNEL"]) && 
         channel.permissionsFor(message.author).has(["SEND_MESSAGES", "VIEW_CHANNEL"]);
};

const collectChannel = (guild: Guild, message: Message, postedOnChannel: TextChannel = undefined) => {
  if (guild.channels.cache.filter((c) => c.type === "text").size === 1) {
    const firstTextChannel = <TextChannel> guild.channels.cache.filter((c) => c.type === "text").first();
    if (!channelHasPermissions(firstTextChannel, message)) {
      message.author.send(`Meillä ei valitettavasti ole riittäviä oikeuksia postailla ehdotuksia valitulla palvelimella.`);
      return;
    }
    collectGame(firstTextChannel, message);
  } else {
    let i = 1;
    const textChannels = <TextChannel[]> guild.channels.cache.filter((c) => c.type === "text").map((c) => c);
    const allowedChannels = textChannels.filter(c => channelHasPermissions(c, message));
    if (allowedChannels.length === 0) {
      message.author.send(`Meillä ei valitettavasti ole riittäviä oikeuksia postailla ehdotuksia valitulla palvelimella.`);
      return;
    } else if (allowedChannels.length === 1) {
      collectGame(allowedChannels[0], message);
      return;
    }
    if (postedOnChannel && allowedChannels.some(c => c.id === postedOnChannel.id)) {
      collectGame(postedOnChannel, message);
      return;
    }

    const channelOptions = allowedChannels.map((c) => `${i++}. ${c.name}`);
    message.author.send(`Mille kanavalle laitetaan?\n${channelOptions.join("\n")}`);
    const collector = message.channel.createMessageCollector(
      (m: Message) =>
        !isNaN(<any> m.content) &&
        parseInt(m.content) >= 1 &&
        parseInt(m.content) <= i - 1 &&
        m.author.id === message.author.id,
      { time: timeout }
    );
    collector.on("collect", (m: Message) => {
      collector.stop();
      const channel = allowedChannels[parseInt(m.content) - 1];
      collectGame(channel, message);
    });
    collectorEnd(collector, message);
  }
};

const collectGuild = (message: Message) => {
  if (message.client.guilds.cache.size === 1) {
    const firstGuild = message.client.guilds.cache.first();
    collectChannel(firstGuild, message);
  } else {
    let i = 1;
    const mutualGuilds = message.client.guilds.cache
      .filter((guild) => guild.members.cache.some((u) => u.id === message.author.id))
      .map((g) => g);
    const guildOptions = mutualGuilds.map((guild) => `${i++}. ${guild.name}`);
    message.author.send(`Mille palvelimelle laitetaan?\n${guildOptions.join("\n")}`);
    const collector = message.channel.createMessageCollector(
      (m) =>
        !isNaN(m.content) &&
        parseInt(m.content) >= 1 &&
        parseInt(m.content) <= i - 1 &&
        m.author.id === message.author.id,
      { time: timeout }
    );
    collector.on("collect", (m) => {
      collector.stop();
      const guild = mutualGuilds[parseInt(m.content) - 1];
      collectChannel(guild, message);
    });
    collectorEnd(collector, message);
  }
};

const planner: Command = {
  name: "plan",
  description: "Suunnittele pelihetki.",
  cooldown: 5,
  usage: `[pelin nimi] [ajankohta] [keräysaika tunteina] [min pelaajaa] [max pelaajaa] [...vaihtoehdot (max ${reactOptions.length})]`,
  execute(message, args) {
    const input = args.join(" ");
    const regex = new RegExp('"[^"]+"|[\\S]+', "g");
    const parsedArgs: any = [];
    if (input.match(regex)) {
      input.match(regex).forEach((element) => {
        if (!element) return;
        return parsedArgs.push(element.replace(/"/g, ""));
      });
    }

    const argCountWithoutTimes = 5;
    if (parsedArgs.length === 0) {
      if (message.channel.type === "dm") {
        collectGuild(message);
      } else {
        collectChannel(message.channel.guild, message, <TextChannel> message.channel);
      }
      return;
    } else if (parsedArgs.length < argCountWithoutTimes + 1) {
      message.channel.send(`Liian vähän argumentteja. Anna nämä tiedot: ${planner.usage}.`);
      return;
    } else if (parsedArgs.length > reactOptions.length + argCountWithoutTimes) {
      message.channel.send(`Liian monta aikavaihtoehtoa. ${reactOptions.length} on maksimi.`);
      return;
    } else if (isNaN(parsedArgs[2]) || isNaN(parsedArgs[3]) || isNaN(parsedArgs[4])) {
      message.channel.send(`Minimi- ja maksimipelaajamäärä pitää olla numeroita.`);
      return;
    }

    publishPlan(
      message.channel,
      parsedArgs[0],
      parsedArgs[1],
      parseInt(parsedArgs[2]),
      parseInt(parsedArgs[3]),
      parseInt(parsedArgs[4]),
      parsedArgs.slice(5)
    );
  },
};

module.exports = planner;
