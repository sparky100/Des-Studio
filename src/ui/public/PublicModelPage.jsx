// ui/public/PublicModelPage.jsx — a published model's public page (ADR-025).
//
// This is the page a stranger opens. It is NOT the app: no editor, no tabs,
// no run history, no owner's other models. It shows the model as a
// published work — what it is, what it assumes, where its numbers come from,
// which release it is, and how to cite it.
//
// The thing that makes it different from every other DES tool's public page
// is the register: the evidence and assumptions behind the model, and how
// much of it is evidenced. Every other tool publishes parameters; this
// publishes the provenance of those parameters.
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchPublishedModel } from "../../db/published.js";
import { coverageSummary } from "../../engine/backing-links.js";
import { Btn } from "../shared/components.jsx";
import { useTheme } from "../shared/ThemeContext.jsx";
import { PublicNotFound, PublicShell } from "./publicChrome.jsx";
import { PublicSimulator } from "./PublicSimulator.jsx";

const SANS = "Inter,'Segoe UI',Arial,sans-serif";

const CATEGORY_LABELS = {
  healthcare: "Healthcare",
  logistics: "Logistics",
  manufacturing: "Manufacturing",
  service: "Service systems",
  transport: "Transport",
  retail: "Retail",
  education: "Education",
  "public-sector": "Public sector",
  other: "Other",
};

const EVIDENCE_TYPE_LABELS = {
  data: "Data",
  measurement: "Measurement",
  literature: "Literature",
  expert_judgment: "Expert judgement",
  anecdote: "Anecdote",
};

