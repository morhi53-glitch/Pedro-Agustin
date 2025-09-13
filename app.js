// Polyfills iOS
(function(){
  if (!Element.prototype.matches) { Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector; }
  if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) { var el = this; while (el && el.nodeType === 1) { if (el.matches(s)) return el; el = el.parentElement || el.parentNode; } return null; };
  }
})();

// IndexedDB util
const DB_NAME = 'transporteDB';
const DB_VERSION = 1;
let db;
function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = e=>resolve(null);
    req.onupgradeneeded = e=>{
      db = e.target.result;
      if(!db.objectStoreNames.contains('barcos')) db.createObjectStore('barcos',{keyPath:'id'});
      if(!db.objectStoreNames.contains('viajes')) db.createObjectStore('viajes',{keyPath:'timestamp'});
    };
    req.onsuccess = e=>{ db = e.target.result; resolve(db); };
  });
}
function store(name, mode='readonly'){ return db.transaction(name, mode).objectStore(name); }
function getAll(name){ return new Promise((res)=>{ const r=store(name).getAll(); r.onsuccess=()=>res(r.result||[]); r.onerror=()=>res([]); }); }
function putItem(name, val){ return new Promise((res)=>{ const r=store(name,'readwrite').put(val); r.onsuccess=()=>res(true); r.onerror=()=>res(false); }); }
function deleteItem(name, key){ return new Promise((res)=>{ const r=store(name,'readwrite').delete(key); r.onsuccess=()=>res(true); r.onerror=()=>res(false); }); }

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);

document.addEventListener('DOMContentLoaded', async ()=>{
  await openDB();

  // semillas barcos si vacío
  const barcos0 = await getAll('barcos');
  if(!barcos0.length){
    for (const b of [
      { id: 1, nombre: 'Lobos Express', consumoHora: 25 },
      { id: 2, nombre: 'Corralejo One', consumoHora: 30 },
      { id: 3, nombre: 'Water Master', consumoHora: 22 },
      { id: 4, nombre: 'Eco Trans', consumoHora: 18 }
    ]) await putItem('barcos', b);
  }

  const today = new Date().toISOString().split('T')[0];
  $('#fecha').value = today;
  $('#filtro-fecha').value = today;
  $('#estadistica-fecha').value = today;

  // Cargas iniciales
  await cargarBarcos();
  await cargarHistorial();
  await cargarEstadisticas();
  await cargarFiltrosMensuales();

  // Tabs
  $$('.tab').forEach(tab=>{
    tab.addEventListener('click', async function(){
      $$('.tab').forEach(t=>t.classList.remove('active'));
      $$('.tab-content').forEach(c=>c.classList.remove('active'));
      this.classList.add('active');
      document.getElementById(this.dataset.tab).classList.add('active');
      if(this.dataset.tab==='configuracion') await cargarListaBarcos();
      else if(this.dataset.tab==='estadisticas'){ await cargarFiltrosMensuales(); await cargarResumenMensual(); }
    });
  });

  // Autocalcular
  const autoChk = $('#auto-calcular');
  const combustibleInput = $('#combustible');
  combustibleInput.disabled = autoChk.checked;
  autoChk.addEventListener('change', ()=>{
    combustibleInput.disabled = autoChk.checked;
    if(autoChk.checked){ calcularCombustible(); $('#combustible-info').textContent='El combustible se calculará automáticamente al ingresar las horas'; }
    else { $('#combustible-info').textContent='Ingrese manualmente el consumo de combustible'; }
  });

  // Eventos cálculo
  $('#hora-salida').addEventListener('change', calcularCombustible);
  $('#hora-llegada').addEventListener('change', calcularCombustible);
  $('#barco').addEventListener('change', calcularCombustible);

  // Form viaje
  $('#viaje-form').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const viaje = {
      fecha: $('#fecha').value,
      barco: $('#barco').value,
      horaSalida: $('#hora-salida').value,
      horaLlegada: $('#hora-llegada').value,
      direccion: $('#direccion').value,
      aguaPotable: parseInt($('#agua-potable').value)||0,
      aguaResidual: parseInt($('#agua-residual').value)||0,
      bolsasBasura: parseInt($('#bolsas-basura').value)||0,
      combustible: parseFloat($('#combustible').value)||0,
      observaciones: $('#observaciones').value,
      timestamp: Date.now()
    };
    if(!viaje.barco || !viaje.direccion || !viaje.horaSalida || !viaje.horaLlegada){ alert('Por favor, complete todos los campos obligatorios.'); return; }
    await putItem('viajes', viaje);
    alert('Registro guardado correctamente.');
    e.target.reset();
    $('#fecha').value = new Date().toISOString().split('T')[0];
    autoChk.checked = true; combustibleInput.disabled = true;
    $('#combustible-info').textContent = 'El combustible se calculará automáticamente al ingresar las horas';
    await cargarHistorial(); await cargarEstadisticas(); await cargarFiltrosMensuales(); await cargarResumenMensual();
  });

  // Reset
  $('#btn-reset').addEventListener('click', ()=>{
    autoChk.checked = true; combustibleInput.disabled = true;
    $('#combustible-info').textContent = 'El combustible se calculará automáticamente al ingresar las horas';
  });

  // Filtros y controles
  $('#filtro-fecha').addEventListener('change', cargarHistorial);
  $('#limpiar-filtro').addEventListener('click', ()=>{ $('#filtro-fecha').value=''; cargarHistorial(); });
  $('#estadistica-fecha').addEventListener('change', cargarEstadisticas);
  $('#filtro-mes').addEventListener('change', cargarResumenMensual);
  $('#filtro-ano').addEventListener('change', cargarResumenMensual);

  // Delegación eventos (click/touch)
  ['click','touchend'].forEach(function(evt){
    document.getElementById('lista-barcos').addEventListener(evt, async (e)=>{
      const btn = e.target.closest('button');
      if(!btn) return;
      const id = btn.dataset.id || btn.getAttribute('data-id');
      if(btn.classList.contains('btn-editar-barco')) await editarBarco(id);
      if(btn.classList.contains('btn-eliminar-barco')) await eliminarBarco(id);
    }, { passive: true });
  });
  ['click','touchend'].forEach(function(evt){
    document.getElementById('historial-body').addEventListener(evt, async (e)=>{
      const btn = e.target.closest('button.btn-eliminar-registro');
      if(!btn) return;
      const ts = btn.dataset.ts || btn.getAttribute('data-ts');
      await eliminarRegistro(ts);
    }, { passive: true });
  });
});

