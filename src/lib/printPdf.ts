/**
 * Opens a new window with formatted HTML content and triggers the browser print dialog.
 */
export function printPdf(title: string, subtitle: string, bodyHtml: string) {
  const win = window.open("", "_blank");
  if (!win) return;

  win.document.write(`<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { margin: 18mm 15mm; size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a2e; font-size: 11px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #e85d04; padding-bottom: 10px; margin-bottom: 16px; }
  .header h1 { font-size: 18px; font-weight: 700; color: #1a1a2e; }
  .header .subtitle { font-size: 11px; color: #666; margin-top: 2px; }
  .header .date { font-size: 10px; color: #999; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f5f5f5; text-align: left; padding: 6px 8px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #555; border-bottom: 1.5px solid #ddd; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
  tr:nth-child(even) td { background: #fafafa; }
  .section-title { font-size: 13px; font-weight: 700; margin: 18px 0 8px 0; color: #1a1a2e; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
  .badge-goud { background: #fef3c7; color: #92400e; }
  .badge-zilver { background: #f3f4f6; color: #374151; }
  .badge-brons { background: #ffedd5; color: #9a3412; }
  .badge-gastlid { background: #dbeafe; color: #1d4ed8; }
  .badge-gast { background: #f3f4f6; color: #6b7280; }
  .status { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
  .status-aangemeld { background: #dbeafe; color: #1d4ed8; }
  .status-bevestigd { background: #dcfce7; color: #15803d; }
  .status-aanwezig { background: #d1fae5; color: #065f46; }
  .status-afgemeld { background: #f3f4f6; color: #4b5563; }
  .status-no_show { background: #fee2e2; color: #b91c1c; }
  .tables-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .table-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px; break-inside: avoid; }
  .table-card h4 { font-size: 12px; font-weight: 700; margin-bottom: 6px; color: #1a1a2e; }
  .table-card ul { list-style: none; }
  .table-card li { padding: 2px 0; font-size: 11px; color: #444; }
  .table-card li.host { font-weight: 700; color: #1a1a2e; }
  .page-break { page-break-before: always; }
  .round-section { break-before: page; }
  .round-section:first-child { break-before: auto; }
  .footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #eee; font-size: 9px; color: #999; text-align: center; }
  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${title}</h1>
      <div class="subtitle">${subtitle}</div>
    </div>
    <div class="date">Afgedrukt: ${new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}</div>
  </div>
  ${bodyHtml}
  <div class="footer">De Kunst van Netwerken</div>
</body>
</html>`);
  win.document.close();
  setTimeout(() => {
    win.print();
    // Close the window after printing or cancelling
    win.addEventListener("afterprint", () => win.close());
  }, 300);
}

/**
 * Generate attendees PDF
 */
export function printAttendeesPdf(
  eventTitle: string,
  eventInfo: string,
  registrations: any[],
  guests: any[]
) {
  let html = "";

  // Members table
  if (registrations.length > 0) {
    html += `<div class="section-title">Leden (${registrations.length})</div>`;
    html += `<table><thead><tr><th>#</th><th>Naam</th><th>Bedrijf</th><th>Niveau</th><th>Regio</th><th>Status</th></tr></thead><tbody>`;
    registrations
      .sort((a, b) => {
        const nameA = `${a.profiles?.last_name} ${a.profiles?.first_name}`.toLowerCase();
        const nameB = `${b.profiles?.last_name} ${b.profiles?.first_name}`.toLowerCase();
        return nameA.localeCompare(nameB);
      })
      .forEach((r, i) => {
        const level = r.profiles?.membership_level || "gast";
        html += `<tr>
          <td>${i + 1}</td>
          <td>${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}</td>
          <td>${r.profiles?.company_name || "—"}</td>
          <td><span class="badge badge-${level}">${level}</span></td>
          <td>${r.profiles?.regions?.name || "—"}</td>
          <td><span class="status status-${r.status}">${r.status.replace("_", " ")}</span></td>
        </tr>`;
      });
    html += `</tbody></table>`;
  }

  // Guests table
  if (guests.length > 0) {
    html += `<div class="section-title">Gasten (${guests.length})</div>`;
    html += `<table><thead><tr><th>#</th><th>Naam</th><th>Bedrijf</th><th>E-mail</th><th>Status</th></tr></thead><tbody>`;
    guests.forEach((g, i) => {
      html += `<tr>
        <td>${i + 1}</td>
        <td>${g.first_name} ${g.last_name}</td>
        <td>${g.company_name || "—"}</td>
        <td>${g.email || "—"}</td>
        <td><span class="status status-${g.status}">${g.status.replace("_", " ")}</span></td>
      </tr>`;
    });
    html += `</tbody></table>`;
  }

  const total = registrations.length + guests.length;
  html += `<p style="margin-top:8px;font-size:11px;color:#666;">Totaal: ${total} deelnemers</p>`;

  printPdf(`Deelnemers — ${eventTitle}`, eventInfo, html);
}

/**
 * Generate seating PDF
 */
export function printSeatingPdf(
  eventTitle: string,
  eventInfo: string,
  rounds: any[]
) {
  let html = "";

  rounds.forEach((round, idx) => {
    html += `<div class="${idx > 0 ? "round-section" : ""}">`;
    html += `<div class="section-title">${round.name || `Ronde ${round.round_number}`}</div>`;
    if (!round.event_tables || round.event_tables.length === 0) {
      html += `<p style="color:#999;font-size:11px;">Geen tafels in deze ronde.</p>`;
      html += `</div>`;
      return;
    }
    html += `<div class="tables-grid">`;
    round.event_tables
      .sort((a: any, b: any) => a.table_number - b.table_number)
      .forEach((table: any) => {
        html += `<div class="table-card">`;
        html += `<h4>${table.table_name || `Tafel ${table.table_number}`} <span style="font-weight:400;color:#888;">(${table.table_seats?.length || 0}/${table.capacity})</span></h4>`;
        html += `<ul>`;
        (table.table_seats || [])
          .sort((a: any, b: any) => (a.seat_number || 0) - (b.seat_number || 0))
          .forEach((seat: any) => {
            const isHost = seat.member_id === table.host_member_id;
            const name = seat.profiles
              ? `${seat.profiles.first_name} ${seat.profiles.last_name}`.trim()
              : `Stoel ${seat.seat_number || "?"}`;
            html += `<li class="${isHost ? "host" : ""}">${isHost ? "★ " : "• "}${name}</li>`;
          });
        html += `</ul></div>`;
      });
    html += `</div></div>`;
  });

  printPdf(`Tafelindeling — ${eventTitle}`, eventInfo, html);
}
