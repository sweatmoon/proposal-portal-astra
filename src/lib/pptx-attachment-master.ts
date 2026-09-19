import JSZip from 'jszip'
import { DOMParser, XMLSerializer, type Document, type Element } from '@xmldom/xmldom'
import { createHash } from 'node:crypto'
import { posix } from 'node:path'
import { applyPlaceholderMap } from './pptx-runtext.js'
import type { ClientLogoResult } from './nas-client.js'

const P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const R = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OR = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
const nodes = (root: Document | Element, name: string, ns = P): Element[] => Array.from(root.getElementsByTagNameNS(ns, name))
const xml = (doc: Document) => new XMLSerializer().serializeToString(doc)
const relPath = (owner: string) => posix.join(posix.dirname(owner), '_rels', posix.basename(owner) + '.rels')
function parse(text: string): Document {
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('허용되지 않는 PPT XML 선언입니다')
  return new DOMParser({ onError: (level, message) => { if (level !== 'warning') throw new Error(message) } }).parseFromString(text, 'application/xml')
}
async function document(zip: JSZip, path: string) {
  const file = zip.file(path)
  if (!file) throw new Error('PPT 관계 파일이 없습니다: ' + path)
  return parse(await file.async('string'))
}
function resolve(owner: string, target: string) {
  if (!target || /[\\?#]|^[a-z]+:/i.test(target)) throw new Error('지원하지 않는 PPT 내부 관계입니다')
  const path = target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(owner), target)
  const normalized = posix.normalize(path)
  if (normalized.startsWith('../') || normalized === '..') throw new Error('PPT 패키지 경로가 올바르지 않습니다')
  return normalized
}
function addRel(doc: Document, type: string, target: string) {
  const ids = new Set(nodes(doc, 'Relationship', R).map(n => n.getAttribute('Id')))
  let i = 1; while (ids.has('rIdAttach' + i)) i++
  const id = 'rIdAttach' + i
  const rel = doc.createElementNS(R, 'Relationship')
  rel.setAttribute('Id', id); rel.setAttribute('Type', OR + '/' + type); rel.setAttribute('Target', target)
  doc.documentElement!.appendChild(rel)
  return id
}
function size(doc: Document) {
  const s = nodes(doc, 'sldSz')[0]
  const w = Number(s?.getAttribute('cx')), h = Number(s?.getAttribute('cy'))
  if (!(w > 0 && h > 0)) throw new Error('장표 크기를 확인할 수 없습니다')
  return { w, h }
}
export async function inspectAttachmentMaster(buffer: Buffer) {
  if (buffer.length > 20 * 1024 * 1024) throw new Error('첨부 마스터는 20MB 이하여야 합니다')
  const zip = await JSZip.loadAsync(buffer)
  const pres = await document(zip, 'ppt/presentation.xml'), presRels = await document(zip, 'ppt/_rels/presentation.xml.rels')
  const parts = new Set<string>(), layouts: { name: string; path: string }[] = []
  for (const rid of nodes(pres, 'sldMasterId')) {
    const rel = nodes(presRels, 'Relationship', R).find(r => r.getAttribute('Id') === rid.getAttributeNS(OR, 'id') && r.getAttribute('Type') === OR + '/slideMaster' && r.getAttribute('TargetMode') !== 'External')
    if (!rel) throw new Error('첨부 마스터 연결이 올바르지 않습니다')
    const path = resolve('ppt/presentation.xml', rel.getAttribute('Target')!)
    const master = await document(zip, path), rels = await document(zip, relPath(path)); parts.add(path)
    for (const id of nodes(master, 'sldLayoutId')) {
      const lr = nodes(rels, 'Relationship', R).find(r => r.getAttribute('Id') === id.getAttributeNS(OR, 'id') && r.getAttribute('Type') === OR + '/slideLayout' && r.getAttribute('TargetMode') !== 'External')
      if (!lr) throw new Error('첨부 레이아웃 연결이 올바르지 않습니다')
      const lp = resolve(path, lr.getAttribute('Target')!), ld = await document(zip, lp)
      const back = nodes(await document(zip, relPath(lp)), 'Relationship', R).filter(r => r.getAttribute('Type') === OR + '/slideMaster')
      if (back.length !== 1 || back[0].getAttribute('TargetMode') === 'External' || resolve(lp, back[0].getAttribute('Target')!) !== path) throw new Error('첨부 레이아웃의 마스터 연결이 다릅니다')
      parts.add(lp); layouts.push({ name: nodes(ld, 'cSld')[0]?.getAttribute('name') || '', path: lp })
    }
  }
  for (const name of ['첨부 표지', '첨부 내용']) if (layouts.filter(l => l.name === name).length !== 1) throw new Error('첨부 마스터에는 유일한 “' + name + '” 레이아웃이 필요합니다')
  await document(zip, '[Content_Types].xml')
  return { zip, layouts, parts: [...parts], size: size(pres) }
}
function imageInfo(uri: string) {
  const match = uri.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/)
  if (!match || match[2].length > 12 * 1024 * 1024) throw new Error('로고 이미지 형식 또는 크기 오류')
  const bytes = Buffer.from(match[2], 'base64')
  let width = 0, height = 0
  if (match[1] === 'png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR') {
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20)
  } else if (match[1] === 'jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let i = 2
    while (i + 8 < bytes.length) {
      if (bytes[i++] !== 255) break
      while (bytes[i] === 255) i++
      const marker = bytes[i++]
      if (marker === 217 || marker === 218) break
      const length = bytes.readUInt16BE(i)
      if (length < 2 || i + length > bytes.length) break
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) { height = bytes.readUInt16BE(i+3); width = bytes.readUInt16BE(i+5); break }
      i += length
    }
  }
  if (!(width > 0 && height > 0 && width <= 30000 && height <= 30000)) throw new Error('로고 이미지 크기를 확인할 수 없습니다')
  return { bytes, width, height, ext: match[1] === 'png' ? 'png' : 'jpg' }
}
export async function prepareAttachmentMaster(buffer: Buffer, context: { projectName: string; clientOrg: string; loadLogo: () => Promise<ClientLogoResult> }) {
  const master = await inspectAttachmentMaster(buffer), warnings: string[] = []
  const slots: { path: string; doc: Document; rels: Document; pic: Element; blip: Element }[] = []
  for (const path of master.parts) {
    const original = await master.zip.file(path)!.async('string')
    const patched = context.projectName ? applyPlaceholderMap(original, { '[감리사업명]': context.projectName }) : original
    if (!context.projectName && applyPlaceholderMap(original, { '[감리사업명]': '__check__' }) !== original) warnings.push('사업명 미확인: [감리사업명]을 유지했습니다.')
    if (patched !== original) master.zip.file(path, patched)
    const doc = parse(patched), rels = await document(master.zip, relPath(path))
    for (const pic of nodes(doc, 'pic')) {
      const props = nodes(pic, 'cNvPr')[0], blip = nodes(pic, 'blip', A)[0]
      if (!blip) continue
      const rel = nodes(rels, 'Relationship', R).find(r => r.getAttribute('Id') === blip.getAttributeNS(OR, 'embed') && r.getAttribute('TargetMode') !== 'External')
      if (!rel) continue
      const image = master.zip.file(resolve(path, rel.getAttribute('Target')!))
      const bytes = image ? await image.async('nodebuffer') : null
      const marked = ['name','descr'].some(a => /^\[?주관기관\s*로고\]?$/.test(props?.getAttribute(a)?.trim() || ''))
        || (bytes?.length === 735 && createHash('sha256').update(bytes).digest('hex') === 'bb954afa50472268925f0035fdbad85896e71397fb14a814d9c6d1237a9bea58')
      if (marked) slots.push({ path, doc, rels, pic, blip })
    }
  }
  if (slots.length) {
    try {
      if (!context.clientOrg) throw new Error('주관기관 정보 없음 (자유 생성은 사업 정보가 없습니다)')
      const result = await context.loadLogo()
      if (!result.ok || !result.dataUri) throw new Error(result.error || 'NAS 로고 조회 실패')
      const image = imageInfo(result.dataUri)
      const boxes = slots.map(slot => {
        const xfrm = nodes(slot.pic, 'xfrm', A)[0], off = xfrm && nodes(xfrm, 'off', A)[0], ext = xfrm && nodes(xfrm, 'ext', A)[0]
        const x = Number(off?.getAttribute('x')), y = Number(off?.getAttribute('y')), w = Number(ext?.getAttribute('cx')), h = Number(ext?.getAttribute('cy'))
        if (!off || !ext || !Number.isFinite(x+y) || !(w > 0 && h > 0)) throw new Error('주관기관 로고 위치를 확인할 수 없습니다')
        return { off, ext, x, y, w, h }
      })
      let file = 'ppt/media/attachment-client-logo.' + image.ext, n = 0
      while (master.zip.file(file)) file = 'ppt/media/attachment-client-logo-' + (++n) + '.' + image.ext
      master.zip.file(file, image.bytes)
      slots.forEach((slot, i) => {
        const box = boxes[i], scale = Math.min(box.w / image.width, box.h / image.height)
        const w = Math.round(image.width * scale), h = Math.round(image.height * scale)
        box.off.setAttribute('x', String(Math.round(box.x + (box.w-w)/2))); box.off.setAttribute('y', String(Math.round(box.y+(box.h-h)/2)))
        box.ext.setAttribute('cx',String(w)); box.ext.setAttribute('cy',String(h))
        nodes(slot.pic, 'srcRect', A).forEach(node => node.parentNode?.removeChild(node))
        slot.blip.setAttributeNS(OR,'r:embed',addRel(slot.rels,'image',posix.relative(posix.dirname(slot.path),file)))
        master.zip.file(slot.path,xml(slot.doc)); master.zip.file(relPath(slot.path),xml(slot.rels))
      })
      const ct = await document(master.zip,'[Content_Types].xml')
      const type = ct.createElementNS(CT,'Override'); type.setAttribute('PartName','/'+file); type.setAttribute('ContentType','image/'+(image.ext==='png'?'png':'jpeg')); ct.documentElement!.appendChild(type)
      master.zip.file('[Content_Types].xml',xml(ct))
    } catch (error) {
      warnings.push('주관기관 로고 미치환: ' + (error instanceof Error ? error.message : '조회 실패') + ' — 안내 그림을 유지했습니다.')
    }
  }
  return { ...master, warnings: [...new Set(warnings)] }
}

