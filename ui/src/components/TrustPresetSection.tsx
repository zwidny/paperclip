import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AgentPermissions, TrustPreset } from "@paperclipai/shared";
import { Check, Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, CollapsibleSection } from "./agent-config-primitives";
import {
  buildPermissionsForTrustPreset,
  clearSingleLowTrustBoundaryTarget,
  getLowTrustBoundary,
  getSingleLowTrustBoundaryTarget,
  getTrustPreset,
  isCeLowTrustBoundaryEditable,
  lowTrustBoundaryHasScope,
  setSingleLowTrustBoundaryTarget,
  summarizeLowTrustBoundaryTarget,
  TRUST_PRESET_DESCRIPTIONS,
  TRUST_PRESET_LABELS,
  type LowTrustBoundaryTarget,
} from "../lib/trust-policy-ui";
import { cn } from "../lib/utils";
import { useTranslation } from "../i18n";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function formatCount(value: readonly unknown[] | undefined, singular: string, plural: string) {
  const count = value?.length ?? 0;
  if (count === 0) return "-";
  return `${count} ${count === 1 ? singular : plural}`;
}

function PolicyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-right", value === "-" && "text-muted-foreground")}>{value}</span>
    </div>
  );
}

export interface LowTrustBoundaryCandidate {
  id: string;
  label: string;
}

type LowTrustBoundaryTargetType = LowTrustBoundaryTarget["type"];

const BOUNDARY_TARGET_LABELS: Record<LowTrustBoundaryTargetType, string> = {
  project: "Project",
  root_issue: "Root issue",
  issue: "Issue",
};

const BOUNDARY_TARGET_LABEL_KEYS: Record<LowTrustBoundaryTargetType, string> = {
  project: "trustPreset.target.project",
  root_issue: "trustPreset.target.rootIssue",
  issue: "trustPreset.target.issue",
};

const TRUST_PRESET_LABEL_KEYS: Record<TrustPreset, string> = {
  standard: "trustPreset.label.standard",
  low_trust_review: "trustPreset.label.low_trust_review",
};

const TRUST_PRESET_DESCRIPTION_KEYS: Record<TrustPreset, string> = {
  standard: "trustPreset.description.standard",
  low_trust_review: "trustPreset.description.low_trust_review",
};

