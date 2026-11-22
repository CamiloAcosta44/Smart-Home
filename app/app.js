// Casa Inteligente — app del usuario (InterfazUsuario del UML).
// Habla con el servidor por REST (/api/*) y recibe el estado en vivo por WebSocket (/ws).
'use strict';

const ICONOS = {
  casa: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  campana: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  persona: '<circle cx="12" cy="5" r="2"/><path d="m9 20 3-6 3 6"/><path d="m6 8 6 2 6-2"/><path d="M12 10v4"/>',
  'persona-c': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  foco: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  cortina: '<path d="M3 3h18"/><path d="M20 7H8"/><path d="M20 11H8"/><path d="M10 19h10"/><path d="M8 15h12"/><path d="M4 3v14"/><circle cx="4" cy="19" r="2"/>',
  ajustes: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  grafica: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-6"/>',
  basura: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  candado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  copiar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  descargar: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  archivo: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6"/><path d="M9 15h6"/>',
  termometro: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  puerta: '<path d="M13 4h3a2 2 0 0 1 2 2v14"/><path d="M2 20h3"/><path d="M13 20h9"/><path d="M10 12v.01"/><path d="M13 4.56v16.16a.5.5 0 0 1-.68.47L5 18V5.42a1 1 0 0 1 .76-.97l6-1.5a1 1 0 0 1 1.24.97Z"/>',
  enchufe: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  camara: '<path d="m16 13 5.2 3.1a.5.5 0 0 0 .8-.4V8.3a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  alarma: '<path d="M7 18v-6a5 5 0 1 1 10 0v6"/><path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z"/><path d="M21 12h1M18.5 4.5 18 5M2 12h1M12 2v1M4.93 4.93l.71.71"/>',
};
const ICONO_DISP = { sensor_movimiento: 'persona', sensor_luz: 'sol', led: 'foco', cortina: 'cortina',
  sensor_temperatura: 'termometro', sensor_puerta: 'puerta', enchufe: 'enchufe', camara: 'camara', alarma: 'alarma' };
const COLOR_DISP = { sensor_movimiento: 'var(--acento)', sensor_luz: 'var(--ambar)', led: 'var(--ambar)', cortina: 'var(--azul)' };
const TIPOS = { sensor_movimiento: 'Sensor de movimiento', sensor_luz: 'Sensor de luz', led: 'Luz (LED)', cortina: 'Cortina',
  sensor_temperatura: 'Sensor de temperatura', sensor_puerta: 'Sensor de puerta', enchufe: 'Enchufe inteligente', camara: 'Cámara', alarma: 'Alarma' };
const CANALES_DE = { sensor_movimiento: ['mov'], sensor_luz: ['luz'], led: ['led', 'led2'], cortina: ['cortina'] }; // canales del Arduino por tipo
const CANAL_DE = Object.fromEntries(Object.entries(CANALES_DE).map(([t, c]) => [t, c[0]])); // los que maneja el Arduino
const COMANDOS = { led: [['encender', 'Encender'], ['apagar', 'Apagar']], cortina: [['abrir', 'Abrir'], ['cerrar', 'Cerrar']] };
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

// ---------- utilidades ----------

function h(tag, attrs = {}, ...hijos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  e.append(...hijos.flat(Infinity).filter(x => x != null && x !== false));
  return e;
}
function ico(nombre) {
  const s = h('span', { class: 'ico', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24">${ICONOS[nombre]}</svg>`; // constantes propias, no datos del usuario
  return s;
}
document.querySelectorAll('[data-ico]').forEach(e => e.replaceWith(ico(e.dataset.ico)));
const $ = s => document.querySelector(s);
const almacen = {
  leer(k) { try { return localStorage.getItem(k); } catch { return null; } },
  poner(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};
const hora = f => new Date(f).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fecha = f => new Date(f).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const mayus = t => t[0].toUpperCase() + t.slice(1);

function toast(msg, mal = false) {
  const t = h('div', { class: 'toast' + (mal ? ' mal' : ''), role: mal ? 'alert' : 'status' }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 4500);
}
function vacio(icono, titulo, texto, accion) {
  return h('div', { class: 'tarjeta vacio' }, ico(icono), h('h2', {}, titulo), texto && h('p', { class: 'mut' }, texto), accion);
}
function interruptor(etiqueta, marcado, alCambiar) {
  return h('label', { class: 'interruptor' },
    h('input', { type: 'checkbox', role: 'switch', checked: marcado, 'aria-label': etiqueta, onchange: async ev => {
      ev.target.disabled = true;
      try { await alCambiar(ev.target.checked); } catch (x) { ev.target.checked = !ev.target.checked; toast(x.message, true); }
      ev.target.disabled = false;
    } }), h('span'));
}
// Botón que se deshabilita mientras su acción async corre.
function boton(texto, clase, accion, attrs = {}) {
  return h('button', { class: 'btn ' + clase, type: 'button', ...attrs, onclick: async ev => {
    const b = ev.currentTarget; b.disabled = true;
    try { await accion(b); } catch (x) { toast(x.message, true); }
    if (b.isConnected) b.disabled = false;
  } }, texto);
}

// ---------- servidor ----------

const S = {
  // Servida por el propio servidor (producción) -> mismo origen; abierta desde otro puerto (desarrollo) -> :8765.
  servidor: almacen.leer('servidor') || (location.port && location.port !== '8765' && !/^(80|443)$/.test(location.port)
    ? `${location.protocol === 'https:' ? 'https' : 'http'}://${location.hostname || 'localhost'}:8765` : location.origin),
  token: almacen.leer('token'),
  usuario: JSON.parse(almacen.leer('usuario') || 'null'),
  casas: [], casa: Number(almacen.leer('casa')) || null,
  estado: null, ultimaActualizacion: 0, ws: null, reintento: 1000,
  pendiente: {}, // idDisp -> { esperado, timer }
  instalar: null, // evento beforeinstallprompt
};

async function api(ruta, { metodo = 'GET', datos } = {}) {
  let r;
  try {
    r = await fetch(S.servidor + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(S.token && { Authorization: 'Bearer ' + S.token }) },
      body: datos ? JSON.stringify(datos) : undefined,
    });
  } catch { throw new Error('No se pudo conectar con el servidor. Revisa la dirección.'); }
  if (r.status === 401 && S.token) { cerrarSesion(false); throw new Error('Tu sesión expiró. Vuelve a entrar.'); }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(typeof d.detail === 'string' ? d.detail : 'Revisa los datos del formulario.');
  }
  return r.status === 204 ? null : r.json();
}

function conectarWS() {
  if (!S.token) return;
  const ws = new WebSocket(S.servidor.replace(/^http/, 'ws') + '/ws');
  S.ws = ws;
  ws.onopen = () => { S.reintento = 1000; ws.send(JSON.stringify({ tipo: 'hola', rol: 'app', token: S.token })); };
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.tipo === 'listo') { $('#aviso-conexion').hidden = true; seleccionarCasa(S.casa); }
    if (m.tipo === 'estado') recibirEstado(m);
    if (m.tipo === 'notificacion') recibirNotificacion(m);
  };
  ws.onclose = e => {
    if (S.ws !== ws) return;
    if (e.code === 4401) { cerrarSesion(false); return; }
    $('#aviso-conexion').hidden = false;
    setTimeout(conectarWS, S.reintento);
    S.reintento = Math.min(S.reintento * 2, 15000);
  };
}
function enviar(m) {
  if (S.ws?.readyState !== 1) { toast('Sin conexión con el servidor', true); return false; }
  S.ws.send(JSON.stringify(m));
  return true;
}

