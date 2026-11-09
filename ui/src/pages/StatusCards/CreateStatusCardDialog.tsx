import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { defaultStatusCardRefreshPolicy } from "@paperclipai/shared";
import { Loader2 } from "lucide-react";

import { statusCardsApi } from "@/api/statusCards";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { InlineBanner } from "@/components/InlineBanner";
import { queryKeys } from "@/lib/queryKeys";
import { useTranslation } from "../../i18n";
import { SummarizerAgentSelect } from "./SummarizerAgentSelect";

const EXAMPLES = [
  { key: "statusCards.examples.evals", defaultValue: "issues about evals" },
  { key: "statusCards.examples.blocked", defaultValue: "everything blocked this week" },
  { key: "statusCards.examples.featureLive", defaultValue: "is feature X live? if not, the exact next actions to ship it" },
];

export function CreateStatusCardDialog({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  // "" → the built-in Summarizer; otherwise the id of the override agent.
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPrompt("");
    setAgentId("");
    setError(null);
  }

  function close() {
    onOpenChange(false);
    // Delay reset so the closing animation does not flash cleared fields.
    window.setTimeout(reset, 200);
  }

  const createMutation = useMutation({
    mutationFn: () =>
      statusCardsApi.create(companyId, {
        interestPrompt: prompt.trim(),
        titlePinned: false,
        agentId: agentId || null,
        refreshPolicy: defaultStatusCardRefreshPolicy,
      }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.statusCards.list(companyId, false) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.statusCards.list(companyId, true) }),
      ]);
      close();
    },
    onError: (err) => setError(describeError(err, { action: "create the card" }).body),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("statusCards.newCard", { defaultValue: "New card" })}</DialogTitle>
          <DialogDescription>
            {t("statusCards.createDescription", { defaultValue: "One message sets up the whole card: say what you want to watch and what each update should tell you. The agent builds the query from it and writes every update against it." })}
          </DialogDescription>
        </DialogHeader>

        {error ? <InlineBanner tone="danger" title={t("statusCards.createFailed", { defaultValue: "Create failed" })}>{error}</InlineBanner> : null}

        <div className="space-y-3">
          <label htmlFor="status-card-prompt" className="block pb-1 text-sm font-semibold">
            {t("statusCards.promptLabel", { defaultValue: "What do you want to keep an eye on?" })}
          </label>
          <Textarea
            id="status-card-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            autoFocus
            placeholder={t("statusCards.promptPlaceholder", { defaultValue: "Keep an eye on the ID and Cloud projects. Tell me whether the service is live, and if not, the exact three actions needed to get it to production." })}
            className="text-sm"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{t("statusCards.examplesLabel", { defaultValue: "Examples" })}</span>
            {EXAMPLES.map((example) => {
              const text = t(example.key, { defaultValue: example.defaultValue });
              return (
                <button
                  key={example.key}
                  type="button"
                  onClick={() => setPrompt(text)}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/40"
                >
                  {text}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold">{t("statusCards.agentLabel", { defaultValue: "Agent" })}</label>
          <SummarizerAgentSelect companyId={companyId} value={agentId} onChange={setAgentId} enabled={open} />
          <p className="text-xs text-muted-foreground">
            {t("statusCards.agentHint", { defaultValue: "Runs this card's setup and updates. Leave on the default unless another agent should own it." })}
          </p>
        </div>

        <DialogFooter>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close} disabled={createMutation.isPending}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={prompt.trim().length === 0 || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("statusCards.createCard", { defaultValue: "Create card" })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
