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
  var res;
  if (method === 'GET') {
    res = http.get(BACKEND_URL + path, options);
  } else if (method === 'POST') {
    res = http.post(BACKEND_URL + path, options);
  } else {
    // Anything else goes through the generic form — Maestro's client only has
    // named helpers for GET/POST, and sending a PATCH as a POST would quietly
    // hit a different route (or none) rather than fail.
    options.method = method;
    if (options.body === undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(payload === undefined ? {} : payload);
    }
    res = http.request(BACKEND_URL + path, options);
  }
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

/**
 * Two notifications for the mother, with nothing left unread behind them.
 *
 * Moderating a marketplace listing is the cheapest way to make one: it notifies
 * the seller directly (admin-marketplace.service) and, unlike every booking
 * event that notifies a mother, it does not depend on the clock — NANNY_CHECKIN
 * and BOOKING_COMPLETED both need a shift that has actually started.
 *
 * Everything already there is marked read first. The notification table is
 * never truncated, so an unread count is only worth asserting if this run put
 * every unread item in it.
 */
function seedListingNotifications() {
  var motherToken = signIn(MOTHER_EMAIL);
  call('PATCH', motherToken, '/notifications/read-all');

  var approved = createListing(motherToken, 'Cot');
  var rejected = createListing(motherToken, 'Pram');

  var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  call('POST', adminToken, '/admin/marketplace/listings/' + approved + '/approve');
  call('POST', adminToken, '/admin/marketplace/listings/' + rejected + '/reject', {
    reason: 'Photos are too blurry to see the item.',
  });

  unreadCount();
}

function createListing(motherToken, label) {
  var post = call('POST', motherToken, '/community/posts', {
    type: 'marketplace',
    title: 'E2E ' + label,
    price: 400,
    imageUrls: ['https://storage.example.test/e2e-listing.jpg'],
  });
  return post.id;
}

/** What the badge and the "Unread" pill are counting. */
function unreadCount() {
  var motherToken = signIn(MOTHER_EMAIL);
  output.unread = String(call('GET', motherToken, '/notifications/unread-count').unreadCount);
}

/**
 * Empties the mother's community shelf.
 *
 * The database is never truncated and a post has no natural key, so every
 * previous run's question and event is still in the feed under exactly the
 * title this run is about to use. Deleting hers first is what makes "the post
 * is in the feed" an assertion about this run rather than about the seventh
 * copy of it — and it is why the flow can then assert a like count of 1 and a
 * comment count of 1 rather than "one more than before".
 *
 * Only her own: the delete route refuses anybody else's, which is the point.
 */
function communityReset() {
  var motherToken = signIn(MOTHER_EMAIL);
  var removed = 0;

  // Paged rather than looped over one response: the route caps `limit` at 50,
  // and a lab that has been running for a while has more than that.
  for (var guard = 0; guard < 40; guard++) {
    var posts = call('GET', motherToken, '/community/my-posts?limit=50');
    if (!posts || posts.length === 0) break;
    for (var i = 0; i < posts.length; i++) {
      call('DELETE', motherToken, '/community/posts/' + posts[i].id);
      removed++;
    }
  }

  output.removed = String(removed);
}

/**
 * A second mother tries to RSVP to an event the first one has already filled.
 *
 * Asserted here rather than on screen because the app has nowhere to show it:
 * `useToggleEventRsvp` has no `onError`, so the 409 is swallowed and the button
 * simply does nothing. The flow pins the server's answer and the doc records
 * the gap; if the screen ever learns to report it, this stays true.
 *
 * The gated mother is the second account because the community is mothers-only
 * — `getFeedReader` refuses the nanny outright, which would answer 403 and
 * prove nothing about capacity.
 */
function eventAtCapacity() {
  var motherToken = signIn(MOTHER_EMAIL);
  var events = call('GET', motherToken, '/community/my-posts?type=event&limit=50');
  if (!events || events.length === 0) throw new Error('The mother has no event posts.');

  // Newest first, and communityReset ran at the top of the flow, so this is the
  // event the flow just created on screen.
  var event = events[0];

  var otherToken = signIn(GATED_MOTHER_EMAIL);
  var res = http.post(BACKEND_URL + '/community/posts/' + event.id + '/rsvp', {
    headers: { Authorization: 'Bearer ' + otherToken, 'Content-Type': 'application/json' },
    body: '{}',
  });

  output.rsvpStatus = String(res.status);
  output.rsvpCount = String(call('GET', motherToken, '/community/posts/' + event.id).rsvpCount);
}

