function initG2(){
  document.querySelectorAll('[data-g2]').forEach(root=>{
    const words = root.dataset.g2.split(',');
    let cur = 0;
    const nav = root.querySelector('[data-nav]');
    const body = root.querySelector('[data-body]');
    root._g2Cancel = null;   // E2：bindLongPress 返回的 cancel，供折叠清理调用
    /* 复审 #1：视图切换先真正取消旧长按计时再置空——裸置 null 会让并发输入下
       到期的旧回调照常触发（索引守卫是第二层，最后一词完成视图 cur 不变时守不住） */
    function cancelG2LongPress(){
      if(root._g2Cancel){ try{ root._g2Cancel(); }catch(e){} }
      root._g2Cancel = null;
    }

    function meaningArt(w, size){
      const d = W[w] || {zh:'', art:null};
      return hasIll(d.art)
        ? illHTML(d.art, size)
        : `<div style="font-family:var(--en);font-size:${Math.round(size*0.55)}px;font-weight:700">${colorStrictWord(w, wordColorCtx())}</div>`;
    }
    function stageHTML(w, merged){
      // G2 积木态：按字位 ID 拆词，不是按字符（方案 §2.2「分词」行，rain 这类双字母
      // 字位词才拆得出正确的三块而不是四块）。
      return `<div class="blender__stage ${merged?'is-merged':''}">${graphemesOf(w).map(id=>tileHTML(id,'tile--lg',!merged)).join('')}</div>`;
    }
    function revealHTML(w){
      const d = W[w] || {zh:''};
      return `<div class="g2__reveal">
        <div class="g2__art">${meaningArt(w, 96)}</div>
        <div class="g2__word"><span class="en" style="font-size:26px;font-weight:700">${colorStrictWord(w, wordColorCtx())}</span>　<b>${d.zh}</b></div>
      </div>`;
    }
    // D6：参数化 w，调用处显式传"当前要播哪个词"，不再隐式读闭包里的 words[cur]——
    // 合体后台播放期间用户可能已经翻页，音频不该跟着 cur 的新值跑偏。
    function playMergeSequence(w, onEnded){
      // §2.3 阶段失败表 G2 行：慢速失败 retry=重播全序列；常速失败 retry=只重播常速。
      // runAudioStage 的失败 retry 语义天然满足——外层 retry 重新走整段（慢→常），
      // 内层 retry 只重放内层 playFn（常速）。
      runAudioStage(() => WordAudio.play(w, {rate:0.65}), () => {
        runAudioStage(() => WordAudio.play(w), onEnded);
      });
    }

    function renderBlocks(){
      const w = words[cur];
      cancelG2LongPress();
      body.innerHTML = `
        ${stageHTML(w, false)}
        <div class="blender__ctl"><button class="btn" data-act="merge">合体 ${ART.spk}</button></div>
      `;
    }
    // D1（预筛 high，§2.3 字面"确认语义不依赖音频成功"）：点「合体」直接进确认
    // 态——合体动画+插画+确认条一次性显示，不等音频。playMergeSequence 在后台
    // 独立播，ended/failed/cancelled 结果如何都不影响这里已经可以长按确认；
    // 删掉了原来的"听……"中间态与「再放一遍」按钮——重听已被下面的「再听一次」
    // 覆盖（确认态/已确认态都有）。
    function renderConfirm(){
      const w = words[cur];
      body.innerHTML = `
        ${stageHTML(w, true)}
        ${revealHTML(w)}
        <p class="g2__ask">孩子自己读出来了吗？</p>
        <div class="blender__ctl">
          <button class="btn btn--ok g2__confirm" data-act="confirm">
            <span class="g2__confirm-fill" data-longpress-fill></span>
            <span class="g2__confirm-label">按住 1 秒确认</span>
          </button>
          <button class="btn btn--ghost" data-act="replay">${ART.spk} 再听一次</button>
          <button class="btn btn--ghost" data-act="retry">再试一次</button>
        </div>
      `;
      playMergeSequence(w, null);   // 后台播，ended 不需要任何 UI 变化（D1）
      const myIdx = cur;   // D2：长按回调按索引守卫，不靠字符串比较闭包里的 w
      // E2：存下 cancel，供折叠清理（toggleStep）在长按进行中主动收掉
      root._g2Cancel = bindLongPress(body.querySelector('.g2__confirm'), ()=>{
        if(cur !== myIdx) return;   // 长按期间已经翻页/切天，不落到别的词上
        confirmWord(w, 'g2');
        root._g2Cancel = null;
        renderConfirmed();
      }, 1000);
    }
    function renderConfirmed(){
      const w = words[cur];
      cancelG2LongPress();
      body.innerHTML = `
        ${stageHTML(w, true)}
        ${revealHTML(w)}
        <p class="g2__ask g2__ask--ok">${ART.tick} 已确认</p>
        <div class="blender__ctl">
          <button class="btn btn--ghost" data-act="replay">${ART.spk} 再听一次</button>
          <button class="btn btn--ghost" data-act="unconfirm">撤销</button>
        </div>
      `;
    }
    // E5（合并审 med，§4.2"过完即结束"字面）：线性导航，不取模循环——首词禁用
    // 「上一词」，末词把「下一词」换成「完成」进完成视图；「再来一遍」回第一词。
    function renderNav(){
      const isLast = cur === words.length - 1;
      nav.innerHTML = `
        <button class="iconbtn" data-act="prev" aria-label="上一个词" ${cur===0?'disabled':''}>${ART.arrowL}</button>
        <span class="g2__pg">${cur+1} / ${words.length}</span>
        ${isLast
          ? `<button class="btn btn--ok" data-act="finish">完成</button>`
          : `<button class="iconbtn" data-act="next" aria-label="下一个词">${ART.arrowR}</button>`}
      `;
    }
    function renderDone(){
      cancelG2LongPress();
      nav.innerHTML = '';
      body.innerHTML = `
        <div class="g2__reveal"><p class="g2__ask g2__ask--ok">${ART.tick} 今天的积木都拼完啦</p></div>
        <div class="blender__ctl"><button class="btn btn--ok" data-act="restart">再来一遍</button></div>
      `;
    }
    function draw(){
      renderNav();
      const w = words[cur];
      const confirmed = !!(state.games.confirms[w] && state.games.confirms[w].g2);
      confirmed ? renderConfirmed() : renderBlocks();
    }

    root.addEventListener('click', e=>{
      const navBtn = e.target.closest('[data-act="prev"],[data-act="next"],[data-act="finish"],[data-act="restart"]');
      if(navBtn){
        const a = navBtn.dataset.act;
        if(a === 'prev'){ if(cur > 0){ AudioBus.stopAll(); cur--; draw(); } return; }
        if(a === 'next'){ if(cur < words.length - 1){ AudioBus.stopAll(); cur++; draw(); } return; }
        if(a === 'finish'){ AudioBus.stopAll(); renderDone(); return; }
        if(a === 'restart'){ cur = 0; draw(); return; }
        return;
      }
      const act = e.target.closest('[data-act]');
      if(!act) return;
      if(act.dataset.act === 'merge'){ renderConfirm(); return; }
      if(act.dataset.act === 'replay'){ playMergeSequence(words[cur], null); return; }
      // E4：先停掉后台可能还在跑的慢→常序列（含清顶部失败条 continuation），
      // 再回积木态——不让"再试一次"之后，上一轮的常速音频冷不丁冒出来。
      if(act.dataset.act === 'retry'){ AudioBus.stopAll(); renderBlocks(); return; }
      if(act.dataset.act === 'unconfirm'){ unconfirmWord(words[cur], 'g2'); renderConfirm(); return; }
    });

    draw();
  });
}

/* ==================================================================
   G3 两扇门（pair 替换，v1.3 §4.3 + §2.3 失败表 G3 行）：10 题，每题从词对
   随机播一个词→点两扇写词的门之一；对=开门+插画+计对，错=门晃动+自动重播
   一次该词（该题已计错，重播不阻塞）。doors.best 只增不减。状态机形态参照
   initG1（roundToken 陈旧回调防护/audioFailed/interrupted 同款），第一周
   只有一张卡，不需要跨卡互斥，但 reset 钩子照挂（P1 硬约定①）。
   ================================================================== */
