import { MongoClient, type Db } from "mongodb";

export async function connectMongo(url: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(url);
  await client.connect();
  return { client, db: client.db() };
}
