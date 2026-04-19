// ═══════════════════════════════════════════════
// Admin V2.0 — Services CRUD + Live Preview + Featured + Bulk
// Depends on: api.js, utils.js, admin.init.js (selectedSvc)
// ═══════════════════════════════════════════════

// ── Price Type Toggle ──
function setSvcPriceType(type) {
    document.getElementById('svcPriceType').value = type;
    const fixedBtn = document.getElementById('svcPriceTypeFixed');
    const rangeBtn = document.getElementById('svcPriceTypeRange');
    const maxGroup = document.getElementById('svcPriceMaxGroup');
    const priceLabel = document.getElementById('svcPriceLabel');
    if (type === 'range') {
        fixedBtn.classList.remove('active');
        rangeBtn.classList.add('active');
        if (maxGroup) maxGroup.style.display = '';
        if (priceLabel) priceLabel.innerHTML = (__t?.priceMin || 'الحد الأدنى / Min Price') + ' <span class="help-tooltip">?<span class="tooltip-text">' + (__t?.tooltipPriceMin || 'The starting price in the range') + '</span></span>';
    } else {
        rangeBtn.classList.remove('active');
        fixedBtn.classList.add('active');
        if (maxGroup) maxGroup.style.display = 'none';
        if (priceLabel) priceLabel.innerHTML = (__t?.thPrice || 'السعر / Price') + ' <span class="help-tooltip">?<span class="tooltip-text">' + (__t?.tooltipServicePrice || 'Set the base price for this service.') + '</span></span>';
    }
    updateServicePreview();
}

// ── Shared helper: format service price (fixed or range) ──
function _fmtSvcPrice(s) {
    const cur = s.currency || 'SAR';
    if (s.price_type === 'range' && s.price_max) {
        return `${Utils.formatCurrency(s.price, cur)} – ${Utils.formatCurrency(s.price_max, cur)}`;
    }
    return Utils.formatCurrency(s.price, cur);
}

async function loadAdminServices(page = 1) {
    try {
        const data = await API.get(`/services?page=${page}&limit=20`);
        const services = data.data.services;
        const tbody = document.getElementById('adminServicesTable');
        selectedSvc.clear();
        updateBulkInfo('svc');

        if (services.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:40px;color:var(--text-muted)">${__t?.noServicesYet || 'No services yet'}</td></tr>`;
        } else {
            tbody.innerHTML = services.map(s => `
                <tr>
                    <td><input type="checkbox" class="svc-checkbox" value="${s.id}" onchange="toggleBulkSelect('svc', '${s.id}', this.checked)"></td>
                    <td data-label="Title" style="font-weight:600">${esc(document.documentElement.lang === 'ar' && s.title_ar ? s.title_ar : s.title)}</td>
                    <td data-label="Price">${_fmtSvcPrice(s)}</td>
                    <td data-label="Featured">
                        <i class="fas fa-star featured-star ${s.is_featured ? 'active' : 'inactive'}" 
                           onclick="toggleFeatured('services', '${s.id}', ${!s.is_featured})" 
                           title="${s.is_featured ? (__t?.removedFeatured || 'Remove from featured') : (__t?.markedFeatured || 'Add to featured')}"></i>
                    </td>
                    <td data-label="Status"><span class="badge badge-${s.is_active !== false ? 'success' : 'danger'}">${s.is_active !== false ? (__t?.activeStatus || 'Active') : (__t?.inactiveStatus || 'Inactive')}</span></td>
                    <td data-label="Created">${Utils.formatDate(s.created_at)}</td>
                    <td data-label="Actions">
                        <button class="btn btn-ghost btn-sm" onclick="editService(${s.id})" data-tooltip="Edit"><i class="fas fa-edit"></i></button>
                        ${hasMinRole('admin') ? `<button class="btn btn-ghost btn-sm" onclick="deleteService(${s.id})" data-tooltip="Deactivate"><i class="fas fa-trash" style="color:var(--danger)"></i></button>` : ''}
                    </td>
                </tr>
            `).join('');
        }
    } catch (err) { Toast.error(__t?.failedLoad || 'Failed to load services.'); }
}

