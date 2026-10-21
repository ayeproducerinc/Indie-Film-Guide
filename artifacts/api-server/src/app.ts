import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { processListingWebhook } from "./lib/billing";
import { FieldError } from "./lib/listing-validation";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res): Promise<void> => {
  const signature = req.get("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) { res.status(400).json({ error: "Missing webhook signature or raw payload." }); return; }
  try {
    await processListingWebhook(req.body, signature);
    res.json({ received: true });
  } catch {
    req.log.warn("Stripe webhook signature or processing failed; no unverified payment accepted");
    res.status(400).json({ error: "Webhook could not be verified or processed." });
  }
});
app.use(cookieParser());
app.use("/api", (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);
app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof FieldError) {
    res.status(400).json({ error: error.message, fields: error.fields }); return;
  }
  req.log.error({ message: error instanceof Error ? error.message : "Unknown server error" }, "Request failed");
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

export default app;
