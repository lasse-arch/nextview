import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AvatarUploader } from "./avatar-uploader";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Min profil</h1>
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Profilbillede</h2>
        <p className="mt-1 text-xs text-slate-500">Vises ved siden af dit navn på tavlen, så andre kan se hvem ejeren af en deal er.</p>
        <div className="mt-4">
          <AvatarUploader currentAvatarUrl={user.avatarUrl} />
        </div>
      </div>
    </div>
  );
}
