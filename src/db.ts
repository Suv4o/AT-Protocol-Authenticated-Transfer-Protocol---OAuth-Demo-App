import Database from "better-sqlite3";
import { Kysely, Migration, Migrator, SqliteDialect } from "kysely";

export interface DatabaseSchema {
  auth_state: {
    key: string;
    state: string;
  };
  auth_session: {
    key: string;
    session: string;
  };
}

const migrations: Record<string, Migration> = {
  "001": {
    async up(db: Kysely<unknown>) {
      await db.schema
        .createTable("auth_state")
        .addColumn("key", "varchar", (col) => col.primaryKey())
        .addColumn("state", "varchar", (col) => col.notNull())
        .execute();

      await db.schema
        .createTable("auth_session")
        .addColumn("key", "varchar", (col) => col.primaryKey())
        .addColumn("session", "varchar", (col) => col.notNull())
        .execute();
    },
    async down(db: Kysely<unknown>) {
      await db.schema.dropTable("auth_session").execute();
      await db.schema.dropTable("auth_state").execute();
    },
  },
};

export function createDb(location: string): Kysely<DatabaseSchema> {
  return new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({
      database: new Database(location),
    }),
  });
}

export async function migrateToLatest(db: Kysely<DatabaseSchema>) {
  const migrator = new Migrator({
    db,
    provider: {
      async getMigrations() {
        return migrations;
      },
    },
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
}
