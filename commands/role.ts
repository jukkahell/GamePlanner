import { Command } from "./command.interface";
import { Message, CollectorFilter, Guild, MessageCollector, Role } from "discord.js";
import { reactOptions } from "../utils/reactoptions";

type RoleAction = "add" | "remove";

const ROLE_COLOR = 16762624;
const timeout = 60000;
const collectRolesTimeoutMin = 1;

const unifiedRoleNamesMatch = (name1: string, name2: string) => {
  return name1.replace(' ', '').toLowerCase() === name2.replace(' ', '').toLowerCase();
};

const collectorEnd = (collector: MessageCollector, message: Message) => {
  collector.on("end", (collected) => {
    if (collected.size === 0) {
      message.author.send(`En jaksanut odottaa enempää. Huutele !role uudestaan kun tiedät vastauksen.`);
    }
  });
};

const addNewGame = async (message: Message, guild: Guild, name: string) => {
  let createdRole = null;
  try {
    createdRole = await guild.roles.create({
      data: {
        name,
        color: ROLE_COLOR,
        mentionable: true,
      },
      reason: `Added by GamePlanner for ${message.author.tag}`,
    });
  } catch (err) {
    message.author.send(`En saanut lisättyä peliroolia **${name}**. Kysele palvelimen **${guild.name}** admineilta tai botin kehittäjiltä mikä meni vikaan.`);
    return;
  }

  if (createdRole) {
    guild.members.cache.find(member => member.id === message.author.id).roles.add(createdRole);
    message.author.send(`Rooli lisätty`);
  }
};

const verifyDuplicate = async (message: Message, guild: Guild, duplicateRoles: Role[], name: string) => {
  let duplicateRolesText = "";
  for (let i = 0; i < duplicateRoles.length; i++) {
    const role = duplicateRoles[i];
    duplicateRolesText += `- ${role.name}\n`;
  }
  const dm = await message.author.send(`Palvelimelta ${guild.name} löytyy jo rooli/rooleja seuraavilla nimillä. Halutko silti lisätä peliroolin ${name} (k/e)?\n${duplicateRolesText}`);

  const collector = dm.channel.createMessageCollector(
    (m: Message) =>
      (m.content === 'k' || m.content === 'e') &&
      m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", async (m: Message) => {
    collector.stop();
    const answer = m.content;
    if (answer === 'k') {
      addNewGame(message, guild, name);
    } else {
      message.author.send(`En lisännyt. Kirjoita palvelimella ${guild.name} \`!role add "${name}"\`, jos haluat lisätä kyseisen peliroolin itsellesi.`);
    }
  });
  collectorEnd(collector, message);
};

const askNewGameName = async (message: Message, guild: Guild) => {
  const dm = await message.author.send(`Mikä on pelin nimi?`);
  const collector = dm.channel.createMessageCollector(
    (m: Message) =>
      m.content.length >= 2 &&
      m.author.id === message.author.id,
    { time: timeout }
  );
  collector.on("collect", async (m: Message) => {
    collector.stop();
    const name = m.content;
    const duplicateResult = guild.roles.cache.filter(role => unifiedRoleNamesMatch(role.name, name)).map((r) => r);
    if (duplicateResult.length > 0) {
      // Don't allow identical match
      if (duplicateResult.some(role => role.name === name)) {
        message.author.send(`Palvelimelta ${guild.name} löytyy jo rooli nimellä ${name}`);
      } else {
        verifyDuplicate(message, guild, duplicateResult, name);
      }
    } else {
      addNewGame(message, guild, name);
    }
  });
  collectorEnd(collector, message);
};

const multipleRolesFound = (message: Message, guild: Guild, roles: Role[], name: string, roleAction: RoleAction) => {
  let matchingRoleNames = "";
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    matchingRoleNames += `${reactOptions[i]} ${role.name}\n`;
  }
  const actionText = roleAction === "add" ? "lisätä" : "poistaa";

  message.author
  .send(`Palvelimelta **${guild.name}** löytyi useampi pelirooli joka täsmää nimeen **${name}**.\nVoit ${actionText} useamman äänestämällä haluttuja vaihtoehtoja.\n${matchingRoleNames}`)
  .then(async m => {
    try {
      for (let i = 0; i < roles.length + 1; i++) {
        await m.react(reactOptions[i]);
      }
      const filter: CollectorFilter = (reaction) => {
        return reactOptions.indexOf(reaction.emoji.name) >= 0;
      };
      const collector = m.createReactionCollector(filter, { dispose: true, time: collectRolesTimeoutMin * 60 * 1000 });
      collector.on("collect", (reaction, user) => {
        const votedOptionIndex = reactOptions.indexOf(reaction.emoji.name);
        if (votedOptionIndex < roles.length) {
          try {
            if (roleAction === "add") {
              guild.members.cache.find(member => member.id === message.author.id).roles.add(roles[votedOptionIndex]);
            } else if (roleAction == "remove") {
              guild.members.cache.find(member => member.id === message.author.id).roles.remove(roles[votedOptionIndex]);
            }
          } catch(err) {
            console.error(`Unable to add role ${roles[votedOptionIndex].id} for user ${user.id}`, err.stack);
          }
        }
      });
      collector.on("end", (_collected) => {
        m.delete();
      });
    } catch (error) {
      console.error("One of the emojis failed to react.", error);
    }
  });
};

