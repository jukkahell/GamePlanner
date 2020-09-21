## Running locally
Create Postgres database and user. See package.json's migrate script to check what it expects local DB values (note the port!) to be.
```
CREATE DATABASE gameplanner;
CREATE USER gameplanner WITH ENCRYPTED PASSWORD 'password';
GRANT ALL PRIVILEGES ON DATABASE gameplanner TO gameplanner;
```

Enable uuid-extension for Postgres by running:
```
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```
  
Create config.json to the root of the project. Structure should be like this:
```
{
  "token": "REPLACE_WITH_THE_REAL_DISCORD_BOT_TOKEN",
  "prefix": "!",
  "db": {
    "host": "localhost",
    "port": 5433,
    "database": "gameplanner",
    "user": "gameplanner",
    "password": "password"
  }
}
```

Run `npm run migrate-up` to get the DB intitalized.  
Run `npm start` to start the bot.

Invite the bot you channel(s) by opening this link with your bot's client_id: https://discord.com/api/oauth2/authorize?client_id=123456789098765432&permissions=268438592&scope=bot

Bot requires `View Channel` and `Send Messages` permissions for planning. `Manage Roles` permission is required to enable game role subscribing for users. Game roles allows bot to notify people when a plan for certain game is published.