// ---------- sesión ----------

let modoCrear = false;
function modoAcceso(crear) {
  modoCrear = crear;
  $('#tab-entrar').setAttribute('aria-selected', !crear);
  $('#tab-crear').setAttribute('aria-selected', crear);
  $('#campo-nombre').hidden = !crear;
  $('#ayuda-clave').hidden = !crear;
  $('[name=contrasena]').autocomplete = crear ? 'new-password' : 'current-password';
  $('#btn-acceso').textContent = crear ? 'Crear cuenta' : 'Iniciar sesión';
  $('#error-acceso').textContent = '';
}
$('#tab-entrar').onclick = () => modoAcceso(false);
$('#tab-crear').onclick = () => modoAcceso(true);
$('#servidor').value = S.servidor;

$('#form-acceso').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target), err = $('#error-acceso'), btn = $('#btn-acceso');
  S.servidor = (f.get('servidor') || S.servidor).trim().replace(/\/+$/, '');
  almacen.poner('servidor', S.servidor);
  const datos = { correo: f.get('correo').trim(), contrasena: f.get('contrasena') };
  if (modoCrear) datos.nombre = f.get('nombre').trim();
  if (modoCrear && datos.nombre.length < 2) { err.textContent = 'Escribe tu nombre.'; return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.correo)) { err.textContent = 'Escribe un correo válido.'; return; }
  if (modoCrear && datos.contrasena.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }
  btn.disabled = true; err.textContent = '';
  try {
    const r = await api(modoCrear ? '/api/registro' : '/api/login', { metodo: 'POST', datos });
    guardarSesion(r.token, r.usuario);
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    await entrar();
  } catch (x) { err.textContent = x.message; }
  finally { btn.disabled = false; }
};

function guardarSesion(token, usuario) {
  S.token = token; S.usuario = usuario;
  almacen.poner('token', token); almacen.poner('usuario', JSON.stringify(usuario));
}
function cerrarSesion(avisar = true) {
  if (avisar && S.token) api('/api/logout', { metodo: 'POST' }).catch(() => {});
  const ws = S.ws; S.ws = null; ws?.close();
  S.token = S.usuario = S.estado = null; S.casas = [];
  almacen.poner('token', null); almacen.poner('usuario', null);
  $('#app').hidden = true; $('#acceso').hidden = false;
}
$('#salir').onclick = () => cerrarSesion();

async function entrar() {
  try {
    S.usuario = await api('/api/yo'); // valida el token guardado y trae el rol actual
    almacen.poner('usuario', JSON.stringify(S.usuario));
    await cargarCasas();
  } catch (x) {
    if (!S.token) return; // la sesión expiró: ya se mostró el acceso
    if (!S.usuario) { cerrarSesion(false); $('#error-acceso').textContent = x.message; return; }
    $('#aviso-conexion').hidden = false;
  }
  $('#acceso').hidden = true; $('#app').hidden = false;
  $('#nav-admin').hidden = S.usuario.rol !== 'admin';
  conectarWS();
  cargarNoLeidas();
  mostrarVista();
}

async function cargarCasas() {
  S.casas = await api('/api/casas');
  if (!S.casas.some(c => c.id === S.casa)) S.casa = S.casas[0]?.id ?? null;
  almacen.poner('casa', S.casa);
}
function seleccionarCasa(id) {
  S.casa = id; almacen.poner('casa', id);
  S.estado = null;
  if (id) enviar({ tipo: 'seleccionar', idCasa: id });
}
const casaActual = () => S.casas.find(c => c.id === S.casa);

// ---------- navegación ----------

const VISTAS = { inicio: vistaInicio, automatizar: vistaAutomatizar, historial: vistaHistorial, solicitudes: () => vistaSolicitudes(), // en solicitud.js
  actividad: vistaActividad, cuenta: vistaCuenta, admin: vistaAdmin };
