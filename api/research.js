const TREASURE_TERMS = [
  'trésor','tresor','cache monétaire','cache monetaire','enfoui','enfouie','enfouissement',
  'dépôt monétaire','depot monetaire','monnaie','monnaies','numéraire','numeraire','numismatique',
  'denier','deniers','aureus','statère','statere','statères','stateres','solidus','solidi',
  'écu','ecu','écus','ecus','florin','florins','louis d or','coffre','cassette','butin','magot',
  'trouvaille monétaire','trouvaille monetaire','découverte monétaire','decouverte monetaire',
  'coin hoard','hoard','buried treasure','tesoro','monedas','thesaurus','pecunia','depositum','absconditus'
];

const NUMISMATIC_ANCHORS = [
  'monnaie','monnaies','numéraire','numeraire','numismatique','numismatics','coin','coins',
  'denier','deniers','aureus','statère','statere','statères','stateres','solidus','solidi',
  'écu','ecu','écus','ecus','florin','florins','louis d or','médaille','medaille','médailles'
];

const DEPOSIT_ANCHORS = [
  'trésor','tresor','dépôt monétaire','depot monetaire','cache monétaire','cache monetaire',
  'trouvaille monétaire','trouvaille monetaire','découverte monétaire','decouverte monetaire',
  'enfoui','enfouie','enfouissement','hoard','coin hoard','buried treasure','tesoro'
];

const ARCHAEO_ANCHORS = [
  'archéologie','archeologie','archéologique','archeologique','fouille','fouilles',
  'inventaire numismatique','catalogue numismatique','dépôt votif','depot votif'
];

const SUBJECT_STOPWORDS = new Set([
  'avec','dans','pour','sur','des','les','une','aux','par','the','and','treasure',
  'trésor','tresor','enfoui','enfouie','depot','dépôt','monnaie','monnaies','archive','archives'
]);

function stripTags(s='') { return s.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim(); }
function decodeXml(s='') { return stripTags(s).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&apos;/g,"'"); }
function values(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,'gi');
  return [...block.matchAll(re)].map(m => decodeXml(m[1]));
}
function first(block, tag) { return values(block,tag)[0] || ''; }
function arkFromIdentifiers(ids=[]) { return ids.find(x=>/gallica\.bnf\.fr\/ark:\/12148\//i.test(x)) || ''; }
function clamp(n,min,max){ return Math.max(min,Math.min(max,n)); }

function normalizeForMatch(value=''){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[’']/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function phraseHit(hay, needle){
  const h=' '+normalizeForMatch(hay)+' ';
  const n=' '+normalizeForMatch(needle)+' ';
  return n.trim().length>0 && h.includes(n);
}
function countPhraseHits(hay, terms){ return terms.reduce((n,t)=>n+(phraseHit(hay,t)?1:0),0); }
function subjectTokens(subject){
  return [...new Set(normalizeForMatch(subject).split(' ').filter(t=>t.length>=4 && !SUBJECT_STOPWORDS.has(t)))];
}
function assessDocumentRelevance(d, city, subject){
  const title=d.title||'', description=d.description||'', coverage=d.coverage||'';
  const combined=`${title} ${description} ${coverage}`;
  const coverageCity=phraseHit(coverage,city), titleCity=phraseHit(title,city), descCity=phraseHit(description,city);
  const geographicScore=coverageCity?100:titleCity?80:descCity?55:0;
  const numismaticHits=countPhraseHits(combined,NUMISMATIC_ANCHORS);
  const depositHits=countPhraseHits(combined,DEPOSIT_ANCHORS);
  const archaeoHits=countPhraseHits(combined,ARCHAEO_ANCHORS);
  const strongAnchorHits=numismaticHits+depositHits;
  const thematicScore=clamp(strongAnchorHits*28+archaeoHits*12,0,100);
  const tokens=subjectTokens(subject);
  const subjectHits=tokens.filter(t=>phraseHit(combined,t)).length;
  const subjectScore=tokens.length?Math.round(subjectHits/tokens.length*100):50;
  const oldDate=/\b(1[0-8]\d{2}|19[0-5]\d)\b/.test(d.date||'');
  let score=Math.round(geographicScore*.35+thematicScore*.45+subjectScore*.15+(oldDate?5:0));
  const eligible=geographicScore>=55 && strongAnchorHits>=1 && thematicScore>=28;
  if(!eligible) score=Math.min(score,39);
  return {eligible,score:clamp(score,0,95),geographicScore,thematicScore,subjectScore};
}

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
  u.searchParams.set('q',`mediatype:texts AND (\"${city.replaceAll('"','')}\") AND (${subject.replaceAll('"','')} OR monnaie OR monnaies OR numismatique OR trésor OR \"dépôt monétaire\" OR hoard)`);
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
  return (j.query?.search||[]).map(x=>({id:`ws-${x.pageid}`,source:'Wikisource',sourceType:'texte ancien',title:x.title,creator:'',date:'',description:stripTags(x.snippet||''),coverage:'',url:`https://fr.wikisource.org/?curid=${x.pageid}`,evidenceLevel:'text'}));
}

async function geocodePlace(q, near) {
  if(!q) return null;
  const u=new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('q', q); u.searchParams.set('format','jsonv2'); u.searchParams.set('limit','1'); u.searchParams.set('addressdetails','1');
  if(near?.lat && near?.lng){ u.searchParams.set('viewbox',`${near.lng-0.8},${near.lat+0.6},${near.lng+0.8},${near.lat-0.6}`); u.searchParams.set('bounded','0'); }
  const r=await fetch(u,{headers:{'User-Agent':'AUREUS-X/0.1'}}); if(!r.ok) return null; const j=await r.json(); if(!j[0]) return null;
  return {lat:Number(j[0].lat),lng:Number(j[0].lon),name:j[0].display_name};
}

function scoreDoc(d, city, subject){ return assessDocumentRelevance(d,city,subject).score; }

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
  const rawDocs=settled.flatMap(x=>x.status==='fulfilled'?x.value:[]);
  const seen=new Set();
  const docs=rawDocs
    .map(d=>{ const a=assessDocumentRelevance(d,city,subject); return {...d,score:a.score,_relevance:a}; })
    .filter(d=>d._relevance.eligible)
    .filter(d=>{ const k=(d.ark||d.url||d.id||d.title).toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
  const rejectedDocumentCount=rawDocs.length-docs.length;
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
    score:Math.round(g.docs.reduce((a,d)=>a+d.score,0)/g.docs.length + Math.min(8,(new Set(g.docs.map(d=>d.source)).size-1)*4)),
    sourceCount:new Set(g.docs.map(d=>d.source)).size
  })).sort((a,b)=>b.score-a.score).slice(0,8);

  const candidates=[];
  for(const g of ranked){
    let geo=null;
    try { geo=await geocodePlace(g.place===city?city:`${g.place}, ${city}`, center); } catch {}
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
  return res.status(200).json({city,subject,generatedAt:new Date().toISOString(),sourcesQueried:4,documentCount:docs.length,rejectedDocumentCount,candidates,documents:docs.slice(0,40),errors,methodology:{relevanceGate:'place+explicit-thematic-anchor',bareSubstringOr:false}});
}
