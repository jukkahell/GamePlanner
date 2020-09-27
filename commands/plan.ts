import { Command } from "./command.interface";
import { Message, Guild, TextChannel, GuildChannel, MessageCollector, CollectorFilter, Role } from "discord.js";
import { MAX_REACT_OPTIONS, reactOptions } from "../utils/reactoptions";
import { parseStringArgs } from "../utils/string-utils";

const ROLE_COLOR = 16762624;
const timeout = 60000;

const collectorEnd = (collector: MessageCollector, message: Message) => {
  collector.on("end", (collected) => {
    if (collected.size === 0) {
      message.author.send(`En jaksanut odottaa enempää. Huutele !plan uudestaan kun tiedät plänin.`);
    }
  });
};

const publishPlan = (channel: TextChannel, game: string, gamerole: Role, date: string, notifyTime: number, minPlayers: number, maxPlayers: number, options: string[], postedOnChannel: boolean = false) => {
  let optionsText = "";
  for (let i = 0; i < options.length; i++) {
    optionsText += `${reactOptions[i]} ${options[i]}\n`;
  }
  const playerCountText = maxPlayers === 0 ? `minimissään ${minPlayers}` : `${minPlayers}-${maxPlayers}`;
  let gameName = gamerole ? `<@&${gamerole.id}>` : game;
  let untaggedGameName = game;
  if (gameName.indexOf('<@&') >= 0) {
    let gameRoleId = game.replace('<@&', '').replace('>', '');
    const gameRole = channel.guild.roles.cache.find(r => r.id === gameRoleId);
    untaggedGameName = gameRole.name;
  }

  if (postedOnChannel) {
    gameName = untaggedGameName;
  }

  channel
    .send(
      `
Kuka haluaa pelata **${date.toLowerCase()}** peliä **${gameName}**?!
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
        collector.on("collect", (reaction) => {
          if (reaction.count === maxPlayers) {
            collector.stop();
          }
        });
        collector.on("end", (reactions) => {
          const maxCount = Math.max.apply(
            Math,
            reactions.map((r) => r.count && reactOptions.includes(r.emoji.name))
          );
          if (maxCount - 1 < minPlayers) {
            channel.send(`Ei saatu tarpeeksi pelaajia (${minPlayers}) ${date} pelille ${untaggedGameName}.`);
            return;
          }
          const maxReaction = reactions.find((o) => o.count == maxCount);
          const users = maxReaction.users.cache.filter((u) => !u.bot).map((u) => `<@${u.id}>`);
          const time = options[reactOptions.indexOf(maxReaction.emoji.name)];
          channel.send(`${users.join(" ")} ${game} pelit alkaa ${time}.`);
        });
      } catch (error) {
        console.error("One of the emojis failed to react.", error);
      }
    });
};

const collectVoteOptions = (channel: TextChannel, game: string, gamerole: Role, date: string, notifyTime: number, minPlayers: number, maxPlayers: number, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m) => m.content.length >= 2 && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m) => {
    collector.stop();
    message.author.send(
      `Jatkossa voit halutessasi postata plänin suoraan kanavalle näin:\n!plan "@${game}" ${date} ${notifyTime} ${minPlayers} ${maxPlayers} ${m.content}`
    );
    const options = <string[]> parseStringArgs(m.content);
    publishPlan(channel, game, gamerole, date, notifyTime, minPlayers, maxPlayers, options);
  });
  collectorEnd(collector, message);
};

const collectMaxPlayers = (channel: TextChannel, game: string, gamerole: Role, date: string, notifyTime: number, minPlayers: number, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m: Message) => !isNaN(<any> m.content) && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m: Message) => {
    collector.stop();
    const playerCountText = m.content === '0' ? `minimissään ${minPlayers} pelaajaa` : `${minPlayers}-${m.content} pelaajaa`;
    message.author.send(
      `${date} ${game}, ${playerCountText}. Mitä annetaan vaihtoehdoiksi? Voit antaa useamman vaihtoehdon välilyönnillä eroteltuna. Käytä lainausmerkkejä jos vaihtoehdossa on välilyönti.`
    );
    collectVoteOptions(channel, game, gamerole, date, notifyTime, minPlayers, parseInt(m.content), message);
  });
  collectorEnd(collector, message);
};

const collectMinPlayers = (channel: TextChannel, game: string, gamerole: Role, date: string, notifyTime: number, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m) => !isNaN(m.content) && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m: Message) => {
    collector.stop();
    message.author.send(
      `${date} ${game} minimissään ${m.content} pelaajalla. Mikä on maksimi pelaajamäärä? Anna 0, jos ei ole maksimia.`
    );
    collectMaxPlayers(channel, game, gamerole, date, notifyTime, parseInt(m.content), message);
  });
  collectorEnd(collector, message);
};

const collectNotifyTime = (channel: TextChannel, game: string, gamerole: Role, date: string, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m) => !isNaN(m.content) && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m: Message) => {
    collector.stop();
    message.author.send(`Kerään ${m.content} tuntia ääniä pelille ${game}! Mikä on minimi pelaajamäärä?`);
    collectMinPlayers(channel, game, gamerole, date, parseInt(m.content), message);
  });
  collectorEnd(collector, message);
};

const collectDate = (channel: TextChannel, game: string, gamerole: Role, message: Message) => {
  const collector = message.channel.createMessageCollector(
    (m) => m.content.length >= 2 && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m: Message) => {
    collector.stop();
    const date: string = m.content.charAt(0).toUpperCase() + m.content.slice(1);
    message.author.send(`${date} on hyvä päivä pelata ${game}! Kuinka monta tuntia kerään ääniä?`);
    collectNotifyTime(channel, game, gamerole, date, message);
  });
  collectorEnd(collector, message);
};

const collectGameManually = (channel: TextChannel, message: Message) => {
  message.author.send(`Mitä peliä pelataan?`).then(dm => {
    const collector = dm.channel.createMessageCollector(
      (m) => m.content.length >= 2 && m.author.id === message.author.id,
      { time: timeout }
    );
    collector.on("collect", (m: Message) => {
      collector.stop();
      message.author.send(`${m.content} on hyvä peli! Minä päivänä?`);
      collectDate(channel, m.content, null, m);
    });
    collectorEnd(collector, message);
  });
};

const collectGame = (channel: TextChannel, message: Message) => {
  const gameroles = channel.guild.roles.cache.filter(role => role.color === ROLE_COLOR).map(r => r);

  if (gameroles.length === 0) {
    collectGameManually(channel, message);
    return;
  }

  let gameOptions = "";
  for (let i = 0; i < gameroles.length; i++) {
    gameOptions += `${i+1}. ${gameroles[i].name}\n`;
  }
  gameOptions += `${gameroles.length+1}. Kirjoita käsin ilman notskuja`;
  message.author.send(`OK plänätään. Valitse peli:\n${gameOptions}`).then(dm => {
    const collector = dm.channel.createMessageCollector(
      (m) => 
        !isNaN(<any> m.content) &&
        parseInt(m.content) >= 1 &&
        parseInt(m.content) <= gameroles.length + 1 &&
        m.author.id === message.author.id,
      { time: timeout }
    );
    collector.on("collect", (m: Message) => {
      collector.stop();
      const selection = parseInt(m.content) - 1;
      if (selection === gameroles.length) {
        collectGameManually(channel, message);
      } else {
        const gamerole = gameroles[selection];
        message.author.send(`${gamerole.name} on hyvä peli! Minä päivänä?`);
        collectDate(channel, gamerole.name, gamerole, m);
      }
    });
    collectorEnd(collector, message);
  });
};

const channelHasPermissions = (channel: GuildChannel, message: Message) => {
  return channel.permissionsFor(message.client.user).has(["SEND_MESSAGES", "VIEW_CHANNEL"]) && 
         channel.permissionsFor(message.author).has(["VIEW_CHANNEL"]);
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
    const parsedArgs = parseStringArgs(input);

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
    } else if (parsedArgs.length > MAX_REACT_OPTIONS + argCountWithoutTimes) {
      message.channel.send(`Liian monta vaihtoehtoa. ${MAX_REACT_OPTIONS} on maksimi.`);
      return;
    } else if (isNaN(parsedArgs[2]) || isNaN(parsedArgs[3]) || isNaN(parsedArgs[4])) {
      message.channel.send(`Minimi- ja maksimipelaajamäärä pitää olla numeroita.`);
      return;
    }

    publishPlan(
      <TextChannel> message.channel,
      parsedArgs[0],
      null,
      parsedArgs[1],
      parseInt(parsedArgs[2]),
      parseInt(parsedArgs[3]),
      parseInt(parsedArgs[4]),
      parsedArgs.slice(5),
      true
    );
  },
};

module.exports = planner;
