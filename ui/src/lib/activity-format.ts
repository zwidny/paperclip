import type { Agent } from "@paperclipai/shared";
import type { CompanyUserProfile } from "./company-members";
import { formatReviewPolicyValue } from "./review-policy";
import { brandName, i18n, t } from "../i18n";

type ActivityDetails = Record<string, unknown> | null | undefined;

type ActivityParticipant = {
  type: "agent" | "user";
  agentId?: string | null;
  userId?: string | null;
};

type ActivityIssueReference = {
  id?: string | null;
  identifier?: string | null;
  title?: string | null;
};

interface ActivityFormatOptions {
  agentMap?: Map<string, Agent>;
  userProfileMap?: Map<string, CompanyUserProfile>;
  currentUserId?: string | null;
}

const ACTIVITY_ROW_VERBS: Record<string, string> = {
  "case.created": "created",
  "case.updated": "updated",
  "case.fields_changed": "updated details on",
  "case.status_changed": "changed status on",
  "case.issue_linked": "linked a task to",
  "case.issue_unlinked": "unlinked a task from",
  "case.child_linked": "linked a child to",
  "case.attachment_added": "attached a file to",
  "case.label_added": "added a label to",
  "case.label_removed": "removed a label from",
  "case.document_revised": "updated a document on",
  "case.handoff_requested": "requested a handoff for",
  "case.handoff_applied": "handed off",
  "case.handoff_delivered": "delivered a handoff for",
  "case.handoff_retry_requested": "retried a handoff for",
  "case.handoff_cancelled": "cancelled a handoff for",
  "case.handoff_completed": "completed",
  "issue.created": "created",
  "issue.updated": "updated",
  "issue.read_marked": "read",
  "issue.read_unmarked": "marked unread",
  "issue.checked_out": "checked out",
  "issue.released": "released",
  "issue.comment_added": "commented on",
  "issue.comment_cancelled": "cancelled a queued comment on",
  "issue.queued_comment_edited": "edited a queued comment on",
  "issue.queued_comments_reordered": "reordered queued comments on",
  "issue.queued_comment_discarded": "discarded a queued comment on",
  "issue.comment_deleted": "deleted a comment on",
  "issue.attachment_added": "attached file to",
  "issue.attachment_removed": "removed attachment from",
  "issue.document_created": "created document for",
  "issue.document_updated": "updated document on",
  "issue.document_locked": "locked document on",
  "issue.document_unlocked": "unlocked document on",
  "issue.document_deleted": "deleted document from",
  "issue.monitor_scheduled": "scheduled monitor on",
  "issue.monitor_triggered": "triggered monitor for",
  "issue.monitor_cleared": "cleared monitor on",
  "issue.monitor_skipped": "skipped monitor for",
  "issue.monitor_exhausted": "exhausted monitor on",
  "issue.monitor_recovery_wake_queued": "queued monitor recovery for",
  "issue.monitor_recovery_issue_created": "created monitor recovery for",
  "issue.monitor_escalated_to_board": "escalated monitor for",
  "issue.commented": "commented on",
  "issue.deleted": "deleted",
  "issue.successful_run_handoff_required": "flagged missing next step on",
  "issue.successful_run_handoff_resolved": "recorded next step chosen on",
  "issue.successful_run_handoff_escalated": "escalated missing next step on",
  "issue.accepted_plan_decomposition_updated": "updated accepted-plan decomposition on",
  "issue.recovery_action_opened": "opened a recovery action on",
  "issue.workspace_recovered": "recovered saved work for",
  "issue.retry_continued_from_saved_work": "continued from saved work on",
  "issue.workspace_recovery_requested": "requested workspace recovery for",
  "issue.previous_run_files_waiting": "is still working to save the previous run's files on",
  "issue.previous_run_files_lost": "continued from the last save on",
  "issue.recovery_action_resolved": "resolved the recovery action on",
  "issue.recovery_action_escalated": "escalated the recovery action on",
  "agent.created": "created",
  "agent.updated": "updated",
  "agent.paused": "paused",
  "agent.resumed": "resumed",
  "agent.error_cleared": "cleared error on",
  "agent.terminated": "terminated",
  "agent.key_created": "created API key for",
  "agent.budget_updated": "updated budget for",
  "agent.runtime_session_reset": "reset session for",
  "heartbeat.invoked": "invoked heartbeat for",
  "heartbeat.cancelled": "cancelled heartbeat for",
  "heartbeat.output_stale_source_resolved": "system-folded stale run on",
  "heartbeat.output_stale_recovery_recursion_refused": "refused recovery-on-recovery for",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
  // Interaction outcomes (PAP-16506). An agent may now resolve one — including a
  // review of its own work — so these must read as outcomes in the feed instead
  // of falling through to the raw "issue thread interaction accepted" action id.
  // `details.interactionKind` sharpens the wording; see INTERACTION_OUTCOME_LABELS.
  "issue.thread_interaction_created": "asked for a decision on",
  "issue.thread_interaction_accepted": "accepted the request on",
  "issue.thread_interaction_rejected": "rejected the request on",
  "issue.thread_interaction_answered": "answered the request on",
  "issue.thread_interaction_withdrawn": "withdrew the request on",
  "issue.thread_interaction_cancelled": "cancelled the request on",
  "issue.thread_interaction_skipped": "skipped the request on",
  "issue.thread_interaction_dismissed": "deferred the request on",
  "issue.thread_interaction_expired": "expired the request on",
  "issue.thread_interaction_item_verdicts_submitted": "submitted verdicts on",
  "issue.stalled_review_decided": "recorded a review verdict on",
  "project.created": "created",
  "project.updated": "updated",
  "project.deleted": "deleted",
  "goal.created": "created",
  "goal.updated": "updated",
  "goal.deleted": "deleted",
  "cost.reported": "reported cost for",
  "cost.recorded": "recorded cost for",
  "company.created": "created organization",
  "company.updated": "updated organization",
  "company.archived": "archived",
  "company.reactivated": "reactivated",
  "company.budget_updated": "updated budget for",
  "audit.exported": "exported the agent audit log for",
  "tool_app.connected": "connected",
  "tool_app.oauth_connected": "connected credentials for",
  "tool_app.oauth_failed": "failed to connect credentials for",
  "tool_app.oauth_access_finalized": "finished credential access for",
  "tool_app.finished": "finished setup for",
  "tool_app.reconnected": "reconnected",
  "tool_connection.created": "created",
  "tool_connection.updated": "updated",
  "tool_connection.archived": "removed",
  "tool_connection.catalog_refresh": "refreshed actions for",
  "tool_connection.installs_synced": "changed agent installs for",
  "tool_connection.install_access_extended": "extended agent access for",
  "tool_connection.grant_audience_replaced": "changed human access for",
  "tool_connection.grant_added": "added credentials to",
  "tool_connection.grant_revoked": "revoked credentials from",
  "tool_connection.grant_delegated": "delegated credentials for",
  "tool_connection.grant_delegation_revoked": "revoked credential delegation for",
};

