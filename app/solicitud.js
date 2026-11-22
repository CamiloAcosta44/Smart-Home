// Asistente de solicitudes (solicitarCasa / solicitarDispositivo del UML).
// Casa: datos → plano en cuadrícula (1 cuadro = 1 m) → dispositivos por habitación → resumen.
// Dispositivos: casa y habitación → catálogo → resumen.
// Depende de los ayudantes de app.js (h, s, ico, api, toast, boton, S, mostrarVista).
'use strict';

Object.assign(ICONOS, {
  plano: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h8v9"/><path d="M11 3v5"/><path d="M15 12h6"/>',
  edificio: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  maletin: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  arriba: '<path d="m18 15-6-6-6 6"/>', abajo: '<path d="m6 9 6 6 6-6"/>',
  izquierda: '<path d="m15 18-6-6 6-6"/>', derecha: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', cerrar: '<path d="M18 6 6 18M6 6l12 12"/>',
  agarre: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  enviar: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
});

const CATALOGO = [
  { tipo: 'sensor_movimiento', nombre: 'Sensor de movimiento', desc: 'Detecta presencia para encender luces o avisarte.', arduino: true },
  { tipo: 'sensor_luz', nombre: 'Sensor de luz', desc: 'Mide la luz para abrir o cerrar las cortinas.', arduino: true },
  { tipo: 'led', nombre: 'Luz inteligente', desc: 'Se enciende desde la app, con reglas u horarios.', arduino: true },
  { tipo: 'cortina', nombre: 'Cortina motorizada', desc: 'Ábrela, ciérrala o déjala a medias.', arduino: true },
  { tipo: 'sensor_temperatura', nombre: 'Sensor de temperatura', desc: 'Mide la temperatura de la habitación.' },
  { tipo: 'sensor_puerta', nombre: 'Sensor de puerta', desc: 'Avisa cuando se abre una puerta o ventana.' },
  { tipo: 'enchufe', nombre: 'Enchufe inteligente', desc: 'Prende y apaga cualquier aparato.' },
  { tipo: 'camara', nombre: 'Cámara', desc: 'Mira tu casa desde cualquier lugar.' },
  { tipo: 'alarma', nombre: 'Alarma', desc: 'Sirena para cuando estás fuera.' },
];
const CAT = Object.fromEntries(CATALOGO.map(c => [c.tipo, c]));
const TIPOS_HAB = [['sala', 'Sala', '#60A5FA'], ['habitacion', 'Habitación', '#A78BFA'], ['cocina', 'Cocina', '#F59E0B'], ['bano', 'Baño', '#22D3EE'],
  ['comedor', 'Comedor', '#F472B6'], ['estudio', 'Estudio', '#34D399'], ['garaje', 'Garaje', '#94A3B8'], ['patio', 'Patio', '#84CC16'], ['otro', 'Otro', '#CBD5E1']];
const HAB = Object.fromEntries(TIPOS_HAB.map(([k, n, c]) => [k, { nombre: n, color: c }]));
const VIVIENDAS = [['casa', 'Casa', 'casa', 'Con patio, garaje o varias plantas.'], ['apartamento', 'Apartamento', 'edificio', 'Una unidad dentro de un edificio.'],
  ['oficina', 'Oficina', 'maletin', 'Un espacio de trabajo.']];
const M = 40; // unidades del SVG por metro
const PASOS = { casa: ['Tipo', 'Datos', 'Plano', 'Dispositivos', 'Resumen'], dispositivo: ['Tipo', 'Ubicación', 'Dispositivos', 'Resumen'] };

let W = null; // estado del asistente (se conserva al cambiar de sección)

function nuevoAsistente() {
  W = {
    paso: 0, tipo: null, dir: 1, sel: null, tipoHab: 'sala', enviado: null,
    casa: { direccion: '', tipo_vivienda: 'casa', ancho: 10, largo: 8, habitaciones: [], comentarios: '' },
    disp: { id_casa: S.casa, id_habitacion: null, nueva: false, nueva_habitacion: '', cant: {}, comentarios: '', habs: null },
  };
}

// ---------- sección ----------

function vistaSolicitudes() {
  if (W?.enviado) W = null; // al volver a la sección después de enviar, se ve la lista
  const cont = h('div', { id: 'sol-cont' });
  cont.append(W ? asistente() : misSolicitudes());
  return h('div', {},
    h('header', { class: 'cabecera' },
      h('div', {}, h('p', { class: 'mut' }, 'Pide una casa nueva o más dispositivos'), h('h1', {}, 'Solicitudes')),
      W ? null : boton([ico('mas'), 'Nueva solicitud'], 'primario', async () => { nuevoAsistente(); mostrarVista(); })),
    cont);
}

function misSolicitudes() {
  const lista = h('div', { class: 'sol-lista' }, h('p', { class: 'mut' }, 'Cargando…'));
  (async () => {
    try {
      const ss = (await api('/api/solicitudes')).filter(x => x.id_usuario === S.usuario.id);
      if (!ss.length) {
        lista.replaceChildren(vacio('plano', 'Aún no has hecho solicitudes', 'Diseña tu casa en un plano o pide dispositivos nuevos.',
          boton([ico('mas'), 'Hacer mi primera solicitud'], 'primario', async () => { nuevoAsistente(); mostrarVista(); })));
        return;
      }
      lista.replaceChildren(...ss.map((x, i) => {
        const card = h('article', { class: 'tarjeta sol-card', style: `animation-delay:${i * 50}ms` },
          h('div', { class: 'fila' },
            h('div', { class: 'disp-ico' }, ico(x.tipo === 'casa' ? 'plano' : 'foco')),
            h('div', { class: 'crece' }, h('h2', {}, x.tipo === 'casa' ? 'Casa nueva' : 'Dispositivos'), h('p', { class: 'mut peq' }, fecha(x.fecha))),
            h('span', { class: 'estado ' + x.estado }, ESTADO_TXT[x.estado])),
          h('p', {}, x.descripcion),
          x.detalle ? h('details', { class: 'plegable' }, h('summary', {}, 'Ver detalle'), detalleSolicitud(x)) : null);
        return card;
      }));
    } catch (e) { lista.replaceChildren(h('p', { class: 'error' }, e.message)); }
  })();
  return lista;
}

