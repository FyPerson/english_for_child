let progressNotice = '', progressDirty = false;
let state = loadProgress();

/* ==================================================================
   开课日期（规格 §5 末条，2026-08-29 晚新增，P2 收官后增补）：面向"文件分发
   给多个家庭"场景，每个家庭在自己浏览器里设置 Day1 对应的日历日。
   state.startDate/state.startDatePromptDismissed 跟 state.days 同级——是
   state 顶层字段，不属于 state.games（不是某个游戏的成绩，是全局的一次性
   设置），清洗紧跟在 state.days 清洗后面做，同一批"读取即清洗"逻辑。
   仅做温和指路：不锁、不自动跳转、不催，计算日落在 [1,7] 外一律静默 null。
   ================================================================== */
function isValidDateStr(s){
  if(typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y,m,d] = s.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  // 用回填法核对是不是真实日历日（比如 2026-02-30 会被 Date 自动进位成 3 月
  // 2 号，进位后年/月/日跟原始输入对不上就说明原始输入根本不是合法日期）。
  return dt.getFullYear() === y && dt.getMonth() === m-1 && dt.getDate() === d;
}
if(!isValidDateStr(state.startDate)) delete state.startDate;
if(typeof state.startDatePromptDismissed !== 'boolean') state.startDatePromptDismissed = false;

function todayDayN(){
  if(!isValidDateStr(state.startDate)) return null;
  const [y,m,d] = state.startDate.split('-').map(Number);
  /* 审查 #1：本地年月日提取后用 Date.UTC 生成纯日历序号相减——不是把输入当 UTC 解析，
     而是把"日历日"映射到无 DST/无午夜长度变化的数轴上，彻底消除时区切换边界的 ±1 天 */
  const now = new Date();
  const n = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m-1, d)) / 86400000) + 1;
  return (n >= 1 && n <= 7) ? n : null;   // 未开课/超一周一律 null，调用方据此静默
}
function formatDateZh(s){
  const [, m, d] = s.split('-').map(Number);
  return `${m}月${d}日`;
}

/* ==================================================================
   家长设置面板（2026-09-02 用户拍板：重置包含清进度；长按开门）。
   页脚入口须长按 1.5 秒才打开——复用 bindLongPress，与 G2/G4/G5 的家长确认同一手势，
   孩子单击没有任何反应。面板里：
   · 改开课日期：单击确认即可（后果轻，只影响首页"今天"角标，规格 §5 末条不锁不跳转）；
   · 本周从头再来：按钮本身再长按 1.5 秒才生效（不可逆）。做法是删掉本周的 localStorage
     键后整页重载，回到全新状态：打卡、游戏确认与纪录、开课日期一并清空，首页重新出现
     开课日期提示条让家长设新日期。不逐字段清，避免漏掉 games 里的某个子表。
   明暗主题键（soundblocks-theme）跨周共用，不动。
   ================================================================== */
function parentPanelSummary(){
  const days = Object.keys(state.days || {}).filter(n => dayDone(+n)).length;
  const checks = Object.values(state.days || {}).reduce((a, d) => a + Object.values((d && d.checks) || {}).filter(Boolean).length, 0);
  const cf = (state.games && state.games.confirms) || {};
  const confirms = Object.keys(cf).filter(w => cf[w] && Object.values(cf[w]).some(Boolean)).length;
  return `${days} 天完成、${checks} 项打卡、${confirms} 个已确认的词`;
}
function openParentPanel(){
  const panel = document.querySelector('[data-parent-panel]');
  const gate = document.querySelector('[data-parent-gate]');
  if(!panel) return;
  if(panel._resetCancel) panel._resetCancel();   // 审 20 M-1：重开前先收掉上一次的重置长按计时
  panel.hidden = false;
  if(gate) gate.setAttribute('aria-expanded', 'true');
  panel.innerHTML = `<div class="parent-panel" role="group" aria-label="家长设置">
      <div class="parent-panel__row">
        <span>开课日期（Day 1 对应的日历日）</span>
        <input type="date" class="startdate-input" aria-label="Day1 开课日期" value="${isValidDateStr(state.startDate) ? state.startDate : ''}">
        <button class="btn btn--ok" data-parent-act="setdate">确认</button>
        <span class="startdate-hint" style="display:none;font-size:12px;color:var(--vowel)">先选个日期哦</span>
      </div>
      <div class="parent-panel__row">
        <button class="btn btn--ghost parent-panel__danger" type="button" data-parent-reset aria-label="本周从头再来：按住 1.5 秒确认，清除后无法恢复">
          <span class="hold-fill" data-longpress-fill></span>
          <span class="hold-label">本周从头再来 · 按住 1.5 秒</span>
        </button>
        <span class="parent-panel__note">会清掉这台设备上本周的全部进度：${parentPanelSummary()}，以及开课日期。<b>清除后无法恢复。</b>清完页面会刷新，首页会重新请你设置开课日期。</span>
      </div>
      <div class="parent-panel__row"><button class="linklike" data-parent-act="close">收起</button></div>
    </div>`;
  attachProgressPanel(panel);
  const reset = panel.querySelector('[data-parent-reset]');
  panel._resetCancel = reset ? bindLongPress(reset, resetWeekAndReload, 1500) : null;
  const inp = panel.querySelector('input[type="date"]');
  if(inp) inp.focus();
}
function closeParentPanel(panel, refocus){
  if(!panel) return;
  if(panel._resetCancel){ panel._resetCancel(); panel._resetCancel = null; }   // 审 20 M-1
  panel.hidden = true;
  panel.innerHTML = '';
  const gate = document.querySelector('[data-parent-gate]');
  if(gate){ gate.setAttribute('aria-expanded', 'false'); if(refocus) gate.focus(); }
}
function resetWeekAndReload(){
  // 审 20 H-2：删完读回确认，真的没了才刷新；删不掉就留在面板说清楚，绝不把失败伪装成成功
  let gone = false;
  try{ localStorage.removeItem(KEY); gone = (localStorage.getItem(KEY) === null); }catch(e){ gone = false; }
  if(!gone){
    const note = document.querySelector('[data-parent-panel] .parent-panel__note');
    if(note) note.innerHTML = '<b>未能清除本周进度</b>（浏览器不允许改动这个页面的存储）。请再按一次；仍不行就换个浏览器打开这个文件再试。';
    return;
  }
  location.reload();
}

