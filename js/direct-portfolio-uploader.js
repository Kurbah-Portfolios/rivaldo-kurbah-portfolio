(() => {
  'use strict';

  const REPO = 'Kurbah-Portfolios/rivaldo-kurbah-portfolio';
  const BRANCH = 'main';
  const OWNER_LOGIN = 'kurbahtech';
  const API = `https://api.github.com/repos/${REPO}`;
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
  const session = { token: '', user: null, repo: null, buttons: new Set() };

  const styles = `
    .rk-upload-overlay{position:fixed;inset:0;background:rgba(2,6,23,.88);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(5px)}
    .rk-upload-modal{width:min(720px,100%);max-height:92vh;overflow:auto;background:#0f172a;border:1px solid #334155;border-radius:18px;box-shadow:0 25px 70px rgba(0,0,0,.5);padding:26px;color:#f8fafc;font-family:inherit}
    .rk-upload-head{display:flex;justify-content:space-between;gap:18px;align-items:start;margin-bottom:18px}.rk-upload-head h2{margin:0;font-size:1.5rem;color:#38bdf8}.rk-upload-close{border:0;background:transparent;color:#94a3b8;font-size:1.7rem;cursor:pointer;line-height:1}
    .rk-upload-preview{background:#e5e7eb;border-radius:12px;padding:10px;margin:0 0 18px;display:flex;justify-content:center}.rk-upload-preview img{display:block;max-width:100%;max-height:260px;object-fit:contain;border-radius:7px}
    .rk-upload-filemeta{font-size:.82rem;color:#94a3b8;margin:-8px 0 18px;word-break:break-word}.rk-owner-badge{padding:10px 12px;margin-bottom:16px;border:1px solid #166534;background:#052e16;color:#bbf7d0;border-radius:9px;font-size:.82rem}
    .rk-upload-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.rk-upload-field{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}.rk-upload-field.full{grid-column:1/-1}.rk-upload-field label{font-size:.86rem;font-weight:600;color:#cbd5e1}.rk-upload-field input,.rk-upload-field textarea,.rk-upload-field select{width:100%;border:1px solid #475569;background:#111827;color:#f8fafc;border-radius:9px;padding:11px 12px;font:inherit;outline:none}.rk-upload-field textarea{min-height:88px;resize:vertical}.rk-upload-field input:focus,.rk-upload-field textarea:focus,.rk-upload-field select:focus{border-color:#38bdf8}
    .rk-upload-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.rk-upload-submit,.rk-upload-cancel{border:0;border-radius:9px;padding:12px 17px;font-weight:700;cursor:pointer;font:inherit}.rk-upload-submit{background:#38bdf8;color:#06121b}.rk-upload-submit:disabled{opacity:.55;cursor:not-allowed}.rk-upload-cancel{background:#1e293b;color:#e2e8f0}.rk-upload-status{margin-top:14px;padding:11px 13px;border-radius:9px;font-size:.86rem;display:none}.rk-upload-status.info{display:block;background:#172033;color:#bfdbfe}.rk-upload-status.success{display:block;background:#052e16;color:#bbf7d0;border:1px solid #166534}.rk-upload-status.error{display:block;background:#450a0a;color:#fecaca;border:1px solid #991b1b}
    @media(max-width:620px){.rk-upload-grid{grid-template-columns:1fr}.rk-upload-field.full{grid-column:auto}.rk-upload-modal{padding:20px}}
  `;

  function injectStyles() {
    if (document.getElementById('rk-direct-uploader-styles')) return;
    const style = document.createElement('style');
    style.id = 'rk-direct-uploader-styles';
    style.textContent = styles;
    document.head.appendChild(style);
  }

  function syncButtons() {
    const unlocked = !!session.token && !!session.user;
    session.buttons.forEach(button => {
      button.hidden = !unlocked;
      button.disabled = !unlocked;
      button.setAttribute('aria-hidden', unlocked ? 'false' : 'true');
    });
  }

  function slugify(value) {
    return String(value || 'item').toLowerCase().normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
  }

  function extensionFor(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) return ext;
    return ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type] || '';
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.readAsDataURL(file);
    });
  }

  function decodeBase64Utf8(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  async function apiFetch(url, token, options = {}) {
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try { const body = await response.json(); if (body && body.message) detail = body.message; } catch (_) {}
      throw new Error(detail);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function authenticate(token) {
    const clean = String(token || '').trim();
    if (!clean) throw new Error('Enter your GitHub token.');
    const user = await apiFetch('https://api.github.com/user', clean);
    if (!user || String(user.login || '').toLowerCase() !== OWNER_LOGIN) {
      throw new Error('Access denied. This token does not belong to the KurbahTech GitHub account.');
    }
    const repo = await apiFetch(API, clean);
    const permissions = repo && repo.permissions ? repo.permissions : {};
    if (!(permissions.admin || permissions.maintain || permissions.push)) {
      throw new Error('Access denied. This token does not have write access to the portfolio repository.');
    }
    session.token = clean;
    session.user = user;
    session.repo = repo;
    syncButtons();
    return { login: user.login, repo: repo.full_name, permissions };
  }

  function clearSession() {
    session.token = '';
    session.user = null;
    session.repo = null;
    syncButtons();
  }

  async function reverifySession() {
    if (!session.token) throw new Error('Owner authentication is required.');
    return authenticate(session.token);
  }

  async function putContent(path, content, token, message, sha) {
    const body = { message, content, branch: BRANCH };
    if (sha) body.sha = sha;
    return apiFetch(`${API}/contents/${path}`, token, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  }

  async function deleteContent(path, sha, token, message) {
    if (!sha) return;
    try {
      await apiFetch(`${API}/contents/${path}`, token, { method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message,sha,branch:BRANCH}) });
    } catch (_) {}
  }

  async function getManagedData(path, token) {
    const result = await apiFetch(`${API}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`, token);
    const data = JSON.parse(decodeBase64Utf8(result.content) || '[]');
    if (!Array.isArray(data)) throw new Error(`${path} is not a JSON array.`);
    return { data, sha: result.sha };
  }

  function field(label, name, type='input', options={}) {
    const wrap = document.createElement('div');
    wrap.className = `rk-upload-field${options.full ? ' full' : ''}`;
    const lab = document.createElement('label'); lab.htmlFor = `rk-${name}`; lab.textContent = label + (options.required ? ' *' : ''); wrap.appendChild(lab);
    let control;
    if (type === 'textarea') control = document.createElement('textarea');
    else if (type === 'select') {
      control = document.createElement('select');
      (options.choices || []).forEach(choice => { const opt=document.createElement('option'); opt.value=choice; opt.textContent=choice; control.appendChild(opt); });
    } else { control = document.createElement('input'); control.type = options.inputType || 'text'; }
    control.id = `rk-${name}`; control.name = name; control.placeholder = options.placeholder || ''; control.required = !!options.required;
    wrap.appendChild(control); return wrap;
  }

  function setStatus(el, type, text) { el.className = `rk-upload-status ${type}`; el.textContent = text; }

  function buildModal(mode, file, config) {
    if (!session.token || !session.user) { alert('Owner authentication is required. Open the private admin console first.'); return; }
    injectStyles();
    const overlay=document.createElement('div'); overlay.className='rk-upload-overlay'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true');
    const modal=document.createElement('div'); modal.className='rk-upload-modal';
    const head=document.createElement('div'); head.className='rk-upload-head';
    const title=document.createElement('h2'); title.textContent=mode==='certificate'?'Upload Certificate':'Upload Faith & Ministry Item';
    const close=document.createElement('button'); close.type='button'; close.className='rk-upload-close'; close.setAttribute('aria-label','Close uploader'); close.textContent='×'; head.append(title,close); modal.appendChild(head);
    const ownerBadge=document.createElement('div'); ownerBadge.className='rk-owner-badge'; ownerBadge.textContent=`Authenticated owner: ${session.user.login} • ${REPO}`; modal.appendChild(ownerBadge);
    const preview=document.createElement('div'); preview.className='rk-upload-preview'; const img=document.createElement('img'); const objectUrl=URL.createObjectURL(file); img.src=objectUrl; img.alt='Selected upload preview'; preview.appendChild(img); modal.appendChild(preview);
    const meta=document.createElement('div'); meta.className='rk-upload-filemeta'; meta.textContent=`${file.name} • ${(file.size/1024/1024).toFixed(2)} MB`; modal.appendChild(meta);
    const form=document.createElement('form'); const grid=document.createElement('div'); grid.className='rk-upload-grid';
    if (mode==='certificate') {
      grid.append(
        field('Heading / provider','heading','input',{required:true,placeholder:'Upgrad'}),
        field('Certificate / program name','program','input',{required:true,placeholder:'Generative AI Foundations Certificate Program'}),
        field('Description','description','textarea',{full:true,placeholder:'Short public description...'}),
        field('Certificate / verification URL','verify_url','input',{placeholder:'https://...'}),
        field('Want to Know More URL','learn_url','input',{placeholder:'https://...'}),
        field('Category','category','select',{full:true,choices:['Artificial Intelligence','Cybersecurity','Networking','Programming','Internship / Experience','Other']})
      );
    } else {
      grid.append(
        field('Item type','type','select',{full:true,choices:['Faith Formation / Credential','Catholic Poster / Event Design','Church / Youth Ministry Communication','Bible Convention / Prayer Meeting','Divine Mercy / Evangelisation','Faith-based Website / Digital Work']}),
        field('Title','title','input',{full:true,required:true,placeholder:'Certificate or ministry project title'}),
        field('Description','description','textarea',{full:true,placeholder:'Short public description...'}),
        field('Certificate / project URL','link','input',{placeholder:'https://...'}),
        field('Link label','link_label','input',{placeholder:'View certificate'})
      );
    }
    form.appendChild(grid);
    const actions=document.createElement('div'); actions.className='rk-upload-actions';
    const submit=document.createElement('button'); submit.type='submit'; submit.className='rk-upload-submit'; submit.textContent='Upload & Publish';
    const cancel=document.createElement('button'); cancel.type='button'; cancel.className='rk-upload-cancel'; cancel.textContent='Cancel'; actions.append(submit,cancel); form.appendChild(actions);
    const status=document.createElement('div'); status.className='rk-upload-status'; form.appendChild(status); modal.appendChild(form); overlay.appendChild(modal); document.body.appendChild(overlay);
    const cleanup=()=>{URL.revokeObjectURL(objectUrl); overlay.remove();}; close.addEventListener('click',cleanup); cancel.addEventListener('click',cleanup); overlay.addEventListener('click',e=>{if(e.target===overlay)cleanup();});

    form.addEventListener('submit', async e => {
      e.preventDefault(); submit.disabled=true; setStatus(status,'info','Re-verifying owner account and preparing upload…');
      const values=Object.fromEntries(new FormData(form).entries()); const token=session.token; let uploadedPath=''; let uploadedSha='';
      try {
        await reverifySession();
        const ext=extensionFor(file); if(!ext) throw new Error('Unsupported image format. Use JPG, PNG, WEBP or GIF.');
        const nameSeed=mode==='certificate'?values.heading:values.title; const timestamp=new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14);
        const folder=mode==='certificate'?'images/certificates/uploads':'images/faith-ministry/uploads'; uploadedPath=`${folder}/${timestamp}-${slugify(nameSeed)}.${ext}`;
        const base64=await fileToBase64(file); setStatus(status,'info','Uploading image to the portfolio repository…');
        const imageResult=await putContent(uploadedPath,base64,token,`Upload ${mode} image: ${nameSeed}`); uploadedSha=imageResult&&imageResult.content&&imageResult.content.sha;
        const dataPath=mode==='certificate'?'data/certificates-managed.json':'data/faith-managed.json'; const managed=await getManagedData(dataPath,token); const addedAt=new Date().toISOString();
        const record=mode==='certificate' ? {
          id:`certificate-${Date.now()}`, heading:String(values.heading||'').trim(), program:String(values.program||'').trim(), description:String(values.description||'').trim(), image:uploadedPath,
          verify_url:String(values.verify_url||'').trim(), learn_url:String(values.learn_url||'').trim(), category:String(values.category||'').trim(), added_at:addedAt
        } : {
          id:`faith-${Date.now()}`, type:String(values.type||'').trim(), title:String(values.title||'').trim(), description:String(values.description||'').trim(), image:uploadedPath,
          link:String(values.link||'').trim(), link_label:String(values.link_label||'').trim(), added_at:addedAt
        };
        managed.data.unshift(record); const jsonBase64=encodeBase64Utf8(JSON.stringify(managed.data,null,2)+'\n');
        setStatus(status,'info','Publishing metadata…'); await putContent(dataPath,jsonBase64,token,`Publish ${mode}: ${nameSeed}`,managed.sha);
        setStatus(status,'success','Published successfully. GitHub Pages may take a short time to refresh.'); submit.textContent='Published';
        if(typeof config.onSuccess==='function') config.onSuccess(record);
      } catch(err) {
        if(uploadedPath&&uploadedSha) await deleteContent(uploadedPath,uploadedSha,token,`Rollback failed ${mode} upload`);
        if(/Access denied|Bad credentials|authentication/i.test(String(err.message||err))) clearSession();
        setStatus(status,'error',`Upload failed: ${err.message||err}`); submit.disabled=false;
      }
    });
  }

  function openPicker(mode, config={}) {
    if (!session.token || !session.user) { alert('Owner authentication is required. Open /admin/ and unlock the uploader first.'); return; }
    const input=document.createElement('input'); input.type='file'; input.accept='image/jpeg,image/png,image/webp,image/gif'; input.hidden=true; document.body.appendChild(input);
    input.addEventListener('change',()=>{const file=input.files&&input.files[0]; input.remove(); if(!file)return; if(file.size>MAX_FILE_BYTES){alert('The selected image is larger than 8 MB. Please use a smaller image.');return;} if(!extensionFor(file)){alert('Unsupported image format. Please use JPG, PNG, WEBP or GIF.');return;} buildModal(mode,file,config);},{once:true});
    input.click();
  }

  window.addEventListener('pagehide', clearSession);
  window.addEventListener('beforeunload', clearSession);

  window.RKDirectUploader = {
    async authenticate(token) { return authenticate(token); },
    clearSession,
    isAuthenticated() { return !!session.token && !!session.user; },
    getIdentity() { return session.user ? {login:session.user.login, repo:session.repo&&session.repo.full_name} : null; },
    attach(buttonOrSelector,mode,config={}) {
      const button=typeof buttonOrSelector==='string'?document.querySelector(buttonOrSelector):buttonOrSelector;
      if(!button)return; session.buttons.add(button); button.hidden=true; button.disabled=true; button.setAttribute('aria-hidden','true');
      button.addEventListener('click',e=>{e.preventDefault(); if(!session.token){alert('Owner authentication is required.');return;} openPicker(mode,config);}); syncButtons();
    },
    open(mode,config={}) { openPicker(mode,config); }
  };
})();