// ── Live Preview ──
function updateServicePreview() {
    const preview = document.getElementById('svcLivePreview');
    if (!preview) return;
    const title = document.getElementById('svcTitle').value || 'Service Title';
    const desc = document.getElementById('svcDescription').value || 'Description will appear here...';
    const price = parseFloat(document.getElementById('svcPrice').value) || 0;
    const priceType = document.getElementById('svcPriceType')?.value || 'fixed';
    const priceMax = parseFloat(document.getElementById('svcPriceMax')?.value) || 0;
    const currency = document.getElementById('svcCurrency')?.value || 'SAR';
    let priceDisplay = Utils.formatCurrency(price, currency);
    if (priceType === 'range' && priceMax > 0) {
        priceDisplay = `${priceDisplay} – ${Utils.formatCurrency(priceMax, currency)}`;
    }
    preview.innerHTML = `
        <strong style="font-size:1.05rem">${esc(title)}</strong>
        <p style="color:var(--text-muted);margin:6px 0;font-size:0.85rem">${esc(desc)}</p>
        <span style="background:var(--accent-gradient);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-weight:700;font-size:1.1rem">${priceDisplay}</span>
    `;
}

let serviceDropFiles = [];

function openServiceModal(editData = null) {
    const modal = document.getElementById('serviceModal');
    const form = document.getElementById('serviceForm');
    document.getElementById('serviceModalTitle').textContent = editData
        ? (__t?.editService || 'Edit Service')
        : (__t?.addNewService || 'Add New Service');
    form.reset();
    serviceDropFiles = [];
    document.getElementById('serviceEditId').value = editData ? editData.id : '';
    document.getElementById('svcPreviewGrid').innerHTML = '';

    // Reset price type to fixed by default
    setSvcPriceType('fixed');
    document.getElementById('svcPriceMax').value = '';

    if (editData) {
        document.getElementById('svcTitle').value = editData.title || '';
        document.getElementById('svcDescription').value = editData.description || '';
        document.getElementById('svcPrice').value = editData.price || '';
        document.getElementById('svcCategory').value = editData.category || 'general';
        document.getElementById('svcActive').checked = editData.is_active !== false;
        // Price type + max
        if (editData.price_type === 'range') {
            setSvcPriceType('range');
            document.getElementById('svcPriceMax').value = editData.price_max || '';
        }
        // Currency field
        const currEl = document.getElementById('svcCurrency');
        if (currEl) currEl.value = editData.currency || 'SAR';
        // i18n Arabic fields
        const titleArEl = document.getElementById('svcTitleAr');
        const descArEl = document.getElementById('svcDescriptionAr');
        if (titleArEl) titleArEl.value = editData.title_ar || '';
        if (descArEl) descArEl.value = editData.description_ar || '';
        const catArEl = document.getElementById('svcCategoryAr');
        if (catArEl) catArEl.value = editData.category_ar || '';

        const images = Array.isArray(editData.images) ? editData.images : (typeof editData.images === 'string' ? (() => { try { return JSON.parse(editData.images); } catch { return []; } })() : []);
        if (images.length > 0) renderServicePreviews(images);
    }
    switchFormTab('svcTabGeneral', 'serviceForm');
    modal.classList.add('show');
    modal.style.display = 'flex';
}
function closeServiceModal() {
    const modal = document.getElementById('serviceModal');
    if (modal) { modal.classList.remove('show'); modal.style.display = 'none'; }
    serviceDropFiles = [];
}

function initServiceDropZone() {
    const zone = document.getElementById('svcDropZone');
    const input = document.getElementById('svcImagesInput');
    if (!zone || !input) return;

    ['dragenter', 'dragover'].forEach(e => zone.addEventListener(e, ev => { ev.preventDefault(); zone.classList.add('drag-over'); }));
    ['dragleave', 'drop'].forEach(e => zone.addEventListener(e, () => zone.classList.remove('drag-over')));
    zone.addEventListener('drop', ev => { ev.preventDefault(); handleServiceFiles(ev.dataTransfer.files); });
    input.addEventListener('change', () => handleServiceFiles(input.files));
}

