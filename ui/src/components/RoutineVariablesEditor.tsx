import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import { isValidRoutineDateString, syncRoutineVariablesWithTemplate, type RoutineVariable } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useTranslation } from "@/i18n";

const variableTypes: RoutineVariable["type"][] = ["text", "textarea", "number", "boolean", "select", "date"];

function serializeVariables(value: RoutineVariable[]) {
  return JSON.stringify(value);
}

function parseSelectOptions(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function updateVariableList(
  variables: RoutineVariable[],
  name: string,
  mutate: (variable: RoutineVariable) => RoutineVariable,
) {
  return variables.map((variable) => (variable.name === name ? mutate(variable) : variable));
}

function defaultValueForType(type: RoutineVariable["type"], current: RoutineVariable["defaultValue"]) {
  if (type === "boolean") return null;
  if (type === "date") {
    return typeof current === "string" && isValidRoutineDateString(current) ? current : null;
  }
  return current;
}

export function RoutineVariablesEditor({
  title,
  description,
  value,
  onChange,
  variant = "default",
}: {
  title: string;
  description: string;
  value: RoutineVariable[];
  onChange: (value: RoutineVariable[]) => void;
  /** `compact` puts each variable on one row under shared column labels. */
  variant?: "default" | "compact";
}) {
  const [open, setOpen] = useState(true);
  const { t } = useTranslation();
  const syncedVariables = useMemo(
    () => syncRoutineVariablesWithTemplate([title, description], value),
    [description, title, value],
  );
  const syncedSignature = serializeVariables(syncedVariables);
  const currentSignature = serializeVariables(value);

  useEffect(() => {
    if (syncedSignature !== currentSignature) {
      onChange(syncedVariables);
    }
  }, [currentSignature, onChange, syncedSignature, syncedVariables]);

  if (syncedVariables.length === 0) {
    return null;
  }

  if (variant === "compact") {
    return (
      <CompactVariableRows
        variables={syncedVariables}
        onPatch={(name, mutate) => onChange(updateVariableList(syncedVariables, name, mutate))}
      />
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-lg border border-border/70">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left">
        <div>
          <p className="text-sm font-medium">{t("routineVariables.title", { defaultValue: "Variables" })}</p>
          <p className="text-xs text-muted-foreground">
            {t("routineVariables.detectedPrefix", { defaultValue: "Detected from `" })}
            {"{{name}}"}
            {t("routineVariables.detectedSuffix", { defaultValue: "` placeholders in the title and instructions." })}
          </p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="divide-y divide-border/70 border-t border-border/70">
        {syncedVariables.map((variable) => (
          <div key={variable.name} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {`{{${variable.name}}}`}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t("routineVariables.promptBeforeRun", { defaultValue: "Prompt the user for this value before each manual run." })}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("routineVariables.labelLabel", { defaultValue: "Label" })}</Label>
                <Input
                  value={variable.label ?? ""}
                  onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                    ...current,
                    label: event.target.value || null,
                  })))}
                  placeholder={variable.name.replaceAll("_", " ")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("routineVariables.typeLabel", { defaultValue: "Type" })}</Label>
                <Select
                  value={variable.type}
                  onValueChange={(type) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                    ...current,
                    type: type as RoutineVariable["type"],
                    defaultValue: defaultValueForType(type as RoutineVariable["type"], current.defaultValue),
                    options: type === "select" ? current.options : [],
                  })))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variableTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs">{t("routineVariables.defaultValueLabel", { defaultValue: "Default value" })}</Label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={variable.required}
                      onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                        ...current,
                        required: event.target.checked,
                      })))}
                    />
                    {t("routineVariables.required", { defaultValue: "Required" })}
                  </label>
                </div>

                {variable.type === "textarea" ? (
                  <Textarea
                    rows={3}
                    value={variable.defaultValue == null ? "" : String(variable.defaultValue)}
                    onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: event.target.value || null,
                    })))}
                  />
                ) : variable.type === "boolean" ? (
                  <Select
                    value={variable.defaultValue === true ? "true" : variable.defaultValue === false ? "false" : "__unset__"}
                    onValueChange={(next) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: next === "__unset__" ? null : next === "true",
                    })))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">{t("routineVariables.noDefault", { defaultValue: "No default" })}</SelectItem>
                      <SelectItem value="true">{t("routineVariables.trueLabel", { defaultValue: "True" })}</SelectItem>
                      <SelectItem value="false">{t("routineVariables.falseLabel", { defaultValue: "False" })}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : variable.type === "select" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("routineVariables.optionsLabel", { defaultValue: "Options" })}</Label>
                      <Input
                        value={variable.options.join(", ")}
                        onChange={(event) => {
                          const options = parseSelectOptions(event.target.value);
                          onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                            ...current,
                            options,
                            defaultValue:
                              typeof current.defaultValue === "string" && options.includes(current.defaultValue)
                                ? current.defaultValue
                                : null,
                          })));
                        }}
                        placeholder={t("routineVariables.optionsPlaceholder", { defaultValue: "high, medium, low" })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("routineVariables.defaultOptionLabel", { defaultValue: "Default option" })}</Label>
                      <Select
                        value={typeof variable.defaultValue === "string" ? variable.defaultValue : "__unset__"}
                        onValueChange={(next) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                          ...current,
                          defaultValue: next === "__unset__" ? null : next,
                        })))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("routineVariables.noDefault", { defaultValue: "No default" })} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unset__">{t("routineVariables.noDefault", { defaultValue: "No default" })}</SelectItem>
                          {variable.options.map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : variable.type === "date" ? (
                  <Input
                    type="date"
                    value={typeof variable.defaultValue === "string" ? variable.defaultValue : ""}
                    onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: event.target.value || null,
                    })))}
                  />
                ) : (
                  <Input
                    type={variable.type === "number" ? "number" : "text"}
                    value={variable.defaultValue == null ? "" : String(variable.defaultValue)}
                    onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: event.target.value || null,
                    })))}
                    placeholder={variable.type === "number" ? "42" : t("routineVariables.defaultValuePlaceholder", { defaultValue: "Default value" })}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

