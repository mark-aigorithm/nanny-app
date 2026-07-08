// Vercel serverless entry: export the Express app instead of listening on a
// port. The Paymob reconciliation scheduler is intentionally not started here
// — long-lived intervals don't survive serverless invocations.
import { app } from '@backend/app';

export default app;