function initG3(){
  document.querySelectorAll('[data-g3-pair]').forEach(root=>{
    const pair = root.dataset.g3Pair.split(',');
    const body = root.querySelector('[data-g3-body]');
    let queue = [], qi = 0, correct = 0;
    let uiState = 'idle';   // idle|playing|waiting|feedback|audioFailed|interrupted|done
    let answered = false, pendingTimer = null;
    let roundToken = 0;
    function clearPending(){ if(pendingTimer){ clearTimeout(pendingTimer); pendingTimer = null; } }
    function buildQueue(){
      const q = [];
      for(let i=0;i<10;i++) q.push(pair[Math.floor(Math.random()*2)]);
      return q;
    }
    // F6：showArt 只在"答对、开门显示"那一刻由调用方明确传入要亮哪扇门，
    // 其余状态（播放中/等待作答/答错/失败/打断）一律不传，即不渲染插画——
    // 等待态不该提前用图片剧透答案，这也是本条修法的字面要求。
    function doorHTML(w, cls, disabled, showArt){
      const d = W[w] || {zh:'', art:null};
      const art = (showArt && hasIll(d.art)) ? illHTML(d.art, 56) : '';
      return `<button class="pairbtn ${cls||''}" data-g3-door="${w}" ${disabled?'disabled':''}>
        ${art}
        <span class="pairbtn__w">${colorStrictWord(w, wordColorCtx())}</span>
        <span class="wcard__zh">${d.zh}</span>
      </button>`;
    }
    function stageHTML(disabled, clsByWord, artWord){
      clsByWord = clsByWord || {};
      return `<div class="pair">${pair.map(w=>doorHTML(w, clsByWord[w], disabled, w === artWord)).join('')}</div>`;
    }
    function progressLine(){ return `<p class="g1__progress">第 ${qi+1} / ${queue.length} 题　对 ${correct}</p>`; }
    function restartBtn(){ return `<button class="btn btn--ghost" data-g3-act="restart">重新开始这一轮</button>`; }

    function renderIdle(){
      uiState = 'idle';
      body.innerHTML = `
        <p class="g1__cmd">听发音，点对应的门</p>
        <button class="btn btn--ok" data-g3-act="start">开始这一轮</button>
      `;
    }
    function renderPlaying(){
      uiState = 'playing';
      body.innerHTML = `
        ${stageHTML(true)}
        <p class="g1__hint">听……</p>
        <div class="g1__ctl">${restartBtn()}</div>
        ${progressLine()}
      `;
    }
    // §4.3 明确"无作答时限"（与 G1 不同）：ended 后只解锁两扇门，不起计时器。
    function renderWaiting(){
      uiState = 'waiting';
      answered = false;
      body.innerHTML = `
        ${stageHTML(false)}
        <p class="g1__hint">点你听到的那扇门</p>
        <div class="g1__ctl">${restartBtn()}</div>
        ${progressLine()}
      `;
    }
    function renderFeedback(isRight, picked, target){
      uiState = 'feedback';
      const cls = {}; cls[picked] = isRight ? 'pairbtn--right' : 'pairbtn--wrong';
      // 三组词保持一致：只有答对时，才在正确的门内显示对应插画。
      const artWord = isRight ? target : null;
      body.innerHTML = `
        ${stageHTML(true, cls, artWord)}
        <p class="g1__hint">${isRight ? '对啦！' : '再听听看'}</p>
        <div class="g1__ctl">${restartBtn()}</div>
        ${progressLine()}
      `;
      if(!isRight){
        // §2.3 G3 答错纠正重播行：失败不阻塞（该题已判错计分），只出提示条，
        // 不影响下面的 advance() 照常推进下一题。F4（P2 末审）：改走
        // runAudioStage 包装——同一条失败提示条点"重试"仍会再挂一次失败处理
        // （T-2 可重武装，不是一次性）；playFn 内部先比对 roundToken，用户点
        // 重试时如果题已经翻篇（advance 早于点击发生），就不再真放这条纠正音、
        // 也不再弹新的失败条，避免旧题的提示污染新题。
        const myToken = roundToken;
        runAudioStage(
          () => (myToken === roundToken ? WordAudio.play(target) : Promise.resolve({status:'cancelled'})),
          () => {}
        );
      }
      clearPending();
      pendingTimer = laterOnce(()=>advance(), 900);
    }
    function renderAudioFailed(){
      uiState = 'audioFailed';
      body.innerHTML = `
        ${stageHTML(true)}
        <p class="g1__hint">声音没放出来</p>
        <div class="g1__ctl">
          <button class="btn btn--ok" data-g3-act="resume">再试一次</button>
          ${restartBtn()}
        </div>
        ${progressLine()}
      `;
    }
    function renderInterrupted(){
      uiState = 'interrupted';
      body.innerHTML = `
        ${stageHTML(true)}
        <p class="g1__hint">刚才被打断了</p>
        <div class="g1__ctl">
          <button class="btn btn--ok" data-g3-act="resume">继续这一题</button>
          ${restartBtn()}
        </div>
        ${progressLine()}
      `;
    }
    function renderResult(){
      uiState = 'done';
      const passed = correct >= 7;
      const gs = state.games.doors;
      gs.best = Math.max(gs.best || 0, correct);
      save();
      body.innerHTML = `
        <div class="g1__result"><b>${correct} / ${queue.length}</b>　${passed?'通关啦':'再来一轮就能通关（对 7 题过）'}<br>历史最好：${gs.best} / ${queue.length}</div>
        <div class="g1__ctl"><button class="btn btn--ok" data-g3-act="restart">再玩一轮</button></div>
      `;
      if(passed) celebrateNat();
    }

    function playQuestion(){
      const myToken = ++roundToken;   // 陈旧回调防护，同 G1
      renderPlaying();
      const target = queue[qi];
      WordAudio.play(target).then(r=>{
        if(myToken !== roundToken) return;
        if(r.status === 'ended') renderWaiting();
        else if(r.status === 'failed'){
          renderAudioFailed();
          showAudioFailure({ retry(){ playQuestion(); } });
        }
        else if(r.status === 'cancelled'){
          if(uiState === 'playing') renderInterrupted();   // 同 G1：外部请求打断，非本卡主动收场
        }
      });
    }
    function pickDoor(w){
      if(uiState !== 'waiting' || answered) return;   // 播放期/反馈期锁答边界
      answered = true;
      clearPending();
      const target = queue[qi];
      const isRight = w === target;
      if(isRight) correct++;
      renderFeedback(isRight, w, target);
    }
    function advance(){
      clearPending();
      if(qi + 1 < queue.length){ qi++; playQuestion(); }
      else renderResult();
    }
    function reset(){
      roundToken++;
      clearPending();
      renderIdle();
    }
    root._g3Reset = reset;   // P1 硬约定①：折叠清理钩子

    function startRound(){
      clearPending();
      queue = buildQueue();
      qi = 0; correct = 0; answered = false;
      playQuestion();
    }

    renderIdle();
    root.addEventListener('click', e=>{
      const door = e.target.closest('[data-g3-door]');
      if(door && !door.disabled){ pickDoor(door.dataset.g3Door); return; }
      const act = e.target.closest('[data-g3-act]');
      if(!act) return;
      const kind = act.dataset.g3Act;
      if(kind === 'start' || kind === 'restart'){ startRound(); return; }
      if(kind === 'resume'){ playQuestion(); return; }
    });
  });
}

/* ==================================================================
   G4 点单游戏（Day7 听音摆积木替换，v1.3 §4.4 + §2.3 失败表）：孩子选订单
   或随机来一单→播词→点字母积木入槽（槽数=词长）→点槽内积木撤回→摆满自动
   校验。对=积木亮+长按确认 confirms.g4；错=晃动可重摆，同词第2次错给首字母
   提示（换词/换单重置错误计数）。无分母无通关，摆对3个只出软提示不锁。
   ================================================================== */