export function PublicModelPage({ modelId, onBack, onOpenInFlow }) {
  const { C, FONT } = useTheme();
  const [status, setStatus] = useState("loading");
  const [payload, setPayload] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    if (!modelId) { setStatus("missing"); return; }
    setStatus("loading");
    try {
      const p = await fetchPublishedModel(modelId);
      // A draft, a withdrawn model and one that never existed all resolve to
      // null — the page must not tell a stranger which (ADR-025).
      if (!p) { setPayload(null); setStatus("missing"); return; }
      setPayload(p);
      setStatus("ready");
    } catch (err) {
      setStatus("error");
    }
  }, [modelId]);

  useEffect(() => { load(); }, [load]);

  const coverage = useMemo(() => {
    if (!payload?.model) return null;
    if (!payload.registers) return null;
    return coverageSummary({ ...payload.model, ...payload.registers }, { schedules: payload.schedules || [] });
  }, [payload]);

  if (status === "loading") {
    return (
      <PublicShell onBack={onBack}>
        <div style={{ fontSize: 13, color: C.muted, fontFamily: SANS }}>Loading…</div>
      </PublicShell>
    );
  }

  if (status === "missing") {
    return (
      <PublicShell onBack={onBack} onOpenInFlow={onOpenInFlow ? () => onOpenInFlow(modelId) : undefined}>
        <PublicNotFound what="model" />
      </PublicShell>
    );
  }

  if (status === "error") {
    return (
      <PublicShell onBack={onBack}>
        <PublicNotFound what="model" />
      </PublicShell>
    );
  }

  const p = payload;
  const registers = p.registers || null;
  const evidence = registers?.evidence || [];
  const assumptions = registers?.assumptions || [];
  const contested = assumptions.filter(a => a.contested);
  const publishedDate = p.published_at ? new Date(p.published_at) : null;

  const citation = [
    `${p.title}${p.released_version ? `, release v${p.released_version}` : ""}.`,
    p.author ? `Published by ${p.author}.` : null,
    publishedDate ? `Published ${publishedDate.toISOString().slice(0, 10)}.` : null,
    p.licence && p.licence !== "all-rights-reserved" ? `Licence: ${p.licence}.` : null,
  ].filter(Boolean).join(" ");

  const panel = {
    background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16,
  };

  return (
    <PublicShell onBack={onBack} onOpenInFlow={onOpenInFlow ? () => onOpenInFlow(modelId) : undefined}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Title and identity */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {p.cover_image_url && (
            <img
              src={p.cover_image_url}
              alt=""
              style={{ width: "100%", maxHeight: 260, objectFit: "cover", borderRadius: 10, border: `1px solid ${C.border}` }}
            />
          )}
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, fontFamily: SANS, margin: 0, lineHeight: 1.25 }}>
            {p.title}
          </h1>
          {p.summary && (
            <p style={{ fontSize: 15, color: C.muted, fontFamily: SANS, lineHeight: 1.6, margin: 0 }}>
              {p.summary}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {p.category && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: C.accent, fontFamily: SANS,
                border: `1px solid ${C.accent}55`, borderRadius: 4, padding: "2px 8px",
              }}>
                {CATEGORY_LABELS[p.category] || p.category}
              </span>
            )}
            {p.author && (
              <span style={{ fontSize: 12, color: C.muted, fontFamily: SANS }}>
                by {p.author}
              </span>
            )}
            {publishedDate && (
              <span style={{ fontSize: 12, color: C.muted, fontFamily: SANS }}>
                · published {publishedDate.toISOString().slice(0, 10)}
              </span>
            )}
            {p.released_version && (
              <span style={{ fontSize: 12, color: C.muted, fontFamily: SANS }}>
                · release v{p.released_version}
              </span>
            )}
          </div>
        </div>

        {/* The provenance claim — the thing no competitor publishes */}
        {coverage && coverage.total > 0 && (
          <div style={{
            ...panel,
            borderColor: coverage.percentEvidenced > 0 ? `${C.green}55` : C.border,
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700 }}>
              WHERE THE NUMBERS COME FROM
            </div>
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "baseline" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{
                  fontSize: 30, fontWeight: 700, fontFamily: SANS,
                  color: coverage.percentEvidenced > 0 ? C.green : C.muted,
                }}>{coverage.percentEvidenced}%</span>
                <span style={{ fontSize: 12, color: C.muted, fontFamily: SANS }}>
                  of this model is backed by a source you can check
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: C.muted, fontFamily: SANS }}>
              <span style={{ color: C.green }}>{coverage.evidenced} evidenced</span>
              <span style={{ color: C.amber }}>{coverage.assumed} assumption only</span>
              <span>{coverage.unbacked} not backed</span>
            </div>
          </div>
        )}

        {/* What this model is */}
        {p.description && (
          <div style={panel}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
              WHAT THIS MODEL IS
            </div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: SANS, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
              {p.description}
            </div>
          </div>
        )}

        {/* The register */}
        {registers && (evidence.length > 0 || assumptions.length > 0) && (
          <div style={panel}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700, marginBottom: 10 }}>
              THE REGISTER
            </div>

            {evidence.length > 0 && (
              <div style={{ marginBottom: assumptions.length > 0 ? 16 : 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: SANS, marginBottom: 6 }}>
                  Evidence ({evidence.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {evidence.map(ev => (
                    <div key={ev.id} style={{
                      borderLeft: `2px solid ${C.green}66`, paddingLeft: 10,
                    }}>
                      <div style={{ fontSize: 12, color: C.text, fontFamily: SANS, lineHeight: 1.6 }}>
                        {ev.description}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS, marginTop: 3 }}>
                        {EVIDENCE_TYPE_LABELS[ev.type] || ev.type}
                        {ev.source ? ` · ${ev.source}` : ""}
                        {ev.dateCaptured ? ` · captured ${ev.dateCaptured}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {assumptions.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, fontFamily: SANS, marginBottom: 6 }}>
                  Assumptions ({assumptions.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {assumptions.map(a => (
                    <div key={a.id} style={{
                      borderLeft: `2px solid ${a.contested ? C.amber : C.border}`, paddingLeft: 10,
                    }}>
                      <div style={{ fontSize: 12, color: C.text, fontFamily: SANS, lineHeight: 1.6 }}>
                        {a.text}
                      </div>
                      {a.contested && (
                        <div style={{ fontSize: 11, color: C.amber, fontFamily: SANS, marginTop: 3, fontWeight: 700 }}>
                          Contested — reasonable people could disagree
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {contested.length > 0 && (
              <div style={{ fontSize: 11, color: C.amber, fontFamily: SANS, marginTop: 12, lineHeight: 1.6 }}>
                This model contains {contested.length} contested assumption{contested.length !== 1 ? "s" : ""}. A
                disagreement about {contested.length !== 1 ? "them" : "it"} is a disagreement about the results.
              </div>
            )}
          </div>
        )}

        {/* Run it */}
        <div style={panel}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            RUN IT
          </div>
          {simulating ? (
            <PublicSimulator
              payload={p}
              onClose={() => setSimulating(false)}
            />
          ) : (
            <>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: SANS, lineHeight: 1.6, marginBottom: 10 }}>
                The model runs in your browser — nothing is sent to the publisher, and your changes to the
                settings below do not affect their copy.
              </div>
              <Btn variant="primary" onClick={() => setSimulating(true)}>Run this model</Btn>
            </>
          )}
        </div>

        {/* Release notes */}
        {p.release_notes && (
          <div style={panel}>
            <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
              THIS RELEASE
            </div>
            <div style={{ fontSize: 13, color: C.text, fontFamily: SANS, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>
              {p.release_notes}
            </div>
          </div>
        )}

        {/* Citation and licence */}
        <div style={panel}>
          <div style={{ fontSize: 10, color: C.muted, fontFamily: SANS, letterSpacing: 1.2, fontWeight: 700, marginBottom: 8 }}>
            CITE THIS MODEL
          </div>
          <div style={{
            fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.7,
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10,
          }}>
            {citation}
          </div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: SANS, marginTop: 8 }}>
            {p.licence === "all-rights-reserved"
              ? "All rights reserved."
              : `Licence: ${p.licence}.`}
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
