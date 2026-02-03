import { App } from "obsidian";
import { DateTime } from "luxon";
import EventCache from "../../core/EventCache";
import { Calendar } from "../../calendars/Calendar";
import { EditableCalendar } from "../../calendars/EditableCalendar";
import { OFCEvent } from "../../types";
import { openFileForEvent, openOrCreateMeetingNote } from "../actions";
import { AgendaOptions } from "./parseAgendaOptions";
import {
    resolveAgendaDate,
    addDays,
    formatDateForDisplay,
} from "./resolveDate";
import { FullCalendarSettings } from "../settings";

interface EventInfo {
    event: OFCEvent;
    id: string;
    calendar: Calendar;
    occurrenceDate: string;
}

/**
 * Renders an agenda view for a date range within a code block.
 */
export class AgendaRenderer {
    private container: HTMLElement;
    private cache: EventCache;
    private app: App;
    private options: AgendaOptions;
    private sourcePath: string;
    private settings: FullCalendarSettings;

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
     * Render the agenda view.
     */
    render(): void {
        this.container.empty();
        this.container.addClass("fc-agenda-container");

        // Resolve the start date
        const startDate = resolveAgendaDate(
            this.options.date,
            this.sourcePath,
            this.app
        );
        const endDate = addDays(startDate, this.options.days - 1);

        // Get events for the date range
        const events = this.cache.getEventsForDateRange(
            startDate,
            endDate,
            this.options.calendars
        );

        if (events.length === 0) {
            this.renderEmpty();
            return;
        }

        // Group events by date
        const grouped = this.groupByDate(events);

        // Render each day
        for (const [date, dayEvents] of grouped) {
            this.renderDayHeader(date);
            for (const eventInfo of dayEvents) {
                this.renderEvent(eventInfo);
            }
        }
    }

    /**
     * Group events by their occurrence date.
     */
    private groupByDate(events: EventInfo[]): Map<string, EventInfo[]> {
        const grouped = new Map<string, EventInfo[]>();

        for (const event of events) {
            const date = event.occurrenceDate;
            if (!grouped.has(date)) {
                grouped.set(date, []);
            }
            grouped.get(date)!.push(event);
        }

        return grouped;
    }

    /**
     * Render a day header.
     */
    private renderDayHeader(date: string): void {
        const header = this.container.createDiv({
            cls: "fc-agenda-day-header",
        });
        header.textContent = formatDateForDisplay(date);
    }

    /**
     * Render a single event.
     */
    private renderEvent(eventInfo: EventInfo): void {
        const eventEl = this.container.createDiv({ cls: "fc-agenda-event" });

        // Calendar color indicator
        const colorEl = eventEl.createSpan({ cls: "fc-agenda-calendar-dot" });
        colorEl.style.backgroundColor = eventInfo.calendar.color || "#3788d8";

        // Time
        const timeEl = eventEl.createSpan({ cls: "fc-agenda-time" });
        if (!eventInfo.event.allDay && eventInfo.event.startTime) {
            timeEl.textContent = this.formatTimeRange(
                eventInfo.event.startTime,
                eventInfo.event.endTime
            );
        } else {
            timeEl.textContent = "All day";
            timeEl.addClass("fc-agenda-allday");
        }

        // Title
        const titleEl = eventEl.createSpan({ cls: "fc-agenda-title" });
        titleEl.textContent = eventInfo.event.title;

        // Calendar name badge
        const calendarEl = eventEl.createSpan({
            cls: "fc-agenda-calendar-name",
        });
        calendarEl.textContent = eventInfo.calendar.name;

        // Click handler
        eventEl.addEventListener("click", () =>
            this.handleEventClick(eventInfo)
        );
    }

    /**
     * Format a time range for display.
     */
    private formatTimeRange(
        startTime: string,
        endTime?: string | null
    ): string {
        const formatTime = (time: string): string => {
            // Parse various time formats and output in a readable format
            let parsed = DateTime.fromFormat(time, "HH:mm");
            if (!parsed.isValid) {
                parsed = DateTime.fromFormat(time, "HH:mm:ss");
            }
            if (!parsed.isValid) {
                parsed = DateTime.fromFormat(time, "h:mm a");
            }
            if (!parsed.isValid) {
                return time; // Return as-is if we can't parse
            }
            return parsed.toFormat("h:mm a");
        };

        const start = formatTime(startTime);
        if (endTime) {
            const end = formatTime(endTime);
            return `${start} - ${end}`;
        }
        return start;
    }

    /**
     * Handle click on an event.
     */
    private async handleEventClick(eventInfo: EventInfo): Promise<void> {
        const isEditable = eventInfo.calendar instanceof EditableCalendar;

        if (isEditable) {
            // Open source note for editable events
            try {
                await openFileForEvent(this.cache, this.app, eventInfo.id);
            } catch (e) {
                console.error("FC Agenda: Error opening file for event", e);
            }
        } else {
            // Create/open meeting note for non-editable events
            try {
                const occurrenceDate = DateTime.fromISO(
                    eventInfo.occurrenceDate
                ).toJSDate();
                await openOrCreateMeetingNote(
                    this.app,
                    this.cache,
                    eventInfo.id,
                    this.settings.meetingNotesFolder,
                    occurrenceDate,
                    this.settings.meetingNoteTemplate
                );
            } catch (e) {
                console.error("FC Agenda: Error creating meeting note", e);
            }
        }
    }

    /**
     * Render empty state when no events.
     */
    private renderEmpty(): void {
        const emptyEl = this.container.createDiv({ cls: "fc-agenda-empty" });
        emptyEl.textContent = "No events scheduled";
    }
}