function handleServiceFiles(files) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    Array.from(files).forEach(file => {
        if (!allowed.includes(file.type)) return;
        serviceDropFiles.push(file);
        const reader = new FileReader();
        reader.onload = (e) => renderServicePreviews([e.target.result]);
        reader.readAsDataURL(file);
    });
}

function renderServicePreviews(sources) {
    const grid = document.getElementById('svcPreviewGrid');
    if (!grid) return;
    sources.forEach((src) => {
        const thumb = document.createElement('div');
        thumb.className = 'img-thumb';
        thumb.innerHTML = `<img src="${esc(src)}" alt="preview"><button class="img-thumb-remove" onclick="this.parentNode.remove()" type="button"><i class="fas fa-times"></i></button>`;
        grid.appendChild(thumb);
    });
}

async function saveAdminService(e) {
    e.preventDefault();
    const btn = document.getElementById('svcSubmitBtn');
    const editId = document.getElementById('serviceEditId').value;

    // Validate required fields on the frontend first
    const title = document.getElementById('svcTitle').value.trim();
    if (!title) {
        Toast.error(__t?.titleRequired || 'Title is required.');
        return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', document.getElementById('svcDescription').value.trim());
    formData.append('price', document.getElementById('svcPrice').value || '0');
    formData.append('price_type', document.getElementById('svcPriceType')?.value || 'fixed');
    // Always send price_max — send empty string when not range so backend can clear it
    const priceType = document.getElementById('svcPriceType')?.value || 'fixed';
    const priceMaxVal = document.getElementById('svcPriceMax')?.value;
    formData.append('price_max', (priceType === 'range' && priceMaxVal) ? priceMaxVal : '');
    formData.append('currency', document.getElementById('svcCurrency')?.value || 'SAR');
    formData.append('category', document.getElementById('svcCategory').value);
    // B2 Fix: FormData converts booleans to strings — use '1'/'0' and parse on backend
    formData.append('is_active', document.getElementById('svcActive').checked ? '1' : '0');
    // i18n Arabic fields
    const titleAr = (document.getElementById('svcTitleAr')?.value || '').trim();
    const descAr = (document.getElementById('svcDescriptionAr')?.value || '').trim();
    if (titleAr) formData.append('title_ar', titleAr);
    if (descAr) formData.append('description_ar', descAr);
    const catAr = (document.getElementById('svcCategoryAr')?.value || '').trim();
    if (catAr) formData.append('category_ar', catAr);

    serviceDropFiles.forEach(file => formData.append('images', file));

    setLoading(btn, true, __t?.saving || 'Saving...');
    try {
        if (editId) {
            await API.putForm(`/services/${editId}`, formData);
            Toast.success(__t?.serviceUpdated || 'Service updated!');
        } else {
            await API.postForm('/services', formData);
            Toast.success(__t?.serviceCreated || 'Service created!');
        }
        closeServiceModal();
        loadAdminServices();
    } catch (err) {
        Toast.error(err.message || (__t?.failedSave || 'Failed to save service.'));
    } finally {
        setLoading(btn, false);
    }
}

async function editService(id) {
    try { const data = await API.get(`/services/${id}`); openServiceModal(data.data.service); }
    catch (err) { Toast.error(err.message); }
}
async function deleteService(id) {
    const confirmed = await glassConfirm(__t?.deactivateService || 'Deactivate Service', __t?.confirmDeactivate || 'Are you sure you want to deactivate this service?', 'danger');
    if (!confirmed) return;
    try { await API.delete(`/services/${id}`); Toast.success(__t?.serviceDeactivated || 'Service deactivated.'); loadAdminServices(); }
    catch (err) { Toast.error(err.message); }
}

document.addEventListener('DOMContentLoaded', initServiceDropZone);