/** Active attachment design, source body and package dependencies preserved; never use source layout by numeric index. */
export async function mergeWithAttachmentMaster(master: Awaited<ReturnType<typeof prepareAttachmentMaster>>, decks: JSZip[]) {
  const base = master.zip, pres = await document(base,'ppt/presentation.xml'), rels = await document(base,'ppt/_rels/presentation.xml.rels'), ct = await document(base,'[Content_Types].xml')
  for (const list of nodes(pres,'sldIdLst')) list.parentNode?.removeChild(list)
  nodes(rels,'Relationship',R).filter(r=>r.getAttribute('Type')===OR+'/slide').forEach(r=>r.parentNode?.removeChild(r))
  const list = pres.createElementNS(P,'p:sldIdLst')
  const next = Array.from(pres.documentElement!.childNodes).find(n=>n.nodeType===1 && !['sldMasterIdLst','notesMasterIdLst','handoutMasterIdLst'].includes((n as Element).localName || ''))
  pres.documentElement!.insertBefore(list,next || null)
  let slideId=255
  for (let index=0;index<decks.length;index++) {
    const src=decks[index], sourcePres=await document(src,'ppt/presentation.xml'), sourceRels=await document(src,'ppt/_rels/presentation.xml.rels'), sourceCT=await document(src,'[Content_Types].xml')
    const dimensions=size(sourcePres)
    if (dimensions.w!==master.size.w || dimensions.h!==master.size.h) throw new Error('첨부 양식과 활성 마스터의 장표 크기가 다릅니다. 자동 확대·축소하지 않습니다.')
    let prefix='attachment'+index+'_'; while(Object.keys(base.files).some(path=>posix.basename(path).startsWith(prefix))) prefix='_'+prefix
    const paths=new Map<string,string>()
    for (const [path,file] of Object.entries(src.files)) {
      if (file.dir || path==='[Content_Types].xml' || path==='_rels/.rels') continue
      if (path.includes('\\') || path.startsWith('/') || posix.normalize(path)!==path || path.startsWith('../')) throw new Error('잘못된 첨부 패키지 경로입니다')
      if (!path.endsWith('.rels')) paths.set(path,posix.join(posix.dirname(path),prefix+posix.basename(path)))
    }
    let copied=0
    for (const [from,to] of paths) {
      const bytes=await src.file(from)!.async('uint8array'); copied+=bytes.length
      if (copied>150*1024*1024) throw new Error('첨부 패키지의 압축 해제 크기가 너무 큽니다')
      base.file(to,bytes)
      const type=nodes(sourceCT,'Override',CT).find(n=>n.getAttribute('PartName')==='/'+from)?.getAttribute('ContentType')
        || nodes(sourceCT,'Default',CT).find(n=>n.getAttribute('Extension')===posix.extname(from).slice(1))?.getAttribute('ContentType')
      if (!type) throw new Error('첨부 파일의 ContentType을 확인할 수 없습니다: '+from)
      const override=ct.createElementNS(CT,'Override'); override.setAttribute('PartName','/'+to); override.setAttribute('ContentType',type); ct.documentElement!.appendChild(override)
      if (src.file(relPath(from))) {
        const rd=await document(src,relPath(from))
        for(const r of nodes(rd,'Relationship',R)) {
          if(r.getAttribute('TargetMode')==='External') continue
          const target=resolve(from,r.getAttribute('Target')!), mapped=paths.get(target)
          if(!mapped) throw new Error('첨부 내부 참조 파일이 없습니다: '+target)
          r.setAttribute('Target',posix.relative(posix.dirname(to),mapped))
        }
        base.file(relPath(to),xml(rd))
      }
    }
    for(const entry of nodes(sourcePres,'sldId')) {
      const relation=nodes(sourceRels,'Relationship',R).find(r=>r.getAttribute('Id')===entry.getAttributeNS(OR,'id') && r.getAttribute('Type')===OR+'/slide' && r.getAttribute('TargetMode')!=='External')
      if(!relation) throw new Error('첨부 본문 슬라이드 연결이 없습니다')
      const from=resolve('ppt/presentation.xml',relation.getAttribute('Target')!), to=paths.get(from)
      if(!to) throw new Error('첨부 본문 슬라이드 파일이 없습니다')
      const doc=await document(base,to), rd=base.file(relPath(to))?await document(base,relPath(to)):parse('<Relationships xmlns="'+R+'"/>')
      const layout=master.layouts.find(l=>l.name===(index===0?'첨부 표지':'첨부 내용'))!
      const old=nodes(rd,'Relationship',R).filter(r=>r.getAttribute('Type')===OR+'/slideLayout')
      old.forEach(r=>r.parentNode?.removeChild(r)); addRel(rd,'slideLayout',posix.relative(posix.dirname(to),layout.path))
      doc.documentElement!.setAttribute('showMasterSp','1')
      const cs=nodes(doc,'cSld')[0]
      if(cs) Array.from(cs.childNodes).filter(n=>n.nodeType===1 && (n as Element).namespaceURI===P && (n as Element).localName==='bg').forEach(n=>cs.removeChild(n))
      base.file(to,xml(doc));base.file(relPath(to),xml(rd))
      const id=pres.createElementNS(P,'p:sldId');id.setAttribute('id',String(++slideId));id.setAttributeNS(OR,'r:id',addRel(rels,'slide',posix.relative('ppt',to)));list.appendChild(id)
    }
  }
  if(slideId===255) throw new Error('합본할 첨부 장표가 없습니다')
  base.file('ppt/presentation.xml',xml(pres));base.file('ppt/_rels/presentation.xml.rels',xml(rels));base.file('[Content_Types].xml',xml(ct))
  return base
}
