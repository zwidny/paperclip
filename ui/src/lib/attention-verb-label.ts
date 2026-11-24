import { t } from "../i18n";

/**
 * Localized label for an `AttentionItem` decision verb.
 *
 * The server sends one fixed label per verb id, but a caller may pass a more
 * specific one — the attention-row tests do exactly that (`id: "accept"` with
 * `label: "Approve plan"`). Translating purely by id would replace that specific
 * wording with the generic catalog text, so only translate when the catalog's
 * English value is the label we were handed. Anything else stays as given.
 */
export function attentionVerbLabel(id: string, english: string): string {
  const key = `attentionVerb.${id}.label`;
  const catalogEnglish = t(key, { lng: "en", defaultValue: english });
  return catalogEnglish === english ? t(key, { defaultValue: english }) : english;
}
