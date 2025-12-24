import moment, { type Moment } from "moment";
import ical, { type AttendeePartStat } from "node-ical";

import { fallbackPartStat, icalDayKeyFormat } from "../constants";
import type { RemoteTask, WithTime } from "../task-types";
import type { WithIcalConfig } from "../types";

import { getId } from "./id";
import { liftToArray } from "./lift";
import * as m from "./moment";

const getMoment = (date: Date | Moment | string | number) => {
  // @ts-ignore
  if (typeof window !== "undefined" && window.moment) {
    // @ts-ignore
    return window.moment(date);
  }
  return moment(date);
};

export function canHappenAfter(icalEvent: ical.VEvent, date: Date) {
  if (!icalEvent.rrule) {
    return icalEvent.end > date;
  }

  return (
    !icalEvent.rrule.options.until || icalEvent.rrule.options.until >= date
  );
}

function hasRecurrenceOverrideForDate(icalEvent: ical.VEvent, date: Date) {
  if (!icalEvent.recurrences) {
    return false;
  }

  return Object.hasOwn(icalEvent.recurrences, getIcalDayKey(date));
}

function getIcalDayKey(date: Date) {
  return getMoment(date).format(icalDayKeyFormat);
}

function hasExceptionForDate(icalEvent: ical.VEvent, date: Date) {
  if (!icalEvent.exdate) {
    return false;
  }

  // NOTE: exdate contains floating dates, i.e. any UTC offset that's on them
  // must be ignored, and we should treat them as local time
  const asMoment = getMoment(date);
  const utcOffset = asMoment.utcOffset();
  const dateWithoutOffset = asMoment.clone().subtract(utcOffset, "minutes");

  return Object.values(icalEvent.exdate).some((exceptionDate) => {
    if (!(exceptionDate instanceof Date)) {
      throw new Error("Unexpected exdate format");
    }

    return getMoment(exceptionDate).isSame(dateWithoutOffset, "day");
  });
}

export function icalEventToTasksForRange(
  icalEvent: WithIcalConfig<ical.VEvent>,
  start: Moment,
  end: Moment,
) {
  if (!icalEvent.rrule) {
    return onceOffIcalEventToTaskForRange(icalEvent, start, end);
  }

  const tasksFromRecurrenceOverrides = Object.values(
    icalEvent?.recurrences || {},
  ).reduce<RemoteTask[]>((result, override) => {
    const task = onceOffIcalEventToTaskForRange(
      { ...override, calendar: icalEvent.calendar },
      start,
      end,
    );

    if (task) {
      result.push(task);
    }

    return result;
  }, []);

  try {
    if (typeof icalEvent.rrule.between !== "function") {
      throw new Error("Invalid rrule object");
    }

    const recurrences = icalEvent.rrule
      .between(
        start.toDate(),
        end.clone().add(1, "day").subtract(1, "ms").toDate(),
        true,
      ) // Note: this calculation is very slow
      .filter(
        (date) =>
          !hasRecurrenceOverrideForDate(icalEvent, date) &&
          !hasExceptionForDate(icalEvent, date),
      );

    const tasksFromRecurrences = recurrences.map((date) =>
      icalEventToTask(icalEvent, date),
    );

    return tasksFromRecurrences.concat(tasksFromRecurrenceOverrides);
  } catch (error) {
    console.error("Error processing recurring event:", error, icalEvent);
    return tasksFromRecurrenceOverrides;
  }
}

function onceOffIcalEventToTaskForRange(
  icalEvent: WithIcalConfig<ical.VEvent>,
  start: Moment,
  end: Moment,
) {
  const startOfRange = start.clone().startOf("day");
  const endOfRangeExclusive = end.clone().add(1, "day").startOf("day");

  const eventStart = getMoment(icalEvent.start);
  const eventEnd = getMoment(icalEvent.end);

  if (
    m.doesOverlapWithRange(
      { start: eventStart, end: eventEnd },
      { start: startOfRange, end: endOfRangeExclusive },
    )
  ) {
    return icalEventToTask(icalEvent, icalEvent.start);
  }
}

export function icalEventToTask(
  icalEvent: WithIcalConfig<ical.VEvent>,
  date: Date,
): RemoteTask | WithTime<RemoteTask> {
  const isAllDayEvent = icalEvent.datetype === "date";

  const startTimeAdjusted = isAllDayEvent
    ? getMoment(date).startOf("day")
    : getMoment(date);

  const rsvpStatus = getRsvpStatus(icalEvent, icalEvent.calendar.email);

  return {
    id: getId(),
    calendar: icalEvent.calendar,
    summary: icalEvent.summary || "(No title)",
    description: icalEvent.description,
    location: icalEvent.location,
    startTime: startTimeAdjusted,
    rsvpStatus,
    isAllDayEvent,
    durationMinutes:
      (icalEvent.end.getTime() - icalEvent.start.getTime()) / 1000 / 60,
  };
}

function getRsvpStatus(event: ical.VEvent, email?: string): AttendeePartStat {
  if (!email?.trim()) {
    return fallbackPartStat;
  }

  const attendeeWithMatchingEmail = liftToArray(event.attendee).find(
    (attendee) => typeof attendee !== "string" && attendee?.params.CN === email,
  );

  if (typeof attendeeWithMatchingEmail === "string") {
    throw new Error("Unexpected attendee format");
  }

  return attendeeWithMatchingEmail?.params.PARTSTAT || fallbackPartStat;
}
