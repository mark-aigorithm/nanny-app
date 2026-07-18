import { useState } from 'react';
import type { SubmitIdRequest } from '@nanny-app/shared';

import { IdDocumentType, idTypeRequiresBack } from '@shared/nanny';
import { isLocalImageUri, uploadImageToFirebase } from '@mobile/lib/storage';
import { useSubmitId } from '@mobile/hooks/useMe';

interface IdCaptureState {
  idType: IdDocumentType | null;
  frontUri: string | null;
  backUri: string | null;
}

/**
 * Validates a captured ID, uploads any local images to Firebase Storage, and
 * submits the download URLs to `POST /auth/id`. Shared by the nanny forced
 * re-upload screen and the mother booking-gate modal so the validation +
 * upload + submit flow lives in one place.
 *
 * `submit` resolves to true on success (profile now PENDING_REVIEW), false if
 * validation or the network call failed (see `error`).
 */
export function useIdSubmit() {
  const submitId = useSubmitId();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit({ idType, frontUri, backUri }: IdCaptureState): Promise<boolean> {
    if (!idType) {
      setError('Please choose your ID type.');
      return false;
    }
    if (!frontUri) {
      setError('Please upload the front of your ID.');
      return false;
    }
    if (idTypeRequiresBack(idType) && !backUri) {
      setError('Please upload the back of your ID.');
      return false;
    }
    setError(null);

    try {
      setIsUploading(true);
      const idDocumentFrontUrl = isLocalImageUri(frontUri)
        ? await uploadImageToFirebase(frontUri, 'nanny-ids')
        : frontUri;
      let idDocumentBackUrl: string | undefined;
      if (idTypeRequiresBack(idType) && backUri) {
        idDocumentBackUrl = isLocalImageUri(backUri)
          ? await uploadImageToFirebase(backUri, 'nanny-ids')
          : backUri;
      }

      const body: SubmitIdRequest = {
        idDocumentType: idType,
        idDocumentFrontUrl,
        idDocumentBackUrl,
      };
      await submitId.mutateAsync(body);
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not submit your ID. Please try again.',
      );
      return false;
    } finally {
      setIsUploading(false);
    }
  }

  return { submit, isSubmitting: isUploading || submitId.isPending, error, setError };
}