const addExistingRole = async (message: Message, guild: Guild, name: string) => {
  const userRoleIds = guild.members.cache.find(m => m.id === message.author.id).roles.cache.map(ur => ur.id);
  const roles = guild.roles.cache.filter(role => role.color === ROLE_COLOR && !userRoleIds.includes(role.id)).map(r => r);
  const role = roles.filter(r => unifiedRoleNamesMatch(r.name, name));
  if (role.length === 0) {
    message.author.send(`Palvelimelta **${guild.name}** ei löytynyt yhtään peliroolia nimellä **${name}** tai rooli on jo lisätty.`);
  }
  else if (role.length > 1) {
    multipleRolesFound(message, guild, role, name, "add");
  }
  else if (role.length === 1) {
    guild.members.cache.find(member => member.id === message.author.id).roles.add(role[0]);
    message.author.send(`Rooli lisätty.`);
  }
};

const removeExistingRole = async (message: Message, guild: Guild, name: string) => {
  const userRoleIds = guild.members.cache.find(m => m.id === message.author.id).roles.cache.map(ur => ur.id);
  const roles = guild.roles.cache.filter(role => role.color === ROLE_COLOR && userRoleIds.includes(role.id)).map(r => r);
  const role = roles.filter(r => unifiedRoleNamesMatch(r.name, name));
  if (role.length === 0) {
    message.author.send(`Sinulta ei löytynyt yhtään peliroolia palvelimelta **${guild.name}** nimellä **${name}**`);
  }
  else if (role.length > 1) {
    multipleRolesFound(message, guild, role, name, "remove");
  }
  else if (role.length === 1) {
    guild.members.cache.find(member => member.id === message.author.id).roles.remove(role[0]);
    message.author.send(`Rooli poistettu.`);
  }
};

const addNewRoles = async (message: Message, guild: Guild) => {
  const userRoleIds = guild.members.cache.find(m => m.id === message.author.id).roles.cache.map(ur => ur.id);
  const roles = guild.roles.cache.filter(role => role.color === ROLE_COLOR && !userRoleIds.includes(role.id)).map(r => r);
  let optionsText = "";
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    optionsText += `${reactOptions[i]} ${role.name}\n`;
  }
  optionsText += `${reactOptions[roles.length]} Lisää uusi peli`;

  message.author
    .send(`Anna vote peleille, joita pelaat ja joista haluat ilmoituksen, kun pelaajia etsitään. Kerään voteja ${collectRolesTimeoutMin}min.\n${optionsText}`)
    .then(async (m) => {
      try {
        for (let i = 0; i < roles.length + 1; i++) {
          await m.react(reactOptions[i]);
        }
        const filter: CollectorFilter = (reaction) => {
          return reactOptions.indexOf(reaction.emoji.name) >= 0;
        };
        const collector = m.createReactionCollector(filter, { dispose: true, time: collectRolesTimeoutMin * 60 * 1000 });
        collector.on("collect", (reaction, user) => {
          const votedOptionIndex = reactOptions.indexOf(reaction.emoji.name);
          // Game selected?
          if (votedOptionIndex < roles.length) {
            try {
              guild.members.cache.find(member => member.id === message.author.id).roles.add(roles[votedOptionIndex]);
            } catch(err) {
              console.error(`Unable to add role ${roles[votedOptionIndex].id} for user ${user.id}`, err.stack);
            }
          } else {
            askNewGameName(message, guild);
          }
        });
        collector.on("end", (_collected) => {
          m.delete();
        });
      } catch (error) {
        console.error("One of the emojis failed to react.", error);
      }
    });
};