const ISSUE_ACTIVITY_LABELS: Record<string, string> = {
  "issue.created": "created the issue",
  "issue.updated": "updated the issue",
  "issue.checked_out": "checked out the issue",
  "issue.released": "released the issue",
  "issue.comment_added": "added a comment",
  "issue.comment_cancelled": "cancelled a queued comment",
  "issue.queued_comment_edited": "edited a queued comment",
  "issue.queued_comments_reordered": "reordered queued comments",
  "issue.queued_comment_discarded": "discarded a queued comment",
  "issue.comment_deleted": "deleted a comment",
  "issue.feedback_vote_saved": "saved feedback on an AI output",
  "issue.attachment_added": "added an attachment",
  "issue.attachment_removed": "removed an attachment",
  "issue.document_created": "created a document",
  "issue.document_updated": "updated a document",
  "issue.document_locked": "locked a document",
  "issue.document_unlocked": "unlocked a document",
  "issue.document_deleted": "deleted a document",
  "issue.monitor_scheduled": "scheduled a monitor",
  "issue.monitor_triggered": "triggered a monitor",
  "issue.monitor_cleared": "cleared a monitor",
  "issue.monitor_skipped": "skipped a monitor",
  "issue.monitor_exhausted": "exhausted a monitor",
  "issue.monitor_recovery_wake_queued": "queued a monitor recovery wake",
  "issue.monitor_recovery_issue_created": "created a monitor recovery issue",
  "issue.monitor_escalated_to_board": "escalated a monitor to the board",
  "issue.deleted": "deleted the issue",
  "issue.successful_run_handoff_required": "Run finished without a clear next step",
  "issue.successful_run_handoff_resolved": "Next step chosen",
  "issue.successful_run_handoff_escalated": "Run finished without a next step - recovery escalated",
  "issue.cross_issue_influence_cap_rejected": "hit the per-run cross-task write cap",
  "issue.cross_issue_influence_observed": "made a cross-task write",
  "issue.attribution_spoof_rejected": "tried to choose its own responsible user",
  "issue.recovery_action_opened": "Opened a source-scoped recovery action",
  "issue.workspace_recovered": "Saved work recovered.",
  "issue.retry_continued_from_saved_work": "Retry continued from saved work.",
  "issue.workspace_recovery_requested": "Requested workspace recovery",
  get "issue.previous_run_files_waiting"() {
    return `Still working to save the previous run's unsaved files. New runs start once they are saved. ${brandName()} keeps trying on its own.`;
  },
  "issue.previous_run_files_lost": "Could not save the previous run's unsaved files because they were already gone. This task continues from its last save.",
  "issue.recovery_action_resolved": "Resolved the recovery action",
  "issue.recovery_action_escalated": "Escalated the recovery action",
  "issue.accepted_plan_decomposition_updated": "updated the accepted-plan decomposition",
  "agent.created": "created an agent",
  "agent.updated": "updated the agent",
  "agent.paused": "paused the agent",
  "agent.resumed": "resumed the agent",
  "agent.error_cleared": "cleared the agent error",
  "agent.terminated": "terminated the agent",
  "heartbeat.invoked": "invoked a heartbeat",
  "heartbeat.cancelled": "cancelled a heartbeat",
  "heartbeat.output_stale_source_resolved": "System folded a stale run",
  "heartbeat.output_stale_recovery_recursion_refused": "Refused recovery-on-recovery escalation",
  "approval.created": "requested approval",
  "approval.approved": "approved",
  "approval.rejected": "rejected",
  "issue.thread_interaction_created": "asked for a decision",
  "issue.thread_interaction_accepted": "accepted the request",
  "issue.thread_interaction_rejected": "rejected the request",
  "issue.thread_interaction_answered": "answered the request",
  "issue.thread_interaction_withdrawn": "withdrew the request",
  "issue.thread_interaction_cancelled": "cancelled the request",
  "issue.thread_interaction_skipped": "skipped the request",
  "issue.thread_interaction_dismissed": "deferred the request",
  "issue.thread_interaction_expired": "expired the request",
  "issue.thread_interaction_item_verdicts_submitted": "submitted verdicts on the request",
  "issue.stalled_review_decided": "recorded a review verdict",
};