/**
 * The mother's side of a nanny's day, up to the point the nanny takes over.
 *
 * Books over HTTP rather than through the app because Maestro drives one
 * surface per flow and in C4 that surface is the nanny's. The coordinates are
 * the ones the seeder gives the lab nanny, so the request reaches her pool
 * rather than being broadcast into empty space.
 *
 * The times come from run.mjs, in the platform's timezone: ten minutes out,
 * which is inside the fifteen-minute check-in window. That is what lets the
 * nanny start the shift straight away — and it sidesteps the date picker whose
 * behaviour near midnight makes A1 and A7 unrunnable in the late evening.
 */
function motherBook() {
  var motherToken = signIn(MOTHER_EMAIL);
  var booking = call('POST', motherToken, '/bookings', {
    startTime: BOOKING_START,
    endTime: BOOKING_END,
    latitude: 30.0444,
    longitude: 31.2357,
    // The allergy line is how the flow finds this card. The open-requests pool
    // is shared with every other suite that has ever run against this database
    // — dozens of factory bookings sit in it — and none of the rest of the card
    // is distinctive: same duration, same price, same "1 child · 3 yrs".
    children: [{ name: 'Lina', ageYears: 3, allergies: 'Peanuts and lab dust' }],
    specialInstructions: 'E2E lab booking for the care log flow.',
  });
  record(booking);
}

/**
 * The mother pays, so the shift can start.
 *
 * The whole way round: the backend mints the intention, the fake settles it and
 * signs a callback, and the callback goes back to the backend's own webhook. A
 * status written straight into the database would skip the two things that
 * actually gate a check-in — a Payment row that reached CAPTURED, and a booking
 * the webhook moved to CONFIRMED.
 */
function motherPay() {
  var motherToken = signIn(MOTHER_EMAIL);
  var booking = currentBooking(motherToken);

  var intention = call('POST', motherToken, '/bookings/' + booking.id + '/pay/paymob', {
    method: 'CARD',
  });

  var settled = http.post(PAYMOB_FAKE_URL + '/__test__/pay', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientSecret: intention.clientSecret, success: true }),
  });
  if (settled.status !== 200) {
    throw new Error('The Paymob fake refused to settle: ' + settled.status + ' ' + settled.body);
  }
  var callback = json(settled.body);

  var delivered = http.post(BACKEND_URL + '/webhooks/paymob?hmac=' + callback.hmac, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callback.body),
  });
  if (delivered.status < 200 || delivered.status >= 300) {
    throw new Error('The webhook was refused: ' + delivered.status + ' ' + delivered.body);
  }

  record(call('GET', motherToken, '/bookings/' + booking.id));
}

/**
 * The four digits on the mother's phone.
 *
 * Minted through the route her own tap calls, so the flow types a code the
 * product really issued rather than one the test invented.
 */
function motherStartPin() {
  var motherToken = signIn(MOTHER_EMAIL);
  var booking = currentBooking(motherToken);
  output.bookingId = String(booking.id);
  output.pin = call('POST', motherToken, '/bookings/' + booking.id + '/start-pin').pin;
}

/** The care logs the nanny wrote, read back as the mother — who is who they are for. */
function motherCareLogs() {
  var motherToken = signIn(MOTHER_EMAIL);
  var booking = currentBooking(motherToken);
  var logs = call('GET', motherToken, '/bookings/' + booking.id + '/care-logs');

  output.status = booking.status;
  output.careLogCount = String(logs ? logs.length : 0);
  output.careLogNotes = logs && logs.length > 0 ? String(logs[0].notes) : '';
}

/**
 * Puts one accepted invitation on the mother's referral screen, and asks the
 * validate endpoint the two questions the signup field asks it.
 *
 * Redeeming is once per account and permanent — the unique index on
 * `referee_id` is the real guard — so the second run of this flow is answered
 * 409. That is the same end state as the first run, not a failure: the
 * referral row is there either way, which is all the screen reads. Anything
 * else is a genuine problem and still throws.
 *
 * The second mother is the invitee because only a MOTHER may redeem, and
 * because a self-referral is refused — the nanny would fail for the wrong
 * reason and prove nothing.
 */
function seedReferral() {
  var motherToken = signIn(MOTHER_EMAIL);
  var summary = call('GET', motherToken, '/referrals/me');

  output.code = summary.code;
  output.refereePoints = String(summary.refereePoints);
  output.referrerPoints = String(summary.referrerPoints);

  var inviteeToken = signIn(GATED_MOTHER_EMAIL);
  var redeem = http.post(BACKEND_URL + '/referrals/redeem', {
    headers: { Authorization: 'Bearer ' + inviteeToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: summary.code }),
  });
  if (redeem.status !== 200 && redeem.status !== 201 && redeem.status !== 409) {
    throw new Error('POST /referrals/redeem → ' + redeem.status + ' ' + redeem.body);
  }
  output.redeemStatus = String(redeem.status);

  // `/referrals/validate` is optional-auth precisely so the signup field can
  // call it before an account exists — so these go out with no token at all,
  // which is the state the field is really in.
  var good = http.get(BACKEND_URL + '/referrals/validate?code=' + summary.code);
  var junk = http.get(BACKEND_URL + '/referrals/validate?code=NOPE-0000');
  output.validReferrer = String(json(good.body).data.referrerFirstName);
  output.junkValid = String(json(junk.body).data.valid);
}

