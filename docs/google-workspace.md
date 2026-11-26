# Google-konti fra Arpo - opsætning (én gang)

Når det her er sat op, styres medarbejdernes @nextview360.dk-konti helt fra Arpo:

- **HR → medarbejderen → Giv adgang til Arpo**: opretter Google-kontoen og sender login til medarbejderens private e-mail.
- **Brugere**: Nulstil adgangskode (sendes til den private e-mail), Log ud af Google (mistet telefon), og Deaktivér / Genaktivér
  lukker og åbner Google-kontoen sammen med Arpo.
- Dagen efter sidste arbejdsdag lukker Arpo selv Google-kontoen. Mails og filer bliver liggende.

**Der findes ingen nøgle.** Vercel beviser over for Google, at kaldet kommer fra vores Arpo i produktion
(OIDC-federation). Google stoler kun på netop det, og der er intet hemmeligt, der kan lække. Lav derfor aldrig en nøgle
til servicekontoen.

Arpo kan aldrig røre en administrator. Google lader ikke rollen herunder ændre en superadministrator, og Arpos egen
kode afviser også administratorer. Din egen konto kan derfor ikke ændres fra Arpo.

Undervejs skal du bruge tre ting. Find dem i trin 1 og 2.1, og skriv dem ned:

- **team-navnet** i Vercel (slug), fx `nextview360`
- **projektnavnet** i Vercel (som det står der)
- **projektnummeret** i Google

## 1. Vercel: slå OIDC til

1. Vercel → projektet → **Settings → Security** → *Secure backend access with OIDC federation* → **Enable**.
2. Vælg *Issuer mode*: **Team**, og gem.
3. Der står nu en *Issuer URL*: `https://oidc.vercel.com/<team-navn>`. Team-navnet er det sidste stykke.

## 2. Google Cloud (projektet Nextview360APS)

1. **Forsiden (Dashboard) → Project info**: skriv **Project number** ned (kun tal).
2. **APIs & Services → Library**: slå disse tre til:
   - **Admin SDK API**
   - **IAM Service Account Credentials API**
   - **Security Token Service API**
3. **IAM & Admin → Workload Identity Federation → Create pool**:
   - Pool: navn `vercel`, ID `vercel`.
   - Provider: *OpenID Connect (OIDC)*, navn `vercel`, ID `vercel`.
   - Issuer URL: `https://oidc.vercel.com/<team-navn>`
   - Audiences: *Allowed audiences* → `https://vercel.com/<team-navn>`
   - Attribute mapping: `google.subject` = `assertion.sub`
   - Attribute condition (kun vores projekt i produktion):
     `assertion.sub == "owner:<team-navn>:project:<projektnavn>:environment:production"`
4. **IAM & Admin → Service Accounts → arpo-workspace → Principals with access → Grant access**:
   - New principal:
     `principal://iam.googleapis.com/projects/<projektnummer>/locations/global/workloadIdentityPools/vercel/subject/owner:<team-navn>:project:<projektnavn>:environment:production`
   - Role: **Workload Identity User**

## 3. Google Admin: en rolle til servicekontoen

1. Gå til admin.google.com.
2. **Konto → Administratorroller → Opret ny rolle**: kald den **Arpo brugeradmin**. Sæt kun flueben ved Brugere:
   - Under *Admin API-rettigheder*: Opret, Læs og Opdater.
   - Spørger Google også om rettigheder i Admin-konsollen, så sæt flueben ved Læs, Opret, Opdater, Nulstil adgangskode,
     Gennemtving ændring af adgangskode, Suspender brugere og Log ud.
   - Ingen andre rettigheder.
3. Åbn rollen → **Administratorer → Tildel servicekonti**, og indsæt
   `arpo-workspace@nextview360aps.iam.gserviceaccount.com`.

## 4. Vercel: fortæl Arpo, hvor den skal spørge

Under Vercel → projektet → **Settings → Environment Variables** (Production). Det er id'er, ikke hemmeligheder:

| Navn | Værdi |
| --- | --- |
| `GCP_PROJECT_NUMBER` | Projektnummeret fra trin 2.1 |
| `GCP_WORKLOAD_POOL_ID` | `vercel` |
| `GCP_WORKLOAD_PROVIDER_ID` | `vercel` |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `arpo-workspace@nextview360aps.iam.gserviceaccount.com` |
| `GOOGLE_WORKSPACE_OU` | Kan udelades. Sættes den, fx `/Medarbejdere`, oprettes nye konti dér, og Arpo rører kun konti i den. |

Lav en ny deploy.

## 5. Tjek

Gå til **Brugere** i Arpo. Hver medarbejder har nu et mærke: "Google-konto åben", "lukket" eller "Ingen Google-konto".
Administratorer får en forklaring i stedet, fordi Arpo ikke styrer dem.

Står der en fejl, så siger den, hvilket trin Google stoppede ved:

- "Vercel gav ikke Arpo et OIDC-token": trin 1.
- "Google afviste Vercels login": trin 2.3. Tjek team-navn og projektnavn.
- "Google lod ikke Arpo bruge servicekontoen": trin 2.4.
- "Google sagde nej" eller 403: trin 3.

Det virker kun i produktion, ikke i preview-deploys. Det er med vilje.