/**
 * `issue.stalled_review_decided` carries the verb the actor chose, so the line
 * names the verdict ("approved the review") rather than the generic action.
 * Mirrors `StalledReviewDecisionAction` in shared.
 */
const STALLED_REVIEW_DECISION_LABELS: Record<string, string> = {
  approve: "approved the review",
  request_changes: "requested changes on the review",
  send_back: "sent the review back to work",
};

/**
 * `issue.thread_interaction_accepted` / `_rejected` fire for *every* interaction
 * kind, not only for a review. A task suggestion or a question is accepted, not
 * approved, so the kind on the event picks the verb. Kinds absent from a map
 * keep the neutral "accepted the request" wording from the tables above, which
 * is also the fallback for an event that carries no kind.
 */
const INTERACTION_ACCEPTED_LABELS: Record<string, string> = {
  request_confirmation: "approved the request",
  request_checkbox_confirmation: "approved the request",
  suggest_tasks: "accepted the task suggestions",
  ask_user_questions: "accepted the answers",
};

const INTERACTION_REJECTED_LABELS: Record<string, string> = {
  request_confirmation: "rejected the request",
  request_checkbox_confirmation: "rejected the request",
  suggest_tasks: "declined the task suggestions",
  ask_user_questions: "declined the questions",
};

