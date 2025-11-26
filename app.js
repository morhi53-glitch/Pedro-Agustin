(function(){
  if (!Element.prototype.matches) { Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector; }
  if (!Element.prototype.closest) {
    Element.prototype.closest = function(s){ var el=this; while(el&&el.nodeType===1){ if(el.matches(s)) return el; el=el.parentElement||el.parentNode; } return null; };
  }
})();

const DB_NAME='transporteDB', DB_VERSION=1; let db;
function openDB(){ return new Promise(res=>{ const r=indexedDB.open(DB_NAME,DB_VERSION);
  r.onupgradeneeded=e=>{ db=e.target.result; if(!db.objectStoreNames.contains('barcos')) db.createObjectStore('barcos',{keyPath:'id'}); if(!db.objectStoreNames.contains('viajes')) db.createObjectStore('viajes',{keyPath:'timestamp'}); };
  r.onsuccess=e=>{ db=e.target.result; res(db); }; r.onerror=()=>res(null); }); }
function store(n,m='readonly'){ return db.transaction(n,m).objectStore(n); }
function getAll(n){ return new Promise(res=>{ const rq=store(n).getAll(); rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>res([]); }); }
function putItem(n,v){ return new Promise(res=>{ const rq=store(n,'readwrite').put(v); rq.onsuccess=()=>res(true); rq.onerror=()=>res(false); }); }
function deleteItem(n,k){ return new Promise(res=>{ const rq=store(n,'readwrite').delete(k); rq.onsuccess=()=>res(true); rq.onerror=()=>res(false); }); }
function clearStore(n){ return new Promise(res=>{ const rq=store(n,'readwrite').clear(); rq.onsuccess=()=>res(true); rq.onerror=()=>res(false); }); }
async function setJSON(n, arr){ await clearStore(n); for(const v of arr) await putItem(n, v); }

const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);

document.addEventListener('DOMContentLoaded', async ()=>{
  await openDB();
  const barcos0 = await getAll('barcos'); if(!barcos0.length){ for (const b of [
    { id:1, nombre:'Lobos Express', consumoHora:25 },
    { id:2, nombre:'Corralejo One', consumoHora:30 },
    { id:3, nombre:'Water Master', consumoHora:22 },
    { id:4, nombre:'Eco Trans', consumoHora:18 }
  ]) await putItem('barcos', b); }

  const today = new Date().toISOString().split('T')[0];
  $('#fecha').value=today; $('#filtro-fecha').value=today; $('#estadistica-fecha').value=today;

  await cargarBarcos(); await cargarHistorial(); await cargarEstadisticas(); await cargarFiltrosMensuales();

  $$('.tab').forEach(tab=>{
    tab.addEventListener('click', async function(){
      $$('.tab').forEach(t=>t.classList.remove('active')); $$('.tab-content').forEach(c=>c.classList.remove('active'));
      this.classList.add('active'); document.getElementById(this.dataset.tab).classList.add('active');
      if(this.dataset.tab==='configuracion') await cargarListaBarcos();
      else if(this.dataset.tab==='estadisticas'){ await cargarFiltrosMensuales(); await cargarResumenMensual(); }
    });
  });

  const autoChk=$('#auto-calcular'), combInp=$('#combustible');
  if(autoChk && combInp){
    combInp.disabled = autoChk.checked;
    autoChk.addEventListener('change', ()=>{ combInp.disabled=autoChk.checked; if(autoChk.checked){ calcularCombustible(); $('#combustible-info').textContent='El combustible se calculará automáticamente al ingresar las horas'; } else { $('#combustible-info').textContent='Ingrese manualmente el consumo de combustible'; } });
  }
  $('#hora-salida')?.addEventListener('change', calcularCombustible);
  $('#hora-llegada')?.addEventListener('change', calcularCombustible);
  $('#barco')?.addEventListener('change', calcularCombustible);

  $('#viaje-form')?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const v={ fecha:$('#fecha').value, barco:$('#barco').value, horaSalida:$('#hora-salida').value, horaLlegada:$('#hora-llegada').value,
      direccion:$('#direccion').value, aguaPotable:parseInt($('#agua-potable')?.value||0)||0, aguaResidual:parseInt($('#agua-residual')?.value||0)||0,
      bolsasBasura:parseInt($('#bolsas-basura')?.value||0)||0, combustible:parseFloat($('#combustible').value)||0, observaciones:$('#observaciones')?.value||'', timestamp:Date.now() };
    if(!v.barco||!v.direccion||!v.horaSalida||!v.horaLlegada){ alert('Por favor, complete todos los campos obligatorios.'); return; }
    await putItem('viajes', v); alert('Registro guardado correctamente.'); e.target.reset(); $('#fecha').value=new Date().toISOString().split('T')[0];
    if(autoChk && combInp){ autoChk.checked=true; combInp.disabled=true; } $('#combustible-info') && ($('#combustible-info').textContent='El combustible se calculará automáticamente al ingresar las horas');
    await cargarHistorial(); await cargarEstadisticas(); await cargarFiltrosMensuales(); await cargarResumenMensual();
  });

  $('#btn-reset')?.addEventListener('click', ()=>{ if(autoChk && combInp){ autoChk.checked=true; combInp.disabled=true; } $('#combustible-info') && ($('#combustible-info').textContent='El combustible se calculará automáticamente al ingresar las horas'); });
  $('#filtro-fecha')?.addEventListener('change', cargarHistorial);
  $('#limpiar-filtro')?.addEventListener('click', ()=>{ $('#filtro-fecha').value=''; cargarHistorial(); });
  $('#estadistica-fecha')?.addEventListener('change', cargarEstadisticas);
  $('#filtro-mes')?.addEventListener('change', cargarResumenMensual);
  $('#filtro-ano')?.addEventListener('change', cargarResumenMensual);

  // Delegación táctil/click para iPhone
  ['click','touchend'].forEach(evt=>{
    document.getElementById('lista-barcos')?.addEventListener(evt, async (e)=>{
      const btn=e.target.closest('button'); if(!btn) return; const id=btn.dataset.id||btn.getAttribute('data-id');
      if(btn.classList.contains('btn-editar-barco')) await editarBarco(id);
      if(btn.classList.contains('btn-eliminar-barco')) await eliminarBarco(id);
    }, {passive:true});
  });
  ['click','touchend'].forEach(evt=>{
    document.getElementById('historial-body')?.addEventListener(evt, async (e)=>{
      const btn=e.target.closest('button.btn-eliminar-registro'); if(!btn) return; const ts=btn.dataset.ts||btn.getAttribute('data-ts');
      await eliminarRegistro(ts);
    }, {passive:true});
  });

  // Copia de seguridad — Export/Import
  document.getElementById('btn-export-json')?.addEventListener('click', exportarDatosJSON);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportarDatosCSV);
  document.getElementById('btn-import-json')?.addEventListener('click', ()=> document.getElementById('importar-input').click());
  document.getElementById('importar-input')?.addEventListener('change', importarDatos);
});

