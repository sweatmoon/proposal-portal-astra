/* Request-scoped attachment progress. No polling, fabricated percentages or automatic retries. */
(function () {
  'use strict';
  const MIME = 'application/x-attachment-progress';
  const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

  async function readProgress(response, onEvent) {
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || ('생성 요청 실패 (' + response.status + ')'));
    }
    if (!response.headers.get('content-type')?.startsWith(MIME) || !response.body) {
      throw new Error('상세 진행 응답을 받지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let pending = new Uint8Array(0), file = null, size = 0;
    const chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (file) {
          size += value.length;
          if (size > file.size) throw new Error('파일 응답 크기가 일치하지 않습니다.');
          chunks.push(value);
          continue;
        }
        const bytes = new Uint8Array(pending.length + value.length);
        bytes.set(pending); bytes.set(value, pending.length);
        let start = 0, end;
        while ((end = bytes.indexOf(10, start)) !== -1) {
          if (end - start > 4 * 1024 * 1024) throw new Error('상세 진행 응답이 너무 큽니다.');
          const event = JSON.parse(decoder.decode(bytes.subarray(start, end)));
          start = end + 1;
          if (!event || !['ready', 'start', 'item', 'error', 'file'].includes(event.type)) throw new Error('잘못된 진행 응답입니다.');
          onEvent(event);
          if (event.type === 'error') {
            const error = new Error(event.error || '첨부 생성 실패');
            error.itemKey = event.key;
            throw error;
          }
          if (event.type === 'file') {
            if (!Number.isSafeInteger(event.size) || event.size <= 0 || typeof event.filename !== 'string') throw new Error('파일 정보가 올바르지 않습니다.');
            file = event;
            const rest = bytes.slice(start);
            size += rest.length;
            if (size > file.size) throw new Error('파일 응답 크기가 일치하지 않습니다.');
            if (rest.length) chunks.push(rest);
            break;
          }
        }
        pending = file ? new Uint8Array(0) : bytes.slice(start);
        if (pending.length > 4 * 1024 * 1024) throw new Error('상세 진행 응답이 너무 큽니다.');
      }
      if (!file || size !== file.size) throw new Error('파일 수신이 완료되지 않았습니다. 연결 중단 여부를 확인해주세요.');
      const blob = new Blob(chunks, { type: PPTX });
      const magic = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (magic[0] !== 80 || magic[1] !== 75 || magic[2] !== 3 || magic[3] !== 4) throw new Error('PPTX 파일 응답이 올바르지 않습니다.');
      return { blob, ...file };
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }

  const state = { active: false, rows: [], filename: '', url: '', totalSlides: null, focus: null, overflow: '' };
  const $ = id => document.getElementById(id);
  const statusLabels = { waiting: '대기', running: '처리 중', done: '생성 완료', warning: '검토 필요', failed: '실패', stopped: '미처리' };
  const colors = { waiting: 'bg-slate-100 text-slate-500', running: 'bg-indigo-100 text-indigo-700', done: 'bg-emerald-100 text-emerald-700', warning: 'bg-amber-100 text-amber-800', failed: 'bg-red-100 text-red-700', stopped: 'bg-slate-100 text-slate-500' };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  function open() {
    const modal = $('bundleResultModal');
    if (modal.classList.contains('hidden')) {
      state.focus = document.activeElement;
      state.overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      modal.classList.remove('hidden');
      $('brClose').focus();
    }
  }
  function close() {
    if ($('bundleResultModal').classList.contains('hidden')) return;
    $('bundleResultModal').classList.add('hidden');
    document.body.style.overflow = state.overflow;
    if (state.focus?.isConnected && !state.focus.disabled && state.focus.getClientRects().length) state.focus.focus();
    else $('brReopen').focus();
  }
  function addRow(key, label, status = 'waiting', detail = '') {
    const node = element('details', 'rounded-xl border border-slate-200 bg-white overflow-hidden');
    const summary = element('summary', 'cursor-pointer flex flex-wrap items-center gap-2 p-4 text-sm');
    const title = element('span', 'flex-1 min-w-0 font-semibold text-slate-700 break-words', label);
    title.style.overflowWrap = 'anywhere';
    const badge = element('span', '');
    const count = element('span', 'text-xs text-slate-500');
    const body = element('div', 'px-4 pb-4 text-sm text-slate-600 space-y-2');
    body.style.overflowWrap = 'anywhere';
    summary.append(title, badge, count); node.append(summary, body); $('brBody').append(node);
    const row = { key, label, status, detail, node, badge, count, body };
    state.rows.push(row); updateRow(row); return row;
  }
  function updateRow(row) {
    row.badge.className = 'text-xs font-semibold rounded px-2 py-1 ' + colors[row.status];
    row.badge.textContent = statusLabels[row.status];
    row.count.textContent = Number.isInteger(row.slideCount) ? row.slideCount + '장' : '';
    row.body.replaceChildren();
    if (row.detail) row.body.append(element('p', '', row.detail));
    if (row.warnings?.length) row.warnings.forEach(warning => row.body.append(element('p', 'text-amber-800', warning)));
    if (Number.isInteger(row.personCount)) row.body.append(element('p', '', '생성 인원: ' + row.personCount + '명'));
    if (row.personnelResults?.length) {
      const list = element('ul', 'space-y-1');
      row.personnelResults.forEach(p => list.append(element('li', p.status === 'done' ? '' : 'text-amber-800', p.name + ' — ' + (p.status === 'done' ? '포함' : '제외') + (p.detail ? ': ' + p.detail : ''))));
      row.body.append(list);
    } else if (row.skipped?.length) {
      row.body.append(element('p', 'font-semibold text-amber-800', '제외 인력 (기존 생성기에서 반환한 목록)'));
      const list = element('ul', 'space-y-1 text-amber-800');
      row.skipped.forEach(name => list.append(element('li', '', name)));
      row.body.append(list, element('p', 'text-xs text-slate-500', '이 항목은 개별 제외 사유를 제공하지 않습니다. 파일 없음이나 연결 실패로 단정하지 않습니다.'));
    }
    if (!row.body.childNodes.length) row.body.append(element('p', 'text-slate-500', row.status === 'waiting' ? '앞선 단계 처리 후 시작합니다.' : row.status === 'running' ? '서버에서 자료 조회·장표를 생성하고 있습니다. 완료 응답을 기다리는 중입니다.' : '추가 상세 내역이 없습니다.'));
  }
  function renderOverview() {
    const items = state.rows.filter(r => !['prepare', 'master', 'merge', 'download'].includes(r.key));
    const n = status => items.filter(r => r.status === status).length;
    const completed = n('done') + n('warning');
    $('brOverview').textContent = '표지 포함 ' + items.length + '개 항목 · 생성 완료 ' + n('done') + ' · 검토 필요 ' + n('warning') + ' · 실패 ' + n('failed') + ' · 미처리 ' + n('stopped');
    $('brProgress').max = items.length || 1;
    $('brProgress').value = completed;
    $('brProgress').setAttribute('aria-valuetext', items.length + '개 중 ' + completed + '개 생성 완료. 합본·다운로드 상태는 아래에서 확인하세요.');
    $('brFooterClose').textContent = state.active ? '닫기 (작업은 계속 진행)' : '닫기';
  }
  function begin(order, label, unsupported = []) {
    if (state.active) { open(); return false; }
    if (state.url) URL.revokeObjectURL(state.url);
    Object.assign(state, { active: true, rows: [], filename: '', url: '', totalSlides: null });
    $('brBody').replaceChildren();
    $('brDownload').classList.add('hidden');
    $('brReopen').classList.remove('hidden');
    $('brTitle').textContent = '첨부PPT 생성 중';
    $('brSubtitle').textContent = label;
    $('brNotice').textContent = '요청 준비 중입니다. 실제 항목 처리 결과에 따라 갱신됩니다. 자료 조회 중에는 시간이 걸릴 수 있습니다.';
    addRow('prepare', '템플릿·옵션 전송 및 요청 확인', 'running', '서버가 요청을 받을 때까지 기다립니다.');
    addRow('master', '첨부 마스터·사업명·주관기관 로고');
    order.forEach(o => addRow(o.key, o.menu.menu_name));
    addRow('cover', '정성제안서 첨부 표지');
    addRow('merge', '합본 및 PPTX 압축');
    addRow('download', '파일 수신 및 다운로드 요청');
    unsupported.forEach((name, i) => addRow('unsupported-' + i, name, 'stopped', '현재 API 미지원 항목으로 요청에 포함되지 않았습니다.'));
    renderOverview(); open(); return true;
  }
  function eventReceived(event) {
    if (event.type === 'ready') {
      const prepare = state.rows.find(r => r.key === 'prepare');
      Object.assign(prepare, { status: 'done', detail: '요청 접수 및 템플릿 입력 검사 완료' }); updateRow(prepare);
      $('brNotice').textContent = '서버가 요청을 받았습니다. 선택 순서대로 처리합니다. 항목을 펼치면 상세 내역을 볼 수 있습니다.';
      return;
    }
    if (event.type === 'error') return; // readProgress rejects with the precise item key.
    if (event.type === 'file') {
      state.totalSlides = event.totalSlides;
      const merge = state.rows.find(r => r.key === 'merge');
      Object.assign(merge, { status: 'done', detail: '합본과 압축 완료. 전체 ' + event.totalSlides + '장' }); updateRow(merge);
      const download = state.rows.find(r => r.key === 'download');
      Object.assign(download, { status: 'running', detail: '파일을 수신하고 있습니다. 아직 다운로드를 요청하지 않았습니다.' }); updateRow(download);
    } else {
      const row = state.rows.find(r => r.key === event.key);
      if (!row) throw new Error('요청하지 않은 항목의 진행 응답입니다.');
      if (event.type === 'start') { row.status = 'running'; }
      if (event.type === 'item') {
        Object.assign(row, { slideCount: event.slideCount, personCount: event.personCount, detail: event.detail || '', warnings: event.warnings, skipped: event.skipped, personnelResults: event.personnelResults });
        row.status = event.warnings?.length || event.skipped?.length || event.slideCount === 0 ? 'warning' : 'done';
        if (event.slideCount === 0) row.detail += ' 생성된 장표가 없습니다.';
        if (row.status === 'warning') row.node.open = true;
      }
      updateRow(row);
    }
    renderOverview();
  }
  function fail(error) {
    state.active = false;
    let failed = state.rows.find(r => r.key === error.itemKey) || state.rows.find(r => r.status === 'running') || state.rows.find(r => r.key === 'download');
    for (const row of state.rows) {
      if (row === failed) { row.status = 'failed'; row.detail = error.message || '알 수 없는 오류'; row.node.open = true; }
      else if (row.status === 'waiting' || row.status === 'running') { row.status = 'stopped'; row.detail = '앞선 오류로 처리하지 못했습니다.'; }
      updateRow(row);
    }
    $('brTitle').textContent = '첨부PPT 생성·다운로드 실패';
    $('brNotice').textContent = '완료된 항목의 내역은 보존했습니다. 합본 또는 파일 수신에 실패하면 새 파일을 다운로드하지 않습니다. 자동 재요청은 하지 않습니다.';
    renderOverview();
  }
  function download() {
    if (!state.url) return;
    const a = document.createElement('a'); a.href = state.url; a.download = state.filename;
    document.body.append(a); a.click(); a.remove();
  }
  async function request(url, form) {
    $('brNotice').textContent = '템플릿과 옵션을 전송하고 서버 응답을 기다리고 있습니다.';
    const response = await fetch(url, { method: 'POST', body: form, headers: { Accept: MIME } });
    const result = await readProgress(response, eventReceived);
    state.filename = result.filename;
    state.url = URL.createObjectURL(result.blob);
    $('brDownload').classList.remove('hidden');
    download();
    state.active = false;
    const row = state.rows.find(r => r.key === 'download');
    Object.assign(row, { status: 'done', detail: '파일 수신 완료 · 브라우저에 다운로드를 요청했습니다. 실제 저장 여부는 브라우저 다운로드 목록에서 확인해주세요.' }); updateRow(row);
    row.badge.textContent = '다운로드 요청됨';
    const review = state.rows.some(r => ['warning', 'stopped'].includes(r.status));
    $('brTitle').textContent = review ? '첨부PPT 생성 완료 · 검토 필요' : '첨부PPT 생성 완료';
    $('brSubtitle').textContent = result.filename + ' · 전체 ' + result.totalSlides + '장';
    $('brNotice').textContent = '브라우저에 다운로드를 요청했습니다. 누락·제외 인력과 항목별 결과를 확인해주세요. 다시 다운로드는 생성 요청 없이 같은 파일을 받습니다.';
    renderOverview();
  }
  document.addEventListener('keydown', event => {
    if ($('bundleResultModal').classList.contains('hidden')) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const controls = Array.from($('bundleResultModal').querySelectorAll('button, summary, a[href]')).filter(el => !el.disabled && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  });
  window.addEventListener('beforeunload', event => {
    if (state.active) { event.preventDefault(); event.returnValue = ''; }
  });
  window.AttachmentProgress = { begin, request, fail, open, close, download, readProgress, get active() { return state.active; } };
})();
