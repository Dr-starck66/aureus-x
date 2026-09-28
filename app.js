const state = { map:null, mapEngine:'', markers:[], googleMarkers:[], center:null, candidates:[], documents:[], google:null };
const $ = (s) => document.querySelector(s);
const esc = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

function kindInfo(kind){
  return ({
    fortement_corrobore:{label:'Fortement corroboré',cls:'strong'},
    corrobore:{label:'Corroboré',cls:'medium'},
    legende:{label:'Légende / tradition',cls:'legend'},
    piste_documentaire:{label:'Piste documentaire',cls:'trace'}
  })[kind] || {label:'Piste',cls:'trace'};
}

async function getConfig(){
  try{ const r=await fetch('/api/config'); if(!r.ok) throw new Error(); return await r.json(); }
  catch{ return {googleMapsApiKey:'',googleMapId:''}; }
}

async function loadGoogleMaps(key, mapId){
  if(!key) throw new Error('NO_KEY');
  if(window.google?.maps) return window.google.maps;
  await new Promise((resolve,reject)=>{
    const cb='__aureusMapReady'; window[cb]=()=>{delete window[cb];resolve();};
    const s=document.createElement('script');
    const u=new URL('https://maps.googleapis.com/maps/api/js');
    u.searchParams.set('key',key);u.searchParams.set('loading','async');u.searchParams.set('callback',cb);u.searchParams.set('v','weekly');u.searchParams.set('libraries','marker');
    if(mapId) u.searchParams.set('map_ids',mapId);
    s.src=u.toString();s.async=true;s.onerror=()=>reject(new Error('GOOGLE_LOAD_FAILED'));document.head.appendChild(s);
  });
  return window.google.maps;
}

function initLeaflet(){
  const map=L.map('map',{zoomControl:true,attributionControl:true}).setView([46.6,2.4],6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,attribution:'© OpenStreetMap contributors'}).addTo(map);
  state.map=map; state.mapEngine='leaflet';
  $('#mapEngineLabel').textContent='Fond réel OpenStreetMap · Google Maps prêt dès qu’une clé est connectée';
  $('#mapFallbackBanner').textContent='Google Maps nécessite une clé Google Maps Platform valide. AUREUS-X utilise temporairement OpenStreetMap comme fond réel, sans modifier les données de recherche.';
  $('#mapFallbackBanner').classList.remove('hidden');
}

async function initMap(){
  const cfg=await getConfig();
  try{
    const maps=await loadGoogleMaps(cfg.googleMapsApiKey,cfg.googleMapId);
    state.google=maps;
    state.map=new maps.Map($('#map'),{center:{lat:46.6,lng:2.4},zoom:6,mapTypeId:'hybrid',mapId:cfg.googleMapId||undefined,streetViewControl:true,mapTypeControl:true,fullscreenControl:false});
    state.mapEngine='google';
    $('#mapEngineLabel').textContent='Google Maps · moteur cartographique opérationnel';
    $('#mapFallbackBanner').classList.add('hidden');
  }catch(e){ initLeaflet(); }
}

async function geocodeCity(city){
  const r=await fetch('/api/geocode?q='+encodeURIComponent(city));
  const j=await r.json(); if(!r.ok || !j.results?.[0]) throw new Error('Ville introuvable');
  return j.results[0];
}

function clearMarkers(){
  if(state.mapEngine==='leaflet'){ state.markers.forEach(m=>m.remove()); state.markers=[]; }
  if(state.mapEngine==='google'){ state.googleMarkers.forEach(m=>m.setMap(null)); state.googleMarkers=[]; }
}

function focusCandidate(c){
  if(state.mapEngine==='leaflet'){ state.map.setView([c.lat,c.lng],15,{animate:true}); }
  else if(state.mapEngine==='google'){ state.map.panTo({lat:c.lat,lng:c.lng}); state.map.setZoom(15); }
}