async function cargarBarcos(){ const barcos=await getAll('barcos'); const sel=document.getElementById('barco'); if(!sel) return; while(sel.options.length>1) sel.remove(1); barcos.forEach(b=>{ const o=document.createElement('option'); o.value=b.nombre; o.textContent=b.nombre; sel.appendChild(o); }); }
async function cargarListaBarcos(){ const barcos=await getAll('barcos'); const lista=document.getElementById('lista-barcos'); if(!lista) return; lista.innerHTML=''; if(!barcos.length){ lista.innerHTML='<p>No hay barcos registrados.</p>'; return; } barcos.forEach(b=>{ const d=document.createElement('div'); d.className='barco-item'; d.innerHTML=`<div class="barco-info"><strong>${b.nombre}</strong><div>Consumo: ${b.consumoHora} L/hora</div></div><div class="barco-actions"><button type="button" class="secondary btn-small btn-editar-barco" data-id="${b.id}">Editar</button><button type="button" class="danger btn-small btn-eliminar-barco" data-id="${b.id}">Eliminar</button></div>`; lista.appendChild(d); }); }
async function cargarFiltrosMensuales(){ const vs=await getAll('viajes'); const ms=document.getElementById('filtro-mes'); const as=document.getElementById('filtro-ano'); if(!ms||!as) return; while(ms.options.length>1) ms.remove(1); while(as.options.length>1) as.remove(1); const M=new Set(), A=new Set(); vs.forEach(v=>{ const d=new Date(v.fecha); M.add(d.getMonth()+1); A.add(d.getFullYear()); }); [...M].sort((a,b)=>a-b).forEach(m=>{ const o=document.createElement('option'); o.value=m; o.textContent=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][m-1]; ms.appendChild(o); }); [...A].sort((a,b)=>b-a).forEach(y=>{ const o=document.createElement('option'); o.value=y; o.textContent=y; as.appendChild(o); }); }
async function calcularCombustible(){ if(!document.getElementById('auto-calcular')?.checked) return; const hs=$('#hora-salida')?.value, hl=$('#hora-llegada')?.value, nb=$('#barco')?.value; if(!hs||!hl||!nb) return; const [hS,mS]=hs.split(':').map(Number), [hL,mL]=hl.split(':').map(Number); let min=(hL*60+mL)-(hS*60+mS); if(min<0) min+=1440; const horas=min/60; if(horas<=0){ $('#combustible-info').textContent='La hora de llegada debe ser posterior a la de salida'; return; } const barcos=await getAll('barcos'); const b=barcos.find(x=>x.nombre===nb); if(!b){ $('#combustible-info').textContent='No se encontró información de consumo para este barco'; return; } const comb=horas*b.consumoHora; $('#combustible').value=comb.toFixed(1); $('#combustible-info').textContent=`Horas navegadas: ${horas.toFixed(1)} h × ${b.consumoHora} L/h = ${comb.toFixed(1)} L`; }
async function cargarHistorial(){ const vs=await getAll('viajes'); const f=$('#filtro-fecha')?.value; const tb=$('#historial-body'); if(!tb) return; tb.innerHTML=''; const list=f?vs.filter(v=>v.fecha===f):vs; if(!list.length){ tb.innerHTML='<tr><td colspan="8" style="text-align:center;">No hay registros para la fecha seleccionada.</td></tr>'; return; } list.sort((a,b)=> new Date(b.fecha+'T'+b.horaSalida)-new Date(a.fecha+'T'+a.horaSalida)); list.forEach(v=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${new Date(v.fecha).toLocaleDateString('es-ES')}</td><td>${v.barco}</td><td>${v.direccion}</td><td>${v.aguaPotable}</td><td>${v.aguaResidual}</td><td>${v.bolsasBasura}</td><td>${Number(v.combustible).toFixed(1)} L</td><td class="acciones-registro"><button type="button" class="danger btn-small btn-eliminar-registro" data-ts="${v.timestamp}">Eliminar</button></td>`; tb.appendChild(tr); }); }
async function cargarEstadisticas(){ const vs=await getAll('viajes'); const f=$('#estadistica-fecha')?.value; const d=vs.filter(v=>v.fecha===f); const a=d.reduce((s,v)=>s+v.aguaPotable,0), r=d.reduce((s,v)=>s+v.aguaResidual,0), b=d.reduce((s,v)=>s+v.bolsasBasura,0), c=d.reduce((s,v)=>s+Number(v.combustible||0),0); $('#total-agua').textContent=a; $('#total-residual').textContent=r; $('#total-bolsas').textContent=b; $('#total-combustible').textContent=c.toFixed(1); const pb={}; d.forEach(v=>{ if(!pb[v.barco]) pb[v.barco]={viajes:0,aguaPotable:0,aguaResidual:0,bolsasBasura:0,combustible:0}; pb[v.barco].viajes++; pb[v.barco].aguaPotable+=v.aguaPotable; pb[v.barco].aguaResidual+=v.aguaResidual; pb[v.barco].bolsasBasura+=v.bolsasBasura; pb[v.barco].combustible+=Number(v.combustible||0); }); const tb=$('#estadisticas-body'); if (!tb) return; tb.innerHTML=''; const ks=Object.keys(pb); if(!ks.length){ tb.innerHTML='<tr><td colspan="6" style="text-align:center;">No hay registros para la fecha seleccionada.</td></tr>'; return; } ks.forEach(k=>{ const x=pb[k]; const tr=document.createElement('tr'); tr.innerHTML=`<td>${k}</td><td>${x.viajes}</td><td>${x.aguaPotable}</td><td>${x.aguaResidual}</td><td>${x.bolsasBasura}</td><td>${x.combustible.toFixed(1)}</td>`; tb.appendChild(tr); }); }
async function cargarResumenMensual(){ const vs=await getAll('viajes'); const m=$('#filtro-mes')?.value, y=$('#filtro-ano')?.value; let list=vs; if(m&&y){ list=vs.filter(v=>{ const d=new Date(v.fecha); return (d.getMonth()+1)==parseInt(m)&&d.getFullYear()==parseInt(y); }); } else if(m){ list=vs.filter(v=> (new Date(v.fecha).getMonth()+1)==parseInt(m)); } else if(y){ list=vs.filter(v=> new Date(v.fecha).getFullYear()==parseInt(y)); } const a=list.reduce((s,v)=>s+v.aguaPotable,0), r=list.reduce((s,v)=>s+v.aguaResidual,0), b=list.reduce((s,v)=>s+v.bolsasBasura,0), c=list.reduce((s,v)=>s+Number(v.combustible||0),0); $('#mensual-agua').textContent=a; $('#mensual-residual').textContent=r; $('#mensual-bolsas').textContent=b; $('#mensual-combustible').textContent=c.toFixed(1); const tpd={}; list.forEach(v=>{ if(!tpd[v.fecha]) tpd[v.fecha]={aguaPotable:0,aguaResidual:0,bolsasBasura:0,combustible:0}; tpd[v.fecha].aguaPotable+=v.aguaPotable; tpd[v.fecha].aguaResidual+=v.aguaResidual; tpd[v.fecha].bolsasBasura+=v.bolsasBasura; tpd[v.fecha].combustible+=Number(v.combustible||0); }); const dias=Object.keys(tpd).sort(); const tb=$('#totales-diarios-body'); if (!tb) return; tb.innerHTML=''; if(!dias.length){ tb.innerHTML='<tr><td colspan="5" style="text-align:center;">No hay registros para el período seleccionado.</td></tr>'; return; } dias.forEach(f=>{ const t=tpd[f]; const tr=document.createElement('tr'); tr.innerHTML=`<td>${new Date(f).toLocaleDateString('es-ES')}</td><td>${t.aguaPotable}</td><td>${t.aguaResidual}</td><td>${t.bolsasBasura}</td><td>${t.combustible.toFixed(1)}</td>`; tb.appendChild(tr); }); const tr=document.createElement('tr'); tr.className='total-row'; tr.innerHTML=`<td><strong>TOTAL</strong></td><td><strong>${a}</strong></td><td><strong>${r}</strong></td><td><strong>${b}</strong></td><td><strong>${c.toFixed(1)}</strong></td>`; tb.appendChild(tr); }

function toCSV(rows){
  if(!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v)=>(''+(v==null?'':v)).replace(/"/g,'""');
  const lines = [headers.join(',')];
  for(const r of rows){ lines.push(headers.map(h=>`"${escape(r[h])}"`).join(',')); }
  return lines.join('\n');
}

// Export / Import
async function exportarDatosJSON(){
  const barcos = await getAll('barcos');
  const viajes = await getAll('viajes');
  const backup = { meta:{ app:'Transporte Lobos', version:1 }, fecha:new Date().toISOString(), barcos, viajes };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `backup-transporte-${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function exportarDatosCSV(){
  const viajes = await getAll('viajes');
  if(!viajes.length){ alert('No hay registros para exportar.'); return; }
  const csv = toCSV(viajes);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `viajes-${Date.now()}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function importarDatos(evt){
  const file = evt.target.files[0];
  if(!file) return;
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    if(!data || !Array.isArray(data.barcos) || !Array.isArray(data.viajes)){ alert('Archivo no válido.'); return; }
    if(!confirm('Esto reemplazará los datos actuales por los del archivo. ¿Continuar?')) return;
    await setJSON('barcos', data.barcos);
    await setJSON('viajes', data.viajes);
    alert('Datos importados correctamente ✅');
    await cargarBarcos(); await cargarListaBarcos(); await cargarHistorial(); await cargarEstadisticas(); await cargarResumenMensual();
  }catch(e){ console.error(e); alert('Error al importar el archivo.'); }
}

// CRUD helpers
async function editarBarco(id){
  const barcos=await getAll('barcos'); const b=barcos.find(x=>String(x.id)===String(id)); if(!b) return;
  const nn=prompt('Nuevo nombre del barco:', b.nombre); if(nn===null) return;
  const cs=prompt('Nuevo consumo (L/hora):', b.consumoHora); if(cs===null) return;
  const nc=parseFloat(cs); if(!nn.trim()||isNaN(nc)||nc<=0){ alert('Valores no válidos.'); return; }
  b.nombre=nn.trim(); b.consumoHora=nc; await putItem('barcos', b); alert('Barco actualizado correctamente.'); await cargarBarcos(); await cargarListaBarcos();
}
async function eliminarBarco(id){ if(!confirm('¿Está seguro de que desea eliminar este barco?')) return; await deleteItem('barcos', Number(id)); alert('Barco eliminado correctamente.'); await cargarBarcos(); await cargarListaBarcos(); }
async function eliminarRegistro(ts){ if(!confirm('¿Está seguro de que desea eliminar este registro?')) return; await deleteItem('viajes', Number(ts)); alert('Registro eliminado correctamente.'); await cargarHistorial(); await cargarEstadisticas(); await cargarResumenMensual(); }
