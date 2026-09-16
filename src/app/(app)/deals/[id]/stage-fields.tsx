"use client";

import { useState } from "react";
import { stageLabels, stageOrder } from "@/lib/labels";

function toDateTimeInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export function StageFields({
  initialStage,
  meetingDateIso,
}: {
  initialStage: string;
  meetingDateIso: string | null;
}) {
  const [stage, setStage] = useState(initialStage);

  const meetingStageIndex = stageOrder.indexOf("MEETING_BOOKED");
  const currentStageIndex = stageOrder.indexOf(stage as (typeof stageOrder)[number]);
  const showMeetingDate = stage === "MEETING_BOOKED" || currentStageIndex > meetingStageIndex || Boolean(meetingDateIso);

  return (
    <>
      <div>
        <label className="block text-xs font-medium text-slate-500">Stadie</label>
        <select
          name="stage"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {Object.entries(stageLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {showMeetingDate && (
        <div>
          <label className="block text-xs font-medium text-slate-500">
            Mødedato {stage === "MEETING_BOOKED" && "*"}
          </label>
          <input
            name="meetingDate"
            type="datetime-local"
            required={stage === "MEETING_BOOKED"}
            defaultValue={toDateTimeInputValue(meetingDateIso)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      )}
    </>
  );
}
