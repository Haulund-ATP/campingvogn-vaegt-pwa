import QRCode from "qrcode";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    baseUrl: { type: "string" },
    globalAdminToken: { type: "string" },
    tripId: { type: "string" },
    displayName: { type: "string" },
    publicToken: { type: "string" },
    outputDirectory: { type: "string" },
  },
});

if (!values.baseUrl || !values.outputDirectory) {
  console.error("Kræver mindst --baseUrl og --outputDirectory");
  process.exit(1);
}

mkdirSync(values.outputDirectory, { recursive: true });

async function writeQrPng(url, filePath) {
  const buffer = await QRCode.toBuffer(url, { width: 640, margin: 2 });
  writeFileSync(filePath, buffer);
  return buffer;
}

async function buildPdfSheet(title, entries, outputPath) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText(title, { x: 50, y: 780, size: 22, font, color: rgb(0.04, 0.36, 0.23) });

  let y = 720;
  for (const entry of entries) {
    const pngBytes = await QRCode.toBuffer(entry.url, { width: 320, margin: 2 });
    const image = await doc.embedPng(pngBytes);
    page.drawText(entry.label, { x: 50, y: y + 10, size: 16, font, color: rgb(0, 0, 0) });
    page.drawImage(image, { x: 50, y: y - 240, width: 220, height: 220 });
    if (entry.warning) {
      page.drawText(entry.warning, { x: 50, y: y - 260, size: 10, font: bodyFont, color: rgb(0.7, 0.15, 0.13) });
    }
    y -= 300;
  }

  const pdfBytes = await doc.save();
  writeFileSync(outputPath, pdfBytes);
}

if (values.globalAdminToken) {
  const url = `${values.baseUrl}/#action=admin&token=${values.globalAdminToken}`;
  await writeQrPng(url, `${values.outputDirectory}/administrator.png`);
  await buildPdfSheet(
    "Administrator — Campingvogn Vægt",
    [{ label: "Administrator (følsom — del ikke)", url, warning: "Denne QR-kode giver fuld administratoradgang. Opbevar den sikkert." }],
    `${values.outputDirectory}/administrator.pdf`
  );
  console.log(`Administrator-QR genereret i ${values.outputDirectory}`);
} else if (values.tripId && values.publicToken) {
  const addUrl = `${values.baseUrl}/#action=add&trip=${values.tripId}&token=${values.publicToken}`;
  const removeUrl = `${values.baseUrl}/#action=remove&trip=${values.tripId}&token=${values.publicToken}`;
  await writeQrPng(addUrl, `${values.outputDirectory}/tilfoej-vaegt.png`);
  await writeQrPng(removeUrl, `${values.outputDirectory}/fjern-vaegt.png`);
  await buildPdfSheet(
    values.displayName ?? values.tripId,
    [
      { label: "Tilføj vægt", url: addUrl },
      { label: "Fjern vægt", url: removeUrl },
    ],
    `${values.outputDirectory}/qr-koder.pdf`
  );
  console.log(`Trip-QR-koder genereret i ${values.outputDirectory}`);
} else {
  console.error("Angiv enten --globalAdminToken, eller --tripId + --publicToken");
  process.exit(1);
}
