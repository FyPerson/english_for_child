/* ---- 字位着色/展示的消费者兼容层（里程碑 2 第 4b 步，第 4b 步收口批复核修正）----
 * colorWord 已拆分为 colorStrictWord/colorLenientWord/colorPlainText（graphemes.js
 * 导出，方案 §3.3）：42 个原 colorWord 调用点已逐个改走其中一条。
 *
 * 三档判据（不是"单个词 vs 整句"——那条判据漏了「单个词但不保证可解码」这一类，
 * 正是 demo 词白屏的根因）：
 *   ① colorStrictWord——可解码词：这个位置的词按数据设计恒由本周已教字位（SOUNDS
 *      的键）组成（词卡/tile/G2 积木态/wordforge 词族/G3-G5 摆词游戏/exam 保留测
 *      词等）。分不出来就是数据错误，原样抛出，不吞。
 *   ② colorLenientWord——不保证可解码的词：这个位置的词是刻意选来"展示/训练耳朵"
 *      的举例，不受限于本周已教字位（SOUNDS[b.s].demo「放进单词里听」的示范词、
 *      G1 干扰词/目标词听后反馈）。分得出就着色，分不出就原样输出，不抛。
 *   ③ colorPlainText——整句：先按分隔符切分再逐词尝试，同③的降级语义（不抛）。
 * 每个调用点必须一眼看得出自己走哪档：demo 走 ②，其余 39 个原走 ①的调用点经
 * 逐一核实（对照四周真实数据跑过 segmentWord）均满足①的判据，继续用 colorStrictWord；
 * G1 反馈用词（games.js meaningChip）改走②，详见该处注释。
 * explicitSegmentsFor/wordColorCtx/graphemesOf 是三个游戏 + 模板共用的桥接层，
 * 把"从 W[word].segments 取显式消歧"这件事收在一处，不让每个调用点各自实现一遍
 * （方案 §3.2 ctx 契约：「着色器先用唯一的 normalizeWord 得到查表键再调用」）。 */
function explicitSegmentsFor(normalizedWord){
  const entry = (typeof W !== 'undefined' && W && Object.prototype.hasOwnProperty.call(W, normalizedWord)) ? W[normalizedWord] : null;
  return (entry && Array.isArray(entry.segments)) ? entry.segments : undefined;
}
function wordColorCtx(){
  return { sounds: SOUNDS, segmentsOf: explicitSegmentsFor };
}
/* graphemesOf(word) -> string[]：供 G2/G4/G5 等"拆词摆积木"场景取字位 ID 序列，
 * 走与 colorStrictWord 相同的显式消歧查找（W[word.toLowerCase()].segments），
 * 不能分/歧义时把 segmentWord 的结构化错误原样抛出——这些词本该是当周已教字位
 * 能拼出的教学词，抛错就是数据错误，不该被这里静默吞掉。 */
function graphemesOf(word){
  const normalized = normalizeWord(word);
  return segmentWord(word, SOUNDS, explicitSegmentsFor(normalized));
}
function tileHTML(id, cls, live){
  // id 是字位 ID（SOUNDS 的键），不是字形——一律用 graphemeLabel 取显示文字
  // （方案 §3.1「tileHTML 一律收 ID，内部用 graphemeLabel(id) 取显示文字，禁止
  // 调用方先转成字形」）。soundType 判元音/辅音替代原来的 vowels.includes(字符)。
  const t = soundType(id, SOUNDS) === 'v' ? 'tile--v' : 'tile--c';
  const label = escapeHtmlText(graphemeLabel(id, SOUNDS));
  // live 时积木是发音按钮（真人录音）。默认纯 div——button 不能嵌 button，
  // 日卡这类本身就是按钮的容器里必须用 div。
  // 只有真人录音在的音才做成发音按钮；没录音的积木保持静态，不做点了没反应的哑巴按钮（铁律 8）
  if(live && SOUNDS[id] && hasPhoneme(id)) return `<button class="tile ${t} ${cls||''}" data-sayph="${escapeHtmlAttribute(id)}" aria-label="听 ${escapeHtmlAttribute(SOUNDS[id].ipa)} 的发音">${label}</button>`;
  return `<div class="tile ${t} ${cls||''}">${label}</div>`;
}
/* wallTileLitState(id) -> boolean（M1，外审 medium，2026-09-10）：判断首页 hero 积木墙
 * 上某个字位此刻是否应该点亮。三份模板（week01/02/03）改前各自内联同一段表达式
 * `FIRST_TEACH_DAY[c] != null ? dayDone(FIRST_TEACH_DAY[c]) : true`——它把"历史字位"
 * （更早的周教过、本周 newPatterns 里没有它，FIRST_TEACH_DAY 也确实不会有它，规范
 * v2.0 §3「唯一模型」）与"本周新教的字位、但数据层漏配 FIRST_TEACH_DAY"这种数据缺陷
 * 混在了同一个"FIRST_TEACH_DAY[c] == null"分支里，导致后者被静默当成前者、错误地
 * 显示为已点亮。
 *
 * 改法：先用 META.newPatterns 判断这个字位是不是"本周新教"——
 *   - 不是本周新教（历史字位）：恒点亮。**这条口径正待用户裁定，不许改**（同旧行为）。
 *   - 是本周新教但缺 FIRST_TEACH_DAY：数据错误，`console.warn` 提醒但不抛错（页面不能
 *     因为一条数据缺失就整页死掉），返回 false（不点亮）——这正是本次要修的行为差异。
 *   - 是本周新教且有 FIRST_TEACH_DAY：按 dayDone(FIRST_TEACH_DAY[id]) 现算，同旧行为。
 * 三份模板改调用这一个共享函数，不再各自维护一份内联判断表达式。 */