// Detalle de una solicitud (lo usan «Mis solicitudes» y Administración).
function detalleSolicitud(x) {
  const d = x.detalle;
  const listaDisp = ds => h('ul', { class: 'chips-disp' }, ds.map(p => h('li', {}, ico(ICONO_DISP[p.tipo] || 'foco'), `${p.cantidad} × ${CAT[p.tipo]?.nombre ?? p.tipo}`)));
  if (x.tipo === 'casa') {
    const viv = VIVIENDAS.find(v => v[0] === d.tipo_vivienda)?.[1] ?? '';
    return h('div', { class: 'detalle-sol' },
      h('p', { class: 'mut peq' }, `${viv} · ${d.ancho} × ${d.largo} m · ${d.ancho * d.largo} m²`),
      dibujarPlano(d, { soloVer: true }),
      h('ul', { class: 'lista' }, d.habitaciones.map(hb => h('li', {},
        h('span', { class: 'punto-hab', style: `background:${HAB[hb.tipo]?.color}` }),
        h('div', { class: 'crece' }, h('p', {}, `${hb.nombre} · ${hb.w * hb.h} m²`), hb.dispositivos.length ? listaDisp(hb.dispositivos) : h('p', { class: 'mut peq' }, 'Sin dispositivos'))))),
      d.comentarios ? h('p', { class: 'mut peq' }, `Comentarios: ${d.comentarios}`) : null);
  }
  return h('div', { class: 'detalle-sol' }, listaDisp(d.dispositivos), d.comentarios ? h('p', { class: 'mut peq' }, `Comentarios: ${d.comentarios}`) : null);
}

// ---------- asistente ----------

