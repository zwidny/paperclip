import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";

export function LegacyBoardSendNotice({ onDiscard }: { onDiscard: () => void }) {
  const { t } = useTranslation();
  return <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button size="sm" variant="outline">{t("legacyBoardSend.discardTrigger", { defaultValue: "Discard saved delivery record" })}</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t("legacyBoardSend.discardTitle", { defaultValue: "Discard saved delivery record?" })}</AlertDialogTitle>
        <AlertDialogDescription>
          {t("legacyBoardSend.discardBody", { defaultValue: "First check Activity. Discarding this browser record does not cancel an update that was already accepted. It lets you start a new update." })}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{t("legacyBoardSend.keepRecord", { defaultValue: "Keep record" })}</AlertDialogCancel>
        <AlertDialogAction onClick={onDiscard}>{t("legacyBoardSend.discardRecord", { defaultValue: "Discard record" })}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