function initG4(){
  document.querySelectorAll('[data-g4]').forEach(root=>{
    const orders = root.querySelector('[data-g4-orders]');
    const body = root.querySelector('[data-g4-body]');
    // META.rackG4 此刻仍是旧格式字符串（四个字段改数组是第 7 步的事），这里经
    // normalizeIdList 双读展开成 ID 数组消费——单字母阶段展开结果与旧的 split('')
    // 逐字符等价，为第 7 步真正的数组接入打好接口（方案 §3.5）。
    const RACK_LETTERS = normalizeIdList(META.rackG4, {legacy:true});
    // wordIds：当前订单词的字位 ID 序列（方案 §2.2「槽位长度」行——槽数必须按
    // 字位数建，不是按字符数，否则 rain 建四槽却只有三块积木永远填不满）。
    // slots 存放的是字位 ID，不是字符。
    let word = null, wordIds = [], slots = [], usedTileIdx = [], errorCount = 0;
    let uiState = 'idle';   // idle|playing|placing|feedback|audioFailed|interrupted
    let roundToken = 0;
    let feedbackTimer = null;   // F1（P2 末审）：600ms 摆错回退计时器句柄，供换词/重置时主动清掉
    const correctWords = new Set();   // 摆对过的词（session 内），达 3 只出软提示不锁

    function clearFeedbackTimer(){ if(feedbackTimer){ clearTimeout(feedbackTimer); feedbackTimer = null; } }
    function cancelG4LongPress(){   // 复审 low#1：先真取消再置空（G2 同款）
      if(root._g4Cancel){ try{ root._g4Cancel(); }catch(e){} }
      root._g4Cancel = null;
    }

    function renderOrders(){
      const rows = G4_WORDS.map(w=>{
        const confirmed = !!(state.games.confirms[w] && state.games.confirms[w].g4);
        const active = w === word;
        return `<button class="btn ${active?'':'btn--ghost'}" style="padding:8px 16px;font-size:14px" data-g4-order="${w}">${confirmed?ART.tick+' ':''}${colorStrictWord(w, wordColorCtx())}</button>`;
      }).join('');
      orders.innerHTML = rows + (correctWords.size >= 3
        ? `<p class="g1__progress" style="width:100%;color:var(--ok)">今天的建议量完成啦，还想玩可以继续</p>`
        : '');
    }

    function rackHTML(){
      const tiles = RACK_LETTERS.map((c,i)=>{
        const used = usedTileIdx.includes(i);
        // c 是字位 ID：辅音/元音分类改用 soundType，显示文字改用 graphemeLabel
        // （方案 §3.1「tileHTML 一律收 ID」同一原则，这里是手写裸 ID 直显点，
        // 不经 tileHTML，故各自单独换）。
        const cls = soundType(c, SOUNDS) === 'v' ? 'tile--v' : 'tile--c';
        const label = graphemeLabel(c, SOUNDS);
        // 积木同时带 data-sayph（走既有全局委托听音素，G2 同款惯例）与本游戏
        // 自己的 data-g4-tile/data-g4-letter（入槽逻辑），互不冲突。
        const canHear = hasPhoneme(c);
        return `<button class="tile ${cls}" ${canHear?`data-sayph="${c}"`:''} data-g4-tile="${i}" data-g4-letter="${c}" ${used?'disabled':''} aria-label="${canHear?`听 ${SOUNDS[c].ipa} 的发音`:`字母 ${label}`}">${escapeHtmlText(label)}</button>`;
      });
      return groupedRackHTML(RACK_LETTERS, tiles);
    }
    function slotsHTML(cls){
      return slots.map((c,i)=>`<button class="tile tile--lg ${c?'':'tile--empty'} ${cls||''}" data-g4-slot="${i}">${c?escapeHtmlText(graphemeLabel(c,SOUNDS)):''}</button>`).join('');
    }

    function renderIdle(){
      uiState = 'idle';
      body.innerHTML = `<p class="g1__hint">选一张订单，或点上面「随机来一单」</p>`;
    }
    function renderPlacing(){
      uiState = 'placing';
      body.innerHTML = `
        <div class="g4__slots">${slotsHTML()}</div>
        <div class="g4__rack">${rackHTML()}</div>
        <p class="g1__hint">听到的词是 ${wordIds.length} 块积木，摆一摆</p>
        ${errorCount >= 2 ? `<p class="g1__hint">提示：第一块是 <b class="en">${escapeHtmlText(graphemeLabel(wordIds[0], SOUNDS))}</b></p>` : ''}
      `;
    }
    function renderAudioFailed(){
      uiState = 'audioFailed';
      body.innerHTML = `
        <p class="g1__hint">声音没放出来</p>
        <div class="g1__ctl"><button class="btn btn--ok" data-g4-act="resume">再试一次</button></div>
      `;
    }
    function renderInterrupted(){
      uiState = 'interrupted';
      body.innerHTML = `
        <p class="g1__hint">刚才被打断了</p>
        <div class="g1__ctl"><button class="btn btn--ok" data-g4-act="resume">继续</button></div>
      `;
    }

    function playQuestion(){
      clearFeedbackTimer();   // F1：换题/重播前先清掉可能还没触发的600ms摆错回退计时器
      const myToken = ++roundToken;
      uiState = 'playing';
      body.innerHTML = `<p class="g1__hint">听……</p>`;
      WordAudio.play(word).then(r=>{
        if(myToken !== roundToken) return;
        if(r.status === 'ended') renderPlacing();
        else if(r.status === 'failed'){
          renderAudioFailed();
          showAudioFailure({ retry(){ playQuestion(); } });
        }
        else if(r.status === 'cancelled'){
          if(uiState === 'playing') renderInterrupted();   // 同 G1：外部请求打断，非本卡主动收场
        }
      });
    }
    function pickWord(w){
      clearFeedbackTimer();   // F1：换词时若上一词还挂着摆错回退计时器，直接作废
      cancelG4LongPress();    // 复审 low#1：换单前取消未完成长按
      word = w;
      wordIds = graphemesOf(w);   // 槽数按字位数建，不是按字符数（方案 §2.2「槽位长度」行）
      slots = new Array(wordIds.length).fill(null);
      usedTileIdx = [];
      errorCount = 0;
      renderOrders();
      playQuestion();
    }

    function placeLetter(tileIdx, letter){   // letter 现在实际是字位 ID
      if(uiState !== 'placing') return;
      const emptyIdx = slots.indexOf(null);
      if(emptyIdx === -1) return;
      slots[emptyIdx] = letter;
      usedTileIdx.push(tileIdx);
      if(slots.every(c=>c!==null)) validate(); else renderPlacing();
    }
    function retractSlot(slotIdx){
      if(uiState !== 'placing') return;
      const letter = slots[slotIdx];
      if(!letter) return;
      slots[slotIdx] = null;
      for(let i=usedTileIdx.length-1;i>=0;i--){
        if(RACK_LETTERS[usedTileIdx[i]] === letter){ usedTileIdx.splice(i,1); break; }
      }
      renderPlacing();
    }
    // F2（P2 末审）：拼对反馈按 confirms[word].g4 分支绘制——未确认=长按钮，
    // 已确认=「✓ 已确认」+「撤销」。换词/长按确认/点撤销都会重新走这里，
    // 单一出口，不会有"明明已确认却还看到长按钮"这类分叉遗漏。
    function renderConfirmFeedback(){
      const myWord = word;
      const confirmed = !!(state.games.confirms[myWord] && state.games.confirms[myWord].g4);
      if(confirmed){
        body.innerHTML = `
          <div class="g4__slots">${slotsHTML('g1__target--pop')}</div>
          <p class="g1__hint" style="color:var(--ok)">${ART.tick} 已确认</p>
          <div class="blender__ctl"><button class="btn btn--ghost" data-g4-act="unconfirm">撤销</button></div>
        `;
        return;
      }
      body.innerHTML = `
        <div class="g4__slots">${slotsHTML('g1__target--pop')}</div>
        <p class="g1__hint">拼对了！他自己指读了吗？</p>
        <div class="blender__ctl">
          <button class="btn btn--ok g4__confirm" data-g4-act="confirm">
            <span class="g2__confirm-fill" data-longpress-fill></span>
            <span class="g2__confirm-label">按住 1 秒确认</span>
          </button>
        </div>
      `;
      /* 复审 low#1：保存 cancel 并在换单/复位/重绘前取消——词值相同的快速重选场景下，
         仅 word===myWord 的值比对拦不住陈旧回调（G2 cancelG2LongPress 同款模式） */
      cancelG4LongPress();
      root._g4Cancel = bindLongPress(body.querySelector('.g4__confirm'), ()=>{
        if(word !== myWord || uiState !== 'feedback' || surfaceOf(slots, SOUNDS) !== myWord) return;   // 状态级三要素复核
        confirmWord(myWord, 'g4');
        renderOrders();
        renderConfirmFeedback();   // 切到"已确认+撤销"视图，不是简单文案替换
      }, 1000);
    }

    function validate(){
      const spelled = surfaceOf(slots, SOUNDS);   // 摆词比较（方案 §2.2「摆词比较」行）：ID 数组拼出的表面串
      const isRight = spelled === word;
      uiState = 'feedback';
      if(isRight){
        errorCount = 0;
        correctWords.add(word);
        renderOrders();   // 摆对3个的软提示要当场出现，不等换词/长按确认才刷新
        renderConfirmFeedback();
      } else {
        errorCount++;
        // F1（P2 末审）：捕获当前令牌，600ms 回调执行前复校"令牌一致+word非空+
        // 仍处feedback态"三要素——任何一条不满足都说明这期间换词/换单/被重置/
        // 又摆错重新判过了，回退渲染只会覆盖新状态甚至在 word=null 时直接炸掉
        // （renderPlacing 里 word.length 会抛异常），所以只信这次判断，别的都不做。
        const myToken = roundToken;
        body.innerHTML = `<div class="g4__slots">${slotsHTML('g1__target--shake')}</div><p class="g1__hint">摆错了，点错的字母撤回再试</p>`;
        // 抖动后槽内内容不清空（"可重摆"字面）——回到 placing 让孩子自己撤回改摆
        clearFeedbackTimer();
        feedbackTimer = laterOnce(()=>{
          feedbackTimer = null;
          if(myToken !== roundToken || !word || uiState !== 'feedback') return;
          renderPlacing();
        }, 600);
      }
    }

    function reset(){
      // U2/P1 硬约定：折叠清理钩子——终止当前进行态回 idle，roundToken 作废
      // 使陈旧的 playQuestion 回调彻底失效。F1：连带清掉可能还没触发的
      // 600ms 摆错回退计时器，避免它在折叠后的隐藏节点上迟到触发。
      roundToken++;
      clearFeedbackTimer();
      cancelG4LongPress();   // 复审 low#1：折叠/复位前取消未完成长按
      word = null; wordIds = []; slots = []; usedTileIdx = []; errorCount = 0;
      renderOrders();
      renderIdle();
    }
    root._g4Reset = reset;

    renderOrders();
    renderIdle();
    root.addEventListener('click', e=>{
      const order = e.target.closest('[data-g4-order]');
      if(order){ pickWord(order.dataset.g4Order); return; }   // 换词=新逻辑请求，WordAudio 自然取消旧音频
      const randomBtn = e.target.closest('[data-act="random"]');
      if(randomBtn){ pickWord(G4_WORDS[Math.floor(Math.random()*G4_WORDS.length)]); return; }
      const tile = e.target.closest('[data-g4-tile]');
      if(tile && !tile.disabled){ placeLetter(+tile.dataset.g4Tile, tile.dataset.g4Letter); return; }
      const slot = e.target.closest('[data-g4-slot]');
      if(slot){ retractSlot(+slot.dataset.g4Slot); return; }
      const act = e.target.closest('[data-g4-act]');
      if(act && act.dataset.g4Act === 'resume'){ playQuestion(); return; }
      if(act && act.dataset.g4Act === 'unconfirm'){
        // F2：撤销只在当前仍处 feedback 态、且撤销的是眼前这个词时才有意义——
        // 按钮本身只会在这个状态下渲染出来，点击是同步的没有异步延迟，这里的
        // uiState 检查是防御性的，不是实际会被触发的分支。
        if(uiState !== 'feedback' || !word) return;
        unconfirmWord(word, 'g4');
        renderOrders();
        renderConfirmFeedback();
        return;
      }
    });
  });
}