function asistente() {
  if (W.enviado) return exito();
  const pasos = PASOS[W.tipo ?? 'casa'];
  const nombre = pasos[W.paso];
  const cuerpo = h('div', { class: 'paso-cuerpo' + (W.dir ? (W.dir > 0 ? ' entra-der' : ' entra-izq') : '') }, renderPaso(nombre));
  W.dir = 0;
  const ultimo = W.paso === pasos.length - 1;
  return h('section', { class: 'tarjeta asistente', 'aria-labelledby': 'asis-titulo' },
    h('div', { class: 'fila' },
      h('div', { class: 'crece' }, h('p', { class: 'mut peq' }, W.tipo ? `Paso ${W.paso + 1} de ${pasos.length}` : 'Empecemos'),
        h('h2', { id: 'asis-titulo', class: 'asis-titulo' }, TITULOS[nombre])),
      boton(ico('cerrar'), 'icono', async () => {
        if (W.tipo && !confirmar('¿Descartar esta solicitud?')) return;
        W = null; mostrarVista();
      }, { 'aria-label': 'Cancelar solicitud' })),
    W.tipo ? h('ol', { class: 'pasos', 'aria-label': 'Progreso' }, pasos.map((p, i) => h('li', {
      class: i < W.paso ? 'hecho' : i === W.paso ? 'actual' : '', 'aria-current': i === W.paso ? 'step' : null,
    }, h('span', { class: 'pasos-num' }, i < W.paso ? ico('check') : String(i + 1)), h('span', { class: 'pasos-txt' }, p)))) : null,
    W.tipo ? h('div', { class: 'progreso', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': pasos.length, 'aria-valuenow': W.paso + 1 },
      h('span', { style: `width:${(W.paso + 1) / pasos.length * 100}%` })) : null,
    cuerpo,
    h('p', { class: 'error', role: 'alert', id: 'asis-error' }),
    W.paso > 0 ? h('div', { class: 'asis-pie' },
      boton([ico('izquierda'), 'Atrás'], '', async () => irA(W.paso - 1)),
      ultimo ? boton([ico('enviar'), 'Enviar solicitud'], 'primario', enviarSolicitud)
        : boton(['Siguiente', ico('derecha')], 'primario', async () => irA(W.paso + 1))) : null);
}

const TITULOS = {
  Tipo: '¿Qué quieres solicitar?', Datos: 'Cuéntanos de tu casa', Plano: 'Dibuja el plano', Dispositivos: '¿Qué quieres en cada lugar?',
  Ubicación: '¿Dónde los quieres?', Resumen: 'Revisa y envía',
};

function renderPaso(nombre) {
  if (nombre === 'Tipo') return pasoTipo();
  if (nombre === 'Datos') return pasoDatos();
  if (nombre === 'Plano') return pasoPlano();
  if (nombre === 'Dispositivos') return W.tipo === 'casa' ? pasoDispositivosCasa() : pasoCatalogoSimple();
  if (nombre === 'Ubicación') return pasoUbicacion();
  return pasoResumen();
}

function refrescar() { // vuelve a dibujar el asistente sin animación de paso
  const cont = $('#sol-cont');
  if (cont && W) cont.replaceChildren(asistente());
}

function irA(n) {
  if (n > W.paso) {
    const err = validarPaso(PASOS[W.tipo][W.paso]);
    if (err) { mostrarError(err); return; }
  }
  W.dir = n > W.paso ? 1 : -1;
  W.paso = n;
  refrescar();
  $('.asistente')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function mostrarError(msg) {
  const e = $('#asis-error');
  if (!e) return toast(msg, true);
  e.textContent = msg;
  e.classList.remove('sacudir'); void e.offsetWidth; e.classList.add('sacudir');
}

const totalDisp = obj => Object.values(obj).reduce((a, n) => a + n, 0);
function validarPaso(nombre) {
  const c = W.casa, d = W.disp;
  if (nombre === 'Tipo' && !W.tipo) return 'Elige una opción.';
  if (nombre === 'Datos' && c.direccion.trim().length < 3) return 'Escribe la dirección de la casa.';
  if (nombre === 'Plano' && !c.habitaciones.length) return 'Dibuja al menos una habitación en el plano.';
  if (nombre === 'Dispositivos' && W.tipo === 'casa' && !c.habitaciones.some(hb => totalDisp(hb.disp))) return 'Agrega al menos un dispositivo a alguna habitación.';
  if (nombre === 'Ubicación' && !d.id_casa) return 'Elige la casa.';
  if (nombre === 'Ubicación' && !d.nueva && !d.id_habitacion) return 'Elige la habitación.';
  if (nombre === 'Ubicación' && d.nueva && !d.nueva_habitacion.trim()) return 'Escribe el nombre de la habitación nueva.';
  if (nombre === 'Dispositivos' && W.tipo === 'dispositivo' && !totalDisp(d.cant)) return 'Elige al menos un dispositivo.';
  return null;
}

// Tarjetas grandes de opción única (radio).
function opciones(grupo, items, actual, alElegir) {
  return h('div', { class: 'opciones', role: 'radiogroup', 'aria-label': grupo }, items.map(([valor, titulo, icono, desc, deshabilitado]) =>
    h('button', {
      type: 'button', role: 'radio', class: 'opcion' + (valor === actual ? ' elegida' : ''), 'aria-checked': String(valor === actual),
      disabled: !!deshabilitado, onclick: ev => {
        ev.currentTarget.parentElement.querySelectorAll('.opcion').forEach(o => { o.classList.remove('elegida'); o.setAttribute('aria-checked', 'false'); });
        ev.currentTarget.classList.add('elegida'); ev.currentTarget.setAttribute('aria-checked', 'true');
        alElegir(valor);
      },
    }, h('span', { class: 'opcion-ico' }, ico(icono)), h('span', { class: 'opcion-check' }, ico('check')),
      h('strong', {}, titulo), h('span', { class: 'mut peq' }, deshabilitado || desc))));
}

function stepper(etiqueta, valor, min, max, alCambiar, sufijo = '') {
  const v = h('output', { class: 'stepper-valor', 'aria-live': 'polite' }, valor + sufijo);
  return h('div', { class: 'stepper', role: 'group', 'aria-label': etiqueta },
    h('button', { type: 'button', class: 'btn icono', disabled: valor <= min, 'aria-label': `Menos ${etiqueta}`, onclick: () => alCambiar(valor - 1) }, '−'),
    v,
    h('button', { type: 'button', class: 'btn icono', disabled: valor >= max, 'aria-label': `Más ${etiqueta}`, onclick: () => alCambiar(valor + 1) }, '+'));
}

// ---------- pasos ----------

function pasoTipo() {
  const sinCasas = !S.casas.length;
  return opciones('Tipo de solicitud', [
    ['casa', 'Una casa nueva', 'plano', 'Diseña el plano, las habitaciones y lo que quieres en cada una.'],
    ['dispositivo', 'Dispositivos para mi casa', 'foco', 'Agrega sensores, luces y más a una casa que ya tienes.', sinCasas && 'Primero necesitas una casa.'],
  ], W.tipo, v => { W.tipo = v; setTimeout(() => irA(1), 260); });
}

function pasoDatos() {
  const c = W.casa;
  const ext = { x: Math.max(3, ...c.habitaciones.map(hb => hb.x + hb.w)), y: Math.max(3, ...c.habitaciones.map(hb => hb.y + hb.h)) };
  const mini = h('div', { class: 'mini-casa', style: `aspect-ratio:${c.ancho} / ${c.largo}` }, h('span', {}, `${c.ancho * c.largo} m²`));
  return h('div', { class: 'rejilla-2', style: 'align-items:start' },
    h('div', {},
      h('label', { class: 'campo' }, 'Dirección',
        h('input', { value: c.direccion, maxlength: 120, autocomplete: 'street-address', placeholder: 'Ej.: Calle 45 # 12-30, Bogotá', oninput: ev => { c.direccion = ev.target.value; } }),
        h('small', { class: 'ayuda' }, 'Será el nombre de la casa en la app.')),
      h('p', { class: 'campo', style: 'margin-bottom:8px' }, 'Tipo de vivienda'),
      opciones('Tipo de vivienda', VIVIENDAS, c.tipo_vivienda, v => { c.tipo_vivienda = v; })),
    h('div', { class: 'tarjeta-sub' },
      h('p', { class: 'campo' }, 'Medidas del terreno'),
      h('div', { class: 'medidas' },
        h('div', {}, h('p', { class: 'mut peq' }, 'Ancho'), stepper('ancho', c.ancho, ext.x, 30, v => { c.ancho = v; refrescar(); }, ' m')),
        h('div', {}, h('p', { class: 'mut peq' }, 'Largo'), stepper('largo', c.largo, ext.y, 30, v => { c.largo = v; refrescar(); }, ' m'))),
      h('div', { class: 'mini-marco' }, mini),
      h('p', { class: 'mut peq' }, 'En el siguiente paso cada cuadro del plano es 1 m × 1 m.')));
}

// ---------- plano ----------

const choca = (r, ignorar) => W.casa.habitaciones.some((o, j) => j !== ignorar && r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h);
const dentro = r => r.x >= 0 && r.y >= 0 && r.x + r.w <= W.casa.ancho && r.y + r.h <= W.casa.largo;
function nombreNuevo(tipo) {
  const base = HAB[tipo].nombre, n = W.casa.habitaciones.filter(hb => hb.nombre.startsWith(base)).length;
  return n ? `${base} ${n + 1}` : base;
}
function agregarHab(r) {
  W.casa.habitaciones.push({ nombre: nombreNuevo(W.tipoHab), tipo: W.tipoHab, ...r, disp: {} });
  W.sel = W.casa.habitaciones.length - 1; W.nueva = W.sel;
  refrescar();
}
function lugarLibre(w, hh) {
  for (let y = 0; y + hh <= W.casa.largo; y++) for (let x = 0; x + w <= W.casa.ancho; x++) {
    const r = { x, y, w, h: hh };
    if (!choca(r, -1)) return r;
  }
  return null;
}

// Dibuja un plano en SVG. soloVer: sin interacción (resumen, administración).
function dibujarPlano(c, { soloVer = false, modo = 'dibujar' } = {}) {
  const A = c.ancho, L = c.largo, pad = 28;
  const svg = s('svg', { class: 'plano' + (soloVer ? ' solo-ver' : ' modo-' + modo), viewBox: `${-pad} ${-pad} ${A * M + pad + 4} ${L * M + pad + 4}`,
    role: 'img', 'aria-label': `Plano de ${A} por ${L} metros con ${c.habitaciones.length} habitaciones` });
  const rej = s('g', { class: 'cuadricula' });
  for (let i = 0; i <= A; i++) rej.append(s('line', { x1: i * M, y1: 0, x2: i * M, y2: L * M, class: i % 5 ? '' : 'mayor' }));
  for (let j = 0; j <= L; j++) rej.append(s('line', { x1: 0, y1: j * M, x2: A * M, y2: j * M, class: j % 5 ? '' : 'mayor' }));
  svg.append(rej, s('rect', { class: 'borde', x: 0, y: 0, width: A * M, height: L * M }),
    s('text', { class: 'cota', x: A * M / 2, y: -10, 'text-anchor': 'middle' }, `${A} m`),
    s('text', { class: 'cota', x: -10, y: L * M / 2, 'text-anchor': 'middle', transform: `rotate(-90 -10 ${L * M / 2})` }, `${L} m`));
  c.habitaciones.forEach((hb, i) => svg.append(dibujarHab(hb, i, soloVer)));
  return svg;
}

function dibujarHab(hb, i, soloVer) {
  const color = HAB[hb.tipo]?.color ?? '#CBD5E1';
  const w = hb.w * M, hh = hb.h * M;
  const disp = Array.isArray(hb.dispositivos) ? Object.fromEntries(hb.dispositivos.map(p => [p.tipo, p.cantidad])) : hb.disp;
  const g = s('g', { class: 'hab' + (!soloVer && W?.sel === i ? ' sel' : '') + (!soloVer && W?.nueva === i ? ' nueva' : ''),
    'data-hab-idx': i, transform: `translate(${hb.x * M} ${hb.y * M})`, style: `--c:${color}` });
  g.append(s('rect', { class: 'hab-fondo', x: 2, y: 2, width: w - 4, height: hh - 4, rx: 6 }));
  const cabe = Math.max(1, Math.floor((w - 12) / 7.5)); // caracteres que caben a 13 px
  const nombre = hb.nombre.length > cabe ? hb.nombre.slice(0, Math.max(1, cabe - 1)) + '…' : hb.nombre;
  g.append(s('text', { class: 'hab-nombre', x: 10, y: 20 }, nombre));
  if (hh >= 2 * M) g.append(s('text', { class: 'hab-area', x: 10, y: 36 }, `${hb.w * hb.h} m²`));
  // insignias de dispositivos
  const tipos = Object.entries(disp || {}).filter(([, n]) => n > 0);
  const porFila = Math.max(1, Math.floor((w - 8) / 30));
  tipos.forEach(([tipo, n], k) => {
    const fila = Math.floor(k / porFila), col = k % porFila;
    const y0 = hh - 20 - fila * 30;
    if (y0 < 24) return; // no cabe
    const b = s('g', { class: 'insignia' + (W?.pop && W.pop.i === i && W.pop.tipo === tipo ? ' pop' : ''), transform: `translate(${8 + col * 30} ${y0 - 12})` });
    b.append(s('circle', { cx: 12, cy: 12, r: 13 }));
    const ic = s('g', { class: 'insignia-ico', transform: 'translate(4 4) scale(0.67)' });
    ic.innerHTML = ICONOS[ICONO_DISP[tipo] || 'foco'];
    b.append(ic);
    if (n > 1) b.append(s('circle', { class: 'insignia-n', cx: 24, cy: 2, r: 8 }), s('text', { class: 'insignia-txt', x: 24, y: 6, 'text-anchor': 'middle' }, String(n)));
    g.append(b);
  });
  if (!soloVer) g.append(s('title', {}, `${hb.nombre}: ${hb.w} × ${hb.h} m`));
  return g;
}

function puntoEnPlano(svg, ev) {
  const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  const px = vb.x + (ev.clientX - r.left) / r.width * vb.width, py = vb.y + (ev.clientY - r.top) / r.height * vb.height;
  return [Math.floor(px / M), Math.floor(py / M)];
}

function sacudir(el) { el.classList.remove('sacudir'); void el.getBoundingClientRect(); el.classList.add('sacudir'); }

function editorPlano() {
  const c = W.casa, svg = dibujarPlano(c, { modo: 'dibujar' });
  const vista = s('rect', { class: 'vista-previa', visibility: 'hidden', rx: 6 });
  svg.append(vista);
  let arr = null;
  svg.addEventListener('pointerdown', ev => {
    const [cx, cy] = puntoEnPlano(svg, ev);
    const el = ev.target.closest('[data-hab-idx]');
    if (el) {
      const i = Number(el.dataset.habIdx), hb = c.habitaciones[i];
      arr = { modo: 'mover', i, cx, cy, el, x: hb.x, y: hb.y, movido: false };
      if (W.sel !== i) { W.sel = i; svg.querySelectorAll('.hab').forEach(g => g.classList.toggle('sel', g === el)); pintarPanel(); }
    } else if (cx >= 0 && cy >= 0 && cx < c.ancho && cy < c.largo) {
      arr = { modo: 'dibujar', cx, cy };
      vista.setAttribute('visibility', 'visible');
      mover(ev);
    } else return;
    svg.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  const rectDe = ev => {
    const [cx, cy] = puntoEnPlano(svg, ev);
    const x2 = Math.min(Math.max(cx, 0), c.ancho - 1), y2 = Math.min(Math.max(cy, 0), c.largo - 1);
    return { x: Math.min(arr.cx, x2), y: Math.min(arr.cy, y2), w: Math.abs(x2 - arr.cx) + 1, h: Math.abs(y2 - arr.cy) + 1 };
  };
  function mover(ev) {
    if (!arr) return;
    if (arr.modo === 'dibujar') {
      const r = rectDe(ev);
      Object.entries({ x: r.x * M + 2, y: r.y * M + 2, width: r.w * M - 4, height: r.h * M - 4 }).forEach(([k, v]) => vista.setAttribute(k, v));
      vista.classList.toggle('mala', choca(r, -1));
      vista.style.setProperty('--c', HAB[W.tipoHab].color);
      $('#plano-medida').textContent = `${r.w} × ${r.h} m · ${r.w * r.h} m²`;
    } else {
      const [cx, cy] = puntoEnPlano(svg, ev), hb = c.habitaciones[arr.i];
      const x = Math.min(Math.max(arr.x + cx - arr.cx, 0), c.ancho - hb.w), y = Math.min(Math.max(arr.y + cy - arr.cy, 0), c.largo - hb.h);
      arr.nx = x; arr.ny = y; arr.movido ||= x !== arr.x || y !== arr.y;
      arr.el.setAttribute('transform', `translate(${x * M} ${y * M})`);
      arr.el.classList.toggle('mala', choca({ x, y, w: hb.w, h: hb.h }, arr.i));
    }
  }
  svg.addEventListener('pointermove', mover);
  svg.addEventListener('pointerup', ev => {
    if (!arr) return;
    const a = arr, r = a.modo === 'dibujar' ? rectDe(ev) : null;
    arr = null;
    if (a.modo === 'dibujar') {
      vista.setAttribute('visibility', 'hidden');
      $('#plano-medida').textContent = '';
      if (choca(r, -1)) { sacudir(svg.parentElement); mostrarError('Esa habitación se cruza con otra. Dibújala en un espacio libre.'); return; }
      agregarHab(r);
    } else if (a.movido) {
      const hb = c.habitaciones[a.i], n = { x: a.nx, y: a.ny, w: hb.w, h: hb.h };
      if (choca(n, a.i)) {
        a.el.setAttribute('transform', `translate(${hb.x * M} ${hb.y * M})`); a.el.classList.remove('mala');
        sacudir(a.el); mostrarError('No se puede mover encima de otra habitación.'); return;
      }
      Object.assign(hb, { x: n.x, y: n.y }); refrescar();
    }
  });
  svg.addEventListener('pointercancel', () => { arr = null; refrescar(); });
  return svg;
}

let pintarPanel = () => {};
function pasoPlano() {
  const c = W.casa;
  const usados = c.habitaciones.reduce((a, hb) => a + hb.w * hb.h, 0);
  const panel = h('div', { class: 'panel-hab' });
  pintarPanel = () => panel.replaceChildren(panelHab());
  pintarPanel();
  W.nueva = null;
  return h('div', { class: 'editor' },
    h('div', { class: 'editor-plano' },
      h('div', { class: 'paleta', role: 'radiogroup', 'aria-label': 'Tipo de habitación a dibujar' }, TIPOS_HAB.map(([k, n, col]) => h('button', {
        type: 'button', role: 'radio', class: 'chip-hab' + (W.tipoHab === k ? ' elegida' : ''), 'aria-checked': String(W.tipoHab === k), style: `--c:${col}`,
        onclick: ev => { W.tipoHab = k; ev.currentTarget.parentElement.querySelectorAll('.chip-hab').forEach(b => { b.classList.toggle('elegida', b === ev.currentTarget); b.setAttribute('aria-checked', String(b === ev.currentTarget)); }); },
      }, h('span', { class: 'punto-hab' }), n))),
      h('p', { class: 'mut peq' }, 'Arrastra sobre la cuadrícula para dibujar. Arrastra una habitación para moverla. ', h('strong', { id: 'plano-medida' })),
      h('div', { class: 'marco-plano' }, editorPlano()),
      h('div', { class: 'fila', style: 'flex-wrap:wrap;gap:8px' },
        boton([ico('mas'), 'Agregar habitación'], 'chico', async () => {
          const r = lugarLibre(3, 3) || lugarLibre(2, 2) || lugarLibre(1, 1);
          if (!r) { mostrarError('No queda espacio libre en el plano. Agranda el terreno en el paso anterior.'); return; }
          agregarHab(r);
        }),
        h('span', { class: 'mut peq crece', style: 'text-align:right' }, `${c.habitaciones.length} habitaciones · ${usados} de ${c.ancho * c.largo} m²`))),
    panel);
}

function panelHab() {
  const c = W.casa, i = W.sel, hb = c.habitaciones[i];
  if (hb == null) return h('div', { class: 'tarjeta-sub vacio', style: 'padding:24px' }, ico('plano'),
    h('p', { class: 'mut' }, c.habitaciones.length ? 'Toca una habitación del plano para editarla.' : 'Elige un tipo arriba y dibuja tu primera habitación.'));
  const cambiar = (r, msg) => {
    const nuevo = { x: hb.x, y: hb.y, w: hb.w, h: hb.h, ...r };
    if (!dentro(nuevo)) return mostrarError(msg || 'Se saldría del terreno.');
    if (choca(nuevo, i)) return mostrarError('Chocaría con otra habitación.');
    Object.assign(hb, nuevo); refrescar();
  };
  return h('div', { class: 'tarjeta-sub panel-anim', style: `--c:${HAB[hb.tipo].color}` },
    h('div', { class: 'fila' }, h('span', { class: 'punto-hab grande' }), h('h3', { class: 'crece' }, 'Editar habitación'),
      boton(ico('basura'), 'icono peligro', async () => { c.habitaciones.splice(i, 1); W.sel = null; refrescar(); }, { 'aria-label': `Borrar ${hb.nombre}` })),
    h('label', { class: 'campo' }, 'Nombre', h('input', { value: hb.nombre, maxlength: 40, oninput: ev => { hb.nombre = ev.target.value; }, onchange: () => { if (!hb.nombre.trim()) hb.nombre = HAB[hb.tipo].nombre; refrescar(); } })),
    h('label', { class: 'campo' }, 'Tipo', h('select', { onchange: ev => {
      const viejo = HAB[hb.tipo].nombre; hb.tipo = ev.target.value;
      if (hb.nombre.startsWith(viejo)) hb.nombre = nombreNuevo(hb.tipo);
      refrescar();
    } }, TIPOS_HAB.map(([k, n]) => h('option', { value: k, selected: k === hb.tipo }, n)))),
    h('div', { class: 'medidas' },
      h('div', {}, h('p', { class: 'mut peq' }, 'Ancho'), stepper('ancho de la habitación', hb.w, 1, c.ancho, v => cambiar({ w: v }), ' m')),
      h('div', {}, h('p', { class: 'mut peq' }, 'Largo'), stepper('largo de la habitación', hb.h, 1, c.largo, v => cambiar({ h: v }), ' m'))),
    h('p', { class: 'mut peq' }, `Área: ${hb.w * hb.h} m²`),
    h('div', {}, h('p', { class: 'mut peq', style: 'margin-bottom:6px' }, 'Mover'),
      h('div', { class: 'cruceta' },
        boton(ico('arriba'), 'icono', async () => cambiar({ y: hb.y - 1 }), { 'aria-label': 'Mover arriba', style: 'grid-area:a' }),
        boton(ico('izquierda'), 'icono', async () => cambiar({ x: hb.x - 1 }), { 'aria-label': 'Mover a la izquierda', style: 'grid-area:i' }),
        boton(ico('derecha'), 'icono', async () => cambiar({ x: hb.x + 1 }), { 'aria-label': 'Mover a la derecha', style: 'grid-area:d' }),
        boton(ico('abajo'), 'icono', async () => cambiar({ y: hb.y + 1 }), { 'aria-label': 'Mover abajo', style: 'grid-area:b' }))));
}

// ---------- dispositivos de la casa (arrastrar al plano o tocar + / −) ----------

function pasoDispositivosCasa() {
  const c = W.casa;
  if (W.sel == null || !c.habitaciones[W.sel]) W.sel = 0;
  const svg = dibujarPlano(c, { modo: 'dispositivos' });
  svg.addEventListener('click', ev => {
    const el = ev.target.closest('[data-hab-idx]');
    if (el) { W.sel = Number(el.dataset.habIdx); W.pop = null; refrescar(); }
  });
  const hb = c.habitaciones[W.sel];
  const total = c.habitaciones.reduce((a, x) => a + totalDisp(x.disp), 0);
  W.pop = null;
  return h('div', { class: 'editor' },
    h('div', { class: 'editor-plano pegajoso' },
      h('p', { class: 'mut peq' }, 'Toca una habitación para elegirla. Arrastra un dispositivo del catálogo sobre el plano, o usa + y −.'),
      h('div', { class: 'marco-plano' }, svg),
      h('div', { class: 'chips-habs', role: 'radiogroup', 'aria-label': 'Habitación' }, c.habitaciones.map((x, i) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(i === W.sel), class: 'chip-hab' + (i === W.sel ? ' elegida' : ''), style: `--c:${HAB[x.tipo].color}`,
        onclick: () => { W.sel = i; refrescar(); },
      }, h('span', { class: 'punto-hab' }), x.nombre, totalDisp(x.disp) ? h('span', { class: 'cuenta' }, String(totalDisp(x.disp))) : null))),
      h('p', { class: 'mut peq' }, `${total} dispositivos en total`)),
    h('div', {},
      h('p', { class: 'campo', style: 'margin-bottom:8px' }, 'Agregando a: ', h('strong', { style: `color:${HAB[hb.tipo].color}` }, hb.nombre)),
      catalogo(tipo => hb.disp[tipo] || 0, (tipo, n, i = W.sel) => {
        const x = c.habitaciones[i];
        x.disp[tipo] = Math.max(0, Math.min(10, n));
        if (!x.disp[tipo]) delete x.disp[tipo];
        W.sel = i; W.pop = { i, tipo };
        refrescar();
      }, true)));
}

function pasoCatalogoSimple() {
  const d = W.disp;
  return catalogo(tipo => d.cant[tipo] || 0, (tipo, n) => {
    d.cant[tipo] = Math.max(0, Math.min(10, n));
    if (!d.cant[tipo]) delete d.cant[tipo];
    refrescar();
  }, false);
}

// Catálogo de dispositivos; con arrastrar=true las tarjetas se pueden soltar sobre una habitación del plano.
function catalogo(cantidad, fijar, arrastrar) {
  return h('div', { class: 'catalogo' }, CATALOGO.map((it, k) => {
    const n = cantidad(it.tipo);
    const card = h('div', { class: 'cat-item' + (n ? ' con' : ''), style: `animation-delay:${k * 35}ms` },
      h('div', { class: 'cat-ico' + (arrastrar ? ' asa' : ''), title: arrastrar ? 'Arrastra al plano' : null }, ico(ICONO_DISP[it.tipo] || 'foco'), arrastrar ? h('span', { class: 'cat-agarre' }, ico('agarre')) : null),
      h('div', { class: 'crece' },
        h('p', { class: 'cat-nombre' }, it.nombre),
        h('p', { class: 'mut peq' }, it.desc),
        h('span', { class: 'etiqueta' + (it.arduino ? ' ok' : '') }, it.arduino ? 'Funciona con tu Arduino' : 'Instalación especial')),
      stepper(it.nombre, n, 0, 10, v => fijar(it.tipo, v)));
    if (arrastrar) hacerArrastrable(card.querySelector('.cat-ico'), it, (i) => fijar(it.tipo, (W.casa.habitaciones[i].disp[it.tipo] || 0) + 1, i));
    return card;
  }));
}

function hacerArrastrable(asa, it, alSoltar) {
  let ini = null, fantasma = null, sobre = null;
  const habBajo = ev => document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.plano [data-hab-idx]');
  asa.addEventListener('pointerdown', ev => { ini = { x: ev.clientX, y: ev.clientY }; asa.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  asa.addEventListener('pointermove', ev => {
    if (!ini) return;
    if (!fantasma && Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) > 6) {
      fantasma = h('div', { class: 'fantasma', 'aria-hidden': 'true' }, ico(ICONO_DISP[it.tipo] || 'foco'), it.nombre);
      document.body.append(fantasma);
    }
    if (!fantasma) return;
    fantasma.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
    const g = habBajo(ev);
    if (g !== sobre) { sobre?.classList.remove('destino'); g?.classList.add('destino'); sobre = g; }
  });
  const fin = ev => {
    if (!ini) return;
    const g = fantasma && habBajo(ev);
    fantasma?.remove();
    sobre?.classList.remove('destino');
    if (g) alSoltar(Number(g.dataset.habIdx));
    else if (!fantasma) alSoltar(W.sel); // toque sin arrastrar: agrega a la habitación elegida
    ini = fantasma = sobre = null;
  };
  asa.addEventListener('pointerup', fin);
  asa.addEventListener('pointercancel', () => { fantasma?.remove(); sobre?.classList.remove('destino'); ini = fantasma = sobre = null; });
}

// ---------- dispositivos para una casa existente ----------

function pasoUbicacion() {
  const d = W.disp;
  const habsCont = h('div', {}, h('p', { class: 'mut' }, 'Cargando habitaciones…'));
  const pintarHabs = () => {
    const items = (d.habs || []).map(x => [x.id, x.nombre, 'casa', `${x.dispositivos.length} dispositivos`]);
    items.push(['nueva', 'Habitación nueva', 'mas', 'Escribe su nombre']);
    habsCont.replaceChildren(
      h('p', { class: 'campo', style: 'margin-bottom:8px' }, 'Habitación'),
      opciones('Habitación', items, d.nueva ? 'nueva' : d.id_habitacion, v => {
        d.nueva = v === 'nueva'; d.id_habitacion = d.nueva ? null : v;
        nombreNueva.hidden = !d.nueva;
        if (d.nueva) nombreNueva.querySelector('input').focus();
      }),
      nombreNueva);
  };
  const nombreNueva = h('label', { class: 'campo', hidden: !d.nueva, style: 'margin-top:12px' }, 'Nombre de la habitación nueva',
    h('input', { value: d.nueva_habitacion, maxlength: 40, placeholder: 'Ej.: Cocina', oninput: ev => { d.nueva_habitacion = ev.target.value; } }));
  const cargar = async () => {
    d.habs = null; habsCont.replaceChildren(h('p', { class: 'mut' }, 'Cargando habitaciones…'));
    try { d.habs = await api(`/api/casas/${d.id_casa}/habitaciones`); pintarHabs(); }
    catch (e) { habsCont.replaceChildren(h('p', { class: 'error' }, e.message)); }
  };
  if (d.habs) pintarHabs(); else if (d.id_casa) cargar();
  return h('div', {},
    h('p', { class: 'campo', style: 'margin-bottom:8px' }, 'Casa'),
    opciones('Casa', S.casas.map(c => [c.id, c.direccion, 'casa', c.propietario ? `Dueño: ${c.propietario}` : '']), d.id_casa, v => {
      if (v !== d.id_casa) { d.id_casa = v; d.id_habitacion = null; d.nueva = false; cargar(); }
    }),
    h('div', { style: 'margin-top:20px' }, habsCont));
}

// ---------- resumen y envío ----------

function pasoResumen() {
  const comentarios = W.tipo === 'casa' ? W.casa : W.disp;
  const campo = h('label', { class: 'campo' }, 'Comentarios para el administrador (opcional)',
    h('textarea', { maxlength: 500, placeholder: 'Ej.: prefiero que la instalación sea un sábado', oninput: ev => { comentarios.comentarios = ev.target.value; } }, comentarios.comentarios));
  if (W.tipo === 'casa') {
    const c = W.casa, total = c.habitaciones.reduce((a, x) => a + totalDisp(x.disp), 0);
    const viv = VIVIENDAS.find(v => v[0] === c.tipo_vivienda)[1];
    return h('div', {},
      h('div', { class: 'resumen-cifras' },
        cifra(c.direccion, viv), cifra(`${c.ancho * c.largo} m²`, `${c.ancho} × ${c.largo} m`),
        cifra(String(c.habitaciones.length), 'habitaciones'), cifra(String(total), 'dispositivos')),
      h('div', { class: 'rejilla-2', style: 'align-items:start;margin-top:16px' },
        h('div', { class: 'marco-plano' }, dibujarPlano({ ...c, habitaciones: c.habitaciones }, { soloVer: true })),
        h('ul', { class: 'lista' }, c.habitaciones.map((x, i) => h('li', {},
          h('span', { class: 'punto-hab', style: `background:${HAB[x.tipo].color}` }),
          h('div', { class: 'crece' }, h('p', {}, `${x.nombre} · ${x.w * x.h} m²`),
            h('p', { class: 'mut peq' }, Object.entries(x.disp).map(([t, n]) => `${n} × ${CAT[t].nombre}`).join(', ') || 'Sin dispositivos')),
          h('button', { type: 'button', class: 'btn chico', onclick: () => { W.sel = i; W.dir = -1; W.paso = 3; refrescar(); } }, 'Editar'))))),
      campo);
  }
  const d = W.disp, casa = S.casas.find(c => c.id === d.id_casa);
  const lugar = d.nueva ? d.nueva_habitacion.trim() + ' (nueva)' : d.habs?.find(x => x.id === d.id_habitacion)?.nombre;
  return h('div', {},
    h('div', { class: 'resumen-cifras' }, cifra(casa?.direccion ?? '', 'casa'), cifra(lugar ?? '', 'habitación'), cifra(String(totalDisp(d.cant)), 'dispositivos')),
    h('ul', { class: 'lista', style: 'margin-top:12px' }, Object.entries(d.cant).map(([t, n]) => h('li', {},
      h('div', { class: 'disp-ico' }, ico(ICONO_DISP[t] || 'foco')), h('p', { class: 'crece' }, CAT[t].nombre), h('strong', {}, `× ${n}`)))),
    campo);
}
const cifra = (valor, etiqueta) => h('div', { class: 'cifra' }, h('strong', {}, valor), h('span', { class: 'mut peq' }, etiqueta));

async function enviarSolicitud() {
  let datos;
  if (W.tipo === 'casa') {
    const c = W.casa;
    datos = { tipo: 'casa', detalle: {
      direccion: c.direccion.trim(), tipo_vivienda: c.tipo_vivienda, ancho: c.ancho, largo: c.largo, comentarios: c.comentarios.trim(),
      habitaciones: c.habitaciones.map(x => ({ nombre: x.nombre.trim() || HAB[x.tipo].nombre, tipo: x.tipo, x: x.x, y: x.y, w: x.w, h: x.h,
        dispositivos: Object.entries(x.disp).map(([tipo, cantidad]) => ({ tipo, cantidad })) })),
    } };
  } else {
    const d = W.disp;
    datos = { tipo: 'dispositivo', detalle: {
      id_casa: d.id_casa, id_habitacion: d.nueva ? null : d.id_habitacion, nueva_habitacion: d.nueva ? d.nueva_habitacion.trim() : null,
      dispositivos: Object.entries(d.cant).map(([tipo, cantidad]) => ({ tipo, cantidad })), comentarios: d.comentarios.trim(),
    } };
  }
  try {
    W.enviado = await api('/api/solicitudes', { metodo: 'POST', datos });
    refrescar();
  } catch (e) { mostrarError(e.message); }
}

function exito() {
  const marca = s('svg', { class: 'exito-check', viewBox: '0 0 52 52', 'aria-hidden': 'true' },
    s('circle', { cx: 26, cy: 26, r: 24 }), s('path', { d: 'M15 27l7 7 15-15' }));
  return h('section', { class: 'tarjeta asistente exito', role: 'status' }, marca,
    h('h2', {}, '¡Solicitud enviada!'),
    h('p', { class: 'mut' }, W.enviado.descripcion),
    h('p', { class: 'mut peq' }, 'Te avisaremos en Actividad cuando el administrador la revise.'),
    h('div', { class: 'fila', style: 'gap:8px;flex-wrap:wrap;justify-content:center' },
      boton('Ver mis solicitudes', 'primario', async () => { W = null; mostrarVista(); }),
      boton('Hacer otra', '', async () => { nuevoAsistente(); mostrarVista(); })));
}
