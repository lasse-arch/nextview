(function(){document.querySelectorAll('.manim').forEach(function(root){
var view=root.querySelector('.ma-view'),sc=root.querySelector('.ma-scroll'),dot=root.querySelector('.ma-dot');
if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches){root.querySelector('[data-g="3"]').classList.add('open');dot.style.display='none';return;}
var y=0;function q(s){return root.querySelector(s);}
function go(el,dx){var r=root.getBoundingClientRect(),e=el.getBoundingClientRect();dot.style.transform='translate('+(e.left-r.left+(dx||e.width*.45))+'px,'+(e.top-r.top+e.height/2)+'px)';}
function tap(){dot.classList.remove('tap');void dot.offsetWidth;dot.classList.add('tap');}
function scroll(to){to=Math.max(0,Math.min(to,sc.scrollHeight-view.clientHeight));y=to;sc.style.transform='translateY('+(-y)+'px)';}
function clear(){root.querySelectorAll('.open,.hl').forEach(function(e){e.classList.remove('open','hl');});}
var steps=[
 [600,function(){clear();scroll(0);dot.style.opacity=1;go(q('[data-g="0"] .mh'));}],
 [900,function(){go(q('[data-g="3"] .mh'));}],
 [700,function(){tap();q('[data-g="3"]').classList.add('open');q('[data-g="3"] .mh').classList.add('hl');}],
 [1100,function(){go(q('[data-s="3-3"]'));}],
 [600,function(){tap();q('[data-s="3-3"]').classList.add('hl');}],
 [1100,function(){scroll(Math.min(q('[data-g="4"]').offsetTop-40,9999));setTimeout(function(){go(q('[data-g="4"] .mh'));},450);}],
 [1000,function(){tap();q('[data-g="4"]').classList.add('open');q('[data-g="4"] .mh').classList.add('hl');}],
 [1100,function(){go(q('[data-s="4-1"]'));}],
 [600,function(){tap();q('[data-s="4-1"]').classList.add('hl');}],
 [1100,function(){scroll(q('[data-g="5"]').offsetTop-40);setTimeout(function(){go(q('[data-g="5"] .mh'));},450);}],
 [1000,function(){tap();q('[data-g="5"]').classList.add('open');q('[data-g="5"] .mh').classList.add('hl');}],
 [1100,function(){go(q('[data-s="5-3"]'));}],
 [600,function(){tap();q('[data-s="5-3"]').classList.add('hl');}],
 [1300,function(){var m=sc.scrollHeight-view.clientHeight;scroll(Math.max(0,m));setTimeout(function(){go(q('.ma-cta'));},450);}],
 [1100,function(){tap();q('.ma-cta').classList.add('hl');}],
 [1600,function(){dot.style.opacity=0;}],
 [600,function(){clear();scroll(0);}]
];
var i=0,run=false;function next(){if(!run)return;var s=steps[i];s[1]();i=(i+1)%steps.length;setTimeout(next,steps[i][0]+300);}
if('IntersectionObserver' in window){new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&!run){run=true;next();}else if(!e.isIntersecting){run=false;}});},{threshold:.3}).observe(root);}else{run=true;next();}
});})();(function(){document.querySelectorAll('[data-tprev]').forEach(function(w){var s=w.querySelectorAll('.tp-s'),t=w.querySelectorAll('.tp-tabs button'),i=0,tm=null,vis=false;
function show(n){i=n;s.forEach(function(e,k){e.classList.toggle('on',k===n);if(e.tagName==='VIDEO'){if(k===n){e.preload='auto';e.currentTime=0;var p=e.play();if(p&&p.catch)p.catch(function(){});}else e.pause();}});t.forEach(function(b,k){b.setAttribute('aria-selected',k===n);b.classList.toggle('on',k===n);});var c=w.querySelector('.tp-cap');if(c){c.innerHTML='<b>'+t[n].getAttribute('data-tag')+'</b><p>'+t[n].getAttribute('data-cap')+'</p>';}
clearTimeout(tm);if(vis)tm=setTimeout(function(){show((i+1)%s.length);},s[n].tagName==='VIDEO'?9000:4500);}
t.forEach(function(b,k){b.addEventListener('click',function(){show(k);});});t[0].classList.add('on');
if('IntersectionObserver' in window){new IntersectionObserver(function(es){es.forEach(function(e){vis=e.isIntersecting;if(vis)show(i);else clearTimeout(tm);});},{threshold:.4}).observe(w);}
});})();
(function(){var f=document.querySelector('.wk-filter');if(!f)return;var bs=f.querySelectorAll('button'),cs=document.querySelectorAll('.wk-grid .wk');
bs.forEach(function(b){b.addEventListener('click',function(){var k=b.getAttribute('data-f');bs.forEach(function(o){o.setAttribute('aria-pressed',o===b);});cs.forEach(function(c){c.hidden=!(k==='all'||c.getAttribute('data-kind')===k);});});});})();

