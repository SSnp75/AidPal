"use client";

import { useState, useTransition } from "react";
import { updateTaskStatus } from "@/app/events/actions";
import type { TaskStatus } from "@/types/db";

interface Props {
  taskId: string;
  initialStatus: TaskStatus;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

const selectClass =
  "rounded-lg border border-border bg-card px-2 py-1 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * Manager-only optimistic status select. Flips immediately and reverts on
 * error (modeled on BookmarkButton's optimistic pattern).
 */
export default function TaskStatusControl({ taskId, initialStatus }: Props) {
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as TaskStatus;
    const prev = status;
    // Optimistic flip.
    setStatus(next);

    startTransition(async () => {
      const r = await updateTaskStatus({ taskId, status: next });
      if (!r.ok) {
        setStatus(prev);
      }
    });
  }

  return (
    <label className="inline-flex items-center gap-1">
      <span className="sr-only">Task status</span>
      <select
        value={status}
        onChange={onChange}
        disabled={isPending}
        aria-label="Task status"
        className={selectClass}
      >
        {(Object.keys(STATUS_LABELS) as TaskStatus[]).map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
