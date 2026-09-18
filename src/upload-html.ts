/**
 * 업로드 페이지 HTML
 * 인력 / 사업 HTML 파일 업로드 → 파싱 → DB 적재 (최대 10개 병렬)
 */
export const uploadHtml = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>파일 업로드 — 제안팀 포털</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
  <style>
    .drop-zone {
      border: 2px dashed #94a3b8;
      transition: border-color .2s, background .2s;
    }
    .drop-zone.dragover {
      border-color: #6366f1;
      background: #eef2ff;
    }
    .log-line { font-family: monospace; font-size: 13px; }
    .log-ok   { color: #16a34a; }
    .log-err  { color: #dc2626; }
    .log-info { color: #2563eb; }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">

<!-- 상단 네비 -->
<nav class="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-6 shadow-sm">
  <span class="font-bold text-indigo-700 text-lg"><i class="fas fa-building mr-2"></i>제안팀 포털</span>
  <a href="/upload" class="text-indigo-600 font-medium text-sm"><i class="fas fa-upload mr-1"></i>업로드</a>
</nav>

<div class="max-w-4xl mx-auto px-6 py-10">
  <h1 class="text-2xl font-bold text-slate-800 mb-2">
    <i class="fas fa-file-upload text-indigo-500 mr-2"></i>HTML 파일 업로드
  </h1>
  <p class="text-slate-500 text-sm mb-8">인력 프로파일 또는 사업 제안작업표 HTML을 업로드하면 자동으로 파싱하여 DB에 적재합니다.<br>
  <span class="text-amber-600 font-medium">동일한 이름(인력명/사업명)이 이미 존재하면 덮어씁니다.</span>
  <span class="ml-2 text-slate-400">· 1회 최대 <strong class="text-indigo-600">10개</strong> 파일 병렬 처리</span></p>

  <div class="grid md:grid-cols-2 gap-6">

    <!-- 인력 업로드 카드 -->
    <div class="bg-white rounded-2xl shadow border border-slate-200 p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
          <i class="fas fa-user text-blue-600"></i>
        </div>
        <div>
          <h2 class="font-bold text-slate-800">인력 프로파일</h2>
          <p class="text-xs text-slate-400">프로파일(성명).html · 최대 10개</p>
        </div>
      </div>

      <div id="drop-personnel"
           class="drop-zone rounded-xl p-6 text-center cursor-pointer mb-3"
           onclick="document.getElementById('file-personnel').click()">
        <i class="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2"></i>
        <p class="text-sm text-slate-500">파일을 여기에 드래그하거나 클릭하여 선택</p>
        <p id="fname-personnel" class="text-xs text-indigo-600 mt-1 font-medium"></p>
      </div>
      <input type="file" id="file-personnel" accept=".html" multiple class="hidden">

      <!-- 선택된 파일 목록 -->
      <ul id="filelist-personnel" class="mb-3 space-y-1 max-h-32 overflow-y-auto hidden"></ul>

      <button id="btn-personnel"
              onclick="uploadFiles('personnel')"
              class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition disabled:opacity-40"
              disabled>
        <i class="fas fa-upload mr-2"></i>인력 DB 적재
      </button>

      <!-- 진행률 -->
      <div id="progress-personnel" class="mt-3 hidden">
        <div class="flex justify-between text-xs text-slate-500 mb-1">
          <span>처리 중...</span>
          <span id="progress-personnel-text">0 / 0</span>
        </div>
        <div class="w-full bg-slate-200 rounded-full h-2">
          <div id="progress-personnel-bar" class="bg-blue-500 h-2 rounded-full transition-all" style="width:0%"></div>
        </div>
      </div>

      <!-- 적재 결과 요약 -->
      <div id="result-personnel" class="mt-4 hidden">
        <div class="bg-slate-50 rounded-xl p-4 text-sm space-y-1" id="result-personnel-inner"></div>
      </div>
    </div>

    <!-- 사업 업로드 카드 -->
    <div class="bg-white rounded-2xl shadow border border-slate-200 p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
          <i class="fas fa-briefcase text-emerald-600"></i>
        </div>
        <div>
          <h2 class="font-bold text-slate-800">사업 제안작업표</h2>
          <p class="text-xs text-slate-400">[사업명] 감리 용역.html · 최대 10개</p>
        </div>
      </div>

      <div id="drop-project"
           class="drop-zone rounded-xl p-6 text-center cursor-pointer mb-3"
           onclick="document.getElementById('file-project').click()">
        <i class="fas fa-cloud-upload-alt text-3xl text-slate-300 mb-2"></i>
        <p class="text-sm text-slate-500">파일을 여기에 드래그하거나 클릭하여 선택</p>
        <p id="fname-project" class="text-xs text-emerald-600 mt-1 font-medium"></p>
      </div>
      <input type="file" id="file-project" accept=".html" multiple class="hidden">

      <!-- 선택된 파일 목록 -->
      <ul id="filelist-project" class="mb-3 space-y-1 max-h-32 overflow-y-auto hidden"></ul>

      <button id="btn-project"
              onclick="uploadFiles('project')"
              class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm transition disabled:opacity-40"
              disabled>
        <i class="fas fa-upload mr-2"></i>사업 DB 적재
      </button>

      <!-- 진행률 -->
      <div id="progress-project" class="mt-3 hidden">
        <div class="flex justify-between text-xs text-slate-500 mb-1">
          <span>처리 중...</span>
          <span id="progress-project-text">0 / 0</span>
        </div>
        <div class="w-full bg-slate-200 rounded-full h-2">
          <div id="progress-project-bar" class="bg-emerald-500 h-2 rounded-full transition-all" style="width:0%"></div>
        </div>
      </div>

      <!-- 적재 결과 요약 -->
      <div id="result-project" class="mt-4 hidden">
        <div class="bg-slate-50 rounded-xl p-4 text-sm space-y-1" id="result-project-inner"></div>
      </div>
    </div>
  </div>

  <!-- 처리 로그 -->
  <div class="mt-8 bg-white rounded-2xl shadow border border-slate-200 p-6">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-bold text-slate-700 text-sm"><i class="fas fa-terminal mr-2 text-slate-400"></i>처리 로그</h3>
      <button onclick="clearLog()" class="text-xs text-slate-400 hover:text-slate-600">초기화</button>
    </div>
    <div id="log" class="min-h-16 max-h-64 overflow-y-auto space-y-0.5 bg-slate-900 rounded-xl p-4">
      <p class="log-line log-info">대기 중... HTML 파일을 선택해주세요.</p>
    </div>
  </div>
</div>

<script>
const MAX_FILES = 10
const state = { personnel: [], project: [] }

// ── 파일 목록 UI 렌더 ─────────────────────────────────────────
function renderFileList(type) {
  const files = state[type]
  const ul = document.getElementById('filelist-' + type)
  const nameEl = document.getElementById('fname-' + type)
  const btn = document.getElementById('btn-' + type)

  if (files.length === 0) {
    ul.classList.add('hidden')
    nameEl.textContent = ''
    btn.disabled = true
    return
  }

  ul.classList.remove('hidden')
  ul.innerHTML = files.map((f, i) =>
    \`<li class="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-1.5">
      <span class="text-slate-700 truncate max-w-[180px]"><i class="fas fa-file-code mr-1 text-slate-400"></i>\${f.name}</span>
      <button onclick="removeFile('\${type}', \${i})" class="text-slate-300 hover:text-red-500 ml-2"><i class="fas fa-times"></i></button>
    </li>\`
  ).join('')

  nameEl.textContent = files.length + '개 파일 선택됨'
  btn.disabled = false
}

function removeFile(type, idx) {
  state[type].splice(idx, 1)
  renderFileList(type)
}

// ── 드래그 앤 드롭 & 파일 선택 ──────────────────────────────
function setupDrop(type) {
  const zone = document.getElementById('drop-' + type)
  const input = document.getElementById('file-' + type)

  input.addEventListener('change', () => {
    handleFiles(type, Array.from(input.files))
    input.value = '' // 같은 파일 재선택 허용
  })

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover') })
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'))
  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('dragover')
    handleFiles(type, Array.from(e.dataTransfer.files))
  })
}

function handleFiles(type, newFiles) {
  const htmlFiles = newFiles.filter(f => f.name.endsWith('.html'))
  const nonHtml = newFiles.length - htmlFiles.length
  if (nonHtml > 0) addLog('err', nonHtml + '개 파일은 HTML이 아니어서 제외됨')

  const merged = [...state[type], ...htmlFiles]
  if (merged.length > MAX_FILES) {
    addLog('err', \`최대 \${MAX_FILES}개까지만 선택 가능합니다. 앞의 \${MAX_FILES}개만 사용합니다.\`)
    state[type] = merged.slice(0, MAX_FILES)
  } else {
    state[type] = merged
  }

  if (htmlFiles.length > 0)
    addLog('info', htmlFiles.length + '개 파일 추가됨 (총 ' + state[type].length + '개)')

  renderFileList(type)
}

setupDrop('personnel')
setupDrop('project')

// ── 병렬 업로드 처리 ─────────────────────────────────────────
async function uploadFiles(type) {
  const files = state[type]
  if (files.length === 0) return

  const btn = document.getElementById('btn-' + type)
  const progressEl = document.getElementById('progress-' + type)
  const progressBar = document.getElementById('progress-' + type + '-bar')
  const progressText = document.getElementById('progress-' + type + '-text')
  const resultEl = document.getElementById('result-' + type)
  const resultInner = document.getElementById('result-' + type + '-inner')

  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>처리 중...'
  progressEl.classList.remove('hidden')
  resultEl.classList.add('hidden')

  const total = files.length
  let done = 0
  const results = []

  addLog('info', \`[\${type}] \${total}개 파일 병렬 업로드 시작\`)

  const endpoint = type === 'personnel' ? '/api/upload/personnel' : '/api/upload/project'

  // 전체 동시 병렬 처리 (Promise.all)
  await Promise.all(files.map(async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch(endpoint, { method: 'POST', body: formData })
      const json = await res.json()
      done++
      progressBar.style.width = (done / total * 100) + '%'
      progressText.textContent = done + ' / ' + total

      if (json.ok) {
        addLog('ok', '✅ ' + file.name + ' → ' + (json.message || '완료'))
        results.push({ ok: true, file: file.name, data: json.data })
      } else {
        addLog('err', '❌ ' + file.name + ' → ' + (json.error || '오류'))
        results.push({ ok: false, file: file.name, error: json.error })
      }
    } catch (e) {
      done++
      progressBar.style.width = (done / total * 100) + '%'
      progressText.textContent = done + ' / ' + total
      addLog('err', '❌ ' + file.name + ' → 네트워크 오류: ' + e.message)
      results.push({ ok: false, file: file.name, error: e.message })
    }
  }))

  // 결과 요약
  const okCount = results.filter(r => r.ok).length
  const errCount = results.length - okCount
  addLog(errCount === 0 ? 'ok' : 'err',
    \`[\${type}] 완료 — 성공: \${okCount}개 / 실패: \${errCount}개\`)

  showBatchResult(type, results)

  btn.innerHTML = '<i class="fas fa-check mr-2"></i>완료 (재업로드 가능)'
  btn.disabled = false
  progressEl.classList.add('hidden')

  // 성공한 파일은 목록에서 제거
  state[type] = state[type].filter((f, i) => !results[i]?.ok)
  renderFileList(type)
  if (state[type].length > 0)
    addLog('info', '실패한 ' + state[type].length + '개 파일이 목록에 남아있습니다.')
}

// ── 배치 결과 요약 표시 ───────────────────────────────────────
function showBatchResult(type, results) {
  const el = document.getElementById('result-' + type)
  const inner = document.getElementById('result-' + type + '-inner')
  el.classList.remove('hidden')

  const okList = results.filter(r => r.ok)
  const errList = results.filter(r => !r.ok)

  let html = ''
  if (okList.length > 0) {
    html += \`<p class="text-green-600 font-semibold mb-2"><i class="fas fa-check-circle mr-1"></i>성공 \${okList.length}개</p>\`
    html += okList.map(r => {
      const d = r.data
      if (type === 'personnel') {
        return \`<div class="text-xs bg-white rounded-lg px-3 py-2 mb-1 border border-slate-100">
          <span class="font-medium text-slate-700">\${d.name}</span>
          <span class="text-slate-400 ml-2">자격증 \${d.certifications}건 · 감리실적 \${d.audit_history}건 · IT경력 \${d.it_career}건</span>
        </div>\`
      } else {
        return \`<div class="text-xs bg-white rounded-lg px-3 py-2 mb-1 border border-slate-100">
          <span class="font-medium text-slate-700">\${d.project_name}</span>
          <span class="text-slate-400 ml-2">키워드 \${d.keywords}개 · 단계 \${d.phases} · 인력 \${d.proposal_members}명</span>
        </div>\`
      }
    }).join('')
  }
  if (errList.length > 0) {
    html += \`<p class="text-red-600 font-semibold mt-2 mb-1"><i class="fas fa-times-circle mr-1"></i>실패 \${errList.length}개</p>\`
    html += errList.map(r =>
      \`<div class="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5 mb-1">\${r.file}: \${r.error}</div>\`
    ).join('')
  }

  inner.innerHTML = html
}

// ── 로그 ──────────────────────────────────────────────────────
function addLog(type, msg) {
  const log = document.getElementById('log')
  const p = document.createElement('p')
  const ts = new Date().toLocaleTimeString('ko-KR', {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  p.className = 'log-line log-' + type
  p.textContent = '[' + ts + '] ' + msg
  log.appendChild(p)
  log.scrollTop = log.scrollHeight
}

function clearLog() {
  document.getElementById('log').innerHTML = '<p class="log-line log-info">로그 초기화됨</p>'
}
</script>
</body>
</html>
`
