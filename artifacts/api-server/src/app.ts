import { Hono } from "hono";
import { cors } from "hono/cors";
import accessRouter from "./routes/access";

export type Bindings = {
  SESSION_SECRET: string;
  WHATSAPP_GROUP_INVITE_URL: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

app.get("/", (c) => c.json({ status: "ok" }));
app.get("/healthz", (c) => c.json({ status: "ok" }));
app.get("/api/healthz", (c) => c.json({ status: "ok" }));

app.route("/api", accessRouter);

export default app;