function popupHtml(c){ const k=kindInfo(c.kind); return `<div style="font-family:Work Sans,sans-serif;max-width:300px"><b>${esc(c.treasureDescription)}</b><br><small>${esc(k.label)} · score ${c.score}/100</small><p style="margin:7px 0 0">${esc(c.whyHere?.[0]||'')}</p></div>`; }

function addCandidateMarker(c){
  const k=kindInfo(c.kind);
  if(state.mapEngine==='leaflet'){
    const icon=L.divIcon({className:'aureus-div-icon',html:`<div class="aureus-marker ${k.cls}">${c.score}</div>`,iconSize:[32,32],iconAnchor:[16,16]});
    const m=L.marker([c.lat,c.lng],{icon}).addTo(state.map).bindPopup(popupHtml(c)); m.on('click',()=>highlightCandidate(c.id)); state.markers.push(m);
  } else if(state.mapEngine==='google'){
    const marker=new google.maps.Marker({map:state.map,position:{lat:c.lat,lng:c.lng},title:c.treasureDescription,label:{text:String(c.score),color:'#111',fontWeight:'700',fontSize:'11px'}});
    const info=new google.maps.InfoWindow({content:popupHtml(c)}); marker.addListener('click',()=>{info.open({anchor:marker,map:state.map});highlightCandidate(c.id);}); state.googleMarkers.push(marker);
  }
}

function renderCandidates(candidates){
  const list=$('#candidateList'); list.className='candidate-list';
  if(!candidates.length){ list.innerHTML='<div class="empty-state"><div class="empty-glyph">∅</div><p>Aucun candidat géolocalisable n’a émergé des sources interrogées.</p></div>';return; }
  list.innerHTML=candidates.map(c=>{ const k=kindInfo(c.kind); return `
    <article class="candidate-card" data-id="${esc(c.id)}">
      <div class="card-top"><div><div class="eyebrow">${esc(c.place.split(',')[0])}</div><h4>${esc(c.treasureDescription)}</h4></div><div class="score">${c.score}</div></div>
      <div class="candidate-meta"><span class="tag ${k.cls}">${esc(k.label)}</span><span class="tag">${c.evidence?.length||0} notice(s) filtrée(s)</span></div>
      <p class="why-preview"><strong>Pourquoi ici ?</strong> ${esc(c.whyHere?.[0]||'Convergence documentaire')}</p>
      <button class="open-candidate" type="button" data-open="${esc(c.id)}">Ouvrir la fiche complète</button>
    </article>`}).join('');
  list.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click',()=>openDialog(btn.dataset.open)));
  list.querySelectorAll('.candidate-card').forEach(card=>card.addEventListener('mouseenter',()=>{ const c=state.candidates.find(x=>x.id===card.dataset.id); if(c) focusCandidate(c); }));
}

function highlightCandidate(id){
  document.querySelectorAll('.candidate-card').forEach(x=>x.style.borderColor=x.dataset.id===id?'#caa968':'');
}

function openDialog(id){
  const c=state.candidates.find(x=>x.id===id); if(!c) return; const k=kindInfo(c.kind);
  $('#dialogContent').innerHTML=`<div class="dialog-inner">
    <div class="dialog-score-row"><div><div class="eyebrow">${esc(k.label)} · ${esc(c.place)}</div><h2>${esc(c.treasureDescription)}</h2></div><div class="big-score">${c.score}/100</div></div>
    <h3>Pourquoi ce trésor est-il placé ici ?</h3>
    <div class="reason-list">${(c.whyHere||[]).map((x,i)=>`<div class="reason"><b>${i+1}.</b> ${esc(x)}</div>`).join('')}</div>
    <h3>Sources associées</h3>
    <div class="source-list">${(c.evidence||[]).map(d=>`<div class="source-row"><b>${esc(d.source)}</b> · ${esc(d.title)} ${d.date?'· '+esc(d.date):''}${d.url?` · <a href="${esc(d.url)}" target="_blank" rel="noopener">ouvrir la source</a>`:''}</div>`).join('')}</div>
  </div>`;
  $('#candidateDialog').showModal(); focusCandidate(c);
}

