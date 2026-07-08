import { app } from '@backend/app';
import { config } from '@backend/lib/config';
import { startPaymobReconciliationScheduler } from '@backend/services/paymob.service';

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[backend] listening on http://localhost:${config.port} (${config.nodeEnv})`);
  startPaymobReconciliationScheduler();
});
