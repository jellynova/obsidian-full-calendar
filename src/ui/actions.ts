import { App, MarkdownView, TFile, TFolder, Vault, Workspace } from "obsidian";
import EventCache from "src/core/EventCache";
import { DateTime } from "luxon";

/**
 * Open a file in the editor to a given event.
 * @param cache
 * @param param1 App
 * @param id event ID
 * @returns
 */
export async function openFileForEvent(
    cache: EventCache,
    { workspace, vault }: { workspace: Workspace; vault: Vault },
    id: string
) {
    const details = cache.getInfoForEditableEvent(id);
    if (!details) {
        throw new Error("Event does not have local representation.");
    }
    const {
        location: { path, lineNumber },
    } = details;
    let leaf = workspace.getMostRecentLeaf();
    const file = vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
        return;
    }
    if (!leaf) {
        return;
    }
    if (leaf.getViewState().pinned) {
        leaf = workspace.getLeaf("tab");
    }
    await leaf.openFile(file);
    if (lineNumber && leaf.view instanceof MarkdownView) {
        leaf.view.editor.setCursor({ line: lineNumber, ch: 0 });
    }
}

/**
 * Sanitize a string for use in a filename by removing invalid characters.
 * @param name The string to sanitize
 * @returns The sanitized string
 */
function sanitizeFilename(name: string): string {
    // Remove characters invalid in filenames: \ / : * ? " < > |
    return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

/**
 * Open or create a meeting note for an external calendar event.
 * The file will be named "[YYYY-MM-DD] [event title].md"
 * @param app Obsidian app instance
 * @param cache Event cache
 * @param eventId ID of the event
 * @param folder Folder to create meeting notes in (empty string for vault root)
 * @param occurrenceDate The specific occurrence date for recurring events
 */
export async function openOrCreateMeetingNote(
    app: App,
    cache: EventCache,
    eventId: string,
    folder: string,
    occurrenceDate?: Date
): Promise<void> {
    const event = cache.getEventById(eventId);
    if (!event) {
        throw new Error(`Event with ID ${eventId} not found.`);
    }

    // Get the date - use occurrence date for recurring events, otherwise use event.date
    let dateStr: string;
    if (occurrenceDate) {
        dateStr = DateTime.fromJSDate(occurrenceDate).toISODate();
    } else if (event.type === "single" || event.type === "rrule") {
        dateStr = event.type === "single" ? event.date : event.startDate;
    } else if (event.type === "recurring") {
        // For recurring events without a specific occurrence, use today's date
        dateStr = DateTime.now().toISODate();
    } else {
        dateStr = DateTime.now().toISODate();
    }

    const title = sanitizeFilename(event.title);
    const filename = `${dateStr} ${title}.md`;
    const fullPath = folder ? `${folder}/${filename}` : filename;

    // Check if folder exists and create it if necessary
    if (folder) {
        const folderExists = app.vault.getAbstractFileByPath(folder);
        if (!folderExists) {
            await app.vault.createFolder(folder);
        }
    }

    // Check if file already exists
    const existingFile = app.vault.getAbstractFileByPath(fullPath);

    if (existingFile instanceof TFile) {
        // File exists, open it
        let leaf = app.workspace.getMostRecentLeaf();
        if (!leaf) {
            leaf = app.workspace.getLeaf(true);
        }
        if (leaf.getViewState().pinned) {
            leaf = app.workspace.getLeaf("tab");
        }
        await leaf.openFile(existingFile);
    } else {
        // File doesn't exist, create it with just the title
        const content = `# ${event.title}\n`;
        const newFile = await app.vault.create(fullPath, content);

        let leaf = app.workspace.getMostRecentLeaf();
        if (!leaf) {
            leaf = app.workspace.getLeaf(true);
        }
        if (leaf.getViewState().pinned) {
            leaf = app.workspace.getLeaf("tab");
        }
        await leaf.openFile(newFile);
    }
}
