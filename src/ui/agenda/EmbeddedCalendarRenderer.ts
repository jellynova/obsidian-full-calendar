import { App, Notice } from "obsidian";
import { Calendar, EventSourceInput } from "@fullcalendar/core";
import { DateTime } from "luxon";
import EventCache from "../../core/EventCache";
import { EditableCalendar } from "../../calendars/EditableCalendar";
import { openFileForEvent, openOrCreateMeetingNote } from "../actions";
import { renderCalendar } from "../calendar";
import { toEventInput } from "../interop";
import { AgendaOptions } from "./parseAgendaOptions";
import { resolveAgendaDate } from "./resolveDate";
import { FullCalendarSettings } from "../settings";

/**
 * Renders an embedded FullCalendar view within a code block.
 * This uses the same calendar rendering as the sidebar/main view.
 */
export class EmbeddedCalendarRenderer {
    private container: HTMLElement;
    private cache: EventCache;
    private app: App;
    private options: AgendaOptions;
    private sourcePath: string;
    private settings: FullCalendarSettings;
    private calendar: Calendar | null = null;

    constructor(
        container: HTMLElement,
        cache: EventCache,
        app: App,
        options: AgendaOptions,
        sourcePath: string,
        settings: FullCalendarSettings
    ) {
        this.container = container;
        this.cache = cache;
        this.app = app;
        this.options = options;
        this.sourcePath = sourcePath;
        this.settings = settings;
    }

    /**
     * Get calendar colors based on theme.
     */
    private getCalendarColors(color: string | null | undefined): {
        color: string;
        textColor: string;
    } {
        let textVar = getComputedStyle(document.body).getPropertyValue(
            "--text-on-accent"
        );
        if (color) {
            const m = color
                .slice(1)
                .match(color.length == 7 ? /(\S{2})/g : /(\S{1})/g);
            if (m) {
                const r = parseInt(m[0], 16),
                    g = parseInt(m[1], 16),
                    b = parseInt(m[2], 16);
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                if (brightness > 150) {
                    textVar = "black";
                }
            }
        }

        return {
            color:
                color ||
                getComputedStyle(document.body).getPropertyValue(
                    "--interactive-accent"
                ),
            textColor: textVar,
        };
    }

    /**
     * Translate event sources for FullCalendar.
     */
    private translateSources(): EventSourceInput[] {
        return this.cache.getAllEvents().map(
            ({ events, editable, color, id }): EventSourceInput => ({
                id,
                events: events.flatMap(
                    (e) => toEventInput(e.id, e.event) || []
                ),
                editable,
                ...this.getCalendarColors(color),
            })
        );
    }

    /**
     * Render the embedded calendar.
     */
    render(): void {
        // Destroy previous calendar if exists
        if (this.calendar) {
            this.calendar.destroy();
            this.calendar = null;
        }

        this.container.empty();
        this.container.addClass("fc-embedded-container");

        // Create calendar container with fixed height and simplified styling
        const calendarEl = this.container.createDiv({
            cls: "fc-embedded-calendar fc-embedded-simple",
        });

        // Resolve the initial date
        const initialDate = resolveAgendaDate(
            this.options.date,
            this.sourcePath,
            this.app
        );

        const sources = this.translateSources();

        // Build work hours config if set
        const workHoursConfig: {
            slotMinTime?: string;
            slotMaxTime?: string;
        } = {};
        if (this.settings.agendaWorkHoursStart) {
            workHoursConfig.slotMinTime = this.settings.agendaWorkHoursStart;
        }
        if (this.settings.agendaWorkHoursEnd) {
            workHoursConfig.slotMaxTime = this.settings.agendaWorkHoursEnd;
        }

        this.calendar = renderCalendar(calendarEl, sources, {
            forceNarrow: true, // Use narrow/sidebar style
            initialView: {
                desktop: "timeGridDay",
                mobile: "timeGridDay",
            },
            firstDay: this.settings.firstDay,
            timeFormat24h: this.settings.timeFormat24h,
            ...workHoursConfig,
            eventClick: async (info) => {
                try {
                    const isEditable = this.cache.isEventEditable(
                        info.event.id
                    );

                    if (isEditable) {
                        await openFileForEvent(
                            this.cache,
                            this.app,
                            info.event.id
                        );
                    } else {
                        await openOrCreateMeetingNote(
                            this.app,
                            this.cache,
                            info.event.id,
                            this.settings.meetingNotesFolder,
                            info.event.start || undefined,
                            this.settings.meetingNoteTemplate
                        );
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        console.warn(e);
                        new Notice(e.message);
                    }
                }
            },
        });

        // Go to the specified date
        this.calendar.gotoDate(initialDate);
    }

    /**
     * Destroy the calendar instance.
     */
    destroy(): void {
        if (this.calendar) {
            this.calendar.destroy();
            this.calendar = null;
        }
    }
}
