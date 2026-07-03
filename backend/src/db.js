const { MongoClient } = require('mongodb');
const settings = require('./config');

let client;
let db;

async function connect() {
  if (db) return db;
  client = new MongoClient(settings.mongoUri);
  await client.connect();
  db = client.db(settings.mongoDb);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not connected. Call connect() first.');
  return db;
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = { connect, getDb, close };
