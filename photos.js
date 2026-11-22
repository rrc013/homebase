// Photo frame: family photos uploaded from your phones, shown as the hub screensaver
import { S, esc, me, household, toast, run, openSheet, resizeImage, actions, hooks } from './core.js';

const BUCKET = 'family-photos';

export async function signFamilyPhotos() {
  const missing = S.data.photos.map((p) => p.path).filter((p) => p && !S.photoUrls[p]);
  if (missing.length) Object.assign(S.photoUrls, await S.api.photoUrls(missing, BUCKET).catch(() => ({})));
}
export const photoUrlList = () => S.data.photos.map((p) => S.photoUrls[p.path]).filter(Boolean);

export function photosSettingsHtml() {
  const photos = [...S.data.photos].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const show = photos.slice(0, S.showAllPhotos ? photos.length : 11);
  return `
    <div class="row between"><h3 class="section">Photo frame <small>(${photos.length})</small></h3>
      <button class="link" data-act="photos-add">＋ Add photos</button></div>
    <div class="card">
      <input type="file" id="photos-file" accept="image/*" multiple hidden>
      ${photos.length ? `<div class="photo-grid">
        ${show.map((p) => `<button class="pg-item" data-act="photo-open" data-id="${p.id}">${S.photoUrls[p.path] ? `<img src="${esc(S.photoUrls[p.path])}" alt="" loading="lazy">` : '🖼️'}</button>`).join('')}
        ${photos.length > show.length ? `<button class="pg-item more" data-act="photos-all">+${photos.length - show.length}</button>` : ''}
      </div>` : '<p class="muted small">Add family photos and the hub turns into a photo frame when nobody is using it.</p>'}
    </div>`;
}

async function uploadFiles(files) {
  const list = [...files];
  let done = 0;
  for (const file of list) {
    toast(`Uploading ${done + 1} of ${list.length}…`, 60000);
    const ok = await run(async () => {
      const blob = await resizeImage(file, 1920);
      const path = await S.api.uploadPhoto(household().id, blob, BUCKET);
      await S.api.insert('photos', { household_id: household().id, path, uploaded_by: me().id });
      return true;
    });
    if (ok) done++;
  }
  toast(`Added ${done} photo${done === 1 ? '' : 's'} 🎉`);
  await hooks.loadAll(); hooks.render();
}

Object.assign(actions, {
  'photos-add': () => {
    const input = document.getElementById('photos-file');
    input.onchange = () => { if (input.files.length) uploadFiles(input.files); };
    input.click();
  },
  'photos-all': () => { S.showAllPhotos = true; hooks.render(); },
  'photo-open': (el) => {
    const p = S.data.photos.find((x) => x.id === el.dataset.id);
    openSheet(`
      <div class="photo-box tall"><img src="${esc(S.photoUrls[p.path] || '')}" alt=""></div>
      <div class="row between">
        <button class="btn danger ghost" type="submit" value="delete">Delete photo</button>
        <button class="btn ghost" type="button" data-act="sheet-close">Close</button>
      </div>`, async (_f, action) => {
      if (action !== 'delete' || !confirm('Delete this photo from the frame?')) return false;
      await run(() => S.api.remove('photos', p.id), 'Deleted');
      S.api.deletePhoto(p.path, BUCKET).catch(() => {});
    });
  },
});
