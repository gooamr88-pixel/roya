// ═══════════════════════════════════════════════
// Admin V2.0 — Exhibitions Full CRUD
// Depends on: api.js, utils.js, admin.init.js
// ═══════════════════════════════════════════════

let editingExhibitionId = null;
let exhibitionDropFiles = [];

// In-memory cache of loaded exhibitions (keyed by id) for safe edit lookup.
// B5 Fix: Previously openExhibitionModal() was called inline via
// onclick="openExhibitionModal(${JSON.stringify(e)})" which breaks on
// apostrophes/quotes in title or location. We now use data-id and lookup here.
const _exhibitionCache = {};

// ══════════════════════════════════════════
//  LOAD & DISPLAY
// ══════════════════════════════════════════
async function loadAdminExhibitions() {
    try {
        // B4 Fix: The public GET /exhibitions only returns is_active = TRUE records.
        // Admin must see ALL items (active and inactive), so we pass showAll=true.
        const data = await API.get('/exhibitions?limit=100&showAll=true');
        const items = data.data.exhibitions;
        const container = document.getElementById('adminExhibitionsGrid');
        if (!container) return;

        // Refresh cache
        Object.keys(_exhibitionCache).forEach(k => delete _exhibitionCache[k]);
        items.forEach(e => { _exhibitionCache[e.id] = e; });

        if (items.length === 0) {
            container.innerHTML = `
                <div style="grid-column:1/-1;padding:60px;text-align:center;color:var(--text-3)">
                    <i class="fas fa-calendar-alt" style="font-size:2.5rem;display:block;margin-bottom:12px;opacity:0.4"></i>
                    No exhibitions yet. Click "Add Exhibition" to create one.
                </div>`;
        } else {
            container.innerHTML = items.map(e => {
                const images = Array.isArray(e.images)
                    ? e.images
                    : (typeof e.images === 'string' ? (() => { try { return JSON.parse(e.images); } catch { return []; } })() : []);
                const thumb = images[0] || '';
                // B5 Fix: Use data-id attribute instead of inline JSON.stringify in onclick.
                // This avoids JS parse errors when title/location contains apostrophes or quotes.
                return `
                <div class="exhibition-admin-card">
                    <div class="exhibition-admin-thumb">
                        ${thumb ? `<img src="${esc(thumb)}" alt="${esc(e.title)}">` : '<i class="fas fa-calendar-alt"></i>'}
                    </div>
                    <div class="exhibition-admin-body">
                        <div class="exhibition-admin-title">${esc(e.title)}</div>
                        <div class="exhibition-admin-meta">
                            ${e.location ? `<span><i class="fas fa-map-marker-alt" style="margin-right:4px"></i>${esc(e.location)}</span>` : ''}
                            ${e.start_date ? `<span><i class="fas fa-calendar" style="margin-right:4px"></i>${Utils.formatDate(e.start_date)}</span>` : ''}
                            <span><i class="fas fa-circle" style="color:${e.is_active ? '#10b981' : '#ef4444'};font-size:0.5rem;margin-right:4px"></i>${e.is_active ? 'Active' : 'Inactive'}</span>
                        </div>
                    </div>
                    <div class="exhibition-admin-actions">
                        <button class="btn btn-ghost btn-sm" data-edit-exhibition="${e.id}">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteExhibition(${e.id}, '${esc(e.title).replace(/'/g, "\\'")}')">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </div>
                </div>`;
            }).join('');

            // B5 Fix: Attach click handlers after render using data-edit-exhibition attribute
            container.querySelectorAll('[data-edit-exhibition]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = parseInt(btn.dataset.editExhibition);
                    const exhibition = _exhibitionCache[id];
                    if (exhibition) openExhibitionModal(exhibition);
                    else Toast.error('Could not load exhibition data.');
                });
            });
        }
    } catch (err) {
        Toast.error('Failed to load exhibitions.');
        console.error('[admin.exhibitions] loadAdminExhibitions error:', err);
    }
}

