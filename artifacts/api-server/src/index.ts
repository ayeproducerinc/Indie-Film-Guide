import app from "./app";
import { initializeBilling } from "./lib/billing";
import { startServer } from "./server-startup";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

startServer(app, port, initializeBilling);