// ===== Funciones de negocio =====
async function cargarBarcos(){
  const barcos = await getAll('barcos');
  const select = document.getElementById('barco');
  while(select.options.length>1) select.remove(1);
  barcos.forEach(barco=>{ const opt=document.createElement('option'); opt.value=barco.nombre; opt.textContent=barco.nombre; select.appendChild(opt); });
}
async function cargarListaBarcos(){
  const barcos = await getAll('barcos');
  const lista = document.getElementById('lista-barcos');
  lista.innerHTML='';
  if(!barcos.length){ lista.innerHTML='<p>No hay barcos registrados.</p>'; return; }
  barcos.forEach(barco=>{
    const div=document.createElement('div'); div.className='barco-item';
    div.innerHTML = `
      <div class="barco-info"><strong>${barco.nombre}</strong><div>Consumo: ${barco.consumoHora} L/hora</div></div>
      <div class="barco-actions">
        <button type="button" class="secondary btn-small btn-editar-barco" data-id="${barco.id}">Editar</button>
        <button type="button" class="danger btn-small btn-eliminar-barco" data-id="${barco.id}">Eliminar</button>
      </div>`;
    lista.appendChild(div);
  });
}
async function cargarFiltrosMensuales(){
  const viajes = await getAll('viajes');
  const mesesSelect = document.getElementById('filtro-mes');
  const anosSelect = document.getElementById('filtro-ano');
  while(mesesSelect.options.length>1) mesesSelect.remove(1);
  while(anosSelect.options.length>1) anosSelect.remove(1);
  const mesesUnicos = new Set(); const anosUnicos = new Set();
  viajes.forEach(v=>{ const d=new Date(v.fecha); mesesUnicos.add(d.getMonth()+1); anosUnicos.add(d.getFullYear()); });
  [...mesesUnicos].sort((a,b)=>a-b).forEach(m=>{ const o=document.createElement('option'); o.value=m; o.textContent=obtenerNombreMes(m); mesesSelect.appendChild(o); });
  [...anosUnicos].sort((a,b)=>b-a).forEach(a=>{ const o=document.createElement('option'); o.value=a; o.textContent=a; anosSelect.appendChild(o); });
}
function obtenerNombreMes(m){ return ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m-1]; }
async function calcularCombustible(){
  if(!document.getElementById('auto-calcular').checked) return;
  const hs = document.getElementById('hora-salida').value;
  const hl = document.getElementById('hora-llegada').value;
  const nombreBarco = document.getElementById('barco').value;
  if(!hs||!hl||!nombreBarco) return;
  const [hS,mS]=hs.split(':').map(Number); const [hL,mL]=hl.split(':').map(Number);
  let min = (hL*60+mL)-(hS*60+mS); if(min<0) min += 24*60;
  const horas = min/60;
  if(horas<=0){ document.getElementById('combustible-info').textContent='La hora de llegada debe ser posterior a la de salida'; return; }
  const barcos = await getAll('barcos');
  const barco = barcos.find(b=>b.nombre===nombreBarco);
  if(!barco){ document.getElementById('combustible-info').textContent='No se encontró información de consumo para este barco'; return; }
  const comb = horas * barco.consumoHora;
  document.getElementById('combustible').value = comb.toFixed(1);
  document.getElementById('combustible-info').textContent = `Horas navegadas: ${horas.toFixed(1)} h × ${barco.consumoHora} L/h = ${comb.toFixed(1)} L`;
}
async function cargarHistorial(){
  const viajes = await getAll('viajes');
  const filtro = document.getElementById('filtro-fecha').value;
  const tbody = document.getElementById('historial-body');
  tbody.innerHTML='';
  const list = filtro ? viajes.filter(v=>v.fecha===filtro) : viajes;
  if(!list.length){ tbody.innerHTML='<tr><td colspan="8" style="text-align:center;">No hay registros para la fecha seleccionada.</td></tr>'; return; }
  list.sort((a,b)=> new Date(b.fecha+'T'+b.horaSalida) - new Date(a.fecha+'T'+a.horaSalida));
  list.forEach(v=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td>${formatearFecha(v.fecha)}</td>
      <td>${v.barco}</td>
      <td>${v.direccion}</td>
      <td>${v.aguaPotable}</td>
      <td>${v.aguaResidual}</td>
      <td>${v.bolsasBasura}</td>
      <td>${Number(v.combustible).toFixed(1)} L</td>
      <td class="acciones-registro">
        <button type="button" class="danger btn-small btn-eliminar-registro" data-ts="${v.timestamp}">Eliminar</button>
      </td>`;
    tbody.appendChild(tr);
  });
}
async function cargarEstadisticas(){
  const viajes = await getAll('viajes');
  const fecha = document.getElementById('estadistica-fecha').value;
  const dia = viajes.filter(v=>v.fecha===fecha);
  const totalAgua = dia.reduce((s,v)=>s+v.aguaPotable,0);
  const totalResidual = dia.reduce((s,v)=>s+v.aguaResidual,0);
  const totalBolsas = dia.reduce((s,v)=>s+v.bolsasBasura,0);
  const totalComb = dia.reduce((s,v)=>s+Number(v.combustible||0),0);
  document.getElementById('total-agua').textContent = totalAgua;
  document.getElementById('total-residual').textContent = totalResidual;
  document.getElementById('total-bolsas').textContent = totalBolsas;
  document.getElementById('total-combustible').textContent = totalComb.toFixed(1);
  const porBarco = {};
  dia.forEach(v=>{ if(!porBarco[v.barco]) porBarco[v.barco]={viajes:0,aguaPotable:0,aguaResidual:0,bolsasBasura:0,combustible:0};
    porBarco[v.barco].viajes++; porBarco[v.barco].aguaPotable+=v.aguaPotable; porBarco[v.barco].aguaResidual+=v.aguaResidual; porBarco[v.barco].bolsasBasura+=v.bolsasBasura; porBarco[v.barco].combustible+=Number(v.combustible||0); });
  const tbody=document.getElementById('estadisticas-body');
  tbody.innerHTML='';
  const keys = Object.keys(porBarco);
  if(!keys.length){ tbody.innerHTML='<tr><td colspan="6" style="text-align:center;">No hay registros para la fecha seleccionada.</td></tr>'; return; }
  keys.forEach(b=>{
    const tr=document.createElement('tr');
    const x = porBarco[b];
    tr.innerHTML=`<td>${b}</td><td>${x.viajes}</td><td>${x.aguaPotable}</td><td>${x.aguaResidual}</td><td>${x.bolsasBasura}</td><td>${x.combustible.toFixed(1)}</td>`;
    tbody.appendChild(tr);
  });
}
async function cargarResumenMensual(){
  const viajes = await getAll('viajes');
  const mesSel = document.getElementById('filtro-mes').value;
  const anoSel = document.getElementById('filtro-ano').value;
  let list = viajes;
  if(mesSel && anoSel){ list = viajes.filter(v=>{ const d=new Date(v.fecha); return (d.getMonth()+1)===parseInt(mesSel)&&d.getFullYear()===parseInt(anoSel); }); }
  else if(mesSel){ list = viajes.filter(v=> (new Date(v.fecha).getMonth()+1)===parseInt(mesSel)); }
  else if(anoSel){ list = viajes.filter(v=> new Date(v.fecha).getFullYear()===parseInt(anoSel)); }
  const totalAgua = list.reduce((s,v)=>s+v.aguaPotable,0);
  const totalResidual = list.reduce((s,v)=>s+v.aguaResidual,0);
  const totalBolsas = list.reduce((s,v)=>s+v.bolsasBasura,0);
  const totalComb = list.reduce((s,v)=>s+Number(v.combustible||0),0);
  document.getElementById('mensual-agua').textContent=totalAgua;
  document.getElementById('mensual-residual').textContent=totalResidual;
  document.getElementById('mensual-bolsas').textContent=totalBolsas;
  document.getElementById('mensual-combustible').textContent=totalComb.toFixed(1);
  const totalesPorDia = {};
  list.forEach(v=>{ if(!totalesPorDia[v.fecha]) totalesPorDia[v.fecha]={aguaPotable:0,aguaResidual:0,bolsasBasura:0,combustible:0};
    totalesPorDia[v.fecha].aguaPotable+=v.aguaPotable; totalesPorDia[v.fecha].aguaResidual+=v.aguaResidual; totalesPorDia[v.fecha].bolsasBasura+=v.bolsasBasura; totalesPorDia[v.fecha].combustible+=Number(v.combustible||0); });
  const dias = Object.keys(totalesPorDia).sort();
  const tbody=document.getElementById('totales-diarios-body');
  tbody.innerHTML='';
  if(!dias.length){ tbody.innerHTML='<tr><td colspan="5" style="text-align:center;">No hay registros para el período seleccionado.</td></tr>'; return; }
  dias.forEach(fecha=>{
    const t=totalesPorDia[fecha];
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${formatearFecha(fecha)}</td><td>${t.aguaPotable}</td><td>${t.aguaResidual}</td><td>${t.bolsasBasura}</td><td>${t.combustible.toFixed(1)}</td>`;
    tbody.appendChild(tr);
  });
  const trTotal=document.createElement('tr');
  trTotal.className='total-row';
  trTotal.innerHTML=`<td><strong>TOTAL</strong></td><td><strong>${totalAgua}</strong></td><td><strong>${totalResidual}</strong></td><td><strong>${totalBolsas}</strong></td><td><strong>${totalComb.toFixed(1)}</strong></td>`;
  tbody.appendChild(trTotal);
}
function formatearFecha(s){ const d=new Date(s); return d.toLocaleDateString('es-ES'); }