/**
 * Puts one unread message in the mother's inbox, from a real buyer.
 *
 * A conversation cannot be conjured: the only thing that creates one is a buyer
 * pressing "Message seller" on an *approved* marketplace listing, so the seed
 * walks that whole path — listing, admin approval, contact, message. Anything
 * shorter would prove the inbox renders rows without proving a row can exist.
 *
 * Everything already in her inbox is marked read first, for the same reason C8
 * empties the notification list: conversations are never deleted, so a badge or
 * an unread count is only an assertion about this run if this run put every
 * unread message there.
 *
 * The gated mother is the buyer because the marketplace is mothers-only, and
 * because a seller cannot contact herself — the button is not rendered for the
 * author of the listing.
 */
function seedConversation() {
  var motherToken = signIn(MOTHER_EMAIL);
  var buyerToken = signIn(GATED_MOTHER_EMAIL);

  // Both inboxes, not just the seller's. The flow ends by asserting that the
  // *buyer* has exactly one unread — the reply the seller just sent — and every
  // previous run left her one as well. Emptying only the side the app is
  // signed in as passes on the first run and then counts the runs.
  emptyInbox(motherToken);
  emptyInbox(buyerToken);

  var listingId = createListing(motherToken, 'Highchair');
  var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  call('POST', adminToken, '/admin/marketplace/listings/' + listingId + '/approve');

  var contact = call('POST', buyerToken, '/community/posts/' + listingId + '/contact');
  var conversationId = contact.conversation.id;
  call('POST', buyerToken, '/conversations/' + conversationId + '/messages', {
    content: 'Is the highchair still available',
  });

  output.conversationId = String(conversationId);
  output.sellerUnread = String(
    call('GET', motherToken, '/conversations/unread-count').unreadCount,
  );
}

/** Marks everything already in one person's inbox read. Conversations are never deleted. */
function emptyInbox(token) {
  var existing = call('GET', token, '/conversations?limit=50');
  for (var i = 0; i < (existing ? existing.length : 0); i++) {
    call('POST', token, '/conversations/' + existing[i].id + '/read');
  }
}

/**
 * Both sides of the ledger after the seller has read and replied.
 *
 * Two numbers rather than one: hers going to zero could be a mark-read that
 * fired without a message being sent, and his going to one could be a reply
 * that never marked anything read.
 */
function messageUnreadCounts() {
  output.sellerUnread = String(
    call('GET', signIn(MOTHER_EMAIL), '/conversations/unread-count').unreadCount,
  );
  output.buyerUnread = String(
    call('GET', signIn(GATED_MOTHER_EMAIL), '/conversations/unread-count').unreadCount,
  );
}

/**
 * Switches two support channels on and the third off, from the console.
 *
 * The screen renders a card per configured channel and hides the rest, and an
 * empty string is how the admin turns one off — so setting the phone number to
 * '' is the assertion that "not configured" and "configured blank" are the
 * same thing, not a shortcut around seeding one.
 *
 * Whatever was there before is overwritten rather than added to: the settings
 * are global and a previous run (or the admin suite) may have left any of the
 * three set to anything.
 */
function configureSupport() {
  var adminToken = signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  var contact = call('PUT', adminToken, '/admin/support-contact', {
    whatsappNumber: '+201000000111',
    phoneNumber: '',
    email: 'lab-support@nannyapp.test',
  });

  output.whatsapp = contact.whatsappNumber;
  output.phone = contact.phoneNumber;
  output.email = contact.email;
}

var STEPS = {
  'nanny-accept': nannyAccept,
  'reset-codes-before': resetCodesBefore,
  'reset-code-issued': resetCodeIssued,
  'seed-listing-notifications': seedListingNotifications,
  'unread-count': unreadCount,
  'community-reset': communityReset,
  'event-at-capacity': eventAtCapacity,
  'configure-support': configureSupport,
  'mother-book': motherBook,
  'mother-pay': motherPay,
  'mother-start-pin': motherStartPin,
  'mother-care-logs': motherCareLogs,
  'seed-referral': seedReferral,
  'seed-conversation': seedConversation,
  'message-unread-counts': messageUnreadCounts,
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
