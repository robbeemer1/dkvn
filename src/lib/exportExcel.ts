import * as XLSX from "xlsx";

/**
 * Export attendees list to Excel, split by aangemeld/afgemeld, sorted by first+last name.
 */
export function exportAttendeesExcel(
  eventTitle: string,
  eventInfo: string,
  registrations: any[],
  guests: any[]
) {
  const activeStatuses = ["aangemeld", "bevestigd", "aanwezig"];

  const sortByName = (a: any, b: any, getFirst: (x: any) => string, getLast: (x: any) => string) => {
    const cmp = getFirst(a).toLowerCase().localeCompare(getFirst(b).toLowerCase());
    return cmp !== 0 ? cmp : getLast(a).toLowerCase().localeCompare(getLast(b).toLowerCase());
  };

  const regFirst = (r: any) => r.profiles?.first_name || "";
  const regLast = (r: any) => r.profiles?.last_name || "";
  const guestFirst = (g: any) => g.first_name || "";
  const guestLast = (g: any) => g.last_name || "";

  const activeRegs = registrations.filter(r => activeStatuses.includes(r.status)).sort((a, b) => sortByName(a, b, regFirst, regLast));
  const inactiveRegs = registrations.filter(r => !activeStatuses.includes(r.status)).sort((a, b) => sortByName(a, b, regFirst, regLast));
  const activeGuests = guests.filter(g => activeStatuses.includes(g.status)).sort((a, b) => sortByName(a, b, guestFirst, guestLast));
  const inactiveGuests = guests.filter(g => !activeStatuses.includes(g.status)).sort((a, b) => sortByName(a, b, guestFirst, guestLast));

  const rows: (string | number)[][] = [];

  rows.push([eventTitle]);
  rows.push([eventInfo]);
  rows.push([]);

  const addRegSection = (items: any[], label: string) => {
    if (items.length === 0) return;
    rows.push([`${label} (${items.length})`]);
    rows.push(["#", "Voornaam", "Achternaam", "Bedrijf", "Niveau", "Regio", "Status"]);
    items.forEach((r, i) => {
      rows.push([
        i + 1,
        r.profiles?.first_name || "",
        r.profiles?.last_name || "",
        r.profiles?.company_name || "",
        r.profiles?.membership_level || "gast",
        r.profiles?.regions?.name || "",
        r.status?.replace("_", " ") || "",
      ]);
    });
    rows.push([]);
  };

  const addGuestSection = (items: any[], label: string) => {
    if (items.length === 0) return;
    rows.push([`${label} (${items.length})`]);
    rows.push(["#", "Voornaam", "Achternaam", "Bedrijf", "E-mail", "Status"]);
    items.forEach((g, i) => {
      rows.push([
        i + 1,
        g.first_name || "",
        g.last_name || "",
        g.company_name || "",
        g.email || "",
        g.status?.replace("_", " ") || "",
      ]);
    });
    rows.push([]);
  };

  addRegSection(activeRegs, "Leden — Aangemeld");
  addGuestSection(activeGuests, "Gasten — Aangemeld");
  addRegSection(inactiveRegs, "Leden — Afgemeld");
  addGuestSection(inactiveGuests, "Gasten — Afgemeld");

  const totalActive = activeRegs.length + activeGuests.length;
  const totalInactive = inactiveRegs.length + inactiveGuests.length;
  rows.push([`Totaal aangemeld: ${totalActive} · Afgemeld: ${totalInactive} · Totaal: ${totalActive + totalInactive}`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws["!cols"] = [
    { wch: 4 }, { wch: 16 }, { wch: 20 }, { wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Deelnemers");
  XLSX.writeFile(wb, `Deelnemers - ${eventTitle}.xlsx`);
}

/**
 * Export seating arrangement to Excel.
 * Layout: tables as columns side-by-side per round (matching the PDF example).
 */
export function exportSeatingExcel(
  eventTitle: string,
  eventInfo: string,
  rounds: any[]
) {
  const wb = XLSX.utils.book_new();

  rounds.forEach((round) => {
    const sheetName = (round.name || `Ronde ${round.round_number}`).substring(0, 31);
    const tables = (round.event_tables || []).sort((a: any, b: any) => a.table_number - b.table_number);

    if (tables.length === 0) {
      const ws = XLSX.utils.aoa_to_sheet([[`${eventTitle} — ${sheetName}`], ["Geen tafels"]]);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      return;
    }

    // Build grid: tables side by side, 3 per row-group
    const tablesPerRow = 3;
    const rows: (string | number)[][] = [];

    rows.push([`Tafelindeling ${eventInfo}`]);
    rows.push([sheetName]);
    rows.push([]);

    const tableGroups: any[][] = [];
    for (let i = 0; i < tables.length; i += tablesPerRow) {
      tableGroups.push(tables.slice(i, i + tablesPerRow));
    }

    tableGroups.forEach((group) => {
      // Header row with table names
      const headerRow: string[] = [];
      group.forEach((table: any, idx: number) => {
        if (idx > 0) headerRow.push(""); // spacer column
        headerRow.push(table.table_name || `Tafel ${table.table_number}`);
      });
      rows.push(headerRow);

      // Find max seats in this group
      const maxSeats = Math.max(...group.map((t: any) => (t.table_seats || []).length));

      for (let s = 0; s < maxSeats; s++) {
        const row: (string | number)[] = [];
        group.forEach((table: any, idx: number) => {
          if (idx > 0) row.push(""); // spacer
          const seats = (table.table_seats || []).sort((a: any, b: any) => (a.seat_number || 0) - (b.seat_number || 0));
          if (s < seats.length) {
            const seat = seats[s];
            const name = seat.profiles
              ? `${seat.profiles.first_name || ""} ${seat.profiles.last_name || ""}`.trim()
              : seat.guest
                ? `${seat.guest.first_name || ""} ${seat.guest.last_name || ""}`.trim()
                : `Stoel ${seat.seat_number || "?"}`;
            const isHost = seat.member_id === table.host_member_id;
            row.push(`${s + 1} ${isHost ? "★ " : ""}${name}`);
          } else {
            row.push("");
          }
        });
        rows.push(row);
      }

      rows.push([]); // gap between table groups
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    const cols: { wch: number }[] = [];
    for (let i = 0; i < tablesPerRow * 2; i++) {
      cols.push({ wch: i % 2 === 0 || (i === 0) ? 28 : 2 });
    }
    // Fix: first col and every other are table cols
    const colWidths: { wch: number }[] = [];
    for (let g = 0; g < tablesPerRow; g++) {
      if (g > 0) colWidths.push({ wch: 2 }); // spacer
      colWidths.push({ wch: 28 });
    }
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  if (wb.SheetNames.length === 0) {
    const ws = XLSX.utils.aoa_to_sheet([["Geen rondes"]]);
    XLSX.utils.book_append_sheet(wb, ws, "Leeg");
  }

  XLSX.writeFile(wb, `Tafelindeling - ${eventTitle}.xlsx`);
}
