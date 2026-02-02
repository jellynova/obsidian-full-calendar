import { App } from "obsidian";
import { DateTime } from "luxon";
import { getDailyNoteSettings } from "obsidian-daily-notes-interface";

/**
 * Resolve the agenda date, handling "auto" detection from daily note filenames.
 *
 * @param dateOption The date option from AgendaOptions - either "auto" or a specific date
 * @param sourcePath The source file path where the agenda block is located
 * @param app Obsidian app instance
 * @returns The resolved date in YYYY-MM-DD format
 */
export function resolveAgendaDate(
    dateOption: string,
    sourcePath: string,
    app: App
): string {
    // If not "auto", return the date as-is (assuming it's already in YYYY-MM-DD format)
    if (dateOption !== "auto") {
        // Validate that it's a valid date format
        const parsed = DateTime.fromISO(dateOption);
        if (parsed.isValid) {
            return dateOption;
        }
        // If invalid, fall through to auto-detection
        console.warn(
            `FC Agenda: Invalid date format "${dateOption}", falling back to auto-detection`
        );
    }

    // Try to get the date from the daily note filename
    const filename = sourcePath.split("/").pop()?.replace(".md", "") || "";

    // Try to get daily notes settings and parse accordingly
    try {
        const dailyNoteSettings = getDailyNoteSettings();
        if (dailyNoteSettings && dailyNoteSettings.format) {
            const parsed = DateTime.fromFormat(
                filename,
                dailyNoteSettings.format
            );
            if (parsed.isValid) {
                return parsed.toISODate();
            }
        }
    } catch (e) {
        // Daily notes plugin might not be available
        console.debug("FC Agenda: Could not get daily note settings", e);
    }

    // Try common date patterns in filename
    const patterns: Array<{ regex: RegExp; format: string }> = [
        // YYYY-MM-DD (ISO format)
        { regex: /^(\d{4}-\d{2}-\d{2})/, format: "yyyy-MM-dd" },
        // YYYY_MM_DD (underscore separator)
        { regex: /^(\d{4}_\d{2}_\d{2})/, format: "yyyy_MM_dd" },
        // YYYYMMDD (no separator)
        { regex: /^(\d{8})/, format: "yyyyMMdd" },
        // DD-MM-YYYY
        { regex: /^(\d{2}-\d{2}-\d{4})/, format: "dd-MM-yyyy" },
        // MM-DD-YYYY
        { regex: /^(\d{2}-\d{2}-\d{4})/, format: "MM-dd-yyyy" },
    ];

    for (const { regex, format } of patterns) {
        const match = filename.match(regex);
        if (match) {
            const parsed = DateTime.fromFormat(match[1], format);
            if (parsed.isValid) {
                return parsed.toISODate();
            }
        }
    }

    // Ultimate fallback: today's date
    console.debug(
        `FC Agenda: Could not parse date from filename "${filename}", using today's date`
    );
    return DateTime.now().toISODate();
}

/**
 * Add days to a date string.
 *
 * @param dateStr Date in YYYY-MM-DD format
 * @param days Number of days to add
 * @returns New date in YYYY-MM-DD format
 */
export function addDays(dateStr: string, days: number): string {
    return DateTime.fromISO(dateStr).plus({ days }).toISODate();
}

/**
 * Format a date for display in the agenda header.
 *
 * @param dateStr Date in YYYY-MM-DD format
 * @returns Formatted date string (e.g., "Monday, January 15")
 */
export function formatDateForDisplay(dateStr: string): string {
    return DateTime.fromISO(dateStr).toFormat("cccc, LLLL d");
}