/* ==================================================================
   G5 造词工坊（Day7「游戏二：积木造词」替换，v1.3 §4.5 + §2.5 入口1/5 +
   §3.1 程序锁）：解锁条件=examRecorded(day)（周检 checks[0] 勾选，见该函数
   定义处）；锁定=卡片盖灰+期待式文案，无倒计时无进度。解锁后：19 块积木
   (三周 19 个字母各 1 块，按元音 / 辅音分组固定位)+2/3/4 槽切换（默认3）+清空重来；点积木入下一空槽、点槽内积木
   撤回；摆满槽自动判——真词（⊆G5_WHITELIST 且不是保留词）→中性提示+长按
   确认 confirms.g5（可撤销，战利品墙自动点亮，靠已有 derivedTrophies()，
   这里不用另写点亮逻辑）；假词与保留词→完全同一段"这个组合，读读看"提示，
   同一个函数产出，不是分别写的两份相似文案（DOM 级恒等）。判定顺序严格
   Guard.isReserved 前置——先查保留词才查白名单，双保险（白名单本身也不含
   保留词，build 自检⑤已断言）。全程不放任何词音频（真词也不放，§4.5 明确
   要求，避免"真词播/保留词不播"这种反过来的差异信号）；积木点击仍可通过
   全局 data-sayph 委托听音素。12 分钟计时从"这一步真正展开可见"那一刻起算
   （F3，P2 末审）：resume() 是唯一起表口，toggleStep 展开含 G5 的 step 时
   调用；折叠期间/尚未展开过的初始挂载都不计时。到点/未提前清空前出 Nat
   打哈欠角标（非覆盖层，卡片右下角，点击消失），_g5Reset 清计时+收角标，
   不结算不动 confirms。程序锁的另一半在 checks 点击委托里（见该处 U3 注释）：
   勾选/取消勾选周检第一项后广播 _g5Refresh()，它会看一眼这一步当前是否
   展开，可见才顺带重新起表，不可见只重画不计时。
   ================================================================== */
/* 里程碑 0（课程方案 §9.2，用户 2026-09-02 拍板"分组固定位架"）：积木架按元音 / 辅音分两组渲染，
   组内顺序 = RACK_LETTERS 的累计教学顺序（新字母只在末尾追加，旧字母位置不动）。tiles 的索引
   仍是 RACK_LETTERS 的索引，G4 / G5 的入槽逻辑不受影响；辅音组由 CSS 限宽为最多 7 块一行。 */
function groupedRackHTML(letters, tiles){
  if(!META.groupedRack) return tiles.join('');
  const v = [], c = [];
  // letters 现在是字位 ID 数组：分类改用 soundType，不再用 vowels.includes(字符)
  // （方案 §3.6「分组固定位与 tile class」——vowels.includes('ai') 必然失配）。
  letters.forEach((ch, i) => (soundType(ch, SOUNDS) === 'v' ? v : c).push(tiles[i]));
  const group = (label, cls, arr) => arr.length
    ? `<div class="rack__group ${cls}"><span class="rack__label">${label}</span>${arr.join('')}</div>` : '';
  return group('元音', 'rack__group--v', v) + group('辅音', 'rack__group--c', c);
}