let vistaActual = null;
function mostrarVista() {
  let v = location.hash.slice(1);
  if (!VISTAS[v] || (v === 'admin' && S.usuario.rol !== 'admin')) v = 'inicio';
  vistaActual = v;
  document.querySelectorAll('.nav a').forEach(a => a.removeAttribute('aria-current'));
  document.querySelector(`.nav a[data-vista="${v}"]`)?.setAttribute('aria-current', 'page');
  $('#vista').replaceChildren(VISTAS[v]());
  if (v === 'inicio') actualizarInicio();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', () => S.token && S.usuario && mostrarVista());

// Encabezado común con el selector de casa (seleccionarCasa del UML).
function cabeceraCasa(antetitulo, extra) {
  const c = casaActual();
  let titulo;
  if (S.casas.length > 1) {
    titulo = h('select', { class: 'selector-casa', 'aria-label': 'Casa', onchange: ev => { seleccionarCasa(Number(ev.target.value)); mostrarVista(); } },
      S.casas.map(x => h('option', { value: x.id, selected: x.id === S.casa }, x.direccion)));
  } else titulo = h('h1', {}, c ? c.direccion : 'Mi casa');
  return h('header', { class: 'cabecera' }, h('div', { style: 'min-width:0' }, h('p', { class: 'mut' }, antetitulo), titulo), extra);
}
function sinCasa() {
  return vacio('casa', 'Aún no tienes una casa asignada', 'Pide una casa en Cuenta y un administrador la revisará.',
    h('a', { class: 'btn primario', href: '#cuenta' }, 'Solicitar casa'));
}

// ---------- estado en vivo ----------

function recibirEstado(m) {
  if (m.idCasa && m.idCasa !== S.casa) return; // respuesta de una casa anterior
  S.estado = m; S.ultimaActualizacion = Date.now();
  for (const d of m.dispositivos || []) {
    const p = S.pendiente[d.id];
    if (p && d.estado === p.esperado) { clearTimeout(p.timer); delete S.pendiente[d.id]; }
  }
  const c = casaActual();
  if (c && m.casa) Object.assign(c, m.casa, { puenteConectado: m.puenteConectado });
  if (vistaActual === 'inicio') actualizarInicio();
  if (vistaActual === 'actividad') pintarEventos();
}
setInterval(() => vistaActual === 'inicio' && pintarChips(), 1000);

async function recibirNotificacion(n) {
  toast(n.mensaje, /^Alerta|desconectó/.test(n.mensaje));
  puntoNotif(true);
  if ('Notification' in window && Notification.permission === 'granted' && document.hidden)
    new Notification('Casa Inteligente', { body: n.mensaje, icon: 'icono-192.png' });
  if (/solicitud de casa fue aprobada/.test(n.mensaje)) {
    await cargarCasas();
    if (!S.estado || S.estado.sinCasa) seleccionarCasa(S.casa);
    if (vistaActual === 'inicio') mostrarVista();
  }
  if (vistaActual === 'actividad') cargarNotificaciones();
  if (vistaActual === 'admin' && /Nueva solicitud/.test(n.mensaje)) mostrarVista();
  if (vistaActual === 'solicitudes' && !W && /Tu solicitud/.test(n.mensaje)) mostrarVista();
}
function puntoNotif(on) { document.querySelectorAll('.punto-notif').forEach(p => { p.hidden = !on; }); }
async function cargarNoLeidas() {
  try { puntoNotif((await api('/api/notificaciones')).some(n => !n.leida)); } catch {}
}

// ---------- vista: inicio ----------

function vistaInicio() {
  if (!S.casa) return h('div', {}, h('header', { class: 'cabecera' }, h('div', {}, h('p', { class: 'mut' }, `Hola, ${S.usuario.nombre}`), h('h1', {}, 'Bienvenido'))), sinCasa());
  return h('div', {}, cabeceraCasa(`Hola, ${S.usuario.nombre}`, h('div', { class: 'chips', id: 'chips' })), h('div', { id: 'cuerpo-inicio' }));
}

function actualizarInicio() {
  const cuerpo = $('#cuerpo-inicio'), e = S.estado;
  if (!cuerpo || !e) return;
  if (e.sinCasa) { cuerpo.replaceChildren(sinCasa()); return; }
  pintarChips();
  if (!cuerpo.querySelector('#interruptores')) {
    cuerpo.replaceChildren(h('div', { class: 'rejilla-2', id: 'interruptores' }), h('div', { id: 'habitaciones' }));
  }
  pintarInterruptores(e.casa);
  const cont = $('#habitaciones');
  if (!e.dispositivos.length) {
    if (!cont.querySelector('.vacio')) cont.replaceChildren(h('div', { class: 'seccion' },
      vacio('foco', 'Esta casa aún no tiene dispositivos', 'Pídelos en Cuenta → Solicitudes; el administrador los agrega.')));
    return;
  }
  cont.querySelector('.vacio')?.parentElement.remove();
  const vistos = new Set();
  for (const d of e.dispositivos) {
    vistos.add(String(d.id));
    let grupo = cont.querySelector(`[data-hab="${d.id_habitacion}"]`);
    if (!grupo) {
      grupo = h('section', { class: 'grupo-hab', 'data-hab': d.id_habitacion }, h('h2', {}, d.habitacion), h('div', { class: 'rejilla' }));
      cont.append(grupo);
    }
    let card = cont.querySelector(`[data-id="${d.id}"]`);
    if (!card) { card = tarjetaDispositivo(d); grupo.lastChild.append(card); }
    card.actualizar(d);
  }
  cont.querySelectorAll('[data-id]').forEach(c => vistos.has(c.dataset.id) || c.remove()); // dispositivos borrados
  cont.querySelectorAll('[data-hab]').forEach(g => g.lastChild.children.length || g.remove());
}

function pintarChips() {
  const c = $('#chips'), e = S.estado;
  if (!c || !e || e.sinCasa) return;
  const seg = Math.round((Date.now() - S.ultimaActualizacion) / 1000);
  const chips = [h('span', { class: 'chip ' + (e.puenteConectado ? 'ok' : 'mal') }, e.puenteConectado ? 'Arduino conectado' : 'Arduino desconectado')];
  if (e.puenteConectado) chips.push(h('span', { class: 'chip sin' }, seg < 3 ? 'En vivo' : `Actualizado hace ${seg} s`));
  if (e.casa.modo_ausente) chips.push(h('span', { class: 'chip mal' }, 'Modo ausente'));
  c.replaceChildren(...chips);
}

function pintarInterruptores(casa) {
  const cont = $('#interruptores');
  const fila = (id, icono, titulo, texto, marcado, campo, valorOn, valorOff) => {
    let t = cont.querySelector('#' + id);
    if (!t) {
      t = h('div', { class: 'tarjeta fila disp', id },
        h('div', { class: 'disp-ico' }, ico(icono)),
        h('div', { class: 'crece' }, h('h2', {}, titulo), h('p', { class: 'mut peq' })),
        interruptor(titulo, marcado, on => api(`/api/casas/${S.casa}`, { metodo: 'PATCH', datos: { [campo]: on ? valorOn : valorOff } })));
      cont.append(t);
    }
    const inp = t.querySelector('input');
    if (!inp.disabled) inp.checked = marcado;
    t.querySelector('p').textContent = texto;
    t.classList.toggle('activo', marcado);
  };
  const auto = casa.estado_sistema === 'encendido';
  fila('t-auto', 'ajustes', 'Automatización', auto ? 'Las reglas y horarios se ejecutan solos.' : 'Pausada: solo control manual.', auto, 'estado_sistema', 'encendido', 'apagado');
  fila('t-ausente', 'candado', 'Modo ausente', casa.modo_ausente ? 'Te avisamos si hay movimiento.' : 'Actívalo cuando salgas de casa.', casa.modo_ausente, 'modo_ausente', true, false);
}

function tarjetaDispositivo(d) {
  const valor = h('p', { class: 'disp-valor' }), detalle = h('p', { class: 'mut peq' });
  const card = h('article', { class: 'tarjeta disp', 'data-id': d.id, style: `--color:${COLOR_DISP[d.tipo]}` },
    h('div', { class: 'disp-cab' }, h('div', { class: 'disp-ico' }, ico(ICONO_DISP[d.tipo])),
      h('div', { class: 'crece' }, h('h3', { class: 'peq mut' }, d.nombre), valor)));
  const botones = COMANDOS[d.tipo] || [];
  const btns = botones.map(([acc, txt]) => h('button', { class: 'btn', onclick: () => accionar(d, acc) }, txt));
  const barra = d.tipo === 'sensor_luz' ? h('div', { class: 'barra', role: 'presentation' }, h('span')) : null;
  let rango, rangoTxt;
  if (d.tipo === 'cortina') {
    rangoTxt = h('span', {}, '');
    rango = h('input', { type: 'range', min: 0, max: 100, step: 10, 'aria-label': 'Apertura de la cortina en porcentaje',
      oninput: ev => { rangoTxt.textContent = ev.target.value + ' %'; },
      onchange: ev => accionar(d, 'posicion', Number(ev.target.value)) });
  }
  card.append(...[barra, detalle,
    rango && h('div', { class: 'deslizador' }, rango, h('div', { class: 'fila' }, h('span', {}, 'Cerrada'), rangoTxt, h('span', {}, 'Abierta'))),
    btns.length ? h('div', { class: 'disp-acciones' }, btns) : null].filter(Boolean));

  card.actualizar = d => {
    const v = d.estado, p = S.pendiente[d.id], conectado = S.estado.puenteConectado && d.canal;
    let activo = false, txt = '—', det = '';
    if (d.tipo === 'sensor_movimiento') { activo = v === '1'; txt = v == null ? '—' : activo ? 'Movimiento' : 'Sin movimiento'; det = v == null ? '' : activo ? 'Detectado ahora' : 'Todo quieto'; }
    if (d.tipo === 'sensor_luz') {
      const lux = Number(v); activo = v != null;
      txt = v == null ? '—' : `${lux} lux`;
      det = v == null ? '' : lux >= 800 ? 'Mucha luz' : lux <= 200 ? 'Poca luz' : 'Luz normal';
      barra.firstChild.style.width = (v == null ? 0 : Math.min(100, Math.log10(lux + 1) / 4 * 100)) + '%'; // escala log hasta 10 000 lux
    }
    if (d.tipo === 'led') { activo = v === '1'; txt = v == null ? '—' : activo ? 'Encendida' : 'Apagada'; }
    if (d.tipo === 'cortina') {
      activo = v != null && v !== '0';
      txt = v == null ? '—' : v === '0' ? 'Cerrada' : v === '100' ? 'Abierta' : `${v} % abierta`;
      if (!p && document.activeElement !== rango) { rango.value = v ?? 0; rangoTxt.textContent = (v ?? 0) + ' %'; }
      rango.disabled = !!p || !conectado;
    }
    if (!CANAL_DE[d.tipo]) txt = v ?? 'Instalado';
    if (!d.canal) det = CANAL_DE[d.tipo] ? 'Sin conectar al Arduino' : 'Pendiente de instalación';
    if (p) det = 'Enviando al Arduino…';
    card.classList.toggle('activo', activo);
    valor.textContent = txt;
    detalle.textContent = det; detalle.hidden = !det;
    btns.forEach((b, i) => {
      const acc = botones[i][0];
      const marcado = acc === 'abrir' ? v != null && v !== '0' : acc === 'cerrar' || acc === 'apagar' ? v === '0' : v === '1';
      b.disabled = !!p || !conectado;
      b.classList.toggle('primario', marcado);
      b.setAttribute('aria-pressed', marcado);
    });
    if (d.tipo === 'sensor_movimiento') {
      const pul = card.querySelector('.pulso');
      if (activo && !pul) card.querySelector('.disp-cab').append(h('span', { class: 'pulso', 'aria-hidden': 'true' }));
      if (!activo && pul) pul.remove();
    }
  };
  return card;
}

const ESPERADO = { encender: '1', apagar: '0', abrir: '100', cerrar: '0' };
function accionar(d, accion, valor) {
  if (!enviar({ tipo: 'control', idDisp: d.id, accion, valor })) return;
  clearTimeout(S.pendiente[d.id]?.timer);
  S.pendiente[d.id] = { esperado: accion === 'posicion' ? String(valor) : ESPERADO[accion], timer: setTimeout(() => {
    delete S.pendiente[d.id];
    toast(`${d.nombre}: el Arduino no respondió`, true);
    actualizarInicio();
  }, 5000) };
  actualizarInicio();
}

// ---------- vista: automatizar (reglas y horarios) ----------

function vistaAutomatizar() {
  if (!S.casa) return h('div', {}, h('header', { class: 'cabecera' }, h('h1', {}, 'Automatizar')), sinCasa());
  const reglasUl = h('ul', { class: 'lista' }, h('li', { class: 'mut' }, 'Cargando…'));
  const horariosUl = h('ul', { class: 'lista' }, h('li', { class: 'mut' }, 'Cargando…'));
  const formReglas = h('div'), formHorarios = h('div');
  let disps = [];
  async function cargar() {
    try {
      const [habs, rs, hs] = await Promise.all([api(`/api/casas/${S.casa}/habitaciones`), api(`/api/casas/${S.casa}/reglas`), api(`/api/casas/${S.casa}/horarios`)]);
      disps = habs.flatMap(x => x.dispositivos.map(d => ({ ...d, habitacion: x.nombre })));
      pintarReglas(rs); pintarHorarios(hs);
      formReglas.replaceChildren(formRegla(disps, cargar));
      formHorarios.replaceChildren(formHorario(disps, cargar));
    } catch (x) { reglasUl.replaceChildren(h('li', { class: 'error' }, x.message)); }
  }
  const nombreDisp = id => disps.find(d => d.id === id)?.nombre ?? 'dispositivo borrado';
  function pintarReglas(rs) {
    reglasUl.replaceChildren(...(rs.length ? rs.map(r => {
      const s = disps.find(d => d.id === r.id_sensor);
      const cond = s?.tipo === 'sensor_movimiento' ? `${s.nombre}: ${r.valor ? 'hay movimiento' : 'no hay movimiento'}`
        : `${nombreDisp(r.id_sensor)} ${r.operador === '>=' ? '≥' : '≤'}`;
      const umbral = s?.tipo === 'sensor_luz' ? h('input', { class: 'umbral', type: 'number', min: 0, max: 100000, step: 10, value: r.valor,
        'aria-label': `Umbral en lux de ${r.nombre}`, onchange: async ev => {
          const v = Number(ev.target.value);
          if (!(v >= 0)) { ev.target.value = r.valor; return; }
          try { await api(`/api/reglas/${r.id}`, { metodo: 'PATCH', datos: { valor: v } }); r.valor = v; toast('Umbral guardado'); }
          catch (x) { ev.target.value = r.valor; toast(x.message, true); }
        } }) : null;
      const acc = r.comando === 'notificar' ? `avisar «${r.mensaje}»` : `${r.comando} ${nombreDisp(r.id_actuador)}`;
      return h('li', {},
        h('div', { class: 'crece' }, h('p', {}, r.nombre),
          h('p', { class: 'mut peq fila', style: 'gap:6px;flex-wrap:wrap' }, h('span', {}, 'Si ' + cond), umbral, umbral && h('span', {}, 'lux'), h('span', {}, '→ ' + acc))),
        interruptor(`Activar ${r.nombre}`, r.activa, on => api(`/api/reglas/${r.id}`, { metodo: 'PATCH', datos: { activa: on } })),
        boton(ico('basura'), 'icono peligro', async () => {
          if (!confirmar(`¿Borrar la regla «${r.nombre}»?`)) return;
          await api(`/api/reglas/${r.id}`, { metodo: 'DELETE' }); toast('Regla borrada'); cargar();
        }, { 'aria-label': `Borrar ${r.nombre}` }));
    }) : [h('li', { class: 'mut' }, 'Aún no hay reglas.')]));
  }
  function pintarHorarios(hs) {
    horariosUl.replaceChildren(...(hs.length ? hs.map(x => {
      const dias = x.dias.length === 7 ? 'todos los días' : x.dias.split('').map(n => DIAS_LARGOS[n - 1]).join(', ');
      return h('li', {},
        h('div', { class: 'crece' }, h('p', {}, `${x.hora.slice(0, 5)} · ${x.nombre}`),
          h('p', { class: 'mut peq' }, `${mayus(x.comando)} ${nombreDisp(x.id_actuador)}, ${dias}`)),
        interruptor(`Activar ${x.nombre}`, x.activo, on => api(`/api/horarios/${x.id}`, { metodo: 'PATCH', datos: { activo: on } })),
        boton(ico('basura'), 'icono peligro', async () => {
          if (!confirmar(`¿Borrar el horario «${x.nombre}»?`)) return;
          await api(`/api/horarios/${x.id}`, { metodo: 'DELETE' }); toast('Horario borrado'); cargar();
        }, { 'aria-label': `Borrar ${x.nombre}` }));
    }) : [h('li', { class: 'mut' }, 'Aún no hay horarios.')]));
  }
  cargar();
  return h('div', {}, cabeceraCasa('Automatizar'),
    h('div', { class: 'rejilla-2' },
      h('section', { class: 'tarjeta', 'aria-labelledby': 't-reglas' }, h('h2', { id: 't-reglas' }, 'Reglas'),
        h('p', { class: 'mut peq' }, 'Se ejecutan cuando un sensor cambia.'), reglasUl, formReglas),
      h('section', { class: 'tarjeta', 'aria-labelledby': 't-hor' }, h('h2', { id: 't-hor' }, 'Horarios'),
        h('p', { class: 'mut peq' }, 'Se ejecutan a una hora fija.'), horariosUl, formHorarios)));
}

// Confirmación propia (sin diálogos del navegador, que bloquean la página).
let porConfirmar = null;
function confirmar(msg) {
  if (porConfirmar === msg) { porConfirmar = null; return true; }
  porConfirmar = msg; toast(msg + ' Toca otra vez para confirmar.');
  setTimeout(() => { if (porConfirmar === msg) porConfirmar = null; }, 4000);
  return false;
}

function opcionesAcciones(disps) {
  return disps.filter(d => COMANDOS[d.tipo]).flatMap(d => COMANDOS[d.tipo].map(([c, t]) => h('option', { value: `${d.id}:${c}` }, `${t} ${d.nombre}`)));
}

function formRegla(disps, alGuardar) {
  const sensores = disps.filter(d => d.tipo === 'sensor_movimiento' || d.tipo === 'sensor_luz');
  if (!sensores.length) return h('p', { class: 'mut peq', style: 'margin-top:12px' }, 'Esta casa no tiene sensores para crear reglas.');
  const err = h('p', { class: 'error', role: 'alert' });
  const sensor = h('select', { name: 'sensor', 'aria-label': 'Sensor' }, sensores.map(d => h('option', { value: d.id }, d.nombre)));
  const condMov = h('select', { name: 'mov', 'aria-label': 'Condición' }, h('option', { value: '1' }, 'detecta movimiento'), h('option', { value: '0' }, 'deja de detectar'));
  const condOp = h('select', { name: 'op', 'aria-label': 'Comparación' }, h('option', { value: '>=' }, 'mide al menos'), h('option', { value: '<=' }, 'mide como máximo'));
  const condVal = h('input', { name: 'valor', type: 'number', min: 0, step: 10, value: 500, 'aria-label': 'Lux' });
  const luxTxt = h('span', {}, 'lux');
  const accion = h('select', { name: 'accion', 'aria-label': 'Acción' }, opcionesAcciones(disps), h('option', { value: 'notificar' }, 'Enviarme una notificación'));
  const mensaje = h('label', { class: 'campo', hidden: true }, 'Mensaje', h('input', { name: 'mensaje', maxlength: 200, placeholder: 'Ej.: Alguien entró a la sala' }));
  const actualizar = () => {
    const mov = sensores.find(d => d.id === Number(sensor.value)).tipo === 'sensor_movimiento';
    condMov.hidden = !mov; condOp.hidden = condVal.hidden = luxTxt.hidden = mov;
    mensaje.hidden = accion.value !== 'notificar';
  };
  sensor.onchange = accion.onchange = actualizar;
  const form = h('form', { novalidate: true, onsubmit: async ev => {
    ev.preventDefault();
    const f = new FormData(form), btn = form.querySelector('[type=submit]');
    const s = sensores.find(d => d.id === Number(f.get('sensor')));
    const mov = s.tipo === 'sensor_movimiento';
    const datos = { nombre: f.get('nombre').trim(), id_sensor: s.id, operador: mov ? '==' : f.get('op'), valor: mov ? Number(f.get('mov')) : Number(f.get('valor')) };
    if (f.get('accion') === 'notificar') Object.assign(datos, { comando: 'notificar', mensaje: f.get('mensaje').trim() });
    else { const [id, c] = f.get('accion').split(':'); Object.assign(datos, { comando: c, id_actuador: Number(id) }); }
    if (datos.nombre.length < 2) { err.textContent = 'Ponle un nombre a la regla.'; return; }
    if (!mov && !(f.get('valor') !== '' && datos.valor >= 0)) { err.textContent = 'Escribe un valor de luz válido.'; return; }
    if (datos.comando === 'notificar' && !datos.mensaje) { err.textContent = 'Escribe el mensaje de la notificación.'; return; }
    btn.disabled = true; err.textContent = '';
    try { await api(`/api/casas/${S.casa}/reglas`, { metodo: 'POST', datos }); toast('Regla creada'); alGuardar(); }
    catch (x) { err.textContent = x.message; btn.disabled = false; }
  } },
    h('label', { class: 'campo' }, 'Nombre', h('input', { name: 'nombre', maxlength: 80, placeholder: 'Ej.: Luz al anochecer' })),
    h('div', { class: 'oracion' }, h('span', {}, 'Si'), sensor, condMov, condOp, condVal, luxTxt),
    h('div', { class: 'oracion' }, h('span', {}, 'entonces'), accion),
    mensaje, err, h('button', { class: 'btn primario', type: 'submit' }, 'Crear regla'));
  actualizar();
  return h('details', { class: 'plegable', style: 'margin-top:12px' }, h('summary', {}, ico('mas'), 'Nueva regla'), form);
}

function formHorario(disps, alGuardar) {
  const opciones = opcionesAcciones(disps);
  if (!opciones.length) return h('p', { class: 'mut peq', style: 'margin-top:12px' }, 'Esta casa no tiene luces ni cortinas para programar.');
  const err = h('p', { class: 'error', role: 'alert' });
  const form = h('form', { novalidate: true, onsubmit: async ev => {
    ev.preventDefault();
    const f = new FormData(form), btn = form.querySelector('[type=submit]');
    const [id, c] = f.get('accion').split(':');
    const datos = { nombre: f.get('nombre').trim(), hora: f.get('hora'), dias: f.getAll('dia').join(''), id_actuador: Number(id), comando: c };
    if (datos.nombre.length < 2) { err.textContent = 'Ponle un nombre al horario.'; return; }
    if (!datos.hora) { err.textContent = 'Elige la hora.'; return; }
    if (!datos.dias) { err.textContent = 'Elige al menos un día.'; return; }
    btn.disabled = true; err.textContent = '';
    try { await api(`/api/casas/${S.casa}/horarios`, { metodo: 'POST', datos }); toast('Horario creado'); alGuardar(); }
    catch (x) { err.textContent = x.message; btn.disabled = false; }
  } },
    h('div', { class: 'form-grid' },
      h('label', { class: 'campo' }, 'Nombre', h('input', { name: 'nombre', maxlength: 80, placeholder: 'Ej.: Cerrar al anochecer' })),
      h('label', { class: 'campo' }, 'Hora', h('input', { name: 'hora', type: 'time', value: '19:00' })),
      h('label', { class: 'campo completo' }, 'Acción', h('select', { name: 'accion' }, opciones))),
    h('fieldset', { style: 'border:0;padding:0;margin:0' }, h('legend', { class: 'campo', style: 'margin:0' }, 'Días'),
      h('div', { class: 'dias' }, DIAS.map((d, i) => h('label', { title: DIAS_LARGOS[i] },
        h('input', { type: 'checkbox', name: 'dia', value: i + 1, checked: true, 'aria-label': DIAS_LARGOS[i] }), h('span', { 'aria-hidden': 'true' }, d))))),
    err, h('button', { class: 'btn primario', type: 'submit' }, 'Crear horario'));
  return h('details', { class: 'plegable', style: 'margin-top:12px' }, h('summary', {}, ico('mas'), 'Nuevo horario'), form);
}

// ---------- vista: historial (gráficas) ----------

function vistaHistorial() {
  if (!S.casa) return h('div', {}, h('header', { class: 'cabecera' }, h('h1', {}, 'Historial')), sinCasa());
  let horas = Number(almacen.leer('horas')) || 24;
  const cuerpo = h('div', { class: 'rejilla-2' }, h('p', { class: 'mut' }, 'Cargando…'));
  const seg = h('div', { class: 'segmento', role: 'group', 'aria-label': 'Periodo' },
    [[24, '24 horas'], [168, '7 días']].map(([n, t]) => h('button', { 'aria-pressed': String(n === horas), onclick: ev => {
      horas = n; almacen.poner('horas', n);
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === ev.currentTarget));
      cargar();
    } }, t)));
  async function cargar() {
    try {
      const r = await api(`/api/casas/${S.casa}/historial?horas=${horas}`);
      const hasta = Date.now(), desde = hasta - horas * 3600e3;
      if (!r.series.length) { cuerpo.replaceChildren(vacio('grafica', 'Sin sensores', 'Esta casa no tiene sensores con historial.')); return; }
      cuerpo.replaceChildren(...r.series.map(x => {
        const pts = x.puntos.map(([t, v]) => [Date.parse(t), Number(v)]);
        const luz = x.tipo === 'sensor_luz';
        const resumen = !pts.length ? 'Sin datos en este periodo'
          : luz ? `Promedio ${Math.round(pts.reduce((a, p) => a + p[1], 0) / pts.length)} lux · máximo ${Math.max(...pts.map(p => p[1]))} lux`
            : `${pts.reduce((a, p) => a + p[1], 0)} detecciones`;
        const paso = luz ? (horas <= 24 ? 900e3 : 3 * 3600e3) : (horas <= 24 ? 3600e3 : 86400e3);
        return h('section', { class: 'tarjeta', 'aria-label': x.nombre },
          h('h2', {}, luz ? `${x.nombre} (lux)` : `${x.nombre}: detecciones por ${horas <= 24 ? 'hora' : 'día'}`),
          h('p', { class: 'mut peq', style: 'margin-bottom:12px' }, resumen),
          pts.length ? (luz ? graficaLinea(pts, desde, hasta, 'lux') : graficaBarras(pts, desde, hasta, paso)) : null,
          pts.length ? h('details', {}, h('summary', { class: 'mut peq', style: 'cursor:pointer;min-height:44px;display:flex;align-items:center' }, 'Ver como tabla'),
            h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, h('th', {}, 'Momento'), h('th', {}, luz ? 'Lux promedio' : 'Detecciones'))),
              h('tbody', {}, pts.slice().reverse().map(([t, v]) => h('tr', {}, h('td', {}, fecha(t)), h('td', {}, v)))))) : null);
      }));
    } catch (x) { cuerpo.replaceChildren(h('p', { class: 'error' }, x.message)); }
  }
  cargar();
  return h('div', {}, cabeceraCasa('Historial', seg), cuerpo);
}

