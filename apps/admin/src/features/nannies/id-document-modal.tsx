import type { AdminNanny } from '@nanny-app/shared';

import { Modal } from '@admin/components/ui';

type IdDocumentModalProps = {
  nanny: Pick<AdminNanny, 'name' | 'idDocumentFrontUrl' | 'idDocumentBackUrl'>;
  onClose: () => void;
};

/** Modal viewer for the front/back of a nanny's uploaded ID document (KYC). */
export function IdDocumentModal({ nanny, onClose }: IdDocumentModalProps) {
  return (
    <Modal title={`${nanny.name}'s ID`} onClose={onClose}>
      <div className="modal-body">
        <div className="id-doc-grid">
          <figure className="id-doc-figure">
            <figcaption className="id-doc-caption">Front</figcaption>
            {nanny.idDocumentFrontUrl ? (
              <img
                className="id-doc-image"
                src={nanny.idDocumentFrontUrl}
                alt={`Front of ${nanny.name}'s ID`}
              />
            ) : (
              <p className="table-subtext">Not provided.</p>
            )}
          </figure>
          <figure className="id-doc-figure">
            <figcaption className="id-doc-caption">Back</figcaption>
            {nanny.idDocumentBackUrl ? (
              <img
                className="id-doc-image"
                src={nanny.idDocumentBackUrl}
                alt={`Back of ${nanny.name}'s ID`}
              />
            ) : (
              <p className="table-subtext">Not provided.</p>
            )}
          </figure>
        </div>
      </div>
    </Modal>
  );
}
