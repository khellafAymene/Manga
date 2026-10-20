const SUPABASE_URL = 'https://jtzbdqoxdxeujnoprzeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fLvKn_44XpI9d7Jy3Gv19g_SZo82b3v';
const BUCKET = 'images';
const MAX_INPUT = 15 * 1024 * 1024;
const MAX_DIM = 800;
const QUALITY = 0.82;

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtCh = n => String(Number(n) || 0);

let items = [];
let loaded = false;
let isAdmin = false;
let editingId = null;
let pickRating = 0;

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2500);
}

async function copyText(text) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t);
    t.select();
    try { ok = document.execCommand('copy'); } catch {}
    t.remove();
  }
  toast(ok ? 'تم نسخ الاسم 📋' : 'تعذّر النسخ');
}

const starsHTML = n => Array.from({ length: 10 }, (_, i) => `<span class="${i < n ? 'on' : ''}">★</span>`).join('');

function showSkeleton() {
  $('stats').innerHTML = '<div class="stat-sk"></div>';
  $('list').innerHTML = Array.from({ length: 8 }, () => `
    <article class="card sk">
      <div class="cover"></div>
      <div class="info"><div class="line w70"></div><div class="line w50"></div><div class="line w40"></div></div>
    </article>`).join('');
}

function setAuth(session) {
  isAdmin = !!session;
  $('addBtn').hidden = !isAdmin;
  $('authBtn').textContent = isAdmin ? 'خروج' : '🔑 دخول';
  render();
}

async function load() {
  const { data, error } = await db.from('manga').select('*');
  if (error) { $('list').innerHTML = ''; return toast('خطأ: ' + error.message); }
  items = data;
  loaded = true;
  render();
}

function render() {
  if (!loaded) return;
  const q = $('search').value.trim().toLowerCase();
  const sort = $('sort').value;
  const rows = items.filter(m => m.title.toLowerCase().includes(q));
  rows.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, 'ar')
    : sort === 'chapter' ? Number(b.chapter) - Number(a.chapter)
    : sort === 'rating' ? (b.rating || 0) - (a.rating || 0)
    : new Date(b.updated_at) - new Date(a.updated_at));

  $('stats').innerHTML = `<div class="stat"><b>${items.length}</b><span>عدد المانجا</span></div>`;

  $('empty').hidden = rows.length > 0;
  $('list').innerHTML = rows.map(m => `
    <article class="card" data-id="${m.id}">
      ${isAdmin ? '<button class="btn gear" data-act="edit" title="تعديل" aria-label="تعديل">⚙️</button>' : ''}
      ${m.cover_url
        ? `<img class="cover" data-act="view" tabindex="0" role="button" src="${esc(m.cover_url)}" alt="${esc(m.title)}" title="اضغط لعرض التفاصيل" loading="lazy">`
        : '<div class="cover" data-act="view" tabindex="0" role="button" title="اضغط لعرض التفاصيل">📕</div>'}
      <div class="info">
        <h3 class="copyable" data-act="copy" title="اضغط لنسخ الاسم">${esc(m.title)}</h3>
        ${m.rating > 0 ? `<div class="stars">${starsHTML(m.rating)}</div><div class="score">${m.rating}/10</div>` : '<div class="score">بدون تقييم</div>'}
        <div class="chapter">وصلت إلى فصل <b>${fmtCh(m.chapter)}</b></div>
      </div>
    </article>`).join('');
}

function openDetail(m) {
  $('dBody').innerHTML = `
    ${m.cover_url ? `<img class="d-cover" src="${esc(m.cover_url)}" alt="${esc(m.title)}">` : '<div class="d-cover d-ph">📕</div>'}
    <div class="d-title copyable" data-copy="${esc(m.title)}" title="اضغط لنسخ الاسم">${esc(m.title)}</div>
    <div class="d-meta">
      ${m.rating > 0 ? `<div class="stars">${starsHTML(m.rating)}</div><div class="score">${m.rating}/10</div>` : '<div class="score">بدون تقييم</div>'}
      <div class="chapter">وصلت إلى فصل <b>${fmtCh(m.chapter)}</b></div>
    </div>
    <div class="d-h">القصة</div>
    ${m.notes ? `<div class="d-story">${esc(m.notes)}</div>` : '<div class="d-none">لم تُكتب قصة لهذه المانجا بعد.</div>'}`;
  $('dBody').scrollTop = 0;
  $('detailDlg').showModal();
}

function storagePath(url) {
  const i = url ? url.indexOf(`/${BUCKET}/`) : -1;
  return i < 0 ? null : decodeURIComponent(url.slice(i + BUCKET.length + 2));
}

