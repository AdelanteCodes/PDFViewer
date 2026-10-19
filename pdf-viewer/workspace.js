import {mountAssistant} from './assistant.js';
const $=id=>document.getElementById(id);
const readSettings=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const storeSettings=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
const chainable=new Set(['merge','alternate','organize','delete','extract','half','rotate','crop','resize','flip','nup','numbers','bates','header','watermark','metadata','bookmarks','remove-annotations','flatten','compress','compress-scan','grayscale','deskew','ocr']);
export function mountWorkspace(api){
  const {configs,session,status}=api;
  let editorDirty=false,downloadAfterSave=false;let exportUrl=null;let doc=null,page=1,version=0,paintVersion=0,renderTask=null,steps=[],running=false,observer=null;
  const assistant=mountAssistant({getDocument:()=>doc,getRevision:()=>session.current?.revision,selectTool(id){if(!canLeaveEditor())return;closeSurface();api.select(id);selected(configs.find(c=>c.id===id));},goToPage(n){if(!canLeaveEditor())return;closeSurface();page=n;draw();}});
  const selection=new Set();let recent=readSettings('pdf-recent',[]);if(!Array.isArray(recent))recent=[];
  let saved=readSettings('pdf-workflows',[]);if(!Array.isArray(saved))saved=[];
  for(const group of new Set(configs.map(c=>c.group))){const o=new Option(group,group);$('category').append(o);}
  const guarded=fn=>(...args)=>{if(api.busy()||running)return;Promise.resolve().then(()=>fn(...args)).catch(e=>status(e.message,true));};
  function selected(c){
    $('active-name').textContent=c.name;if($('mode-label'))$('mode-label').textContent=c.name;
    recent=[c.id,...recent.filter(id=>id!==c.id)].slice(0,8);storeSettings('pdf-recent',recent);catalog();
    $('add-step').disabled=!chainable.has(c.id);
    $('run').textContent=chainable.has(c.id)||['images-pdf','docx-pdf','html-pdf','protect','unlock','repair'].includes(c.id)?'Apply to document':'Export result';
  }
  function catalog(){
    const q=$('tool-search').value.toLowerCase().trim(),category=$('category').value;
    const list=configs.filter(c=>(!category||(category==='recent'?recent.includes(c.id):c.group===category))&&`${c.name} ${c.description} ${c.group}`.toLowerCase().includes(q));
    if(category==='recent')list.sort((a,b)=>recent.indexOf(a.id)-recent.indexOf(b.id));
    $('tool-cards').replaceChildren();
    for(const c of list){const b=document.createElement('button');b.className='tool-card';b.setAttribute('aria-pressed',String($('tool').value===c.id));
      const categoryLabel=document.createElement('span');categoryLabel.className='eyebrow';categoryLabel.textContent=c.group;
      const title=document.createElement('strong');title.textContent=c.name;const description=document.createElement('small');description.textContent=c.description;
      b.append(categoryLabel,title,description);b.onclick=guarded(()=>{if(!canLeaveEditor())return;closeSurface();api.select(c.id);selected(c);$('catalog-panel').open=false;$('document-workspace').scrollIntoView({behavior:'smooth',block:'start'});$('active-name').tabIndex=-1;$('active-name').focus({preventScroll:true});if(matchMedia('(max-width:800px)').matches)openMobileSettings();});$('tool-cards').append(b);
    }
    $('catalog-count').textContent=list.length?`${list.length} tools available`:'No tools match. Try another search.';
  }
  async function draw(){
    const target=doc;if(!target)return;
    const token=version,paintToken=++paintVersion;renderTask?.cancel();
    try{const p=await target.getPage(page);if(token!==version||paintToken!==paintVersion)return;
      const base=p.getViewport({scale:1}),fit=Math.max(.1,Math.min(2,($('document-stage').clientWidth-40)/base.width));
      let scale=$('preview-zoom').value==='fit'?fit:Number($('preview-zoom').value);scale=Math.min(scale,Math.sqrt(8000000/(base.width*base.height)));
      const v=p.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);canvas.setAttribute('aria-label',`PDF page ${page}`);
      const previous=$('document-stage').querySelector('canvas');if(previous)previous.width=0;$('document-stage').replaceChildren(canvas);renderTask=p.render({canvasContext:canvas.getContext('2d'),viewport:v});await renderTask.promise;p.cleanup();
    }catch(e){if(e.name!=='RenderingCancelledException'&&token===version&&paintToken===paintVersion)status(e.message,true);}
    if(token!==version||paintToken!==paintVersion)return;$('preview-page').value=page;$('previous-page').disabled=page<=1;$('next-page').disabled=page>=target.numPages;
  }
  async function refresh(){
    assistant.changed();
    if(exportUrl){URL.revokeObjectURL(exportUrl);exportUrl=null;}$('workspace-export')?.remove();const token=++version;observer?.disconnect();renderTask?.cancel();await doc?.destroy();doc=null;selection.clear();$('page-list').replaceChildren();
    $('undo').disabled=session.cursor<=0;$('redo').disabled=session.cursor>=session.entries.length-1;
    const entry=session.current;document.body.classList.toggle('has-document',!!entry);if(entry&&document.body.classList.contains('editor-open'))$('editor-frame').contentWindow?.postMessage({type:'pdf-open',bytes:entry.bytes.slice(),name:entry.name,revision:entry.revision},location.origin);
    for(const id of ['download-document','edit-current','extract-current','preview-page'])$(id).disabled=!entry;
    $('share-document').hidden=!entry||!navigator.canShare?.({files:[new File([entry?.bytes||new Uint8Array()],entry?.name||'document.pdf',{type:'application/pdf'})]});
    $('document-name').textContent=entry?`${entry.name} · ${(entry.bytes.length/1024/1024).toFixed(2)} MiB`:'No document open';
    if(!entry){$('document-stage').textContent='Choose a PDF to start.';$('page-count').textContent='';$('previous-page').disabled=$('next-page').disabled=true;return;}
    try{
      const js=await api.pdfjs();const task=js.getDocument({data:entry.bytes.slice()});
      task.onPassword=(update,reason)=>{const password=prompt(reason===2?'Incorrect password. Try again:':'Enter the PDF opening password:');if(password===null){task.destroy();}else update(password);};
      const next=await task.promise;if(token!==version){await next.destroy();return;}doc=next;
      page=Math.min(page,doc.numPages);$('preview-page').max=doc.numPages;$('page-count').textContent=`of ${doc.numPages}`;await draw();
      observer=new IntersectionObserver(entries=>{for(const e of entries){e.target.dataset.visible=String(e.isIntersecting);if(e.isIntersecting&&!e.target.querySelector('canvas'))thumbnail(e.target,token);else if(!e.isIntersecting){const canvas=e.target.querySelector('canvas');if(canvas){canvas.width=0;canvas.remove();}}}}, {root:$('page-list'),rootMargin:'100px'});
      for(let n=1;n<=doc.numPages;n++){const b=document.createElement('button');b.className='page-tile';b.dataset.page=n;b.textContent=`Page ${n}`;b.setAttribute('aria-pressed','false');b.onclick=guarded(async()=>{selection.has(n)?selection.delete(n):selection.add(n);b.setAttribute('aria-pressed',String(selection.has(n)));page=n;await draw();});$('page-list').append(b);observer.observe(b);}
    }catch(e){if(token===version)status(`Preview unavailable: ${e.message}. For an encrypted PDF, use Unlock with password before other tools.`,true);}
  }
  // Only thumbnails entering the strip viewport render, at low resolution.
  let thumbQueue=Promise.resolve();
  function thumbnail(button,token){thumbQueue=thumbQueue.then(async()=>{if(token!==version||!doc||button.dataset.visible!=='true')return;const p=await doc.getPage(Number(button.dataset.page));if(token!==version)return;const base=p.getViewport({scale:1}),v=p.getViewport({scale:Math.min(70/base.width,90/base.height)}),canvas=document.createElement('canvas');canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;if(token===version&&button.dataset.visible==='true')button.prepend(canvas);else canvas.width=0;p.cleanup();}).catch(()=>{});}
  function synchronize(){if(session.current)api.setFiles([new File([session.current.bytes],session.current.name,{type:'application/pdf'})]);else api.setFiles([]);}
  const toolPanel=$('tool-panel'),toolHome=toolPanel.parentElement;
  function openMobileSettings(){if($('mobile-settings').open)return;$('mobile-settings-body').append(toolPanel);$('mobile-settings').showModal();}
  $('mobile-settings-button').onclick=openMobileSettings;
  $('close-mobile-settings').onclick=()=>$('mobile-settings').close();
  $('mobile-settings').addEventListener('close',()=>{toolHome.prepend(toolPanel);draw();});
  matchMedia('(max-width:800px)').addEventListener('change',event=>{if(!event.matches&&$('mobile-settings').open)$('mobile-settings').close();});
  $('tool-search').oninput=catalog;$('category').onchange=catalog;
  $('undo').onclick=guarded(async()=>{if(!canLeaveEditor())return;session.undo();synchronize();await refresh();});$('redo').onclick=guarded(async()=>{if(!canLeaveEditor())return;session.redo();synchronize();await refresh();});
  $('clear-document').onclick=guarded(async()=>{if(!canLeaveEditor())return;closeSurface();session.clear();synchronize();$('files').value='';await refresh();});
  $('download-document').onclick=guarded(()=>{if(editorDirty){downloadAfterSave=true;requestSave();return;}if(session.current)api.download(session.current.bytes,session.current.name);});
  $('share-document').onclick=guarded(async()=>{if(!session.current)return;try{await navigator.share({files:[new File([session.current.bytes],session.current.name,{type:'application/pdf'})]});}catch(e){if(e.name!=='AbortError')throw e;}});
  $('previous-page').onclick=guarded(()=>{if(doc&&page>1){page--;return draw();}});$('next-page').onclick=guarded(()=>{if(doc&&page<doc.numPages){page++;return draw();}});
  $('preview-page').onchange=guarded(()=>{if(!doc)return;page=Math.max(1,Math.min(doc.numPages,Math.floor(Number($('preview-page').value)||1)));return draw();});$('preview-zoom').onchange=guarded(draw);
  $('select-all-pages').onclick=guarded(()=>{for(const b of $('page-list').children){selection.add(Number(b.dataset.page));b.setAttribute('aria-pressed','true');}});
  $('use-pages').onclick=guarded(()=>{const input=$('opt-pages');if(!input)throw Error('This tool has no page selection setting.');if(!selection.size)throw Error('Select at least one page.');input.value=[...selection].sort((a,b)=>a-b).join(',');});
  $('move-pages').onclick=guarded(async()=>{if(!doc||!selection.size)throw Error('Select pages first.');const ids=[...selection].sort((a,b)=>a-b);for(let n=1;n<=doc.numPages;n++)if(!selection.has(n))ids.push(n);await api.execute('organize',{pages:ids.join(',')});});
  function renderSteps(){
    $('workflow-steps').replaceChildren();steps.forEach((step,index)=>{const row=document.createElement('div');row.className='workflow-step';const label=document.createElement('span');label.textContent=`${index+1}. ${configs.find(c=>c.id===step.id)?.name||step.id}`;row.append(label);
      for(const [text,action] of [['Edit',()=>{api.select(step.id);selected(configs.find(c=>c.id===step.id));for(const [k,v] of Object.entries(step.options))if($('opt-'+k))$('opt-'+k).value=v;steps.splice(index,1);renderSteps();status('Edit the settings, then add this step again.');}],['Up',()=>{if(index)[steps[index-1],steps[index]]=[steps[index],steps[index-1]];renderSteps();}],['Remove',()=>{steps.splice(index,1);renderSteps();}]]){const b=document.createElement('button');b.className='secondary';b.textContent=text;b.onclick=guarded(action);row.append(b);}$('workflow-steps').append(row);});
    if(!steps.length)$('workflow-steps').textContent='Choose a tool, adjust its settings, then add a step.';
  }
  $('add-step').onclick=guarded(()=>{const id=$('tool').value;if(!chainable.has(id))throw Error('This export cannot be chained as a PDF operation.');if(steps.length>=20)throw Error('Use up to 20 steps per workflow.');steps.push({id,options:api.optionsNow()});renderSteps();$('workflow-status').textContent=`${steps.length} steps ready. Open Reusable workflows below to run or edit.`;});
  $('run-workflow').onclick=async()=>{if(!canLeaveEditor()||api.busy()||running)return;if(!steps.length){status('Add workflow steps first.',true);return;}running=true;$('run-workflow').disabled=true;
    try{for(let i=0;i<steps.length;i++){$('workflow-status').textContent=`Running step ${i+1} of ${steps.length}…`;await api.execute(steps[i].id,steps[i].options,{silent:true});}await refresh();$('workflow-status').textContent='Workflow complete. Inspect the preview before downloading.';}
    catch(e){await refresh();$('workflow-status').textContent=`Stopped: ${e.message} Completed steps remain available; use Undo to revert.`;}
    finally{running=false;$('run-workflow').disabled=false;}
  };
  function savedMenu(){$('saved-workflows').replaceChildren(new Option('Load saved workflow',''));saved.forEach((item,i)=>$('saved-workflows').append(new Option(item.name,String(i))));}
  $('save-workflow').onclick=guarded(()=>{if(!steps.length)throw Error('Add steps before saving.');const name=$('workflow-name').value.trim()||'My workflow';saved=saved.filter(x=>x.name!==name);saved.push({name,steps:structuredClone(steps)});if(!storeSettings('pdf-workflows',saved))throw Error('Browser storage unavailable. This workflow remains in memory.');savedMenu();$('workflow-status').textContent='Settings saved on this device. No document saved.';});
  $('saved-workflows').onchange=guarded(()=>{const item=saved[Number($('saved-workflows').value)];if($('saved-workflows').value===''||!item)return;steps=item.steps.filter(s=>chainable.has(s.id)).slice(0,20);$('workflow-name').value=item.name;renderSteps();});
  $('delete-workflow').onclick=guarded(()=>{const index=$('saved-workflows').value;if(index==='')return;saved.splice(Number(index),1);storeSettings('pdf-workflows',saved);savedMenu();});
  function canLeaveEditor(){if(!editorDirty)return true;status('Apply or discard your edits before changing tools.');$('studio-status').textContent='Apply or discard your edits before changing tools.';return false;}
  function closeSurface(){document.body.classList.remove('editor-open','utility-open');$('editor-panel').hidden=true;$('editor-frame').src='about:blank';}
  function requestSave(){$('editor-frame').contentWindow?.postMessage({type:'pdf-save'},location.origin);}
  function openEditor(mode='text'){
    if(!session.current)return;document.body.classList.remove('utility-open');document.body.classList.add('editor-open');$('editor-panel').hidden=false;$('embedded-title').textContent='Edit your PDF';$('mode-label').textContent='Edit your PDF';$('editor-frame').title='PDF editor';
    if($('editor-frame').getAttribute('src')?.startsWith('editor.html'))$('editor-frame').contentWindow?.postMessage({type:'pdf-editor-tool',mode},location.origin);
    else{$('editor-frame').dataset.mode=mode;$('editor-frame').src='editor.html?workspace=1&studio=1';}
  }
  function openUtility(src,title){if(!canLeaveEditor())return;document.body.classList.add('has-document','editor-open','utility-open');$('editor-panel').hidden=false;$('embedded-title').textContent=title;$('mode-label').textContent=title;$('editor-frame').src=src;}
  $('edit-current').onclick=guarded(()=>openEditor());
  $('extract-current').onclick=guarded(()=>openUtility('extract.html?workspace=1','Extract & review'));
  $('sidebar-extract').onclick=$('extract-current').onclick;
  $('sidebar-compare').onclick=()=>openUtility('compare.html?workspace=1','Compare PDF text');
  $('sidebar-excel').onclick=$('start-excel').onclick=()=>openUtility('excel-merge.html?studio=1','Combine Excel files');
  $('close-editor').onclick=()=>{if(canLeaveEditor())closeSurface();};
  $('apply-editor').onclick=requestSave;
  $('discard-editor').onclick=()=>{editorDirty=false;$('studio-status').textContent='';$('editor-frame').contentWindow?.postMessage({type:'pdf-open',bytes:session.current.bytes.slice(),name:session.current.name,revision:session.current.revision},location.origin);};
  for(const button of document.querySelectorAll('[data-editor-tool]'))button.onclick=()=>openEditor(button.dataset.editorTool);
  async function openDocument(file){if(!file||!canLeaveEditor())return;if(!/\.pdf$/i.test(file.name)||file.size>100*1024*1024){status('Choose a PDF up to 100 MiB.',true);$('studio-status').textContent='Choose a PDF up to 100 MiB.';return;}closeSurface();session.commit(await file.arrayBuffer(),file.name);synchronize();await refresh();openEditor();}
  $('open-document').onchange=()=>openDocument($('open-document').files[0]).catch(e=>status(e.message,true));
  $('open-another').onclick=()=>$('open-document').click();
  document.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();document.body.classList.add('dragging');}});
  document.addEventListener('dragleave',event=>{if(!event.relatedTarget)document.body.classList.remove('dragging');});
  document.addEventListener('drop',event=>{event.preventDefault();document.body.classList.remove('dragging');openDocument(event.dataTransfer?.files[0]).catch(e=>status(e.message,true));});
  window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('editor-frame').contentWindow)return;
    if(event.data?.type==='pdf-editor-dirty'){editorDirty=!!event.data.dirty;return;}
    if(event.data?.type==='pdf-editor-error'){downloadAfterSave=false;$('studio-status').textContent=event.data.message;return;}
    if(event.data?.type==='pdf-export-ready'&&event.data.blob instanceof Blob){if(event.data.revision!==session.current?.revision){status('The working document changed. Reopen extraction before exporting its results.',true);return;}if(exportUrl)URL.revokeObjectURL(exportUrl);$('workspace-export')?.remove();exportUrl=URL.createObjectURL(event.data.blob);const link=document.createElement('a');link.id='workspace-export';link.className='button';link.href=exportUrl;link.download=String(event.data.filename||'export.pdf').replace(/[^A-Za-z0-9._-]/g,'_');link.textContent=link.download.endsWith('.xlsx')?'Save extracted Excel':'Save extracted PDF';$('download-document').after(link);status('Extraction export ready. Use the Save extracted file link above the preview.');}
    if(event.data?.type==='pdf-editor-ready'&&session.current){event.source.postMessage({type:'pdf-editor-tool',mode:$('editor-frame').dataset.mode||'text'},location.origin);event.source.postMessage({type:'pdf-open',bytes:session.current.bytes.slice(),name:session.current.name,revision:session.current.revision},location.origin);}
    if(event.data?.type==='pdf-editor-result'&&event.data.bytes instanceof Uint8Array&&!api.busy()&&!running){if(event.data.revision!==session.current?.revision){status('The working document changed while the editor was open. Reopen the editor to avoid overwriting newer changes.',true);return;}editorDirty=false;session.commit(event.data.bytes,'edited-document.pdf');if(downloadAfterSave){downloadAfterSave=false;api.download(session.current.bytes,session.current.name);}event.source.postMessage({type:'pdf-editor-applied',revision:session.current.revision},location.origin);synchronize();refresh();status('Editor result returned to your workspace.');}
  });
  window.addEventListener('beforeunload',event=>{if(session.current){event.preventDefault();event.returnValue='';}});
  selected(configs.find(c=>c.id===$('tool').value)||configs[0]);savedMenu();renderSteps();
  return {refresh,selected,openEditor,canLeaveEditor};
}