/**
 * Kind-aware wording for an interaction outcome, or `null` when the tables
 * above already say it well enough.
 */
function formatInteractionOutcomeLabel(action: string, details: ActivityDetails): string | null {
  const table = action === "issue.thread_interaction_accepted"
    ? INTERACTION_ACCEPTED_LABELS
    : action === "issue.thread_interaction_rejected"
      ? INTERACTION_REJECTED_LABELS
      : null;
  if (!table) return null;
  const kind = typeof details?.interactionKind === "string" ? details.interactionKind : null;
  if (!kind) return null;
  const english = table[kind];
  if (!english) return null;
  const outcome = action === "issue.thread_interaction_accepted" ? "accepted" : "rejected";
  return t(`activityFormat.interaction.${outcome}.${kind}`, { defaultValue: english });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function humanizeValue(value: unknown): string {
  if (typeof value !== "string") {
    if (value === null || value === undefined) {
      return t("activityFormat.noneValue", { defaultValue: "none" });
    }
    return String(value);
  }
  return value.replace(/_/g, " ");
}

/** Task status label; unknown values fall back to the humanized raw value. */
function statusLabel(value: string): string {
  const label = t(`tasks.status.${value}`, { defaultValue: humanizeValue(value) });
  // Activity copy embeds the label mid-sentence, so English keeps the sentence
  // case it used before the labels moved to `tasks.status` ("In review" ->
  // "in review"). Locales without case are unaffected.
  if ((i18n.language || "en").startsWith("en")) {
    return label.charAt(0).toLowerCase() + label.slice(1);
  }
  return label;
}

/**
 * Issue priority label. English keeps the humanized form it used before the
 * labels moved into the catalog, so existing sentence-case copy still reads the
 * same ("High" -> "high" mid-sentence).
 */
function priorityLabel(value: unknown): string {
  const raw = humanizeValue(value);
  const language = i18n.language || "en";
  if (language.startsWith("en")) return raw;
  const key = typeof value === "string" ? value : "";
  return key ? t(`activityFormat.priority.${key}`, { defaultValue: raw }) : raw;
}

/** Review policy value for "changed who can approve to …". */
function reviewPolicyText(value: unknown): string {
  const english = formatReviewPolicyValue(value);
  const key = typeof value === "string" ? value : "anyone";
  return t(`activityFormat.reviewPolicy.${key}`, { defaultValue: english });
}

/** Localized verdict wording for a stalled-review decision, or `null`. */
function formatStalledReviewLabel(decision: string | null): string | null {
  if (!decision) return null;
  const english = STALLED_REVIEW_DECISION_LABELS[decision];
  if (!english) return null;
  return t(`activityFormat.stalledReview.${decision}`, { defaultValue: english });
}

function isActivityParticipant(value: unknown): value is ActivityParticipant {
  const record = asRecord(value);
  if (!record) return false;
  return record.type === "agent" || record.type === "user";
}

function isActivityIssueReference(value: unknown): value is ActivityIssueReference {
  return asRecord(value) !== null;
}

function readParticipants(details: ActivityDetails, key: string): ActivityParticipant[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityParticipant);
}

function readIssueReferences(details: ActivityDetails, key: string): ActivityIssueReference[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isActivityIssueReference);
}

function formatUserLabel(userId: string | null | undefined, options: ActivityFormatOptions = {}): string {
  if (!userId || userId === "local-board") {
    return t("activityFormat.boardLabel", { defaultValue: "Board" });
  }
  if (options.currentUserId && userId === options.currentUserId) {
    return t("activityFormat.youLabel", { defaultValue: "You" });
  }
  const profile = options.userProfileMap?.get(userId);
  if (profile) return profile.label;
  return t("activityFormat.userFallback", {
    id: userId.slice(0, 5),
    defaultValue: `user ${userId.slice(0, 5)}`,
  });
}

