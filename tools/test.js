// Uso: node tools/test.js "fill-101" "a1=...&a2=..." salida.pdf
const fs = require("fs");
const { buildPdf } = require("../js/engine.js");
(async () => {
  const [doc, qs, out] = process.argv.slice(2);
  const map = JSON.parse(fs.readFileSync(`maps/${doc}.json`));
  const { bytes, log } = await buildPdf(fs.readFileSync(map.template), map, new URLSearchParams(qs));
  fs.writeFileSync(out, bytes);
  console.log(out, bytes.length, "bytes", log.length ? "AVISOS: " + log.join(" | ") : "sin avisos");
})();