function initG5(){
  document.querySelectorAll('[data-g5]').forEach(root=>{
    const body = root.querySelector('[data-g5-body]');
    const day = +root.dataset.g5Day;
    const RACK_LETTERS = normalizeIdList(META.rackG5, {legacy:true});
    let slotCount = 3;
    let slots = new Array(slotCount).fill(null);
    let usedTileIdx = [];
    let idleTimerId = null;
    let yawnEl = null;

    function armIdleTimer(){ idleTimerId = laterOnce(showYawn, 12 * 60 * 1000); }
    function clearIdleTimer(){ if(idleTimerId){ clearTimeout(idleTimerId); idleTimerId = null; } }
    function showYawn(){
      if(yawnEl) return;
      yawnEl = document.createElement('div');
      yawnEl.className = 'g5__yawn';
      yawnEl.innerHTML = `<div class="g5__yawn-ic">${nat('nap')}</div><span>玩了好久啦，休息一下吧</span>`;
      yawnEl.addEventListener('click', hideYawn, {once:true});
      root.appendChild(yawnEl);
    }
    function hideYawn(){ if(yawnEl){ yawnEl.remove(); yawnEl = null; } }

    function rackHTML(){
      const tiles = RACK_LETTERS.map((c,i)=>{
        const used = usedTileIdx.includes(i);
        const cls = soundType(c, SOUNDS) === 'v' ? 'tile--v' : 'tile--c';
        const label = graphemeLabel(c, SOUNDS);
        const canHear = hasPhoneme(c);
        return `<button class="tile ${cls}" ${canHear?`data-sayph="${c}"`:''} data-g5-tile="${i}" data-g5-letter="${c}" ${used?'disabled':''} aria-label="${canHear?`听 ${SOUNDS[c].ipa} 的发音`:`字母 ${label}`}">${escapeHtmlText(label)}</button>`;
      });
      return groupedRackHTML(RACK_LETTERS, tiles);
    }
    function slotsHTML(){
      return slots.map((c,i)=>`<button class="tile tile--lg ${c?'':'tile--empty'}" data-g5-slot="${i}">${c?escapeHtmlText(graphemeLabel(c,SOUNDS)):''}</button>`).join('');
    }
    // 假词与保留词共用同一个函数产出同一份 DOM——不是分别写的两处相似文案。
    function neutralFeedbackHTML(){
      return `<p class="g1__hint">这个组合，读读看</p>`;
    }
    function realWordFeedbackHTML(spelled){
      const confirmed = !!(state.games.confirms[spelled] && state.games.confirms[spelled].g5);
      if(confirmed){
        return `
          <p class="g1__hint" style="color:var(--ok)">${ART.tick} 已确认，读读看</p>
          <div class="blender__ctl"><button class="btn btn--ghost" data-g5-act="unconfirm">撤销</button></div>
        `;
      }
      return `
        <p class="g1__hint">拼出一个词！读读看</p>
        <div class="blender__ctl">
          <button class="btn btn--ok g5__confirm" data-g5-act="confirm">
            <span class="g2__confirm-fill" data-longpress-fill></span>
            <span class="g2__confirm-label">按住 1 秒确认</span>
          </button>
        </div>
      `;
    }

    function renderLockedView(){
      root.classList.add('g5--locked');
      body.innerHTML = `<p class="g5__lock-note">做完周检，造词工坊就开门啦</p>`;
    }

    function render(){
      // 每次渲染都重新判定锁——checks[0] 是唯一真相源，不在实例里缓存 locked
      // 状态（缓存了就要操心何时失效，不如每次都问一遍，成本可忽略）。
      if(!examRecorded(day)){
        clearIdleTimer();
        hideYawn();
        // 取消勾选→恢复锁定"派生无副作用"指的是不动 confirms/战利品墙这类
        // 持久数据；正在摆的半成品字母不是持久数据，锁上时清空，避免下次
        // 解锁又神不知鬼不觉地把上次锁定前的残局摆回来吓孩子一跳。
        slots = new Array(slotCount).fill(null);
        usedTileIdx = [];
        renderLockedView();
        return;
      }
      root.classList.remove('g5--locked');
      // F3（P2 末审）：12 分钟计时的"起表"职责从这里挪到 resume()——render()
      // 只管纯渲染，不管这一刻卡片是不是真的对孩子可见（step 可能还折叠着）。
      // 计时该不该起，交给唯一知道"是否刚展开"这件事的调用方去决定。
      const full = slots.every(c=>c!==null);
      let spelled = null, isRealWord = false;
      if(full){
        spelled = surfaceOf(slots, SOUNDS);   // 摆词比较：ID 数组拼出的表面串（方案 §2.2「摆词比较」行）
        // 判定顺序（规格明文）：Guard.isReserved 前置，命中就走假词分支
        // （下面的三元里 isRealWord=false 直接落到 neutralFeedbackHTML，
        // 与真正的假词是同一条代码路径，不是并列判断两次）。
        isRealWord = !Guard.isReserved(spelled) && G5_WHITELIST.includes(spelled);
      }
      body.innerHTML = `
        <div class="g5__slotlen">
          ${[2,3,4].map(n=>`<button class="btn ${n===slotCount?'':'btn--ghost'}" data-g5-len="${n}">${n} 槽</button>`).join('')}
        </div>
        <div class="g4__slots">${slotsHTML()}</div>
        <div class="g4__rack">${rackHTML()}</div>
        <div class="blender__ctl"><button class="btn btn--ghost" data-g5-act="clear">清空重来</button></div>
        ${full ? (isRealWord ? realWordFeedbackHTML(spelled) : neutralFeedbackHTML()) : ''}
      `;
      if(full && isRealWord && !(state.games.confirms[spelled] && state.games.confirms[spelled].g5)){
        const mySpelled = spelled;
        bindLongPress(body.querySelector('.g5__confirm'), ()=>{
          if(surfaceOf(slots, SOUNDS) !== mySpelled) return;   // 长按期间已经撤回/清空/换槽数，不落到别的词上
          confirmWord(mySpelled, 'g5');
          render();
        }, 1000);
      }
    }

    function placeLetter(tileIdx, letter){
      const emptyIdx = slots.indexOf(null);
      if(emptyIdx === -1) return;
      slots[emptyIdx] = letter;
      usedTileIdx.push(tileIdx);
      render();
    }
    function retractSlot(slotIdx){
      const letter = slots[slotIdx];
      if(!letter) return;
      slots[slotIdx] = null;
      for(let i=usedTileIdx.length-1;i>=0;i--){
        if(RACK_LETTERS[usedTileIdx[i]] === letter){ usedTileIdx.splice(i,1); break; }
      }
      render();
    }
    function setSlotCount(n){
      slotCount = n;
      slots = new Array(n).fill(null);
      usedTileIdx = [];
      render();
    }
    function clearAll(){
      slots = new Array(slotCount).fill(null);
      usedTileIdx = [];
      render();
    }

    function reset(){
      clearIdleTimer();
      hideYawn();
      slots = new Array(slotCount).fill(null);
      usedTileIdx = [];
      // 不在这里调用 render()：step 已经折叠隐藏，没必要重画；下次任何触发
      // render() 的事件（周检勾选变化广播 _g5Refresh，或重新展开后的下一次
      // 交互）都会用 examRecorded() 重新判定一次，语义上是等价的。
    }
    root._g5Reset = reset;

    // F3（P2 末审）：resume() 是"这一刻起 12 分钟"的唯一起点——先按最新锁
    // 状态重画（examRecorded 可能在这期间勾选/取消勾选变了），确认解锁后
    // 才补计时。toggleStep 展开含 G5 的 step 时直接调用（那一刻必定可见，
    // 不需要再判断）；_g5Refresh 是 checks 委托那边的广播口，可见性未知，
    // 自己看一眼 step__body.hidden 再决定是 resume() 还是只 render()——
    // 初始挂载/折叠期间的卡片永远不会被这条路径起表，天然满足"隐藏态不计时"。
    function resume(){
      render();
      if(!examRecorded(day)) return;   // 锁定：render() 已经清过计时+锁定视图
      if(!idleTimerId) armIdleTimer();
    }
    root._g5Resume = resume;
    root._g5Refresh = function(){
      const stepBody = root.closest('.step__body');
      const visible = !!stepBody && !stepBody.hidden;
      if(visible) resume(); else render();
    };

    render();
    root.addEventListener('click', e=>{
      const lenBtn = e.target.closest('[data-g5-len]');
      if(lenBtn){ setSlotCount(+lenBtn.dataset.g5Len); return; }
      const tile = e.target.closest('[data-g5-tile]');
      if(tile && !tile.disabled){ placeLetter(+tile.dataset.g5Tile, tile.dataset.g5Letter); return; }
      const slot = e.target.closest('[data-g5-slot]');
      if(slot){ retractSlot(+slot.dataset.g5Slot); return; }
      const act = e.target.closest('[data-g5-act]');
      if(act){
        if(act.dataset.g5Act === 'clear'){ clearAll(); return; }
        if(act.dataset.g5Act === 'unconfirm'){ unconfirmWord(surfaceOf(slots, SOUNDS), 'g5'); render(); return; }
      }
    });
  });
}

/* ==================================================================
   Day1 听音找首字母：电脑播词，孩子点 g / c。答错留在原题，允许不限次重听；
   答对才揭示单词、中文和插画，再由孩子自己点下一题。
   ================================================================== */
