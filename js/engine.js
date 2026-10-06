/* Motor de llenado. Funciona en navegador (PDFLib global) y en Node (require). */
(function (root) {
  const PDFLib = root.PDFLib || (typeof require !== "undefined" ? require("pdf-lib") : null);
  const { PDFDocument, PDFDropdown, PDFTextField, PDFCheckBox, PDFOptionList,
          PDFName, PDFDict, StandardFonts, rgb } = PDFLib;

  // Todo el texto en NEGRO y NEGRITAS (Helvetica-Bold), también lo que se escriba
  // después en el visor: se cambia el "Default Appearance" (DA) de cada campo.
  function styleFields(pdf, form, font) {
    const ctx = pdf.context;
    const af = form.acroForm.dict;
    let dr = af.lookup(PDFName.of("DR"), PDFDict);
    if (!dr) { dr = ctx.obj({}); af.set(PDFName.of("DR"), dr); }
    let fonts = dr.lookup(PDFName.of("Font"), PDFDict);
    if (!fonts) { fonts = ctx.obj({}); dr.set(PDFName.of("Font"), fonts); }
    fonts.set(PDFName.of("HeBo"), font.ref);

    const sizeOf = (da) => { const m = /([\d.]+)\s+Tf/.exec(da || ""); return m ? m[1] : "0"; };
    form.getFields().forEach((f) => {
      let da = null;
      const cur = f.acroField.getDefaultAppearance() || "";
      if (f instanceof PDFTextField || f instanceof PDFDropdown || f instanceof PDFOptionList)
        da = `/HeBo ${sizeOf(cur)} Tf 0 g`;
      else if (f instanceof PDFCheckBox)
        da = `/ZaDb ${sizeOf(cur)} Tf 0 g`;
      if (!da) return;
      f.acroField.setDefaultAppearance(da);
      f.acroField.getWidgets().forEach((w) => w.setDefaultAppearance(da));
    });
  }

  // Helvetica solo soporta WinAnsi: si hay un carácter raro, lo normalizamos.
  const safe = (s, font) => {
    try { font.encodeText(s); return s; } catch (_) {
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
    }
  };
  // Si el texto no cabe en el campo (una sola línea), reduce la letra hasta que quepa (mín. 6 pt)
  function fitText(f, txt, font) {
    if (!(f instanceof PDFTextField) || f.isMultiline() || f.isCombed()) return;
    const m = /([\d.]+)\s+Tf/.exec(f.acroField.getDefaultAppearance() || "");
    const size = m ? parseFloat(m[1]) : 0;
    if (!size) return;                                  // 0 = tamaño automático del visor
    const w = f.acroField.getWidgets()[0].getRectangle().width - 4;   // margen interno
    const need = font.widthOfTextAtSize(txt, size);
    if (need > w) f.setFontSize(Math.max(6, Math.floor((size * w / need) * 10) / 10));
  }
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
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const log = [];

    if (map.mode === "fill") {
      const form = pdf.getForm();
      styleFields(pdf, form, font);
      const byName = {};
      form.getFields().forEach((f) => (byName[f.getName()] = f));
      const find = (n) => byName[n] || byName[n.replace(/\\+/g, "\\")] ||
        Object.values(byName).find((f) => f.getName().replace(/\\/g, "") === n.replace(/\\/g, ""));

      // "stretch": alarga un campo hasta cubrir el de al lado cuando ese parámetro viene vacío
      // (p. ej. apellido + nombre juntos en "PRINTED NAME" si no llega a10)
      (map.stretch || []).forEach((st) => {
        const u = get(st.unless);
        if (u != null && String(u).trim() !== "" && String(u).trim() !== "-") return;
        const a = find(st.field), b = find(st.to);
        if (!a || !b) return;
        const end = b.acroField.getWidgets()[0].getRectangle();
        a.acroField.getWidgets().forEach((w) => {
          const r = w.getRectangle();
          w.setRectangle({ x: r.x, y: r.y, width: end.x + end.width - r.x, height: r.height });
        });
        b.defaultUpdateAppearances(font);   // la plantilla no trae apariencia; pdf-lib la necesita para quitarlo
        form.removeField(b);                // el campo cubierto ya no se usa en este PDF
      });

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
                const txt = safe(v, font);
                f.setText(txt);
                fitText(f, txt, font);
              }
            });
          }
        } catch (e) { log.push(`${key}: ${e.message}`); }
      }
      // Botones de la plantilla (Print / Clear Form...) que no deben salir en el PDF final
      (map.remove || []).forEach((n) => { const f = find(n); if (f) form.removeField(f); });
      // Regenerar casillas (palomita negra) y textos con la fuente en negritas
      form.getFields().forEach((f) => { if (f instanceof PDFCheckBox) f.defaultUpdateAppearances(); });
      form.updateFieldAppearances(font);
      styleFields(pdf, form, font);   // pdf-lib reescribe el DA al regenerar: volver a dejarlo negro/negritas
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
