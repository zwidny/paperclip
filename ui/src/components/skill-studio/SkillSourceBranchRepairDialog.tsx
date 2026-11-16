import { useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { RepositoryBranchSelect, type RepositoryBranch } from '@/components/RepositoryBranchSelect';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslation } from "../../i18n";

/** Presentational branch repair. The caller owns branch discovery and saving. */
export function SkillSourceBranchRepairDialog({ repository, currentBranch, branches, loading, loadError, onRetry, onSave, onClose, onReturnFocus }: {
  repository: string;
  currentBranch: string;
  branches: readonly RepositoryBranch[];
  loading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  onSave: (branch: string) => Promise<void>;
  onClose: () => void;
  onReturnFocus?: () => void;
}) {
  const { t } = useTranslation();
  const [branch, setBranch] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  async function save() {
    setPending(true); setError(null);
    try { await onSave(branch); onClose(); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Could not change the branch. Try again.'); }
    finally { setPending(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending) onClose(); }}>
    <DialogContent showCloseButton={!pending} onOpenAutoFocus={event => { event.preventDefault(); title.current?.focus(); }}
      onCloseAutoFocus={event => { if (onReturnFocus) { event.preventDefault(); onReturnFocus(); } }}>
      <DialogHeader>
        <DialogTitle ref={title} tabIndex={-1} className="outline-none">{t("skillSources.chooseNewBranch", { defaultValue: "Choose a new branch" })}</DialogTitle>
        <DialogDescription className="break-words">{repository} · Currently tracking {currentBranch === 'HEAD' ? 'the default branch' : currentBranch}</DialogDescription>
      </DialogHeader>
      <form className="flex min-w-0 flex-col gap-4" onSubmit={event => { event.preventDefault(); if (branch && !pending) void save(); }}>
        <RepositoryBranchSelect value={branch} branches={branches} loading={loading} error={loadError} disabled={pending}
          onChange={value => { setBranch(value); setError(null); }} onRetry={onRetry} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>{t("common.cancel", { defaultValue: "Cancel" })}</Button>
          <Button type="submit" disabled={!branch || pending}>{pending && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />}{pending ? t("skillSources.changingBranch", { defaultValue: "Changing branch…" }) : t("skillSources.changeBranch", { defaultValue: "Change branch" })}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