function renderDocuments(docs){
  const grid=$('#evidenceGrid');
  if(!docs.length){grid.innerHTML='<div class="evidence-placeholder">Aucun document retourné par les sources interrogées.</div>';return;}
  grid.innerHTML=docs.slice(0,24).map(d=>`<article class="evidence-card">
    <div class="source">${esc(d.source)} · ${esc(d.sourceType)}</div>
    <h4>${esc(d.title)}</h4>
    <p>${esc(d.description||d.coverage||'Métadonnées bibliographiques disponibles.')}</p>
    <div>${d.creator?`<span>${esc(d.creator)}</span> · `:''}${d.date?`<span>${esc(d.date)}</span> · `:''}${d.score?`<span>score ${d.score}</span>`:''}</div>
    ${d.url?`<a href="${esc(d.url)}" target="_blank" rel="noopener">Consulter la source ↗</a>`:''}
  </article>`).join('');
}

async function runMission(){
  const subject=$('#subjectInput').value.trim(), city=$('#cityInput').value.trim(); if(!city) return;
  const btn=$('#runButton'); btn.disabled=true; $('#progressPanel').classList.remove('hidden');
  const steps=['Géocodage de la ville…','Interrogation de Gallica et du Catalogue BnF…','Recherche dans Internet Archive et Wikisource…','Croisement des toponymes et des indices…','Scoring et placement cartographique…'];
  let i=0; $('#progressText').textContent=steps[i]; const timer=setInterval(()=>{$('#progressText').textContent=steps[Math.min(++i,steps.length-1)];},900);
  try{
    const geo=await geocodeCity(city); state.center={lat:geo.lat,lng:geo.lng};
    if(state.mapEngine==='leaflet') state.map.setView([geo.lat,geo.lng],12); else {state.map.panTo({lat:geo.lat,lng:geo.lng});state.map.setZoom(12);}
    const q=new URLSearchParams({city,subject,lat:String(geo.lat),lng:String(geo.lng),period:$('#periodInput').value,radius:$('#radiusInput').value});
    const r=await fetch('/api/research?'+q); const j=await r.json(); if(!r.ok) throw new Error(j.error||'Erreur de recherche');
    state.candidates=j.candidates||[]; state.documents=j.documents||[]; clearMarkers(); state.candidates.forEach(addCandidateMarker); renderCandidates(state.candidates); renderDocuments(state.documents);
    $('#resultTitle').textContent=`${city} · ${subject}`; $('#resultCount').textContent=String(state.candidates.length); $('#sourceStats').textContent=`${j.documentCount||0} documents retenus · ${j.rejectedDocumentCount||0} rejetés · ${j.sourcesQueried||0} sources interrogées`;
    if(j.errors?.length){ $('#sourceStats').textContent += ` · ${j.errors.length} source(s) momentanément indisponible(s)`; }
    if(state.candidates[0]) focusCandidate(state.candidates[0]);
  }catch(e){ $('#candidateList').className='candidate-list'; $('#candidateList').innerHTML=`<div class="empty-state"><div class="empty-glyph">!</div><p>${esc(e.message)}</p></div>`; }
  finally{clearInterval(timer);$('#progressPanel').classList.add('hidden');btn.disabled=false;}
}

$('#searchForm').addEventListener('submit',e=>{e.preventDefault();runMission();});
$('#queryExamples').addEventListener('click',e=>{const b=e.target.closest('button[data-query]');if(!b)return;$('#subjectInput').value=b.dataset.query;$('#cityInput').value=b.dataset.city;runMission();});
$('#dialogClose').addEventListener('click',()=>$('#candidateDialog').close());
$('#candidateDialog').addEventListener('click',e=>{if(e.target===$('#candidateDialog')) $('#candidateDialog').close();});
$('#satelliteButton').addEventListener('click',()=>{if(state.mapEngine==='google')state.map.setMapTypeId('hybrid');});
$('#roadButton').addEventListener('click',()=>{if(state.mapEngine==='google')state.map.setMapTypeId('roadmap');});

await initMap();
runMission();