function formatParticipantLabel(participant: ActivityParticipant, options: ActivityFormatOptions): string {
  if (participant.type === "agent") {
    const agentId = participant.agentId ?? "";
    return options.agentMap?.get(agentId)?.name
      ?? t("activityFormat.agentFallback", { defaultValue: "agent" });
  }
  return formatUserLabel(participant.userId, options);
}

function formatIssueReferenceLabel(reference: ActivityIssueReference): string {
  if (reference.identifier) return reference.identifier;
  if (reference.title) return reference.title;
  if (reference.id) return reference.id.slice(0, 8);
  return t("activityFormat.taskFallback", { defaultValue: "task" });
}

function formatChangedEntityLabel(
  singular: string,
  plural: string,
  labels: string[],
): string {
  if (labels.length <= 0) return plural;
  if (labels.length === 1) {
    return t("activityFormat.singularWithLabel", {
      singular,
      label: labels[0],
      defaultValue: `${singular} ${labels[0]}`,
    });
  }
  return t("activityFormat.countPlural", {
    count: labels.length,
    plural,
    defaultValue: `${labels.length} ${plural}`,
  });
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function readStringArrayLength(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  return value.filter((entry) => typeof entry === "string" && entry.length > 0).length;
}

function formatAcceptedPlanDecompositionDetail(details: ActivityDetails): string | null {
  if (!details) return null;
  const status = typeof details.status === "string" ? details.status : null;
  const requested = readNumber(details.requestedChildCount);
  const totalChildren = readStringArrayLength(details.childIssueIds);
  const newlyCreated = readStringArrayLength(details.newlyCreatedChildIssueIds);
  const reused = Math.max(0, totalChildren - newlyCreated);
  const parts: string[] = [];
  if (newlyCreated > 0) {
    parts.push(t("activityFormat.decomposition.createdNew", {
      count: newlyCreated,
      defaultValue: `created ${newlyCreated} new`,
    }));
  }
  if (reused > 0) {
    parts.push(t("activityFormat.decomposition.reusedExisting", {
      count: reused,
      defaultValue: `reused ${reused} existing`,
    }));
  }
  if (parts.length === 0 && requested !== null) {
    parts.push(t("activityFormat.decomposition.requested", {
      count: requested,
      defaultValue: `${requested} requested`,
    }));
  }
  const summary = parts.length > 0
    ? parts.join(t("activityFormat.listSeparator", { defaultValue: ", " }))
    : null;
  if (status === "completed" && summary) {
    return t("activityFormat.decomposition.completedWithSummary", {
      summary,
      defaultValue: `decomposition completed (${summary})`,
    });
  }
  if (status === "completed") {
    return t("activityFormat.decomposition.completed", { defaultValue: "decomposition completed" });
  }
  if (status === "in_flight" && summary) {
    return t("activityFormat.decomposition.inFlightWithSummary", {
      summary,
      defaultValue: `decomposition in flight (${summary})`,
    });
  }
  return summary;
}

function formatIssueUpdatedVerb(details: ActivityDetails): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  if (details.status !== undefined) {
    const rawFrom = previous.status;
    const from = rawFrom ? statusLabel(String(rawFrom)) : null;
    const to = statusLabel(String(
      details.status === "in_review" && details.externalConversationState === "waiting" ? "idle" : details.status,
    ));
    return from
      ? t("activityFormat.issueUpdated.statusFrom", {
          from,
          to,
          defaultValue: `changed status from ${from} to ${to} on`,
        })
      : t("activityFormat.issueUpdated.statusTo", {
          to,
          defaultValue: `changed status to ${to} on`,
        });
  }
  if (details.priority !== undefined) {
    const rawFrom = previous.priority;
    const from = rawFrom ? priorityLabel(rawFrom) : null;
    const to = priorityLabel(details.priority);
    return from
      ? t("activityFormat.issueUpdated.priorityFrom", {
          from,
          to,
          defaultValue: `changed priority from ${from} to ${to} on`,
        })
      : t("activityFormat.issueUpdated.priorityTo", {
          to,
          defaultValue: `changed priority to ${to} on`,
        });
  }
  return null;
}

