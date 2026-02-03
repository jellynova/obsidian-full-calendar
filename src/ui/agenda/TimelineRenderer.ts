import { App } from "obsidian";
import { DateTime } from "luxon";
import EventCache from "../../core/EventCache";
import { Calendar } from "../../calendars/Calendar";
import { EditableCalendar } from "../../calendars/EditableCalendar";
import { OFCEvent } from "../../types";
import { openFileForEvent, openOrCreateMeetingNote } from "../actions";
import { AgendaOptions } from "./parseAgendaOptions";
import { resolveAgendaDate, formatDateForDisplay } from "./resolveDate";
import { FullCalendarSettings } from "../settings";

interface EventInfo {
    event: OFCEvent;
    id: string;
    calendar: Calendar;
    occurrenceDate: string;
}

/**
 * Renders a timeline/timetable view similar to FullCalendar's timeGrid.
 */
export class TimelineRenderer {
    private container: HTMLElement;
    private cache: EventCache;
    private app: App;
    private options: AgendaOptions;
    private sourcePath: string;
    private settings: FullCalendarSettings;

    // Timeline configuration
    private startHour = 6; // 6 AM
    private endHour = 20; // 8 PM
    private hourHeight = 50; // pixels per hour

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
     * Render the timeline view.
     */
    render(): void {
        this.container.empty();
        this.container.addClass("fc-timeline-container");

        // Resolve the date
        const date = resolveAgendaDate(
            this.options.date,
            this.sourcePath,
            this.app
        );

        // Get events for the date
        const events = this.cache.getEventsForDateRange(
            date,
            date,
            this.options.calendars
        );

        // Separate all-day and timed events
        const allDayEvents: EventInfo[] = [];
        const timedEvents: EventInfo[] = [];

        for (const eventInfo of events) {
            if (eventInfo.event.allDay) {
                allDayEvents.push(eventInfo);
            } else {
                timedEvents.push(eventInfo);
            }
        }

        // Render header with day name
        this.renderHeader(date);

        // Render all-day section if there are all-day events
        if (allDayEvents.length > 0) {
            this.renderAllDaySection(allDayEvents);
        }

        // Render the time grid
        this.renderTimeGrid(timedEvents, date);
    }

    /**
     * Render the day header.
     */
    private renderHeader(date: string): void {
        const header = this.container.createDiv({ cls: "fc-timeline-header" });
        const dayName = DateTime.fromISO(date).toFormat("cccc");
        header.textContent = dayName;
    }

    /**
     * Render the all-day events section.
     */
    private renderAllDaySection(events: EventInfo[]): void {
        const section = this.container.createDiv({
            cls: "fc-timeline-allday-section",
        });

        const label = section.createDiv({ cls: "fc-timeline-allday-label" });
        label.textContent = "all-day";

        const eventsContainer = section.createDiv({
            cls: "fc-timeline-allday-events",
        });

        for (const eventInfo of events) {
            const eventEl = eventsContainer.createDiv({
                cls: "fc-timeline-allday-event",
            });
            eventEl.style.backgroundColor =
                eventInfo.calendar.color || "#3788d8";
            eventEl.textContent = eventInfo.event.title;

            // Click handler
            eventEl.addEventListener("click", () =>
                this.handleEventClick(eventInfo)
            );
        }
    }

    /**
     * Render the time grid with hour slots and events.
     */
    private renderTimeGrid(events: EventInfo[], date: string): void {
        const grid = this.container.createDiv({ cls: "fc-timeline-grid" });

        // Calculate total height
        const totalHours = this.endHour - this.startHour;
        const gridHeight = totalHours * this.hourHeight;

        grid.style.height = `${gridHeight}px`;
        grid.style.position = "relative";

        // Render hour lines and labels
        for (let hour = this.startHour; hour <= this.endHour; hour++) {
            const hourRow = grid.createDiv({ cls: "fc-timeline-hour-row" });
            const top = (hour - this.startHour) * this.hourHeight;
            hourRow.style.top = `${top}px`;

            // Hour label
            const label = hourRow.createDiv({ cls: "fc-timeline-hour-label" });
            label.textContent = this.formatHour(hour);

            // Hour line
            hourRow.createDiv({ cls: "fc-timeline-hour-line" });
        }

        // Render "now" indicator if date is today
        const now = DateTime.now();
        const dateTime = DateTime.fromISO(date);
        if (dateTime.hasSame(now, "day")) {
            const currentHour = now.hour + now.minute / 60;
            if (currentHour >= this.startHour && currentHour <= this.endHour) {
                const nowIndicator = grid.createDiv({
                    cls: "fc-timeline-now-indicator",
                });
                const nowTop = (currentHour - this.startHour) * this.hourHeight;
                nowIndicator.style.top = `${nowTop}px`;

                // Add arrow marker
                const arrow = nowIndicator.createDiv({
                    cls: "fc-timeline-now-arrow",
                });
            }
        }

        // Render events
        const eventsContainer = grid.createDiv({
            cls: "fc-timeline-events-container",
        });

        for (const eventInfo of events) {
            this.renderTimedEvent(eventsContainer, eventInfo);
        }
    }

