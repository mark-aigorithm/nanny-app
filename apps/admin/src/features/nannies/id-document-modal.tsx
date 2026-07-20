import type { IdDocumentType } from '@nanny-app/shared';

import { Modal } from '@admin/components/ui';

type IdDocumentSubject = {
  name: string;
  idDocumentType: IdDocumentType | null;
  idDocumentFrontUrl: string | null;
  idDocumentBackUrl: string | null;
};

type IdDocumentModalProps = {
  subject: IdDocumentSubject;
  onClose: () => void;
};

/**
 * Modal viewer for the front/back of an uploaded ID document (KYC). Serves both
 * nannies and mothers. A passport has only a front image, so the back figure is
 * hidden for it.
 */
export function IdDocumentModal({ subject, onClose }: IdDocumentModalProps) {
  const showBack = subject.idDocumentType !== 'PASSPORT';

  return (
    <Modal title={`${subject.name}'s ID`} onClose={onClose}>
      <div className="modal-body">
        <div className="id-doc-grid">
          <figure className="id-doc-figure">
            <figcaption className="id-doc-caption">Front</figcaption>
            {subject.idDocumentFrontUrl ? (
              <img
                className="id-doc-image"
                src={subject.idDocumentFrontUrl}
                alt={`Front of ${subject.name}'s ID`}
              />
            ) : (
              <p className="table-subtext">Not provided.</p>
            )}
          </figure>
          {showBack && (
            <figure className="id-doc-figure">
              <figcaption className="id-doc-caption">Back</figcaption>
              {subject.idDocumentBackUrl ? (
                <img
                  className="id-doc-image"
                  src={subject.idDocumentBackUrl}
                  alt={`Back of ${subject.name}'s ID`}
                />
              ) : (
                <p className="table-subtext">Not provided.</p>
              )}
            </figure>
          )}
        </div>
      </div>
    </Modal>
  );
}
