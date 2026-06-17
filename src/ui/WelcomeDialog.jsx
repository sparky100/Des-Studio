// ui/WelcomeDialog.jsx — New-user onboarding dialog (shown when user has no models)
import { useEffect } from "react";
import { Z } from "./shared/tokens.js";
import { Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

const ic = (w, h, children) => (
  <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const IconCreate  = () => ic(22, 22, <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></>);
const IconLibrary = () => ic(22, 22, <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></>);
const IconAI      = () => ic(22, 22, <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>);
const IconHelp   = () => ic(22, 22, <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></>);

const OPTIONS = [
  {
    id: "create",
    icon: <IconCreate />,
    heading: "Create a Model",
    friendly: "Choose how to build a model — describe, draw or define",
    guidance:
      "Open the model builder and choose your approach: describe your system to the AI assistant, draw it on the visual canvas, or define it directly in the editors.",
    accent: false,
  },
  {
    id: "library",
    icon: <IconLibrary />,
    heading: "Access the Model Library",
    friendly: "Browse and fork models from the public library",
    guidance:
      "Explore ready-to-run models — hospital wards, factory lines, queuing systems and more. Fork any model to make it your own. Templates are also available.",
    accent: false,
  },
  {
    id: "ai",
    icon: <IconAI />,
    heading: "Build with AI Tools",
    friendly: "Let an external AI design your model — then import it in one click",
    guidance:
      "Download the simmodlr AI Prompt Pack: the full schema spec with a ready-to-paste prompt. Give it to Claude, ChatGPT, or any AI assistant, describe your system, and import the JSON response back here via + New Model → Import.",
    accent: true,
  },
  {
    id: "help",
    icon: <IconHelp />,
    heading: "Get Help",
    friendly: "Learn how simmodlr works",
    guidance:
      "Open the AI Help Assistant for a guided tour, explanations of entities, events, queues, and the three-phase simulation method.",
    accent: false,
  },
];

export function WelcomeDialog({ onCreateModel, onOpenLibrary, onHelp, onExportSchema, onClose }) {
  const { C, FONT } = useTheme();

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleOption(id) {
    if (id === "ai")      onExportSchema();
    if (id === "create")  onCreateModel();
    if (id === "library") onOpenLibrary();
    if (id === "help")    onHelp();
  }

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: C.overlay,
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: Z.modal,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.panel,
          borderRadius: 12,
          padding: 28,
          width: 560,
          maxWidth: "95vw",
          fontFamily: FONT,
          boxShadow: "0 8px 32px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <div
            id="welcome-dialog-title"
            style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6 }}
          >
            Welcome to simmodlr
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            How would you like to get started?
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleOption(opt.id)}
              style={{
                background: C.bg,
                border: `1px solid ${opt.accent ? C.accent : C.border}`,
                borderRadius: 8,
                padding: "14px 16px",
                cursor: "pointer",
                textAlign: "left",
                fontFamily: FONT,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = C.accent;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = opt.accent ? C.accent : C.border;
              }}
            >
              <span style={{ color: opt.accent ? C.accent : C.text, lineHeight: 1, marginBottom: 4 }}>{opt.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{opt.heading}</span>
              <span style={{ fontSize: 11, color: C.accent, fontWeight: 600, marginBottom: 2 }}>
                {opt.friendly}
              </span>
              <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{opt.guidance}</span>
            </button>
          ))}
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={onClose}>
            Skip for now — browse the library
          </Btn>
        </div>
      </div>
    </div>
  );
}