const compactColumns = {
  name: "w-full shrink-0 sm:w-48",
  type: "w-28 shrink-0",
  defaultValue: "min-w-0 flex-1 basis-32",
  required: "flex w-16 shrink-0 justify-center",
};

/** One row per variable: name, type, default and required, with the column labels shown once.
 * A saved label is kept as-is; this layout does not edit it. */
function CompactVariableRows({
  variables,
  onPatch,
}: {
  variables: RoutineVariable[];
  onPatch: (name: string, mutate: (variable: RoutineVariable) => RoutineVariable) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2" role="group" aria-label={t("routineVariables.title", { defaultValue: "Variables" })}>
      <Label>{t("routineVariables.title", { defaultValue: "Variables" })}</Label>
      <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex" aria-hidden="true">
        <span className={compactColumns.name}>{t("routineVariables.nameLabel", { defaultValue: "Name" })}</span>
        <span className={compactColumns.type}>{t("routineVariables.typeLabel", { defaultValue: "Type" })}</span>
        <span className={compactColumns.defaultValue}>{t("routineVariables.defaultColumn", { defaultValue: "Default" })}</span>
        <span className={compactColumns.required}>{t("routineVariables.required", { defaultValue: "Required" })}</span>
      </div>
      {variables.map((variable) => {
        const patch = (change: Partial<RoutineVariable>) => onPatch(variable.name, (current) => ({ ...current, ...change }));
        return (
          <div key={variable.name} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <code className={`${compactColumns.name} truncate font-mono text-xs`} title={`{{${variable.name}}}`}>
                {`{{${variable.name}}}`}
              </code>
              <Select
                value={variable.type}
                onValueChange={(type) => onPatch(variable.name, (current) => ({
                  ...current,
                  type: type as RoutineVariable["type"],
                  defaultValue: defaultValueForType(type as RoutineVariable["type"], current.defaultValue),
                  options: type === "select" ? current.options : [],
                }))}
              >
                <SelectTrigger className={compactColumns.type} aria-label={t("routineVariables.typeOf", { defaultValue: "Type of {{name}}", name: variable.name })}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {variableTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className={compactColumns.defaultValue}>
                {variable.type === "boolean" ? (
                  <Select
                    value={variable.defaultValue === true ? "true" : variable.defaultValue === false ? "false" : "__unset__"}
                    onValueChange={(next) => patch({ defaultValue: next === "__unset__" ? null : next === "true" })}
                  >
                    <SelectTrigger className="w-full" aria-label={t("routineVariables.defaultFor", { defaultValue: "Default for {{name}}", name: variable.name })}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">{t("routineVariables.noDefault", { defaultValue: "No default" })}</SelectItem>
                      <SelectItem value="true">{t("routineVariables.trueLabel", { defaultValue: "True" })}</SelectItem>
                      <SelectItem value="false">{t("routineVariables.falseLabel", { defaultValue: "False" })}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : variable.type === "select" ? (
                  <Select
                    value={typeof variable.defaultValue === "string" ? variable.defaultValue : "__unset__"}
                    onValueChange={(next) => patch({ defaultValue: next === "__unset__" ? null : next })}
                  >
                    <SelectTrigger className="w-full" aria-label={t("routineVariables.defaultFor", { defaultValue: "Default for {{name}}", name: variable.name })}>
                      <SelectValue placeholder={t("routineVariables.noDefault", { defaultValue: "No default" })} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">{t("routineVariables.noDefault", { defaultValue: "No default" })}</SelectItem>
                      {variable.options.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : variable.type === "textarea" ? (
                  <Textarea
                    rows={1}
                    aria-label={t("routineVariables.defaultFor", { defaultValue: "Default for {{name}}", name: variable.name })}
                    value={variable.defaultValue == null ? "" : String(variable.defaultValue)}
                    placeholder={t("routineVariables.noDefault", { defaultValue: "No default" })}
                    onChange={(event) => patch({ defaultValue: event.target.value || null })}
                  />
                ) : (
                  <Input
                    type={variable.type === "number" ? "number" : variable.type === "date" ? "date" : "text"}
                    aria-label={t("routineVariables.defaultFor", { defaultValue: "Default for {{name}}", name: variable.name })}
                    value={variable.defaultValue == null ? "" : String(variable.defaultValue)}
                    placeholder={t("routineVariables.noDefault", { defaultValue: "No default" })}
                    onChange={(event) => patch({ defaultValue: event.target.value || null })}
                  />
                )}
              </div>
              <label className={`${compactColumns.required} items-center gap-2 text-xs text-muted-foreground`}>
                <input
                  type="checkbox"
                  checked={variable.required}
                  aria-label={`${variable.name} is required`}
                  onChange={(event) => patch({ required: event.target.checked })}
                />
                <span className="sm:hidden">Required</span>
              </label>
            </div>
            {variable.type === "select" ? (
              <div className="flex items-center gap-2">
              <span className={`${compactColumns.name} hidden sm:block`} aria-hidden="true" />
              <Input
                className="min-w-0 flex-1"
                aria-label={t("routineVariables.optionsFor", { defaultValue: "Options for {{name}}", name: variable.name })}
                value={variable.options.join(", ")}
                placeholder={t("routineVariables.optionsPlaceholderFull", { defaultValue: "Options, separated by commas: high, medium, low" })}
                onChange={(event) => {
                  const options = parseSelectOptions(event.target.value);
                  onPatch(variable.name, (current) => ({
                    ...current,
                    options,
                    defaultValue:
                      typeof current.defaultValue === "string" && options.includes(current.defaultValue)
                        ? current.defaultValue
                        : null,
                  }));
                }}
              />
              <span className={`${compactColumns.required} hidden sm:block`} aria-hidden="true" />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type BuiltinVariableDoc = {
  name: string;
  example: string;
  description: string;
};

const BUILTIN_VARIABLE_DOCS: BuiltinVariableDoc[] = [
  {
    name: "date",
    example: "2026-04-28",
    description: "Current date in YYYY-MM-DD format (UTC) at the time the routine runs.",
  },
  {
    name: "timestamp",
    example: "April 28, 2026 at 12:17 PM UTC",
    description: "Human-readable date and time (UTC) at the time the routine runs.",
  },
];

export function RoutineVariablesHint() {
  const [helpOpen, setHelpOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {t("routineVariables.hintPrefix", { defaultValue: "Use `" })}
          {"{{variable_name}}"}
          {t("routineVariables.hintSuffix", { defaultValue: "` placeholders in the title or instructions to prompt for inputs when the routine runs." })}
        </span>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("routineVariables.showHelp", { defaultValue: "Show variable help" })}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("routineVariables.help.title", { defaultValue: "Routine variables" })}</DialogTitle>
            <DialogDescription>
              {t("routineVariables.help.description", { defaultValue: "How to prompt for inputs and which variables Paperclip fills in automatically." })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
                {t("routineVariables.help.customTitle", { defaultValue: "Custom variables" })}
              </h3>
              <p className="text-muted-foreground">
                {t("routineVariables.help.customIntro", { defaultValue: "Type" })}{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                  {"{{variable_name}}"}
                </code>{" "}
                {t("routineVariables.help.customMiddle", { defaultValue: " anywhere in the title or instructions. Paperclip detects each placeholder, lists it under " })}
                <span className="font-medium text-foreground">{t("routineVariables.help.customVariablesEmphasis", { defaultValue: "Variables" })}</span>
                {t("routineVariables.help.customOutro", { defaultValue: ", and prompts for a value before each run." })}
              </p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("routineVariables.help.ruleName", { defaultValue: "Names must start with a letter and may use letters, numbers, and underscores." })}</li>
                <li>{t("routineVariables.help.ruleType", { defaultValue: "Pick a type (text, textarea, number, boolean, select, date), default value, and whether it is required." })}</li>
                <li>{t("routineVariables.help.ruleDateSuffix", { defaultValue: "Variable names ending in capital Date, such as startDate, are created as date variables by default." })}</li>
                <li>{t("routineVariables.help.ruleSharedName", { defaultValue: "The same name reused across the title and instructions is treated as one variable." })}</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
                {t("routineVariables.help.builtinTitle", { defaultValue: "Built-in variables" })}
              </h3>
              <p className="text-muted-foreground">
                {t("routineVariables.help.builtinDescription", { defaultValue: "These are filled in automatically — no setup needed and they will not appear in the Variables list." })}
              </p>
              <div className="overflow-hidden rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("routineVariables.help.columnPlaceholder", { defaultValue: "Placeholder" })}</th>
                      <th className="px-3 py-2 font-medium">{t("routineVariables.help.columnExample", { defaultValue: "Example" })}</th>
                      <th className="px-3 py-2 font-medium">{t("routineVariables.help.columnDescription", { defaultValue: "Description" })}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {BUILTIN_VARIABLE_DOCS.map((entry) => (
                      <tr key={entry.name} className="align-top">
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="font-mono text-xs">{`{{${entry.name}}}`}</Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{entry.example}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {t(`routineVariables.builtin.${entry.name}`, { defaultValue: entry.description })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