async function remove() {
  const m = items.find(x => x.id === editingId);
  if (!m || !confirm(`حذف "${m.title}" نهائيًا؟`)) return;
  const { data, error } = await db.from('manga').delete().eq('id', m.id).select();
  if (error) return toast(error.message);
  if (!data.length) return toast('لم يُحذف شيء، تحقق من تسجيل الدخول والسياسات');
  const p = storagePath(m.cover_url);
  if (p) db.storage.from(BUCKET).remove([p]);
  $('dlg').close();
  items = items.filter(x => x.id !== m.id);
  render();
  toast('تم الحذف');
}

async function compress(file) {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { return file; }
  const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const toBlob = type => new Promise(r => canvas.toBlob(r, type, QUALITY));
  let blob = await toBlob('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
  return blob && blob.size < file.size ? blob : file;
}

async function uploadCover(file) {
  if (file.size > MAX_INPUT) throw new Error('الصورة كبيرة جدًا (الحد 15MB)');
  const blob = await compress(file);
  const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
  if (error) throw new Error('فشل رفع الصورة: ' + error.message);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function setRating(n) {
  pickRating = n;
  $('stars').innerHTML = starsHTML(n);
  [...$('stars').children].forEach((el, i) => el.dataset.v = i + 1);
  $('ratingText').textContent = n ? `(${n}/10)` : '(بدون)';
}

function openDialog(m) {
  if (!isAdmin) return;
  editingId = m ? m.id : null;
  $('dlgTitle').textContent = m ? 'تعديل المانجا' : 'إضافة مانجا';
  $('fTitle').value = m ? m.title : '';
  $('fChapter').value = m ? fmtCh(m.chapter) : 0;
  $('fNotes').value = m ? (m.notes || '') : '';
  $('fCover').value = '';
  $('delBtn').hidden = !m;
  setRating(m ? (m.rating || 0) : 0);
  $('dlg').showModal();
}

$('stars').onclick = e => {
  const s = e.target.closest('[data-v]');
  if (!s) return;
  const v = +s.dataset.v;
  setRating(v === pickRating ? 0 : v);
};
$('addBtn').onclick = () => openDialog(null);
$('cancel').onclick = () => $('dlg').close();
$('delBtn').onclick = remove;
$('search').oninput = render;
$('sort').onchange = render;

function handleCardAction(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const m = items.find(x => x.id === +b.closest('.card').dataset.id);
  if (!m) return;
  if (b.dataset.act === 'edit') openDialog(m);
  else if (b.dataset.act === 'view') openDetail(m);
  else if (b.dataset.act === 'copy') copyText(m.title);
}
$('list').onclick = handleCardAction;
$('list').onkeydown = e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.act === 'view') {
    e.preventDefault();
    handleCardAction(e);
  }
};

$('dBody').onclick = e => {
  const t = e.target.closest('[data-copy]');
  if (t) copyText(t.dataset.copy);
};
$('dClose').onclick = () => $('detailDlg').close();
$('detailDlg').onclick = e => { if (e.target === $('detailDlg')) $('detailDlg').close(); };

$('authBtn').onclick = async () => {
  if (isAdmin) {
    await db.auth.signOut();
    toast('تم تسجيل الخروج');
  } else {
    $('loginForm').reset();
    $('loginDlg').showModal();
  }
};
$('lCancel').onclick = () => $('loginDlg').close();

$('loginForm').onsubmit = async e => {
  e.preventDefault();
  const btn = $('lSubmit');
  btn.disabled = true;
  const { error } = await db.auth.signInWithPassword({ email: $('lEmail').value.trim(), password: $('lPass').value });
  btn.disabled = false;
  if (error) return toast('فشل الدخول: ' + error.message);
  $('loginDlg').close();
  toast('أهلًا بك 👋');
};

$('form').onsubmit = async e => {
  e.preventDefault();
  const btn = $('save');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ...';
  try {
    const chapter = Math.max(0, Math.round((parseFloat($('fChapter').value) || 0) * 10) / 10);
    const row = {
      title: $('fTitle').value.trim(),
      chapter,
      rating: pickRating,
      notes: $('fNotes').value.trim() || null,
      updated_at: new Date().toISOString()
    };
    const file = $('fCover').files[0];
    const old = editingId ? items.find(x => x.id === editingId) : null;
    if (file) row.cover_url = await uploadCover(file);

    const q = editingId ? db.from('manga').update(row).eq('id', editingId).select() : db.from('manga').insert(row).select();
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data.length) throw new Error('لم يُحفظ شيء، تحقق من تسجيل الدخول والسياسات');

    if (file && old) {
      const p = storagePath(old.cover_url);
      if (p) db.storage.from(BUCKET).remove([p]);
    }
    $('dlg').close();
    toast('تم الحفظ ✅');
    load();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'حفظ';
  }
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

showSkeleton();
db.auth.onAuthStateChange((_event, session) => setAuth(session));
load();
