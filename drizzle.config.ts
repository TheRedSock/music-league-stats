import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const directDatabaseUrl =
  process.env.DATABASE_URL_DIRECT ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: directDatabaseUrl,
  },
  strict: true,
  verbose: true,
});
