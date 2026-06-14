// ui/WelcomeDialog.jsx — New-user onboarding dialog (shown when user has no models)
import { useEffect } from "react";
import { Z } from "./shared/tokens.js";
import { Btn } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";

const OPTIONS = [
  {
    id: "ai",
    icon: "✦",
    heading: "Build with AI Tools",
    friendly: "Let an AI design your model structure — then import it in one click",
    guidance:
      "Download the simmodlr AI Prompt Pack: a schema guide with a ready-to-paste prompt. Give it to Claude, ChatGPT, or any AI assistant, describe your system, and import the JSON response back here via + New Model → Import.",
    accent: true,
  },
  {
    id: "create",
    icon: "✏",
    heading: "Create a Model",
    friendly: "Design your simulation from scratch",
    guidance:
      "Use the editors to define entity types, queues, B-Events and C-Events. Best when you know your system and want full control over every parameter.",
    accent: false,
  },
  {
    id: "library",
    icon: "📚",
    heading: "Access the Model Library",
    friendly: "Browse and fork models from the public library",
    guidance:
      "Explore ready-to-run models from the public library and community — hospital wards, factory lines, queuing systems, and more. Fork any model to make it your own. Templates are also available.",
    accent: false,
  },
  {
    id: "help",
    icon: "?",
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
              <span style={{ fontSize: 22, lineHeight: 1, marginBottom: 4 }}>{opt.icon}</span>
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
