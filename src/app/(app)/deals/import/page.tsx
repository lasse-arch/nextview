import { importFromCsvFile, importFromGoogleDocs } from "@/lib/actions/import";
import { importExistingCustomers } from "@/lib/actions/import-customers";

export default function ImportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Importér leads</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kolonner der genkendes: firmanavn, kontaktperson, e-mail, telefon og evt. ejer (sælgers e-mail).
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">CSV-fil</h2>
        <form action={importFromCsvFile} className="mt-4 space-y-3">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Importér CSV
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Google Docs / Sheets</h2>
        <p className="mt-1 text-xs text-slate-500">
          Brug en offentligt publiceret link (Fil → Del → Publicér på nettet → CSV), eller indsæt tabellen som tekst
          nedenfor.
        </p>
        <form action={importFromGoogleDocs} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500">Publiceret URL (valgfri)</label>
            <input
              name="sourceUrl"
              type="url"
              placeholder="https://docs.google.com/.../pub?output=csv"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="text-center text-xs text-slate-400">— eller —</div>
          <div>
            <label className="block text-xs font-medium text-slate-500">Indsæt tabel som tekst (CSV/tab-separeret)</label>
            <textarea
              name="pastedText"
              rows={6}
              placeholder={"firmanavn,kontaktperson,email,telefon\nAcme ApS,Jens Jensen,jens@acme.dk,12345678"}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Importér fra Google Docs
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Importér eksisterende kunder</h2>
        <p className="mt-1 text-xs text-slate-500">
          Til jeres nuværende kunder — både allerede aktive (oprettes som "Live") og kunder under kontrakt, der endnu
          ikke er startet (oprettes som "Kontrakt underskrevet", uden startdato udfyldt). Historiske kvartaler for
          aktive kunder markeres som allerede afregnet i jeres gamle system og sendes{" "}
          <span className="font-medium">ikke</span> til Dinero — kun fremtidige kvartaler gør.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Påkrævede kolonner: firmanavn, salgsbeløb/kontraktværdi, binding/bindingsperiode (måneder). Startdato er
          valgfri — mangler den, importeres kunden som pipeline i stedet for Live. Andre valgfrie kolonner: cvr,
          kontaktperson, email, telefon, sælger (e-mail), produkt/service, etableringspris/opstartspris. Kolonnenavne
          matches uafhængigt af mellemrum, bindestreger og parenteser (fx virker både "Binding" og "Binding (mdr)").
        </p>
        <form action={importExistingCustomers} className="mt-4 space-y-3">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Importér eksisterende kunder
          </button>
        </form>
      </section>
    </div>
  );
}
