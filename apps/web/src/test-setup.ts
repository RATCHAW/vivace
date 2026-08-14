/**
 * Importing this initialises i18next on the global instance, which is what
 * every `useTranslation()` in the tree resolves against — so a component test
 * can render a screen without wrapping it in a provider.
 *
 * Tests run against English: the detector finds no `?lang=`, no localStorage
 * entry and jsdom's `navigator.language` (`en-US`), so it settles on `en`. A
 * test that wants French calls `i18n.changeLanguage("fr")` itself.
 */
import "@/i18n";
