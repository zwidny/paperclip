import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  AlertCircle,
  Globe,
  GitBranch,
  Radio,
  Webhook,
} from "lucide-react";
import {
  SetupWizardNavigation,
  SetupWizardFooter,
} from "@/components/SetupWizard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { cn } from "@/lib/utils";
import { i18n, useTranslation } from "@/i18n";
import { AgentInstructions, CopyField } from "./WebhookFields";
import { WebhookUrlWarning } from "./WebhookUrlWarning";

export type TriggerDraft = {
  kind: "choose" | "schedule" | "webhook";
  step: number;
  availableStep: number;
  sender: "custom" | "github";
  /** Retained when resuming webhooks created before generic signed-app support. */
  signingMode?: "bearer" | "app_webhook" | "fireflies_hmac";
  frequency: string;
  time: string;
  weekday: string;
  timezone: string;
  created: boolean;
};
export const defaultTriggerDraft: TriggerDraft = {
  kind: "choose",
  step: 0,
  availableStep: 0,
  sender: "custom",
  frequency: "weekdays",
  time: "09:00",
  weekday: "Monday",
  timezone: "America/Chicago",
  created: false,
};
export function webhookAgentInstructions(
  sender: TriggerDraft["sender"],
  routineTitle: string,
  webhookUrl: string,
  webhookSecret: string,
  setupPending = true,
  signingMode: TriggerDraft["signingMode"] = "app_webhook",
) {
  const t = (key: string, options: { defaultValue: string; [key: string]: unknown }) =>
    i18n.t(key, options);
  const common = [
    t("triggerWizard.instructions.connect", { defaultValue: "Connect the sending app to the Paperclip routine {{title}}.", title: routineTitle }),
    t("triggerWizard.instructions.webhookUrl", { defaultValue: "Webhook URL: {{url}}", url: webhookUrl }),
    t("triggerWizard.instructions.postBody", { defaultValue: "Send an HTTP POST request with a JSON object as the body (not an array or string)." }),
    "Content-Type: application/json",
  ];
  const auth =
    sender === "github"
      ? [
          t("triggerWizard.instructions.github.openSettings", { defaultValue: "In GitHub, open your repository → Settings → Webhooks → Add webhook." }),
          t("triggerWizard.instructions.github.payloadUrl", { defaultValue: "Use the webhook URL above as Payload URL and select application/json as Content type." }),
          t("triggerWizard.instructions.secretValue", { defaultValue: "Secret: {{secret}}", secret: webhookSecret }),
          t("triggerWizard.instructions.github.secretField", { defaultValue: "Paste this value into GitHub’s Secret field. GitHub signs requests with X-Hub-Signature-256; do not use Bearer authentication." }),
          t("triggerWizard.instructions.github.selectEvents", { defaultValue: "Select the events that should start this routine, enable the webhook, and save." }),
          t("triggerWizard.instructions.github.recentDeliveries", { defaultValue: "To check the connection, open Recent Deliveries and redeliver an event." }),
        ]
      : [
          t("triggerWizard.instructions.secretKey", { defaultValue: "Secret key: {{secret}}", secret: webhookSecret }),
          ...(signingMode === "bearer" ? [] : [
            t("triggerWizard.instructions.signingSecret", {
              defaultValue: "If the app asks for a signing secret, paste the secret key above. Paperclip accepts HMAC-SHA256 over the exact request body in {{headers}}, formatted sha256=<hex digest>.",
              headers: signingMode === "fireflies_hmac"
                ? t("triggerWizard.instructions.signatureHeaderHub", { defaultValue: "X-Hub-Signature" })
                : t("triggerWizard.instructions.signatureHeaders", { defaultValue: "X-Hub-Signature or X-Hub-Signature-256" }),
            }),
          ]),
          ...(signingMode === "fireflies_hmac" ? [] : [
            t("triggerWizard.instructions.bearerHeader", { defaultValue: "For apps with custom headers, use Authorization: Bearer {{secret}}", secret: webhookSecret }),
          ]),
          t("triggerWizard.instructions.subscribe", { defaultValue: "Subscribe only to the events that should start this routine. Public services need a publicly reachable HTTPS URL." }),
          t("triggerWizard.instructions.addWebhook", { defaultValue: "In the sending app, add a webhook using this URL, POST method, JSON body, and headers, then save it." }),
          t("triggerWizard.instructions.idempotency", { defaultValue: "Send a unique Idempotency-Key header for each event and reuse it on retries, so retrying a setup test after activation cannot start the routine." }),
          t("triggerWizard.instructions.exampleBody", { defaultValue: 'Example JSON body: {"event":"deployment.completed","environment":"production"}' }),
          t("triggerWizard.instructions.testDelivery", { defaultValue: "To check the connection, send a test event from the app or perform the action that triggers a delivery." }),
        ];
  return [
    ...common,
    ...auth,
    t("triggerWizard.instructions.checkConnection", { defaultValue: "Open Check connection in Paperclip to see whether the event arrived and authentication passed." }),
    ...(setupPending
      ? [
          t("triggerWizard.instructions.setupOnly", { defaultValue: "During setup, deliveries only test the connection. They do not start the routine or create a task." }),
          t("triggerWizard.instructions.finishSetup", { defaultValue: "Finish setup in Paperclip to enable this webhook for future events. Test events are not replayed." }),
        ]
      : [
          t("triggerWizard.instructions.enabled", { defaultValue: "This webhook is enabled. Deliveries can start the routine and create tasks." }),
        ]),
    t("triggerWizard.instructions.storeSecret", { defaultValue: "Store the key securely; do not put it in source control or logs." }),
  ].join("\n");
}
export function describeSchedule(draft: TriggerDraft) {
  const t = (key: string, options: { defaultValue: string; [key: string]: unknown }) =>
    i18n.t(key, options);
  if (draft.frequency === "daily") {
    return t("triggerWizard.describe.daily", { defaultValue: "Every day at {{time}}", time: draft.time });
  }
  if (draft.frequency === "weekly") {
    return t("triggerWizard.describe.weekly", { defaultValue: "Every {{weekday}} at {{time}}", weekday: draft.weekday, time: draft.time });
  }
  return t("triggerWizard.describe.weekdays", { defaultValue: "Every weekday at {{time}}", time: draft.time });
}
export function RoutineTriggerWizard({
  initialDraft,
  onSaveExit,
  onFinish,
  onCreateWebhook,
  onRotateKey,
  routineTitle,
  routineId,
  routineActive = true,
  webhookUrl = "",
  webhookSecret = "",
  checkResult = "waiting",
}: {
  initialDraft: TriggerDraft;
  routineTitle: string;
  routineId: string;
  routineActive?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  onCreateWebhook?: (draft: TriggerDraft) => Promise<void>;
  onRotateKey?: () => Promise<void>;
  onSaveExit: (draft: TriggerDraft) => void | Promise<void>;
  onFinish: (draft: TriggerDraft) => void | Promise<void>;
  checkResult?: "waiting" | "received" | "rejected" | "no_event";
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const { setBreadcrumbs } = useBreadcrumbs();
  const perform = useCallback(
    async (action: () => void | Promise<void>) => {
      if (busy) return;
      setBusy(true);
      setSaveError("");
      try {
        await action();
      } catch (error) {
        setSaveError(
          error instanceof Error
            ? error.message
            : t("triggerWizard.saveFailed", { defaultValue: "Couldn’t save. Please try again." }),
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, t],
  );
  const saveAndExit = useCallback(() => {
    void perform(() => onSaveExit(draft));
  }, [draft, onSaveExit, perform]);
  useEffect(() => {
    setBreadcrumbs([
      {
        label: routineTitle,
        href: `/routines/${routineId}/triggers`,
        onClick: (event) => {
          if (
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          event.preventDefault();
          saveAndExit();
        },
      },
      { label: t("triggerWizard.addTrigger", { defaultValue: "Add trigger" }) },
    ]);
  }, [saveAndExit, setBreadcrumbs, routineTitle, routineId, t]);
  const schedule = draft.kind === "schedule";
  const github = draft.sender === "github";
  const labels = schedule
    ? [
        t("triggerWizard.steps.chooseTrigger", { defaultValue: "Choose trigger" }),
        t("triggerWizard.steps.setSchedule", { defaultValue: "Set schedule" }),
        t("triggerWizard.steps.reviewSchedule", { defaultValue: "Review schedule" }),
      ]
    : [
        t("triggerWizard.steps.chooseTrigger", { defaultValue: "Choose trigger" }),
        t("triggerWizard.steps.connectApp", { defaultValue: "Connect your app" }),
        t("triggerWizard.steps.checkConnection", { defaultValue: "Check connection" }),
      ];
  function patch(values: Partial<TriggerDraft>) {
    setDraft((current) => ({ ...current, ...values }));
  }
  function advance() {
    void perform(async () => {
      if (draft.kind === "webhook" && draft.step === 0 && !draft.created)
        await onCreateWebhook?.(draft);
      const step = draft.step + 1;
      patch({
        step,
        availableStep: Math.max(draft.availableStep, step),
        created:
          draft.created || (draft.kind === "webhook" && draft.step === 0),
      });
    });
  }
  const title =
    draft.step === 0
      ? t("triggerWizard.titles.whenToRun", { defaultValue: "When should this routine run?" })
      : schedule
        ? draft.step === 1
          ? t("triggerWizard.titles.setSchedule", { defaultValue: "Set a schedule" })
          : t("triggerWizard.titles.reviewSchedule", { defaultValue: "Review your schedule" })
        : draft.step === 1
          ? t("triggerWizard.titles.connectApp", {
              defaultValue: "Connect {{app}}",
              app: github
                ? "GitHub"
                : t("triggerWizard.yourApp", { defaultValue: "your app" }),
            })
          : t("triggerWizard.titles.checkConnection", { defaultValue: "Check your connection" });
  const subtitle =
    draft.step === 0
      ? t("triggerWizard.subtitles.choose", { defaultValue: "Choose how to start “{{title}}”. You can add another trigger later.", title: routineTitle })
      : schedule
        ? draft.step === 1
          ? t("triggerWizard.subtitles.setSchedule", { defaultValue: "Choose when Paperclip should start this routine automatically." })
          : t("triggerWizard.subtitles.reviewSchedule", { defaultValue: "This schedule starts the routine automatically. You can pause or change it later." })
        : draft.step === 1
          ? t("triggerWizard.subtitles.connectApp", { defaultValue: "Copy these details into the sending app, then save its webhook settings." })
          : t("triggerWizard.subtitles.checkConnection", { defaultValue: "Test that events arrive and authentication works. This won’t start the routine." });
  const selectClass =
    "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
  const goBack = (
    <Button variant="outline" onClick={() => patch({ step: draft.step - 1 })}>
      {t("common.back", { defaultValue: "Back" })}
    </Button>
  );
  return (
    <div className="min-w-0 w-full max-w-2xl space-y-6">
      <SetupWizardNavigation
        takeover
        disabled={busy}
        ariaLabel={t("triggerWizard.progressAria", { defaultValue: "Trigger setup progress" })}
        labels={labels}
        step={draft.step}
        availableStep={draft.availableStep}
        onSelect={(step) => patch({ step })}
      />
      <fieldset disabled={busy} className="min-w-0 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {!schedule && draft.step > 0 && <WebhookUrlWarning url={webhookUrl} />}
        {draft.step === 0 && (
          <fieldset className="space-y-3">
            <legend className="sr-only">{t("triggerWizard.triggerType", { defaultValue: "Trigger type" })}</legend>
            {(
              [
                {
                  kind: "schedule",
                  label: t("triggerWizard.options.scheduleLabel", { defaultValue: "On a schedule" }),
                  detail: t("triggerWizard.options.scheduleDetail", { defaultValue: "Every day, on weekdays, or once a week." }),
                  Icon: CalendarClock,
                },
                {
                  kind: "webhook",
                  label: t("triggerWizard.options.webhookLabel", { defaultValue: "When another app sends a webhook" }),
                  detail:
                    t("triggerWizard.options.webhookDetail", { defaultValue: "When something happens in GitHub, another app, or a script." }),
                  Icon: Webhook,
                },
              ] as const
            ).map(({ kind, label, detail, Icon }) => (
              <label
                key={kind}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-4 focus-within:ring-2 focus-within:ring-ring",
                  draft.kind === kind
                    ? "border-primary bg-accent/30"
                    : "border-border hover:bg-accent/20",
                )}
              >
                <input
                  type="radio"
                  name="trigger-kind"
                  checked={draft.kind === kind}
                  disabled={draft.created && kind !== draft.kind}
                  onChange={() =>
                    patch({
                      kind,
                      availableStep:
                        kind === draft.kind ? draft.availableStep : 0,
                    })
                  }
                  className="sr-only"
                />
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {detail}
                  </span>
                </span>
                {draft.kind === kind && <Check className="h-4 w-4" />}
              </label>
            ))}
          </fieldset>
        )}
        {schedule && draft.step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="repeat">{t("triggerWizard.repeat", { defaultValue: "Repeat" })}</Label>
                <select
                  id="repeat"
                  className={selectClass}
                  value={draft.frequency}
                  onChange={(event) => patch({ frequency: event.target.value })}
                >
                  <option value="daily">{t("triggerWizard.everyDay", { defaultValue: "Every day" })}</option>
                  <option value="weekdays">{t("triggerWizard.weekdaysOption", { defaultValue: "Weekdays (Monday–Friday)" })}</option>
                  <option value="weekly">{t("triggerWizard.everyWeek", { defaultValue: "Every week" })}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="run-time">{t("triggerWizard.time", { defaultValue: "Time" })}</Label>
                <Input
                  id="run-time"
                  type="time"
                  value={draft.time}
                  onChange={(event) => patch({ time: event.target.value })}
                />
              </div>
            </div>
            {draft.frequency === "weekly" && (
              <div className="space-y-2">
                <Label htmlFor="run-day">{t("triggerWizard.day", { defaultValue: "Day" })}</Label>
                <select
                  id="run-day"
                  className={selectClass}
                  value={draft.weekday}
                  onChange={(event) => patch({ weekday: event.target.value })}
                >
                  {[
                    { value: "Monday", key: "triggerWizard.weekday.monday", defaultValue: "Monday" },
                    { value: "Tuesday", key: "triggerWizard.weekday.tuesday", defaultValue: "Tuesday" },
                    { value: "Wednesday", key: "triggerWizard.weekday.wednesday", defaultValue: "Wednesday" },
                    { value: "Thursday", key: "triggerWizard.weekday.thursday", defaultValue: "Thursday" },
                    { value: "Friday", key: "triggerWizard.weekday.friday", defaultValue: "Friday" },
                    { value: "Saturday", key: "triggerWizard.weekday.saturday", defaultValue: "Saturday" },
                    { value: "Sunday", key: "triggerWizard.weekday.sunday", defaultValue: "Sunday" },
                  ].map((day) => (
                    <option key={day.value} value={day.value}>{t(day.key, { defaultValue: day.defaultValue })}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="timezone">{t("triggerWizard.timeZone", { defaultValue: "Time zone" })}</Label>
              <select
                id="timezone"
                className={selectClass}
                value={draft.timezone}
                onChange={(event) => patch({ timezone: event.target.value })}
              >
                {Array.from(
                  new Set([
                    draft.timezone,
                    "America/Chicago",
                    "America/New_York",
                    "America/Los_Angeles",
                    "Europe/London",
                    "UTC",
                  ]),
                ).map((zone) => (
                  <option key={zone}>{zone}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {t("triggerWizard.timeZoneHint", { defaultValue: "The time follows this zone, including daylight saving changes." })}
              </p>
            </div>
          </div>
        )}
        {schedule && draft.step === 2 && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 rounded-md bg-muted/40 p-4">
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{describeSchedule(draft)}</p>
                <p className="text-xs text-muted-foreground">
                  {draft.timezone}
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("triggerWizard.scheduleSummary", { defaultValue: "Each scheduled run creates a task for the routine’s assigned agent. Any existing webhook triggers will continue to work." })}
            </p>
          </div>
        )}
        {draft.step === 0 && draft.kind === "webhook" && (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              {t("triggerWizard.senderLegend", { defaultValue: "What’s sending the webhook?" })}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    sender: "custom",
                    label: t("triggerWizard.senders.custom", { defaultValue: "Another app or script" }),
                    Icon: Globe,
                  },
                  { sender: "github", label: "GitHub", Icon: GitBranch },
                ] as const
              ).map(({ sender, label, Icon }) => (
                <label
                  key={sender}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border p-3 focus-within:ring-2 focus-within:ring-ring",
                    draft.sender === sender
                      ? "border-primary bg-accent/30"
                      : "border-border",
                    draft.created && "cursor-default",
                  )}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="sender"
                    checked={draft.sender === sender}
                    disabled={draft.created}
                    onChange={() => patch({ sender })}
                  />
                  <Icon className="h-4 w-4" />
                  <span className="flex-1 text-sm">{label}</span>
                  {draft.sender === sender && <Check className="h-4 w-4" />}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {draft.kind === "webhook" && draft.step === 0 && (
          <p className="text-sm text-muted-foreground">
            {t("triggerWizard.publicHttpsHint", { defaultValue: "Public services need a publicly reachable HTTPS webhook URL." })}
          </p>
        )}
        {!schedule && draft.step === 1 && (
          <div className="space-y-5">
            {webhookSecret && (
              <AgentInstructions
                value={webhookAgentInstructions(
                  draft.sender,
                  routineTitle,
                  webhookUrl,
                  webhookSecret,
                  true,
                  draft.signingMode,
                )}
              />
            )}
            <CopyField
              label={github
                ? t("triggerWizard.payloadUrl", { defaultValue: "Payload URL" })
                : t("triggerWizard.webhookUrlLabel", { defaultValue: "Webhook URL" })}
              value={webhookUrl}
            />
            {!github && draft.signingMode !== "bearer" && (
              <p className="text-sm text-muted-foreground">
                {t("triggerWizard.signingSecretHint", { defaultValue: "Paste this key into your app’s signing secret field." })}
                {draft.signingMode !== "fireflies_hmac" && <>
                  {" "}{t("triggerWizard.signingSecretCustomHeaders", { defaultValue: "If your app uses custom headers instead, set Authorization to Bearer followed by a space and this key." })}
                </>}
              </p>
            )}
            {webhookSecret ? (
              <CopyField
                label={github
                  ? t("triggerWizard.secretLabel", { defaultValue: "Secret" })
                  : draft.signingMode === "bearer"
                    ? t("triggerWizard.authorizationHeaderValue", { defaultValue: "Authorization header value" })
                    : t("triggerWizard.secretKeyLabel", { defaultValue: "Secret key" })}
                value={!github && draft.signingMode === "bearer" ? `Bearer ${webhookSecret}` : webhookSecret}
              />
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("triggerWizard.keyHidden", { defaultValue: "The key is hidden after leaving setup. If you haven’t saved it in your app, generate a replacement." })}
                </p>
                <Button
                  variant="outline"
                  onClick={() => void perform(() => onRotateKey?.())}
                >
                  {t("triggerWizard.generateNewKey", { defaultValue: "Generate new key" })}
                </Button>
              </div>
            )}
          </div>
        )}
        {!schedule && draft.step === 2 && (
          <div className="space-y-5">
            <div className="space-y-1 rounded-md border border-border p-4">
              <p className="text-sm font-medium">{t("triggerWizard.connectionTestOnly", { defaultValue: "Connection test only" })}</p>
              <p className="text-sm text-muted-foreground">
                {t("triggerWizard.connectionTestOnlyBody", { defaultValue: "Events received during setup won’t start the routine or create tasks." })}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {t("triggerWizard.sendEventFrom", {
                  defaultValue: "Send an event from {{app}}",
                  app: github
                    ? "GitHub"
                    : t("triggerWizard.yourApp", { defaultValue: "your app" }),
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                {github
                  ? t("triggerWizard.sendEventGithub", { defaultValue: "Open this webhook in your repository settings. Under Recent Deliveries, choose Redeliver on an event." })
                  : t("triggerWizard.sendEventCustom", { defaultValue: "Look for “Send test” in your app’s webhook settings. If it doesn’t have one, do the action that should trigger the webhook—for example, complete a deployment." })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("triggerWizard.keepPageOpen", { defaultValue: "Keep this page open to see the test result." })}
              </p>
            </div>
            <div
              role="status"
              className="flex items-start gap-3 rounded-md bg-muted/40 p-4"
            >
              {checkResult === "received" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-(--status-task-done)" />
              ) : checkResult === "rejected" ? (
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
              ) : (
                <Radio className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {checkResult === "received"
                    ? t("triggerWizard.check.receivedTitle", { defaultValue: "Test event received · Connection working" })
                    : checkResult === "rejected"
                      ? t("triggerWizard.check.rejectedTitle", { defaultValue: "Event arrived, but the key was rejected" })
                      : checkResult === "no_event"
                        ? t("triggerWizard.check.noEventTitle", { defaultValue: "No event received yet" })
                        : t("triggerWizard.check.waitingTitle", { defaultValue: "Waiting for an event from your app…" })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {checkResult === "received"
                    ? t("triggerWizard.check.receivedBody", { defaultValue: "Authentication passed. No routine run or task was created." })
                    : checkResult === "rejected"
                      ? t("triggerWizard.check.rejectedBody", { defaultValue: "Go back to Connect your app, update the key in your sending app, and resend. No task was created." })
                      : t("triggerWizard.check.waitingBody", { defaultValue: "Waiting to verify delivery and authentication. The routine is not running." })}
                </p>
              </div>
            </div>
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                {t("triggerWizard.troubleshoot", { defaultValue: "Troubleshoot delivery" })}
              </summary>
              <div className="space-y-3 pt-3">
                <p className="text-xs text-muted-foreground">
                  {t("triggerWizard.troubleshootBody", { defaultValue: "Check that the webhook is enabled in your sending app and that its URL matches. Scripts must send POST with a JSON body." })}
                </p>
                <CopyField label={t("triggerWizard.webhookUrlLabel", { defaultValue: "Webhook URL" })} value={webhookUrl} />
              </div>
            </details>
          </div>
        )}
        {!schedule && draft.step === 2 && (
          <p className="text-xs text-muted-foreground">
            {routineActive
              ? t("triggerWizard.finishNoteActive", { defaultValue: "Finish setup to enable this webhook. Future events will start the routine; this test event won’t be replayed." })
              : t("triggerWizard.finishNotePaused", { defaultValue: "Finish setup to save this webhook. The routine is paused; enable its automatic triggers when you’re ready. This test event won’t be replayed." })}
          </p>
        )}
        {schedule && draft.step === 2 && !routineActive && (
          <p className="text-sm text-muted-foreground">
            {t("triggerWizard.pausedNote", { defaultValue: "The routine is paused. Enable its automatic triggers when you’re ready to use this schedule." })}
          </p>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
        <SetupWizardFooter onSaveExit={saveAndExit}>
          {draft.step > 0 && goBack}
          {draft.step === 0 ? (
            <Button disabled={draft.kind === "choose"} onClick={advance}>
              {t("triggerWizard.continue", { defaultValue: "Continue" })}
            </Button>
          ) : schedule ? (
            draft.step === 1 ? (
              <Button disabled={!draft.time} onClick={advance}>
                {t("triggerWizard.steps.reviewSchedule", { defaultValue: "Review schedule" })}
              </Button>
            ) : (
              <Button onClick={() => void perform(() => onFinish(draft))}>
                {t("triggerWizard.addSchedule", { defaultValue: "Add schedule" })}
              </Button>
            )
          ) : draft.step === 1 ? (
            <Button onClick={advance}>{t("triggerWizard.steps.checkConnection", { defaultValue: "Check connection" })}</Button>
          ) : (
            <Button onClick={() => void perform(() => onFinish(draft))}>
              {checkResult === "received"
                ? t("triggerWizard.finishSetup", { defaultValue: "Finish setup" })
                : t("triggerWizard.finishWithoutChecking", { defaultValue: "Finish without checking" })}
            </Button>
          )}
        </SetupWizardFooter>
      </fieldset>
    </div>
  );
}
