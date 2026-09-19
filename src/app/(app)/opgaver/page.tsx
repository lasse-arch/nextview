import { prisma } from "@/lib/db";
import { dealName } from "@/lib/labels";
import { TaskBoard } from "./task-board";

export default async function TasksPage() {
  const [tasks, users, deals] = await Promise.all([
    prisma.task.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.deal.findMany({ orderBy: { companyName: "asc" }, select: { id: true, companyName: true, displayName: true } }),
  ]);

  const boardTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    done: t.done,
    dueDate: t.dueDate,
    assigneeId: t.assigneeId,
    dealId: t.dealId,
  }));

  const boardUsers = users.map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }));
  const boardDeals = deals.map((d) => ({ id: d.id, name: dealName(d) }));

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Opgaver</h1>
        <p className="mt-1 text-sm text-slate-500">
          Opgaver pr. person eller pr. deal - træk et kort mellem kolonner for at omfordele det (kun i
          personvisning).
        </p>
      </div>

      <div className="mt-6">
        <TaskBoard initialTasks={boardTasks} users={boardUsers} deals={boardDeals} />
      </div>
    </div>
  );
}