function initInitialPick(){
  document.querySelectorAll('[data-initialpick]').forEach(root=>{
    const body = root.querySelector('[data-initialpick-body]');
    const words = root.dataset.words.split(',').filter(Boolean);
    const letters = root.dataset.letters.split(',').filter(Boolean);
    let queue = [], qi = 0, current = null;
    let uiState = 'idle';             // idle|playing|waiting|feedback|audioFailed|interrupted|done
    let roundToken = 0;

    function shuffledWords(){
      const q = words.slice();
      for(let i=q.length-1;i>0;i--){
        const j = Math.floor(Math.random() * (i + 1));
        const t = q[i]; q[i] = q[j]; q[j] = t;
      }
      return q;
    }
    function progressLine(){
      return `<p class="initialpick__progress">第 ${qi+1} / ${queue.length} 题</p>`;
    }
    function choicesHTML(opts){
      opts = opts || {};
      return `<div class="initialpick__choices">${letters.map(ch=>{
        const cls = ch === opts.right ? ' initialpick__letter--right'
          : ch === opts.wrong ? ' initialpick__letter--wrong' : '';
        return `<button class="initialpick__letter${cls}" data-initial-letter="${ch}" aria-label="选择首字母 ${ch}" ${opts.disabled?'disabled':''}>${ch}</button>`;
      }).join('')}</div>`;
    }
    function feedbackHTML(word){
      const d = W[word] || {zh:'', art:null};
      return `<div class="initialpick__feedback">
        ${hasIll(d.art) ? illHTML(d.art,72) : ''}
        <span><b>${colorStrictWord(word, wordColorCtx())}</b><br>${d.zh}</span>
      </div>`;
    }
    function restartBtn(){
      return `<button class="btn btn--ghost" data-initial-act="restart">重新开始</button>`;
    }
    function renderIdle(){
      uiState = 'idle';
      body.innerHTML = `
        <p class="g1__cmd">听一个词，再点它开头的字母</p>
        ${choicesHTML({disabled:true})}
        <button class="btn btn--ok" data-initial-act="start">开始游戏</button>`;
    }
    function renderPlaying(){
      uiState = 'playing';
      body.innerHTML = `
        <div class="initialpick__stage"><span class="g1__hint">${ART.spk} 正在念……</span></div>
        ${choicesHTML({disabled:true})}
        ${restartBtn()}
        ${progressLine()}`;
    }
    function renderWaiting(){
      uiState = 'waiting';
      body.innerHTML = `
        <div class="initialpick__stage"><button class="btn btn--ghost initialpick__listen" data-initial-act="again">${ART.spk} 再听一次</button></div>
        ${choicesHTML()}
        <p class="g1__hint">听到的第一个声音，对应哪块字母？</p>
        ${restartBtn()}
        ${progressLine()}`;
    }
    function renderWrong(picked){
      uiState = 'feedback';
      body.innerHTML = `
        <div class="initialpick__stage"><span class="g1__hint">再听听第一个声音</span></div>
        ${choicesHTML({disabled:true, wrong:picked})}
        <div class="g1__ctl">
          <button class="btn btn--ok" data-initial-act="retry">${ART.spk} 再听一遍</button>
          ${restartBtn()}
        </div>
        ${progressLine()}`;
    }
    function renderRight(){
      uiState = 'feedback';
      const right = current.charAt(0);
      body.innerHTML = `
        ${choicesHTML({disabled:true, right})}
        <p class="g1__hint" style="color:var(--ok)">${ART.tick} 找对啦！</p>
        ${feedbackHTML(current)}
        <div class="g1__ctl">
          <button class="btn btn--ok" data-initial-act="next">${qi+1 < queue.length ? '下一题 '+ART.arrowR : '看结果 '+ART.arrowR}</button>
          ${restartBtn()}
        </div>
        ${progressLine()}`;
    }
    function renderAudioFailed(){
      uiState = 'audioFailed';
      body.innerHTML = `
        <p class="g1__hint">声音没放出来</p>
        ${choicesHTML({disabled:true})}
        <div class="g1__ctl"><button class="btn btn--ok" data-initial-act="resume">再试一次</button>${restartBtn()}</div>
        ${progressLine()}`;
    }
    function renderInterrupted(){
      uiState = 'interrupted';
      body.innerHTML = `
        <p class="g1__hint">刚才被别的声音打断了</p>
        ${choicesHTML({disabled:true})}
        <div class="g1__ctl"><button class="btn btn--ok" data-initial-act="resume">继续这一题</button>${restartBtn()}</div>
        ${progressLine()}`;
    }
    function renderResult(){
      uiState = 'done';
      body.innerHTML = `
        <div class="g1__result"><b>${queue.length} / ${queue.length}</b>　这一轮的首字母都找到了！</div>
        <button class="btn btn--ok" data-initial-act="restart">再玩一轮</button>`;
      celebrateNat();
    }
    function playQuestion(){
      current = queue[qi];
      const myToken = ++roundToken;
      renderPlaying();
      WordAudio.play(current).then(r=>{
        if(myToken !== roundToken) return;
        if(r.status === 'ended') renderWaiting();
        else if(r.status === 'failed'){
          renderAudioFailed();
          showAudioFailure({retry(){ playQuestion(); }});
        }else if(r.status === 'cancelled' && uiState === 'playing'){
          renderInterrupted();
        }
      });
    }
    function startRound(){
      queue = shuffledWords(); qi = 0; current = queue[0];
      playQuestion();
    }
    function reset(){
      roundToken++;
      renderIdle();
    }
    root._initialPickReset = reset;

    renderIdle();
    root.addEventListener('click', e=>{
      const letter = e.target.closest('[data-initial-letter]');
      if(letter && uiState === 'waiting'){
        const picked = letter.dataset.initialLetter;
        picked === current.charAt(0) ? renderRight() : renderWrong(picked);
        return;
      }
      const act = e.target.closest('[data-initial-act]');
      if(!act) return;
      const kind = act.dataset.initialAct;
      if(kind === 'start' || kind === 'restart'){ startRound(); return; }
      if(kind === 'again' || kind === 'retry' || kind === 'resume'){ playQuestion(); return; }
      if(kind === 'next'){
        if(uiState !== 'feedback') return;
        if(qi + 1 < queue.length){ qi++; playQuestion(); }
        else renderResult();
      }
    });
  });
}

/* ==================================================================
   G1 声音抓抓乐 —— 回合状态机（规格 v1.3 §4.1 + §2.3 失败口径）
   idle → playing → window → feedback → (next question | 结算)
                        ↳ failed → audioFailed → (retry 回 window)
   ================================================================== */
