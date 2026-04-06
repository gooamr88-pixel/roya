// ═══════════════════════════════════════════════
// Admin V2.0 — Properties CRUD + Featured + Bulk + Live Preview
// Depends on: api.js, utils.js, admin.init.js (selectedProp)
// ═══════════════════════════════════════════════

async function loadAdminProperties(page = 1) {
    try {
        const data = await API.get(`/properties?page=${page}&limit=20`);
        const props = data.data.properties;
        const tbody = document.getElementById('adminPropertiesTable');
        selectedProp.clear();
        updateBulkInfo('prop');

        if (props.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px;color:var(--text-muted)">No properties yet</td></tr>';
        } else {
            tbody.innerHTML = props.map(p => `
                <tr>
                    <td><input type="checkbox" class="prop-checkbox" value="${p.id}" onchange="toggleBulkSelect('prop', '${p.id}', this.checked)"></td>
                    <td data-label="Title" style="font-weight:600">${esc(p.title)}</td>
                    <td data-label="Location">${esc(p.location || '—')}</td>
                    <td data-label="Price">${Utils.formatCurrency(p.price)}</td>
                    <td data-label="Type">${esc(p.property_type)}</td>
                    <td data-label="Featured">
                        <i class="fas fa-star featured-star ${p.is_featured ? 'active' : 'inactive'}" 
                           onclick="toggleFeatured('properties', '${p.id}', ${!p.is_featured})" 
                           title="${p.is_featured ? 'Remove from featured' : 'Add to featured'}"></i>
                    </td>
                    <td data-label="Status"><span class="badge badge-${p.is_active !== false ? 'success' : 'danger'}">${p.is_active !== false ? 'Active' : 'Inactive'}</span></td>
                    <td data-label="Actions">
                        <button class="btn btn-ghost btn-sm" onclick="editProperty(${p.id})" data-tooltip="Edit"><i class="fas fa-edit"></i></button>
                        ${hasMinRole('admin') ? `<button class="btn btn-ghost btn-sm" onclick="deleteProperty(${p.id})" data-tooltip="Deactivate"><i class="fas fa-trash" style="color:var(--danger)"></i></button>` : ''}
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { Toast.error(__t?.failedLoad || 'Failed to load properties.'); }
}

// ── Live Preview ──
function updatePropertyPreview() {
    const preview = document.getElementById('propLivePreview');
    if (!preview) return;
    const title = document.getElementById('propTitle').value || 'Property Title';
    const desc = document.getElementById('propDescription').value || 'Description will appear here...';
    const price = parseFloat(document.getElementById('propPrice').value) || 0;
    preview.innerHTML = `
        <strong style="font-size:1.05rem">${esc(title)}</strong>
        <p style="color:var(--text-muted);margin:6px 0;font-size:0.85rem">${esc(desc)}</p>
        <span style="background:var(--accent-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;font-size:1.1rem">${Utils.formatCurrency(price)}</span>
    `;
}

let propertyDropFiles = [];

function openPropertyModal(editData = null) {
    const modal = document.getElementById('propertyModal');
    const form = document.getElementById('propertyForm');
    document.getElementById('propertyModalTitle').textContent = editData ? 'Edit Property' : 'Add New Property';
    form.reset();
    propertyDropFiles = [];
    document.getElementById('propEditId').value = editData ? editData.id : '';
    document.getElementById('propPreviewGrid').innerHTML = '';

    if (editData) {
        document.getElementById('propTitle').value = editData.title || '';
        document.getElementById('propDescription').value = editData.description || '';
        document.getElementById('propPrice').value = editData.price || '';
        document.getElementById('propLocation').value = editData.location || '';
        document.getElementById('propArea').value = editData.area_sqm || '';
        document.getElementById('propBedrooms').value = editData.bedrooms || '';
        document.getElementById('propBathrooms').value = editData.bathrooms || '';
        document.getElementById('propType').value = editData.property_type || 'residential';
        document.getElementById('propActive').checked = editData.is_active !== false;

        const images = Array.isArray(editData.images) ? editData.images : (typeof editData.images === 'string' ? (() => { try { return JSON.parse(editData.images); } catch { return []; } })() : []);
        if (images.length > 0) renderPropertyPreviews(images);
    }
    switchFormTab('propTabGeneral', 'propertyForm');
    modal.classList.add('show');
    modal.style.display = 'flex';
}
function closePropertyModal() {
    const modal = document.getElementById('propertyModal');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
    propertyDropFiles = [];
}

function initPropertyDropZone() {
    const zone = document.getElementById('propDropZone');
    const input = document.getElementById('propImagesInput');
    if (!zone || !input) return;

    ['dragenter', 'dragover'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(e => zone.addEventListener(e, () => zone.classList.remove('drag-over')));
    zone.addEventListener('drop', ev => { ev.preventDefault(); handlePropertyFiles(ev.dataTransfer.files); });
    input.addEventListener('change', () => handlePropertyFiles(input.files));
}

function handlePropertyFiles(files) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    Array.from(files).forEach(file => {
        if (!allowed.includes(file.type)) return;
        propertyDropFiles.push(file);
        const reader = new FileReader();
        reader.onload = (e) => renderPropertyPreviews([e.target.result]);
        reader.readAsDataURL(file);
    });
}

function renderPropertyPreviews(sources) {
    const grid = document.getElementById('propPreviewGrid');
    if (!grid) return;
    sources.forEach((src) => {
        const thumb = document.createElement('div');
        thumb.className = 'img-thumb';
        thumb.innerHTML = `<img src="${esc(src)}" alt="preview"><button class="img-thumb-remove" onclick="this.parentNode.remove()" type="button"><i class="fas fa-times"></i></button>`;
        grid.appendChild(thumb);
    });
}

async function saveAdminProperty(e) {
    e.preventDefault();
    const btn = document.getElementById('propSubmitBtn');
    const editId = document.getElementById('propEditId').value;

    // Validate required fields on the frontend first
    const title = document.getElementById('propTitle').value.trim();
    if (!title) {
        Toast.error(__t?.titleRequired || 'Title is required.');
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', document.getElementById('propDescription').value.trim());
    formData.append('price', document.getElementById('propPrice').value || '0');
    formData.append('location', document.getElementById('propLocation').value.trim());
    formData.append('area_sqm', document.getElementById('propArea').value);
    formData.append('bedrooms', document.getElementById('propBedrooms').value);
    formData.append('bathrooms', document.getElementById('propBathrooms').value);
    formData.append('property_type', document.getElementById('propType').value);
    // B2 Fix: FormData converts booleans to strings — use '1'/'0' and parse on backend
    formData.append('is_active', document.getElementById('propActive').checked ? '1' : '0');

    propertyDropFiles.forEach(file => formData.append('images', file));

    setLoading(btn, true, 'Saving...');
    try {
        if (editId) {
            await API.putForm(`/properties/${editId}`, formData);
            Toast.success(__t?.propertyUpdated || 'Property updated!');
        } else {
            await API.postForm('/properties', formData);
            Toast.success(__t?.propertyCreated || 'Property created!');
        }
        closePropertyModal();
        loadAdminProperties();
    } catch (err) {
        Toast.error(err.message || (__t?.failedSave || 'Failed to save property.'));
    } finally {
        setLoading(btn, false);
    }
}

async function editProperty(id) {
    try { const data = await API.get(`/properties/${id}`); openPropertyModal(data.data.property); }
    catch (err) { Toast.error(err.message); }
}
async function deleteProperty(id) {
    const confirmed = await glassConfirm(__t?.deactivateProperty || 'Deactivate Property', __t?.confirmDeactivate || 'Are you sure you want to deactivate this property?', 'danger');
    if (!confirmed) return;
    try { await API.delete(`/properties/${id}`); Toast.success(__t?.propertyDeactivated || 'Property deactivated.'); loadAdminProperties(); }
    catch (err) { Toast.error(err.message); }
}

document.addEventListener('DOMContentLoaded', initPropertyDropZone);
// FIX (F4): Shared utilities (toggleFeatured, toggleBulkSelect,
// toggleAllCheckboxes, updateBulkInfo, bulkDelete) have been moved
// to admin.init.js so they are available to all admin modules.
