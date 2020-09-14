const reactOptions = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭"];
const timeout = 60000;

const collectorEnd = (collector, message) => {
  collector.on("end", (collected) => {
    if (collected.size === 0) {
      message.author.send(`En jaksanut odottaa enempää. Huutele !plan uudestaan kun tiedät plänin.`);
    }
  });
};

const publishPlan = (channel, game, date, notifyTime, minPlayers, maxPlayers, times) => {
  let optionsText = "";
  for (let i = 0; i < times.length; i++) {
    optionsText += `${reactOptions[i]} ${times[i]}\n`;
  }
  const playerCountText = maxPlayers === '0' ? `minimissään ${minPlayers}` : `${minPlayers}-${maxPlayers}`;

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
        for (let i = 0; i < times.length; i++) {
          await message.react(reactOptions[i]);
        }
        const filter = (reaction) => {
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
          const time = times[reactOptions.indexOf(maxReaction.emoji.name)];
          channel.send(`${users.join(" ")} ${game} pelit alkaa ${time}.`);
        });
      } catch (error) {
        console.error("One of the emojis failed to react.", error);
      }
    });
};

const collectTimes = (channel, game, date, notifyTime, minPlayers, maxPlayers, message) => {
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

const collectMaxPlayers = (channel, game, date, notifyTime, minPlayers, message) => {
  const collector = message.channel.createMessageCollector(
    (m) => !isNaN(m.content) && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m) => {
    collector.stop();
    const playerCountText = m.content === '0' ? `minimissään ${minPlayers} pelaajaa` : `${minPlayers}-${m.content} pelaajaa`;
    message.author.send(
      `${date} ${game}, ${playerCountText}. Mitä annetaan vaihtoehdoiksi? Voit antaa useamman ajankohdan välilyönnillä eroteltuna.`
    );
    collectTimes(channel, game, date, notifyTime, minPlayers, m.content, message);
  });
  collectorEnd(collector, message);
};

const collectMinPlayers = (channel, game, date, notifyTime, message) => {
  const collector = message.channel.createMessageCollector(
    (m) => !isNaN(m.content) && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m) => {
    collector.stop();
    message.author.send(
      `${date} ${game} minimissään ${m.content} pelaajalla. Mikä on maksimi pelaajamäärä? Anna 0, jos ei ole maksimia.`
    );
    collectMaxPlayers(channel, game, date, notifyTime, m.content, message);
  });
  collectorEnd(collector, message);
};

const collectNotifyTime = (channel, game, date, message) => {
  const collector = message.channel.createMessageCollector(
    (m) => !isNaN(m.content) && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m) => {
    collector.stop();
    message.author.send(`Kerään ${m.content} tuntia ääniä pelille ${game}! Mikä on minimi pelaajamäärä?`);
    collectMinPlayers(channel, game, date, m.content, message);
  });
  collectorEnd(collector, message);
};

const collectDate = (channel, game, message) => {
  const collector = message.channel.createMessageCollector(
    (m) => m.content.length >= 2 && m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", (m) => {
    collector.stop();
    const date = m.content.charAt(0).toUpperCase() + m.content.slice(1);
    message.author.send(`${date} on hyvä päivä pelata ${game}! Kuinka monta tuntia kerään ääniä?`);
    collectNotifyTime(channel, game, date, message);
  });
  collectorEnd(collector, message);
};

const collectGame = (channel, message) => {
  message.author.send(`OK plänätään. Mitä peliä pelataan?`).then(dm => {
    const collector = dm.channel.createMessageCollector(
      (m) => m.content.length >= 2 && m.author.id === message.author.id,
      { time: timeout }
    );
    collector.on("collect", (m) => {
      collector.stop();
      message.author.send(`${m.content} on hyvä peli! Minä päivänä?`);
      collectDate(channel, m.content, m);
    });
    collectorEnd(collector, message);
  });
};

const collectChannel = (guild, message) => {
  if (guild.channels.cache.filter((c) => c.type === "text").size === 1) {
    const firstTextChannel = guild.channels.cache.filter((c) => c.type === "text").first();
    collectGame(firstTextChannel, message);
  } else {
    let i = 1;
    const textChannels = guild.channels.cache.filter((c) => c.type === "text").map((c) => c);
    const allowedChannels = textChannels.filter(c => 
      c.permissionsFor(message.client.user).has(["SEND_MESSAGES", "VIEW_CHANNEL"]) && 
      c.permissionsFor(message.author).has(["SEND_MESSAGES", "VIEW_CHANNEL"])
    );
    if (allowedChannels.length === 0) {
      message.author.send(`Meillä ei valitettavasti ole riittäviä oikeuksia postailla ehdotuksia valitulla palvelimella.`);
      return;
    }
    const channelOptions = allowedChannels.map((c) => `${i++}. ${c.name}`);
    message.author.send(`Mille kanavalle laitetaan?\n${channelOptions.join("\n")}`);
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
      const channel = allowedChannels[parseInt(m.content) - 1];
      collectGame(channel, message);
    });
    collectorEnd(collector, message);
  }
};

const collectGuild = (message) => {
  if (message.client.guilds.cache.size === 1) {
    const firstGuild = message.client.guilds.cache.first();
    collectChannel(firstGuild, message);
  } else {
    let i = 1;
    const mutualGuilds = message.client.guilds.cache
      .filter((guild) => guild.members.cache.find((u) => u.id === message.author.id))
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

const planner = {
  name: "plan",
  description: "Suunnittele pelihetki.",
  cooldown: 5,
  usage: `[pelin nimi] [ajankohta] [keräysaika tunteina] [min pelaajaa] [max pelaajaa] [...vaihtoehdot (max ${reactOptions.length})]`,
  execute(message, args) {
    const input = args.join(" ");
    const regex = new RegExp('"[^"]+"|[\\S]+', "g");
    const arguments = [];
    if (input.match(regex)) {
      input.match(regex).forEach((element) => {
        if (!element) return;
        return arguments.push(element.replace(/"/g, ""));
      });
    }

    const argCountWithoutTimes = 5;
    if (arguments.length === 0) {
      if (message.channel.type === "dm") {
        collectGuild(message);
      } else {
        collectGame(message.channel, message);
      }
      return;
    } else if (arguments.length < argCountWithoutTimes + 1) {
      message.channel.send(`Liian vähän argumentteja. Anna nämä tiedot: ${planner.usage}.`);
      return;
    } else if (arguments.length > reactOptions.length + argCountWithoutTimes) {
      message.channel.send(`Liian monta aikavaihtoehtoa. ${reactOptions.length} on maksimi.`);
      return;
    } else if (isNaN(arguments[2]) || isNaN(arguments[3]) || isNaN(arguments[4])) {
      message.channel.send(`Minimi- ja maksimipelaajamäärä pitää olla numeroita.`);
      return;
    }

    publishPlan(
      message.channel,
      arguments[0],
      arguments[1],
      parseInt(arguments[2]),
      parseInt(arguments[3]),
      parseInt(arguments[4]),
      arguments.slice(5)
    );
  },
};

module.exports = planner;
