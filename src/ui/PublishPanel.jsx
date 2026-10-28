// ui/PublishPanel.jsx — the owner's publish controls (ADR-022).
//
// Publishing is its own act, separate from the visibility toggle: this
// produces a documented, versioned, publicly reachable page, and the panel
// says plainly what that costs before the button is pressed.
//
// The disclosure is not decoration. The model JSON is the payload — the
// public surface runs the model in the visitor's browser — so a published
// model IS a readable model. The owner is told that before they act, not
// after.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, InfoBox } from "./shared/components.jsx";
import { useTheme } from "./shared/ThemeContext.jsx";
import { useToast } from "./shared/ToastContext.jsx";
import { enumerateSweepableParams } from "../engine/sweep-params.js";
import { coverageSummary } from "../engine/backing-links.js";
import { checkPublishedRun } from "../engine/published-run-check.js";
import { validateModel } from "../engine/validation.js";
import { createVersion, fetchModelSchedules, getNextVersion, listVersions } from "../db/models.js";
import {
  PUBLISH_CATEGORIES,
  PUBLISH_LICENCES,
  PUBLISH_STATUS,
  buildPublishedSchedulesMap,
  deletePublishedModel,
  getPublishedSettings,
  listPublishedModelsForOwner,
  publishModel,
  savePublishedSettings,
  unpublishPublishedModel,
  withdrawPublishedModel,
} from "../db/published.js";

const inputStyle = (C) => ({
  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
  color: C.text, fontFamily: "Inter,'Segoe UI',Arial,sans-serif", fontSize: 12,
  padding: "6px 8px", width: "100%", boxSizing: "border-box",
});

