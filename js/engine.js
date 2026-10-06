/* Motor de llenado. Funciona en navegador (PDFLib global) y en Node (require). */
(function (root) {
  const PDFLib = root.PDFLib || (typeof require !== "undefined" ? require("pdf-lib") : null);
  const { PDFDocument, PDFDropdown, StandardFonts, rgb } = PDFLib;

  // Helvetica solo soporta WinAnsi: si hay un carácter raro, lo normalizamos.
  const safe = (s, font) => {
    try { font.encodeText(s); return s; } catch (_) {
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
    }
  };
  const truthy = (v) => /^(1|true|x|si|sí|yes|on)$/i.test(String(v).trim());

  /**
   * @param {Uint8Array|ArrayBuffer} templateBytes  PDF en blanco
   * @param {object} map     contenido de maps/<doc>.json
   * @param {URLSearchParams|object} params  a1, a2, ... (+ opciones)
   * @param {{flatten?:boolean}} opts
   */
  async function buildPdf(templateBytes, map, params, opts = {}) {
    const get = (k) => (params.get ? params.get(k) : params[k]);
    const pdf = await PDFDocument.load(templateBytes);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const log = [];

    if (map.mode === "fill") {
      const form = pdf.getForm();
      const byName = {};
      form.getFields().forEach((f) => (byName[f.getName()] = f));
      const find = (n) => byName[n] || byName[n.replace(/\\+/g, "\\")] ||
        Object.values(byName).find((f) => f.getName().replace(/\\/g, "") === n.replace(/\\/g, ""));

      for (const [key, spec] of Object.entries(map.fields)) {
        let v = get(key);
        if (v == null || String(v).trim() === "" || String(v).trim() === "-") continue;
        v = String(v).trim();
        const s = typeof spec === "string" || Array.isArray(spec) ? { field: spec } : spec;
        const names = [].concat(s.field || s.fields);

        try {
          if (s.type === "chars") {
            // Un carácter por casilla (p. ej. licencia de 8 casillas)
            const chars = v.replace(/[\s-]/g, "").toUpperCase().split("");
            names.forEach((n, i) => { if (chars[i]) find(n).setText(chars[i]); });
          } else if (s.type === "check") {
            if (truthy(v)) names.forEach((n) => find(n).check());
          } else if (s.type === "choice") {
            // a12=AND / OR  -> marca el checkbox correspondiente
            const target = s.options[v.toUpperCase()];
            if (target) find(target).check();
          } else {
            names.forEach((n) => {
              const f = find(n);
              if (f instanceof PDFDropdown) {
                const o = f.getOptions();
                const hit = o.find((x) => x.trim().toUpperCase() === v.toUpperCase());
                if (hit) f.select(hit); else log.push(`${key}: "${v}" no está en la lista de ${n}`);
              } else {
                f.setText(safe(v, font));
              }
            });
          }
        } catch (e) { log.push(`${key}: ${e.message}`); }
      }
      // Botones de la plantilla (Print / Clear Form...) que no deben salir en el PDF final
      (map.remove || []).forEach((n) => { const f = find(n); if (f) form.removeField(f); });
      form.updateFieldAppearances(font);
      if (opts.flatten !== false) form.flatten();

    } else if (map.mode === "overlay") {
      // Para PDFs planos: texto en coordenadas (origen abajo-izquierda, en puntos)
      const pages = pdf.getPages();
      for (const [key, f] of Object.entries(map.fields)) {
        const v = get(key);
        if (v && String(v).trim())
          pages[f.page || 0].drawText(safe(String(v).trim(), font), {
            x: f.x, y: f.y, size: f.size || 10, font, color: rgb(0, 0, 0),
          });
      }
    }
    // Si el MediaBox es más grande que lo que se ve (CropBox), igualarlos
    pdf.getPages().forEach((pg) => {
      const c = pg.getCropBox();
      pg.setMediaBox(c.x, c.y, c.width, c.height);
    });
    return { bytes: await pdf.save(), log };
  }

  const api = { buildPdf };
  if (typeof module !== "undefined") module.exports = api; else root.DocFiller = api;
})(typeof window !== "undefined" ? window : globalThis);
