import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { PGlite } from '@electric-sql/pglite';
import { parse as htmlParse } from 'node-html-parser';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url = text => 'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
const runtext = url(compile(read('src/lib/pptx-runtext.ts')));
export const masterModuleUrl = url(compile(read('src/lib/pptx-attachment-master.ts')).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(name==='./pptx-runtext.js'?runtext:import.meta.resolve(name))));
const {inspectAttachmentMaster,prepareAttachmentMaster,mergeWithAttachmentMaster}=await import(masterModuleUrl);
export const masterBytes=readFileSync(new URL('../artifacts/attachment_user_master.pptx',import.meta.url));
const P='http://schemas.openxmlformats.org/presentationml/2006/main', A='http://schemas.openxmlformats.org/drawingml/2006/main', OR='http://schemas.openxmlformats.org/officeDocument/2006/relationships', R='http://schemas.openxmlformats.org/package/2006/relationships';
const doc=xml=>new DOMParser().parseFromString(xml,'application/xml');
const nodes=(d,n,ns=P)=>Array.from(d.getElementsByTagNameNS(ns,n));
const serialize=d=>new XMLSerializer().serializeToString(d);
const relPath=p=>posix.join(posix.dirname(p),'_rels',posix.basename(p)+'.rels');
const resolve=(p,t)=>t.startsWith('/')?t.slice(1):posix.normalize(posix.join(posix.dirname(p),t));
export const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const context=()=>({projectName:'시험 감리 & <사업>',clientOrg:'시험기관',loadLogo:async()=>({ok:true,dataUri:'data:image/png;base64,'+png})});
export async function bodyDeck(n=1){
 const z=await JSZip.loadAsync(masterBytes);
 let pres=await z.file('ppt/presentation.xml').async('string'),rels=await z.file('ppt/_rels/presentation.xml.rels').async('string'),ct=await z.file('[Content_Types].xml').async('string');
 let ids='';
 for(let i=1;i<=n;i++){
  ids+=`<p:sldId id="${255+i}" r:id="rIdSlide${i}"/>`;
  rels=rels.replace('</Relationships>',`<Relationship Id="rIdSlide${i}" Type="${OR}/slide" Target="slides/slide${i}.xml"/></Relationships>`);
  ct=ct.replace('</Types>',`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
  z.file(`ppt/slides/slide${i}.xml`,`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OR}" showMasterSp="0"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="본문 보존"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="1000000" y="3000000"/><a:ext cx="4000000" cy="900000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr sz="2000"/><a:t>고정 기관명 본문 ${i}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  z.file(`ppt/slides/_rels/slide${i}.xml.rels`,`<Relationships xmlns="${R}"><Relationship Id="rIdLayout" Type="${OR}/slideLayout" Target="../slideLayouts/slideLayout2.xml"/><Relationship Id="rId_external_1" Type="${OR}/hyperlink" Target="https://example.test/?a=1&amp;b=2" TargetMode="External"/><Relationship Id="rId_image_1" Type="${OR}/image" Target="../media/body.png"/></Relationships>`);
 }
 pres=pres.replace('<p:sldSz',`<p:sldIdLst>${ids}</p:sldIdLst><p:sldSz`);
 z.file('ppt/presentation.xml',pres);z.file('ppt/_rels/presentation.xml.rels',rels);z.file('[Content_Types].xml',ct);z.file('ppt/media/body.png',Buffer.from(png,'base64'));return z;
}
async function licenseModule(sourceBytes) {
 const mocks=url(`export async function fetchAuditorCertificatePptxs(){return new Map([['시험인력',Buffer.from('${sourceBytes.toString('base64')}','base64')]])} export async function fetchCompanyStampPng(){return null} export async function query(){throw new Error('No operating DB')} export async function queryOne(){throw new Error('No operating DB')}`);
 return import(url(compile(read('src/routes/ppt-license-certificate.ts')).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(name.startsWith('.')?mocks:import.meta.resolve(name)))));
}
async function licenseSource(jpgExtension='JPG') {
 const z=new JSZip(), bytes=[Buffer.from([255,216,255,224,0,2,255,217]),Buffer.from(png,'base64'),Buffer.from('synthetic EMF bytes')];
 const paths=[`ppt/media/certificate.${jpgExtension}`,'ppt/media/certificate.png','ppt/media/vector.emf'];
 for(let i=0;i<paths.length;i++)z.file(paths[i],bytes[i]);
 const pictures=paths.map((_,i)=>`<p:pic><p:nvPicPr><p:cNvPr id="${20+i}" name="certificate-${i}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId${i+1}"/></p:blipFill><p:spPr/></p:pic>`).join('');
 for(let n=1;n<=2;n++){
  z.file(`ppt/slides/slide${n}.xml`,`<p:sld xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${OR}"><p:cSld><p:spTree>${pictures}</p:spTree></p:cSld></p:sld>`);
  z.file(`ppt/slides/_rels/slide${n}.xml.rels`,`<Relationships xmlns="${R}">${paths.map((p,i)=>`<Relationship Id="rId${i+1}" Type="${OR}/image" Target="../media/${posix.basename(p)}"/>`).join('')}</Relationships>`);
 }
 // Prefixed elements, lower-case extension / upper-case file, and per-part Override precedence.
 z.file('[Content_Types].xml','<ct:Types xmlns:ct="http://schemas.openxmlformats.org/package/2006/content-types"><ct:Default Extension="jpg" ContentType="image/jpeg"/><ct:Default Extension="png" ContentType="image/png"/><ct:Default Extension="emf" ContentType="application/octet-stream"/><ct:Override PartName="/ppt/media/vector.emf" ContentType="image/x-emf"/></ct:Types>');
 return {z,bytes};
}
test('actual license images preserve ContentTypes and bytes through active-master merge',async()=>{
 const {z,bytes}=await licenseSource('jpg'), mod=await licenseModule(await z.generateAsync({type:'nodebuffer'}));
 const template=await bodyDeck();
 const result=await mod.buildLicenseCertificateZip(await template.generateAsync({type:'nodebuffer'}),0,false,'원본대조필','',['시험인력']);
 assert.equal(result.slideCount,2);assert.equal(result.personCount,1);
 const CT='http://schemas.openxmlformats.org/package/2006/content-types';
 const declarations=nodes(doc(await result.zip.file('[Content_Types].xml').async('string')),'Override',CT);
 for(let n=1;n<=2;n++)for(let i=0;i<3;i++){
  const path=`ppt/media/slide${n}_img${100+n*100+i}.${['jpg','png','emf'][i]}`;
  assert.deepEqual(await result.zip.file(path).async('nodebuffer'),bytes[i]);
  assert.equal(declarations.filter(d=>d.getAttribute('PartName')==='/'+path).length,1);
  assert.equal(declarations.find(d=>d.getAttribute('PartName')==='/'+path).getAttribute('ContentType'),['image/jpeg','image/png','image/x-emf'][i]);
 }
 const merged=await mergeWithAttachmentMaster(await prepareAttachmentMaster(masterBytes,context()),[await bodyDeck(),result.zip]);
 assert.equal(nodes(doc(await merged.file('ppt/presentation.xml').async('string')),'sldId').length,3);
 const mergedCT=nodes(doc(await merged.file('[Content_Types].xml').async('string')),'Override',CT);
 for(let n=1;n<=2;n++)for(let i=0;i<3;i++){
  const path=`ppt/media/attachment1_slide${n}_img${100+n*100+i}.${['jpg','png','emf'][i]}`;
  assert.deepEqual(await merged.file(path).async('nodebuffer'),bytes[i]);
  assert.equal(mergedCT.find(d=>d.getAttribute('PartName')==='/'+path).getAttribute('ContentType'),['image/jpeg','image/png','image/x-emf'][i]);
 }
 for(const p of ['ppt/slides/attachment1_slide1.xml','ppt/slides/attachment1_slide2.xml']){
  const relationships=nodes(doc(await merged.file(relPath(p)).async('string')),'Relationship',R);
  for(const blip of nodes(doc(await merged.file(p).async('string')),'blip',A)){
   const rel=relationships.find(r=>r.getAttribute('Id')===blip.getAttributeNS(OR,'embed'));
   assert(rel);assert(merged.file(resolve(p,rel.getAttribute('Target'))));
  }
 }
 // Reproduce the old builder's missing declaration: strict merger must still reject it.
 const broken=await JSZip.loadAsync(await result.zip.generateAsync({type:'nodebuffer'}));
 const badCT=doc(await broken.file('[Content_Types].xml').async('string'));
 for(const d of nodes(badCT,'Override',CT))if(d.getAttribute('PartName').includes('/slide1_img200.'))d.parentNode.removeChild(d);
 broken.file('[Content_Types].xml',serialize(badCT));
 await assert.rejects(async()=>mergeWithAttachmentMaster(await prepareAttachmentMaster(masterBytes,context()),[await bodyDeck(),broken]),/ContentType.*slide1_img200\.jpg/);
});
test('license image declarations override conflicting template defaults without altering them',async()=>{
 const {z}=await licenseSource(), mod=await licenseModule(await z.generateAsync({type:'nodebuffer'})), template=await bodyDeck();
 template.file('[Content_Types].xml',(await template.file('[Content_Types].xml').async('string')).replace('</Types>','<Default Extension="JPG" ContentType="image/template-only"/></Types>'));
 const result=await mod.buildLicenseCertificateZip(await template.generateAsync({type:'nodebuffer'}),0,false,'원본대조필','',['시험인력']);
 const CT='http://schemas.openxmlformats.org/package/2006/content-types', d=doc(await result.zip.file('[Content_Types].xml').async('string'));
 assert.equal(nodes(d,'Default',CT).find(n=>n.getAttribute('Extension')==='JPG').getAttribute('ContentType'),'image/template-only');
 assert.equal(nodes(d,'Override',CT).find(n=>n.getAttribute('PartName')==='/ppt/media/slide1_img200.JPG').getAttribute('ContentType'),'image/jpeg');
});
test('license unknown missing conflicting or invalid source image types fail instead of guessing',async()=>{
 for(const mode of ['missing-file','missing-type','conflict','non-image','invalid-xml']){
  const {z}=await licenseSource();let ct=await z.file('[Content_Types].xml').async('string');
  if(mode==='missing-file')z.remove('[Content_Types].xml');
  else {
   if(mode==='missing-type')ct=ct.replace('<ct:Default Extension="jpg" ContentType="image/jpeg"/>','');
   if(mode==='conflict')ct=ct.replace('</ct:Types>','<ct:Default Extension="JPG" ContentType="image/png"/></ct:Types>');
   if(mode==='non-image')ct=ct.replace('image/jpeg','application/octet-stream');
   if(mode==='invalid-xml')ct='<broken/>';
   z.file('[Content_Types].xml',ct);
  }
  const mod=await licenseModule(await z.generateAsync({type:'nodebuffer'}));
  await assert.rejects(async()=>mod.buildLicenseCertificateZip(await (await bodyDeck()).generateAsync({type:'nodebuffer'}),0,false,'원본대조필','',['시험인력']),/ContentType/);
 }
});
test('provided attachment master has two named portrait layouts and replaces only project token and designated logo',async()=>{
 const before=await JSZip.loadAsync(masterBytes), result=await prepareAttachmentMaster(masterBytes,context());
 assert.deepEqual(result.layouts.map(l=>l.name),['첨부 표지','첨부 내용']);assert.deepEqual(result.size,{w:6858000,h:9906000});assert.deepEqual(result.warnings,[]);
 const text=nodes(doc(await result.zip.file('ppt/slideLayouts/slideLayout2.xml').async('string')),'t',A).map(n=>n.textContent).join('');
 assert(text.includes('시험 감리 & <사업>'));assert(!text.includes('[감리사업명]'));
 for(const f of ['ppt/media/image1.png','ppt/media/image2.png'])assert.deepEqual(await result.zip.file(f).async('nodebuffer'),await before.file(f).async('nodebuffer'));
 const old=doc(await before.file('ppt/slideMasters/slideMaster1.xml').async('string')), now=doc(await result.zip.file('ppt/slideMasters/slideMaster1.xml').async('string'));
 assert.equal(new XMLSerializer().serializeToString(nodes(old,'pic')[0]),new XMLSerializer().serializeToString(nodes(now,'pic')[0]));
 const box=nodes(nodes(now,'pic')[1],'ext',A)[0];assert.equal(box.getAttribute('cx'),box.getAttribute('cy'));
 assert.deepEqual(await result.zip.file('ppt/media/attachment-client-logo.png').async('nodebuffer'),Buffer.from(png,'base64'));
});
test('missing ambiguous timeout or invalid logo retains the marker, while free mode never guesses a project or calls NAS',async()=>{
 for(const result of [{ok:false,error:'client_logo_not_found'},{ok:false,error:'client_logo_ambiguous'},{ok:false,error:'nas_timeout'},{ok:true,dataUri:'data:image/png;base64,YQ=='}]){
  const prepared=await prepareAttachmentMaster(masterBytes,{...context(),loadLogo:async()=>result});
  assert(prepared.warnings.some(w=>w.includes('로고 미치환')));assert(!prepared.zip.file('ppt/media/attachment-client-logo.png'));
 }
 const free=await prepareAttachmentMaster(masterBytes,{projectName:'',clientOrg:'',loadLogo:async()=>{throw new Error('must not call')}});
 assert(free.warnings.some(w=>w.includes('사업명 미확인')));assert(free.warnings.some(w=>w.includes('주관기관 정보 없음')));
 const original=await JSZip.loadAsync(masterBytes);
 for(const path of free.parts)assert.deepEqual(await free.zip.file(path).async('nodebuffer'),await original.file(path).async('nodebuffer'));
});
test('attachment merge maps cover/body explicitly, keeps source bodies, images and external relations, and omits master samples',async()=>{
 const source=await bodyDeck(2), cover=await bodyDeck(1), seeded=await bodyDeck(1);
 const prepared=await prepareAttachmentMaster(await seeded.generateAsync({type:'nodebuffer'}),context());
 const originalTrees=[];for(const zip of [cover,source]) for(const path of Object.keys(zip.files).filter(p=>/^ppt\/slides\/slide\d+\.xml$/.test(p))) originalTrees.push(new XMLSerializer().serializeToString(nodes(doc(await zip.file(path).async('string')),'spTree')[0]));
 const merged=await mergeWithAttachmentMaster(prepared,[cover,source]);
 const pres=doc(await merged.file('ppt/presentation.xml').async('string')), prs=doc(await merged.file('ppt/_rels/presentation.xml.rels').async('string'));
 const ids=nodes(pres,'sldId');assert.equal(ids.length,3);assert.equal(nodes(pres,'sldMasterId').length,1);
 const names=[];
 for(let i=0;i<ids.length;i++){
  const r=nodes(prs,'Relationship',R).find(r=>r.getAttribute('Id')===ids[i].getAttributeNS(OR,'id'));
  const path=resolve('ppt/presentation.xml',r.getAttribute('Target')), sd=doc(await merged.file(path).async('string'));
  assert.equal(new XMLSerializer().serializeToString(nodes(sd,'spTree')[0]),originalTrees[i]);
  assert.equal(sd.documentElement.getAttribute('showMasterSp'),'1');assert.equal(nodes(sd,'bg').length,0);
  const relationships=nodes(doc(await merged.file(relPath(path)).async('string')),'Relationship',R);
  assert.equal(relationships.find(r=>r.getAttribute('Type')===OR+'/hyperlink').getAttribute('TargetMode'),'External');
  const lr=relationships.find(r=>r.getAttribute('Type')===OR+'/slideLayout');
  names.push(nodes(doc(await merged.file(resolve(path,lr.getAttribute('Target'))).async('string')),'cSld')[0].getAttribute('name'));
 }
 assert.deepEqual(names,['첨부 표지','첨부 내용','첨부 내용']);
 const order=Array.from(pres.documentElement.childNodes).filter(n=>n.nodeType===1).map(n=>n.localName);
 assert(order.indexOf('handoutMasterIdLst')<order.indexOf('sldIdLst'));assert(order.indexOf('sldIdLst')<order.indexOf('sldSz'));
 for(const path of Object.keys(merged.files).filter(p=>p.endsWith('.rels'))){
  const owner=path==='_rels/.rels'?'':path.replace('/_rels/','/').replace(/\.rels$/,'');
  for(const r of nodes(doc(await merged.file(path).async('string')),'Relationship',R)) if(r.getAttribute('TargetMode')!=='External') assert(merged.file(resolve(owner,r.getAttribute('Target'))),'missing '+path+' -> '+r.getAttribute('Target'));
 }
});
test('attachment master validation and merging fail explicitly for wrong layouts, size or missing source dependencies',async()=>{
 const bad=await JSZip.loadAsync(masterBytes);bad.file('ppt/slideLayouts/slideLayout2.xml',(await bad.file('ppt/slideLayouts/slideLayout2.xml').async('string')).replace('첨부 내용','다른 양식'));
 await assert.rejects(()=>inspectAttachmentMaster(Buffer.from('bad')));
 await assert.rejects(async()=>inspectAttachmentMaster(await bad.generateAsync({type:'nodebuffer'})),/첨부 내용/);
 let source=await bodyDeck();source.file('ppt/presentation.xml',(await source.file('ppt/presentation.xml').async('string')).replace('6858000','9906000'));
 await assert.rejects(async()=>mergeWithAttachmentMaster(await prepareAttachmentMaster(masterBytes,context()),[source]),/크기가 다릅니다/);
 source=await bodyDeck();source.remove('ppt/media/body.png');
 await assert.rejects(async()=>mergeWithAttachmentMaster(await prepareAttachmentMaster(masterBytes,context()),[source]),/참조 파일/);
});
let integrationSequence=0;
async function bundleApp(t,{invalid=false}={}){
 const key='__attachment_master_integration_'+integrationSequence++,calls=[];
 const mocks={
  queryOne:async(sql,params)=>{calls.push({sql,params});assert(/^SELECT/.test(sql));if(sql.includes('ppt_master_templates')){assert(sql.includes("='attachment'"));return {name:'첨부 전용',pptx_b64:invalid?'YQ==':masterBytes.toString('base64')}}return {project_name:'저장된 사업명',client_org:'저장기관'}},
  fetchClientLogo:async org=>{calls.push({logo:org});return {ok:true,dataUri:'data:image/png;base64,'+png}},
  mergeDecksSharingMaster:async()=>{throw new Error('must not fall back to cover master')},
 };
 const src=read('src/routes/ppt-attachment-bundle.ts');
 for(const name of [...src.matchAll(/import \{ (build\w+)/g)].map(m=>m[1]))mocks[name]=async()=>({zip:await bodyDeck(1),projectName:'저장된 사업명',personCount:1,pageCount:1,skipped:[]});
 globalThis[key]=mocks;t.after(()=>delete globalThis[key]);
 const mockUrl=url(Object.keys(mocks).map(name=>`export const ${name}=(...a)=>globalThis[${JSON.stringify(key)}].${name}(...a);`).join('\n'));
 const code=compile(src).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(name==='../lib/pptx-attachment-master.js'?masterModuleUrl:name.startsWith('.')?mockUrl:import.meta.resolve(name)));
 return {app:(await import(url(code))).default,calls};
}
async function generateBundle(app,id){
 const f=new FormData();for(const key of ['cover','career'])f.set(key,new Blob(['template']),key+'.pptx');f.set('order','["career"]');f.set('clientOrg','임의입력금지');f.set('projectName','임의사업명금지');
 const r=await app.request('/'+id,{method:'POST',body:f,headers:{Accept:'application/x-attachment-progress'}});
 const bytes=Buffer.from(await r.arrayBuffer()),events=[];let offset=0;
 while(offset<bytes.length){const next=bytes.indexOf(10,offset);if(next<0)break;const event=JSON.parse(bytes.subarray(offset,next).toString());events.push(event);offset=next+1;if(event.type==='file')return {events,zip:await JSZip.loadAsync(bytes.subarray(offset))}}
 return {events};
}
test('attachment bundle uses saved project/org and attachment-only active master with one logo lookup',async t=>{
 const {app,calls}=await bundleApp(t),{events,zip}=await generateBundle(app,42);
 assert(zip);assert.equal(calls.filter(c=>c.logo).length,1);assert.equal(calls.find(c=>c.logo).logo,'저장기관');
 assert(events.find(e=>e.type==='item'&&e.key==='master').detail.includes('첨부 전용'));
 assert(events.at(-1).totalSlides===2);
 const text=nodes(doc(await zip.file('ppt/slideLayouts/slideLayout2.xml').async('string')),'t',A).map(n=>n.textContent).join('');assert(text.includes('저장된 사업명'));assert(!text.includes('임의사업명금지'));
});
test('attachment free mode reports preserved tokens and invalid active master fails without silent fallback',async t=>{
 const {app,calls}=await bundleApp(t),{events,zip}=await generateBundle(app,0);
 assert(zip);assert.equal(calls.filter(c=>c.logo).length,0);assert.equal(calls.filter(c=>c.sql.includes('audit_projects')).length,0);
 assert(events.find(e=>e.type==='item'&&e.key==='master').warnings.some(w=>w.includes('사업명 미확인')));
 const invalid=await bundleApp(t,{invalid:true}), result=await generateBundle(invalid.app,42);
 assert(!result.zip);assert.equal(result.events.at(-1).type,'error');assert.equal(result.events.at(-1).key,'master');
});
let database, schemaReady;
async function registry(){
 if(!schemaReady)schemaReady=(async()=>{
  database=new PGlite();await database.exec(`CREATE TABLE ppt_master_templates(id SERIAL PRIMARY KEY,name TEXT NOT NULL,description TEXT,pptx_b64 TEXT NOT NULL,layouts JSONB NOT NULL DEFAULT '[]',is_active INTEGER NOT NULL DEFAULT 0,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());`);
 })();await schemaReady;
 await database.exec('TRUNCATE ppt_master_templates RESTART IDENTITY');
 globalThis.__masterDB={query:async(sql,params=[])=>database.query(sql,params)};
 const dburl=url(`export async function query(s,p){return (await globalThis.__masterDB.query(s,p)).rows} export async function queryOne(s,p){return (await query(s,p))[0]||null} export async function transaction(fn){await globalThis.__masterDB.query('BEGIN');try{const r=await fn(globalThis.__masterDB);await globalThis.__masterDB.query('COMMIT');return r}catch(e){await globalThis.__masterDB.query('ROLLBACK');throw e}}`);
 const code=compile(read('src/routes/ppt-menu.ts')).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(name==='../db/client.js'?dburl:name==='../lib/pptx-attachment-master.js'?masterModuleUrl:import.meta.resolve(name)));
 return (await import(url(code))).default;
}
after(async()=>{await database?.close();delete globalThis.__masterDB});
const uploadForm=(buffer=masterBytes,name='첨부 원본')=>{const f=new FormData();f.set('file',new Blob([buffer]),'master.pptx');f.set('name',name);f.set('set_active','1');return f};
test('master registry separates attachment and existing proposal lists, activation and delete without schema changes',async()=>{
 const app=await registry();
 await database.query('INSERT INTO ppt_master_templates(name,pptx_b64,layouts,is_active) VALUES($1,$2,$3,1)',['본문 원본','UNCHANGED','["본문"]']);
 const pBefore=(await database.query('SELECT * FROM ppt_master_templates WHERE id=1')).rows[0];
 const r=await app.request('/master-templates?category=attachment',{method:'POST',body:uploadForm()});assert.equal(r.status,200);const id=(await r.json()).id;
 const list=await(await app.request('/master-templates?category=attachment')).json();assert.equal(list.data.length,1);assert.deepEqual(list.data[0].layouts,['첨부 표지','첨부 내용']);
 assert.equal((await(await app.request('/master-templates/active')).json()).data.name,'본문 원본');
 assert.equal((await(await app.request('/master-templates/active?category=attachment')).json()).data.pptx_b64,masterBytes.toString('base64'));
 assert.equal((await app.request('/master-templates/1/activate?category=attachment',{method:'PUT'})).status,404);
 assert.equal((await app.request('/master-templates/'+id,{method:'DELETE'})).status,404);
 assert.equal((await app.request('/master-templates/'+id+'/activate?category=attachment',{method:'PUT'})).status,200);
 assert.deepEqual((await database.query('SELECT * FROM ppt_master_templates WHERE id=1')).rows[0],pBefore);
 assert.equal((await app.request('/master-templates/'+id+'?category=attachment',{method:'DELETE'})).status,200);
 assert.equal((await(await app.request('/master-templates/active')).json()).data.id,1);
});
test('invalid attachment upload and cross-scope activation do not disable an existing active master',async()=>{
 const app=await registry();await app.request('/master-templates?category=attachment',{method:'POST',body:uploadForm()});
 const before=(await database.query('SELECT * FROM ppt_master_templates')).rows;
 assert.equal((await app.request('/master-templates?category=attachment',{method:'POST',body:uploadForm(Buffer.from('invalid'))})).status,400);
 assert.equal((await app.request('/master-templates/999/activate?category=attachment',{method:'PUT'})).status,404);
 assert.equal((await app.request('/master-templates?category=wrong')).status,400);
 assert.deepEqual((await database.query('SELECT * FROM ppt_master_templates')).rows,before);
});
test('master management SSR exposes independent attachment action and valid scoped scripts',async()=>{
 const layout=url(compile(read('src/views/layout.ts'))),dburl=url('export async function query(){return []} export async function queryOne(){return null}');
 const code=compile(read('src/routes/pages.ts')).replace(/from ['"]([^'"]+)['"]/g,(_,name)=>'from '+JSON.stringify(name==='../db/client.js'?dburl:name==='../views/layout.js'?layout:import.meta.resolve(name)));
 const app=(await import(url(code))).default, html=htmlParse(await(await app.request('/ppt-templates')).text());
 assert(html.querySelector('#masterModalTitle'));assert(html.querySelector('#masterModalHelp'));
 const scripts=html.querySelectorAll('script:not([src])').map(n=>n.rawText);for(const s of scripts)new vm.Script(s);
 assert(scripts.join('').includes('첨부 마스터 템플릿'));assert(scripts.join('').includes("'?category=' + _masterCategory"));assert(scripts.join('').includes('masterEscape(m.name)'));
});
