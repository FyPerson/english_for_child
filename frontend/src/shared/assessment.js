/* W4+ assessment UI: words appear only after explicit reveal, never have audio. */
function assessmentPool(kind){
  if(kind === 'exam') return RESERVED;
  if(kind === 'retest') return typeof RESERVED_RETEST === 'undefined' ? [] : RESERVED_RETEST;
  if(kind === 'probeA') return typeof PROBE_A === 'undefined' ? [] : PROBE_A;
  if(kind === 'probeB') return typeof PROBE_B === 'undefined' ? [] : PROBE_B;
  return [];
}
function cleanAssessmentState(raw){
  const clean = {};
  if(!isPlainObject(raw)) return clean;
  ['exam','retest','probeA','probeB','text'].forEach(kind=>{
    if(!isPlainObject(raw[kind])) return;
    const rec = raw[kind], item = {revealed:rec.revealed === true};
    if(kind === 'text'){
      const max = typeof ASSESS_TEXT === 'string' ? (ASSESS_TEXT.match(/[a-z]+/gi)||[]).length : 0;
      if(Number.isInteger(rec.errors) && rec.errors >= 0 && rec.errors <= max) item.errors = rec.errors;
      item.prompted = rec.prompted === true;
      item.understood = rec.understood === true;
    }else if(Number.isInteger(rec.score) && rec.score >= 0 && rec.score <= assessmentPool(kind).length) item.score = rec.score;
    clean[kind] = item;
  });
  return clean;
}
function escapeAssessment(value){
  return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function assessmentHTML(kind){
  const titles = {exam:'周检',retest:'复测',probeA:'段末探针首测',probeB:'段末探针复测',text:'月测阅读'};
  const rec = (state.assessments || {})[kind] || {};
  const pool = assessmentPool(kind);
  if(kind !== 'text' && !pool.length) return '';
  if(kind === 'text' && (typeof ASSESS_TEXT !== 'string' || !ASSESS_TEXT)) return '';
  if(!rec.revealed) return `<section data-assessment="${kind}" class="assessment"><p>准备好再打开${titles[kind]}。请让孩子独立读，先不示范、不点读。</p><button class="btn" data-assessment-reveal="${kind}">开始${titles[kind]}</button></section>`;
  let content;
  if(kind === 'text'){
    const count = ASSESS_TEXT.match(/[a-z]+/gi).length;
    content = `<p class="assessment-text en">${escapeAssessment(ASSESS_TEXT)}</p><p>全文 ${count} 词。3 秒内自我纠正不计错；家长给词计错；同一词每次出现分别计错。</p>
      <label>读错词数 <input type="number" min="0" max="${count}" step="1" data-assessment-errors value="${rec.errors ?? ''}"></label>
      <label><input type="checkbox" data-assessment-prompted ${rec.prompted?'checked':''}> 用过提示</label>
      <label><input type="checkbox" data-assessment-understood ${rec.understood?'checked':''}> 能说出一件主要事件</label><p data-assessment-result>${assessmentResult(rec,count)}</p>`;
  }else{
    content = `<div class="wcards">${pool.map(w=>`<div class="wcard"><div class="wcard__w">${escapeAssessment(w)}</div></div>`).join('')}</div>
      <label>读对几个 <select data-assessment-score><option value="">尚未记录</option>${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${rec.score===n?'selected':''}>${n} / 5</option>`).join('')}</select></label>`;
  }
  return `<section class="assessment" data-assessment="${kind}"><h3>${titles[kind]}</h3>${content}<p data-assessment-saved role="status"></p></section>`;
}
function assessmentResult(rec,count){
  if(!Number.isInteger(rec.errors)) return '记录错误数后显示阅读建议。';
  const rate = rec.errors / count;
  const advice = rate > .10 ? '降一级复习' : rate <= .05 && !rec.prompted ? '可考虑升级（还需符合字位覆盖）' : '留在本级巩固';
  return `错误率 ${(rate*100).toFixed(1)}%：${advice}。`;
}
function baselineSummary(){
  const first = state.assessments?.exam?.score, second = state.assessments?.retest?.score;
  if(!Number.isInteger(first) || !Number.isInteger(second)) return '第四周基线：完成周检与备用词两组，共 10 词。两组都记录后显示建议；计时快闪只记秒数，不设速度门槛。';
  const total = first + second;
  return `基线 ${total} / 10：${total >= 8 ? '达到进入第五周的解码门槛。' : '第四周再巩固一周；仍未达到 8 / 10，回第三周复习一周后重测。'} 月测阅读单独记录，不用速度代替准确度。`;
}
document.addEventListener('click', e=>{
  const button = e.target.closest('[data-assessment-reveal]'); if(!button) return;
  const kind = button.dataset.assessmentReveal;
  state.assessments ||= {};
  state.assessments[kind] = {...state.assessments[kind], revealed:true};
  save(); button.closest('[data-assessment]').outerHTML = assessmentHTML(kind);
});
document.addEventListener('change', e=>{
  const root = e.target.closest('[data-assessment]'); if(!root) return;
  const rec = state.assessments[root.dataset.assessment];
  if(e.target.matches('[data-assessment-score]')){
    if(e.target.value === '') delete rec.score; else rec.score = Number(e.target.value);
  }
  if(root.dataset.assessment === 'text'){
    const input = root.querySelector('[data-assessment-errors]');
    if(!input.checkValidity()){ input.reportValidity(); return; }
    if(input.value === '') delete rec.errors; else rec.errors = Number(input.value);
    rec.prompted = root.querySelector('[data-assessment-prompted]').checked;
    rec.understood = root.querySelector('[data-assessment-understood]').checked;
    root.querySelector('[data-assessment-result]').textContent = assessmentResult(rec, ASSESS_TEXT.match(/[a-z]+/gi).length);
  }
  root.querySelector('[data-assessment-saved]').textContent = save() ? '已保存' : '尚未保存，请先导出备份或重试保存。';
  document.querySelectorAll('[data-baseline-summary]').forEach(el=>el.textContent=baselineSummary());
});
