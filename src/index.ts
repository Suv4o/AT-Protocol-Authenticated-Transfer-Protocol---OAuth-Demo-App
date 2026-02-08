import { Agent } from "@atproto/api";
import { TID } from "@atproto/common-web";
import express from "express";
import { getIronSession } from "iron-session";
import { createDb, migrateToLatest } from "./db.js";
import { createOAuthClient } from "./auth.js";

const RECIPE_COLLECTION = "com.myrecipes.recipe";

type Session = { did?: string };

const port = Number(process.env.PORT) || 3000;
const cookieSecret = process.env.COOKIE_SECRET || "development-secret-key-min-32-chars!!";

async function main() {
  // Set up database and OAuth client
  const db = createDb(":memory:");
  await migrateToLatest(db);
  const oauthClient = await createOAuthClient(db);

  const app = express();
  app.use(express.urlencoded({ extended: true }));

  // Helper: get iron-session from request
  function getSession(req: express.Request, res: express.Response) {
    return getIronSession<Session>(req, res, {
      cookieName: "sid",
      password: cookieSecret,
    });
  }

  // Helper: get an authenticated Agent for the current session
  async function getSessionAgent(req: express.Request, res: express.Response) {
    const session = await getSession(req, res);
    if (!session.did) return null;
    try {
      const oauthSession = await oauthClient.restore(session.did);
      return oauthSession ? new Agent(oauthSession) : null;
    } catch {
      session.destroy();
      return null;
    }
  }

  // --- OAuth metadata endpoints ---

  app.get("/oauth-client-metadata.json", (_req, res) => {
    res.json(oauthClient.clientMetadata);
  });

  app.get("/.well-known/jwks.json", (_req, res) => {
    res.json(oauthClient.jwks);
  });

  // --- Auth routes ---

  app.get("/login", (_req, res) => {
    res.send(`
      <html>
      <head><title>Login — AT Protocol App</title></head>
      <body>
        <h1>Login</h1>
        <form action="/login" method="post">
          <input
            type="text"
            name="handle"
            placeholder="Enter your handle (e.g. alice.bsky.social)"
            required
          />
          <button type="submit">Log in</button>
        </form>
        <p><a href="/">Back to home</a></p>
      </body>
      </html>
    `);
  });

  app.post("/login", async (req, res) => {
    const handle = req.body?.handle;
    if (!handle) {
      res.status(400).send("Handle is required");
      return;
    }
    try {
      const url = await oauthClient.authorize(handle, {
        scope: "atproto transition:generic",
      });
      res.redirect(url.toString());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("OAuth authorize failed:", message);
      res.status(500).send(`<h1>Login failed</h1><p>${message}</p><a href="/login">Try again</a>`);
    }
  });

  app.get("/oauth/callback", async (req, res) => {
    try {
      const params = new URLSearchParams(req.originalUrl.split("?")[1]);
      const { session: oauthSession } = await oauthClient.callback(params);

      const session = await getSession(req, res);
      session.did = oauthSession.did;
      await session.save();

      res.redirect("/");
    } catch (err) {
      console.error("OAuth callback failed:", err);
      res.status(500).send(`<h1>Login failed</h1><a href="/login">Try again</a>`);
    }
  });

  app.post("/logout", async (req, res) => {
    const session = await getSession(req, res);
    session.destroy();
    res.redirect("/");
  });

  // --- App routes ---

  app.post("/post", async (req, res) => {
    const agent = await getSessionAgent(req, res);
    if (!agent) {
      res.redirect("/login");
      return;
    }
    const text = req.body?.text;
    if (!text) {
      res.status(400).send("Post text is required");
      return;
    }
    await agent.post({ text });
    res.redirect("/");
  });

  // --- Custom record (recipe) routes ---

  app.post("/recipe", async (req, res) => {
    const agent = await getSessionAgent(req, res);
    if (!agent) {
      res.redirect("/login");
      return;
    }
    const { title, ingredients, steps } = req.body;
    if (!title || !ingredients || !steps) {
      res.status(400).send("Title, ingredients, and steps are required");
      return;
    }
    await agent.com.atproto.repo.putRecord({
      repo: agent.assertDid,
      collection: RECIPE_COLLECTION,
      rkey: TID.nextStr(),
      record: {
        $type: RECIPE_COLLECTION,
        title,
        ingredients: ingredients.split("\n").filter((line: string) => line.trim()),
        steps: steps.split("\n").filter((line: string) => line.trim()),
        createdAt: new Date().toISOString(),
      },
    });
    res.redirect("/recipes");
  });

  app.get("/recipes", async (req, res) => {
    const agent = await getSessionAgent(req, res);
    if (!agent) {
      res.redirect("/login");
      return;
    }
    const { data } = await agent.com.atproto.repo.listRecords({
      repo: agent.assertDid,
      collection: RECIPE_COLLECTION,
      limit: 20,
    });

    const recipesHtml = data.records.length
      ? data.records
          .map((record) => {
            const r = record.value as {
              title?: string;
              ingredients?: string[];
              steps?: string[];
              createdAt?: string;
            };
            const ingredientsList = (r.ingredients || [])
              .map((i) => `<li>${i}</li>`)
              .join("");
            const stepsList = (r.steps || [])
              .map((s, idx) => `<li>${s}</li>`)
              .join("");
            return `
              <div style="border:1px solid #ccc; padding:12px; margin-bottom:12px;">
                <h3>${r.title}</h3>
                <p><em>${r.createdAt}</em></p>
                <strong>Ingredients:</strong>
                <ul>${ingredientsList}</ul>
                <strong>Steps:</strong>
                <ol>${stepsList}</ol>
              </div>
            `;
          })
          .join("")
      : "<p>No recipes yet. Go add one!</p>";

    res.send(`
      <html>
      <head><title>My Recipes — AT Protocol App</title></head>
      <body>
        <h1>Your Recipes</h1>
        ${recipesHtml}
        <p><a href="/">Back to home</a></p>
      </body>
      </html>
    `);
  });

  // --- Home page ---

  app.get("/", async (req, res) => {
    const agent = await getSessionAgent(req, res);

    if (!agent) {
      res.send(`
        <html>
        <head><title>AT Protocol App</title></head>
        <body>
          <h1>AT Protocol Demo</h1>
          <p>A simple app using AT Protocol OAuth.</p>
          <a href="/login">Login with Bluesky</a>
        </body>
        </html>
      `);
      return;
    }

    // Fetch profile
    const { data: profile } = await agent.getProfile({
      actor: agent.assertDid,
    });

    // Fetch recent posts
    const { data: feed } = await agent.getAuthorFeed({
      actor: agent.assertDid,
      limit: 5,
    });

    const postsHtml = feed.feed
      .map((item) => {
        const record = item.post.record as { text?: string; createdAt?: string };
        return `<li><strong>${record.createdAt}</strong>: ${record.text}</li>`;
      })
      .join("\n");

    res.send(`
      <html>
      <head><title>AT Protocol App</title></head>
      <body>
        <h1>Welcome, ${profile.displayName || profile.handle}!</h1>
        <p>Handle: @${profile.handle}</p>
        <p>DID: ${profile.did}</p>
        <p>Followers: ${profile.followersCount} | Following: ${profile.followsCount} | Posts: ${profile.postsCount}</p>

        <h2>Create a Post</h2>
        <form action="/post" method="post">
          <textarea name="text" rows="3" cols="50" placeholder="What's on your mind?" required></textarea>
          <br/>
          <button type="submit">Post</button>
        </form>

        <h2>Your Recent Posts</h2>
        <ul>${postsHtml}</ul>

        <hr/>

        <h2>Save a Recipe (Custom Record)</h2>
        <form action="/recipe" method="post">
          <label>Title:</label><br/>
          <input type="text" name="title" placeholder="e.g. Banana Bread" required style="width:300px;"/>
          <br/><br/>
          <label>Ingredients (one per line):</label><br/>
          <textarea name="ingredients" rows="4" cols="50" placeholder="3 bananas&#10;1 cup sugar&#10;2 cups flour" required></textarea>
          <br/><br/>
          <label>Steps (one per line):</label><br/>
          <textarea name="steps" rows="4" cols="50" placeholder="Mash bananas&#10;Mix ingredients&#10;Bake at 180C for 50 min" required></textarea>
          <br/><br/>
          <button type="submit">Save Recipe</button>
        </form>
        <p><a href="/recipes">View your recipes</a></p>

        <hr/>

        <form action="/logout" method="post">
          <button type="submit">Logout</button>
        </form>
      </body>
      </html>
    `);
  });

  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
