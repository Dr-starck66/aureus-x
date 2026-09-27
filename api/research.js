const TREASURE_TERMS = [
  'trésor','tresor','cache','caché','cachee','enfoui','enfouie','dépôt','depot','monnaies','numéraire','numeraire','cassette','coffre','or','argent','bijoux','reliques','butin','magot',
  'tesoro','enterrado','oculto','monedas','cofre','oro','plata','joias','tresaur','amagat','monedes','cofre',
  'thesaurus','aurum','argentum','pecunia','arca','depositum','absconditus'
];

function stripTags(s='') { return s.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim(); }
function decodeXml(s='') { return stripTags(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'"); }
function values(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'gi');
  return [...block.matchAll(re)].map(m => decodeXml(m[1]));
}
function first(block, tag) { return values(block,tag)[0] || ''; }
function arkFromIdentifiers(ids=[]) { return ids.find(x=>/gallica\.bnf\.fr\/ark:\/12148\//i.test(x)) || ''; }
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }

async function gallicaSearch(city, subject, max=15) {
  const q = `(${`gallica all "${city.replaceAll('"','')}"`}) and (${`gallica any "${subject.replaceAll('"','')} ${TREASURE_TERMS.slice(0,16).join(' ')}"`})`;
  const u = new URL('https://gallica.bnf.fr/SRU');
  u.searchParams.set('operation','searchRetrieve'); u.searchParams.set('version','1.2'); u.searchParams.set('maximumRecords',String(max)); u.searchParams.set('startRecord','1'); u.searchParams.set('query',q); u.searchParams.set('suggest','0');
  const r = await fetch(u,{headers:{'User-Agent':'AUREUS-X/0.1'}}); if(!r.ok) throw new Error(`Gallica ${r.status}`);
  const xml = await r.text();
  const recs = [...xml.matchAll(/<srw:record>[\s\S]*?<\/srw:record>/gi)].map(m=>m[0]);
  return recs.map((b,i)=>{
    const ids=values(b,'dc:identifier'); const ark=arkFromIdentifiers(ids);
    return {
      id:`gallica-${i}-${ark||first(b,'dc:title')}`,
      source:'Gallica / BnF',
      sourceType:(first(b,'dc:type')||'Document').toLowerCase(),
      title:first(b,'dc:title')||'Document Gallica',
      creator:first(b,'dc:creator'),
      date:first(b,'dc:date'),
      description:[first(b,'dc:description'), first(b,'dc:subject')].filter(Boolean).join(' — '),
      coverage:first(b,'dc:coverage'),
      url:ark || ids.find(x=>/^https?:/i.test(x)) || '',
      ark,
      evidenceLevel:'documentary'
    };
  });
}

async function bnfSearch(city, subject, max=12) {
  const query=`bib.anywhere all "${city.replaceAll('"','')} ${subject.replaceAll('"','')}"`;
  const u=new URL('https://catalogue.bnf.fr/api/SRU');
  u.searchParams.set('version','1.2'); u.searchParams.set('operation','searchRetrieve'); u.searchParams.set('recordSchema','dublincore'); u.searchParams.set('maximumRecords',String(max)); u.searchParams.set('query',query);
  const r=await fetch(u,{headers:{'User-Agent':'AUREUS-X/0.1'}}); if(!r.ok) throw new Error(`BnF ${r.status}`);
  const xml=await r.text(); const recs=[...xml.matchAll(/<srw:record>[\s\S]*?<\/srw:record>/gi)].map(m=>m[0]);
  return recs.map((b,i)=>({
    id:`bnf-${i}-${first(b,'dc:title')}`,
    source:'Catalogue général BnF', sourceType:(first(b,'dc:type')||'notice').toLowerCase(),
    title:first(b,'dc:title')||'Notice BnF', creator:first(b,'dc:creator'), date:first(b,'dc:date'),
    description:[first(b,'dc:description'),first(b,'dc:subject')].filter(Boolean).join(' — '), coverage:first(b,'dc:coverage'),
    url:values(b,'dc:identifier').find(x=>/^https?:/i.test(x))||'', evidenceLevel:'catalogue'
  }));
}

async function internetArchiveSearch(city, subject, max=10) {
  const u=new URL('https://archive.org/advancedsearch.php');
  u.searchParams.set('q',`(${city}) AND (${subject} OR treasure OR trésor OR cache OR hoard OR buried)`);
  ['identifier','title','creator','date','description','subject','coverage','language'].forEach(f=>u.searchParams.append('fl[]',f));
  u.searchParams.set('rows',String(max)); u.searchParams.set('page','1'); u.searchParams.set('output','json');
  const r=await fetch(u,{headers:{'User-Agent':'AUREUS-X/0.1'}}); if(!r.ok) throw new Error(`Internet Archive ${r.status}`);
  const j=await r.json();
  return (j.response?.docs||[]).map((d,i)=>({
    id:`ia-${d.identifier||i}`,source:'Internet Archive',sourceType:'book/archive', title:d.title||d.identifier||'Archive', creator:Array.isArray(d.creator)?d.creator.join(', '):(d.creator||''),
    date:String(d.date||''), description:Array.isArray(d.description)?d.description.join(' '):(d.description||''), coverage:Array.isArray(d.coverage)?d.coverage.join(', '):(d.coverage||''),
    url:d.identifier?`https://archive.org/details/${encodeURIComponent(d.identifier)}`:'', evidenceLevel:'documentary'
  }));
}

async function wikisourceSearch(city, subject, max=8) {
  const u=new URL('https://fr.wikisource.org/w/api.php');
  u.searchParams.set('action','query'); u.searchParams.set('list','search'); u.searchParams.set('srsearch',`${city} ${subject} trésor cache enfoui`); u.searchParams.set('srlimit',String(max)); u.searchParams.set('format','json'); u.searchParams.set('origin','*');
  const r=await fetch(u,{headers:{'User-Agent':'AUREUS-X/0.1'}}); if(!r.ok) throw new Error(`Wikisource ${r.status}`);
  const j=await r.json();
  return (j.query?.search||[]).map(x=>({id:`ws-${x.pageid}`,source:'Wikisource',sourceType:'texte ancien',title:x.title,creator:'',date:'',description:stripTags(x.snippet||''),coverage:city,url:`https://fr.wikisource.org/?curid=${x.pageid}`,evidenceLevel:'text'}));
}

async function geocodePlace(q, near) {
  if(!q) return null;
  const u=new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', q); u.searchParams.set('format','jsonv2'); u.searchParams.set('limit','1'); u.searchParams.set('addressdetails','1');
  if(near?.lat && near?.lng){ u.searchParams.set('viewbox',`${near.lng-0.8},${near.lat+0.6},${near.lng+0.8},${near.lat-0.6}`); u.searchParams.set('bounded','0'); }
  const r=await fetch(u,{headers:{'User-Agent':'AUREUS-X/0.1'}}); if(!r.ok) return null; const j=await r.json(); if(!j[0]) return null;
  return {lat:Number(j[0].lat),lng:Number(j[0].lon),name:j[0].display_name};
}

function scoreDoc(d, city, subject){
  const hay=`${d.title} ${d.description} ${d.coverage}`.toLowerCase();
  const cityHit=hay.includes(city.toLowerCase());
  const subjWords=subject.toLowerCase().split(/\s+/).filter(x=>x.length>2);
  const subjHits=subjWords.filter(w=>hay.includes(w)).length;
  const treasureHits=TREASURE_TERMS.filter(w=>hay.includes(w.toLowerCase())).length;
  const oldDate=/\b(1[0-8]\d{2}|19[0-5]\d)\b/.test(d.date||'');
  return clamp(20+(cityHit?18:0)+Math.min(18,subjHits*6)+Math.min(30,treasureHits*8)+(oldDate?8:0),10,94);
}

function candidateKind(score, sourceCount, legendish){
  if(sourceCount>=3 && score>=80) return 'fortement_corrobore';
  if(sourceCount>=2 && score>=65) return 'corrobore';
  if(legendish) return 'legende';
  return 'piste_documentaire';
}

function summarizeTreasure(d, subject){
  const text=`${d.title} ${d.description}`.toLowerCase();
  if(/monna|numéraire|coin|pecunia/.test(text)) return 'Dépôt monétaire ou numéraire possible';
  if(/bijou|joyau|relique|orfèvr|argenterie/.test(text)) return 'Objets précieux, bijoux ou reliques possibles';
  if(/coffre|cassette|arca/.test(text)) return 'Coffre ou cassette de valeurs mentionné(e)';
  if(/guerre|occupation|armée|soldat|résistance|resistance/.test(text)) return 'Cache de crise ou dépôt lié à un contexte de conflit';
  if(/trésor|tresor|treasure|tesoro|tresaur/.test(text)) return 'Trésor explicitement mentionné dans une source';
  return subject ? `Candidat lié au sujet « ${subject} »` : 'Dépôt ou cache historique potentiel';
}

export default async function handler(req,res){
  const city=String(req.query.city||'').trim(); const subject=String(req.query.subject||'trésor enfoui').trim();
  const lat=Number(req.query.lat), lng=Number(req.query.lng); const center=Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;
  if(!city) return res.status(400).json({error:'city requis'});
  const tasks=[gallicaSearch(city,subject),bnfSearch(city,subject),internetArchiveSearch(city,subject),wikisourceSearch(city,subject)];
  const settled=await Promise.allSettled(tasks);
  const docs=settled.flatMap(x=>x.status==='fulfilled'?x.value:[]).map(d=>({...d,score:scoreDoc(d,city,subject)}));
  const errors=settled.map((x,i)=>x.status==='rejected'?['Gallica','BnF','Internet Archive','Wikisource'][i]+': '+x.reason?.message:null).filter(Boolean);

  // Group records into geocodable evidence clusters. Coverage fields are preferred because they are explicit source metadata.
  const groups=new Map();
  for(const d of docs){
    const key=(d.coverage||city).split(/[;|]/)[0].trim() || city;
    const norm=key.toLowerCase();
    if(!groups.has(norm)) groups.set(norm,{place:key,docs:[]});
    groups.get(norm).docs.push(d);
  }
  const ranked=[...groups.values()].map(g=>({
    ...g,
    score:Math.round(g.docs.reduce((a,d)=>a+d.score,0)/g.docs.length + Math.min(12,(g.docs.length-1)*4)),
    sourceCount:new Set(g.docs.map(d=>d.source)).size
  })).sort((a,b)=>b.score-a.score).slice(0,8);

  const candidates=[];
  for(const g of ranked){
    let geo=null;
    try { geo=await geocodePlace(g.place===city?city:`${g.place}, ${city}`, center); } catch {}
    if(!geo && center) geo={...center,name:city};
    if(!geo) continue;
    const top=g.docs.slice().sort((a,b)=>b.score-a.score)[0];
    const legendish=/légend|legende|folklore|tradition|conte|mythe/i.test(g.docs.map(d=>`${d.title} ${d.description}`).join(' '));
    const kind=candidateKind(g.score,g.sourceCount,legendish);
    candidates.push({
      id:`cand-${candidates.length+1}`,
      lat:geo.lat,lng:geo.lng,place:geo.name,score:clamp(g.score,0,99),kind,
      treasureDescription:summarizeTreasure(top,subject),
      whyHere:[
        `${g.sourceCount} source(s) indépendante(s) convergent sur cette zone`,
        top.coverage?`La métadonnée géographique de la source mentionne « ${top.coverage} »`:`Les sources sont explicitement reliées à « ${city} »`,
        `Meilleur document : « ${top.title} »`,
        `Score lexical/documentaire : ${top.score}/100`
      ],
      evidence:g.docs.slice(0,6)
    });
  }

  res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=86400');
  return res.status(200).json({city,subject,generatedAt:new Date().toISOString(),sourcesQueried:4,documentCount:docs.length,candidates,documents:docs.slice(0,40),errors});
}
