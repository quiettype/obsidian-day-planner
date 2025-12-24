import moment from "moment-timezone";
import { describe, it, expect } from "vitest";

import { icalEventToTask } from "../src/util/ical";

describe("timezone reproduction", () => {
  it("should handle timezone conversion correctly", () => {
    const dateInRrule = new Date("2025-12-27T20:00:00.000Z");

    const icalEvent = {
      start: dateInRrule,
      end: new Date("2025-12-27T21:00:00.000Z"),
      summary: "Support for Ruth",
      datetype: "date-time",
      rrule: {
        origOptions: {
          tzid: "Etc/UTC",
        },
      },
      calendar: {
        color: "red",
      },
    } as unknown as any;

    moment.tz.setDefault("Australia/Sydney");

    const task = icalEventToTask(icalEvent, dateInRrule);

    console.log("Task Start Time:", task.startTime.format());

    // 20:00 UTC = 07:00 Sydney (+1 day)
    expect(task.startTime.date()).toBe(28);
    expect(task.startTime.hour()).toBe(7);

    moment.tz.setDefault();
  });

  it("should handle DST correctly (London)", () => {
    // Event: 10:00 London.
    // Start: Jan 1st (GMT, UTC+0).
    // Occurrence: July 1st (BST, UTC+1).
    // Expected: 10:00 London time.
    // UTC: 09:00.

    // If rrule works correctly, it returns 09:00 UTC.
    const dateInRrule = new Date("2025-07-01T09:00:00.000Z");

    const icalEvent = {
      start: new Date("2025-01-01T10:00:00.000Z"), // 10:00 GMT
      end: new Date("2025-01-01T11:00:00.000Z"),
      summary: "London Meeting",
      datetype: "date-time",
      rrule: {
        origOptions: {
          tzid: "Europe/London",
        },
      },
      calendar: {
        color: "blue",
      },
    } as unknown as any;

    moment.tz.setDefault("Europe/London");

    const task = icalEventToTask(icalEvent, dateInRrule);

    console.log("London Task Start Time:", task.startTime.format());

    // Should be 10:00 London time (09:00 UTC)
    // Since test env is UTC+10, it shows 19:00.
    // We check UTC hour to be safe.
    expect(task.startTime.utc().hour()).toBe(9);

    moment.tz.setDefault();
  });
});