function formatAssigneeName(details: ActivityDetails, options: ActivityFormatOptions): string | null {
  if (!details) return null;
  const agentId = details.assigneeAgentId;
  const userId = details.assigneeUserId;
  if (typeof agentId === "string" && agentId) {
    return options.agentMap?.get(agentId)?.name ?? "agent";
  }
  if (typeof userId === "string" && userId) {
    return formatUserLabel(userId, options);
  }
  return null;
}

function formatIssueUpdatedAction(details: ActivityDetails, options: ActivityFormatOptions = {}): string | null {
  if (!details) return null;
  const previous = asRecord(details._previous) ?? {};
  const parts: string[] = [];

  if (details.status !== undefined) {
    const rawFrom = previous.status;
    const from = rawFrom ? statusLabel(String(rawFrom)) : null;
    const to = statusLabel(String(
      details.status === "in_review" && details.externalConversationState === "waiting" ? "idle" : details.status,
    ));
    parts.push(
      from
        ? t("activityFormat.issueUpdated.statusFromDetail", {
            from,
            to,
            defaultValue: `changed the status from ${from} to ${to}`,
          })
        : t("activityFormat.issueUpdated.statusToDetail", {
            to,
            defaultValue: `changed the status to ${to}`,
          }),
    );
  }
  if (details.priority !== undefined) {
    const rawFrom = previous.priority;
    const from = rawFrom ? priorityLabel(rawFrom) : null;
    const to = priorityLabel(details.priority);
    parts.push(
      from
        ? t("activityFormat.issueUpdated.priorityFromDetail", {
            from,
            to,
            defaultValue: `changed the priority from ${from} to ${to}`,
          })
        : t("activityFormat.issueUpdated.priorityToDetail", {
            to,
            defaultValue: `changed the priority to ${to}`,
          }),
    );
  }
  if (details.assigneeAgentId !== undefined || details.assigneeUserId !== undefined) {
    const assigneeName = formatAssigneeName(details, options);
    parts.push(assigneeName
      ? t("activityFormat.issueUpdated.madeResponsible", {
          name: assigneeName,
          defaultValue: `made ${assigneeName} responsible for the task`,
        })
      : t("activityFormat.issueUpdated.clearedResponsible", { defaultValue: "cleared the responsible" }));
  }
  if (details.reviewPolicy !== undefined) {
    // `null` is the default ("anyone can approve"), so it must not read as
    // "changed the review policy to none" (PAP-16506).
    const value = reviewPolicyText(details.reviewPolicy);
    parts.push(t("activityFormat.issueUpdated.whoCanApprove", {
      value,
      defaultValue: `changed who can approve to ${value}`,
    }));
  }
  if (details.title !== undefined) {
    parts.push(t("activityFormat.issueUpdated.title", { defaultValue: "updated the title" }));
  }
  if (details.description !== undefined) {
    parts.push(t("activityFormat.issueUpdated.description", { defaultValue: "updated the description" }));
  }

  return parts.length > 0
    ? parts.join(t("activityFormat.listSeparator", { defaultValue: ", " }))
    : null;
}