const SVG = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...hijos) {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...hijos.flat());
  return e;
}
function maxBonito(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
const etiquetaT = (t, largo) => new Date(t).toLocaleString([], largo ? { day: 'numeric', month: 'short' } : { hour: '2-digit', minute: '2-digit' });

// Marco común: un solo eje, rejilla tenue y capa de tooltip (guía dataviz).
function marco(desde, hasta, ymax) {
  const W = 600, H = 220, m = { i: 44, d: 12, a: 10, b: 26 };
  const x = t => m.i + (t - desde) / (hasta - desde) * (W - m.i - m.d);
  const y = v => H - m.b - v / ymax * (H - m.a - m.b);
  const largo = hasta - desde > 2 * 86400e3;
  const rej = s('g', { class: 'rej' }), eje = s('g', { class: 'eje' });
  for (let i = 0; i <= 4; i++) {
    const v = ymax * i / 4;
    rej.append(s('line', { x1: m.i, x2: W - m.d, y1: y(v), y2: y(v) }));
    eje.append(s('text', { x: m.i - 8, y: y(v) + 4, 'text-anchor': 'end' }, String(Math.round(v))));
  }
  for (let i = 0; i <= 4; i++) {
    const t = desde + (hasta - desde) * i / 4;
    eje.append(s('text', { x: x(t), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle' }, etiquetaT(t, largo)));
  }
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, rej, eje);
  const tip = h('div', { class: 'tooltip', hidden: true });
  const cont = h('div', { class: 'grafica' }, svg, tip);
  const mostrar = (px, py, texto) => {
    const r = svg.getBoundingClientRect(), k = r.width / W;
    tip.textContent = texto; tip.hidden = false;
    tip.style.left = Math.max(60, Math.min(r.width - 60, px * k)) + 'px'; tip.style.top = py * k + 'px';
  };
  return { W, H, m, x, y, svg, cont, mostrar, ocultar: () => { tip.hidden = true; }, largo };
}

function graficaLinea(pts, desde, hasta, unidad) {
  const g = marco(desde, hasta, maxBonito(Math.max(...pts.map(p => p[1]))));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${g.x(p[0]).toFixed(1)},${g.y(p[1]).toFixed(1)}`).join('');
  const base = g.y(0);
  g.svg.append(s('path', { class: 'area', d: `${d}L${g.x(pts.at(-1)[0])},${base}L${g.x(pts[0][0])},${base}Z` }), s('path', { class: 'linea', d }));
  g.svg.setAttribute('aria-label', `Línea de luz en ${unidad}, ${pts.length} puntos`);
  const cruz = s('line', { class: 'cruz', y1: g.m.a, y2: base, visibility: 'hidden' });
  const punto = s('circle', { class: 'punto-g', r: 5, visibility: 'hidden' });
  const capa = s('rect', { x: g.m.i, y: 0, width: g.W - g.m.i - g.m.d, height: g.H, fill: 'transparent' });
  g.svg.append(cruz, punto, capa);
  const mover = ev => {
    const r = g.svg.getBoundingClientRect(), px = (ev.clientX - r.left) * g.W / r.width;
    const p = pts.reduce((a, b) => Math.abs(g.x(b[0]) - px) < Math.abs(g.x(a[0]) - px) ? b : a);
    const cx = g.x(p[0]), cy = g.y(p[1]);
    cruz.setAttribute('x1', cx); cruz.setAttribute('x2', cx); cruz.setAttribute('visibility', 'visible');
    punto.setAttribute('cx', cx); punto.setAttribute('cy', cy); punto.setAttribute('visibility', 'visible');
    g.mostrar(cx, cy, `${etiquetaT(p[0], g.largo)}${g.largo ? ' ' + etiquetaT(p[0], false) : ''} · ${p[1]} ${unidad}`);
  };
  capa.addEventListener('pointermove', mover);
  capa.addEventListener('pointerdown', mover);
  capa.addEventListener('pointerleave', () => { cruz.setAttribute('visibility', 'hidden'); punto.setAttribute('visibility', 'hidden'); g.ocultar(); });
  return g.cont;
}

function graficaBarras(pts, desde, hasta, paso) {
  const g = marco(desde, hasta, Math.ceil(Math.max(...pts.map(p => p[1]), 4) / 4) * 4); // conteos: marcas enteras
  const ancho = Math.max(3, (g.x(desde + paso) - g.x(desde)) - 2); // 2px de separación entre barras
  g.svg.setAttribute('aria-label', `Barras de detecciones de movimiento, ${pts.length} periodos con datos`);
  for (const [t, v] of pts) {
    const x0 = g.x(t) + 1, y0 = g.y(v), alto = g.y(0) - y0, r = Math.min(4, ancho / 2, alto);
    // barra con esquinas superiores redondeadas (4px), anclada a la base
    const b = s('path', { class: 'barra-g', d: `M${x0},${g.y(0)}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + ancho - r}Q${x0 + ancho},${y0} ${x0 + ancho},${y0 + r}V${g.y(0)}Z` });
    const zona = s('rect', { x: x0 - 1, y: g.m.a, width: ancho + 2, height: g.y(0) - g.m.a, fill: 'transparent' });
    const ver = () => { b.classList.add('activa'); g.mostrar(x0 + ancho / 2, y0, `${etiquetaT(t, g.largo)}${g.largo ? '' : ' – ' + etiquetaT(t + paso, false)} · ${v} detecciones`); };
    zona.addEventListener('pointerenter', ver); zona.addEventListener('pointerdown', ver);
    zona.addEventListener('pointerleave', () => { b.classList.remove('activa'); g.ocultar(); });
    g.svg.append(b, zona);
  }
  return g.cont;
}

// ---------- vista: actividad ----------

function vistaActividad() {
  const v = h('div', {},
    h('header', { class: 'cabecera' }, h('h1', {}, 'Actividad'),
      boton('Marcar todo como leído', '', async () => {
        await api('/api/notificaciones/leidas', { metodo: 'POST' }); puntoNotif(false); cargarNotificaciones();
      })),
    h('div', { class: 'rejilla-2' },
      h('section', { class: 'tarjeta', 'aria-labelledby': 't-not' }, h('h2', { id: 't-not' }, 'Notificaciones'), h('ul', { class: 'lista', id: 'notifs' }, h('li', { class: 'mut' }, 'Cargando…'))),
      h('section', { class: 'tarjeta', 'aria-labelledby': 't-ev' }, h('h2', { id: 't-ev' }, 'Últimos eventos'), h('ul', { class: 'lista', id: 'eventos' }))));
  queueMicrotask(() => { cargarNotificaciones(); pintarEventos(); });
  return v;
}
async function cargarNotificaciones() {
  const ul = $('#notifs');
  if (!ul) return;
  try {
    const ns = await api('/api/notificaciones');
    ul.replaceChildren(...(ns.length ? ns.map(n => h('li', { class: n.leida ? '' : 'no-leida' },
      h('div', { class: 'crece' }, h('p', {}, n.mensaje), h('p', { class: 'mut peq' }, fecha(n.fecha)))))
      : [h('li', { class: 'mut' }, 'No tienes notificaciones.')]));
  } catch (x) { ul.replaceChildren(h('li', { class: 'error' }, x.message)); }
}
function textoEvento(d, v) {
  if (!d) return v;
  if (d.tipo === 'sensor_movimiento') return v === '1' ? 'Movimiento detectado' : 'Sin movimiento';
  if (d.tipo === 'sensor_luz') return `Luz: ${v} lux`;
  if (d.tipo === 'led') return `${d.nombre}: ${v === '1' ? 'encendida' : 'apagada'}`;
  return `${d.nombre}: ${v === '0' ? 'cerrada' : v === '100' ? 'abierta' : v + ' % abierta'}`;
}
function pintarEventos() {
  const ul = $('#eventos'), e = S.estado;
  if (!ul) return;
  if (!e || e.sinCasa || !e.eventos.length) { ul.replaceChildren(h('li', { class: 'mut' }, !S.casa || e?.sinCasa ? 'Sin casa asignada.' : 'Aún no hay eventos.')); return; }
  const porId = Object.fromEntries(e.dispositivos.map(d => [d.id, d]));
  ul.replaceChildren(...e.eventos.map(ev => h('li', {},
    h('p', { class: 'crece' }, textoEvento(porId[ev.id_disp], ev.valor)),
    h('time', { class: 'mut peq', datetime: ev.fecha }, hora(ev.fecha)))));
}

// ---------- vista: cuenta (perfil, solicitudes, instalar) ----------

const ESTADO_TXT = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
function filaSolicitud(x, conAcciones, alCambiar) {
  return h('li', {},
    h('div', { class: 'crece' },
      h('p', {}, `${x.tipo === 'casa' ? 'Casa' : 'Dispositivo'}: ${x.descripcion}`),
      h('p', { class: 'mut peq' }, (conAcciones ? `${x.usuario} · ` : '') + fecha(x.fecha)),
      x.detalle ? h('details', { class: 'plegable' }, h('summary', {}, 'Ver detalle'), detalleSolicitud(x)) : null,
      conAcciones && x.estado === 'pendiente' ? h('div', { class: 'disp-acciones', style: 'margin-top:10px;max-width:320px' },
        boton('Aprobar', 'primario', async () => { await api(`/api/solicitudes/${x.id}`, { metodo: 'POST', datos: { aprobar: true } }); toast('Solicitud aprobada'); alCambiar(); }),
        boton('Rechazar', 'peligro', async () => { await api(`/api/solicitudes/${x.id}`, { metodo: 'POST', datos: { aprobar: false } }); toast('Solicitud rechazada'); alCambiar(); })) : null),
    h('span', { class: 'estado ' + x.estado }, ESTADO_TXT[x.estado]));
}

addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.instalar = e; if (vistaActual === 'cuenta') mostrarVista(); });
if ('serviceWorker' in navigator && isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});

function vistaCuenta() {
  const u = S.usuario;
  const instalado = matchMedia('(display-mode: standalone)').matches;
  return h('div', {}, h('header', { class: 'cabecera' }, h('h1', {}, 'Cuenta')),
    h('div', { class: 'rejilla-2' },
      h('section', { class: 'tarjeta casa-admin' },
        h('div', { class: 'fila' }, h('div', { class: 'disp-ico' }, ico('persona-c')),
          h('div', { class: 'crece' }, h('h2', {}, u.nombre), h('p', { class: 'mut peq' }, `${u.correo} · ${u.rol === 'admin' ? 'Administrador' : 'Cliente'}`))),
        h('p', { class: 'mut peq' }, 'Servidor: ', h('span', { class: 'token' }, S.servidor)),
        instalado ? h('p', { class: 'mut peq' }, 'Estás usando la app instalada.')
          : S.instalar ? boton([ico('descargar'), 'Instalar la app'], 'primario', async () => { S.instalar.prompt(); await S.instalar.userChoice; S.instalar = null; mostrarVista(); })
            : h('p', { class: 'mut peq' }, 'Para instalarla en el celular: menú del navegador → «Agregar a pantalla de inicio».'),
        u.rol === 'admin' ? h('a', { class: 'btn', href: '#admin' }, ico('escudo'), 'Administración') : null,
        h('a', { class: 'btn', href: '#solicitudes' }, ico('archivo'), 'Mis solicitudes'),
        h('a', { class: 'btn solo-movil', href: '#actividad' }, ico('campana'), 'Actividad'),
        boton([ico('salir'), 'Cerrar sesión'], 'peligro', async () => cerrarSesion()))));
}

// ---------- vista: admin (ControladorAdministracion) ----------

function vistaAdmin() {
  const casasCont = h('div', {}, h('p', { class: 'mut' }, 'Cargando…'));
  const sols = h('ul', { class: 'lista' }), usrs = h('ul', { class: 'lista' });
  const formCasa = h('div');
  async function cargar() {
    try {
      const [cs, ss, us] = await Promise.all([api('/api/casas'), api('/api/solicitudes'), api('/api/admin/usuarios')]);
      ss.sort((a, b) => (a.estado !== 'pendiente') - (b.estado !== 'pendiente'));
      sols.replaceChildren(...(ss.length ? ss.map(x => filaSolicitud(x, true, cargar)) : [h('li', { class: 'mut' }, 'No hay solicitudes.')]));
      usrs.replaceChildren(...us.map(x => h('li', {},
        h('div', { class: 'crece' }, h('p', {}, x.nombre), h('p', { class: 'mut peq' }, x.correo)),
        h('span', { class: 'estado ' + (x.rol === 'admin' ? 'aprobada' : 'pendiente') }, x.rol === 'admin' ? 'Admin' : 'Cliente'))));
      const habs = await Promise.all(cs.map(c => api(`/api/casas/${c.id}/habitaciones`)));
      casasCont.replaceChildren(...cs.map((c, i) => tarjetaCasaAdmin(c, habs[i], cargar)));
      formCasa.replaceChildren(formNuevaCasa(us, cargar));
      S.casas = cs;
    } catch (x) { casasCont.replaceChildren(h('p', { class: 'error' }, x.message)); }
  }
  cargar();
  return h('div', {}, h('header', { class: 'cabecera' }, h('h1', {}, 'Administración')),
    h('div', { class: 'rejilla-2' },
      h('section', {}, h('h2', { style: 'margin-bottom:12px' }, 'Casas'), casasCont, formCasa),
      h('div', { style: 'display:grid;gap:16px' },
        h('section', { class: 'tarjeta' }, h('h2', {}, 'Solicitudes'), sols),
        h('section', { class: 'tarjeta' }, h('h2', {}, 'Usuarios'), usrs))));
}

function tarjetaCasaAdmin(c, habs, recargar) {
  const tokenTxt = h('span', { class: 'token' }, '••••••••••••');
  const habsUl = h('ul', { class: 'lista' }, habs.map(hb => h('li', {}, h('div', { class: 'crece' },
    h('p', {}, hb.nombre),
    hb.dispositivos.length ? h('ul', { class: 'lista' }, hb.dispositivos.map(d => h('li', {},
      h('div', { class: 'crece' }, h('p', { class: 'peq' }, d.nombre), h('p', { class: 'mut peq' }, TIPOS[d.tipo]),
        CANAL_DE[d.tipo] ? h('select', { class: 'canal-sel', 'aria-label': `Conexión de ${d.nombre}`, onchange: async ev => {
          try { await api(`/api/dispositivos/${d.id}`, { metodo: 'PATCH', datos: { canal: ev.target.value } }); toast(ev.target.value ? 'Conectado al Arduino' : 'Desconectado'); d.canal = ev.target.value || null; }
          catch (x) { ev.target.value = d.canal || ''; toast(x.message, true); }
        } }, h('option', { value: '' }, 'Sin conectar'), ...CANALES_DE[d.tipo].map(c => h('option', { value: c, selected: d.canal === c }, `Arduino (canal ${c})`)))
          : h('p', { class: 'mut peq' }, 'No lo maneja el Arduino')),
      boton(ico('basura'), 'icono peligro', async () => {
        if (!confirmar(`¿Borrar «${d.nombre}»? También se borran sus reglas y su historial.`)) return;
        await api(`/api/dispositivos/${d.id}`, { metodo: 'DELETE' }); toast('Dispositivo borrado'); recargar();
      }, { 'aria-label': `Borrar ${d.nombre}` })))) : h('p', { class: 'mut peq' }, 'Sin dispositivos.')))));
  // agregarHabitacion
  const errH = h('p', { class: 'error', role: 'alert' });
  const formHab = h('form', { class: 'oracion', novalidate: true, onsubmit: async ev => {
    ev.preventDefault();
    const nombre = formHab.elements.nombre.value.trim();
    if (nombre.length < 2) { errH.textContent = 'Escribe el nombre de la habitación.'; return; }
    try { await api(`/api/casas/${c.id}/habitaciones`, { metodo: 'POST', datos: { nombre } }); toast('Habitación agregada'); recargar(); }
    catch (x) { errH.textContent = x.message; }
  } }, h('input', { name: 'nombre', maxlength: 60, placeholder: 'Nueva habitación', 'aria-label': 'Nombre de la habitación' }),
    h('button', { class: 'btn chico', type: 'submit' }, 'Agregar'));
  // agregarDispositivo
  const errD = h('p', { class: 'error', role: 'alert' });
  const tipo = h('select', { name: 'tipo' }, Object.entries(TIPOS).map(([v, t]) => h('option', { value: v }, t)));
  const canal = h('select', { name: 'canal' });
  const llenarCanal = () => canal.replaceChildren(...(CANALES_DE[tipo.value] || []).map(c => h('option', { value: c }, `Conectado al Arduino (${c})`)), h('option', { value: '' }, 'Aún sin conectar'));
  tipo.onchange = llenarCanal; llenarCanal();
  const formDisp = h('form', { novalidate: true, onsubmit: async ev => {
    ev.preventDefault();
    const f = new FormData(formDisp);
    const datos = { nombre: f.get('nombre').trim(), tipo: f.get('tipo'), canal: f.get('canal') || null };
    if (datos.nombre.length < 2) { errD.textContent = 'Escribe el nombre del dispositivo.'; return; }
    try { await api(`/api/habitaciones/${f.get('hab')}/dispositivos`, { metodo: 'POST', datos }); toast('Dispositivo agregado'); recargar(); }
    catch (x) { errD.textContent = x.message; }
  } },
    h('div', { class: 'form-grid' },
      h('label', { class: 'campo' }, 'Nombre', h('input', { name: 'nombre', maxlength: 60, placeholder: 'Ej.: Luz de la cocina' })),
      h('label', { class: 'campo' }, 'Habitación', h('select', { name: 'hab' }, habs.map(hb => h('option', { value: hb.id }, hb.nombre)))),
      h('label', { class: 'campo' }, 'Tipo', tipo),
      h('label', { class: 'campo' }, 'Conexión', canal)),
    errD, h('button', { class: 'btn primario chico', type: 'submit' }, 'Agregar dispositivo'));

  return h('article', { class: 'tarjeta casa-admin' },
    h('div', { class: 'fila' }, h('div', { class: 'crece' }, h('h2', {}, c.direccion),
      h('p', { class: 'mut peq' }, `Dueño: ${c.propietario ?? 'sin asignar'}`)),
      h('span', { class: 'chip ' + (c.puenteConectado ? 'ok' : 'mal') }, c.puenteConectado ? 'Arduino conectado' : 'Sin Arduino')),
    h('div', {}, h('p', { class: 'mut peq' }, 'Clave del puente (para puente.py --token):'),
      h('div', { class: 'fila', style: 'gap:8px;margin-top:4px;flex-wrap:wrap' }, tokenTxt,
        h('button', { class: 'btn chico', type: 'button', onclick: ev => {
          const ver = tokenTxt.textContent.startsWith('•');
          tokenTxt.textContent = ver ? c.token_puente : '••••••••••••';
          ev.currentTarget.textContent = ver ? 'Ocultar' : 'Mostrar';
        } }, 'Mostrar'),
        boton(ico('copiar'), 'icono chico', async () => { await navigator.clipboard.writeText(c.token_puente); toast('Clave copiada'); }, { 'aria-label': 'Copiar clave' }))),
    c.plano ? h('details', { class: 'plegable' }, h('summary', {}, ico('plano'), 'Ver plano'), h('div', { class: 'marco-plano' }, dibujarPlano(c.plano, { soloVer: true }))) : null,
    habsUl,
    h('details', { class: 'plegable' }, h('summary', {}, ico('mas'), 'Agregar habitación'), formHab, errH),
    habs.length ? h('details', { class: 'plegable' }, h('summary', {}, ico('mas'), 'Agregar dispositivo'), formDisp) : null);
}

function formNuevaCasa(us, recargar) {
  const err = h('p', { class: 'error', role: 'alert' });
  const form = h('form', { novalidate: true, onsubmit: async ev => {
    ev.preventDefault();
    const f = new FormData(form);
    const datos = { direccion: f.get('direccion').trim(), id_propietario: Number(f.get('dueno')) || null };
    if (datos.direccion.length < 3) { err.textContent = 'Escribe la dirección.'; return; }
    try { await api('/api/casas', { metodo: 'POST', datos }); toast('Casa creada'); recargar(); }
    catch (x) { err.textContent = x.message; }
  } },
    h('div', { class: 'form-grid' },
      h('label', { class: 'campo' }, 'Dirección', h('input', { name: 'direccion', maxlength: 120 })),
      h('label', { class: 'campo' }, 'Dueño', h('select', { name: 'dueno' }, h('option', { value: '' }, 'Sin asignar'), us.map(x => h('option', { value: x.id }, x.nombre))))),
    err, h('button', { class: 'btn primario chico', type: 'submit' }, 'Crear casa'));
  return h('details', { class: 'plegable tarjeta', style: 'margin-top:16px' }, h('summary', {}, ico('mas'), 'Nueva casa'), form);
}

// ---------- arranque ----------

if (S.token) entrar(); else $('#acceso').hidden = false;
