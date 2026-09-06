/* Progress persistence. Inlined into every standalone lesson by tools/build_lessons.py. */
function cleanDays(raw){
  const days = {};
  DAYS.forEach((day, index)=>{
    const n = index + 1;
    const old = isPlainObject(raw) && isPlainObject(raw[n]) ? raw[n] : {};
    const checks = {};
    day.steps.forEach((step, si)=> step.blocks.filter(b=>b.b === 'checks').forEach(b=>{
      b.items.forEach((_, i)=>{
        const key = `${n}-${si}-${i}`;
        if(isPlainObject(old.checks) && old.checks[key] === true) checks[key] = true;
      });
    }));
    days[n] = {checks};
  });
  return days;
}
function loadProgress(){
  let value = {days:{}};
  try{
    const raw = localStorage.getItem(KEY);
    if(raw !== null){
      value = JSON.parse(raw);
      if(!isPlainObject(value)) throw new Error('invalid state');
      if(!isPlainObject(value.days) || Object.values(value.days).some(d=>!isPlainObject(d) || !isPlainObject(d.checks))){
        progressNotice = '部分进度格式异常，已恢复可读取的记录。建议导出一份备份。';
      }
    }
  }catch(e){
    value = {days:{}};
    progressNotice = '无法读取本周进度。原存储未被覆盖；请检查浏览器设置，或从备份恢复。';
  }
  value.days = cleanDays(value.days);
  return value;
}
function progressMessage(message){
  progressNotice = message;
  let bar = document.getElementById('progressNotice');
  if(!bar){
    bar = document.createElement('aside');
    bar.id = 'progressNotice'; bar.className = 'progress-notice';
    bar.setAttribute('role', 'status'); bar.setAttribute('aria-live','polite');
    bar.innerHTML = '<span data-progress-message></span><button type="button" class="btn" data-progress-retry>重试保存</button><button type="button" class="btn" data-progress-export>导出备份</button>';
    bar.querySelector('[data-progress-retry]').onclick = ()=>save();
    bar.querySelector('[data-progress-export]').onclick = exportProgress;
    document.body.appendChild(bar);
  }
  bar.querySelector('[data-progress-message]').textContent = message;
  bar.hidden = !message;
}
function save(){
  try{
    const json = JSON.stringify(state);
    localStorage.setItem(KEY, json);
    if(localStorage.getItem(KEY) !== json) throw new Error('readback failed');
    progressDirty = false;
    if(progressNotice) progressMessage('');
    return true;
  }catch(e){
    progressDirty = true;
    progressMessage('本次进度尚未保存，关闭页面可能丢失。可以重试保存，或先导出备份。');
    return false;
  }
}
function dayState(n){
  if(!isPlainObject(state.days[n])) state.days[n] = {checks:{}};
  if(!isPlainObject(state.days[n].checks)) state.days[n].checks = {};
  return state.days[n];
}
function progressBackup(){
  return {format:'soundblocks-progress', schemaVersion:1, storageKey:KEY,
    exportedAt:new Date().toISOString(), state:JSON.parse(JSON.stringify(state))};
}
function exportProgress(){
  const url = URL.createObjectURL(new Blob([JSON.stringify(progressBackup(), null, 2)], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = `${KEY}-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}
function parseProgressBackup(text){
  if(text.length > 1024 * 1024) throw new Error('备份超过 1 MB，请选择本课件导出的进度文件。');
  const data = JSON.parse(text);
  if(data.format !== 'soundblocks-progress' || data.schemaVersion !== 1) throw new Error('不支持的备份格式或版本。');
  if(data.storageKey !== KEY) throw new Error('这不是本周的备份，请在对应周课件中导入。');
  if(!isPlainObject(data.state) || !isPlainObject(data.state.days)) throw new Error('备份中的进度格式不正确。');
  const candidate = {days:cleanDays(data.state.days), games:data.state.games};
  if(isValidDateStr(data.state.startDate)) candidate.startDate = data.state.startDate;
  candidate.startDatePromptDismissed = data.state.startDatePromptDismissed === true;
  if(typeof cleanAssessmentState === 'function') candidate.assessments = cleanAssessmentState(data.state.assessments);
  const previous = state;
  try{ state = candidate; cleanGamesState(); }finally{ state = previous; }
  return candidate;
}
function importProgress(candidate){
  const previous = state;
  state = candidate;
  if(!save()){ state = previous; return false; }
  curDay = 0; renderHome();
  return true;
}
function attachProgressPanel(panel){
  const row = document.createElement('div'); row.className = 'parent-panel__row progress-tools';
  row.innerHTML = '<button type="button" class="btn" data-export-progress>导出本周备份</button><label class="btn">选择备份<input type="file" accept=".json,application/json" data-import-progress></label><span data-import-status role="status"></span><button type="button" class="btn" data-import-confirm hidden>用备份恢复本周进度</button>';
  panel.querySelector('.parent-panel').appendChild(row);
  row.querySelector('[data-export-progress]').onclick = exportProgress;
  const confirm = row.querySelector('[data-import-confirm]');
  const status = row.querySelector('[data-import-status]');
  let candidate = null, token = 0;
  row.querySelector('input').onchange = async e=>{
    const currentToken = ++token;
    candidate = null; confirm.hidden = true; status.textContent = '';
    const file = e.target.files[0]; if(!file) return;
    try{
      if(file.size > 1024 * 1024) throw new Error('备份超过 1 MB。');
      const text = await file.text();
      if(currentToken !== token || !row.isConnected) return;
      candidate = parseProgressBackup(text);
      const count = Object.values(candidate.days).reduce((n,d)=>n+Object.keys(d.checks).length,0);
      status.textContent = `已读取本周备份，含 ${count} 项打卡。恢复会替换当前进度，建议先导出当前备份。`;
      confirm.hidden = false;
    }catch(err){ if(currentToken === token) status.textContent = err.message || '无法读取备份。'; }
  };
  confirm.onclick = ()=>{ if(candidate && !importProgress(candidate)) status.textContent = '恢复未完成，当前进度保留。请解决存储问题后再试。'; };
}
window.addEventListener('beforeunload', e=>{ if(progressDirty){ e.preventDefault(); e.returnValue = ''; } });
setTimeout(()=>{ if(progressNotice) progressMessage(progressNotice); }, 0);
