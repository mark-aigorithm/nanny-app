import React from 'react';
import { Modal } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import ConfirmDialogHost from '@mobile/components/ConfirmDialogHost';
import { chooseDialog, noticeDialog, useConfirmDialogStore } from '@mobile/store/confirmDialogStore';

/**
 * The dialog is a Modal. On iOS a Modal can only be presented by the view
 * controller on top — so when a screen has its own Modal open (the care-log
 * sheet), a dialog raised from inside it must render *inside that Modal*, not
 * from the root host, or iOS refuses the presentation and every tap dies.
 * A screen does that by mounting a nested host inside its Modal; while one is
 * mounted, the root host stays out of the way.
 */
beforeEach(() => {
  act(() => useConfirmDialogStore.getState().dismiss());
});

it('the root host renders the dialog when no nested host is mounted', () => {
  const { getByText } = render(<ConfirmDialogHost />);

  act(() => noticeDialog({ title: 'Saved' }));

  expect(getByText('Saved')).toBeTruthy();
});

it('a nested host renders the dialog and the root host yields to it', () => {
  const { getAllByText } = render(
    <>
      <ConfirmDialogHost />
      <Modal visible transparent>
        <ConfirmDialogHost nested />
      </Modal>
    </>,
  );

  act(() => chooseDialog({ title: 'Add evidence', choices: [{ label: 'Take photo', onPress: () => undefined }] }));

  // Exactly one dialog on screen — the nested one — not two.
  expect(getAllByText('Add evidence')).toHaveLength(1);
});

it('the root host takes over again once the sheet closes and its nested host unmounts', () => {
  const Tree = ({ sheetOpen }: { sheetOpen: boolean }) => (
    <>
      <ConfirmDialogHost />
      <Modal visible={sheetOpen} transparent>
        <ConfirmDialogHost nested />
      </Modal>
    </>
  );
  const { getByText, queryByText, rerender } = render(<Tree sheetOpen />);

  rerender(<Tree sheetOpen={false} />);
  act(() => noticeDialog({ title: 'Later' }));

  expect(getByText('Later')).toBeTruthy();
  fireEvent.press(getByText('Got it'));
  expect(queryByText('Later')).toBeNull();
});
