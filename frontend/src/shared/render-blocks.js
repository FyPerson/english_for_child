function colorWord(w){
  return w.split('').map(ch => vowels.includes(ch.toLowerCase()) ? `<span class="v word-vowel">${ch}</span>` : ch).join('');
}
function tileHTML(ch, cls, live){
  const t = vowels.includes(ch.toLowerCase()) ? 'tile--v' : 'tile--c';
  // live 时积木是发音按钮（真人录音）。默认纯 div——button 不能嵌 button，
  // 日卡这类本身就是按钮的容器里必须用 div。
  // 只有真人录音在的音才做成发音按钮；没录音的积木保持静态，不做点了没反应的哑巴按钮（铁律 8）
  if(live && SOUNDS[ch] && hasPhoneme(ch)) return `<button class="tile ${t} ${cls||''}" data-sayph="${ch}" aria-label="听 ${SOUNDS[ch].ipa} 的发音">${ch}</button>`;
  return `<div class="tile ${t} ${cls||''}">${ch}</div>`;
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
    return `<div class="sound">
      <div class="sound__hd">
        ${forms.map(f => tileHTML(SOUNDS[f].grapheme,'tile--lg',true)).join('')}
        <div class="sound__meta">
          <div class="sound__ipa ${isV?'is-v':'is-c'}">${s.ipa}</div>
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
              ? `<button class="btn btn--ghost soundlab__listen" data-sayph="${b.s}">${ART.spk} 先听一遍 <span class="en">${s.ipa}</span></button>`
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
            ${s.demo.map(([w,zh])=>`<button class="wordchip" data-say="${w}">
              <span class="spk">${ART.spk}</span>
              <span class="wordchip__w en">${colorWord(w)}</span>
              <span class="wordchip__zh">${zh}</span></button>`).join('')}
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
    return `<div class="blender" id="${id}" data-g2="${b.words.join(',')}">
      <div class="g2__nav" data-nav></div>
      <div data-body></div>
    </div>`;
  }

  case 'words':
    return `<div class="wcards">
      ${b.items.map(w=>{
        const d = W[w] || {zh:'',art:null};
        return `<button class="wcard" data-say="${w}">
          <div class="wcard__art">${hasIll(d.art)
            ? illHTML(d.art,72)
            : `<div style="font-family:var(--en);font-size:30px;font-weight:700;color:var(--ink-3)">${colorWord(w)}</div>`}</div>
          <div class="wcard__w">${colorWord(w)}</div>
          <div class="wcard__zh">${d.zh}</div>
        </button>`;
      }).join('')}
    </div>`;

  case 'sight':
    return `<div>
      <div class="wcards" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">
        ${b.items.map(([w,zh])=>`<button class="wcard" data-say="${w}" style="border-color:var(--accent-line);background:var(--accent-soft)">
          <div class="wcard__w" style="font-size:30px;margin-top:8px">${w}</div>
          <div class="wcard__zh">${zh}</div>
          <div style="font-size:11px;color:var(--accent);font-weight:700">直接记，不拼</div>
        </button>`).join('')}
      </div>
    </div>`;

  case 'sentences':
    return `<div style="display:flex;flex-direction:column;gap:10px">
      ${b.items.map(([en,zh])=>`<button class="checkitem" data-say="${en}" style="align-items:center">
        <span class="spk">${ART.spk}</span>
        <span class="checkitem__t"><span class="en" style="font-size:21px;font-weight:700">${colorWord(en)}</span><small>${zh}</small></span>
      </button>`).join('')}
    </div>`;

  case 'wordforge':{
    const mode = b.mode === 'swap' ? 'swap' : 'family';
    let cards = '';
    if(mode === 'family'){
      cards = b.families.map(f=>{
        return `<section class="wordforge__family">
          <div class="wordforge__family-title">固定词尾 <b>${colorWord(f.tail)}</b>，点一块头积木</div>
          <div class="wordforge__equation-rows">
            ${f.heads.map(head=>{
              const word = head + f.tail;
              const zh = (W[word] || {}).zh || '';
              return `<div class="wordforge__equation-choice">
                <span class="wordforge__equation"><button class="wordforge__brick wordforge__head-button" data-wf-word="${word}" aria-label="点击 ${head}，听 ${word}">${head}${ART.spk}</button><span class="wordforge__plus">＋</span><span class="wordforge__brick wordforge__brick--tail">${colorWord(f.tail)}</span><span class="wordforge__equation-arrow">→</span><span class="wordforge__equation-word">${colorWord(word)}</span></span>
                <span class="wordforge__equation-meta"><small>${zh}</small></span>
              </div>`;
            }).join('')}
          </div>
        </section>`;
      }).join('');
    }else{
      cards = b.pairs.map(([from,word])=>{
        const tail = from.slice(1);
        return `<section class="wordforge__family wordforge__swap-family">
          <div class="wordforge__family-title">固定词尾 <b>${colorWord(tail)}</b>，轮流点两个头</div>
          <div class="wordforge__equation-rows">
            ${[from,word].map(candidate=>{
              const head = candidate.charAt(0);
              const zh = (W[candidate] || {}).zh || '';
              return `<div class="wordforge__equation-choice">
                <span class="wordforge__equation"><button class="wordforge__brick wordforge__head-button" data-wf-word="${candidate}" aria-label="点击 ${head}，听 ${candidate}">${head}${ART.spk}</button><span class="wordforge__plus">＋</span><span class="wordforge__brick wordforge__brick--tail">${colorWord(tail)}</span><span class="wordforge__equation-arrow">→</span><span class="wordforge__equation-word">${colorWord(candidate)}</span></span>
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
        return `<div class="blender" id="${id}" data-g3-pair="${p.join(',')}">
          <div data-g3-body></div>
        </div>`;
      }
      return `<div class="blender">
        <div class="pair">
          ${p.map(w=>{
            const d = W[w] || {zh:'', art:null};
            return `<div class="pairbtn" style="pointer-events:none">
              ${hasIll(d.art)?illHTML(d.art,56):''}
              <span class="pairbtn__w">${colorWord(w)}</span>
              <span class="wcard__zh">${d.zh}</span>
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
    return `<div class="flash" id="${id}" data-items='${JSON.stringify(b.items)}' data-timed="${b.timed?1:0}" data-reckey="${b.recKey||''}">
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
    return `<div class="initialpick" id="${id}" data-initialpick data-words="${b.words.join(',')}" data-letters="${b.letters.join(',')}">
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
        return `<div class="g1card g1card--${rk}" data-g1-round="${rk}">
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
          <div class="wcard__w" style="font-size:28px;margin:10px 0 2px">${colorWord(w)}</div>
          <div class="wcard__zh">${W[w].zh}</div></div>`).join('')}
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