function formatStructuredIssueChange(input: {
  action: string;
  details: ActivityDetails;
  options: ActivityFormatOptions;
  forIssueDetail: boolean;
}): string | null {
  const details = input.details;
  if (!details) return null;

  if (input.action === "issue.blockers_updated") {
    const singular = t("activityFormat.entity.blocker", { defaultValue: "blocker" });
    const plural = t("activityFormat.entity.blockers", { defaultValue: "blockers" });
    const added = readIssueReferences(details, "addedBlockedByIssues").map(formatIssueReferenceLabel);
    const removed = readIssueReferences(details, "removedBlockedByIssues").map(formatIssueReferenceLabel);
    if (added.length > 0 && removed.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, added);
      return input.forIssueDetail
        ? t("activityFormat.addedChanged", { changed, defaultValue: `added ${changed}` })
        : t("activityFormat.addedChangedTo", { changed, defaultValue: `added ${changed} to` });
    }
    if (removed.length > 0 && added.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, removed);
      return input.forIssueDetail
        ? t("activityFormat.removedChanged", { changed, defaultValue: `removed ${changed}` })
        : t("activityFormat.removedChangedFrom", { changed, defaultValue: `removed ${changed} from` });
    }
    return input.forIssueDetail
      ? t("activityFormat.updatedEntity", { plural, defaultValue: `updated ${plural}` })
      : t("activityFormat.updatedEntityOn", { plural, defaultValue: `updated ${plural} on` });
  }

  if (input.action === "issue.reviewers_updated" || input.action === "issue.approvers_updated") {
    const added = readParticipants(details, "addedParticipants").map((participant) => formatParticipantLabel(participant, input.options));
    const removed = readParticipants(details, "removedParticipants").map((participant) => formatParticipantLabel(participant, input.options));
    const isReviewer = input.action === "issue.reviewers_updated";
    const singular = t(
      isReviewer ? "activityFormat.entity.reviewer" : "activityFormat.entity.approver",
      { defaultValue: isReviewer ? "reviewer" : "approver" },
    );
    const plural = t(
      isReviewer ? "activityFormat.entity.reviewers" : "activityFormat.entity.approvers",
      { defaultValue: isReviewer ? "reviewers" : "approvers" },
    );
    if (added.length > 0 && removed.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, added);
      return input.forIssueDetail
        ? t("activityFormat.addedChanged", { changed, defaultValue: `added ${changed}` })
        : t("activityFormat.addedChangedTo", { changed, defaultValue: `added ${changed} to` });
    }
    if (removed.length > 0 && added.length === 0) {
      const changed = formatChangedEntityLabel(singular, plural, removed);
      return input.forIssueDetail
        ? t("activityFormat.removedChanged", { changed, defaultValue: `removed ${changed}` })
        : t("activityFormat.removedChangedFrom", { changed, defaultValue: `removed ${changed} from` });
    }
    return input.forIssueDetail
      ? t("activityFormat.updatedEntity", { plural, defaultValue: `updated ${plural}` })
      : t("activityFormat.updatedEntityOn", { plural, defaultValue: `updated ${plural} on` });
  }

  return null;
}

export function formatActivityVerb(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
): string {
  if (action.startsWith("tool_gateway.")) {
    const rawTool = typeof details?.tool === "string"
      ? details.tool
      : typeof details?.upstreamToolName === "string"
        ? details.upstreamToolName
        : t("activityFormat.toolGateway.appAction", { defaultValue: "an app action" });
    const tool = rawTool.replace(/[._-]+/g, " ");
    const isTest = details?.source === "test";
    if (action === "tool_gateway.call_completed") {
      return t(
        isTest ? "activityFormat.toolGateway.callCompletedTest" : "activityFormat.toolGateway.callCompleted",
        { tool, defaultValue: `${isTest ? "tested" : "used"} ${tool} on` },
      );
    }
    if (action === "tool_gateway.call_allowed") {
      return t(
        isTest ? "activityFormat.toolGateway.callAllowedTest" : "activityFormat.toolGateway.callAllowed",
        { tool, defaultValue: `${isTest ? "started a test of" : "was allowed to use"} ${tool} on` },
      );
    }
    if (action === "tool_gateway.call_denied") {
      return t("activityFormat.toolGateway.callDenied", {
        tool,
        defaultValue: `was blocked from using ${tool} on`,
      });
    }
    if (action === "tool_gateway.approval_requested") {
      return t("activityFormat.toolGateway.approvalRequested", {
        tool,
        defaultValue: `asked to use ${tool} on`,
      });
    }
    if (action === "tool_gateway.session_created") {
      return t("activityFormat.toolGateway.sessionCreated", { defaultValue: "opened an app session for" });
    }
    if (action === "tool_gateway.session_rejected") {
      return t("activityFormat.toolGateway.sessionRejected", {
        defaultValue: "was blocked from opening an app session for",
      });
    }
    if (action === "tool_gateway.discovery") {
      return t("activityFormat.toolGateway.discovery", { defaultValue: "discovered app actions for" });
    }
  }

  if (action === "issue.updated") {
    const issueUpdatedVerb = formatIssueUpdatedVerb(details);
    if (issueUpdatedVerb) return issueUpdatedVerb;
  }

  if (action === "issue.stalled_review_decided") {
    const decision = typeof details?.action === "string" ? details.action : null;
    const label = formatStalledReviewLabel(decision);
    if (label) {
      return t("activityFormat.suffixOn", { label, defaultValue: `${label} on` });
    }
  }

  const outcomeLabel = formatInteractionOutcomeLabel(action, details);
  if (outcomeLabel) {
    return t("activityFormat.suffixOn", { label: outcomeLabel, defaultValue: `${outcomeLabel} on` });
  }

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: false,
  });
  if (structuredChange) return structuredChange;

  const english = ACTIVITY_ROW_VERBS[action];
  return english
    ? t(`activityFormat.verb.${action.replace(/\./g, "_")}`, { defaultValue: english })
    : action.replace(/[._]/g, " ");
}

