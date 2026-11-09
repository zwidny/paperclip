import { copyTextToClipboard } from "@/lib/clipboard";
import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryErrorState, useQueryView } from "@/components/QueryView";
import type { TFunction } from "i18next";
import {
  GITHUB_REVIEW_EVENTS,
  type GitHubChatConfiguration,
  type GitHubReviewPolicy,
  type GitHubAllowedPerson,
} from "@paperclipai/shared";
import { accessApi } from "@/api/access";
import { chatEndpointsApi } from "@/api/chatEndpoints";
import { githubChatApi } from "@/api/githubChat";
import { useOptionalCompany } from "@/context/CompanyContext";
import { Button } from "@/components/ui/button";
import {
  AtSign,
  Check,
  Copy,
  HelpCircle,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitHubSettingsDisclosure } from "./GitHubSettingsDisclosure";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { Label } from "@/components/ui/label";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { Link } from "@/lib/router";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { describeError } from "@/api/errors";
import { useTranslation } from "../../../i18n";

export const githubSelectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
type GitHubReviewEvent = (typeof GITHUB_REVIEW_EVENTS)[number];
/** English defaults for the event labels; translated at render time. */
const githubEventLabels: Record<GitHubReviewEvent, string> = {
  opened: "New pull request",
  synchronize: "Updated commits",
  reopened: "Reopened",
  ready_for_review: "Ready for review",
  mention: "Mention",
  comment: "Follow-up comment",
};
function githubEventLabel(event: GitHubReviewEvent, t: TFunction) {
  return t(`githubBot.events.${event}`, {
    defaultValue: githubEventLabels[event],
  });
}
function GitHubHelp({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={t("githubBot.help.about", {
            label,
            defaultValue: "About {{label}}",
          })}
          className="inline-flex shrink-0 items-center text-muted-foreground hover:text-foreground"
          onClick={() => setOpen(true)}
        >
          <HelpCircle className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{children}</TooltipContent>
    </Tooltip>
  );
}

export function GitHubToggle({
  label,
  description,
  help,
  checked,
  onChange,
  ariaLabel,
  disabled,
}: {
  label: string;
  description?: string;
  help?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="break-words text-sm font-medium">{label}</p>
          {help && <GitHubHelp label={label}>{help}</GitHubHelp>}
        </div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <ToggleSwitch
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}
/** Keep separators while typing; the saved policy still contains normalized lists. */
function GitHubListInput({
  id,
  values,
  separator = "\n",
  onChange,
}: {
  id: string;
  values: string[];
  separator?: "\n" | ",";
  onChange: (values: string[]) => void;
}) {
  const joiner = separator === "," ? ", " : "\n";
  const [text, setText] = useState(values.join(joiner));
  const parse = (value: string) =>
    value
      .split(separator)
      .map((item) => item.trim())
      .filter(Boolean);
  useEffect(() => {
    setText((current) =>
      JSON.stringify(parse(current)) === JSON.stringify(values)
        ? current
        : values.join(joiner),
    );
  }, [values, separator]);
  const props = {
    id,
    value: text,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setText(event.target.value);
      onChange(parse(event.target.value));
    },
  };
  return separator === "\n" ? <Textarea {...props} /> : <Input {...props} />;
}

