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
  window.courseWeekAllowed=()=>gate.allowed(week,1);
  window.courseRefresh=function(){
    if(!gate.allowed(week,1))clearPageTimers();
    refreshDateLocks();
    if(curDay>0&&!gate.allowed(week,1)){curDay=0;renderHome();}
  };
  document.addEventListener('click',e=>{
    const button=e.target.closest('[data-goto]');
    if(button&&Number(button.dataset.goto)>0&&!gate.allowed(week,Number(button.dataset.goto))){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  // Observe replacement navigation controls, not our own accessibility attributes.
  new MutationObserver(()=>window.courseRefresh()).observe(document.body,{childList:true,subtree:true});
  gate.refresh();
})();
