import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateOwnContactInfo } from "@/lib/actions/profile";
import { AvatarUploader } from "../avatar-uploader";

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
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Kontaktoplysninger</h2>
        <p className="mt-1 text-xs text-slate-500">
          Navn og telefonnummer vises som sælgerens fulde navn og kontaktoplysning på genererede kontrakter.
        </p>
        <form action={updateOwnContactInfo} className="mt-4 space-y-3">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500">Fornavn</label>
              <input
                name="name"
                required
                defaultValue={user.name}
                placeholder="Lasse"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500">Efternavn</label>
              <input
                name="lastName"
                defaultValue={user.lastName ?? ""}
                placeholder="Larsen"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500">Telefon</label>
              <input
                name="phone"
                defaultValue={user.phone ?? ""}
                placeholder="20 91 02 94"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Gem
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