function GitHubPassingScore({
  value,
  onChange,
  onValidityChange,
  text: controlledText,
  onTextChange,
}: {
  text?: string;
  onTextChange?: (text: string) => void;
  value: GitHubReviewPolicy["ratingThreshold"];
  onChange: (value: GitHubReviewPolicy["ratingThreshold"]) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const id = useId();
  const { t } = useTranslation();
  const [localText, setLocalText] = useState(String(value ?? 5));
  const text = controlledText ?? localText;
  const setText = onTextChange ?? setLocalText;
  const number = Number(text);
  const valid = value === null || (text.trim() !== "" && Number.isInteger(number) && number >= 1 && number <= 5);
  useEffect(() => setLocalText(String(value ?? 5)), [value]);
  useEffect(() => { onValidityChange?.(valid); }, [valid, onValidityChange]);
  return (
    <div className="space-y-3 py-3">
      <Label htmlFor={id}>{t("githubBot.policy.passingScore", { defaultValue: "Passing score" })}</Label>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Input id={id} type="number" min={1} max={5} step={1} required
            className="w-20" value={text} disabled={value === null}
            aria-invalid={!valid} aria-describedby={`${id}-help${valid ? "" : ` ${id}-error`}`}
            onChange={(event) => {
              const next = event.target.value;
              setText(next);
              const score = Number(next);
              if (next.trim() && Number.isInteger(score) && score >= 1 && score <= 5)
                onChange(score as 1 | 2 | 3 | 4 | 5);
            }} />
          <span className="text-sm text-muted-foreground">{t("githubBot.policy.outOfFive", { defaultValue: "out of 5" })}</span>
        </div>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox aria-label={t("githubBot.policy.reportOnly", { defaultValue: "Report only" })} checked={value === null}
            onCheckedChange={(checked) => { setText("5"); onChange(checked === true ? null : 5); }} />
          {t("githubBot.policy.reportOnly", { defaultValue: "Report only" })}
        </Label>
      </div>
      {!valid && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{t("githubBot.policy.scoreInvalid", { defaultValue: "Enter a whole number from 1 to 5." })}</p>}
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {value === null
          ? t("githubBot.policy.reportOnlyHelp", { defaultValue: "Publishes a neutral check without a score requirement. GitHub can accept neutral checks for merging." })
          : t("githubBot.policy.scoreHelp", { defaultValue: "Paperclip passes the check when a complete review of the latest commit meets this score. Lower scores fail. This does not approve the PR." })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("githubBot.policy.blockMergingPrefix", { defaultValue: "To block merging, require the " })}
        <strong>{t("githubBot.policy.blockMergingCheck", { defaultValue: "Paperclip Review" })}</strong>
        {t("githubBot.policy.blockMergingSuffix", { defaultValue: " check from this App in your GitHub branch rules. " })}
        <a className="underline hover:text-foreground"
          href="https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository"
          target="_blank" rel="noreferrer">{t("githubBot.policy.configureOnGitHub", { defaultValue: "Configure on GitHub" })}</a>
      </p>
    </div>
  );
}

export function GitHubPolicyEditor({
  policy,
  onChange,
  accessHref,
  onValidityChange,
  scoreText,
  onScoreTextChange,
  rememberedAutomaticMode,
  readOnly = false,
}: {
  accessHref?: string;
  readOnly?: boolean;
  scoreText?: string;
  onScoreTextChange?: (text: string) => void;
  rememberedAutomaticMode?: "linked_authors" | "allowed_authors";
  policy: GitHubReviewPolicy;
  onChange: (policy: GitHubReviewPolicy) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const id = useId();
  const { t } = useTranslation();
  const automaticMode = useRef<"linked_authors" | "allowed_authors">(
    "linked_authors",
  );
  if (policy.invocation !== "mentions_only")
    automaticMode.current = policy.invocation;
  const filterField = (
    key:
      | "includeAuthors"
      | "excludeAuthors"
      | "targetBranches"
      | "excludedBranches"
      | "requiredLabels"
      | "excludedLabels"
      | "ignoredPaths",
    label: string,
    help: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`${id}-github-${key}`}>{label}</Label>
      <GitHubListInput
        id={`${id}-github-${key}`}
        values={policy[key]}
        onChange={(values) => set(key, values)}
      />
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
  const [prompt, setPrompt] = useState<
    (typeof GITHUB_REVIEW_EVENTS)[number] | "issue_opened"
  >("opened");
  const set = <K extends keyof GitHubReviewPolicy>(
    key: K,
    value: GitHubReviewPolicy[K],
  ) => onChange({ ...policy, [key]: value });
  return (
    <div className="space-y-8">
      <section
        className="space-y-3"
        aria-labelledby={`${id}-github-instructions-heading`}
      >
        <h2
          id={`${id}-github-instructions-heading`}
          className="text-base font-semibold"
        >
          {t("githubBot.policy.instructions", { defaultValue: "Instructions" })}
        </h2>
        <MarkdownEditor
          readOnly={readOnly}
          ariaLabel={t("githubBot.policy.agentInstructionsAria", { defaultValue: "Agent instructions" })}
          contentClassName="min-h-32"
          value={policy.instructions}
          placeholder={t("githubBot.policy.instructionsPlaceholder", { defaultValue: "What should this agent do on GitHub?" })}
          onChange={(value) => set("instructions", value)}
        />
        <p className="text-xs text-muted-foreground">
          {t("githubBot.policy.instructionsHelp", { defaultValue: "Included in every GitHub task. Type / to select a skill for the agent to use." })}
        </p>
        <GitHubSettingsDisclosure title={t("githubBot.policy.eventInstructions", { defaultValue: "Event-specific instructions" })}>
          <div className="grid gap-3 pt-3">
            <Label htmlFor={`${id}-github-prompt-event`} className="sr-only">
              {t("githubBot.policy.eventLabel", { defaultValue: "Event" })}
            </Label>
            <select
              id={`${id}-github-prompt-event`}
              className={githubSelectClass}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value as typeof prompt)}
            >
              {GITHUB_REVIEW_EVENTS.map((event) => (
                <option key={event} value={event}>
                  {githubEventLabel(event, t)}
                </option>
              ))}
              <option value="issue_opened">{t("githubBot.events.issueOpened", { defaultValue: "New issue" })}</option>
            </select>
            <MarkdownEditor
              key={prompt}
              readOnly={readOnly}
              ariaLabel={t("githubBot.policy.eventInstructionsAria", {
                event: prompt === "issue_opened"
                  ? t("githubBot.events.issueOpened", { defaultValue: "New issue" })
                  : githubEventLabel(prompt, t),
                defaultValue: "{{event}} instructions",
              })}
              contentClassName="min-h-32"
              value={
                prompt === "issue_opened"
                  ? (policy.issueOpenedInstructions ?? "")
                  : policy.prompts[prompt]
              }
              onChange={(value) =>
                prompt === "issue_opened"
                  ? set("issueOpenedInstructions", value)
                  : set("prompts", {
                      ...policy.prompts,
                      [prompt]: value,
                    })
              }
            />
            <p className="text-xs text-muted-foreground">
              {t("githubBot.policy.eventInstructionsHelp", { defaultValue: "Added to the main instructions for this event. Type / to select a skill for the agent to use." })}
            </p>
          </div>
        </GitHubSettingsDisclosure>
      </section>
      <section
        className="space-y-3"
        aria-labelledby={`${id}-github-triggers-heading`}
      >
        <h2
          id={`${id}-github-triggers-heading`}
          className="text-base font-semibold"
        >
          {t("githubBot.policy.whenToRun", { defaultValue: "When to run" })}
        </h2>
        <div className="flex items-start gap-3 py-2">
          <AtSign className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("githubBot.policy.whenMentioned", { defaultValue: "When mentioned" })}</p>
            <p className="text-xs text-muted-foreground">
              {t("githubBot.policy.authorizedMentionsPrefix", { defaultValue: "Authorized people can always @mention this bot. " })}
              {accessHref && (
                <Link className="underline underline-offset-4" to={accessHref}>
                  {t("githubBot.policy.managePeopleInAccess", { defaultValue: "Manage people in Access" })}
                </Link>
              )}
            </p>
          </div>
        </div>
        <GitHubToggle
          label={t("githubBot.policy.runAutomatically", { defaultValue: "Run automatically" })}
          description={t("githubBot.policy.runAutomaticallyHelp", { defaultValue: "Start work without a mention when an allowed person creates an issue or updates a pull request." })}
          checked={policy.invocation !== "mentions_only"}
          onChange={(enabled) =>
            set("invocation", enabled ? (rememberedAutomaticMode ?? automaticMode.current) : "mentions_only")
          }
        />
        {policy.invocation !== "mentions_only" && (
          <div className="space-y-4">
            <div
              className="grid gap-x-6 gap-y-3 sm:grid-cols-2"
              aria-label={t("githubBot.policy.automaticEventsAria", { defaultValue: "Automatic events" })}
            >
              {GITHUB_REVIEW_EVENTS.slice(0, 4).map((event) => (
                <Label
                  key={event}
                  className="flex cursor-pointer items-center gap-3 text-sm font-normal"
                >
                  <Checkbox
                    checked={policy.events.includes(event)}
                    onCheckedChange={(enabled) =>
                      set(
                        "events",
                        enabled === true
                          ? [...new Set([...policy.events, event])]
                          : policy.events.filter((value) => value !== event),
                      )
                    }
                  />
                  {githubEventLabel(event, t)}
                </Label>
              ))}
              <Label className="flex cursor-pointer items-center gap-3 text-sm font-normal">
                <Checkbox
                  checked={policy.issueOpened === true}
                  onCheckedChange={(enabled) =>
                    set("issueOpened", enabled === true)
                  }
                />
                {t("githubBot.policy.newIssues", { defaultValue: "New issues" })}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("githubBot.policy.automaticRunsHelp", { defaultValue: "Runs for authorized authors in Access. Use the author filters below to limit whose issues and PRs start work." })}
            </p>
            <GitHubSettingsDisclosure title={t("githubBot.policy.automaticReviewFilters", { defaultValue: "Automatic review filters" })}>
              <div>
                <GitHubToggle
                  label={t("githubBot.policy.includeDraftPrs", { defaultValue: "Include draft PRs" })}
                  checked={policy.reviewDrafts}
                  onChange={(value) => set("reviewDrafts", value)}
                />
                <GitHubToggle
                  label={t("githubBot.policy.includeBotAuthors", { defaultValue: "Include bot authors" })}
                  description={t("githubBot.policy.includeBotAuthorsHelp", { defaultValue: "The account also needs a sponsor and external-contributor automatic runs enabled in Access." })}
                  checked={policy.reviewBotAuthors}
                  onChange={(value) => set("reviewBotAuthors", value)}
                />
              </div>
              <GitHubSettingsDisclosure title={t("githubBot.policy.authors", { defaultValue: "Authors" })}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {filterField(
                    "includeAuthors",
                    t("githubBot.policy.includedAuthors", { defaultValue: "Included authors" }),
                    t("githubBot.policy.includedAuthorsHelp", { defaultValue: "Leave empty for all authorized authors. One username or glob per line." }),
                  )}
                  {filterField(
                    "excludeAuthors",
                    t("githubBot.policy.excludedAuthors", { defaultValue: "Excluded authors" }),
                    t("githubBot.policy.usernameGlobHint", { defaultValue: "One username or glob per line." }),
                  )}
                </div>
              </GitHubSettingsDisclosure>
              <GitHubSettingsDisclosure title={t("githubBot.policy.branches", { defaultValue: "Branches" })}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {filterField(
                    "targetBranches",
                    t("githubBot.policy.targetBranches", { defaultValue: "Target branches" }),
                    t("githubBot.policy.targetBranchesHelp", { defaultValue: "Leave empty for all branches. Supports * and **." }),
                  )}
                  {filterField(
                    "excludedBranches",
                    t("githubBot.policy.excludedBranches", { defaultValue: "Excluded branches" }),
                    t("githubBot.policy.branchPatternHint", { defaultValue: "Supports * and **." }),
                  )}
                </div>
              </GitHubSettingsDisclosure>
              <GitHubSettingsDisclosure title={t("githubBot.policy.labels", { defaultValue: "Labels" })}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {filterField(
                    "requiredLabels",
                    t("githubBot.policy.requiredLabels", { defaultValue: "Required labels" }),
                    t("githubBot.policy.requiredLabelsHelp", { defaultValue: "All listed labels must be present." }),
                  )}
                  {filterField(
                    "excludedLabels",
                    t("githubBot.policy.excludedLabels", { defaultValue: "Excluded labels" }),
                    t("githubBot.policy.excludedLabelsHelp", { defaultValue: "Any listed label prevents automatic review." }),
                  )}
                </div>
              </GitHubSettingsDisclosure>
              <p className="text-xs text-muted-foreground">
                {t("githubBot.policy.mentionBypassHint", { defaultValue: "Reviews requested by @mention bypass these scheduling filters. Repository access and ignored files still apply." })}
              </p>
            </GitHubSettingsDisclosure>
          </div>
        )}
      </section>
      <section
        className="space-y-3"
        aria-labelledby={`${id}-github-results-heading`}
      >
        <h2
          id={`${id}-github-results-heading`}
          className="text-base font-semibold"
        >
          {t("githubBot.policy.reviewResults", { defaultValue: "Review results" })}
        </h2>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <GitHubToggle
            label={t("githubBot.policy.postSummary", { defaultValue: "Post a review summary" })}
            checked={policy.publishSummary}
            onChange={(value) => set("publishSummary", value)}
          />
          <GitHubToggle
            label={t("githubBot.policy.postInlineFindings", { defaultValue: "Post inline findings" })}
            checked={policy.publishInline}
            onChange={(value) => set("publishInline", value)}
          />
        </div>
        <GitHubPassingScore value={policy.ratingThreshold} text={scoreText} onTextChange={onScoreTextChange}
          onChange={(value) => set("ratingThreshold", value)} onValidityChange={onValidityChange} />
      </section>
      <div className="divide-y divide-border">
        <GitHubSettingsDisclosure title={t("githubBot.policy.ignoredFiles", { defaultValue: "Ignored files" })}>
          {filterField(
            "ignoredPaths",
            t("githubBot.policy.filePatterns", { defaultValue: "File patterns" }),
            t("githubBot.policy.filePatternsHelp", { defaultValue: "Excluded from all reviews, including @mentions. One pattern per line; supports * and **." }),
          )}
        </GitHubSettingsDisclosure>
        <GitHubSettingsDisclosure title={t("githubBot.policy.inlineCommentOptions", { defaultValue: "Inline comment options" })}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${id}-github-categories`}>
                {t("githubBot.policy.findingCategories", { defaultValue: "Finding categories" })}
              </Label>
              <GitHubListInput
                id={`${id}-github-categories`}
                values={policy.findingCategories}
                separator=","
                onChange={(values) => set("findingCategories", values)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${id}-github-severity`}>
                {t("githubBot.policy.minimumSeverity", { defaultValue: "Minimum inline severity" })}
              </Label>
              <select
                id={`${id}-github-severity`}
                className={githubSelectClass}
                value={policy.minimumCommentSeverity}
                onChange={(e) =>
                  set(
                    "minimumCommentSeverity",
                    e.target
                      .value as GitHubReviewPolicy["minimumCommentSeverity"],
                  )
                }
              >
                <option value="info">{t("githubBot.severity.info", { defaultValue: "Info" })}</option>
                <option value="warning">{t("githubBot.severity.warning", { defaultValue: "Warning" })}</option>
                <option value="error">{t("githubBot.severity.error", { defaultValue: "Error" })}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {t("githubBot.policy.severityHelp", { defaultValue: "Hidden findings still count in the assessment." })}
              </p>
            </div>
          </div>
        </GitHubSettingsDisclosure>
        <GitHubSettingsDisclosure title={t("githubBot.policy.approvals", { defaultValue: "Approvals and change requests" })}>
          <p className="text-xs text-muted-foreground">
            {t("githubBot.policy.approvalsHelp", { defaultValue: "Optional formal decisions on GitHub. Scores, comments, and checks still work when these are off." })}
          </p>
          <div>
            <GitHubToggle
              label={t("githubBot.policy.allowApprovals", { defaultValue: "Allow approvals" })}
              help={t("githubBot.policy.allowApprovalsHelp", { defaultValue: "Lets the agent submit an Approve review on GitHub after a complete assessment. The agent must explicitly choose it; a 5/5 score or passing check does not approve the PR. Off still allows scores, comments, and checks." })}
              checked={policy.allowApprove}
              onChange={(value) => set("allowApprove", value)}
            />
            <GitHubToggle
              label={t("githubBot.policy.allowRequestChanges", { defaultValue: "Allow request changes" })}
              help={t("githubBot.policy.allowRequestChangesHelp", { defaultValue: "Lets the agent submit a Request changes review on GitHub after a complete assessment. This is a formal review decision and may prevent merging under your repository rules. Off still allows findings, comments, and a failing check." })}
              checked={policy.allowRequestChanges}
              onChange={(value) => set("allowRequestChanges", value)}
            />
          </div>
        </GitHubSettingsDisclosure>
      </div>
    </div>
  );
}

