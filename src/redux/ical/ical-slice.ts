import {
  createAction,
  createSelector,
  type PayloadAction,
} from "@reduxjs/toolkit";
import ical from "node-ical";

import type { IcalConfig } from "../../settings";
import type { RemoteTask } from "../../task-types";
import type { WithIcalConfig } from "../../types";
import { createAppSlice } from "../create-app-slice";

export type RawIcal = { icalConfig: IcalConfig; text: string };
export type SerializedRemoteTask = Omit<RemoteTask, "startTime"> & {
  startTime: string;
};

export interface IcalState {
  icalEvents: Array<WithIcalConfig<ical.VEvent>>;
  plainTextIcals: Array<RawIcal>;
  serializedRemoteTasks: Array<SerializedRemoteTask>;
}

export function isVEvent(event: ical.CalendarComponent): event is ical.VEvent {
  return event.type === "VEVENT";
}

export const initialIcalState: IcalState = {
  icalEvents: [],
  plainTextIcals: [],
  serializedRemoteTasks: [],
};

export const icalSlice = createAppSlice({
  name: "ical",
  initialState: initialIcalState,
  reducers: (create) => ({
    icalsFetched: create.reducer(
      (state, action: PayloadAction<Array<RawIcal>>) => {
        state.plainTextIcals = action.payload;
      },
    ),
    remoteTasksUpdated: create.reducer(
      (state, action: PayloadAction<Array<SerializedRemoteTask>>) => {
        state.serializedRemoteTasks = action.payload;
      },
    ),
  }),
  selectors: {
    selectSerializedRemoteTasks: (state) => state.serializedRemoteTasks,
    selectPlainTextIcals: (state) => state.plainTextIcals,
  },
});

export const icalRefreshRequested = createAction("ical/icalRefreshRequested");

export const { remoteTasksUpdated, icalsFetched } = icalSlice.actions;
export const { selectPlainTextIcals } = icalSlice.selectors;
const { selectSerializedRemoteTasks } = icalSlice.selectors;

export const selectAllIcalEventsWithIcalConfigs = createSelector(
  selectPlainTextIcals,
  (rawIcals) =>
    rawIcals.flatMap(
      ({ icalConfig, text }): Array<WithIcalConfig<ical.VEvent>> => {
        let parsed: Record<string, unknown>;
        try {
          parsed = ical.parseICS(text);
        } catch (error) {
          console.error("Error parsing ICS:", error);
          return [];
        }

        const events: ical.VEvent[] = [];
        const stack = Object.values(parsed);

        while (stack.length > 0) {
          const item = stack.pop();
          if (!item || typeof item !== "object") continue;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (isVEvent(item as any)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            events.push(item as any);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } else if ((item as any).type === "VCALENDAR") {
            Object.values(item).forEach((child) => {
              if (typeof child === "object" && child !== null) {
                stack.push(child);
              }
            });
          }
        }

        return events.map((icalEvent) => ({
          ...icalEvent,
          calendar: icalConfig,
        }));
      },
    ),
);

export const selectRemoteTasks = createSelector(
  selectSerializedRemoteTasks,
  (serializedRemoteTasks) =>
    serializedRemoteTasks.map((it) => ({
      ...it,
      startTime: window.moment(it.startTime),
    })),
);