// CRUD para delegación
async function editarBarco(id){
  const barcos = await getAll('barcos');
  const barco = barcos.find(b=>String(b.id)===String(id));
  if(!barco) return;
  const nuevoNombre = prompt('Nuevo nombre del barco:', barco.nombre);
  if(nuevoNombre===null) return;
  const nuevoConsumoStr = prompt('Nuevo consumo (L/hora):', barco.consumoHora);
  if(nuevoConsumoStr===null) return;
  const nuevoConsumo = parseFloat(nuevoConsumoStr);
  if(!nuevoNombre.trim()||isNaN(nuevoConsumo)||nuevoConsumo<=0){ alert('Valores no válidos.'); return; }
  barco.nombre = nuevoNombre.trim();
  barco.consumoHora = nuevoConsumo;
  await putItem('barcos', barco);
  alert('Barco actualizado correctamente.');
  await cargarBarcos(); await cargarListaBarcos();
}
async function eliminarBarco(id){
  if(!confirm('¿Está seguro de que desea eliminar este barco?')) return;
  await deleteItem('barcos', Number(id));
  alert('Barco eliminado correctamente.');
  await cargarBarcos(); await cargarListaBarcos();
}
async function eliminarRegistro(ts){
  if(!confirm('¿Está seguro de que desea eliminar este registro?')) return;
  await deleteItem('viajes', Number(ts));
  alert('Registro eliminado correctamente.');
  await cargarHistorial(); await cargarEstadisticas(); await cargarResumenMensual();
}