export function GitHubAccessEditor({
  endpointId,
  companyId,
  configuration,
  onChange,
}: {
  endpointId: string;
  companyId: string;
  configuration: GitHubChatConfiguration;
  onChange: (configuration: GitHubChatConfiguration) => void;
}) {
  const company = useOptionalCompany()?.companies.find((item) => item.id === companyId);
  const { t } = useTranslation();
  const accountLink = useRef<HTMLAnchorElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [dialog, setDialog] = useState<"member" | "guest" | null>(null);
  const members = useQuery({
    queryKey: ["github-members", companyId],
    queryFn: () => accessApi.listMembers(companyId),
  });
  const links = useQuery({
    queryKey: ["github-linked-members", endpointId],
    queryFn: () => chatEndpointsApi.listPrincipals(endpointId),
  });
  const membersView = useQueryView(members);
  const linksView = useQueryView(links);
  const linksLoaded = linksView.kind === "ready" || linksView.kind === "stale";
  const [login, setLogin] = useState("");
  const [sponsor, setSponsor] = useState(configuration.responsibleUserId);
  const [candidate, setCandidate] = useState<{
    githubUserId: string;
    login: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeMembers = (members.data?.members ?? []).filter(
    (member) =>
      member.status === "active" && member.membershipRole !== "viewer",
  );
  const linkedAccounts = (links.data ?? []).filter(
    (link) => link.status === "linked",
  );
  const responsible = activeMembers.find(
    (member) => member.principalId === configuration.responsibleUserId,
  );
  const memberName = (userId: string) =>
    activeMembers.find((member) => member.principalId === userId)?.user?.name ??
    userId;
  const automatic = configuration.defaults.invocation !== "mentions_only";
  const guestsAutomatic =
    configuration.defaults.invocation === "allowed_authors";
  const guests = configuration.people.filter(
    (person) => person.kind === "guest",
  );
  // Preserve configured members whose identity link was revoked; show why they cannot run.
  const memberRows = [
    ...configuration.people.filter((person) => person.kind === "member"),
    ...linkedAccounts
      .filter(
        (link) =>
          link.githubUserId &&
          link.paperclipUserId &&
          !configuration.people.some(
            (person) => person.githubUserId === link.githubUserId,
          ),
      )
      .map((link): GitHubAllowedPerson => ({
        kind: "member",
        userId: link.paperclipUserId!,
        githubUserId: link.githubUserId!,
        login: link.githubLogin ?? link.externalLabel,
      })),
  ];
  const updatePerson = (person: GitHubAllowedPerson) =>
    onChange({
      ...configuration,
      people: configuration.people.some(
        (p) => p.githubUserId === person.githubUserId,
      )
        ? configuration.people.map((p) =>
            p.githubUserId === person.githubUserId ? person : p,
          )
        : [...configuration.people, person],
    });
  const removePerson = (person: GitHubAllowedPerson) =>
    onChange({
      ...configuration,
      people: configuration.people.filter(
        (p) => p.githubUserId !== person.githubUserId,
      ),
    });
  const unlink = async (principalId: string) => {
    setBusy(true);
    setError("");
    try {
      await chatEndpointsApi.revokeLink(endpointId, principalId);
      await links.refetch();
    } catch (e) {
      setError(
        describeError(e).body,
      );
    } finally {
      setBusy(false);
    }
  };
  const peopleRows = (people: GitHubAllowedPerson[]) => (
    <div className="divide-y divide-border">
      {people.map((person) => {
        const identity = linkedAccounts.find(
          (link) => link.githubUserId === person.githubUserId,
        );
        const linked = person.kind === "guest" || Boolean(identity);
        const explicit = configuration.people.some(
          (p) => p.githubUserId === person.githubUserId,
        );
        const mentions =
          person.kind === "guest" ||
          configuration.memberAccess === "all_linked" ||
          explicit;
        const removable = explicit && (person.kind === "guest" || configuration.memberAccess === "selected");
        return (
          <div
            key={person.githubUserId}
            className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4"
          >
            <div className="min-w-0 flex-1 basis-32">
              <p className="break-words text-sm font-medium">@{person.login}</p>
              <p className="text-xs text-muted-foreground">
                {person.kind === "guest"
                  ? t("githubBot.access.sponsoredBy", {
                      name: memberName(person.sponsorUserId),
                      defaultValue: "Sponsored by {{name}}",
                    })
                  : (identity?.paperclipUserLabel ??
                    t("githubBot.access.companyMember", { defaultValue: "Company member" }))}
              </p>
              {!linked && (
                <p className="mt-1 text-xs text-destructive">
                  {t("githubBot.access.needsLinking", { defaultValue: "GitHub account needs linking." })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-5">
              <div className="flex flex-col items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("githubBot.access.mentions", { defaultValue: "Mentions" })}</span>
                {person.kind === "guest" ||
                configuration.memberAccess === "all_linked" ? (
                  <span
                    className="flex h-5 items-center gap-1 text-xs"
                    aria-label={t("githubBot.access.mentionsStatusAria", {
                      status: linked
                        ? t("githubBot.access.allowed", { defaultValue: "allowed" })
                        : t("githubBot.access.unavailable", { defaultValue: "unavailable" }),
                      login: person.login,
                      defaultValue: "Mentions {{status}} for @{{login}}",
                    })}
                  >
                    {linked && (
                      <Check className="size-3.5 text-muted-foreground" />
                    )}
                    {linked
                      ? t("githubBot.access.allowedLabel", { defaultValue: "Allowed" })
                      : t("githubBot.access.unlinked", { defaultValue: "Unlinked" })}
                  </span>
                ) : (
                  <ToggleSwitch
                    aria-label={t("githubBot.access.allowMentionsAria", {
                      login: person.login,
                      defaultValue: "Allow mentions from @{{login}}",
                    })}
                    checked={mentions}
                    disabled={!linked}
                    onCheckedChange={(enabled) =>
                      enabled ? updatePerson(person) : removePerson(person)
                    }
                  />
                )}
              </div>
              {(identity || removable) && <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t("githubBot.access.manageAria", {
                      login: person.login,
                      defaultValue: "Manage @{{login}}",
                    })}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {removable && (
                    <DropdownMenuItem onClick={() => removePerson(person)}>
                      {t("githubBot.access.removeAccess", { defaultValue: "Remove access" })}
                    </DropdownMenuItem>
                  )}
                  {identity && (
                    <DropdownMenuItem
                      disabled={busy}
                      onClick={() => void unlink(identity.principalId)}
                    >
                      {t("githubBot.access.unlinkAccount", { defaultValue: "Unlink GitHub account" })}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>}
            </div>
          </div>
        );
      })}
    </div>
  );
  return (
    <section className="space-y-6" aria-label={t("githubBot.access.people", { defaultValue: "People" })}>
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{t("githubBot.access.people", { defaultValue: "People" })}</h2>
        <p className="text-sm text-muted-foreground">
          {t("githubBot.access.peopleHelp", { defaultValue: "Choose who can mention this bot and whose activity can start work automatically." })}
        </p>
      </div>
      <section className="space-y-2" aria-label={t("githubBot.access.companyMembers", { defaultValue: "Company members" })}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("githubBot.access.companyMembers", { defaultValue: "Company members" })}</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDialog("member");
              setLinkCopied(false);
              setError("");
            }}
          >
            <Plus className="size-4" />
            {t("githubBot.access.linkMember", { defaultValue: "Link a member" })}
          </Button>
        </div>
        <GitHubToggle
          label={t("githubBot.access.allowAllLinked", { defaultValue: "Allow mentions from all linked members" })}
          description={
            configuration.memberAccess === "all_linked"
              ? t("githubBot.access.includeAllLinkedHelp", {
                  company: company?.name ??
                    t("githubBot.access.thisCompany", { defaultValue: "this company" }),
                  defaultValue: "Includes members from {{company}} who link their GitHub account later.",
                })
              : t("githubBot.access.selectedOnlyHelp", { defaultValue: "Only members you enable below can mention this bot." })
          }
          checked={configuration.memberAccess === "all_linked"}
          onChange={(enabled) =>
            onChange({
              ...configuration,
              memberAccess: enabled ? "all_linked" : "selected",
            })
          }
        />
        {peopleRows(memberRows)}
        {(links.isPending || linksView.kind === "reconnecting") && (
          <p role="status" className="py-4 text-sm text-muted-foreground">
            {t("githubBot.access.loadingLinked", { defaultValue: "Loading linked accounts…" })}
          </p>
        )}
        {linksLoaded && memberRows.length === 0 && (
          <p className="py-4 text-sm text-muted-foreground">
            {t("githubBot.access.noMembers", { defaultValue: "No members linked yet. Link an account to get started." })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {automatic ? (
            <>
              {t("githubBot.access.automaticOnPrefix", { defaultValue: "Automatic runs use the events and author filters in " })}
              <Link
                className="underline underline-offset-4"
                to={`/apps/chat/${endpointId}/settings`}
              >
                {t("githubBot.access.settingsLink", { defaultValue: "Settings" })}
              </Link>
              {t("githubBot.access.automaticOnSuffix", { defaultValue: "." })}
            </>
          ) : (
            <>
              {t("githubBot.access.automaticOffPrefix", { defaultValue: "Automatic runs are off in " })}
              <Link
                className="underline underline-offset-4"
                to={`/apps/chat/${endpointId}/settings`}
              >
                {t("githubBot.access.settingsLink", { defaultValue: "Settings" })}
              </Link>
              {t("githubBot.access.automaticOffSuffix", { defaultValue: ". Authorized @mentions still work." })}
            </>
          )}
        </p>
      </section>
      <section
        className="space-y-2 border-t border-border pt-6"
        aria-label={t("githubBot.access.externalContributors", { defaultValue: "External contributors" })}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("githubBot.access.externalContributors", { defaultValue: "External contributors" })}</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDialog("guest");
              setLookupError("");
            }}
          >
            <Plus className="size-4" />
            {t("githubBot.access.addContributor", { defaultValue: "Add external contributor" })}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("githubBot.access.externalHelp", { defaultValue: "Allow specific GitHub users with a member as their sponsor. They receive restricted access, without company membership or the sponsor’s personal credentials." })}
        </p>
        {peopleRows(guests)}
        {guests.length > 0 && (
          <GitHubToggle
            label={t("githubBot.access.allowGuestAutomatic", { defaultValue: "Allow automatic runs for external contributors" })}
            description={
              automatic
                ? t("githubBot.access.guestAutomaticOnHelp", { defaultValue: "Authorized contributors can trigger the events and author filters configured in Settings." })
                : t("githubBot.access.guestAutomaticOffHelp", { defaultValue: "Turn on automatic runs in Settings first. Mentions remain available." })
            }
            checked={guestsAutomatic}
            disabled={!automatic}
            onChange={(enabled) =>
              onChange({
                ...configuration,
                defaults: {
                  ...configuration.defaults,
                  invocation: enabled ? "allowed_authors" : "linked_authors",
                },
              })
            }
          />
        )}
      </section>
      <GitHubSettingsDisclosure title={t("githubBot.access.responsibility", { defaultValue: "Automatic task responsibility" })}>
        <div className="space-y-2">
          {activeMembers.length === 1 && responsible ? (
            <p className="text-sm">
              {t("githubBot.access.responsibleMemberInline", {
                name: memberName(configuration.responsibleUserId),
                defaultValue: "Responsible member: {{name}}",
              })}
            </p>
          ) : (
            <>
              <Label htmlFor="github-responsible">{t("githubBot.access.responsibleMember", { defaultValue: "Responsible member" })}</Label>
              <select
                id="github-responsible"
                className={githubSelectClass}
                value={configuration.responsibleUserId}
                onChange={(e) =>
                  onChange({
                    ...configuration,
                    responsibleUserId: e.target.value,
                  })
                }
              >
                {!responsible && (
                  <option value={configuration.responsibleUserId}>
                    {configuration.responsibleUserId ||
                      t("githubBot.access.selectMember", { defaultValue: "Select a member" })}
                  </option>
                )}
                {activeMembers.map((member) => (
                  <option key={member.principalId} value={member.principalId}>
                    {member.user?.name ??
                      member.user?.email ??
                      member.principalId}
                  </option>
                ))}
              </select>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            {t("githubBot.access.responsibilityHelp", { defaultValue: "The member accountable for automatically created Paperclip tasks. GitHub authors remain recorded separately. This grants no access to the member’s personal credentials." })}
          </p>
        </div>
      </GitHubSettingsDisclosure>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {(membersView.kind === "error" || linksView.kind === "error") && (
        <QueryErrorState
          error={membersView.kind === "error" ? members.error : links.error}
          action="load members and linked accounts"
          onRetry={() => {
            membersView.retry();
            linksView.retry();
          }}
          retrying={members.isFetching || links.isFetching}
        />
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "member"
                ? t("githubBot.access.linkMemberTitle", { defaultValue: "Link a company member" })
                : t("githubBot.access.addContributor", { defaultValue: "Add external contributor" })}
            </DialogTitle>
            <DialogDescription>
              {dialog === "member"
                ? t("githubBot.access.linkMemberDescription", { defaultValue: "Each member confirms their own GitHub identity. Share this link with an existing company member, or link your own account." })
                : t("githubBot.access.addContributorDescription", { defaultValue: "Allow a GitHub user to mention this bot. A company member must sponsor their restricted access." })}
            </DialogDescription>
          </DialogHeader>
          {dialog === "member" ? (
            <>
              <Button
                variant="outline"
                aria-label={t("githubBot.access.copyLinkAria", { defaultValue: "Copy account linking URL" })}
                onClick={() => {
                  if (accountLink.current)
                    void copyTextToClipboard(accountLink.current.href).then(
                      () => setLinkCopied(true),
                      () =>
                        setError(
                          t("githubBot.access.copyLinkFailed", { defaultValue: "Could not copy the link. Open account linking and copy the address." }),
                        ),
                    );
                }}
              >
                <Copy className="size-4" />
                {linkCopied
                  ? t("githubBot.access.copied", { defaultValue: "Copied" })
                  : t("githubBot.access.copyInviteLink", { defaultValue: "Copy invitation link" })}
              </Button>
              <Link
                ref={accountLink}
                to={`/apps/chat/connect?provider=github&resume=${endpointId}&stage=identity`}
                className="text-sm underline underline-offset-4"
              >
                {t("githubBot.access.linkYourAccount", { defaultValue: "Link your account" })}
              </Link>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="github-guest-login">{t("githubBot.access.githubUsername", { defaultValue: "GitHub username" })}</Label>
                <div className="flex gap-2">
                  <Input
                    id="github-guest-login"
                    value={login}
                    placeholder="octocat"
                    disabled={busy}
                    onChange={(e) => {
                      setLogin(e.target.value);
                      setCandidate(null);
                      setLookupError("");
                    }}
                  />
                  <Button
                    variant="outline"
                    disabled={busy || !login.trim()}
                    onClick={async () => {
                      setBusy(true);
                      setLookupError("");
                      setCandidate(null);
                      try {
                        setCandidate(
                          await githubChatApi.lookup(endpointId, login),
                        );
                      } catch (e) {
                        setLookupError(
                          describeError(e).body,
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy
                      ? t("githubBot.access.lookingUp", { defaultValue: "Looking up…" })
                      : t("githubBot.access.lookUp", { defaultValue: "Look up" })}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="github-guest-sponsor">{t("githubBot.access.sponsor", { defaultValue: "Sponsor" })}</Label>
                <select
                  id="github-guest-sponsor"
                  className={githubSelectClass}
                  value={sponsor}
                  onChange={(e) => setSponsor(e.target.value)}
                >
                  {!activeMembers.some(
                    (member) => member.principalId === sponsor,
                  ) && (
                    <option value={sponsor}>
                      {t("githubBot.access.selectMember", { defaultValue: "Select a member" })}
                    </option>
                  )}
                  {activeMembers.map((member) => (
                    <option key={member.principalId} value={member.principalId}>
                      {member.user?.name ?? member.principalId}
                    </option>
                  ))}
                </select>
              </div>
              {candidate && (
                <p role="status" className="text-sm">
                  {configuration.people.some(
                    (p) => p.githubUserId === candidate.githubUserId,
                  ) ||
                  linkedAccounts.some(
                    (link) => link.githubUserId === candidate.githubUserId,
                  )
                    ? t("githubBot.access.alreadyListed", {
                        login: candidate.login,
                        defaultValue: "@{{login}} is already listed in People.",
                      })
                    : t("githubBot.access.found", {
                        login: candidate.login,
                        defaultValue: "Found @{{login}}. They will be able to mention the bot after you save.",
                      })}
                </p>
              )}
              {lookupError && (
                <p role="alert" className="text-sm text-destructive">
                  {lookupError}
                </p>
              )}
              <DialogFooter className="flex-row justify-between sm:justify-between">
                <Button variant="ghost" onClick={() => setDialog(null)}>
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  disabled={
                    !candidate ||
                    !activeMembers.some(
                      (member) => member.principalId === sponsor,
                    ) ||
                    configuration.people.some(
                      (p) => p.githubUserId === candidate.githubUserId,
                    ) ||
                    linkedAccounts.some(
                      (link) => link.githubUserId === candidate.githubUserId,
                    )
                  }
                  onClick={() => {
                    if (candidate) {
                      updatePerson({
                        ...candidate,
                        kind: "guest",
                        sponsorUserId: sponsor,
                        permissionProfile: "restricted",
                      });
                      setDialog(null);
                      setCandidate(null);
                      setLogin("");
                    }
                  }}
                >
                  {t("githubBot.access.addContributorSubmit", { defaultValue: "Add contributor" })}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
