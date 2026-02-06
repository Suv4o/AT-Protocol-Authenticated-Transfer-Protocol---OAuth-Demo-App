# AT Protocol (Authenticated Transfer Protocol) - OAuth Demo App

A simple Node.js/TypeScript web app that authenticates users via AT Protocol OAuth and lets them view their profile and create posts on Bluesky.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20.6 or later)

## Project Structure

```
AT-Protocol/
├── src/
│   ├── index.ts   # Express server with all routes
│   ├── auth.ts    # OAuth client setup and session/state stores
│   └── db.ts      # SQLite database setup with Kysely
├── .env           # Environment variables
├── package.json
└── README.md
```

## Getting Started

### 1. Install dependencies

```bash
cp .env.example .env
npm install
```

### 2. Configure environment variables

Copy the example below into a `.env` file in the project root:

```
PORT=3000
COOKIE_SECRET=super-secret-cookie-key-for-development
```

- `PORT` — The port the server runs on (default: `3000`)
- `COOKIE_SECRET` — Secret used to encrypt session cookies (must be at least 32 characters)

### 3. Run the app

**Development** (auto-restarts on file changes):

```bash
npm run dev
```

**Production**:

```bash
npm start
```

### 4. Open in your browser

Go to [http://localhost:3000](http://localhost:3000).

## How It Works

### OAuth Login Flow

1. User visits the home page and clicks **Login with Bluesky**
2. User enters their Bluesky handle (e.g. `alice.bsky.social`)
3. The app redirects the user to their Bluesky server for authorization
4. After the user approves, Bluesky redirects back to `/oauth/callback`
5. The app stores the user's DID in an encrypted cookie session
6. The user is redirected to the home page, now logged in

### Once Logged In

- **Profile** — The home page displays the user's display name, handle, DID, and follower/following/post counts
- **Create a Post** — A text form lets the user publish a post to Bluesky
- **Recent Posts** — The last 5 posts from the user's feed are listed
- **Logout** — Destroys the session

### Routes

| Method | Path                          | Description                                   |
| ------ | ----------------------------- | --------------------------------------------- |
| `GET`  | `/`                           | Home page (login link or profile + post form) |
| `GET`  | `/login`                      | Login page with handle input                  |
| `POST` | `/login`                      | Initiates OAuth flow                          |
| `GET`  | `/oauth/callback`             | OAuth callback — completes authentication     |
| `POST` | `/post`                       | Creates a new Bluesky post                    |
| `POST` | `/logout`                     | Destroys session and redirects to home        |
| `GET`  | `/oauth-client-metadata.json` | Serves OAuth client metadata                  |
| `GET`  | `/.well-known/jwks.json`      | Serves JWKS (empty in loopback mode)          |

## Key Technologies

- [tsx](https://tsx.is/) — Runs TypeScript directly without a build step
- [@atproto/api](https://github.com/bluesky-social/atproto) — AT Protocol API client
- [@atproto/oauth-client-node](https://github.com/bluesky-social/atproto) — AT Protocol OAuth for Node.js
- [Express](https://expressjs.com/) — Web server
- [iron-session](https://github.com/vvo/iron-session) — Encrypted cookie sessions
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) + [Kysely](https://kysely.dev/) — SQLite database for OAuth state/session storage

## How the Code is Organized

### `src/db.ts`

Sets up an in-memory SQLite database with two tables:

- `auth_state` — Stores temporary OAuth flow state
- `auth_session` — Stores persisted OAuth sessions

Uses Kysely migrations to create the tables on startup.

### `src/auth.ts`

- `StateStore` / `SessionStore` — Implement the storage interfaces required by `@atproto/oauth-client-node`, backed by the SQLite database
- `createOAuthClient()` — Creates a `NodeOAuthClient` in **loopback mode** (for local development — no public URL or private keys needed)

### `src/index.ts`

The Express server. On startup it:

1. Creates the database and runs migrations
2. Creates the OAuth client
3. Registers all routes
4. Starts listening on the configured port

## Notes

- This app uses **loopback OAuth mode**, which is designed for local development. For production, you would need a public URL, HTTPS, and private keys for a confidential client.
- The database is **in-memory** — sessions are lost when the server restarts.
- The `--env-file=.env` flag (used in the npm scripts) is a Node.js feature that loads environment variables without needing the `dotenv` library.

## Resources

- [AT Protocol Introduction](https://atproto.com/)
- [AT Protocol Quick Start](https://atproto.com/guides/applications)
- [AT Protocol OAuth Guide](https://atproto.com/guides/oauth)
- [AT Protocol SDKs](https://atproto.com/sdks)
- [ATProto Hacker Cookbook](https://github.com/bluesky-social/cookbook/)
- [Statusphere Example App](https://github.com/bluesky-social/statusphere-example-app)
