import { MongoClient } from 'mongodb';

export async function connectDatabase(uri: string, databaseName: string) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(databaseName);
    await db.command({ ping: 1 });
    return {
      client,
      db,
      checkReady: async () => {
        await db.command({ ping: 1 }, { timeoutMS: 3000 });
      },
      close: () => client.close(),
    };
  } catch {
    await client.close();
    // Driver errors can contain topology/connection details. Do not expose them.
    throw new Error(
      'Atlas connection failed. Check private configuration, network access, and database-user permissions.',
    );
  }
}
