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
    let dr = af.has(PDFName.of("DR")) ? af.lookup(PDFName.of("DR"), PDFDict) : null;
    if (!dr) { dr = ctx.obj({}); af.set(PDFName.of("DR"), dr); }
    let fonts = dr.has(PDFName.of("Font")) ? dr.lookup(PDFName.of("Font"), PDFDict) : null;
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
    // Sin plantilla (formas preimpresas como el REG 262): página en blanco del tamaño del mapa
    const pdf = templateBytes ? await PDFDocument.load(templateBytes) : await PDFDocument.create();
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
      // Solo texto en coordenadas (origen abajo-izquierda, en puntos), para imprimir sobre la
      // forma preimpresa. Cada dato es un campo editable sin borde ni fondo.
      //   "x","y": inicio del texto (align "left") o centro ("center"); "y" es el renglón base.
      //   "type":"digits": un dígito por casilla, alineado a la derecha (odómetro).
      // Calibración: &dx= y &dy= mueven todo (puntos; + derecha / + arriba).
      const form = pdf.getForm();
      const { TextAlignment } = PDFLib;
      const dx = parseFloat(get("dx")) || 0, dy = parseFloat(get("dy")) || 0;
      const clean = (v) => (v == null || String(v).trim() === "-" ? "" : String(v).trim());

      // Cadena de dueños: una hoja por traspaso (vendedor -> comprador)
      let sheets = [{}];
      const ch = map.chain;
      if (ch) {
        const people = [clean(get(ch.first)),
          ...String(get(ch.param) || "").split("|").map(clean).filter(Boolean),
          clean(get(ch.last))];
        sheets = [];
        for (let k = 0; k < people.length - 1; k++) {
          const o = {};
          const last = people.length - 2;
          // en la primera/última hoja se respeta el valor propio de cada campo (a20, a14) si viene
          ch.seller.forEach((f) => (o[f] = (k === 0 && clean(get(f))) || people[k]));
          ch.buyer.forEach((f) => (o[f] = (k === last && clean(get(f))) || people[k + 1]));
          if (k > 0) (ch.firstOnly || []).forEach((f) => (o[f] = ""));
          if (k < people.length - 2) (ch.lastOnly || []).forEach((f) => (o[f] = ""));
          sheets.push(o);
        }
      }

      const [pw, ph] = map.pageSize || [612, 792];
      const hA = (size) => font.heightAtSize(size, { descender: false });
      const addField = (page, name, value, f, cx, size) => {
        const w = f.w || 100, h = size + 4;
        const yb = f.y + dy;
        const x = f.align === "center" ? cx + dx - w / 2 : cx + dx - 1;
        const y = yb - 1 - (h - 2 - hA(size)) / 2;     // así pdf-lib deja el renglón base justo en yb
        const tf = form.createTextField(name);
        tf.addToPage(page, { x, y, width: w, height: h, borderWidth: 0,
          backgroundColor: undefined, borderColor: undefined, textColor: rgb(0, 0, 0), font });
        tf.setAlignment(f.align === "center" ? TextAlignment.Center : TextAlignment.Left);
        tf.setFontSize(size);
        if (value) { const t = safe(value, font); tf.setText(t); fitText(tf, t, font); }
      };

      sheets.forEach((over, k) => {
        const page = templateBytes ? pdf.getPage(k) : pdf.addPage([pw, ph]);
        const pre = sheets.length > 1 ? `h${k + 1}.` : "";
        for (const [key, f] of Object.entries(map.fields)) {
          const v = key in over ? over[key] : clean(get(key));
          const size = f.size || 12;
          if (f.type === "digits") {
            const d = String(v || "").replace(/\D/g, "").slice(-f.xs.length);
            const off = f.xs.length - d.length;
            f.xs.forEach((cx, i) =>
              addField(page, `${pre}${key}_${i + 1}`, d[i - off] || "", { ...f, align: "center", w: f.w || 20 }, cx, size));
          } else {
            addField(page, pre + key, v, f, f.x, size);
          }
        }
      });
      styleFields(pdf, form, font);
      form.updateFieldAppearances(font);
      styleFields(pdf, form, font);
      if (opts.flatten !== false) form.flatten();
    }
    // Si el MediaBox es más grande que lo que se ve (CropBox), igualarlos
    pdf.getPages().forEach((pg) => {
      const c = pg.getCropBox();
      pg.setMediaBox(c.x, c.y, c.width, c.height);
    });
    return { bytes: await pdf.save(), log };
  }

  /**
   * Une varios documentos en un solo PDF, conservando los campos editables.
   * Cada documento se agrupa bajo un campo padre "d1", "d2"... para que los nombres
   * repetidos (p. ej. dos REG 101) no choquen entre sí.
   * @param {{bytes:Uint8Array}[]} parts  PDFs ya generados por buildPdf (sin aplanar o aplanados)
   * @param {{duplex?:boolean}} opts  duplex: agrega una hoja en blanco a cada documento con
   *        páginas impares (menos al último), para que cada uno empiece en hoja nueva al imprimir a doble cara
   */
  async function mergePdfs(parts, opts = {}) {
    const { PDFObjectCopier, PDFArray, PDFRef } = PDFLib;
    const out = await PDFDocument.create();
    const ctx = out.context;
    const fieldsArr = ctx.obj([]);
    let dr = null;

    for (let i = 0; i < parts.length; i++) {
      const src = await PDFDocument.load(parts[i].bytes);
      const pages = await out.copyPages(src, src.getPageIndices());
      const roots = new Map();
      pages.forEach((pg) => {
        out.addPage(pg);
        const annots = pg.node.Annots();
        if (!annots) return;
        for (let k = 0; k < annots.size(); k++) {
          const ref = annots.get(k);
          let node = ctx.lookup(ref), nodeRef = ref;
          // al aplanar, pdf-lib puede dejar referencias a widgets ya borrados: se saltan
          if (!(node instanceof PDFDict) || node.get(PDFName.of("Subtype"))?.toString() !== "/Widget") continue;
          // subir hasta el campo raíz
          while (node.get(PDFName.of("Parent"))) {
            nodeRef = node.get(PDFName.of("Parent"));
            node = ctx.lookup(nodeRef, PDFDict);
          }
          if (nodeRef instanceof PDFRef) roots.set(nodeRef.toString(), nodeRef);
        }
      });
      if (opts.duplex && pages.length % 2 === 1 && i < parts.length - 1) {
        const last = pages[pages.length - 1];
        out.addPage([last.getWidth(), last.getHeight()]);   // página en blanco del mismo tamaño
      }
      if (roots.size) {
        const parentRef = ctx.register(ctx.obj({ T: PDFLib.PDFString.of("d" + (i + 1)), Kids: [...roots.values()] }));
        roots.forEach((r) => ctx.lookup(r, PDFDict).set(PDFName.of("Parent"), parentRef));
        fieldsArr.push(parentRef);
      }
      // Recursos de fuentes del formulario (HeBo, ZaDb, ...) del primer documento con formulario
      const srcAf = src.catalog.lookup(PDFName.of("AcroForm"), PDFDict);
      if (srcAf && srcAf.lookup(PDFName.of("DR"))) {
        const copied = PDFObjectCopier.for(src.context, ctx).copy(srcAf.lookup(PDFName.of("DR")));
        if (!dr) dr = copied;
        else {   // juntar fuentes de los demás
          const f1 = dr.lookup(PDFName.of("Font"), PDFDict), f2 = copied.lookup(PDFName.of("Font"), PDFDict);
          if (f1 && f2) f2.keys().forEach((k) => { if (!f1.has(k)) f1.set(k, f2.get(k)); });
        }
      }
    }
    if (fieldsArr.size()) {
      const af = ctx.obj({ Fields: fieldsArr, DA: PDFLib.PDFString.of("/HeBo 0 Tf 0 g") });
      if (dr) af.set(PDFName.of("DR"), dr);
      out.catalog.set(PDFName.of("AcroForm"), ctx.register(af));
    }
    return await out.save();
  }

  const api = { buildPdf, mergePdfs };
  if (typeof module !== "undefined") module.exports = api; else root.DocFiller = api;
})(typeof window !== "undefined" ? window : globalThis);