function wallTileLitState(id){
  const isThisWeekPattern = Array.isArray(META.newPatterns) && META.newPatterns.includes(id);
  if(!isThisWeekPattern) return true; // 历史字位：更早的周已教过，恒点亮（口径待用户裁定，不改）
  if(FIRST_TEACH_DAY[id] == null){
    console.warn(`[wall] 本周新教字位 "${id}" 缺少 FIRST_TEACH_DAY 条目，暂不点亮（数据缺陷，需补齐）`);
    return false;
  }
  return dayDone(FIRST_TEACH_DAY[id]);
}
/* T3-2（外审 medium，2026-09-10，四模板一致性）：week01 三处素材守卫改前直接
 * 回退/无条件输出，与 week02-04 早已有的空串兜底/存在性判断不一致——照
 * wallTileLitState 的方式抽成共享函数，四份模板统一调用，不再各自维护一份。
 * 三处依赖的全局（BOOK_IMG/ART/CELEBRATE_NAT）均由 `@include media/weekNN/*.js`
 * 在 `@include shared/render-blocks.js` 之前注入，函数体内直接引用即可。 */
/* bookArtHTML(key) -> string：小书/词卡插图，优先用 BOOK_IMG 真实照片，没有就退回
 * ART 里的手绘图标，两者都没有给空串——不把 undefined 渲染进 DOM（week01 改前
 * 直接 `return ART[key]`，key 不在 ART 里时 `bookArt(key)` 返回 undefined，
 * 拼进模板字符串会变成字面量 "undefined"）。 */
function bookArtHTML(key){
  if(BOOK_IMG[key]) return `<img src="${BOOK_IMG[key]}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:contain;display:block">`;
  return ART[key] || '';
}
/* celebrateNatHeroHTML() -> string：Nat 庆祝角色图，CELEBRATE_NAT 还没就位时只留
 * 空串（配合彩带一起用），不渲染 src="" 的破图（week01 改前无条件输出
 * `<img src="${CELEBRATE_NAT}">`，CELEBRATE_NAT 为空字符串时会渲染出一个没有
 * 图片的破 <img> 标签）。 */
function celebrateNatHeroHTML(){
  return CELEBRATE_NAT ? `<img class="celebrate-nat" src="${CELEBRATE_NAT}" alt="" decoding="async">` : '';
}
/* printBookArtHTML(art) -> string：打印版小书每页插图，没有对应 BOOK_IMG 时不渲染
 * <img>（week01 改前无条件渲染 `<img src="${BOOK_IMG[pg.art]}">`，缺图时 src 是
 * 字面量 "undefined"）。 */
function printBookArtHTML(art){
  return BOOK_IMG[art] ? `<img class="pb-art" src="${escapeHtmlAttribute(BOOK_IMG[art])}" alt="">` : '';
}
function artHTML(key, size){
  return illHTML(key, size);
}

