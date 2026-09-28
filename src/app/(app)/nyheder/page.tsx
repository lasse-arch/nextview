import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { markNewsRead } from "@/lib/actions/news";
import { formatDateTime } from "@/lib/labels";
import { NewsPostForm } from "./news-post-form";
import { DeleteNewsButton } from "./delete-news-button";

export default async function NewsPage() {
  const user = await requireUser();

  const posts = await prisma.newsPost.findMany({
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });

  // Mark caught-up as soon as the page is opened, so the header badge clears.
  await markNewsRead();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Nyheder</h1>
        <p className="mt-1 text-sm text-slate-500">
          Nye funktioner i Nextview360, og hvordan de bruges - i stedet for at skulle spørge sig frem.
        </p>
      </div>

      {user.role === "ADMIN" && <NewsPostForm />}

      <div className="space-y-5">
        {posts.map((post) => (
          <article key={post.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{post.title}</h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  {post.createdBy.name} · {formatDateTime(post.createdAt)}
                </p>
              </div>
              {user.role === "ADMIN" && <DeleteNewsButton postId={post.id} />}
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{post.body}</p>
            {post.screenshotUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.screenshotUrl}
                alt={post.title}
                className="mt-3 w-full rounded-lg border border-slate-200"
              />
            )}
          </article>
        ))}
        {posts.length === 0 && <p className="text-sm text-slate-400">Ingen nyheder endnu.</p>}
      </div>
    </div>
  );
}
