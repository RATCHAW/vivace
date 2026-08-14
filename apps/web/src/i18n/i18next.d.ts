/**
 * Type-safe translation keys.
 *
 * With this in place `t("coach.emptyTitle")` compiles and `t("coach.emptyTtile")`
 * does not, and a key removed from the catalogue is a build error at every call
 * site rather than a `coach.emptyTitle` string rendered to the athlete.
 */
import type { Messages } from "./messages/en";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: Messages;
    };
  }
}
