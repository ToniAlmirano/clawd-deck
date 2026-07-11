import streamDeck from "@elgato/streamdeck";

/**
 * Translate a UI string.
 *
 * Keys ARE the English text. The Stream Deck i18n provider returns the key
 * verbatim when no translation exists, so English is the natural default and a
 * missing locale degrades gracefully instead of showing a cryptic key.
 *
 * Translations live in `<language>.json` next to the manifest, under a
 * "Localization" object (see `es.json`). The active language follows the Stream
 * Deck application's language, so users get their own language for free.
 */
export function t(key: string): string {
  try {
    return streamDeck.i18n.t(key);
  } catch {
    // i18n not ready yet (e.g. before connect) — fall back to English.
    return key;
  }
}
