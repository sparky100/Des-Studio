// ui/shared/ToastContext.jsx — lightweight toast notification system
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { alpha, RADIUS } from "./tokens.js";
import { useTheme } from "./ThemeContext.jsx";

const ToastCtx = createContext(null);

const MAX_TOASTS = 3;
const DURATION_MS = 4000;

let _nextId = 1;

function Toast({ id, message, variant, onDismiss }) {
  const { C, FONT } = useTheme();
  const VARIANT_COLORS = { success: C.green, error: C.red, warning: C.amber, info: C.accent };
  const color = VARIANT_COLORS[variant] || C.accent;
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(id), DURATION_MS);
    return () => clearTimeout(timerRef.current);
  }, [id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        background: C.panel,
        border: `1px solid ${alpha(color, 0.5)}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: RADIUS.md,
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        minWidth: 220,
        maxWidth: 360,
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
        fontFamily: FONT,
        fontSize: 12,
        color: C.text,
      }}
    >
      <span>{message}</span>
      <button
        aria-label="Dismiss notification"
        onClick={() => onDismiss(id)}
        style={{
          background: "none",
          border: "none",
          color: C.muted,
          cursor: "pointer",
          padding: "0 2px",
          fontSize: 14,
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, variant = "info") => {
    const id = _nextId++;
    setToasts(prev => {
      const next = [...prev, { id, message, variant }];
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
  }, []);

  const api = {
    toast,
    success: (msg) => toast(msg, "success"),
    error:   (msg) => toast(msg, "error"),
    warning: (msg) => toast(msg, "warning"),
    info:    (msg) => toast(msg, "info"),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {typeof document !== "undefined" && createPortal(
        <div
          aria-label="Notifications"
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            zIndex: 9999,
            pointerEvents: toasts.length ? "auto" : "none",
          }}
        >
          {toasts.map(t => (
            <Toast key={t.id} {...t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) {
    // No-op fallback when used outside provider (e.g. tests)
    return { toast: () => {}, success: () => {}, error: () => {}, warning: () => {}, info: () => {} };
  }
  return ctx;
}
