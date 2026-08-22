/*
 * The other side of a two-sided journey, driven over HTTP.
 *
 * Maestro drives exactly one surface: the app, signed in as one person. But
 * most P0 journeys need a second actor — a nanny who claims the request, checks
 * in, writes a care log and checks out, or an operator who verifies someone's
 * identity. Running a second UI driver alongside the first is the expensive way
 * to do that; this is the cheap one, and it is the same choice the admin suite
 * makes when it needs the mobile side to move.
 *
 * Invoked from a flow as:
 *
 *   - runScript:
 *       file: ../scripts/advance.js
 *       env:
 *         ADVANCE: nanny-accept
 *
 * and it leaves `output.bookingId` / `output.status` behind for the flow to
 * assert on.
 *
 * ── Notes on the runtime ────────────────────────────────────────────────────
 * This runs on the HOST, not the device, in Maestro's own JS sandbox — so
 * `127.0.0.1` is the machine's loopback (no `10.0.2.2`) and there is no
 * `fetch`, no `require`, and no module system. That last one is why every
 * helper lives in this one file rather than a shared module, and why the whole
 * cross-surface seam is a switch at the bottom instead of a script per step.
 *
 * `-e` values passed to `maestro test` arrive as globals — the accounts
 * (MOTHER_EMAIL, NANNY_EMAIL, GATED_MOTHER_EMAIL, PENDING_NANNY_EMAIL,
 * PASSWORD, ADMIN_EMAIL, ADMIN_PASSWORD) and where to reach things
 * (BACKEND_URL, AUTH_EMULATOR_URL). See run.mjs for the full list.
 */

/** The emulator ignores the key but the endpoint still requires the parameter. */
var IDENTITY_TOOLKIT = AUTH_EMULATOR_URL + '/identitytoolkit.googleapis.com/v1';

function signIn(email, password) {
  var res = http.post(IDENTITY_TOOLKIT + '/accounts:signInWithPassword?key=fake-api-key', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email,
      password: password === undefined ? PASSWORD : password,
      returnSecureToken: true,
    }),
  });
  var body = json(res.body);
  if (!body.idToken) {
    throw new Error('Sign-in failed for ' + email + ': ' + res.status + ' ' + res.body);
  }
  return body.idToken;
}

/**
 * Unwraps the API's `{ data, error }` envelope, and turns a failure into a
 * message that says which call failed rather than "undefined is not an object"
 * three lines later.
 */
function call(method, token, path, payload) {
  var options = { headers: { Authorization: 'Bearer ' + token } };
  if (method === 'POST') {
    // Always a body, even for the routes that take none: Maestro's HTTP client
    // refuses a POST without one ("method POST must have a request body"), and
    // an empty object passes straight through a route with no body schema.
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(payload === undefined ? {} : payload);
  }
  var res = method === 'GET' ? http.get(BACKEND_URL + path, options)
                             : http.post(BACKEND_URL + path, options);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(method + ' ' + path + ' → ' + res.status + ' ' + res.body);
  }
  return json(res.body).data;
}

/**
 * The booking this run is about.
 *
 * The newest one the mother owns: the seeder soft-deletes everything a previous
 * run left behind, and a flow creates exactly one booking, so "newest" is
 * unambiguous — and it avoids threading an id through every step of the flow.
 */
function currentBooking(motherToken) {
  var bookings = call('GET', motherToken, '/bookings');
  if (!bookings || bookings.length === 0) throw new Error('The mother has no bookings.');
  var newest = bookings[0];
  for (var i = 1; i < bookings.length; i++) {
    if (bookings[i].id > newest.id) newest = bookings[i];
  }
  return newest;
}

function record(booking) {
  output.bookingId = String(booking.id);
  output.status = booking.status;
}

// ── The steps ───────────────────────────────────────────────────────────────

/**
 * A nanny claims the broadcast request, which moves it PENDING → APPROVED and
 * makes it payable. Deliberately goes through the pool the app itself reads
 * rather than accepting an id the flow already knows: if the request never
 * reached the pool — wrong radius, missing skill, an unapproved nanny — that is
 * a real defect, and this is where it surfaces.
 */
function nannyAccept() {
  var nannyToken = signIn(NANNY_EMAIL);
  var available = call('GET', nannyToken, '/bookings/available');
  if (!available || available.length === 0) {
    throw new Error('No request reached the nanny pool — nothing to accept.');
  }
  var target = available[0];
  for (var i = 1; i < available.length; i++) {
    if (available[i].id > target.id) target = available[i];
  }
  record(call('POST', nannyToken, '/bookings/' + target.id + '/accept'));
}

/**
 * The nanny starts the shift.
 *
 * Check-in is PIN-gated: the parent reveals a four-digit code and reads it out.
 * That card only renders within fifteen minutes of the start time, so the PIN
 * is minted here, as the mother, over the same route her tap would call.
 */
function nannyCheckIn() {
  var motherToken = signIn(MOTHER_EMAIL);
  var booking = currentBooking(motherToken);
  var pin = call('POST', motherToken, '/bookings/' + booking.id + '/start-pin').pin;

  var nannyToken = signIn(NANNY_EMAIL);
  record(call('POST', nannyToken, '/bookings/' + booking.id + '/check-in', { pin: pin }));
}

