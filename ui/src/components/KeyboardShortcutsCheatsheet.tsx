import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";

interface ShortcutEntry {
  keys: string[];
  label: string;
  labelKey: string;
  /** Render keys as a simultaneous chord (joined with "+") rather than a
   *  "then" sequence. */
  combo?: boolean;
}

interface ShortcutSection {
  title: string;
  titleKey: string;
  shortcuts: ShortcutEntry[];
}

const sections: ShortcutSection[] = [
  {
    title: "Inbox",
    titleKey: "inbox",
    shortcuts: [
      { keys: ["j"], label: "Move down", labelKey: "move-down" },
      { keys: ["↓"], label: "Move down", labelKey: "move-down" },
      { keys: ["k"], label: "Move up", labelKey: "move-up" },
      { keys: ["↑"], label: "Move up", labelKey: "move-up" },
      { keys: ["←"], label: "Collapse selected group", labelKey: "collapse-selected-group" },
      { keys: ["→"], label: "Expand selected group", labelKey: "expand-selected-group" },
      { keys: ["Enter"], label: "Open selected item", labelKey: "open-selected-item" },
      { keys: ["a"], label: "Archive item", labelKey: "archive-item" },
      { keys: ["y"], label: "Archive item", labelKey: "archive-item" },
      { keys: ["r"], label: "Mark as read", labelKey: "mark-as-read" },
      { keys: ["U"], label: "Mark as unread", labelKey: "mark-as-unread" },
    ],
  },
  {
    title: "Task detail",
    titleKey: "task-detail",
    shortcuts: [
      { keys: ["y"], label: "Quick-archive back to inbox", labelKey: "quick-archive-back-to-inbox" },
      { keys: ["g", "i"], label: "Go to inbox", labelKey: "go-to-inbox" },
      { keys: ["g", "c"], label: "Focus comment composer", labelKey: "focus-comment-composer" },
    ],
  },
  {
    title: "Decisions",
    titleKey: "decisions",
    shortcuts: [
      { keys: ["j"], label: "Move down", labelKey: "move-down" },
      { keys: ["↓"], label: "Move down", labelKey: "move-down" },
      { keys: ["k"], label: "Move up", labelKey: "move-up" },
      { keys: ["↑"], label: "Move up", labelKey: "move-up" },
      { keys: ["Enter"], label: "Open or close selected decision", labelKey: "open-or-close-selected-decision" },
      { keys: ["x"], label: "Dismiss selected decision", labelKey: "dismiss-selected-decision" },
    ],
  },
  {
    title: "Global",
    titleKey: "global",
    shortcuts: [
      { keys: ["/"], label: "Search current page or quick search", labelKey: "search-current-page-or-quick-search" },
      { keys: ["c"], label: "New task", labelKey: "new-task" },
      { keys: ["["], label: "Toggle sidebar", labelKey: "toggle-sidebar" },
      { keys: ["]"], label: "Toggle panel", labelKey: "toggle-panel" },
      { keys: ["?"], label: "Show keyboard shortcuts", labelKey: "show-keyboard-shortcuts" },
    ],
  },
];

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground shadow-(--shadow-extract-10)">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsCheatsheetContent() {
  const { t } = useTranslation();
  return (
    <>
      <div className="divide-y divide-border border-t border-border">
        {sections.map((section) => (
          <div key={section.title} className="px-5 py-3">
            <h3 className="mb-2 text-(length:--text-micro) font-semibold uppercase tracking-wider text-muted-foreground">
              {t(`keyboardShortcuts.section.${section.titleKey}`, { defaultValue: section.title })}
            </h3>
            <div className="space-y-1.5">
              {section.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label + shortcut.keys.join()}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-sm text-foreground/90">{t(`keyboardShortcuts.shortcut.${shortcut.labelKey}`, { defaultValue: shortcut.label })}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, i) => (
                      <span key={key} className="flex items-center gap-1">
                        {i > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {shortcut.combo ? "+" : t("keyboardShortcuts.then", { defaultValue: "then" })}
                          </span>
                        )}
                        <KeyCap>{key}</KeyCap>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {t("keyboardShortcuts.pressPrefix", { defaultValue: "Press" })} <KeyCap>Esc</KeyCap> {t("keyboardShortcuts.pressSuffix", { defaultValue: "to close · Shortcuts are disabled in text fields" })}
        </p>
      </div>
    </>
  );
}

export function KeyboardShortcutsCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">{t("keyboardShortcuts.title", { defaultValue: "Keyboard shortcuts" })}</DialogTitle>
        </DialogHeader>
        <KeyboardShortcutsCheatsheetContent />
      </DialogContent>
    </Dialog>
  );
}
