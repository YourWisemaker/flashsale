import { MongoClient, type Db, type MongoClientOptions } from "mongodb";

export async function connectMongo(url: string, options: MongoClientOptions = {}): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(url, options);
  await client.connect();
  return { client, db: client.db() };
}
