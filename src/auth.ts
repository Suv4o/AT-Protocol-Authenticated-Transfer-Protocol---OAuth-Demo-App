import {
  NodeOAuthClient,
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from "@atproto/oauth-client-node";
import { Kysely } from "kysely";
import type { DatabaseSchema } from "./db.js";

export class StateStore implements NodeSavedStateStore {
  constructor(private db: Kysely<DatabaseSchema>) {}

  async get(key: string): Promise<NodeSavedState | undefined> {
    const result = await this.db
      .selectFrom("auth_state")
      .selectAll()
      .where("key", "=", key)
      .executeTakeFirst();
    if (!result) return undefined;
    return JSON.parse(result.state) as NodeSavedState;
  }

  async set(key: string, val: NodeSavedState) {
    const state = JSON.stringify(val);
    await this.db
      .insertInto("auth_state")
      .values({ key, state })
      .onConflict((oc) => oc.doUpdateSet({ state }))
      .execute();
  }

  async del(key: string) {
    await this.db.deleteFrom("auth_state").where("key", "=", key).execute();
  }
}

export class SessionStore implements NodeSavedSessionStore {
  constructor(private db: Kysely<DatabaseSchema>) {}

  async get(key: string): Promise<NodeSavedSession | undefined> {
    const result = await this.db
      .selectFrom("auth_session")
      .selectAll()
      .where("key", "=", key)
      .executeTakeFirst();
    if (!result) return undefined;
    return JSON.parse(result.session) as NodeSavedSession;
  }

  async set(key: string, val: NodeSavedSession) {
    const session = JSON.stringify(val);
    await this.db
      .insertInto("auth_session")
      .values({ key, session })
      .onConflict((oc) => oc.doUpdateSet({ session }))
      .execute();
  }

  async del(key: string) {
    await this.db
      .deleteFrom("auth_session")
      .where("key", "=", key)
      .execute();
  }
}

export async function createOAuthClient(db: Kysely<DatabaseSchema>) {
  const port = process.env.PORT || "3000";

  const client = new NodeOAuthClient({
    clientMetadata: {
      client_name: "AT Protocol Demo App",
      client_id: `http://localhost?redirect_uri=${encodeURIComponent(`http://127.0.0.1:${port}/oauth/callback`)}&scope=${encodeURIComponent("atproto transition:generic")}`,
      client_uri: `http://127.0.0.1:${port}`,
      redirect_uris: [`http://127.0.0.1:${port}/oauth/callback`],
      scope: "atproto transition:generic",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      application_type: "web",
      token_endpoint_auth_method: "none",
      dpop_bound_access_tokens: true,
    },
    stateStore: new StateStore(db),
    sessionStore: new SessionStore(db),
  });

  return client;
}