function blockHTML(b, ctx){
  switch(b.b){

  case 'lead':
    return `<p class="lead">${b.html}</p>`;

  case 'list':
    return `<ul class="lead" style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px">
      ${b.items.map(i=>`<li>${i}</li>`).join('')}</ul>`;

  case 'note':{
    const ico = b.tone==='warn' ? ART.warn : b.tone==='star' ? ART.star : b.tone==='ok' ? ART.tick : ART.bulb;
    const cls = b.tone==='warn' ? 'pnote--warn' : b.tone==='ok' ? 'pnote--ok' : '';
    return `<div class="pnote ${cls}"><span class="pnote__ico">${ico}</span><div class="pnote__b">${b.html}</div></div>`;
  }

  case 'sound':{
    const s = SOUNDS[b.s];
    const isV = s.type === 'v';
    /* 一音多形：把 audioKey 指向本音的其他字母一并渲染成积木（第二周 c/k
       ——「一个声音，两件外套」）。这层关系已经在数据里（SOUNDS.k.audioKey==='c'），
       渲染器读它即可，换周新增 ck/ss 之类不必改代码。
       自指的 audioKey（SOUNDS.c.audioKey==='c'）要排除，否则本音会被渲染两次。
       每块都过 tileHTML(...,true)：有录音才成为按钮，没录音降级为 div（铁律 8）；
       播放走 Phone.say → phAudioKey 别名，两个字母共用同一段录音。 */
    const forms = [b.s].concat(
      Object.keys(SOUNDS).filter(k => k !== b.s && SOUNDS[k].audioKey === b.s)
    );
    // 字段信任模型（M2，外审 medium，2026-09-09）：s.mem/s.cue/s.challenge/s.try/
    // s.pass/s.how/s.warn 是作者手写的"教学叙述"字段，与 b.note/b.lead/b.html 同一
    // 信任级别——允许内联 <b>/<span class="en"> 等强调标签（真实数据 cue/warn 字段
    // 已经在用，见 frontend/src/weeks/week01.data.js 的 cue），全部原样插入、不转义。
    // s.ipa（纯符号）与 s.demo 里的 zh（词义翻译）是声明为纯文本的字段，走
    // escapeHtmlText；demo 里的 w（单词本身）不在这条判据里，走 colorLenientWord
    // （它本来就要着色，着色内部已含转义）。这条判据统一了改前"同一字段不同调用点
    // 转义程度不一致"的问题（M2），不是把全部字段都改成转义——真被作者写了标签的
    // 字段（cue/warn）转义会把标签当纯文本显示成尖括号，反而破坏既有教学内容。
    return `<div class="sound">
      <div class="sound__hd">
        ${forms.map(f => tileHTML(f,'tile--lg',true)).join('')}
        <div class="sound__meta">
          <div class="sound__ipa ${isV?'is-v':'is-c'}">${escapeHtmlText(s.ipa)}</div>
          <div class="sound__hint">${isV?'元音':'辅音'} · ${hasPhoneme(b.s) ? (forms.length>1 ? forms.map(f=>SOUNDS[f].grapheme).join(' 和 ')+' 发同一个音，点哪块都能听' : '点字母积木听真人示范') : '真人示范音待补，先按下面的口令示范'}</div>
        </div>
      </div>
      <div class="sound__body">
        <div class="soundlab">
          <div class="soundlab__visual">
            ${PHONEME_ILL[s.art] ? `<img class="mnemonic-img" src="${PHONEME_ILL[s.art]}" alt="" width="112" height="112">` : ''}
            <p class="soundlab__memory">${s.mem}</p>
          </div>
          <div class="soundlab__practice">
            <span class="lablabel"><span class="lablabel__n">1</span>跟我做</span>
            ${hasPhoneme(b.s)
              ? `<button class="btn btn--ghost soundlab__listen" data-sayph="${escapeHtmlAttribute(b.s)}">${ART.spk} 先听一遍 <span class="en">${escapeHtmlText(s.ipa)}</span></button>`
              : `<p class="lead" style="font-size:13.5px;margin:0;color:var(--ink-2)"><b>这个音还没有真人录音。</b>请按下面的口令亲自示范——<b>不要用手机上的合成语音代替</b>，它会读成字母名或者多带一个元音尾巴。</p>`}
            <p class="soundlab__cue">${s.cue}</p>
            <div class="experiment">
              <div>
                <span class="lablabel"><span class="lablabel__n">2</span>马上试</span>
                <div class="experiment__title">${s.challenge}</div>
              </div>
              <div class="experiment__body">
                ${s.try}
                <div class="experiment__pass">成功是这样：${s.pass}</div>
              </div>
            </div>
          </div>
        </div>
        <details class="fold parent-coach">
          <summary>家长提示：怎么示范，怎么判断</summary>
          <div class="fold__body">
            <div class="parent-grid">
              <div class="parent-item"><b>示范要点</b>${s.how}</div>
              <div class="parent-item"><b>最容易错</b>${s.warn}</div>
            </div>
          </div>
        </details>
        <div class="sound__examples">
          <p class="lead" style="margin-bottom:10px"><strong>放进单词里听</strong>（${hasPhoneme(b.s) ? '单词点开就读；单个音的示范用上面的真人录音' : '单词点开就读；单个音请你按上面的口令亲自示范，页面不用合成语音冒充'}）：</p>
          <div class="wordrow">
            ${s.demo.map(([w,zh])=>`<button class="wordchip" data-say="${escapeHtmlAttribute(w)}">
              <span class="spk">${ART.spk}</span>
              <span class="wordchip__w en">${colorLenientWord(w, wordColorCtx())}</span>
              <span class="wordchip__zh">${escapeHtmlText(zh)}</span></button>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  }

  case 'blend':{
    // G2 积木合体（v1.3 §4.2）：v2 的 one/fast/merge 三按钮结构不保留——逐个点
    // 字母积木听音素承接①的教学功能，合体后的慢速整词音承接②，词表数据不动。
    const id = 'g2' + (ctx.uid++);
    // E5：导航条改由 initG2 每次 draw() 动态生成（首词禁 prev、末词换"完成"），
    // 这里只留一个挂载点。
    return `<div class="blender" id="${id}" data-g2="${escapeHtmlAttribute(b.words.join(','))}">
      <div class="g2__nav" data-nav></div>
      <div data-body></div>
    </div>`;
  }

  case 'words':
    return `<div class="wcards">
      ${b.items.map(w=>{
        const d = W[w] || {zh:'',art:null};
        return `<button class="wcard" data-say="${escapeHtmlAttribute(w)}">
          <div class="wcard__art">${hasIll(d.art)
            ? illHTML(d.art,72)
            : `<div style="font-family:var(--en);font-size:30px;font-weight:700;color:var(--ink-3)">${colorStrictWord(w, wordColorCtx())}</div>`}</div>
          <div class="wcard__w">${colorStrictWord(w, wordColorCtx())}</div>
          <div class="wcard__zh">${escapeHtmlText(d.zh)}</div>
        </button>`;
      }).join('')}
    </div>`;

  case 'sight':
    return `<div>
      <div class="wcards" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">
        ${b.items.map(([w,zh])=>`<button class="wcard" data-say="${escapeHtmlAttribute(w)}" style="border-color:var(--accent-line);background:var(--accent-soft)">
          <div class="wcard__w" style="font-size:30px;margin-top:8px">${escapeHtmlText(w)}</div>
          <div class="wcard__zh">${escapeHtmlText(zh)}</div>
          <div style="font-size:11px;color:var(--accent);font-weight:700">直接记，不拼</div>
        </button>`).join('')}
      </div>
    </div>`;

  case 'sentences':
    return `<div style="display:flex;flex-direction:column;gap:10px">
      ${b.items.map(([en,zh])=>`<button class="checkitem" data-say="${escapeHtmlAttribute(en)}" style="align-items:center">
        <span class="spk">${ART.spk}</span>
        <span class="checkitem__t"><span class="en" style="font-size:21px;font-weight:700">${colorPlainText(en, wordColorCtx())}</span><small>${escapeHtmlText(zh)}</small></span>
      </button>`).join('')}
    </div>`;

  case 'wordforge':{
    const mode = b.mode === 'swap' ? 'swap' : 'family';
    let cards = '';
    if(mode === 'family'){
      cards = b.families.map(f=>{
        return `<section class="wordforge__family">
          <div class="wordforge__family-title">固定词尾 <b>${colorStrictWord(f.tail, wordColorCtx())}</b>，点一块头积木</div>
          <div class="wordforge__equation-rows">
            ${f.heads.map(head=>{
              // M4（里程碑 2 第 4b 步收口，未动）：head+f.tail 是字符级拼接、head 是
              // 字符级 charAt 语义的裸首字母，不是字位 ID 拼接——多字母声母头（如
              // 'sh'+'op'）在当前四周数据里不出现，故此处仍按现状工作；一旦 head
              // 变成多字母字位（第 7 步 wordforge 若接入 sh/ch 类词族），这里与下面
              // swap 分支的 head/word 拼接、aria-label 文案都要同步改成按字位 ID 拼接，
              // 不能继续假设"一个 head 就是一个字符"。留给第 7 步统一处理，本批不改。
              const word = head + f.tail;
              const zh = (W[word] || {}).zh || '';
              return `<div class="wordforge__equation-choice">
                <span class="wordforge__equation"><button class="wordforge__brick wordforge__head-button" data-wf-word="${escapeHtmlAttribute(word)}" aria-label="点击 ${escapeHtmlAttribute(head)}，听 ${escapeHtmlAttribute(word)}">${escapeHtmlText(head)}${ART.spk}</button><span class="wordforge__plus">＋</span><span class="wordforge__brick wordforge__brick--tail">${colorStrictWord(f.tail, wordColorCtx())}</span><span class="wordforge__equation-arrow">→</span><span class="wordforge__equation-word">${colorStrictWord(word, wordColorCtx())}</span></span>
                <span class="wordforge__equation-meta"><small>${zh}</small></span>
              </div>`;
            }).join('')}
          </div>
        </section>`;
      }).join('');
    }else{
      cards = b.pairs.map(([from,word])=>{
        // M4（同上，未动，留给第 7 步）：from.slice(1) 与下面的 candidate.charAt(0)
        // 同样是字符级切分，不是按字位 ID 拆分——多字母声母的换头词对（第 7 步才会
        // 出现）会被切错位置。
        const tail = from.slice(1);
        return `<section class="wordforge__family wordforge__swap-family">
          <div class="wordforge__family-title">固定词尾 <b>${colorStrictWord(tail, wordColorCtx())}</b>，轮流点两个头</div>
          <div class="wordforge__equation-rows">
            ${[from,word].map(candidate=>{
              const head = candidate.charAt(0);
              const zh = (W[candidate] || {}).zh || '';
              return `<div class="wordforge__equation-choice">
                <span class="wordforge__equation"><button class="wordforge__brick wordforge__head-button" data-wf-word="${escapeHtmlAttribute(candidate)}" aria-label="点击 ${escapeHtmlAttribute(head)}，听 ${escapeHtmlAttribute(candidate)}">${escapeHtmlText(head)}${ART.spk}</button><span class="wordforge__plus">＋</span><span class="wordforge__brick wordforge__brick--tail">${colorStrictWord(tail, wordColorCtx())}</span><span class="wordforge__equation-arrow">→</span><span class="wordforge__equation-word">${colorStrictWord(candidate, wordColorCtx())}</span></span>
                <span class="wordforge__equation-meta"><small>${zh}</small></span>
              </div>`;
            }).join('')}
          </div>
        </section>`;
      }).join('');
    }
    return `<div class="wordforge" data-wordforge="${mode}">
      <div class="wordforge__top">
        <span class="wordforge__title">${mode==='family'?'词族积木工坊':'换头造词机'}</span>
      </div>
      <div class="wordforge__grid">${cards}</div>
      <div class="wordforge__result" data-wf-result aria-live="polite">${mode==='family'
        ? '点任意一行听单词，可以反复点击。'
        : '轮流点同组两个词，可以反复比较。'}</div>
    </div>`;
  }

  case 'pair':{
    // 第三天的三组最小对立词都进入 G3 两扇门声音游戏；保留静态分支仅作为
    // 其他课程数据未配置录音时的安全回退。
    const cards = b.pairs.map(p=>{
      const inG3 = G3_PAIRS.some(gp => gp[0]===p[0] && gp[1]===p[1]);
      if(inG3){
        const id = 'g3' + (ctx.uid++);
        return `<div class="blender" id="${id}" data-g3-pair="${escapeHtmlAttribute(p.join(','))}">
          <div data-g3-body></div>
        </div>`;
      }
      return `<div class="blender">
        <div class="pair">
          ${p.map(w=>{
            const d = W[w] || {zh:'', art:null};
            return `<div class="pairbtn" style="pointer-events:none">
              ${hasIll(d.art)?illHTML(d.art,56):''}
              <span class="pairbtn__w">${colorStrictWord(w, wordColorCtx())}</span>
              <span class="wcard__zh">${escapeHtmlText(d.zh)}</span>
            </div>`;
          }).join('')}
        </div>
        <p class="lead" style="text-align:center;font-size:13px;margin-top:8px">这组暂未配置录音，请稍后再试</p>
      </div>`;
    }).join('');
    return `<div style="display:flex;flex-direction:column;gap:14px">
      ${cards}
      ${b.note?`<p class="lead" style="text-align:center;font-size:13.5px;margin-top:4px">${b.note}</p>`:''}
    </div>`;
  }

  case 'g4':{
    const id = 'g4' + (ctx.uid++);
    return `<div class="blender" id="${id}" data-g4>
      <div class="blender__ctl" data-g4-orders></div>
      <div class="blender__ctl"><button class="btn btn--ghost" data-act="random">${ART.spk} 随机来一单</button></div>
      <div data-g4-body></div>
    </div>`;
  }

  case 'g5':{
    const id = 'g5' + (ctx.uid++);
    // data-g5-day 把当前天数带进 DOM，供 initG5() 里的 examRecorded(day) 做
    // 程序锁语义定位——不在 JS 里硬编码具体是第几天（§2.5 入口1/5 + §3.1）。
    return `<div class="blender" id="${id}" data-g5 data-g5-day="${ctx.day}">
      <div data-g5-body></div>
    </div>`;
  }

  case 'flash':{
    // G6：recKey 从 block 数据读（规格 §4.6 点1），不从 uid/DOM 顺序推；
    // 非 timed 组或无 recKey 的 timed 组一律不出纪录行。
    const id = 'fl' + (ctx.uid++);
    return `<div class="flash" id="${id}" data-items="${escapeHtmlAttribute(JSON.stringify(b.items))}" data-timed="${b.timed?1:0}" data-reckey="${escapeHtmlAttribute(b.recKey||'')}">
      <div class="flash__face" data-face></div>
      <div class="flash__metarow">
        <div class="flash__meta" data-meta></div>
        ${b.recKey?`<div class="flash__record" data-record></div>`:''}
      </div>
      <div class="blender__ctl">
        <button class="btn btn--ghost" data-act="prev">${ART.arrowL}</button>
        <button class="btn" data-act="next">下一张 ${ART.arrowR}</button>
        ${b.timed?`<button class="btn btn--ok" data-act="timer">开始计时</button>`:''}
      </div>
      <p class="lead" style="font-size:13.5px;text-align:center" data-tip></p>
    </div>`;
  }

  case 'book':{
    const id = 'bk' + (ctx.uid++);
    return `<div class="book" id="${id}" data-book-start="${b.startPage || 0}" data-book-end="${b.endPage || BOOK.pages.length}">
      <div class="book__page">
        <div class="book__art" data-art></div>
        <button class="book__line" data-line data-sayline></button>
        <p class="lead" style="font-size:13.5px;text-align:center;margin:0" data-zh></p>
      </div>
      <div class="book__nav">
        <button class="iconbtn" data-act="prev" aria-label="上一页">${ART.arrowL}</button>
        <span class="book__pg" data-pg></span>
        <button class="btn btn--ghost" data-act="print" style="padding:8px 16px;font-size:13px">打印小书</button>
        <button class="iconbtn" data-act="next" aria-label="下一页">${ART.arrowR}</button>
      </div>
    </div>`;
  }

  case 'table':
    return `<div class="tblwrap"><table>
      <thead><tr>${b.head.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${b.rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;

  case 'initialpick':{
    const id = 'initialpick' + (ctx.uid++);
    return `<div class="initialpick" id="${id}" data-initialpick data-words="${escapeHtmlAttribute(b.words.join(','))}" data-letters="${escapeHtmlAttribute(b.letters.join(','))}">
      <div class="initialpick__body" data-initialpick-body aria-live="polite"></div>
    </div>`;
  }

  case 'g1':{
    const id = 'g1' + (ctx.uid++);
    /* b.only 指定只出某一轮——第一天只教 /k/，不提前暴露第二天才教的 /e/。
       不给 only 就出全部轮次（第七天玩一天用的就是全量）。
       只影响渲染哪几张卡；G1_ROUNDS 常量本身不动，音频提取器 g1_rounds 源
       与清洗层（grabKeys 从 G1_ROUNDS 派生）都不受影响。 */
    const rounds = b.only ? [b.only].filter(rk => G1_ROUNDS[rk]) : Object.keys(G1_ROUNDS);
    return `<div class="g1wrap" id="${id}">
      ${rounds.map(rk=>{
        const theme = G1_THEME[rk];
        return `<div class="g1card g1card--${escapeHtmlAttribute(rk)}" data-g1-round="${escapeHtmlAttribute(rk)}">
          <div class="g1card__hd">
            ${hasIll(theme.icon)?`<span class="g1card__ico">${illHTML(theme.icon,40)}</span>`:''}
            <span class="g1card__ttl">${theme.title}</span>
          </div>
          <div class="g1card__body" data-g1-body></div>
        </div>`;
      }).join('')}
    </div>`;
  }

  case 'checks':
    return `<div class="checks">
      ${b.items.map((it,i)=>{
        const key = ctx.day + '-' + ctx.stepIdx + '-' + i;
        const on = dayState(ctx.day).checks[key];
        return `<button class="checkitem ${on?'checkitem--on':''}" data-check="${key}">
          <span class="checkbox">${ART.tick}</span>
          <span class="checkitem__t">${it[0]}${it[1]?`<small>${it[1]}</small>`:''}</span>
        </button>`;
      }).join('')}
    </div>`;

  case 'output':
    return `<div class="pnote"><div class="pnote__b">${b.html}</div></div>`;
  case 'retest': return assessmentHTML('retest');
  case 'probe': return assessmentHTML(b.version === 'B' ? 'probeB' : 'probeA');
  case 'assessment': return assessmentHTML('text');
  case 'baseline': return `<p class="pnote" data-baseline-summary>${baselineSummary()}</p>`;
  case 'exam':
    if(typeof RESERVED_RETEST !== 'undefined') return assessmentHTML('exam');
    return `<div style="display:flex;flex-direction:column;gap:16px">
      <div class="pnote"><span class="pnote__ico">${ART.star}</span><div class="pnote__b">
        <b>这是你要的那个「当场能验的尺子」。</b>下面五个词<b>没有用于本周练习</b>，只由已经学过的字位组成。能不能读出来，完全取决于他有没有真的掌握解码，而不是记住了什么。
      </div></div>
      <div class="wcards" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr))">
        ${RESERVED.map(w=>`<div class="wcard" style="pointer-events:none">
          <div class="wcard__w" style="font-size:28px;margin:10px 0 2px">${colorStrictWord(w, wordColorCtx())}</div>
          <div class="wcard__zh">${escapeHtmlText(W[w].zh)}</div></div>`).join('')}
      </div>
      <p class="lead" style="font-size:13.5px">把这五个词写在纸上给孩子读，<b>你先不要发音</b>。读完由你自己核对对错——如果哪个音拿不准，可以回到第 1–6 天的音素卡片，自己先拼读一遍确认。</p>
      <div class="tblwrap"><table>
        <thead><tr><th>读对几个</th><th>说明</th><th>下一步</th></tr></thead>
        <tbody>
          <tr><td><b style="color:var(--ok)">4 – 5 个</b></td><td>解码能力稳住了</td><td>${META.week === 3 ? '下周进入第 4 周巩固内容' : '进入下一周内容'}</td></tr>
          <tr><td><b style="color:var(--accent)">2 – 3 个</b></td><td>会拼但不熟练</td><td>下周前两天先复习本周，再进新课</td></tr>
          <tr><td><b style="color:var(--vowel)">0 – 1 个</b></td><td>还没打通</td><td><b>整周重做一遍。</b>不要往前赶——这一步塌了，后面全是空中楼阁</td></tr>
        </tbody>
      </table></div>
      <div class="pnote pnote--ok"><span class="pnote__ico">${ART.tick}</span><div class="pnote__b">
        重做一周不丢人，而且第二遍通常三天就过了。<b>这一年里唯一不能妥协的就是这件事：拼读没通，绝不往下走。</b>
      </div></div>
    </div>`;

  default: return '';
  }
}

/* ==================================================================
   RENDER — views
   ================================================================== */
