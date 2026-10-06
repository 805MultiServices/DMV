// Uso: node tools/test-paquete.js "docs=overlay-256,fill-101,fill-101&1_a1=...&2_a1=..." salida.pdf [final]
// Hace lo mismo que index.html con ?docs=...
const fs = require("fs");
const { buildPdf, mergePdfs } = require("../js/engine.js");
(async () => {
  const [qs, out, final] = process.argv.slice(2);
  const params = new URLSearchParams(qs);
  const docs = params.get("docs").split(",").map((d) => d.trim());
  const parts = [];
  for (let i = 0; i < docs.length; i++) {
    const pre = `${i + 1}_`, sub = new URLSearchParams();
    for (const [k, v] of params) if (k.startsWith(pre)) sub.set(k.slice(pre.length), v);
    let f = `maps/${docs[i]}.json`;
    if (!fs.existsSync(f)) f = f.replace("/overlay-", "/fill-");
    const map = JSON.parse(fs.readFileSync(f));
    const r = await buildPdf(fs.readFileSync(map.template), map, sub, { flatten: final === "final" });
    if (r.log.length) console.log(`AVISOS ${docs[i]} #${i + 1}:`, r.log.join(" | "));
    parts.push(r);
  }
  const bytes = await mergePdfs(parts, { duplex: params.get("duplex") !== "0" });
  fs.writeFileSync(out, bytes);
  console.log(out, bytes.length, "bytes");
})();
