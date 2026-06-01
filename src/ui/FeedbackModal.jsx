// ui/FeedbackModal.jsx — In-app feedback submission widget
import { useState, useEffect, useRef, useCallback } from "react";
import { submitFeedback } from "../db/supabase.js";
import { C, FONT, SPACE, RADIUS, TYPO, Z, TRANS, alpha } from "./shared/tokens.js";

const APP_VERSION = import.meta.env.VITE_APP_VERSION;

const CATEGORIES = [
  { id: "bug",      label: "Bug Report" },
  { id: "feature",  label: "Feature Request" },
  { id: "question", label: "Question" },
  { id: "other",    label: "Other" },
];

const MAX_CHARS = 2000;
const MIN_CHARS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Collect all focusable elements within a container
function getFocusable(container) {
  return Array.from(
    container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => !el.disabled && el.offsetParent !== null);
}

/**
 * FeedbackModal — Supabase-backed bug/feedback submission widget.
 *
 * @param {{ isOpen: boolean, onClose: () => void, userId: string|null, currentPage: string|undefined }} props
 */
export function FeedbackModal({ isOpen, onClose, userId, currentPage }) {
  const [category, setCategory] = useState("bug");
  const [message, setMessage]   = useState("");
  const [replyEmail, setReplyEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess]   = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const dialogRef = useRef(null);
  const headingId = "feedback-modal-heading";

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCategory("bug");
      setMessage("");
      setReplyEmail("");
      setSubmitting(false);
      setSuccess(false);
      setErrorMsg("");
    }
  }, [isOpen]);

  // Close on Escape key; trap focus inside the modal
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = getFocusable(dialogRef.current);
        if (!focusable.length) return;
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);

    // Move focus into the modal on open
    const raf = requestAnimationFrame(() => {
      if (dialogRef.current) {
        const focusable = getFocusable(dialogRef.current);
        if (focusable.length) focusable[0].focus();
      }
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(async () => {
    if (message.length < MIN_CHARS || submitting) return;
    const trimmedReplyEmail = replyEmail.trim();
    if (trimmedReplyEmail && !EMAIL_RE.test(trimmedReplyEmail)) {
      setErrorMsg("Enter a valid reply email address or leave it blank.");
      return;
    }
    setSubmitting(true);
    setErrorMsg("");
    try {
      await submitFeedback({
        category,
        message,
        userId,
        appVersion: APP_VERSION,
        pageContext: currentPage,
        replyEmail: trimmedReplyEmail,
      });
      setSuccess(true);
    } catch (err) {
      setErrorMsg(err?.message || "Submission failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [category, message, userId, currentPage, replyEmail, submitting]);

  if (!isOpen) return null;

  const pillBase = {
    padding: "5px 14px",
    borderRadius: RADIUS.md,
    border: `1px solid ${C.border}`,
    fontFamily: FONT,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: TRANS.fast,
    outline: "none",
  };

  return (
    <div
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.67)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z.modal, padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        style={{
          background: C.panel,
          border: `1px solid ${C.border}`,
          borderRadius: RADIUS.lg,
          width: "min(520px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: SPACE.md,
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${SPACE.md}px ${SPACE.lg}px`,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div
            id={headingId}
            style={{ fontFamily: FONT, ...TYPO.heading, color: C.text }}
          >
            Send Feedback
          </div>
          <button
            type="button"
            aria-label="Close feedback"
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.muted, fontFamily: FONT, fontSize: 16, lineHeight: 1,
              padding: 4, borderRadius: RADIUS.sm,
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: `0 ${SPACE.lg}px ${SPACE.lg}px`, display: "flex", flexDirection: "column", gap: SPACE.md }}>
          {success ? (
            /* ── Success state ── */
            <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md, paddingTop: SPACE.sm }}>
              <div style={{
                background: alpha(C.green, 0.1),
                border: `1px solid ${alpha(C.green, 0.3)}`,
                borderRadius: RADIUS.md,
                padding: SPACE.md,
                color: C.green,
                fontFamily: FONT,
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                Thank you — your feedback has been received.
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    background: C.accent,
                    border: "none",
                    borderRadius: RADIUS.md,
                    color: "#000",
                    fontFamily: FONT,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "7px 20px",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* ── Form state ── */
            <>
              {/* Category pills */}
              <div>
                <div style={{ fontFamily: FONT, ...TYPO.label, color: C.muted, marginBottom: SPACE.sm }}>
                  Category
                </div>
                <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
                  {CATEGORIES.map((cat) => {
                    const active = category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setCategory(cat.id)}
                        style={{
                          ...pillBase,
                          background: active ? alpha(C.accent, 0.15) : "transparent",
                          borderColor: active ? C.accent : C.border,
                          color: active ? C.accent : C.muted,
                        }}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message textarea */}
              <div>
                <div style={{ fontFamily: FONT, ...TYPO.label, color: C.muted, marginBottom: SPACE.sm }}>
                  Message
                </div>
                <textarea
                  aria-label="Feedback message"
                  placeholder="Describe the issue or suggestion…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={MAX_CHARS}
                  style={{
                    width: "100%",
                    minHeight: 120,
                    resize: "vertical",
                    background: C.surface,
                    border: `1px solid ${message.length > 0 && message.length < MIN_CHARS ? C.amber : C.border}`,
                    borderRadius: RADIUS.md,
                    color: C.text,
                    fontFamily: FONT,
                    fontSize: 13,
                    padding: SPACE.sm,
                    outline: "none",
                    boxSizing: "border-box",
                    lineHeight: 1.5,
                  }}
                />
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  marginTop: 4, fontFamily: FONT, fontSize: 11, color: C.muted,
                }}>
                  <span>
                    {message.length > 0 && message.length < MIN_CHARS
                      ? `${MIN_CHARS - message.length} more character${MIN_CHARS - message.length !== 1 ? "s" : ""} required`
                      : null}
                  </span>
                  <span style={{ color: message.length > MAX_CHARS * 0.9 ? C.amber : C.muted }}>
                    {message.length} / {MAX_CHARS}
                  </span>
                </div>
              </div>

              {/* Optional reply email */}
              <div>
                <div style={{ fontFamily: FONT, ...TYPO.label, color: C.muted, marginBottom: SPACE.sm }}>
                  Reply Email
                </div>
                <input
                  type="email"
                  aria-label="Reply email"
                  placeholder={userId ? "Optional if you want a different reply address" : "Optional if you want a reply"}
                  value={replyEmail}
                  onChange={(e) => {
                    setReplyEmail(e.target.value);
                    if (errorMsg === "Enter a valid reply email address or leave it blank.") {
                      setErrorMsg("");
                    }
                  }}
                  style={{
                    width: "100%",
                    background: C.surface,
                    border: `1px solid ${replyEmail.trim() && !EMAIL_RE.test(replyEmail.trim()) ? C.amber : C.border}`,
                    borderRadius: RADIUS.md,
                    color: C.text,
                    fontFamily: FONT,
                    fontSize: 13,
                    padding: SPACE.sm,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ marginTop: 4, fontFamily: FONT, fontSize: 11, color: C.muted, lineHeight: 1.4 }}>
                  {userId
                    ? "Signed-in feedback will also carry your account email when available."
                    : "Add an email address here if you would like a reply to anonymous feedback."}
                </div>
              </div>

              {/* Error message */}
              {errorMsg && (
                <div style={{
                  background: alpha(C.red, 0.1),
                  border: `1px solid ${alpha(C.red, 0.3)}`,
                  borderRadius: RADIUS.md,
                  padding: SPACE.sm,
                  color: C.red,
                  fontFamily: FONT,
                  fontSize: 12,
                }}>
                  {errorMsg}
                </div>
              )}

              {/* Submit button */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  aria-disabled={message.length < MIN_CHARS || submitting}
                  disabled={message.length < MIN_CHARS || submitting}
                  onClick={handleSubmit}
                  style={{
                    background: message.length >= MIN_CHARS && !submitting ? C.accent : alpha(C.accent, 0.3),
                    border: "none",
                    borderRadius: RADIUS.md,
                    color: message.length >= MIN_CHARS && !submitting ? "#000" : C.muted,
                    fontFamily: FONT,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "7px 20px",
                    cursor: message.length >= MIN_CHARS && !submitting ? "pointer" : "not-allowed",
                    transition: TRANS.fast,
                  }}
                >
                  {submitting ? "Sending…" : "Send Feedback"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