export function TrustPresetSection({
  permissions,
  onChange,
  disabled,
  companyId,
  projectCandidates = [],
  issueCandidates = [],
  candidatesLoading,
  allowSingleIssue = true,
  projectAccessEditor,
  layout = "select",
  aside,
}: {
  permissions: Partial<AgentPermissions> | null | undefined;
  onChange: (permissions: Partial<AgentPermissions>) => void;
  disabled?: boolean;
  companyId?: string | null;
  projectCandidates?: LowTrustBoundaryCandidate[];
  issueCandidates?: LowTrustBoundaryCandidate[];
  candidatesLoading?: boolean;
  allowSingleIssue?: boolean;
  projectAccessEditor?: ReactNode;
  /** "cards" shows the presets as selectable cards beside `aside` (the agent page). */
  layout?: "select" | "cards";
  aside?: ReactNode;
}) {
  const { t } = useTranslation();
  const [policyOpen, setPolicyOpen] = useState(false);
  const preset = getTrustPreset(permissions);
  const boundary = getLowTrustBoundary(permissions);
  const boundaryTarget = getSingleLowTrustBoundaryTarget(boundary);
  const [targetType, setTargetType] = useState<LowTrustBoundaryTargetType>(boundaryTarget?.type ?? "project");
  const lowTrust = preset === "low_trust_review";
  const hasScope = lowTrustBoundaryHasScope(boundary);
  const boundaryEditable = isCeLowTrustBoundaryEditable(boundary);
  const policy = permissions?.authorizationPolicy ?? null;
  const managedPermissions = useMemo(
    () => buildPermissionsForTrustPreset(permissions, preset),
    [permissions, preset],
  );

  useEffect(() => {
    if (boundaryTarget) setTargetType(boundaryTarget.type);
  }, [boundaryTarget?.type]);

  function handlePresetChange(value: string) {
    const nextPreset: TrustPreset = value === "low_trust_review" ? "low_trust_review" : "standard";
    onChange(buildPermissionsForTrustPreset(permissions, nextPreset));
  }

  function handleBoundaryTargetChange(targetId: string) {
    if (!companyId || !targetId) return;
    onChange(setSingleLowTrustBoundaryTarget(permissions, companyId, { type: targetType, id: targetId }));
  }

  function handleClearBoundary() {
    onChange(clearSingleLowTrustBoundaryTarget(permissions));
  }

  const targetCandidates = targetType === "project" ? projectCandidates : issueCandidates;
  const boundaryValue = boundaryTarget?.type === targetType ? boundaryTarget.id : "";

  const containment = lowTrust ? (
          <div
            role={hasScope ? "status" : "alert"}
            aria-live="polite"
            className={cn(
              "rounded-md border px-3 py-2.5 text-sm flex gap-2",
              hasScope
                ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-100"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {hasScope ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <div>
                <p className="font-medium">
                  {hasScope
                    ? t("trustPreset.containmentActiveTitle", { defaultValue: "Containment active" })
                    : t("trustPreset.containmentMissingTitle", { defaultValue: "Containment not configured" })}
                </p>
                <p className="mt-1 text-xs leading-5">
                  {hasScope
                    ? t("trustPreset.containmentActiveDescription", {
                        defaultValue:
                          "This agent can only read and mutate work inside its assigned review boundary. Raw output is quarantined from higher-trust agents until a trusted reviewer promotes it.",
                      })
                    : t("trustPreset.containmentMissingDescription", {
                        defaultValue:
                          "This agent is set to low-trust review, but no project, root issue, or issue scope is set in the core policy. Add a scope before this agent can run without denial.",
                      })}
                </p>
              </div>
              {projectAccessEditor && (boundary?.projectIds?.length ?? 0) > 1 ? null : boundaryEditable ? (
                <div className="rounded-md border border-border/70 bg-background/70 p-3 text-foreground space-y-3">
                  <div className="grid gap-3 sm:grid-cols-(--gtc-12)">
                    <Field label={t("trustPreset.boundaryType", { defaultValue: "Boundary type" })}>
                      <select
                        className={inputClass}
                        value={targetType}
                        onChange={(event) => setTargetType(event.target.value as LowTrustBoundaryTargetType)}
                        disabled={disabled}
                      >
                        <option value="project">{t(BOUNDARY_TARGET_LABEL_KEYS.project, { defaultValue: BOUNDARY_TARGET_LABELS.project })}</option>
                        <option value="root_issue">{t(BOUNDARY_TARGET_LABEL_KEYS.root_issue, { defaultValue: BOUNDARY_TARGET_LABELS.root_issue })}</option>
                        {allowSingleIssue && <option value="issue">{t(BOUNDARY_TARGET_LABEL_KEYS.issue, { defaultValue: BOUNDARY_TARGET_LABELS.issue })}</option>}
                      </select>
                    </Field>
                    <Field label={t(BOUNDARY_TARGET_LABEL_KEYS[targetType], { defaultValue: BOUNDARY_TARGET_LABELS[targetType] })}>
                      <select
                        className={inputClass}
                        value={boundaryValue}
                        onChange={(event) => handleBoundaryTargetChange(event.target.value)}
                        disabled={disabled || !companyId || candidatesLoading || targetCandidates.length === 0}
                      >
                        <option value="">
                          {candidatesLoading
                            ? t("trustPreset.loading", { defaultValue: "Loading…" })
                            : targetCandidates.length === 0
                              ? targetType === "project"
                                ? t("trustPreset.noProjects", { defaultValue: "No projects available" })
                                : t("trustPreset.noIssues", { defaultValue: "No issues available" })
                              : t("trustPreset.selectBoundary", { defaultValue: "Select boundary" })}
                        </option>
                        {targetCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {t("trustPreset.ceNote", {
                        defaultValue:
                          "CE saves one containment boundary at a time. Saved policies include this organization id.",
                      })}
                    </p>
                    {boundaryTarget ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs"
                        onClick={handleClearBoundary}
                        disabled={disabled}
                      >
                        {t("trustPreset.clearBoundary", { defaultValue: "Clear boundary" })}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-border/70 bg-background/70 p-3 text-foreground">
                  <p className="text-sm font-medium">{t("trustPreset.managedTitle", { defaultValue: "Managed by EE/API" })}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t("trustPreset.managedDescription", {
                      target: summarizeLowTrustBoundaryTarget(boundary).toLowerCase(),
                      defaultValue:
                        "This policy has {{target}} and cannot be edited by the CE single-boundary editor.",
                    })}
                  </p>
                </div>
              )}
              {!projectAccessEditor && <p className="text-xs text-muted-foreground">
                {t("trustPreset.upsell", { defaultValue: "Want to set more than one containment boundary?" })}{" "}
                <a
                  className="underline underline-offset-2 hover:text-foreground"
                  href="https://paperclip.ing/ee"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("trustPreset.upsellCta", { defaultValue: "Get Paperclip EE." })}
                </a>
              </p>}
              <CollapsibleSection
                title={t("trustPreset.viewPolicy", { defaultValue: "View policy" })}
                open={policyOpen}
                onToggle={() => setPolicyOpen((open) => !open)}
              >
                <div className="divide-y divide-border/60 text-foreground">
                  <PolicyRow label={t("trustPreset.policy.preset", { defaultValue: "Preset" })} value={t("trustPreset.policy.presetValue", { defaultValue: "Low-trust review v1" })} />
                  <PolicyRow label={t("trustPreset.policy.rawOutput", { defaultValue: "Raw output" })} value={t("trustPreset.policy.rawOutputValue", { defaultValue: "Quarantined from higher-trust agents" })} />
                  <PolicyRow label={t("trustPreset.policy.projects", { defaultValue: "Projects" })} value={formatCount(boundary?.projectIds, t("trustPreset.count.project", { defaultValue: "project" }), t("trustPreset.count.projects", { defaultValue: "projects" }))} />
                  <PolicyRow label={t("trustPreset.policy.rootIssue", { defaultValue: "Root issue" })} value={boundary?.rootIssueId ? boundary.rootIssueId.slice(0, 8) : "-"} />
                  <PolicyRow label={t("trustPreset.policy.explicitIssues", { defaultValue: "Explicit issues" })} value={formatCount(boundary?.issueIds, t("trustPreset.count.issue", { defaultValue: "issue" }), t("trustPreset.count.issues", { defaultValue: "issues" }))} />
                  <PolicyRow label={t("trustPreset.policy.allowedAgents", { defaultValue: "Allowed agents" })} value={formatCount(boundary?.allowedAgentIds, t("trustPreset.count.agent", { defaultValue: "agent" }), t("trustPreset.count.agents", { defaultValue: "agents" }))} />
                  <PolicyRow label={t("trustPreset.policy.allowedTools", { defaultValue: "Allowed tools" })} value={boundary?.allowedToolClasses?.join(" · ") || "-"} />
                  <PolicyRow label={t("trustPreset.policy.allowedSecrets", { defaultValue: "Allowed secrets" })} value={formatCount(boundary?.allowedSecretBindingIds, t("trustPreset.count.binding", { defaultValue: "binding" }), t("trustPreset.count.bindings", { defaultValue: "bindings" }))} />
                  <PolicyRow label={t("trustPreset.policy.promotionTarget", { defaultValue: "Promotion target" })} value={boundary?.outputPromotionTarget?.issueId?.slice(0, 8) ?? "-"} />
                  <PolicyRow
                    label={t("trustPreset.policy.eeFields", { defaultValue: "EE fields" })}
                    value={Object.keys(policy ?? {}).some((key) => !["trustPreset", "reviewPreset", "trustBoundary"].includes(key))
                      ? t("trustPreset.policy.eeFieldsValue", { defaultValue: "Custom advanced policy fields preserved" })
                      : "-"}
                  />
                </div>
              </CollapsibleSection>
            </div>
          </div>
        ) : null;

  if (layout === "cards") {
    return (
      <div className="flex flex-col gap-(--agent-detail-module-gap)">
        <div className="grid gap-(--agent-detail-module-gap) sm:grid-cols-3">
          <div role="radiogroup" aria-label="Trust preset" className="contents">
            {(["low_trust_review", "standard"] as const).map((value) => {
              const selected = preset === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-agent-tile=""
                  disabled={disabled}
                  onClick={() => (selected ? undefined : handlePresetChange(value))}
                  className={cn(
                    "flex min-h-(--agent-detail-tile-min-h) flex-col gap-2 rounded-lg border bg-(--agent-detail-tile) p-(--agent-detail-module-inset) text-left transition-colors outline-none hover:bg-(--agent-detail-tile-hover) focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    selected ? "border-foreground" : "border-transparent",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{t(TRUST_PRESET_LABEL_KEYS[value], { defaultValue: TRUST_PRESET_LABELS[value] })}</span>
                    {selected ? <Check className="size-4 text-foreground" aria-hidden /> : null}
                  </span>
                  <span className="text-sm leading-5 text-muted-foreground">{t(TRUST_PRESET_DESCRIPTION_KEYS[value], { defaultValue: TRUST_PRESET_DESCRIPTIONS[value] })}</span>
                </button>
              );
            })}
          </div>
          {aside}
        </div>
        {containment}
        {lowTrust ? projectAccessEditor : null}
        {managedPermissions.authorizationPolicy?.reviewPreset ? null : (
          <p className="text-xs text-muted-foreground">
            {t("trustPreset.advancedNote", {
              defaultValue:
                "Advanced permissions remain editable through the EE permissions extension when installed.",
            })}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium">{t("trustPreset.title", { defaultValue: "Trust" })}</h3>
      <div className="rounded-lg border border-border p-4 space-y-3">
        <Field label={t("trustPreset.presetLabel", { defaultValue: "Trust preset" })} hint={t("trustPreset.presetHint", { defaultValue: "Choose how broadly this agent can read and act on Paperclip work objects." })}>
          <select
            className={inputClass}
            value={preset}
            onChange={(event) => handlePresetChange(event.target.value)}
            disabled={disabled}
          >
            <option value="standard">{t(TRUST_PRESET_LABEL_KEYS.standard, { defaultValue: TRUST_PRESET_LABELS.standard })}</option>
            <option value="low_trust_review">{t(TRUST_PRESET_LABEL_KEYS.low_trust_review, { defaultValue: TRUST_PRESET_LABELS.low_trust_review })}</option>
          </select>
        </Field>
        <p className="text-xs text-muted-foreground">{t(TRUST_PRESET_DESCRIPTION_KEYS[preset], { defaultValue: TRUST_PRESET_DESCRIPTIONS[preset] })}</p>

        {containment}

        {lowTrust && projectAccessEditor}

        {managedPermissions.authorizationPolicy?.reviewPreset ? null : (
          <p className="text-xs text-muted-foreground">
            {t("trustPreset.advancedNote", {
              defaultValue:
                "Advanced permissions remain editable through the EE permissions extension when installed.",
            })}
          </p>
        )}
      </div>
    </div>
  );
}
