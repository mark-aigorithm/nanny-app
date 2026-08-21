/*
 * The other side of a two-sided journey, driven over HTTP.
 *
 * Maestro drives exactly one surface: the app, signed in as one person. But
 * most P0 journeys need a second actor — a nanny who claims the request, checks
 * in, writes a care log, checks out. Running a second UI driver alongside the
 * first is the expensive way to do that; this is the cheap one, and it is the
 * same choice the admin suite makes when it needs the mobile side to move.
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
 * `-e` values passed to `maestro test` arrive as globals: MOTHER_EMAIL,
 * NANNY_EMAIL, PASSWORD, BACKEND_URL, AUTH_EMULATOR_URL.
 */

/** The emulator ignores the key but the endpoint still requires the parameter. */
var IDENTITY_TOOLKIT = AUTH_EMULATOR_URL + '/identitytoolkit.googleapis.com/v1';

function signIn(email) {
  var res = http.post(IDENTITY_TOOLKIT + '/accounts:signInWithPassword?key=fake-api-key', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: PASSWORD, returnSecureToken: true }),
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

/** The nanny writes one care log, which is what the parent's feed renders. */
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

/** The nanny ends the shift, which completes the booking and opens the review. */
function nannyCheckOut() {
  var motherToken = signIn(MOTHER_EMAIL);
  var booking = currentBooking(motherToken);

  var nannyToken = signIn(NANNY_EMAIL);
  record(call('POST', nannyToken, '/bookings/' + booking.id + '/check-out'));
}

var STEPS = {
  'nanny-accept': nannyAccept,
  'nanny-check-in': nannyCheckIn,
  'nanny-care-log': nannyCareLog,
  'nanny-check-out': nannyCheckOut,
};

var step = STEPS[ADVANCE];
if (!step) {
  throw new Error('Unknown ADVANCE "' + ADVANCE + '". Known: ' + Object.keys(STEPS).join(', '));
}
step();
