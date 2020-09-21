import { Pool, QueryResult } from "pg";
import config = require("./config.json");

export interface DB {
  query: <T>(text: string, params: any[]) => Promise<QueryResult<T>>;
}

const pool = new Pool({
  user: config.db.user,
  host: config.db.host,
  database: config.db.database,
  password: config.db.password,
  port: config.db.port,
});

pool.connect(err => {
  if (err) {
    console.error('DB connection error', err.stack);
  } else {
    console.log(`Connected to ${config.db.host}:${config.db.port}/${config.db.database}`);
  }
});

export const db: DB = {
  query: <T> (text: string, params: any[]): Promise<QueryResult<T>> => {
    try {
      return pool.query(text, params);
    } catch (err) {
        throw Error(err.stack);
    }
  }
};