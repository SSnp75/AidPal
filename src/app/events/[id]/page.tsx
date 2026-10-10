import Link from "next/link";
import { notFound } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import SupabaseNotConfigured from "@/components/SupabaseNotConfigured";
import ScopeBadge from "@/components/ScopeBadge";
import VolunteerButton from "@/components/VolunteerButton";
import TaskStatusControl from "@/components/TaskStatusControl";
import { addTask, assignTask, deleteTask } from "@/app/events/actions";
import type { Event, EventTask, TaskStatus, Profile } from "@/types/db";

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

const inputClass =
  "rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const btnClass =
  "rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const subtleBtnClass =
  "rounded-lg border border-border bg-side-card px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <SupabaseNotConfigured />
      </div>
    );
  }

  const { id } = await params;
  const supabase = await createClient();

  // RLS gates the read: an event not readable by the viewer returns null.
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single<Event>();

  if (!event) notFound();

  const { data: canManageData } = await supabase.rpc("can_manage_event", {
    eid: id,
  });
  const canManage = Boolean(canManageData);

  const [tasksRes, volunteersRes] = await Promise.all([
    supabase
      .from("event_tasks")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: true })
      .returns<EventTask[]>(),
    supabase
      .from("event_volunteers")
      .select("user_id")
      .eq("event_id", id)
      .returns<{ user_id: string }[]>(),
  ]);

  const tasks = tasksRes.data ?? [];
  const volunteers = volunteersRes.data ?? [];

  // Batch display names for creator, assignees, and volunteers.
  const profileIds = Array.from(
    new Set(
      [
        event.creator_id,
        ...tasks.map((t) => t.assignee_id).filter((x): x is string => !!x),
        ...volunteers.map((v) => v.user_id),
      ].filter(Boolean)
    )
  );

  const { data: profiles } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", profileIds)
        .returns<Pick<Profile, "id" | "display_name">[]>()
    : { data: [] as Pick<Profile, "id" | "display_name">[] };

  const names = new Map<string, string>();
  for (const p of profiles ?? []) names.set(p.id, p.display_name);

  // Group the task board by status.
  const tasksByStatus = new Map<TaskStatus, EventTask[]>();
  for (const s of STATUS_ORDER) tasksByStatus.set(s, []);
  for (const t of tasks) tasksByStatus.get(t.status)?.push(t);

  // Candidate assignees for the per-task dropdown = creator + volunteers.
  const assigneeCandidates = Array.from(
    new Set([event.creator_id, ...volunteers.map((v) => v.user_id)])
  );

  // Determine if the viewer is a volunteer (for the toggle's initial state).
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const initialVolunteering = viewer
    ? volunteers.some((v) => v.user_id === viewer.id)
    : false;

  // ── Server actions for the plain form/button controls (manager-gated by RLS) ──
  async function addTaskAction(formData: FormData) {
    "use server";
    const title = formData.get("title");
    const assigneeId = formData.get("assigneeId");
    await addTask({
      eventId: id,
      title: typeof title === "string" ? title : "",
      assigneeId:
        typeof assigneeId === "string" && assigneeId !== "" ? assigneeId : null,
    });
  }

  async function assignTaskAction(formData: FormData) {
    "use server";
    const taskId = formData.get("taskId");
    const assigneeId = formData.get("assigneeId");
    if (typeof taskId !== "string") return;
    await assignTask({
      taskId,
      assigneeId:
        typeof assigneeId === "string" && assigneeId !== "" ? assigneeId : null,
    });
  }

  async function deleteTaskAction(formData: FormData) {
    "use server";
    const taskId = formData.get("taskId");
    if (typeof taskId !== "string") return;
    await deleteTask({ taskId });
  }

  function fmt(iso: string | null): string | null {
    return iso ? new Date(iso).toLocaleString() : null;
  }

  const startsLabel = fmt(event.starts_at);
  const endsLabel = fmt(event.ends_at);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* Header */}
      <header className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold text-text-primary">
            {event.title}
          </h1>
          <ScopeBadge scope={event.scope} />
        </div>
        {event.description && (
          <p className="mt-2 whitespace-pre-wrap text-text-secondary">
            {event.description}
          </p>
        )}
        <dl className="mt-3 space-y-1 text-sm text-text-secondary">
          {event.location && (
            <div>
              <dt className="inline font-medium text-text-primary">
                Location:{" "}
              </dt>
              <dd className="inline">{event.location}</dd>
            </div>
          )}
          {startsLabel && (
            <div>
              <dt className="inline font-medium text-text-primary">
                Starts:{" "}
              </dt>
              <dd className="inline">{startsLabel}</dd>
            </div>
          )}
          {endsLabel && (
            <div>
              <dt className="inline font-medium text-text-primary">Ends: </dt>
              <dd className="inline">{endsLabel}</dd>
            </div>
          )}
          <div>
            <dt className="inline font-medium text-text-primary">
              Organizer:{" "}
            </dt>
            <dd className="inline">
              {names.get(event.creator_id) ?? "Someone"}
            </dd>
          </div>
        </dl>
        {event.group_id && (
          <p className="mt-2 text-sm text-text-secondary">
            In{" "}
            <Link
              href={`/groups/${event.group_id}`}
              className="underline underline-offset-2 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              the group
            </Link>
          </p>
        )}
      </header>

      {/* Volunteer */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-text-primary">
            Volunteers
          </h2>
          <VolunteerButton
            eventId={event.id}
            initialVolunteering={initialVolunteering}
          />
        </div>
        {volunteers.length === 0 ? (
          <p className="mt-3 text-sm text-text-secondary">No volunteers yet.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {volunteers.map((v) => (
              <li
                key={v.user_id}
                className="rounded-full border border-border bg-side-card px-2.5 py-0.5 text-xs text-text-secondary"
              >
                {names.get(v.user_id) ?? "Someone"}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Task board */}
      <section className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-text-primary">
          Task board
        </h2>

        {canManage && (
          <form
            action={addTaskAction}
            className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex-1">
              <label htmlFor="new-task-title" className="sr-only">
                Task title
              </label>
              <input
                id="new-task-title"
                name="title"
                type="text"
                required
                maxLength={200}
                placeholder="Add a task…"
                className={`${inputClass} w-full`}
              />
            </div>
            <div>
              <label htmlFor="new-task-assignee" className="sr-only">
                Assignee
              </label>
              <select
                id="new-task-assignee"
                name="assigneeId"
                defaultValue=""
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {assigneeCandidates.map((uid) => (
                  <option key={uid} value={uid}>
                    {names.get(uid) ?? "Someone"}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={btnClass}>
              Add task
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STATUS_ORDER.map((status) => {
            const column = tasksByStatus.get(status) ?? [];
            return (
              <div
                key={status}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <h3 className="mb-3 text-sm font-semibold text-text-primary">
                  {STATUS_LABELS[status]}
                </h3>
                {column.length === 0 ? (
                  <p className="text-xs text-text-secondary">No tasks.</p>
                ) : (
                  <ul className="space-y-3">
                    {column.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-lg border border-border bg-side-card p-3"
                      >
                        <p className="text-sm text-text-primary">{t.title}</p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {t.assignee_id
                            ? names.get(t.assignee_id) ?? "Someone"
                            : "Unassigned"}
                        </p>

                        {canManage && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <TaskStatusControl
                              taskId={t.id}
                              initialStatus={t.status}
                            />
                            <form action={assignTaskAction}>
                              <input
                                type="hidden"
                                name="taskId"
                                value={t.id}
                              />
                              <label className="sr-only" htmlFor={`assign-${t.id}`}>
                                Assign task
                              </label>
                              <select
                                id={`assign-${t.id}`}
                                name="assigneeId"
                                defaultValue={t.assignee_id ?? ""}
                                className="rounded-lg border border-border bg-card px-2 py-1 text-xs text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                              >
                                <option value="">Unassigned</option>
                                {assigneeCandidates.map((uid) => (
                                  <option key={uid} value={uid}>
                                    {names.get(uid) ?? "Someone"}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className={`${subtleBtnClass} ml-1`}
                              >
                                Assign
                              </button>
                            </form>
                            <form action={deleteTaskAction}>
                              <input
                                type="hidden"
                                name="taskId"
                                value={t.id}
                              />
                              <button type="submit" className={subtleBtnClass}>
                                Delete
                              </button>
                            </form>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