    /**
     * Render a timed event on the grid.
     */
    private renderTimedEvent(
        container: HTMLElement,
        eventInfo: EventInfo
    ): void {
        const event = eventInfo.event;

        // Get start time - only non-allDay events have startTime
        const eventStartTime =
            !event.allDay && "startTime" in event ? event.startTime : null;
        if (!eventStartTime) return;

        // Parse start time
        const startTime = this.parseTime(eventStartTime);
        if (startTime === null) return;

        // Get end time
        const eventEndTime =
            !event.allDay && "endTime" in event ? event.endTime : null;

        // Parse end time (default to 1 hour if not specified)
        let endTime = eventEndTime
            ? this.parseTime(eventEndTime)
            : startTime + 1;
        if (endTime === null) endTime = startTime + 1;

        // Clamp to visible range
        const visibleStart = Math.max(startTime, this.startHour);
        const visibleEnd = Math.min(endTime, this.endHour);

        // Skip if event is outside visible range
        if (visibleStart >= this.endHour || visibleEnd <= this.startHour) {
            return;
        }

        // Calculate position and height
        const top = (visibleStart - this.startHour) * this.hourHeight;
        const height = (visibleEnd - visibleStart) * this.hourHeight;

        // Create event element
        const eventEl = container.createDiv({ cls: "fc-timeline-event" });
        eventEl.style.top = `${top}px`;
        eventEl.style.height = `${Math.max(height, 20)}px`; // Minimum height of 20px
        eventEl.style.backgroundColor = eventInfo.calendar.color || "#3788d8";

        // Event title
        const titleEl = eventEl.createDiv({ cls: "fc-timeline-event-title" });
        titleEl.textContent = eventInfo.event.title;

        // Event time (for short events)
        if (height >= 30 && eventStartTime) {
            const timeEl = eventEl.createDiv({ cls: "fc-timeline-event-time" });
            timeEl.textContent = this.formatTimeRange(
                eventStartTime,
                eventEndTime
            );
        }

        // Click handler
        eventEl.addEventListener("click", () =>
            this.handleEventClick(eventInfo)
        );
    }

    /**
     * Parse a time string to decimal hours (e.g., "14:30" -> 14.5).
     */
    private parseTime(time: string): number | null {
        let parsed = DateTime.fromFormat(time, "HH:mm");
        if (!parsed.isValid) {
            parsed = DateTime.fromFormat(time, "HH:mm:ss");
        }
        if (!parsed.isValid) {
            parsed = DateTime.fromFormat(time, "h:mm a");
        }
        if (!parsed.isValid) {
            return null;
        }
        return parsed.hour + parsed.minute / 60;
    }

    /**
     * Format an hour for display (e.g., 14 -> "2pm").
     */
    private formatHour(hour: number): string {
        if (hour === 0 || hour === 24) return "12am";
        if (hour === 12) return "12pm";
        if (hour < 12) return `${hour}am`;
        return `${hour - 12}pm`;
    }

    /**
     * Format a time range for display.
     */
    private formatTimeRange(
        startTime: string,
        endTime?: string | null
    ): string {
        const formatTime = (time: string): string => {
            let parsed = DateTime.fromFormat(time, "HH:mm");
            if (!parsed.isValid) {
                parsed = DateTime.fromFormat(time, "HH:mm:ss");
            }
            if (!parsed.isValid) {
                parsed = DateTime.fromFormat(time, "h:mm a");
            }
            if (!parsed.isValid) {
                return time;
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
            try {
                await openFileForEvent(this.cache, this.app, eventInfo.id);
            } catch (e) {
                console.error("FC Timeline: Error opening file for event", e);
            }
        } else {
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
                console.error("FC Timeline: Error creating meeting note", e);
            }
        }
    }
}
