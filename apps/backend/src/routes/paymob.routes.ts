import { Router, type Request, type Response } from 'express';

/** Paymob redirects the customer's browser here after checkout. */
export const paymobRouter = Router();

paymobRouter.get('/return', (_req: Request, res: Response) => {
  res
    .status(200)
    .type('html')
    .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Payment complete</title>
</head>
<body style="font-family: system-ui, sans-serif; text-align: center; padding: 2rem; color: #333;">
  <p>Payment complete.</p>
  <p style="color: #666;">You can return to the app.</p>
</body>
</html>`);
});
