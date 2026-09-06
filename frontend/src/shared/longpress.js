const activeLongPresses = new Set();
function cancelActiveLongPresses(){ for(const cancel of [...activeLongPresses]) cancel(); }
window.addEventListener('blur', cancelActiveLongPresses);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) cancelActiveLongPresses(); });
function bindLongPress(el, fn, ms){
  ms = ms || 1000;
  let timer = null, startX = 0, startY = 0;
  const MOVE_TOL = 12;   // 审 20 H-1：按住期间位移超过它就当成滚动 / 拖动，取消计时
  const fill = el.querySelector('[data-longpress-fill]') || el;
  // 审 20 复审 R-1：所有长按目标统一禁掉文本选择与触屏长按呼出（写在原语里，不依赖各自的 CSS）
  el.style.userSelect = 'none'; el.style.webkitUserSelect = 'none'; el.style.webkitTouchCallout = 'none';
  function arm(){
    fill.style.transition = 'none';
    fill.style.transform = 'scaleX(0)';
    void fill.offsetWidth;   // 强制回流，确保下次按下重新触发过渡（不是复用同一次动画）
  }
  function begin(x, y){
    if(timer) return;   // 已经在计时，重复 down（如触屏又派生 mousedown）不重开
    startX = x; startY = y;
    fill.style.transition = `transform ${ms}ms linear`;
    fill.style.transform = 'scaleX(1)';
    // D3：用 laterOnce 纳入 pageTimers——切页/切天时 clearPageTimers() 会把这个
    // 计时器一并清掉，避免长按到一半离开、回调却在别的天/别的词上迟到触发。
    activeLongPresses.add(cancel);
    timer = laterOnce(()=>{ activeLongPresses.delete(cancel); timer = null; arm(); if(el.isConnected && !document.hidden) fn(); }, ms);
  }
  function cancel(){
    activeLongPresses.delete(cancel);
    if(!timer) return;
    clearTimeout(timer); timer = null;
    arm();
  }
  // 鼠标：只认主键（右键 / 中键按住不算数）；preventDefault 防长按选中文字与拖拽
  function onMouseDown(e){
    if(e.button !== 0) return;
    e.preventDefault();
    // 审 20 复审 R-4：preventDefault 挡掉了按钮的默认聚焦，手动补回——鼠标按过之后键盘路径仍可用
    if(typeof el.focus === 'function') el.focus({preventScroll:true});
    begin(e.clientX, e.clientY);
  }
  // 触摸：不再 preventDefault——让浏览器照常滚动，滚动手势由 touchmove 的位移判断取消计时；
  // 长按弹出的系统菜单由下面的 contextmenu 拦截（审 20 H-1）
  function onTouchStart(e){
    if(e.touches && e.touches.length !== 1){ cancel(); return; }
    const t = e.touches && e.touches[0];
    if(!t) return;
    begin(t.clientX, t.clientY);
  }
  function onTouchMove(e){
    if(!timer) return;
    const t = e.touches && e.touches[0];
    if(!t) return;
    if(Math.abs(t.clientX - startX) > MOVE_TOL || Math.abs(t.clientY - startY) > MOVE_TOL) cancel();
  }
  // 键盘：Enter / 空格按住同样要满 ms 才触发，与鼠标同一门槛（审 20 M-2，规范 §10 键盘可达）；
  // 忽略自动重复；preventDefault 挡住 Enter 的 click 与空格的滚页
  function onKeyDown(e){
    if(e.repeat) return;
    if(e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    begin(0, 0);
  }
  function onKeyUp(e){
    if(e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    cancel();
  }
  arm();
  el.addEventListener('mousedown', onMouseDown);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('touchstart', onTouchStart, {passive:true});
  el.addEventListener('touchmove', onTouchMove, {passive:true});
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('keyup', onKeyUp);
  el.addEventListener('blur', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('lostpointercapture', cancel);
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('selectstart', e => e.preventDefault());
  return cancel;   // E2：调用方可拿到 cancel 自己在需要的时机（如折叠清理）主动收掉长按
}
