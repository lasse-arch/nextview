import { prisma } from "@/lib/db";
import { TEMPLATE_PLACEHOLDER_HELP } from "@/lib/email-templates";
import { EmailTemplateList } from "./email-template-list";

export default async function EmailTemplatesPage() {
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { name: "asc" },
    include: { createdBy: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">E-mail-skabeloner</h1>
        <p className="mt-1 text-sm text-slate-500">
          Delte skabeloner alle kan bruge, når de sender en e-mail fra en deal. Brug{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{TEMPLATE_PLACEHOLDER_HELP}</code> i emne
          eller indhold, så udfyldes de automatisk ved afsendelse.
        </p>
      </div>

      <EmailTemplateList
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          subject: t.subject,
          bodyHtml: t.bodyHtml,
          createdByName: t.createdBy.name,
        }))}
      />
    </div>
  );
}
