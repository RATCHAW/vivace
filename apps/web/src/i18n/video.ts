/**
 * The video catalogue, in the athlete's language.
 *
 * `@repo/video` stays the source of truth for *what exists* — it is React-free
 * and it is what Lambda loads, where no message catalogue is available, so its
 * labels stay English. These look the same entries up by id and fall back to
 * the catalogue's own words, which means a template added without a translation
 * still renders with a real name instead of a missing-key string.
 *
 * Consequence worth knowing: adding a template is still the four-file edit
 * CLAUDE.md describes. A fifth entry — here and in `fr.ts` — is optional, and
 * only decides whether French speakers see it in French.
 */
import {
  getTemplate,
  THEMES,
  type Eligibility,
  type TemplateId,
  type ThemeName,
} from "@repo/video";
import { useTranslation } from "react-i18next";

export interface VideoLabels {
  templateLabel(id: TemplateId): string;
  templateDescription(id: TemplateId): string;
  themeLabel(name: ThemeName): string;
  themeDescription(name: ThemeName): string;
  /** Why this run can't be cut this way, or undefined when it can. */
  eligibilityReason(verdict: Eligibility): string | undefined;
}

export function useVideoLabels(): VideoLabels {
  const { t } = useTranslation();

  return {
    templateLabel: (id) =>
      t(`video.template.${id}.label`, { defaultValue: getTemplate(id).label }),
    templateDescription: (id) =>
      t(`video.template.${id}.description`, {
        defaultValue: getTemplate(id).description,
      }),
    themeLabel: (name) =>
      t(`video.theme.${name}.label`, { defaultValue: THEMES[name].label }),
    themeDescription: (name) =>
      t(`video.theme.${name}.description`, {
        defaultValue: THEMES[name].description,
      }),
    eligibilityReason: (verdict) =>
      verdict.reasonKey
        ? t(`video.eligibility.${verdict.reasonKey}`, {
            defaultValue: verdict.reason ?? "",
          })
        : verdict.reason,
  };
}