function initG1(){
  document.querySelectorAll('[data-g1-round]').forEach(root=>{
    const roundKey = root.dataset.g1Round;             // G1_ROUNDS 的键
    const theme = G1_THEME[roundKey];
    const body = root.querySelector('[data-g1-body]');
    let queue = [], qi = 0, correct = 0;
    let uiState = 'idle';                 // idle|playing|window|feedback|audioFailed|interrupted|done
    let repeatUsed = false, answered = false, pendingTimer = null;
    let roundToken = 0;                   // S3 预筛 H1②：陈旧回调防护，playQuestion 每次分发都自增+捕获

    function clearPending(){ if(pendingTimer){ clearTimeout(pendingTimer); pendingTimer = null; } }

    function buildQueue(){
      const cfg = G1_ROUNDS[roundKey];
      const q = [
        ...cfg.pos.map(w=>({word:w, target:true})),
        ...cfg.neg.map(w=>({word:w, target:false}))
      ];
      for(let i=q.length-1;i>0;i--){ const j = Math.floor(Math.random()*(i+1)); const t=q[i]; q[i]=q[j]; q[j]=t; }
      return q;
    }

    // 气球直接显示本轮目标字母；元音沿用红色、辅音沿用青色。
    function targetInner(){
      // roundKey 是字位 ID（G1_ROUNDS 的键）：手写裸 ID 直显点，改用 soundType/graphemeLabel
      // 而不是 vowels.includes(字符)/直接插值 ID（方案 §4 第 4b 行「11 处手写裸 ID 直显点」之一）。
      const vowelClass = soundType(roundKey, SOUNDS) === 'v' ? ' g1__target-letter--vowel' : '';
      return `<span class="g1__target-letter${vowelClass}">${escapeHtmlText(graphemeLabel(roundKey, SOUNDS))}</span>`;
    }
    function meaningChip(word){
      const d = W[word] || {zh:'', art:null};
      return `<div class="g1__meaning">${hasIll(d.art)?illHTML(d.art,56):''}<div><b class="en">${colorStrictWord(word, wordColorCtx())}</b>　${d.zh}</div></div>`;
    }
    function progressLine(){ return `<p class="g1__progress">第 ${qi+1} / ${queue.length} 题　对 ${correct}</p>`; }
    function restartBtn(){ return `<button class="btn btn--ghost" data-g1-act="restart">重新开始这一轮</button>`; }

    function renderIdle(){
      uiState = 'idle';
      body.innerHTML = `
        <p class="g1__cmd">${theme.cmd}</p>
        <button class="btn btn--ok" data-g1-act="start">开始这一轮</button>
      `;
    }
    function renderPlaying(){
      uiState = 'playing';
      body.innerHTML = `
        <div class="g1__stage"><button class="g1__target" disabled>${targetInner()}</button></div>
        <p class="g1__hint">听……</p>
        <div class="g1__ctl">${restartBtn()}</div>
        ${progressLine()}
      `;
    }
    function renderWindow(){
      uiState = 'window';
      answered = false;
      body.innerHTML = `
        <div class="g1__stage"><button class="g1__target" data-g1-act="tap">${targetInner()}</button></div>
        <p class="g1__hint">${theme.cmd}</p>
        <div class="g1__ctl">
          <button class="btn btn--ghost" data-g1-act="again" ${repeatUsed?'disabled':''}>${ART.spk} 再听一次</button>
          ${restartBtn()}
        </div>
        ${progressLine()}
      `;
      clearPending();
      pendingTimer = laterOnce(()=>resolveAnswer(false), ANSWER_WINDOW_MS);
    }
    function renderFeedback(isRight, wasTap){
      uiState = 'feedback';
      const q = queue[qi];
      // S3 预筛 L2：负例正确=没拍，不该当成"拍对"一样爆气球——只有真的拍中目标音才 pop；
      // 错拍（负例被拍/正例拍错时机不会发生，此处特指负例误拍）才 shake；漏拍（正例没拍中）不加动画。
      const cls = (isRight && wasTap) ? 'g1__target--pop' : (!isRight && wasTap) ? 'g1__target--shake' : '';
      const hint = isRight ? (wasTap ? '对啦！' : '没拍，对啦！') : (wasTap ? '再听听看' : '刚才漏掉啦');
      body.innerHTML = `
        <div class="g1__stage"><button class="g1__target ${cls}" disabled>${targetInner()}</button></div>
        <p class="g1__hint">${hint}</p>
        ${isRight && wasTap ? meaningChip(q.word) : ''}
        <div class="g1__ctl">${restartBtn()}</div>
        ${progressLine()}
      `;
      clearPending();
      pendingTimer = laterOnce(()=>advance(), 900);
    }
    function renderAudioFailed(){
      uiState = 'audioFailed';
      body.innerHTML = `
        <div class="g1__stage"><button class="g1__target" disabled>${targetInner()}</button></div>
        <p class="g1__hint">声音没放出来</p>
        <div class="g1__ctl">
          <button class="btn btn--ok" data-g1-act="resume">再试一次</button>
          ${restartBtn()}
        </div>
        ${progressLine()}
      `;
    }
    function renderInterrupted(){
      uiState = 'interrupted';
      body.innerHTML = `
        <div class="g1__stage"><button class="g1__target" disabled>${targetInner()}</button></div>
        <p class="g1__hint">刚才被打断了</p>
        <div class="g1__ctl">
          <button class="btn btn--ok" data-g1-act="resume">继续这一题</button>
          ${restartBtn()}
        </div>
        ${progressLine()}
      `;
    }
    function renderResult(){
      uiState = 'done';
      const passed = correct >= 6;
      const gs = state.games.grab[roundKey];
      gs.best = Math.max(gs.best || 0, correct);
      save();
      body.innerHTML = `
        <div class="g1__result"><b>${correct} / ${queue.length}</b>　${passed?'通关啦':'再来一轮就能通关（对 6 题过）'}<br>历史最好：${gs.best} / ${queue.length}</div>
        <div class="g1__ctl"><button class="btn btn--ok" data-g1-act="restart">再玩一轮</button></div>
      `;
      // T3 触发点③：G1 通关时庆祝。覆盖层是 body 级 fixed 定位，浮在结算 UI
      // 上面显示，不会替换/打断上面刚写入的 body.innerHTML 结算内容。
      if(passed) celebrateNat();
    }

    function playQuestion(){
      const myToken = ++roundToken;   // H1②：本次分发的令牌，回调里先比对，不一致=陈旧回调
      renderPlaying();
      const q = queue[qi];
      WordAudio.play(q.word).then(r=>{
        if(myToken !== roundToken) return;   // 陈旧回调防护，ended/failed/cancelled 全部分支通吃
        if(r.status === 'ended') renderWindow();
        else if(r.status === 'failed'){
          renderAudioFailed();
          showAudioFailure({ retry(){ playQuestion(); } });   // 顶部条保留为辅助（M1）
        }
        else if(r.status === 'cancelled'){
          // 令牌校验已通过（本卡没有自己重开新一题/被 reset），此时 uiState 仍是
          // 'playing' 说明是外部请求（示范词卡/音素砖/另一轮 G1）抢走了 AudioBus，
          // 不是本卡主动收场——弹"被打断"让孩子/家长知道发生了什么、可以继续。
          if(uiState === 'playing') renderInterrupted();
        }
        // blocked：静默
      });
    }
    function resolveAnswer(tapped){
      if(uiState !== 'window' || answered) return;   // 播放期/反馈期锁答边界
      answered = true;
      clearPending();
      const q = queue[qi];
      const isRight = tapped === q.target;
      if(isRight) correct++;
      renderFeedback(isRight, tapped);
    }
    function advance(){
      clearPending();
      if(qi + 1 < queue.length){ qi++; repeatUsed = false; playQuestion(); }
      else renderResult();
    }
    function reset(){
      // S3 预筛 H1：供"外部"收场本卡用——另一轮开局互斥（①）、step 折叠清理（M2）。
      // 不调用本身也不需要额外调用 AudioBus.stopAll()：真正抢麦克风的那次新请求
      // （另一轮的 playQuestion / 折叠时若无后续动作则本来就没有新请求）会通过
      // AudioBus 自己的仲裁让本卡在飞的 promise 收到 cancelled；这里只需要把本卡
      // UI 立刻退回 idle，并顺手让 roundToken 失配，陈旧回调彻底失效不再处理任何分支。
      roundToken++;
      clearPending();
      renderIdle();
    }
    root._g1Reset = reset;

    function startRound(){
      // H1①：轮次互斥——开新一轮前，先把其余 G1 卡（包括另一轮）收回 idle，
      // 避免两张卡同时占着"playing/window"却其实音频早被这次新请求抢走。
      document.querySelectorAll('[data-g1-round]').forEach(other=>{
        if(other !== root && other._g1Reset) other._g1Reset();
      });
      clearPending();
      queue = buildQueue();
      qi = 0; correct = 0; repeatUsed = false; answered = false;
      playQuestion();
    }

    renderIdle();
    root.addEventListener('click', e=>{
      const act = e.target.closest('[data-g1-act]');
      if(!act) return;
      const kind = act.dataset.g1Act;
      if(kind === 'start' || kind === 'restart'){ startRound(); return; }
      if(kind === 'tap'){ resolveAnswer(true); return; }
      if(kind === 'resume'){ playQuestion(); return; }   // audioFailed/interrupted 卡内按钮共用（M1/H1②）
      if(kind === 'again'){
        if(uiState !== 'window' || repeatUsed) return;   // 限 1 次/题
        repeatUsed = true;
        clearPending();   // 显式失效旧作答窗计时器（resolveAnswer 的 uiState 校验本已兜底，此处求干净）
        playQuestion();   // 重播本题音，ended 后 renderWindow 重新起 4 秒作答窗
      }
    });
  });
}

