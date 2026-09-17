import { creativeDocumentSchema, type CreativeDocument } from "./document";

/**
 * Crash backup for the editor.
 *
 * The server is the source of truth; this is only the safety net for edits made
 * between autosaves (tab closed, browser killed, network down). A backup is
 * kept only while it is *ahead* of the last saved revision, and dropped the
 * moment the server catches up.
 */
const backupKey = (documentId: string) =>
  `stencil.studio.backup.${documentId}`;

export function writeCreativeBackup(
  documentId: string,
  document: CreativeDocument,
) {
  try {
    localStorage.setItem(backupKey(documentId), JSON.stringify(document));
  } catch {
    // A full quota shouldn't break editing — the server save still runs.
  }
}

export function readCreativeBackup(
  documentId: string,
): CreativeDocument | null {
  try {
    const stored = localStorage.getItem(backupKey(documentId));
    if (!stored) return null;
    const parsed = creativeDocumentSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearCreativeBackup(documentId: string) {
  try {
    localStorage.removeItem(backupKey(documentId));
  } catch {
    // Nothing to recover from if storage is unavailable.
  }
}
