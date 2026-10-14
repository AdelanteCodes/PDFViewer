(() => {
'use strict';
const id='G-QWXMQEFGCK', key='bhavyam-analytics-consent-v1';
let choice=null,started=false;
try { choice=localStorage.getItem(key); } catch {}
const clean=value=>{try{const url=new URL(value,location.href);return url.origin+url.pathname;}catch{return ''}};
window.dataLayer=window.dataLayer||[];
function gtag(){window.dataLayer.push(arguments);}
window.gtag=gtag;
gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
function start(){
 if(started)return;started=true;window['ga-disable-'+id]=false;
 gtag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 gtag('js',new Date());
 gtag('config',id,{page_location:clean(location.href),page_referrer:document.referrer?clean(document.referrer):'',allow_google_signals:false,allow_ad_personalization_signals:false});
 const script=document.createElement('script');script.async=true;script.src='https://www.googletagmanager.com/gtag/js?id='+id;script.id='bhavyam-google-tag';document.head.append(script);
}
function clearCookies(){document.cookie.split(';').forEach(cookie=>{const name=cookie.split('=')[0].trim();if(!name.startsWith('_ga'))return;const hosts=[location.hostname,'.'+location.hostname];hosts.forEach(domain=>{document.cookie=name+'=; Max-Age=0; path=/; domain='+domain+'; SameSite=Lax'});document.cookie=name+'=; Max-Age=0; path=/; SameSite=Lax';});}
const style=document.createElement('style');style.textContent='.analytics-controls{display:flex;justify-content:center;gap:16px;font:12px system-ui;margin:20px auto;color:#aaa99f}.analytics-controls a,.analytics-controls button{color:inherit;text-decoration:underline;text-underline-offset:4px;background:none;border:0;padding:8px;min-height:40px;cursor:pointer;font:inherit}.analytics-choice{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);width:min(520px,calc(100% - 32px));z-index:100;background:#1b1d1b;color:#eeeae1;border:1px solid #555950;border-radius:12px;padding:20px;box-shadow:0 8px 30px #0008;font:14px/1.6 system-ui;text-align:left}.analytics-choice[hidden]{display:none}.analytics-choice h2{font:600 18px system-ui;margin:0 0 10px;color:#eeeae1;letter-spacing:0}.analytics-choice p{margin:0 0 14px;color:#bdbeb6}.analytics-choice .options{display:flex;gap:12px;flex-wrap:wrap}.analytics-choice button{font:600 14px system-ui;min-height:44px;padding:10px 18px;background:#252a25;color:#eeeae1;border:1px solid #899083;border-radius:6px;cursor:pointer}.analytics-choice a{color:#a8cbed;text-decoration:underline}.analytics-choice button:focus-visible,.analytics-controls button:focus-visible{outline:3px solid #a8cbed;outline-offset:3px}';document.head.append(style);
const controls=document.createElement('div');controls.className='analytics-controls';controls.innerHTML='<a href="/privacy.html">Privacy</a><button type="button">Analytics settings</button>';
const footer=document.querySelector('footer');(footer||document.querySelector('main')||document.body).insertAdjacentElement('afterend',controls);
const panel=document.createElement('section');panel.className='analytics-choice';panel.setAttribute('aria-label','Analytics choice');panel.innerHTML='<h2>Help improve this site?</h2><p>With your permission, Google Analytics measures visits, approximate location, devices and link clicks. No advertising tracking. <a href="/privacy.html">Privacy details</a></p><div class="options"><button type="button" data-choice="granted">Accept analytics</button><button type="button" data-choice="denied">Decline analytics</button></div>';document.body.append(panel);
const optout=navigator.globalPrivacyControl===true||navigator.doNotTrack==='1';
if(optout&&!choice)choice='denied';
panel.hidden=choice!==null;
controls.querySelector('button').addEventListener('click',()=>{panel.hidden=false;panel.querySelector('button').focus()});
panel.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{
 choice=button.dataset.choice;try{localStorage.setItem(key,choice);}catch{}
 panel.hidden=true;
 if(choice==='granted'){start();}else{window['ga-disable-'+id]=true;clearCookies();location.reload();}
}));
if(choice==='granted')start();
document.addEventListener('click',event=>{
 if(choice!=='granted'||!started)return;
 const link=event.target.closest('a[href]');if(!link)return;
 const url=new URL(link.href,location.href);if(!['http:','https:'].includes(url.protocol))return;
 let name='site_link_click';
 if(url.pathname.endsWith('.jar'))name='download_build';
 else if(url.hostname.includes('instagram.com'))name='instagram_click';
 else if(url.hostname==='github.com')name='repository_click';
 else if(url.hostname==='bhavyam.shop'&&url.pathname==='/')name='creations_click';
 else if(url.pathname.startsWith('/astfps'))name='project_click';
 gtag('event',name,{link_url:clean(url.href),link_domain:url.hostname,page_location:clean(location.href),transport_type:'beacon'});
},true);
})();