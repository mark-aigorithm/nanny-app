import { create } from 'zustand';

export interface ConfirmDialogOptions {
  title: string;
  /** Supporting line under the title. Say what will actually happen. */
  message?: string;
  /** Label for the action that proceeds. Name the verb, never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm action in the destructive style. */
  destructive?: boolean;
  /** Omitted when `choices` supplies the actions instead. */
  onConfirm?: () => void;
  onCancel?: () => void;
  /** Pick-one actions, rendered in place of a single confirm button. */
  choices?: { label: string; onPress: () => void }[];
  /** Single-button notice — nothing to decline, so no cancel is offered. */
  hideCancel?: boolean;
}

interface ConfirmDialogStore {
  /** Options for the open dialog; null means nothing is showing. */
  dialog: ConfirmDialogOptions | null;
  confirm: (options: ConfirmDialogOptions) => void;
  dismiss: () => void;
}

/**
 * Global confirmation dialog, replacing React Native's `Alert.alert`.
 *
 * The native alert renders in the OS's own design — square, system font, blue
 * iOS buttons — which reads as if it belongs to a different app than the warm,
 * rounded surfaces around it. Routing confirmations through here means every
 * one of them is drawn from the app's own tokens.
 *
 * Mirrors the existing global-overlay pattern (see registerPromptStore): call
 * `confirm` from anywhere, and the host in the root layout renders it.
 */
export const useConfirmDialogStore = create<ConfirmDialogStore>((set) => ({
  dialog: null,
  confirm: (options) => set({ dialog: options }),
  dismiss: () => set({ dialog: null }),
}));

/** Imperative helper so call sites read like the Alert.alert they replace. */
export function confirmDialog(options: ConfirmDialogOptions): void {
  useConfirmDialogStore.getState().confirm(options);
}

/**
 * One-button notice — the themed replacement for a two-argument Alert.alert
 * used to report something rather than ask something.
 */
export function noticeDialog(options: {
  title: string;
  message?: string;
  actionLabel?: string;
  onDismiss?: () => void;
}): void {
  useConfirmDialogStore.getState().confirm({
    title: options.title,
    ...(options.message ? { message: options.message } : {}),
    confirmLabel: options.actionLabel ?? 'Got it',
    hideCancel: true,
    onConfirm: options.onDismiss ?? (() => undefined),
  });
}

/**
 * Pick-one dialog — the themed replacement for a multi-button Alert.alert
 * that offers several routes rather than a yes/no.
 */
export function chooseDialog(options: {
  title: string;
  message?: string;
  choices: { label: string; onPress: () => void }[];
  cancelLabel?: string;
}): void {
  useConfirmDialogStore.getState().confirm({
    title: options.title,
    ...(options.message ? { message: options.message } : {}),
    choices: options.choices,
    cancelLabel: options.cancelLabel ?? 'Cancel',
  });
}
