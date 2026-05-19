import { request } from "obsidian";
import { CalendarInfo, OFCEvent } from "src/types";
import { EventResponse } from "./Calendar";
import RemoteCalendar from "./RemoteCalendar";
import { buildFindItemRequest, parseCalendarItems } from "./parsing/ews/soap";
import { DateTime } from "luxon";

export default class EWSCalendar extends RemoteCalendar {
    _name: string;
    url: string;
    username: string;
    password: string;
    events: OFCEvent[] = [];

    constructor(
        color: string,
        name: string,
        url: string,
        username: string,
        password: string
    ) {
        super(color);
        this._name = name;
        this.url = url;
        this.username = username;
        this.password = password;
    }

    get type(): CalendarInfo["type"] {
        return "ews";
    }

    get identifier(): string {
        return this.url;
    }

    get name(): string {
        return this._name;
    }

    async revalidate(): Promise<void> {
        const now = DateTime.now();
        const startDate = now.minus({ months: 6 }).toUTC().toISO()!;
        const endDate = now.plus({ months: 12 }).toUTC().toISO()!;

        const soapBody = buildFindItemRequest(startDate, endDate);
        const authHeader =
            "Basic " + window.btoa(`${this.username}:${this.password}`);

        const response = await request({
            url: this.url,
            method: "POST",
            headers: {
                "Content-Type": "text/xml; charset=utf-8",
                Authorization: authHeader,
                SOAPAction:
                    "http://schemas.microsoft.com/exchange/services/2006/messages/FindItem",
            },
            body: soapBody,
        });

        this.events = parseCalendarItems(response);
    }

    async getEvents(): Promise<EventResponse[]> {
        return this.events.map((e) => [e, null]);
    }
}