export function formatIssueActivityAction(
  action: string,
  details?: Record<string, unknown> | null,
  options: ActivityFormatOptions = {},
): string {
  if (action === "issue.updated") {
    const issueUpdatedAction = formatIssueUpdatedAction(details, options);
    if (issueUpdatedAction) return issueUpdatedAction;
  }

  const structuredChange = formatStructuredIssueChange({
    action,
    details,
    options,
    forIssueDetail: true,
  });
  if (structuredChange) return structuredChange;

  if (action === "issue.accepted_plan_decomposition_updated") {
    const detail = formatAcceptedPlanDecompositionDetail(details);
    if (detail) return detail;
  }

  if (action === "issue.stalled_review_decided") {
    const decision = typeof details?.action === "string" ? details.action : null;
    const label = formatStalledReviewLabel(decision);
    if (label) return label;
  }

  const outcomeLabel = formatInteractionOutcomeLabel(action, details);
  if (outcomeLabel) return outcomeLabel;

  if (action.startsWith("issue.monitor_") && details) {
    const serviceName = typeof details.serviceName === "string" && details.serviceName.trim()
      ? details.serviceName.trim()
      : null;
    const english = ISSUE_ACTIVITY_LABELS[action];
    const base = english
      ? t(`activityFormat.issue.${action.replace(/\./g, "_")}`, { defaultValue: english })
      : action.replace(/[._]/g, " ");
    return serviceName
      ? t("activityFormat.withService", {
          label: base,
          service: serviceName,
          defaultValue: `${base} for ${serviceName}`,
        })
      : base;
  }

  if (
    (
      action === "issue.document_created" ||
      action === "issue.document_updated" ||
      action === "issue.document_locked" ||
      action === "issue.document_unlocked" ||
      action === "issue.document_deleted"
    ) &&
    details
  ) {
    const documentEnglish = ISSUE_ACTIVITY_LABELS[action];
    const label = documentEnglish
      ? t(`activityFormat.issue.${action.replace(/\./g, "_")}`, { defaultValue: documentEnglish })
      : action;
    const key = typeof details.key === "string"
      ? details.key
      : t("activityFormat.document", { defaultValue: "document" });
    const title = typeof details.title === "string" && details.title ? ` (${details.title})` : "";
    return t("activityFormat.documentWithKey", {
      label,
      key,
      title,
      defaultValue: `${label} ${key}${title}`,
    });
  }

  const english = ISSUE_ACTIVITY_LABELS[action];
  return english
    ? t(`activityFormat.issue.${action.replace(/\./g, "_")}`, { defaultValue: english })
    : action.replace(/[._]/g, " ");
}
