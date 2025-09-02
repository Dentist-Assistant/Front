"use client";

type Severity = "low" | "medium" | "high";

export type PacketFinding = {
  tooth: string;
  note: string;
  severity: Severity;
};

export type PacketImage = {
  url: string;
  caption?: string;
};

export type ReviewPacketData = {
  caseId: string;
  patientName: string;
  doctorName?: string;
  technicianName?: string;
  createdAt?: string | Date;
  summary?: string;
  findings?: PacketFinding[];
  images?: PacketImage[];
  footerNote?: string;
};

function formatDate(d?: string | Date) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function severityLabel(s: Severity) {
  if (s === "high") return "High";
  if (s === "medium") return "Medium";
  return "Low";
}

function severityColor(s: Severity) {
  if (s === "high") return "var(--color-danger)";
  if (s === "medium") return "var(--color-warning)";
  return "var(--color-success)";
}

export function buildReviewPacketHTML(data: ReviewPacketData) {
  const created = formatDate(data.createdAt || new Date());
  const findingsRows =
    data.findings && data.findings.length
      ? data.findings
          .map(
            (f, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${f.tooth}</td>
            <td>${f.note || ""}</td>
            <td><span style="color:${severityColor(
              f.severity
            )};font-weight:600">${severityLabel(f.severity)}</span></td>
          </tr>`
          )
          .join("")
      : `<tr><td colspan="4" style="text-align:center;color:var(--color-muted)">No findings</td></tr>`;

  const imagesGrid =
    data.images && data.images.length
      ? data.images
          .map(
            (img) => `
        <figure>
          <img src="${img.url}" alt="${img.caption || "Case image"}"/>
          ${
            img.caption
              ? `<figcaption>${img.caption}</figcaption>`
              : "<figcaption></figcaption>"
          }
        </figure>`
          )
          .join("")
      : `<div class="empty">No images</div>`;

  const html = `
  <!DOCTYPE html>
  <html lang="es">
    <head>
      <meta charSet="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>Review Packet ${data.caseId}</title>
      <style>
        :root{
          --color-bg:#0B1220;
          --color-surface:#0F172A;
          --color-primary:#22D3EE;
          --color-primary-foreground:#06141F;
          --color-accent:#A78BFA;
          --color-success:#34D399;
          --color-warning:#F59E0B;
          --color-danger:#EF4444;
          --color-text:#E2E8F0;
          --color-muted:#64748B;
          --radius-xl:1rem;
          --radius-2xl:1.25rem;
        }
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;background:var(--color-bg);color:var(--color-text);font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,Helvetica,Arial,sans-serif;line-height:1.5}
        .page{max-width:900px;margin:0 auto;padding:32px}
        .card{background:var(--color-surface);border:1px solid rgba(226,232,240,.08);box-shadow:0 8px 30px rgba(0,0,0,.25);border-radius:var(--radius-2xl);overflow:hidden}
        .header{padding:28px 28px 16px;border-bottom:1px solid rgba(226,232,240,.06);position:relative}
        .title{font-size:22px;font-weight:700;letter-spacing:.2px;margin:0 0 6px}
        .meta{display:flex;flex-wrap:wrap;gap:12px;color:var(--color-muted);font-size:13px}
        .chip{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;border-radius:999px;background:rgba(34,211,238,.12);color:var(--color-primary);font-weight:600;font-size:12px}
        .section{padding:22px 28px}
        .section h3{margin:0 0 12px;font-size:15px;color:var(--color-text);opacity:.9;letter-spacing:.3px}
        .summary{color:var(--color-text);opacity:.9}
        table{width:100%;border-collapse:collapse;border-spacing:0;font-size:14px}
        th,td{padding:12px 10px;border-bottom:1px solid rgba(226,232,240,.06);vertical-align:top}
        thead th{position:sticky;top:0;background:rgba(15,23,42,.85);backdrop-filter:saturate(180%) blur(6px);text-align:left;color:var(--color-muted);font-weight:600}
        tbody tr:hover{background:rgba(34,211,238,.06)}
        .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:8px}
        figure{margin:0;background:rgba(226,232,240,.03);border:1px solid rgba(226,232,240,.06);border-radius:var(--radius-xl);overflow:hidden}
        img{display:block;width:100%;height:260px;object-fit:contain;background:#000}
        figcaption{padding:8px 10px;color:var(--color-muted);font-size:12px;border-top:1px solid rgba(226,232,240,.06)}
        .empty{padding:22px;text-align:center;color:var(--color-muted);border:1px dashed rgba(226,232,240,.14);border-radius:var(--radius-xl)}
        .footer{padding:18px 28px;border-top:1px solid rgba(226,232,240,.06);color:var(--color-muted);font-size:12px;display:flex;justify-content:space-between;gap:12px}
        .brand{font-weight:700;letter-spacing:.3px;color:var(--color-primary)}
        @media print {
          .page{max-width:100%;padding:0}
          .card{border:none;box-shadow:none;border-radius:0}
          .header{padding:16px}
          .section{padding:16px}
          img{height:200px}
        }
      </style>
    </head>
    <body>
      <main class="page">
        <section class="card">
          <header class="header" role="banner" aria-label="Case header">
            <div class="chip">Review Packet</div>
            <h1 class="title">Case ${data.caseId}</h1>
            <div class="meta">
              <span>Patient: <strong>${data.patientName}</strong></span>
              ${data.doctorName ? `<span>Doctor: <strong>${data.doctorName}</strong></span>` : ""}
              ${data.technicianName ? `<span>Technician: <strong>${data.technicianName}</strong></span>` : ""}
              <span>Date: ${created}</span>
            </div>
          </header>
          <section class="section">
            <h3>Summary</h3>
            <p class="summary">${data.summary || "No summary provided"}</p>
          </section>
          <section class="section">
            <h3>Findings</h3>
            <div style="overflow:auto;border:1px solid rgba(226,232,240,.06);border-radius:var(--radius-xl)">
              <table role="table" aria-label="Findings table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Tooth</th>
                    <th>Note</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  ${findingsRows}
                </tbody>
              </table>
            </div>
          </section>
          <section class="section">
            <h3>Images</h3>
            <div class="grid">
              ${imagesGrid}
            </div>
          </section>
          <footer class="footer">
            <span class="brand">DentistFront</span>
            <span>${data.footerNote || "Confidential clinical document"}</span>
          </footer>
        </section>
      </main>
      <script>
        window.addEventListener("load", function(){ setTimeout(function(){ window.focus(); window.print(); }, 150); });
      </script>
    </body>
  </html>`;
  return html;
}

export function openPrintWindow(html: string) {
  const win = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function printReviewPacket(data: ReviewPacketData) {
  const html = buildReviewPacketHTML(data);
  openPrintWindow(html);
}

export function previewUrl(data: ReviewPacketData) {
  const html = buildReviewPacketHTML(data);
  const blob = new Blob([html], { type: "text/html" });
  return URL.createObjectURL(blob);
}