/** One care log, which is what the parent reads on the booking's own screen. */
function nannyCareLog() {
  var motherToken = signIn(MOTHER_EMAIL);
  var booking = currentBooking(motherToken);

  var nannyToken = signIn(NANNY_EMAIL);
  call('POST', nannyToken, '/bookings/' + booking.id + '/care-logs', {
    type: 'MEAL',
    notes: CARE_LOG_NOTE,
  });
  record(booking);
}

/**
 * The nanny agrees to stay longer.
 *
 * The extension's id is read off the mother's own booking rather than tracked
 * by the flow: `activeExtension` is exactly what her screen is rendering at
 * this moment, so acting on it is acting on what she asked for.
 */
function nannyAcceptExtension() {
  var motherToken = signIn(MOTHER_EMAIL);
  var booking = currentBooking(motherToken);
  var extension = booking.activeExtension;
  if (!extension) throw new Error('Booking ' + booking.id + ' has no extension request.');

  var nannyToken = signIn(NANNY_EMAIL);
  var accepted = call('POST', nannyToken, '/bookings/extensions/' + extension.id + '/accept');
  output.bookingId = String(booking.id);
  output.status = accepted.status;
  output.amount = String(accepted.totalAmount);
}

/** The nanny ends the shift, which completes the booking and opens the review. */
function nannyCheckOut() {
  var motherToken = signIn(MOTHER_EMAIL);
  var booking = currentBooking(motherToken);

  var nannyToken = signIn(NANNY_EMAIL);
  record(call('POST', nannyToken, '/bookings/' + booking.id + '/check-out'));
}

/**
 * An operator verifies someone's identity.
 *
 * `queue` is the console's own review list, and the row is found by the email
 * the lab seeded. Going through the queue rather than straight to an id is the
 * point: someone who never reached the queue fails here, with a message saying
 * so, instead of being approved anyway and passing for the wrong reason.
 */
function approveFromQueue(queue, email) {
  var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);

  // Paged, not "read the first page and look".
  //
  // These lists are newest-first and the E2E database is never truncated —
  // it is shared with the admin Playwright suite, which mints a fresh mother
  // for most of its specs. The lab's own accounts are upserted by email, so
  // they keep their original `createdAt` and sink further down the list every
  // time any suite runs; at the time of writing there are ~1000 mothers and
  // the lab's is nowhere near page one. Reading a single page made this a
  // rare, mystifying "not in the queue" that depended on what someone else
  // had run that afternoon.
  var match = null;
  for (var page = 1; page <= 40 && !match; page++) {
    var rows = call('GET', adminToken, '/admin/' + queue + '?limit=200&page=' + page);
    if (!rows || rows.length === 0) break;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].email === email) match = rows[i];
    }
    if (rows.length < 200) break;
  }
  if (!match) throw new Error(email + ' is not in the ' + queue + ' review queue.');

  var approved = call('POST', adminToken, '/admin/' + queue + '/' + match.id + '/approve');
  output.userId = String(match.id);
  output.status = approved.idVerificationStatus;
}

/** A11: the mother's ID is verified, which is what opens booking to her. */
function adminApproveMother() {
  approveFromQueue('mothers', GATED_MOTHER_EMAIL);
}

/** A10: the nanny is vetted, which is what lets her past the waiting screen. */
function adminApproveNanny() {
  approveFromQueue('nannies', PENDING_NANNY_EMAIL);
}

/**
 * How many password-reset links the Auth emulator is holding for one address.
 *
 * The emulator never delivers mail — it parks the out-of-band code on this
 * endpoint instead, which is the only place a reset is observable from outside
 * the app. Nothing clears the list, not even the seeder, so a bare "is there a
 * code for her?" would pass on a code minted by a run an hour ago. C1 therefore
 * counts either side of the tap and asserts the number went up.
 */
function resetCodeCount(email) {
  var res = http.get(AUTH_EMULATOR_URL + '/emulator/v1/projects/' + AUTH_PROJECT_ID + '/oobCodes');
  if (res.status !== 200) {
    throw new Error('Auth emulator oobCodes → ' + res.status + ' ' + res.body);
  }
  var codes = json(res.body).oobCodes || [];
  var count = 0;
  for (var i = 0; i < codes.length; i++) {
    if (codes[i].email === email && codes[i].requestType === 'PASSWORD_RESET') count++;
  }
  return count;
}

/** Recorded before the flow taps "Send reset link". */
function resetCodesBefore() {
  output.resetCodesBefore = String(resetCodeCount(MOTHER_EMAIL));
}

/** Asserted after it: a link the app claims to have sent must actually exist. */
function resetCodeIssued() {
  if (output.resetCodesBefore === undefined) {
    throw new Error('reset-codes-before did not run — there is nothing to compare against.');
  }
  var after = resetCodeCount(MOTHER_EMAIL);
  output.resetCodesAfter = String(after);
  output.resetCodeIssued = String(after > Number(output.resetCodesBefore));
}

var STEPS = {
  'nanny-accept': nannyAccept,
  'reset-codes-before': resetCodesBefore,
  'reset-code-issued': resetCodeIssued,
  'admin-approve-mother': adminApproveMother,
  'admin-approve-nanny': adminApproveNanny,
  'nanny-check-in': nannyCheckIn,
  'nanny-care-log': nannyCareLog,
  'nanny-accept-extension': nannyAcceptExtension,
  'nanny-check-out': nannyCheckOut,
};

var step = STEPS[ADVANCE];
if (!step) {
  throw new Error('Unknown ADVANCE "' + ADVANCE + '". Known: ' + Object.keys(STEPS).join(', '));
}
step();