/* ==================================================================
   state.games —— schema 整体建立 + 读取清洗（规格 §6.1/§6.2，S3 落地）。
   容器类字段只接受非 null、非数组的普通对象，否则整体重建默认（不动 state.days）；
   字段级按范围清洗，数组/对象整体替换不深合并，不做 schemaVersion。
   ================================================================== */
const FLASH_RECKEYS = ['flash_sounds', 'flash_words'];
const FLASH_METRIC_BY_KEY = { flash_sounds:'elapsed', flash_words:'count' };
const FLASH_CAPACITY_BY_KEY = META.flashCapacity;
const CONFIRM_SOURCES = ['g2', 'g4', 'g5'];
function isPlainObject(v){ return !!v && typeof v === 'object' && !Array.isArray(v); }
function cleanGamesState(){
  if(!isPlainObject(state.games)) state.games = {};
  const g = state.games;

  if(!isPlainObject(g.grab)) g.grab = {};
  // 轮次键从 G1_ROUNDS 派生，不再写死 ['s','a']——换周只改题库常量，清洗层自动跟上
  const grabKeys = Object.keys(G1_ROUNDS);
  grabKeys.forEach(k=>{
    if(!isPlainObject(g.grab[k])) g.grab[k] = {};
    const v = g.grab[k].best;
    g.grab[k].best = (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 8) ? v : 0;
  });
  Object.keys(g.grab).forEach(k=>{ if(!grabKeys.includes(k)) delete g.grab[k]; });   // S3 预筛 L1：未知键删除

  if(!isPlainObject(g.doors)) g.doors = {};
  { const v = g.doors.best; g.doors.best = (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 10) ? v : 0; }

  if(!isPlainObject(g.flash)) g.flash = {};
  Object.keys(g.flash).forEach(k=>{
    const rec = g.flash[k];
    const metric = FLASH_METRIC_BY_KEY[k];
    let bad = !FLASH_RECKEYS.includes(k) || !isPlainObject(rec) || rec.metric !== metric;
    if(!bad){
      if(metric === 'elapsed') bad = !(typeof rec.value === 'number' && Number.isFinite(rec.value) && rec.value > 0);
      else{
        const cap = FLASH_CAPACITY_BY_KEY[k] ?? Infinity;
        bad = !(typeof rec.value === 'number' && Number.isInteger(rec.value) && rec.value >= 0 && rec.value <= cap);
      }
    }
    if(bad) delete g.flash[k]; else g.flash[k] = {metric, value:rec.value};
  });

  if(!isPlainObject(g.confirms)) g.confirms = {};
  Object.keys(g.confirms).forEach(w=>{
    const rec = g.confirms[w];
    if(!Object.hasOwn(W, w) || Guard.isReserved(w) || !isPlainObject(rec)){ delete g.confirms[w]; return; }
    const cleaned = {};
    CONFIRM_SOURCES.forEach(src=>{ cleaned[src] = rec[src] === true; });
    g.confirms[w] = cleaned;
  });

  return g;
}
cleanGamesState();
state.assessments = cleanAssessmentState(state.assessments);

<!-- @include shared/assessment.js -->

<!-- @include shared/progress.js -->

/* ==================================================================
   examRecorded —— G5 造词工坊的程序锁判定（规格 §2.5 入口1/5 + §3.1，U3
   落地）：语义定位"含 exam 块的 step 的 checks[0]"，不硬编码 '7-5-0' 字面——
   在 DAYS[day-1] 里找那个 blocks 含 {b:'exam'} 的 step，取它的 checks 列表
   第 0 项。第一周（唯一有 exam 块的周）该 step 正是 Day7 的"周检 · 5 分钟"
   （steps 下标 5），故此函数对 day=7 解析出的 key 恰好是 '7-5-0'，但这里
   不写死，换天/换周结构变化也不用改这个函数。没有 exam 块的天视为锁死
   （目前只有 Day7 会渲染 g5 块，这一分支实际不会被触发，但语义上更安全）。
   ================================================================== */
function examRecorded(day){
  const d = DAYS[day-1];
  if(!d) return false;
  const stepIdx = d.steps.findIndex(s => s.blocks.some(b => b.b === 'exam'));
  if(stepIdx === -1) return false;
  const key = day + '-' + stepIdx + '-0';
  return !!dayState(day).checks[key];
}
function dayDone(n){
  const d = DAYS[n-1]; const st = dayState(n);
  const total = d.steps.reduce((a,s)=> a + s.blocks.filter(b=>b.b==='checks').reduce((x,b)=>x+b.items.length,0), 0);
  if(!total) return !!st.done;
  const got = Object.values(st.checks).filter(Boolean).length;
  return got >= total;
}

/* ==================================================================
   G6 计时闪卡纪录（规格 §4.6）：isBetter 统一比较 helper；onNewRecord 是
   T2 留的空钩子，T3 落地 Nat 庆祝时在这里加动画，本批不改调用方签名。
   ================================================================== */