(function(){document.querySelectorAll('.tour-embed').forEach(function(w){var bt=w.querySelector('button');if(bt)bt.addEventListener('click',function(){var f=document.createElement('iframe');f.src=w.getAttribute('data-src');f.title='Virtuel rundvisning';f.allow='fullscreen; xr-spatial-tracking';f.setAttribute('allowfullscreen','');w.innerHTML='';w.appendChild(f);w.classList.add('on');});});try{if('scrollRestoration' in history)history.scrollRestoration='manual';}catch(e){}if(!location.hash){window.scrollTo(0,0);window.addEventListener('load',function(){window.scrollTo(0,0);});}var q=document.getElementById('bq');if(q){var ts=document.querySelectorAll('#btiles .btile'),c=document.getElementById('bcount');q.addEventListener('input',function(){var v=q.value.trim().toLowerCase(),n=0;ts.forEach(function(t){var d=t.getAttribute('data-name');var on=!v||d==='*'||d.indexOf(v)>-1;t.hidden=!on;if(on&&d!=='*')n++;});c.textContent=n?'Står din branche ikke her, så kontakt os.':'Ingen match. Kontakt os, så hjælper vi dig.';});}var h=document.getElementById('top'),b=h&&h.querySelector('.menu-toggle');
if(b){b.addEventListener('click',function(){var o=h.classList.toggle('open');b.setAttribute('aria-expanded',o);b.textContent=o?'Luk':'Menu';});}
document.querySelectorAll('[role=tab]').forEach(function(t){t.addEventListener('click',function(){var tabs=t.closest('[role=tablist]').querySelectorAll('[role=tab]');tabs.forEach(function(o){var on=o===t;o.setAttribute('aria-selected',on);o.tabIndex=on?0:-1;var p=document.getElementById(o.getAttribute('aria-controls'));if(p)p.hidden=!on;});});});
document.querySelectorAll('form[data-kontakt]').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();var n=f.querySelector('[name=navn]'),m=f.querySelector('[name=email]'),b=f.querySelector('button[type=submit]'),ok=f.querySelector('.ok'),er=f.querySelector('.err');if(!n.value.trim()||!m.value||m.value.indexOf('@')<0){(n.value.trim()?m:n).focus();return;}
var d={side:location.pathname};new FormData(f).forEach(function(v,k){d[k]=v;});b.disabled=true;var t=b.textContent;b.textContent='Sender…';if(er)er.hidden=true;
fetch('/api/site/kontakt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(r){return r.json().catch(function(){return {};}).then(function(j){if(!r.ok)throw new Error(j.error||'');});}).then(function(){ok.hidden=false;b.textContent='Sendt';f.querySelectorAll('input,select,textarea').forEach(function(x){x.disabled=true;});}).catch(function(x){b.disabled=false;b.textContent=t;if(er){er.textContent=x.message||'Beskeden kunne ikke sendes. Ring gerne på +45 20 91 02 94.';er.hidden=false;}});});});})();
(function(){document.querySelectorAll('.film').forEach(function(w){var v=w.querySelector('video'),p=w.querySelector('.f-play'),end=w.querySelector('.f-end'),again=w.querySelector('.f-again');if(!v||!p)return;
function play(){w.classList.add('spiller');if(end)end.hidden=true;v.controls=true;v.currentTime=0;var r=v.play();if(r&&r.catch)r.catch(function(){});}
p.addEventListener('click',play);if(again)again.addEventListener('click',play);
v.addEventListener('ended',function(){v.controls=false;if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(function(){});if(end)end.hidden=false;});});})();