const removeRoles = async (message: Message, guild: Guild) => {
  const userRoleIds = guild.members.cache.find(m => m.id === message.author.id).roles.cache.map(ur => ur.id);
  const roles = guild.roles.cache.filter(role => role.color === ROLE_COLOR && userRoleIds.includes(role.id)).map(r => r);

  if (roles.length === 0) {
    message.author.send(`Sinulla ei ole yhtään peliroolia palvelimella ${guild.name}`);
    return;
  }

  let optionsText = "";
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i];
    optionsText += `${reactOptions[i]} ${role.name}\n`;
  }

  message.author
    .send(`Anna vote peleille, joista et halua enää ilmoituksia. Kerään voteja ${collectRolesTimeoutMin}min.\n${optionsText}`)
    .then(async (m) => {
      try {
        for (let i = 0; i < roles.length; i++) {
          await m.react(reactOptions[i]);
        }
        const filter: CollectorFilter = (reaction) => {
          return reactOptions.indexOf(reaction.emoji.name) >= 0;
        };
        const collector = m.createReactionCollector(filter, { dispose: true, time: collectRolesTimeoutMin * 60 * 1000 });
        collector.on("collect", (reaction, user) => {
          const votedOptionIndex = reactOptions.indexOf(reaction.emoji.name);
          if (votedOptionIndex < roles.length) {
            try {
              guild.members.cache.find(member => member.id === message.author.id).roles.remove(roles[votedOptionIndex]);
            } catch(err) {
              console.error(`Unable to add role ${roles[votedOptionIndex].id} for user ${user.id}`, err.stack);
            }
          }
        });
        collector.on("end", (_collected) => {
          m.delete();
        });
      } catch (error) {
        console.error("One of the emojis failed to react.", error);
      }
    });
};

const executeRoleAction = (message: Message, guild: Guild, roleAction: RoleAction) => {
  switch(roleAction) {
    case "add":
      addNewRoles(message, guild);
      break;
    case "remove":
      removeRoles(message, guild);
      break;
  }
};

const collectGuild = (message: Message, roleAction: RoleAction) => {
  if (message.client.guilds.cache.size === 1) {
    const firstGuild = message.client.guilds.cache.first();
    executeRoleAction(message, firstGuild, roleAction);
  } else {
    let i = 1;
    const mutualGuilds = message.client.guilds.cache
      .filter((guild) => guild.members.cache.some((u) => u.id === message.author.id))
      .map((g) => g);
    const guildOptions = mutualGuilds.map((guild) => `**${i++}**. ${guild.name}`);
    const roleActionText = roleAction === "add" ? "lisätä" : "poistaa";
    message.author.send(`Millä palvelimella haluat ${roleActionText} rooleja?\n${guildOptions.join("\n")}`).then(dm => {
      const collector = dm.channel.createMessageCollector(
        (m: Message) =>
          !isNaN(<any> m.content) &&
          parseInt(m.content) >= 1 &&
          parseInt(m.content) <= i - 1 &&
          m.author.id === message.author.id,
        { time: timeout }
      );
      collector.on("collect", (m: Message) => {
        collector.stop();
        const guild = mutualGuilds[parseInt(m.content) - 1];
        executeRoleAction(message, guild, roleAction);
      });
      collectorEnd(collector, message);
    });
  }
};

const askForAction = (message: Message, guild: Guild = null) => {
  message.author.send(
    `Mitä halut tehdä?
**1**. Lisätä itsellesi rooleja
**2**. Poistaa itseltäsi rooleja`).then(dm => {

    const collector = dm.channel.createMessageCollector(
      (m: Message) =>
        !isNaN(<any> m.content) &&
        parseInt(m.content) >= 1 &&
        parseInt(m.content) <= 2 &&
        m.author.id === message.author.id,
      { time: timeout }
    );
    collector.on("collect", (m: Message) => {
      collector.stop();
      const roleAction: RoleAction = parseInt(m.content) == 1 ? "add" : "remove";
      if (!guild) {
        collectGuild(message, roleAction);
      } else {
        executeRoleAction(message, guild, roleAction);
      }
    });
    collectorEnd(collector, message);
  });
};

const roleAssigner: Command = {
  name: "role",
  description: "Pyydä tai poista roolia mille tahansa pelille.",
  cooldown: 5,
  usage: `[add|remove] ["pelin nimi"]`,
  async execute(message, args) {
    const input = args.join(" ");
    const regex = new RegExp('"[^"]+"|[\\S]+', "g");
    const parsedArgs: any = [];
    if (input.match(regex)) {
      input.match(regex).forEach((element) => {
        if (!element) return;
        return parsedArgs.push(element.replace(/"/g, ""));
      });
    }

    if (message.channel.type === "dm") {
      askForAction(message);
      return;
    }

    if (parsedArgs.length === 0) {
      askForAction(message, message.channel.guild);
    } else if (parsedArgs.length !== 2 || !["add", "remove"].includes(parsedArgs[0])) {
      message.channel.send(`Annetut argumentit ei kelpaa. Anna nämä tiedot: ${roleAssigner.usage}.`);
    } else {
      if (parsedArgs[0] === "add") {
        addExistingRole(message, message.channel.guild, parsedArgs[1]);
      } else {
        removeExistingRole(message, message.channel.guild, parsedArgs[1]);
      }
    }
  },
};

module.exports = roleAssigner;
