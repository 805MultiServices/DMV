# docs-filler

Llena formularios PDF (REG 101 y REG 256 del DMV de California) desde parámetros en la URL.
Todo corre en el navegador con [pdf-lib](https://pdf-lib.js.org/): **no hay backend**.

## Uso

```
index.html?doc=fill-101&a1=26U7013&a2=JYARJ28Y9HA000719&a3=YAMA&a4=APELLIDO%20NOMBRE
index.html?doc=fill-256&a1=26U7013&a2=JYARJ28Y9HA000719&a3=2017%20/%20YAMA&a9=APELLIDO&a13=10/03/2026
```

Con Vercel o Netlify (ya incluyen reglas de rewrite) también funcionan URLs limpias: `/fill-101?a1=...`

El PDF sale **editable**: los campos quedan prellenados y se pueden corregir en el mismo PDF. Para guardarlo con los cambios usa el botón de descarga o imprimir del visor, no el botón azul (ese baja la versión original prellenada).

Opciones extra: `&edit=0` o `&final=1` (lo entrega cerrado, sin campos editables), `&download=1` (descarga directa), `&name=mi-archivo`.
Valores vacíos o `-` se ignoran.

## Estructura

```
index.html          visor: lee la URL, genera el PDF y lo muestra
js/engine.js        motor de llenado (navegador y Node)
templates/*.pdf     PDFs en blanco (ya sin cifrado)
maps/*.json         qué parámetro `aN` va en qué campo
tools/list-fields.js   lista los campos de un PDF
tools/test.js          genera un PDF desde la terminal
```

## Publicar

- **GitHub Pages**: Settings → Pages → rama `main`. URL: `https://USUARIO.github.io/REPO/?doc=fill-101&a1=...`
- **Vercel / Netlify**: importa el repo, sin build. Habilita `/fill-101?...`

## Agregar un documento nuevo

1. Copia el PDF a `templates/NNN.pdf`. Si está cifrado: `qpdf --decrypt in.pdf out.pdf`.
2. `npm i pdf-lib && node tools/list-fields.js templates/NNN.pdf` para ver los campos.
3. Crea `maps/fill-NNN.json` (copia uno existente).
4. Si el PDF **no** tiene campos, usa `"mode": "overlay"` con `{"page":0,"x":120,"y":640,"size":10}` por parámetro (origen abajo-izquierda, en puntos).

Tipos de entrada en el mapa: texto (por defecto), `"type":"check"` (casilla), `"type":"chars"` (un carácter por casilla, p. ej. la licencia) y `"type":"choice"` (AND/OR).

## Parámetros de `fill-101`

| Param | Qué es |
|---|---|
| `a1` | Placa (sección superior) |
| `a2` | VIN (superior) |
| `a3` | Marca (superior) |
| `a4` | Propietario 1: APELLIDO, NOMBRE, 2o NOMBRE |
| `a5` | Licencia/ID propietario 1 (8 casillas) |
| `a7` | Dirección del propietario |
| `a8` | Propietario 2 |
| `a9` | Licencia/ID propietario 2 (8 casillas) |
| `a10` | Propietario 3 |
| `a11` | Licencia/ID propietario 3 (8 casillas) |
| `a12` | Conector prop.1->2: AND u OR |
| `a13` | Conector prop.2->3: AND u OR |
| `a15` | Ciudad |
| `a16` | Estado (CA, TX...) |
| `a17` | ZIP |
| `a18` | Fecha de compra |
| `a19` | Precio de compra (sin $) |
| `a21` | Lienholder: nombre |
| `a22` | Lienholder: dirección |
| `a23` | Lienholder: ciudad |
| `a24` | Lienholder: estado |
| `a25` | Lienholder: ZIP |
| `a26` | Casilla 'FOR LEASED VEHICLES ONLY' (casilla: `1`/`x`/`si`) |
| `a27` | Casilla 'FOR VESSELS ONLY' (casilla: `1`/`x`/`si`) |
| `a28` | Lessee/vessel: dirección |
| `a29` | Lessee/vessel: ciudad |
| `a30` | Lessee/vessel: estado |
| `a31` | Placa (Error/Erasure) |
| `a32` | VIN (Error/Erasure) |
| `a33` | Marca (Error/Erasure) |
| `a34` | Número de línea borrada |
| `a35` | Razón del error |
| `a36` | Fecha de firma |
| `a37` | Dirección (Error/Erasure) |
| `a38` | Ciudad (Error/Erasure) |
| `a39` | Estado (Error/Erasure) |
| `a40` | Teléfono: lada (3 dígitos) |
| `a41` | Teléfono: número |
| `a42` | Lessee/vessel: ZIP |

## Parámetros de `fill-256`

Las secciones A–D están en la hoja 1 y E–H en la hoja 2. Placa, VIN y Año/Marca (`a1`–`a3`) se llenan en ambas hojas a la vez.

| Param | Qué es |
|---|---|
| `a1` | Placa (aparece en las 2 hojas) |
| `a2` | VIN (2 hojas) |
| `a3` | Año / Marca (2 hojas) |
| `a7` | A: valor de mercado actual |
| `a8` | G: texto 'I, the undersigned, state:' (multilínea) |
| `a9` | H: apellido (o nombre completo si no usas a10/a11) |
| `a10` | H: nombre |
| `a11` | H: segundo nombre |
| `a12` | H: teléfono (7 dígitos) |
| `a13` | H: fecha |
| `a14` | H: lada |
| `a15` | A: Family transfer (casilla: `1`/`x`/`si`) |
| `a16` | A: Addition/deletion of family member (casilla: `1`/`x`/`si`) |
| `a17` | A: Gift (casilla: `1`/`x`/`si`) |
| `a18` | A: Court order (casilla: `1`/`x`/`si`) |
| `a19` | A: Inheritance (casilla: `1`/`x`/`si`) |
| `a20` | B: smog en últimos 90 días (casilla: `1`/`x`/`si`) |
| `a21` | B: powered by (casilla) (casilla: `1`/`x`/`si`) |
| `a22` | B: electricity (casilla: `1`/`x`/`si`) |
| `a23` | B: diesel (casilla: `1`/`x`/`si`) |
| `a24` | B: other (casilla: `1`/`x`/`si`) |
| `a25` | B: other (texto) |
| `a26` | B: ubicado fuera de California (casilla: `1`/`x`/`si`) |
| `a27` | B: 'being transferred from/between' (casilla) (casilla: `1`/`x`/`si`) |
| `a28` | B: padre/abuelo/hijo/cónyuge... (casilla: `1`/`x`/`si`) |
| `a29` | B: sole proprietorship -> propietario (casilla: `1`/`x`/`si`) |
| `a30` | B: compañías de leasing (casilla: `1`/`x`/`si`) |
| `a31` | B: lessor y lessee, sin cambio (casilla: `1`/`x`/`si`) |
| `a32` | B: lessor y operador ≥ 1 año (casilla: `1`/`x`/`si`) |
| `a33` | B: individuo(s) agregado(s) como propietario(s) (casilla: `1`/`x`/`si`) |
| `a34` | C: Transfer only (casilla: `1`/`x`/`si`) |
| `a35` | C: Title only (casilla: `1`/`x`/`si`) |
| `a36` | D: placa discapacitado |
| `a37` | D: placa veterano discapacitado |
| `a38` | D: placard permanente |
| `a39` | D: placa del vehículo |
| `a40` | D: marca |
| `a41` | D: VIN |
| `a42` | D: enviar a - nombre |
| `a43` | D: dirección |
| `a44` | D: ciudad |
| `a45` | D: estado (2 letras) |
| `a46` | D: ZIP |
| `a47` | E: valor de mercado |
| `a48` | E: costo de los cambios |
| `a49` | E: fecha de los cambios |
| `a50` | E: unladen weight (casilla) (casilla: `1`/`x`/`si`) |
| `a51` | E: unladen weight: motivo |
| `a52` | E: motive power (casilla) (casilla: `1`/`x`/`si`) |
| `a53` | E: motive power DE |
| `a54` | E: motive power A |
| `a55` | E: body type (casilla) (casilla: `1`/`x`/`si`) |
| `a56` | E: body type DE |
| `a57` | E: body type A |
| `a58` | E: ejes (casilla) (casilla: `1`/`x`/`si`) |
| `a59` | E: ejes DE |
| `a60` | E: ejes A |
| `a61` | F: 'same person' (casilla) (casilla: `1`/`x`/`si`) |
| `a62` | F: nombre 1 |
| `a63` | F: nombre 2 |
| `a64` | F: nombre mal escrito (casilla) (casilla: `1`/`x`/`si`) |
| `a65` | F: corregir a |
| `a66` | F: cambio de nombre (casilla) (casilla: `1`/`x`/`si`) |
| `a67` | F: de |
| `a68` | F: a |

## `overlay-256` (compatible con las ligas de gabodocs)

Mismo formulario REG 256, pero con el orden de parámetros de `gabodocs.ray.mx/overlay-256`, para no cambiar las fórmulas de AppSheet:

| Param | Qué es |
|---|---|
| `a1`–`a6` | Placa, VIN, Año / Marca (se repiten; salen en las 2 hojas) |
| `a7` | Sección G: "I, the undersigned, state:" (ERROR_EN_TITULO) |
| `a8` | A: valor de mercado actual |
| `a9` | H: nombre impreso |
| `a10` | H: nombre |
| `a11` | H: lada (3 dígitos) |
| `a12` | H: teléfono (555-1234) |
| `a13` | H: fecha |
| `a14` | H: segundo nombre |

Las casillas y demás secciones (`a15` en adelante) son iguales que en `fill-256`.

**Nombre en la sección H:** si `a10` (nombre) viene vacío, el campo de `a9` se alarga para cubrir "Printed last name" y "First name" juntos, así cabe el nombre completo. Si llega `a10`, cada parte va en su campo. En cualquier campo de una línea, si el texto no cabe, la letra se reduce sola (mínimo 6 pt) en vez de cortarse.

> **Nota sobre la sección B del 256:** en el PDF original los nombres internos de varios checkboxes están corridos respecto al renglón que tienen al lado. El mapa ya está corregido por posición visual.

## Privacidad

Los datos viajan en la URL (historial, logs del hosting si usas redirects, mensajes donde compartas el link). Para datos sensibles como licencia o nombre completo, considera un formulario con POST/estado en memoria en lugar de links.
