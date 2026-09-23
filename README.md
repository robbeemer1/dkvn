# De Kunst van Netwerken

Je gaat een app voor bouwen en opleveren als een werkend systeem (frontend + backend + database + auth). De app is voor een netwerkclub: “De Kunst van Netwerken”. Doel: ledenbeheer, eventbeheer en een slimme tafelindeling per event met meerdere tafelrondes, waarbij deelnemers zo vaak mogelijk met nieuwe mensen aan tafel zitten, zowel binnen één event als over alle events heen. Bouw dit zonder terugvragen; maak zelf verstandige keuzes en configureer alles consistent.

Domein en regels. Er zijn vier regio’s: Amsterdam, Amersfoort, Almere en Apeldoorn. Elk lid heeft een thuisregio, maar kan als gast deelnemen aan events in andere regio’s. Lidmaatschapsniveaus: goud, zilver, brons, gastlid. Daarnaast kunnen er per event ook “gasten” zijn die geen lidaccount hebben (of optioneel wel later kunnen worden omgezet). Een event hoort altijd bij één regio, maar deelnemers mogen uit alle regio’s komen.

Modules die moeten werken. Ledenbeheer: leden CRUD, status/level, thuisregio, contactgegevens, bedrijfsinfo, facturatievelden optioneel, tags/labels, notities, privacyconsent, historie (aanwezigheid, events bezocht, tafels/tafeldeelnames). Eventbeheer: events CRUD met datum/tijd/locatie/region, capaciteit, prijs (optioneel), inschrijvingen, wachtlijst, check-in, no-show registratie, export/printlijsten, en rollen voor eventorganisatie. Deelnemers: per event beheer je deelnemers als “member attendee” of “guest attendee”, met aanmeldstatus (aangemeld, bevestigd, aanwezig, afgemeld), dieetwensen/notes, en “te gast bij andere regio” indicator. Planningstool: per event een tijdlijn/taaklijst voor voorbereiding (taken, eigenaar, deadline, status, herinneringen), plus teamkalenderweergave per regio en overall.

Tafelindeling (kern). Elk event kan 1 of meer tafelrondes hebben. Per ronde zijn er tafels met een instelbare tafelgrootte (bijv. 6–10) en optioneel vaste tafels/hosts. Het systeem moet automatisch een indeling kunnen genereren en daarna handmatig aanpasbaar zijn met drag & drop. Doelstelling: maximaliseer “nieuwe ontmoetingen”. Binnen hetzelfde event moet iemand in verschillende rondes zo min mogelijk dezelfde tafelgenoten treffen. Over alle events heen moet herhaling ook geminimaliseerd worden door een “meetings history” bij te houden. Houd rekening met constraints: iemand kan niet aan twee tafels tegelijk; tafels moeten gevuld worden binnen de capaciteit; optionele regels zoals “gasten niet bij elkaar clusteren”, “minimaal X nieuwe contacten per ronde”, “VIP (goud) mix over tafels” en “regionale mix” moeten configureerbaar zijn per event. De indeling moet een score krijgen (kwaliteit) en uitleg waarom (bijv. aantal nieuwe ontmoetingen, aantal herhalingen, fairness). Bewaar elke gegenereerde versie als concept, met versiebeheer en een “publiceer” status. Printbare output: tafellijst per ronde en persoonlijke kaartjes/overzicht per deelnemer (“jij zit ronde 1 aan tafel 3…”).

AI-rol. Maak een “Seating Optimizer” service die op basis van historische tafelgenoten een optimale of near-optimale indeling zoekt. Gebruik een herhaalbare aanpak: je kunt eerst een heuristiek (greedy + swap/local search) implementeren en optioneel later een geavanceerdere solver. Voeg een AI-assistent toe die in normale taal kan uitleggen waarom een indeling goed is en suggesties kan doen (“wissel persoon A en B om herhalingen te verlagen”). De AI mag geen privacygevoelige data lekken en gebruikt alleen data binnen de club.

Accounts, rollen en beveiliging. Maak login met veilige wachtwoorden, wachtwoord reset, MFA optioneel, rate limiting, audit logging van belangrijke acties. Rollen: Super Admin (alles), Regio Admin (alles binnen eigen regio), Event Organizer (events + deelnemers + tafels binnen toegewezen events), Member (eigen profiel + inschrijven + eigen tafeloverzicht), Read-only (rapportage). Autorisatie moet strikt per regio/event werken. Zorg voor GDPR basics: dataverwijdering/anonimisering, consent vlag, export van persoonsgegevens. Alle gevoelige velden encrypted at rest waar relevant.

Database (relational) moet dit ondersteunen. Minimaal tabellen/relaties voor: users, roles/permissions, regions, members (kan los staan van users, maar koppelbaar), membership_levels, events, event_registrations (attendees), event_guests (of attendees met type), event_rounds, tables, table_seats, meeting_history (pairwise ontmoetingen met counts en last_seen), tasks (planning), task_comments, audit_logs. Zorg voor unieke constraints (issue keys equivalent: event code optioneel), indexes op region_id, event_id, member_id, attendance status en search (naam/bedrijf). Voeg full-text search toe voor leden en events.

UI/UX. Maak een overzichtelijk admin dashboard met regiofilter en snelle acties. Voor events: een duidelijke flow van “event aanmaken → deelnemers → rondes/tafels → genereer indeling → handmatig finetunen → publiceren → print/export”. Voor leden: profielpagina met bezoekhistorie en netwerkstatistieken (aantal unieke ontmoetingen, herhalingen, regio-mix). Voor members: self-service inschrijven, kalenderweergave, en na publicatie per event hun tafels per ronde zien.

Techniekkeuze. Kies een moderne, onderhoudbare stack en lever alles als deploybare app (bijv. Laravel + Postgres + React/Vue, of een andere consistente keuze), inclusief migrations, seed data (regio’s en levels), en een admin account. Lever ook een korte beheerhandleiding in de app (help/tooltip) zodat een niet-technische beheerder ermee kan werken.

Oplevering. Lever de complete app werkend op met voorbeelddata (enkele leden per regio, één event met meerdere rondes) zodat we direct kunnen testen. Voeg basisrapportages toe: deelnemers per event, no-shows, bezettingsgraad, en “networking effectiviteit” (gemiddeld aantal nieuwe ontmoetingen per deelnemer, herhalingspercentage per event en overall).

Ik deel later een overzicht met de tafelindelinghistorie. Hiermee kunnen we alvast leden aanmaken en de historie voeden.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://dkvn.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9e1a9d74-c3c0-497c-8468-ecbf4282a70a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
