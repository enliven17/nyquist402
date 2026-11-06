import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
// One fresh wallet and one scenario every 15 minutes; a run takes 2 to 7 minutes, so runs never overlap.
crons.interval("scenario run", { minutes: 15 }, internal.tester.run);
// Copy new contract events before RPC's seven-day retention drops them.
crons.interval("event ingest", { minutes: 5 }, internal.events.ingest);
// External health checks for /status.
crons.interval("status check", { minutes: 5 }, internal.status.check);
export default crons;
