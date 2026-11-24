import { useId } from "react";
import { Plus, UserRound } from "lucide-react";
import {
  aiConnectionCatalogSlug,
  type AiConnectionBinding,
} from "@paperclipai/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppLogo } from "@/pages/apps/AppLogo";
import { Button } from "@/components/ui/button";
import { aiConnectionDisplayLabel, aiConnectionProblem, isAiConnectionCompatibleForSelection, personalAiDefault } from "./model";
import type { AiConnectionPickerProps } from "./AiConnectionPicker";
import type { AiConnectionSummary } from "./model";
import { useTranslation } from "../../i18n";
import { ANALYTICS_MASK_CLASS } from "@/lib/analytics/privacy";
import { cn } from "@/lib/utils";

function ConnectionLabel({ connection, label, wrap = false }: { connection: AiConnectionSummary; label?: string; wrap?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <AppLogo name={connection.name} brandKey={aiConnectionCatalogSlug(connection.provider, connection.routing)} size={20} compact />
      <span className={cn(wrap ? "min-w-0 break-words whitespace-normal" : "truncate", ANALYTICS_MASK_CLASS)}>{label ?? aiConnectionDisplayLabel(connection)}</span>
    </span>
  );
}

/** The same connection control on Create agent and Harness / Runtime. */
export function AiConnectionSelect({
  requirement,
  connections,
  value,
  currentUserId,
  readOnly,
  loading,
  error,
  onRetry,
  onConnect,
  onReconnect,
  onChange,
  adapterType,
  model,
  onUseHarnessAuth,
}: AiConnectionPickerProps & { adapterType: string; model?: string; onUseHarnessAuth?: () => void }) {
  const { t } = useTranslation();
  const selectId = useId();
  const personal = personalAiDefault(connections, requirement, currentUserId);
  const selected =
    value?.mode === "responsible_user"
      ? personal
      : connections.find(
          (c) => c.companyId === requirement.companyId && c.id === value?.connectionId && c.grantId === value?.grantId,
        );
  const compatible = connections
    .filter(
      (c) =>
        c.companyId === requirement.companyId &&
        isAiConnectionCompatibleForSelection(
          c,
          adapterType,
          model,
        ),
    )
    .sort(
      (a, b) =>
        Number(b.id === selected?.id) - Number(a.id === selected?.id) ||
        Number(Boolean(a.routing)) - Number(Boolean(b.routing)) ||
        a.name.localeCompare(b.name),
    );
  const unavailable = Boolean(
    value &&
      value.mode !== "responsible_user" &&
      !selected &&
      !loading &&
      !error,
  );
  const canUseDefault = isAiConnectionCompatibleForSelection(
    personal ?? {
      provider: requirement.provider,
      method: "api_key",
      mode: "responsible_user",
    },
    adapterType,
    model,
  );
  const incompatible =
    selected && !compatible.some((c) => c.id === selected.id);
  const change = (id: string) => {
    if (id === "connect") return onConnect();
    if (id === "harness_auth") return onUseHarnessAuth?.();
    if (id === "responsible_user" && canUseDefault)
      return onChange({
        provider: requirement.provider,
        method: personal?.method ?? "api_key",
        mode: "responsible_user",
      });
    const connection = compatible.find((c) => c.id === id);
    if (!connection || aiConnectionProblem(connection)) return;
    onChange({
      provider: connection.provider,
      method: connection.method,
      mode: connection.ownership === "shared" ? "shared" : "delegated",
      connectionId: connection.id,
      grantId: connection.grantId,
    } satisfies AiConnectionBinding);
  };
  return (
    <div className="space-y-2">
      <label className="text-xs text-muted-foreground" htmlFor={selectId}>
        {t("aiConnectionSelect.connection", { defaultValue: "Connection" })}
      </label>
      <Select
        value={
          value?.mode === "responsible_user"
            ? "responsible_user"
            : (value?.connectionId ?? (onUseHarnessAuth ? "harness_auth" : ""))
        }
        onValueChange={change}
        disabled={readOnly || loading || Boolean(error)}
      >
        <SelectTrigger id={selectId} aria-label={t("aiConnectionSelect.connection", { defaultValue: "Connection" })} title={selected ? aiConnectionDisplayLabel(selected) : undefined} className={cn("w-full", ANALYTICS_MASK_CLASS)}>
          <SelectValue
            placeholder={
              loading
                ? t("aiConnectionSelect.loadingConnections", { defaultValue: "Loading connections…" })
                : t("aiConnectionSelect.chooseConnection", { defaultValue: "Choose a connection" })
            }
          >
            {selected
              ? <ConnectionLabel connection={selected} label={value?.mode === "responsible_user" ? t("aiConnectionSelect.responsibleDefault", { defaultValue: "Responsible user’s default" }) : undefined} />
              : value?.mode === "responsible_user"
                ? t("aiConnectionSelect.responsibleDefault", { defaultValue: "Responsible user’s default" })
                : value
                  ? t("aiConnectionSelect.unavailable", { defaultValue: "Unavailable connection" })
                  : onUseHarnessAuth
                    ? t("aiConnectionSelect.useHarnessSignIn", { defaultValue: "Use harness sign-in" })
                    : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className={ANALYTICS_MASK_CLASS}>
          {onUseHarnessAuth && <SelectItem value="harness_auth">Use harness sign-in</SelectItem>}
          {incompatible && selected && (
            <SelectItem value={selected.id} disabled>
              <ConnectionLabel connection={selected} label={t("aiConnectionSelect.incompatibleHarness", {
                label: aiConnectionDisplayLabel(selected),
                defaultValue: `${aiConnectionDisplayLabel(selected)} · Incompatible with this harness and model`,
              })} wrap />
            </SelectItem>
          )}
          {compatible.map((c) => (
            <SelectItem
              key={c.id}
              value={c.id}
              disabled={Boolean(aiConnectionProblem(c))}
            >
              <ConnectionLabel connection={c} label={c.status !== "connected" ? t("aiConnectionSelect.reconnect", { defaultValue: "{{label}} · Reconnect", label: aiConnectionDisplayLabel(c) }) : aiConnectionDisplayLabel(c)} wrap />
            </SelectItem>
          ))}
          {(canUseDefault || value?.mode === "responsible_user") && (
            <SelectItem value="responsible_user" disabled={!canUseDefault}>
              <span className="flex size-5 shrink-0 items-center justify-center"><UserRound className="size-4" /></span>
              {t("aiConnectionSelect.responsibleDefault", { defaultValue: "Responsible user’s default" })}
              {!canUseDefault
                ? t("aiConnectionSelect.incompatibleSuffix", { defaultValue: " · Incompatible with this harness and model" })
                : null}
            </SelectItem>
          )}
          <SelectItem value="connect">
            <span className="flex size-5 shrink-0 items-center justify-center"><Plus className="size-4" /></span>
            {t("aiConnectionSelect.connectAccount", { defaultValue: "Connect an account…" })}
          </SelectItem>
        </SelectContent>
      </Select>
      {!readOnly && onReconnect && !loading && !error && (
        <Button type="button" variant="outline" onClick={onReconnect}>{t("aiConnectionSelect.reconnectAccount", { defaultValue: "Reconnect account" })}</Button>
      )}
      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button type="button" variant="outline" onClick={onRetry}>
            {t("aiConnectionSelect.retryConnections", { defaultValue: "Retry connections" })}
          </Button>
        </div>
      )}
      {value?.mode === "responsible_user" && !personal && !loading && !error ? (
        <p role="alert" className="text-sm text-destructive">
          {t("aiConnectionSelect.noDefaultAccountPrefix", { defaultValue: "You have no default account for this provider." })}{" "}
          {!readOnly && <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={onConnect}>{t("aiConnectionSelect.connectAnAccount", { defaultValue: "Connect an account" })}</Button>}
          {readOnly
            ? t("aiConnectionSelect.connectOrChoose", { defaultValue: " Connect an account or choose another connection." })
            : t("aiConnectionSelect.orChooseAnother", { defaultValue: " or choose another connection." })}
        </p>
      ) : unavailable ? (
        <p role="alert" className="text-sm text-destructive">
          {t("aiConnectionSelect.connectionUnavailable", { defaultValue: "This connection is unavailable. Choose another connection." })}
        </p>
      ) : incompatible ? (
        <p role="alert" className="text-sm text-destructive">
          {t("aiConnectionSelect.incompatibleHarness", { defaultValue: "This connection does not support the selected harness. Choose a compatible connection." })}
        </p>
      ) : selected && aiConnectionProblem(selected) ? (
        <p role="alert" className="text-sm text-destructive">
          {aiConnectionProblem(selected)}
        </p>
      ) : null}
    </div>
  );
}
