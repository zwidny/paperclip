import { useEffect, useState } from 'react';
import type { CompanySkillFileDetail } from '@paperclipai/shared';
import { Button } from './ui/button';
import { useTranslation } from "../i18n";
export function SkillBinaryFile({ file }: { file: CompanySkillFileDetail }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  useEffect(() => {
    const bytes = Uint8Array.from(atob(file.content), char => char.charCodeAt(0));
    const href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    setUrl(href); return () => URL.revokeObjectURL(href);
  }, [file.content]);
  return <div className="flex flex-col items-start gap-3 py-6">
    <p className="text-sm text-muted-foreground">{t("skillBinaryFile.body", { defaultValue: "This asset is stored in its original binary format." })}</p>
    <Button asChild variant="outline" className="max-w-full"><a href={url} download={file.path.split('/').at(-1)} title={t("skillBinaryFile.downloadTitle", { filename: file.path.split("/").at(-1), defaultValue: "Download {{filename}}" })}><span className="truncate">{t("skillBinaryFile.download", { filename: file.path.split("/").at(-1), defaultValue: "Download {{filename}}" })}</span></a></Button>
  </div>;
}
