// ui/shared/useConfirm.js — Promise-based confirm(), replacing window.confirm/alert (C-1 one-modal-system).
//
// Lets an existing `if (!window.confirm(msg)) return;` guard become
// `if (!(await confirm(msg))) return;` with the enclosing function marked
// async — the smallest possible change at each call site — while getting a
// themed, testable, non-blocking ConfirmDialog instead of the native
// browser dialog. Render the returned `confirmDialog` element once, anywhere
// in the component's JSX output (it renders null until a confirm() call is
// pending).
import { useCallback, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

/**
 * @returns {{
 *   confirm: (message: import("react").ReactNode, options?: { title?: string, confirmLabel?: string, cancelLabel?: string, variant?: "danger"|"primary", singleAction?: boolean }) => Promise<boolean>,
 *   confirmDialog: import("react").ReactNode,
 * }}
 */
export function useConfirm() {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setRequest({ message, ...options });
    });
  }, []);

  const settle = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setRequest(null);
  }, []);

  const confirmDialog = request ? (
    <ConfirmDialog
      isOpen
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      variant={request.variant}
      singleAction={request.singleAction}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  ) : null;

  return { confirm, confirmDialog };
}
