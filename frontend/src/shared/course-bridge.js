/* Embedded only in the three-week course; standalone weekly lessons are unchanged. */
(()=>{
  const gate=parent.CourseGate;
  const week=META.week;
  const originalDay=renderDay;
  renderDay=function(n){
    if(!gate.allowed(week,n)){curDay=0;renderHome();return;}
    originalDay(n);
  };
  window.courseCanLeave=()=>!progressDirty || confirm('本周有尚未保存的进度。请先重试保存或导出备份。仍要切换周吗？');
  const originalSave=save;
  save=function(){const result=originalSave();gate.refresh();return result;};
  window.courseRefresh=function(){
    if(!gate.allowed(week,1)) clearPageTimers();
    document.querySelectorAll('[data-goto]').forEach(button=>{
      const day=Number(button.dataset.goto);
      if(!Number.isInteger(day)||day<1||day>7)return;
      const locked=!gate.allowed(week,day);
      button.disabled=locked;
      button.setAttribute('aria-disabled',String(locked));
      if(locked){button.title='完成并保存前面的每日打卡后解锁';button.dataset.courseLocked='true';}
      else if(button.dataset.courseLocked){button.removeAttribute('title');delete button.dataset.courseLocked;}
    });
    if(curDay>0&&!gate.allowed(week,curDay)){curDay=0;renderHome();}
  };
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-goto]');
    if(button&&Number(button.dataset.goto)>0&&!gate.allowed(week,Number(button.dataset.goto))){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  // Observe replacement navigation controls, not our own accessibility attributes.
  new MutationObserver(()=>window.courseRefresh()).observe(document.body,{childList:true,subtree:true});
  const style=document.createElement('style');
  style.textContent='[data-course-locked]{opacity:.52;cursor:not-allowed!important}[data-course-locked].daycard::after{content:"🔒 完成前一天后解锁";display:block;font-size:12px;margin-top:8px}';
  document.head.appendChild(style);
  gate.refresh();
})();
