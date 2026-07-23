import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";

let queryClient: ReturnType<typeof postgres> | undefined;

function createDatabase(databaseUrl: string) {
  queryClient = postgres(databaseUrl, {
    max: 3,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return drizzle(queryClient, { schema });
}

export type Database = ReturnType<typeof createDatabase>;

let database: Database | undefined;

export function getDb(): Database {
  if (database) {
    return database;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required when a database query is executed.",
    );
  }

  database = createDatabase(databaseUrl);
  return database;
}

export const db = new Proxy({} as Database, {
  get(_target, property) {
    const activeDatabase = getDb();
    const value = Reflect.get(activeDatabase, property, activeDatabase);

    return typeof value === "function" ? value.bind(activeDatabase) : value;
  },
});

export async function closeDb(): Promise<void> {
  if (queryClient) {
    await queryClient.end({ timeout: 5 });
  }

  queryClient = undefined;
  database = undefined;
}