export function PublishPanel({ model, modelId, userId, validation, onClose }) {
  const { C, FONT } = useTheme();
  const toast = useToast();
  // useToast() returns a fresh object on every render when there is no
  // provider (its no-op fallback is built inline), so the toast must not be
  // a dependency of `load` — an unstable callback would re-run the load
  // effect on every render and the panel would never settle.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [settings, setSettings] = useState(null);
  const [versions, setVersions] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [otherPublished, setOtherPublished] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showExposed, setShowExposed] = useState(false);

  const errors = validation?.errors || [];
  const blockingErrors = errors.length;

  const load = useCallback(async () => {
    if (!modelId) return;
    setLoading(true);
    try {
      const [row, vs, sch] = await Promise.all([
        getPublishedSettings(modelId),
        listVersions(modelId).catch(() => []),
        fetchModelSchedules(modelId).catch(() => []),
      ]);
      setSettings(row);
      setVersions(vs);
      setSchedules(sch || []);
    } catch (err) {
      toastRef.current.error(err?.message || "Could not load the publish settings");
    } finally {
      setLoading(false);
    }
    // The owner's OTHER published models are supplementary — they must not
    // hold up the panel itself, and a failure here is not worth an error.
    listPublishedModelsForOwner(userId)
      .then(mine => setOtherPublished(mine.filter(m => m.modelId !== modelId)))
      .catch(() => {});
  }, [modelId, userId]);

  useEffect(() => { load(); }, [load]);

  const patch = (p) => setSettings(s => ({ ...(s || {}), ...p }));

  const releaseModel = versions.find(version => version.id === settings?.releasedVersionId)?.modelJson || model;
  const coverage = useMemo(() => coverageSummary(releaseModel || {}), [releaseModel]);
  // The check a visitor's browser will apply, made now, so the owner learns
  // BEFORE publishing that a visitor could not run the model as it stands.
  const visitorRun = useMemo(() => {
    if (!releaseModel) return null;
    try {
      return checkPublishedRun(releaseModel, buildPublishedSchedulesMap(schedules));
    } catch {
      return null;
    }
  }, [releaseModel, schedules]);
  const sweepable = useMemo(() => enumerateSweepableParams(releaseModel || {}), [releaseModel]);
  const liveDataSources = useMemo(() => model?.dataSources || [], [model]);

  const status = settings?.status || PUBLISH_STATUS.DRAFT;
  const isPublished = status === PUBLISH_STATUS.PUBLISHED;
  const hasTitle = String(settings?.title || "").trim().length > 0;

  const exposedPaths = new Set((settings?.exposedParams || []).map(p => p.path));

  const saveDraft = async () => {
    if (!hasTitle) {
      toastRef.current.error("Give the published model a title first");
      return;
    }
    setBusy(true);
    try {
      const saved = await savePublishedSettings(modelId, userId, {
        title: settings.title,
        summary: settings.summary,
        description: settings.description,
        category: settings.category,
        licence: settings.licence,
        coverImageUrl: settings.coverImageUrl,
        releasedVersionId: settings.releasedVersionId,
        releaseNotes: settings.releaseNotes,
        showEvidenceRegister: settings.showEvidenceRegister,
        exposedParams: settings.exposedParams,
      });
      setSettings(saved);
      toastRef.current.success(isPublished
        ? "Settings saved. Press Publish again to show them on the public page."
        : "Publish settings saved");
    } catch (err) {
      toastRef.current.error(err?.message || "Could not save the publish settings");
    } finally {
      setBusy(false);
    }
  };

  const doPublish = async () => {
    if (blockingErrors) {
      toastRef.current.error("Fix the model errors in Model Health before publishing");
      return;
    }
    if (!acknowledged && !isPublished) {
      toastRef.current.error("Confirm what publishing makes readable first");
      return;
    }
    setBusy(true);
    try {
      // A published model is pinned to a release, so the parameters shown and
      // the provenance shown describe the same thing. If the owner did not
      // pick an existing version, snapshot the current state as one — rather
      // than publishing a release that does not exist.
      let versionId = settings.releasedVersionId || null;
      const selectedVersion = versions.find(version => version.id === versionId);
      if (selectedVersion?.modelJson && validateModel(selectedVersion.modelJson).errors.length) {
        throw new Error("The selected version has model errors. Choose a valid version before publishing.");
      }
      if ((settings.exposedParams || []).some(param => param.min != null && param.max != null && param.min > param.max)) {
        throw new Error("Each visitor parameter's minimum must be no greater than its maximum.");
      }
      if (!versionId) {
        const next = await getNextVersion(modelId);
        const created = await createVersion(modelId, userId, {
          version: next,
          name: `Published release v${next}`,
          notes: settings?.releaseNotes || "Snapshot taken when the model was published.",
          modelJson: model,
          isStructural: false,
        });
        versionId = created.id;
        setVersions(prev => [created, ...prev]);
      }
      await savePublishedSettings(modelId, userId, {
        ...settings,
        releasedVersionId: versionId,
      });
      const published = await publishModel(modelId, userId);
      setSettings(published);
      setAcknowledged(false);
      toastRef.current.success("Published — your model is now reachable at its public link");
    } catch (err) {
      toastRef.current.error(err?.message || "Could not publish the model");
    } finally {
      setBusy(false);
    }
  };

  const doWithdraw = async () => {
    setBusy(true);
    try {
      const row = await withdrawPublishedModel(modelId, userId);
      setSettings(row);
      toastRef.current.success("Withdrawn — the public page no longer resolves");
    } catch (err) {
      toastRef.current.error(err?.message || "Could not withdraw the model");
    } finally {
      setBusy(false);
    }
  };

  const doUnpublish = async () => {
    setBusy(true);
    try {
      const row = await unpublishPublishedModel(modelId, userId);
      setSettings(row);
      toastRef.current.success("Unpublished — the settings are kept");
    } catch (err) {
      toastRef.current.error(err?.message || "Could not unpublish the model");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await deletePublishedModel(modelId, userId);
      setSettings(null);
      toastRef.current.success("Publish settings removed");
    } catch (err) {
      toastRef.current.error(err?.message || "Could not remove the publish settings");
    } finally {
      setBusy(false);
    }
  };

  // The public link is a DIFFERENT route from the `#model/<id>` link the
  // Access tab copies. That one opens the model in the app and needs an
  // account; this one is the public page, reachable by anyone (ADR-022).
  const publicLink = `${window.location.origin}${window.location.pathname}#/published/${modelId}`;

  const copyPublicLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(publicLink);
        toastRef.current.success("Public link copied");
      } else {
        const ta = document.createElement("textarea");
        ta.value = publicLink;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        toastRef.current.success("Public link copied");
      }
    } catch {
      toastRef.current.error("Could not copy the public link");
    }
  };

  if (loading) {
    return <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT }}>Loading publish settings…</div>;
  }

  const statusChip = isPublished
    ? { label: "Published", color: C.green }
    : status === PUBLISH_STATUS.WITHDRAWN
      ? { label: "Withdrawn", color: C.amber }
      : { label: "Not published", color: C.muted };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, fontFamily: FONT, marginTop: 2 }}>
            Give this model a public, documented page of its own
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: statusChip.color, fontFamily: FONT,
            border: `1px solid ${statusChip.color}55`, borderRadius: 4, padding: "3px 9px",
          }}>{statusChip.label}</span>
          {onClose && <Btn small variant="ghost" onClick={onClose} ariaLabel="Close publishing">Close</Btn>}
        </div>
      </div>

      {isPublished && settings?.publishedAt && (
        <InfoBox color={C.green}>
          Published {new Date(settings.publishedAt).toLocaleString()}. The public page shows
          release {settings.releasedVersionId ? "pinned to your chosen release" : "of the model as saved"}.
          Editing the model, or changing the title, summary, description, licence, release notes or
          visitor settings here, does not change what the public sees until you press Publish again.
        </InfoBox>
      )}

      {blockingErrors > 0 && (
        <InfoBox color={C.red}>
          This model has {blockingErrors} error{blockingErrors !== 1 ? "s" : ""}. Fix them in Model Health before publishing —
          a published model should be one that runs.
        </InfoBox>
      )}

      {liveDataSources.length > 0 && (
        <InfoBox color={C.amber}>
          This model reads from {liveDataSources.length} live data source{liveDataSources.length !== 1 ? "s" : ""}. A visitor
          to your public page cannot reach those — the values would be stale or missing. Consider whether that matters
          before publishing.
        </InfoBox>
      )}

      {/* What the public sees */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT, letterSpacing: 1 }}>
          WHAT THE PUBLIC SEES
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Title</span>
          <input
            value={settings?.title || ""}
            onChange={e => patch({ title: e.target.value })}
            placeholder="e.g. A&E department, 24-hour model"
            aria-label="Published title"
            style={inputStyle(C)}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>One-line summary</span>
          <input
            value={settings?.summary || ""}
            onChange={e => patch({ summary: e.target.value })}
            placeholder="Shown on the gallery card"
            aria-label="Published summary"
            style={inputStyle(C)}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Description</span>
          <textarea
            value={settings?.description || ""}
            onChange={e => patch({ description: e.target.value })}
            placeholder="What this model is for, what it assumes, and how to read its results."
            aria-label="Published description"
            rows={4}
            style={{ ...inputStyle(C), resize: "vertical", lineHeight: 1.5 }}
          />
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Category</span>
            <select
              value={settings?.category || ""}
              onChange={e => patch({ category: e.target.value || null })}
              aria-label="Published category"
              style={inputStyle(C)}
            >
              <option value="">— none —</option>
              {PUBLISH_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px" }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Licence</span>
            <select
              value={settings?.licence || "all-rights-reserved"}
              onChange={e => patch({ licence: e.target.value })}
              aria-label="Published licence"
              style={inputStyle(C)}
            >
              {PUBLISH_LICENCES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px" }}>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Cover image URL</span>
            <input
              value={settings?.coverImageUrl || ""}
              onChange={e => patch({ coverImageUrl: e.target.value })}
              placeholder="Optional"
              aria-label="Published cover image URL"
              style={inputStyle(C)}
            />
          </label>
        </div>
      </div>

      {/* The release */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT, letterSpacing: 1 }}>
          THE RELEASE
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
            Which version the public sees
          </span>
          <select
            value={settings?.releasedVersionId || ""}
            onChange={e => patch({ releasedVersionId: e.target.value || null })}
            aria-label="Published release"
            style={inputStyle(C)}
          >
            <option value="">Snapshot the model as it is now (taken when you publish)</option>
            {versions.map(v => (
              <option key={v.id} value={v.id}>
                v{v.version}{v.name ? ` — ${v.name}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>Release notes</span>
          <textarea
            value={settings?.releaseNotes || ""}
            onChange={e => patch({ releaseNotes: e.target.value })}
            placeholder="What changed in this release, and what a reader should know."
            aria-label="Release notes"
            rows={2}
            style={{ ...inputStyle(C), resize: "vertical", lineHeight: 1.5 }}
          />
        </label>
      </div>

      {/* Provenance */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT, letterSpacing: 1 }}>
          PROVENANCE
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <input
            type="checkbox"
            checked={settings?.showEvidenceRegister !== false}
            onChange={e => patch({ showEvidenceRegister: e.target.checked })}
            style={{ marginTop: 2 }}
          />
          <span style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.5 }}>
            Show the evidence and assumption register on the public page
            {coverage.total > 0 && (
              <span style={{ color: C.muted }}>
                {" "}— {coverage.percentEvidenced}% of this model is currently evidenced.
              </span>
            )}
          </span>
        </label>
        <InfoBox color={C.accent}>
          When included, the register lets visitors read the sources and assumptions behind the published version.
        </InfoBox>
      </div>

      {/* Can a visitor run it? */}
      {visitorRun && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="visitor-run-check">
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT, letterSpacing: 1 }}>
            CAN A VISITOR RUN IT?
          </div>
          {visitorRun.admission.hardErrors.length > 0 ? (
            <InfoBox color={C.red}>
              A visitor would not be able to run this model at its default settings
              ({visitorRun.settings.replications} runs
              {visitorRun.settings.maxSimTime ? ` of ${visitorRun.settings.maxSimTime} time units` : ""}):
              {" "}{visitorRun.admission.hardErrors[0].message} Change the run length or the number of runs
              in the model's experiment defaults, then save a new version.
            </InfoBox>
          ) : visitorRun.admission.warnings.some(w => w.code === "RA8") ? (
            <InfoBox color={C.amber}>
              Visitors can run this model at its default settings, but it is heavy
              (about {Math.round(visitorRun.complexityEstimate.estimatedCEventScans).toLocaleString()} scans
              per run, {visitorRun.settings.replications} runs), so it may take a while in their browser.
            </InfoBox>
          ) : (
            <InfoBox color={C.accent}>
              Visitors can run this model at its default settings
              ({visitorRun.settings.replications} runs
              {visitorRun.settings.maxSimTime ? ` of ${visitorRun.settings.maxSimTime} time units` : ""}).
            </InfoBox>
          )}
        </div>
      )}

      {/* What a visitor can change */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT, letterSpacing: 1 }}>
            WHAT A VISITOR CAN CHANGE
          </span>
          <Btn small variant="ghost" onClick={() => setShowExposed(s => !s)}>
            {showExposed ? "Close" : `${exposedPaths.size} exposed`}
          </Btn>
        </div>
        {showExposed && (
          <div style={{
            background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 12,
            display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto",
          }}>
            <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT, lineHeight: 1.5, marginBottom: 2 }}>
              These are the parameters a visitor to your public page can change. They are separate from
              the Business view settings you give collaborators.
            </div>
            {sweepable.length === 0 && (
              <div style={{ fontSize: 11, color: C.muted, fontFamily: FONT }}>
                This model has no adjustable parameters.
              </div>
            )}
            {sweepable.map(p => (
              <div key={p.path} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={exposedPaths.has(p.path)}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...(settings?.exposedParams || []), { path: p.path }]
                      : (settings?.exposedParams || []).filter(x => x.path !== p.path);
                    patch({ exposedParams: next });
                  }}
                />
                <span style={{ fontSize: 11, color: C.text, fontFamily: FONT }}>
                  {p.label}
                  {p.subLabel ? ` (${p.subLabel})` : ""}
                </span>
              </label>
              {exposedPaths.has(p.path) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    ["businessLabel", "Visitor label", "text"],
                    ["min", "Minimum", "number"],
                    ["max", "Maximum", "number"],
                  ].map(([field, label, type]) => (
                    <label key={field} style={{ flex: "1 1 100px", minWidth: 0 }}>
                      <span style={{ fontSize: 11, color: C.muted }}>{label}</span>
                      <input type={type} aria-label={`${label}: ${p.label}`}
                        value={(settings.exposedParams.find(entry => entry.path === p.path) || {})[field] ?? ""}
                        onChange={event => patch({ exposedParams: settings.exposedParams.map(entry => entry.path === p.path
                          ? { ...entry, [field]: type === "number" ? (event.target.value === "" ? undefined : Number(event.target.value)) : event.target.value }
                          : entry) })}
                        style={inputStyle(C)}
                      />
                    </label>
                  ))}
                </div>
              )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disclosure and actions */}
      <div style={{
        background: C.panel, border: `1px solid ${C.amber}44`, borderRadius: 8, padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <div style={{ fontSize: 12, color: C.text, fontFamily: FONT, lineHeight: 1.6 }}>
          <strong>Publishing makes this model readable by anyone with the link.</strong> The model
          definition, its parameters and its results are served to the visitor’s browser, so a visitor
          can read how the model works and run it themselves.
          {settings?.showEvidenceRegister !== false && coverage.total > 0 && (
            <> Its evidence and assumption register is published too, so your sources are visible as well as your numbers.</>
          )}{" "}
          Your display name appears as the author, so the model can be cited.
        </div>
        {!isPublished && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={e => setAcknowledged(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>
              I understand this model becomes publicly readable
            </span>
          </label>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="primary" onClick={doPublish} disabled={busy || blockingErrors > 0 || !hasTitle}>
            {isPublished ? "Publish again" : "Publish"}
          </Btn>
          <Btn variant="ghost" onClick={saveDraft} disabled={busy || !hasTitle}>Save settings</Btn>
          {isPublished && (
            <>
              <Btn variant="ghost" onClick={doWithdraw} disabled={busy}>Withdraw</Btn>
              <Btn
                variant="ghost"
                disabled={busy}
                ariaLabel="Copy the public link"
                onClick={copyPublicLink}
              >
                Copy public link
              </Btn>
            </>
          )}
          {status !== PUBLISH_STATUS.DRAFT && (
            <Btn variant="ghost" onClick={doUnpublish} disabled={busy}>Unpublish</Btn>
          )}
          {settings && (
            <Btn variant="danger" onClick={doDelete} disabled={busy}>Remove publish settings</Btn>
          )}
        </div>
        {blockingErrors > 0 && (
          <div style={{ fontSize: 11, color: C.amber, fontFamily: FONT }}>
            Publishing is blocked until the model&apos;s errors are fixed.
          </div>
        )}
      </div>

      {/* The owner's other published models */}
      {otherPublished.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, fontFamily: FONT, letterSpacing: 1 }}>
            YOUR OTHER PUBLISHED MODELS
          </div>
          {otherPublished.map(p => (
            <div
              key={p.modelId}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                background: C.panel, border: `1px solid ${C.border}`, borderRadius: 6, padding: "8px 10px",
              }}
            >
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 12, color: C.text, fontFamily: FONT }}>{p.title}</span>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: FONT }}>
                  {p.status === PUBLISH_STATUS.PUBLISHED
                    ? "Published"
                    : p.status === PUBLISH_STATUS.WITHDRAWN ? "Withdrawn" : "Draft"}
                </span>
              </div>
              {p.status === PUBLISH_STATUS.PUBLISHED && (
                <Btn
                  small
                  variant="ghost"
                  ariaLabel={`Withdraw ${p.title}`}
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await withdrawPublishedModel(p.modelId, userId);
                      setOtherPublished(prev => prev.map(x =>
                        x.modelId === p.modelId ? { ...x, status: PUBLISH_STATUS.WITHDRAWN } : x
                      ));
                      toastRef.current.success("Withdrawn");
                    } catch (err) {
                      toastRef.current.error(err?.message || "Could not withdraw that model");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Withdraw
                </Btn>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
