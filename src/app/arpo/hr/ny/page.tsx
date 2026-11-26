import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTeamUser } from "@/lib/auth";
import { isHrAdmin } from "@/lib/hr-access";
import { TEAM_ROLES, TEAM_ROLE_NAMES } from "@/lib/team-roles";
import { NewEmployeeWizard } from "./wizard";

/** HR → Ny medarbejder: the steps (lib/actions/hr.ts createEmployee checks it all again). Only an admin. */
export default async function NewEmployeePage() {
  const user = await getTeamUser();
  if (!user) redirect("/api/auth/session-ended?next=/arpo/hr/ny");
  if (!isHrAdmin(user)) redirect("/arpo/mig");
  const users = await prisma.user.findMany({ where: { disabledAt: null }, select: { id: true, name: true, lastName: true, employee: { select: { id: true } } }, orderBy: { name: "asc" } });
  const full = (u: { name: string; lastName: string | null }) => `${u.name}${u.lastName ? ` ${u.lastName}` : ""}`;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link href="/arpo/hr" className="text-sm text-slate-500 hover:text-slate-800">
        ‹ HR
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">Ny medarbejder</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <NewEmployeeWizard
          roles={TEAM_ROLES.filter((r) => r !== "ADMIN").map((r) => ({ v: r, l: TEAM_ROLE_NAMES[r] }))}
          existing={users.filter((u) => !u.employee).map((u) => ({ id: u.id, name: full(u) }))}
          leaders={users.map((u) => ({ id: u.id, name: full(u) }))}
        />
      </div>
    </div>
  );
}
