import { OFCEvent } from "../../../types";
import { DateTime } from "luxon";

const T_NS = "http://schemas.microsoft.com/exchange/services/2006/types";
const M_NS = "http://schemas.microsoft.com/exchange/services/2006/messages";

export function buildFindItemRequest(
    startDate: string,
    endDate: string
): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2007_SP1"/>
  </soap:Header>
  <soap:Body>
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>AllProperties</t:BaseShape>
      </m:ItemShape>
      <m:CalendarView MaxEntriesReturned="1000"
                      StartDate="${startDate}"
                      EndDate="${endDate}"/>
      <m:ParentFolderIds>
        <t:DistinguishedFolderId Id="calendar"/>
      </m:ParentFolderIds>
    </m:FindItem>
  </soap:Body>
</soap:Envelope>`;
}

function getText(
    parent: Element,
    localName: string,
    ns: string
): string | null {
    const el = parent.getElementsByTagNameNS(ns, localName)[0];
    return el ? el.textContent : null;
}

function parseISODate(dateStr: string): { date: string; time: string } {
    const dt = DateTime.fromISO(dateStr, { zone: "UTC" });
    return {
        date: dt.toISODate()!,
        time: dt.toFormat("HH:mm"),
    };
}

function calendarItemToEvent(item: Element): OFCEvent | null {
    const subject = getText(item, "Subject", T_NS);
    const startStr = getText(item, "Start", T_NS);
    const endStr = getText(item, "End", T_NS);
    const isAllDayStr = getText(item, "IsAllDayEvent", T_NS);
    const itemIdEl = item.getElementsByTagNameNS(T_NS, "ItemId")[0];

    if (!subject || !startStr || !endStr) {
        return null;
    }

    const isAllDay = isAllDayStr?.toLowerCase() === "true";
    const start = parseISODate(startStr);
    const end = parseISODate(endStr);
    const rawId = itemIdEl?.getAttribute("Id") || `${startStr}::${subject}`;
    const id = `ews::${rawId}`;
    const endDate = start.date !== end.date ? end.date : null;

    if (isAllDay) {
        return {
            type: "single",
            title: subject,
            id,
            date: start.date,
            endDate,
            allDay: true,
        };
    }

    return {
        type: "single",
        title: subject,
        id,
        date: start.date,
        endDate,
        allDay: false,
        startTime: start.time,
        endTime: end.time,
    };
}

export function parseCalendarItems(xml: string): OFCEvent[] {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");

    const fault = doc.getElementsByTagNameNS(
        "http://schemas.xmlsoap.org/soap/envelope/",
        "Fault"
    )[0];
    if (fault) {
        const msg = fault.getElementsByTagName("faultstring")[0]?.textContent;
        throw new Error(`EWS SOAP fault: ${msg || "Unknown error"}`);
    }

    const responseMsg = doc.getElementsByTagNameNS(
        M_NS,
        "FindItemResponseMessage"
    )[0];
    if (responseMsg?.getAttribute("ResponseClass") === "Error") {
        const code = responseMsg.getElementsByTagNameNS(M_NS, "ResponseCode")[0]
            ?.textContent;
        const text = responseMsg.getElementsByTagNameNS(M_NS, "MessageText")[0]
            ?.textContent;
        throw new Error(`EWS error ${code}: ${text}`);
    }

    const items = doc.getElementsByTagNameNS(T_NS, "CalendarItem");
    const events: OFCEvent[] = [];
    for (let i = 0; i < items.length; i++) {
        const event = calendarItemToEvent(items[i]);
        if (event) events.push(event);
    }
    return events;
}