function initFlash(){
  document.querySelectorAll('[data-items]').forEach(root=>{
    const items = JSON.parse(root.dataset.items);
    const recKey = root.dataset.reckey || '';   // 'flash_sounds' | 'flash_words' | ''（无纪录）
    let i = 0, t0 = null, timer = null;
    let timing = false, count = 0, autoStopTimer = null;   // 仅 flash_words 用
    const face = root.querySelector('[data-face]');
    const meta = root.querySelector('[data-meta]');
    const tip = root.querySelector('[data-tip]');
    const record = root.querySelector('[data-record]');

    function fmtValue(metric, v){ return metric === 'elapsed' ? v.toFixed(1) + ' 秒' : v + ' 张'; }

    function drawCard(){
      const it = items[i];
      if(it.k === 'w'){
        face.innerHTML = `<span class="en">${colorStrictWord(it.v, wordColorCtx())}</span>`;
        tip.innerHTML = `孩子读出来之后，点这里核对 → <button class="btn btn--ghost" style="padding:6px 14px;font-size:13px" data-say="${it.v}">${ART.spk} 听一下</button>`;
      }else{
        const s = SOUNDS[it.k];
        face.innerHTML = `<span class="${s.type==='v'?'v':''}">${s.grapheme}</span>`;
        tip.innerHTML = `<b>${s.ipa}</b>　${s.mem}　<button class="btn btn--ghost" style="padding:6px 14px;font-size:13px" data-sayph="${it.k}">${ART.spk} 听一下</button>`;
      }
      meta.textContent = `${i+1} / ${items.length}`;
    }
    function renderRecord(){
      if(!record) return;
      record.classList.remove('flash__record--new');
      if(!recKey){ record.textContent = ''; return; }
      const rec = state.games.flash[recKey];
      record.textContent = rec ? `最好 ${fmtValue(rec.metric, rec.value)}` : '';
    }
    function draw(){ drawCard(); renderRecord(); }

    // 规格 §4.6：isBetter(metric,a,b) 统一比较；破纪录写入+调 onNewRecord 空钩子
    // （T3 落地 Nat 庆祝）；未破显示"本次/最好"两行。
    function lockRecord(value){
      if(!recKey) return;
      const metric = FLASH_METRIC_BY_KEY[recKey];
      // E8：elapsed 在写入/比较前统一舍入到 0.1 秒，与 fmtValue 的 toFixed(1)
      // 显示口径一致，避免"显示相同但比较结果不同"的边界不一致。
      if(metric === 'elapsed') value = Math.max(0.1, Math.round(value * 10) / 10);   // 复审 #2：舍入后保底 0.1s，防 0 秒非法纪录（清洗要求 elapsed>0 且小优下 0 不可破）
      const rec = state.games.flash[recKey];
      const better = !rec || isBetter(metric, value, rec.value);
      if(better){
        state.games.flash[recKey] = {metric, value};
        save();
        onNewRecord(recKey);
        if(record){ record.textContent = `新纪录！${fmtValue(metric, value)}`; record.classList.add('flash__record--new'); }
      } else if(record){
        record.textContent = `本次 ${fmtValue(metric, value)}　最好 ${fmtValue(rec.metric, rec.value)}`;
        record.classList.remove('flash__record--new');
      }
    }

    function stopTimerDisplay(){ if(timer){ clearInterval(timer); timer = null; } }
    function clearAutoStop(){ if(autoStopTimer){ clearTimeout(autoStopTimer); autoStopTimer = null; } }
    function resetTimerBtn(btn){ if(btn){ btn.textContent = '开始计时'; btn.classList.add('btn--ok'); } }

    // E1（合并审 high）：折叠清理专用钩子——终止任何正在进行的计时，不结算/
    // 不写成绩（比 finishWords(false,...) 更彻底：连"中途退出"提示文案都不
    // 留，因为折叠时看不到，没必要）。G1/_g1Reset、G2/_g2Cancel 之后，"组件
    // 级 reset 钩子"是所有带计时器/进行态组件的默认模式，本函数是第三例。
    root._flashReset = function(){
      clearAutoStop();
      stopTimerDisplay();
      timing = false;
      t0 = null;
      count = 0;
      resetTimerBtn(root.querySelector('[data-act="timer"]'));
    };

    // flash_sounds：v2 秒表 toggle 语义不变——停表即完成，锁定 elapsed（>0 才有效）
    function stopSounds(btn){
      stopTimerDisplay();
      resetTimerBtn(btn);
      const elapsed = t0 ? (Date.now() - t0) / 1000 : 0;
      t0 = null;
      if(elapsed > 0) lockRecord(elapsed);
    }

    // flash_words：30 秒自动停 或 翻完第 18 张立即停（成绩=前进张数，上限 18）；
    // 手动停＝中途退出，不记录（规格 §4.6 边界）。
    function finishWords(shouldRecord, btn){
      if(!timing) return;   // 防重复触发（18 张边界与 30 秒定时器可能先后都想收尾）
      timing = false;
      clearAutoStop();
      stopTimerDisplay();
      resetTimerBtn(btn);
      if(shouldRecord) lockRecord(count);
      else if(record){ record.textContent = '中途退出，本次不计入成绩'; record.classList.remove('flash__record--new'); }
    }

    root.addEventListener('click', e=>{
      const act = e.target.closest('[data-act]');
      if(!act) return;

      if(act.dataset.act === 'next'){
        if(recKey === 'flash_words' && timing){
          count++;
          if(count >= items.length){ drawCard(); finishWords(true, root.querySelector('[data-act="timer"]')); return; }
          i++; drawCard();
          return;
        }
        i = (i+1) % items.length; draw();
        return;
      }
      if(act.dataset.act === 'prev'){
        if(recKey === 'flash_words' && timing) return;   // 计时中不倒退，保持"前进张数"计数干净
        i = (i-1+items.length) % items.length; draw();
        return;
      }
      if(act.dataset.act === 'timer'){
        if(recKey === 'flash_words'){
          if(timing){ finishWords(false, act); return; }   // 手动停=中途退出，不记录
          timing = true; t0 = Date.now(); i = 0; count = 0; draw();
          act.classList.remove('btn--ok');
          timer = everyTick(()=>{ act.textContent = ((Date.now()-t0)/1000).toFixed(1) + ' 秒　停'; }, 100);
          autoStopTimer = laterOnce(()=> finishWords(true, act), 30000);
          return;
        }
        // flash_sounds（或任何无 recKey 的 timed 组）：沿用 v2 秒表 toggle
        if(timer){ stopSounds(act); return; }
        t0 = Date.now(); i = 0; draw();
        act.classList.remove('btn--ok');
        timer = everyTick(()=>{ act.textContent = ((Date.now()-t0)/1000).toFixed(1) + ' 秒　停'; }, 100);
      }
    });
    draw();
  });
}

function initBook(){
  const root = document.querySelector('.book');
  if(!root) return;
  const pages = BOOK.pages.slice(Number(root.dataset.bookStart) || 0, Number(root.dataset.bookEnd) || BOOK.pages.length);
  let p = 0;
  const art = root.querySelector('[data-art]');
  const line = root.querySelector('[data-line]');
  const zh = root.querySelector('[data-zh]');
  const pg = root.querySelector('[data-pg]');
  const prev = root.querySelector('[data-act="prev"]');
  const next = root.querySelector('[data-act="next"]');
  function draw(){
    const pageData = pages[p];
    // .book__art 是 220px 固定方块，缺图时会在每页正文上方留一个大空白，
    //  必须连容器一起收起来，不能只填空串（codex notes_for_claude_code 点名待核处）
    const artHTML = bookArt(pageData.art);
    art.innerHTML = artHTML;
    art.hidden = !artHTML;
    line.innerHTML = colorPlainText(pageData.line, wordColorCtx());
    line.dataset.say = pageData.line.replace(/[""]/g,'');
    zh.textContent = pageData.zh;
    pg.textContent = `${p+1} / ${pages.length}　·　${BOOK.title}`;
    prev.disabled = p === 0;
    next.disabled = p === pages.length - 1;
  }
  root.addEventListener('click', e=>{
    const act = e.target.closest('[data-act]');
    if(!act) return;
    if(act.dataset.act === 'next' && p < pages.length-1){ p++; draw(); }
    if(act.dataset.act === 'prev' && p > 0){ p--; draw(); }
    if(act.dataset.act === 'print'){ printBook(); }
  });
  draw();
}

/* ---------- 打印小书：封面 + 六页 + 签名页。节点挂在 body 下、平时隐藏，
   打印时用 body.pbmode 只显示它，普通 Ctrl+P 打印页面本身不受影响。 ---------- */
