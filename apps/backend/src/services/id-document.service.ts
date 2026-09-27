import { ApprovalStatus } from '@prisma/client';

import type { RejectNannyInput } from '@nanny-app/shared';

import { prisma } from '@backend/db/prisma';
import { errors } from '@backend/lib/errors';
import { deleteStorageObjectByUrl } from '@backend/lib/storage';
import {
  createInAppNotification,
  dispatchPush,
} from '@backend/services/notification.service';

export type IdDocumentHolder = {
  id: number;
  idDocumentFrontUrl: string | null;
  idDocumentBackUrl: string | null;
};

const TITLE = 'Please upload your ID again';

/**
 * Sends a user's ID back: the document is refused, not the application. The
 * account returns to PENDING_ID — which already suspends it (a nanny leaves
 * search and new bookings, a mother can't book) and already sends each app to
 * its upload prompt — with the reason kept to show her there. The old files
 * are deleted, as a reject does, so a stale photo can't be approved later.
 *
 * Reuses the NANNY_REJECTED in-app type rather than adding an enum value,
 * which would need a migration nothing applies on deploy.
 */
export async function invalidateIdDocument(
  user: IdDocumentHolder,
  input: RejectNannyInput,
  role: 'NANNY' | 'MOTHER',
): Promise<void> {
  if (!user.idDocumentFrontUrl && !user.idDocumentBackUrl) {
    throw errors.badRequest('There is no ID on file to invalidate.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      approvalStatus: ApprovalStatus.PENDING_ID,
      reviewedAt: new Date(),
      rejectionReason: input.reason ?? null,
      idDocumentType: null,
      idDocumentFrontUrl: null,
      idDocumentBackUrl: null,
    },
  });
  await deleteStorageObjectByUrl(user.idDocumentFrontUrl);
  await deleteStorageObjectByUrl(user.idDocumentBackUrl);

  const until = role === 'NANNY' ? 'to keep receiving bookings' : 'before your next booking';
  const body = input.reason
    ? `Your ID couldn't be verified: ${input.reason}. Please upload a new one ${until}.`
    : `Your ID couldn't be verified. Please upload a new one ${until}.`;
  await createInAppNotification({ userId: user.id, type: 'NANNY_REJECTED', title: TITLE, body });
  await dispatchPush(user.id, {
    title: TITLE,
    body,
    data: { type: 'id_reupload_requested', title: TITLE },
  });
}
