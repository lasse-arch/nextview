"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertGoal, deleteGoal } from "@/lib/actions/goals";
import { goalMetricLabels, goalMetricIsMoney, type GoalWithProgress } from "@/lib/goals-data";
import { formatDKK } from "@/lib/labels";
import { useToast } from "@/components/toast";
import type { GoalMetric } from "@prisma/client";

const METRICS = Object.keys(goalMetricLabels) as GoalMetric[];
const COMPANY_VALUE = "COMPANY";

export function GoalsCard({
  goals,
  isAdmin,
  currentUserId,
  users,
}: {
  goals: GoalWithProgress[];
  isAdmin: boolean;
  currentUserId: string;
  users: { id: string; name: string }[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [targetUserId, setTargetUserId] = useState(isAdmin ? COMPANY_VALUE : currentUserId);
  const [metric, setMetric] = useState<GoalMetric>(METRICS[0]);
  const [targetValue, setTargetValue] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const showToast = useToast();

  function formatValue(m: GoalMetric, v: number) {
    return goalMetricIsMoney[m] ? formatDKK(v) : String(v);
  }

  function submit() {
    if (!targetValue) return;
    const userId = targetUserId === COMPANY_VALUE ? null : targetUserId;
    startTransition(async () => {
      try {
        await upsertGoal(userId, metric, targetValue);
        showToast("Mål gemt");
        setShowForm(false);
        setTargetValue("");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke gemme målet.");
      }
    });
  }

  function remove(goalId: string) {
    startTransition(async () => {
      try {
        await deleteGoal(goalId);
        showToast("Mål slettet");
        router.refresh();
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Kunne ikke slette målet.");
      }
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Mål denne måned</h2>
        <button type="button" onClick={() => setShowForm((s) => !s)} className="text-xs font-medium text-blue-600 hover:underline">
          {showForm ? "Annullér" : "+ Sæt mål"}
        </button>
      </div>

      {showForm && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {isAdmin && (
            <select
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option value={COMPANY_VALUE}>Hele virksomheden</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === currentUserId ? `${u.name} (mig)` : u.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as GoalMetric)}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
          >
            {METRICS.map((m) => (
              <option key={m} value={m}>
                {goalMetricLabels[m]}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              step="1"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder={goalMetricIsMoney[metric] ? "Mål (kr.)" : "Mål (antal)"}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={submit}
              disabled={pending || !targetValue}
              className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Gem
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {goals.map((g) => {
          const pct = g.targetValue > 0 ? Math.min(100, (g.currentValue / g.targetValue) * 100) : 0;
          return (
            <div key={g.id}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">
                  <span className="font-medium">{g.userName ?? "Hele virksomheden"}</span>
                  <span className="ml-1.5 text-slate-400">{goalMetricLabels[g.metric]}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`font-medium text-slate-600 ${goalMetricIsMoney[g.metric] ? "money" : ""}`}>
                    {formatValue(g.metric, g.currentValue)} / {formatValue(g.metric, g.targetValue)}
                  </span>
                  {g.canEdit && (
                    <button
                      type="button"
                      onClick={() => remove(g.id)}
                      className="text-slate-300 hover:text-red-600"
                      title="Slet mål"
                    >
                      ×
                    </button>
                  )}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                <div
                  className={`h-1.5 rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-blue-500"}`}
                  style={{ width: `${Math.max(pct > 0 ? 3 : 0, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
        {goals.length === 0 && !showForm && <p className="text-xs text-slate-400">Ingen mål sat for denne måned endnu.</p>}
      </div>
    </div>
  );
}