// ══════════════════════════════════════════
//  MODAL OPEN / CLOSE
// ══════════════════════════════════════════
function openExhibitionModal(exhibition = null) {
    editingExhibitionId = exhibition ? exhibition.id : null;
    exhibitionDropFiles = [];

    const modal = document.getElementById('exhibitionModal');
    const title = document.getElementById('exhibitionModalTitle');
    if (!modal) return;

    title.textContent = exhibition ? 'Edit Exhibition' : 'Add Exhibition';

    // Reset form
    document.getElementById('exhibitionForm').reset();
    document.getElementById('exhibitionPreviewGrid').innerHTML = '';

    // Populate if editing
    if (exhibition) {
        document.getElementById('exhTitle').value      = exhibition.title       || '';
        document.getElementById('exhLocation').value  = exhibition.location     || '';
        document.getElementById('exhStartDate').value = exhibition.start_date ? exhibition.start_date.split('T')[0] : '';
        document.getElementById('exhEndDate').value   = exhibition.end_date   ? exhibition.end_date.split('T')[0]   : '';
        document.getElementById('exhDesc').value      = exhibition.description  || '';
        document.getElementById('exhActive').checked  = exhibition.is_active !== false;

        // Show existing images
        const images = Array.isArray(exhibition.images)
            ? exhibition.images
            : (typeof exhibition.images === 'string' ? (() => { try { return JSON.parse(exhibition.images); } catch { return []; } })() : []);
        if (images.length > 0) renderExhibitionPreviews(images, true);
    }

    switchFormTab('exhTabGeneral', 'exhibitionForm');
    modal.classList.add('show');
    modal.style.display = 'flex';
}

function closeExhibitionModal() {
    const modal = document.getElementById('exhibitionModal');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
    editingExhibitionId = null;
    exhibitionDropFiles = [];
}

// ══════════════════════════════════════════
//  DROP ZONE SETUP
// ══════════════════════════════════════════
function initExhibitionDropZone() {
    const zone  = document.getElementById('exhDropZone');
    const input = document.getElementById('exhImagesInput');
    if (!zone || !input) return;

    ['dragenter', 'dragover'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(e => zone.addEventListener(e, () => zone.classList.remove('drag-over')));
    zone.addEventListener('drop', ev => { ev.preventDefault(); handleExhibitionFiles(ev.dataTransfer.files); });
    input.addEventListener('change', () => handleExhibitionFiles(input.files));
}

function handleExhibitionFiles(files) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    Array.from(files).forEach(file => {
        if (!allowed.includes(file.type)) return;
        exhibitionDropFiles.push(file);
        const reader = new FileReader();
        reader.onload = (e) => renderExhibitionPreviews([e.target.result], false);
        reader.readAsDataURL(file);
    });
}

function renderExhibitionPreviews(sources, isUrl) {
    const grid = document.getElementById('exhibitionPreviewGrid');
    if (!grid) return;
    sources.forEach((src) => {
        const thumb = document.createElement('div');
        thumb.className = 'img-thumb';
        thumb.innerHTML = `<img src="${src}" alt="preview"><button class="img-thumb-remove" onclick="this.parentNode.remove()" type="button"><i class="fas fa-times"></i></button>`;
        grid.appendChild(thumb);
    });
}

// ══════════════════════════════════════════
//  SAVE (Create or Update)
// ══════════════════════════════════════════
async function saveExhibition(e) {
    e.preventDefault();
    const btn = document.getElementById('saveExhibitionBtn');

    // Validate required fields on the frontend first
    const title = document.getElementById('exhTitle').value.trim();
    if (!title) {
        Toast.error('Title is required.');
        return;
    }

    setLoading(btn, true, 'Saving...');
    try {
        const formData = new FormData();
        formData.append('title',       title);
        formData.append('location',    document.getElementById('exhLocation').value.trim());
        formData.append('start_date',  document.getElementById('exhStartDate').value);
        formData.append('end_date',    document.getElementById('exhEndDate').value);
        formData.append('description', document.getElementById('exhDesc').value.trim());
        // B2 Fix: FormData converts booleans to strings — use '1'/'0' and parse on backend
        formData.append('is_active',   document.getElementById('exhActive').checked ? '1' : '0');
        exhibitionDropFiles.forEach(file => formData.append('images', file));

        if (editingExhibitionId) {
            await API.putForm(`/exhibitions/${editingExhibitionId}`, formData);
            Toast.success('Exhibition updated!');
        } else {
            await API.postForm('/exhibitions', formData);
            Toast.success('Exhibition created!');
        }
        closeExhibitionModal();
        loadAdminExhibitions();
    } catch (err) {
        Toast.error(err.message || 'Failed to save exhibition.');
        console.error('[admin.exhibitions] saveExhibition error:', err);
    } finally {
        setLoading(btn, false);
    }
}

// ══════════════════════════════════════════
//  DELETE
// ══════════════════════════════════════════
async function deleteExhibition(id, title) {
    const ok = await glassConfirm('Delete Exhibition', `Delete "${title}"? This cannot be undone.`, 'danger');
    if (!ok) return;
    try {
        await API.delete(`/exhibitions/${id}`);
        Toast.success('Exhibition deleted.');
        loadAdminExhibitions();
    } catch (err) {
        Toast.error(err.message || 'Failed to delete exhibition.');
    }
}

// Init drop zone when DOM ready
document.addEventListener('DOMContentLoaded', initExhibitionDropZone);
