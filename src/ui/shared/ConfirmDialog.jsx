// ui/shared/ConfirmDialog.jsx — Shared confirm/alert modal (C-1 one-modal-system, batch 1).
//
// Replaces native window.confirm()/window.alert()/bare confirm()/alert()
// call sites: those bypass the app's theme, can't be driven or asserted on
// in tests, and block the page synchronously with no styling or loading
// state. Built on ModalShell, so it inherits the overlay/focus-trap/Escape/
// focus-restore behavior for free. Pair with useConfirm.js for a drop-in
// `await confirm(message)` replacement at existing call sites.
import { useState } from "react";
import { useTheme } from "./ThemeContext.jsx";
import { ModalShell } from "./ModalShell.jsx";
import { Btn } from "./components.jsx";

/**
 * @param {{
 *   isOpen: boolean,
 *   title?: import("react").ReactNode,
 *   message: import("react").ReactNode,
 *   confirmLabel?: string,
 *   cancelLabel?: string,
 *   variant?: "danger"|"primary",
 *   singleAction?: boolean,
 *   onConfirm: () => void | Promise<void>,
 *   onCancel: () => void,
 * }} props
 */
export function ConfirmDialog({
  isOpen,
  title = "Confirm",
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  variant,
  singleAction = false,
  onConfirm,
  onCancel,
}) {
  const { C, FONT } = useTheme();
  const [busy, setBusy] = useState(false);
  const resolvedConfirmLabel = confirmLabel || (singleAction ? "OK" : "Confirm");
  const resolvedVariant = variant || (singleAction ? "primary" : "danger");

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      width="min(440px, 100%)"
      footer={
        <>
          {!singleAction && <Btn variant="ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</Btn>}
          <Btn variant={resolvedVariant} onClick={handleConfirm} disabled={busy}>
            {busy ? "Working…" : resolvedConfirmLabel}
          </Btn>
        </>
      }
    >
      <div style={{ fontFamily: FONT, fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: "pre-line" }}>
        {message}
      </div>
    </ModalShell>
  );
}
