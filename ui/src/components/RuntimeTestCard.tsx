import {
  CircleCheck,
  CircleAlert,
  Loader2,
  Play,
  ChevronRight,
} from "lucide-react";
import type { AdapterEnvironmentTestResult } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "../i18n";
export type TestState = "idle" | "running" | "pass" | "fail";

type Translate = ReturnType<typeof useTranslation>["t"];

const connectionCopy = (t: Translate) => ({
  idle: {
    title: t("runtimeTestCard.connection.idleTitle", { defaultValue: "Test your agent" }),
    description: t("runtimeTestCard.connection.idleDescription", { defaultValue: "Check that your runtime and model can respond." }),
    action: t("runtimeTestCard.connection.runTest", { defaultValue: "Run test" }),
  },
  running: {
    title: t("runtimeTestCard.connection.runningTitle", { defaultValue: "Testing connection" }),
    description: t("runtimeTestCard.connection.runningDescription", { defaultValue: "Checking the runtime and waiting for a model response…" }),
    action: t("runtimeTestCard.connection.testing", { defaultValue: "Testing…" }),
  },
  pass: {
    title: t("runtimeTestCard.connection.passTitle", { defaultValue: "Connection successful" }),
    description: t("runtimeTestCard.connection.passDescription", { defaultValue: "Your runtime checks passed. Review the details below." }),
    action: t("runtimeTestCard.connection.testAgain", { defaultValue: "Test again" }),
  },
  warn: {
    title: t("runtimeTestCard.connection.warnTitle", { defaultValue: "Connection needs attention" }),
    description: t("runtimeTestCard.connection.warnDescription", { defaultValue: "Review the test details before running your agent." }),
    action: t("runtimeTestCard.connection.testAgain", { defaultValue: "Test again" }),
  },
  fail: {
    title: t("runtimeTestCard.connection.failTitle", { defaultValue: "Couldn't connect" }),
    description: t("runtimeTestCard.connection.failDescription", { defaultValue: "Check your model and provider connection, then try again." }),
    action: t("runtimeTestCard.connection.retryTest", { defaultValue: "Retry test" }),
  },
});

const prerequisiteCopy = (t: Translate) => ({
  idle: {
    title: t("runtimeTestCard.prerequisites.idleTitle", { defaultValue: "Check prerequisites" }),
    description: t("runtimeTestCard.prerequisites.idleDescription", { defaultValue: "Check instance settings and public connection configuration." }),
    action: t("runtimeTestCard.prerequisites.checkSetup", { defaultValue: "Check setup" }),
  },
  running: {
    title: t("runtimeTestCard.prerequisites.runningTitle", { defaultValue: "Checking prerequisites" }),
    description: t("runtimeTestCard.prerequisites.runningDescription", { defaultValue: "Checking instance settings and public connection configuration…" }),
    action: t("runtimeTestCard.prerequisites.checking", { defaultValue: "Checking…" }),
  },
  pass: {
    title: t("runtimeTestCard.prerequisites.passTitle", { defaultValue: "Setup checks passed" }),
    description: t("runtimeTestCard.prerequisites.passDescription", { defaultValue: "Review the setup details before assigning work." }),
    action: t("runtimeTestCard.prerequisites.checkAgain", { defaultValue: "Check again" }),
  },
  warn: {
    title: t("runtimeTestCard.prerequisites.warnTitle", { defaultValue: "Pairing required" }),
    description: t("runtimeTestCard.prerequisites.warnDescription", { defaultValue: "Create this agent, then pair it and verify event delivery." }),
    action: t("runtimeTestCard.prerequisites.checkAgain", { defaultValue: "Check again" }),
  },
  fail: {
    title: t("runtimeTestCard.prerequisites.failTitle", { defaultValue: "Prerequisite check failed" }),
    description: t("runtimeTestCard.prerequisites.failDescription", { defaultValue: "Review the setup details and retry." }),
    action: t("runtimeTestCard.prerequisites.retryCheck", { defaultValue: "Retry check" }),
  },
});

export function RuntimeTestCard({
  state,
  result,
  error,
  onTest,
  disabled = false,
  variant = "connection",
  metadataOnly = false,
  tone = "card",
}: {
  state: TestState | "warn";
  result: AdapterEnvironmentTestResult | null;
  error?: string | null;
  onTest: () => void;
  disabled?: boolean;
  variant?: "connection" | "prerequisites";
  metadataOnly?: boolean;
  tone?: "card" | "tile";
}) {
  const { t } = useTranslation();
  const missingRuntime = state === "fail"
    ? result?.checks.find(check => check.code === "acpx_runtime_package_missing")
    : undefined;
  const content = missingRuntime
    ? {
        ...connectionCopy(t).fail,
        title: t("runtimeTestCard.runtimeMissingTitle", { defaultValue: "Runtime missing" }),
        description: missingRuntime.message,
      }
    : (variant === "prerequisites" ? prerequisiteCopy(t) : connectionCopy(t))[state];
  const description = metadataOnly && state === "idle"
    ? t("runtimeTestCard.metadata.idleDescription", { defaultValue: "Verify your saved token, runtime installation, and selected model without sending a model prompt." })
    : metadataOnly && state === "running"
      ? t("runtimeTestCard.metadata.runningDescription", { defaultValue: "Checking the saved token, runtime, and selected model…" })
      : content.description;
  const Icon =
    state === "running"
      ? Loader2
      : state === "pass"
        ? CircleCheck
        : state === "fail" || state === "warn"
          ? CircleAlert
          : Play;
  return (
    <section
      aria-label={t("runtimeTestCard.ariaLabel", { defaultValue: "Runtime test" })}
      data-agent-tile={tone === "tile" ? "" : undefined}
      className={tone === "tile" ? "rounded-lg bg-(--agent-detail-tile)" : "rounded-lg border border-border bg-card"}
    >
      <div className={cn("flex items-start gap-3 sm:items-center", tone === "tile" ? "p-(--agent-detail-module-inset)" : "p-4")}>
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted",
            state === "pass"
              ? "text-green-600 dark:text-green-400"
              : state === "fail"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          <Icon
            className={cn(
              "size-4",
              state === "running" && "animate-spin motion-reduce:animate-none",
            )}
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role={state === "fail" ? "alert" : "status"}
            aria-atomic="true"
            className="min-w-0 space-y-1"
          >
            <h3 className="text-sm font-medium">{content.title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {state === "fail" && error ? error : description}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 self-start sm:self-center"
            disabled={disabled || state === "running"}
            onClick={onTest}
          >
            {content.action}
          </Button>
        </div>
      </div>
      {result && result.checks.length > 0 && (
        <details
          key={`${state}:${result.testedAt}`}
          className="group border-t border-border"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight
              aria-hidden="true"
              className="size-3 transition-transform group-open:rotate-90"
            />
            {t("runtimeTestCard.details", { defaultValue: "Test details" })}
          </summary>
          <ul className="space-y-3 px-4 pb-4">
            {result.checks.map((check) => (
              <li
                key={check.code}
                className="flex gap-2 text-xs leading-relaxed"
              >
                {check.level === "error" || check.level === "warn" ? (
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-destructive"
                  />
                ) : (
                  <CircleCheck
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="break-words text-foreground">{check.message}</p>
                  {check.detail && (
                    <p className="break-all text-muted-foreground">
                      {check.detail}
                    </p>
                  )}
                  {check.hint && (
                    <p className="text-muted-foreground">{check.hint}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
