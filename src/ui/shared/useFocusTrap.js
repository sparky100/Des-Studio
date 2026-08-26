// ui/shared/useFocusTrap.js — Shared focus-trap + focus-restore hook for modal dialogs (F-11 / C-1 one-modal-system).
//
// Extracted from FeedbackModal.jsx (Escape-to-close, Tab focus trap, initial
// autofocus into the dialog) and generalises HeaderAccountMenu.jsx's
// restore-focus-to-trigger behaviour (previously only that one component
// did it, via a manual triggerRef.focus() on Escape) so every dialog gets
// it on close, however it closes — Escape, backdrop click, a Cancel/Confirm
// button, or the caller unmounting it.
import { useEffect, useRef } from "react";

function getFocusable(container) {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => !el.disabled && el.offsetParent !== null);
}

/**
 * @param {boolean} isOpen
 * @param {() => void} [onClose] — called on Escape; omit to disable Escape-to-close
 * @returns {import("react").MutableRefObject<HTMLElement|null>} ref to attach to the dialog's outermost focusable container
 */
export function useFocusTrap(isOpen, onClose) {
  const containerRef = useRef(null);
  const restoreFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
        return;
      }
      if (e.key === "Tab" && containerRef.current) {
        const focusable = getFocusable(containerRef.current);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    const raf = requestAnimationFrame(() => {
      if (containerRef.current) {
        const focusable = getFocusable(containerRef.current);
        if (focusable.length) focusable[0].focus();
      }
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
      // Restore focus to whatever had it before the dialog opened — usually
      // the button that triggered it — so keyboard/screen-reader users land
      // back where they were instead of at the top of <body>.
      if (restoreFocusRef.current && document.body.contains(restoreFocusRef.current)) {
        restoreFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose]);

  return containerRef;
}
