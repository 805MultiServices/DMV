// Uso: node tools/list-fields.js templates/101.pdf
// Lista tipo, página, posición y nombre de cada campo del PDF (para armar los mapas).
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
(async () => {
  const pdf = await PDFDocument.load(fs.readFileSync(process.argv[2]));
  const pages = pdf.getPages();
  pdf.getForm().getFields().forEach((f) => {
    const w = f.acroField.getWidgets()[0];
    const r = w.getRectangle();
    const pg = pages.findIndex((p) => p.ref === w.P());
    console.log(
      `${f.constructor.name.replace("PDF", "").padEnd(12)} p${pg}  [${Math.round(r.x)},${Math.round(r.y)}]  ${JSON.stringify(f.getName())}`
    );
  });
})();
