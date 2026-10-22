import type { Express } from "express";
import { logger } from "./lib/logger";

export function startServer(app: Express, port: number, initialize: () => Promise<void>) {
  // Bind before any external initialization. First live Stripe backfills can
  // take minutes; they must not hold up the publishing startup probe.
  return app.listen(port, "0.0.0.0", err => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exitCode = 1;
      return;
    }
    logger.info({ port }, "Server listening");
    void initialize().catch(() => {
      logger.error("Background billing initialization failed; checkout remains unavailable");
    });
  });
}
