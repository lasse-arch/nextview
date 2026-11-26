# Google-konti fra Arpo - opsætning (én gang)

Når det her er sat op, styres medarbejdernes @nextview360.dk-konti helt fra Arpo:

- **HR → medarbejderen → Giv adgang til Arpo**: opretter Google-kontoen og sender login til medarbejderens private e-mail.
- **Brugere**: Nulstil adgangskode (sendes til den private e-mail), Log ud af Google (mistet telefon), og Deaktivér / Genaktivér
  lukker og åbner Google-kontoen sammen med Arpo.
- Dagen efter sidste arbejdsdag lukker Arpo selv Google-kontoen. Mails og filer bliver liggende.

Arpo kan aldrig røre en administrator. Google lader ikke rollen herunder ændre en superadministrator, og Arpos egen
kode afviser også administratorer. Din egen konto kan derfor ikke ændres fra Arpo.

## 1. Google Cloud: en nøgle til Arpo

1. Gå til console.cloud.google.com, logget ind som dig selv (@nextview360.dk).
2. Opret et projekt, fx **Arpo**.
3. **APIs & Services → Library**: søg **Admin SDK API**, og slå den til.
4. **IAM & Admin → Service Accounts → Create service account**: navn fx `arpo-workspace`. Den skal ikke have nogen roller i projektet.
5. Kopiér servicekontoens e-mail (`arpo-workspace@….iam.gserviceaccount.com`). Den skal bruges i trin 2.
6. **Keys → Add key → Create new key → JSON**. Filen hentes ned. Den er hemmelig, så send den aldrig på mail eller i chat.
   Står der, at nøgler er slået fra ("Service account key creation is disabled"), så slå politikken
   `iam.disableServiceAccountKeyCreation` fra for projektet under **IAM & Admin → Organization Policies**.

## 2. Google Admin: en rolle til servicekontoen

1. Gå til admin.google.com.
2. **Konto → Administratorroller → Opret ny rolle**: kald den **Arpo brugeradmin**. Sæt kun flueben ved Brugere:
   - Under *Admin API-rettigheder*: Opret, Læs og Opdater.
   - Spørger Google også om rettigheder i Admin-konsollen, så sæt flueben ved Læs, Opret, Opdater, Nulstil adgangskode,
     Gennemtving ændring af adgangskode, Suspender brugere og Log ud.
   - Ingen andre rettigheder.
3. Åbn rollen → **Administratorer → Tildel servicekonti**, og indsæt servicekontoens e-mail fra trin 1.5.

Der skal ikke laves en ekstra bruger eller "delegering på hele domænet". Servicekontoen har selv rollen.

## 3. Vercel: nøglen ind i Arpo

Under Vercel → projektet → **Settings → Environment Variables** (Production, markér som *Sensitive*):

| Navn | Værdi |
| --- | --- |
| `GOOGLE_WORKSPACE_KEY` | Hele indholdet af JSON-filen fra trin 1.6 |
| `GOOGLE_WORKSPACE_OU` | Kan udelades. Sættes den, fx `/Medarbejdere`, oprettes nye konti dér, og Arpo rører kun konti i den. |

Lav en ny deploy. **Slet derefter JSON-filen fra din computer**, så nøglen kun findes i Vercel.

## 4. Tjek

Gå til **Brugere** i Arpo. Hver medarbejder har nu et mærke: "Google-konto åben", "lukket" eller "Ingen Google-konto".
Administratorer får en forklaring i stedet, fordi Arpo ikke styrer dem.

Skal nøglen skiftes (eller er den måske lækket): slet den under servicekontoens **Keys**, lav en ny, og sæt den ind i Vercel.
