/**
 * View type for the agenda block.
 */
export type AgendaViewType = "list" | "timeline";

/**
 * Options for the fc-agenda code block.
 */
export interface AgendaOptions {
    /** Date to show agenda for - YYYY-MM-DD format or "auto" to infer from daily note filename */
    date: string;
    /** Number of days to show (default: 1) */
    days: number;
    /** Calendar names to filter by (null = show all calendars) */
    calendars: string[] | null;
    /** View type: "list" (default) or "timeline" */
    view: AgendaViewType;
}

/**
 * Parse the source content of an fc-agenda code block into AgendaOptions.
 *
 * Example source:
 * ```
 * date: auto
 * days: 3
 * calendars: Work, Personal
 * ```
 *
 * @param source The raw source content of the code block
 * @returns Parsed AgendaOptions
 */
export function parseAgendaOptions(source: string): AgendaOptions {
    const lines = source.trim().split("\n");
    const options: AgendaOptions = {
        date: "auto",
        days: 1,
        calendars: null,
        view: "list",
    };

    for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim().toLowerCase();
        const value = line.slice(colonIndex + 1).trim();

        switch (key) {
            case "date":
                options.date = value || "auto";
                break;
            case "days":
                const parsed = parseInt(value, 10);
                if (!isNaN(parsed) && parsed > 0) {
                    options.days = parsed;
                }
                break;
            case "calendars":
                if (value) {
                    options.calendars = value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean);
                }
                break;
            case "view":
                if (value === "timeline" || value === "list") {
                    options.view = value;
                }
                break;
        }
    }

    return options;
}
