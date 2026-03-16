// ═══════════════════════════════════════════════
// Admin Portfolio — CRUD for Previous Works
// Depends on: api.js, utils.js, admin.init.js (esc, glassConfirm)
// ═══════════════════════════════════════════════

let editingPortfolioId = null;

async function loadAdminPortfolio() {
    const tbody = document.getElementById('portfolioTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="color:var(--accent-primary);font-size:1.5rem"></i></td></tr>`;

    try {
        const data = await API.get('/portfolio?limit=50');
        const items = data.data.items;

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--text-3)"><i class="fas fa-images" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.4"></i> No portfolio items yet</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(item => {
            const images = Array.isArray(item.images) ? item.images : (JSON.parse(item.images || '[]'));
            const thumb = images?.[0] || '';
            return `
            <tr>
                <td>
                    ${thumb ? `<img src="${esc(thumb)}" style="width:48px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)" alt="">` : '<i class="fas fa-image" style="opacity:.3;font-size:1.5rem"></i>'}
                </td>
                <td><strong>${esc(item.title)}</strong></td>
                <td>${esc(item.category || '—')}</td>
                <td>
                    <span class="badge ${item.is_active ? 'badge-success' : 'badge-danger'}">
                        ${item.is_active ? '<i class="fas fa-check-circle"></i> Active' : '<i class="fas fa-times-circle"></i> Inactive'}
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:6px;">
                        <button class="btn btn-ghost btn-sm" onclick="editPortfolioItem(${item.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.2)"
                            onclick="deletePortfolioItem(${item.id})" title="Deactivate">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {
        Toast.error(__t?.failedLoad || 'Failed to load portfolio items');
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--danger)">Failed to load portfolio</td></tr>`;
    }
}

function openPortfolioModal(item = null) {
    editingPortfolioId = item ? item.id : null;
    const modal = document.getElementById('portfolioModal');
    const title = document.getElementById('portfolioModalTitle');
    if (!modal) return;

    title.textContent = item ? 'Edit Portfolio Item' : 'Add New Portfolio Item';
    document.getElementById('portfolioTitle').value = item?.title || '';
    document.getElementById('portfolioDescription').value = item?.description || '';
    document.getElementById('portfolioCategory').value = item?.category || 'general';
    document.getElementById('portfolioIsActive').checked = item ? !!item.is_active : true;

    // Reset file input
    const fileInput = document.getElementById('portfolioImages');
    if (fileInput) fileInput.value = '';

    // Show existing images
    const preview = document.getElementById('portfolioImgPreview');
    if (preview && item) {
        const imgs = Array.isArray(item.images) ? item.images : (JSON.parse(item.images || '[]'));
        preview.innerHTML = imgs.map(url => `<img src="${esc(url)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)">`).join('');
    } else if (preview) {
        preview.innerHTML = '';
    }

    modal.classList.add('show');
}

function closePortfolioModal() {
    document.getElementById('portfolioModal')?.classList.remove('show');
    editingPortfolioId = null;
}

async function editPortfolioItem(id) {
    try {
        const data = await API.get(`/portfolio/${id}`);
        openPortfolioModal(data.data.item);
    } catch { Toast.error('Failed to load portfolio item'); }
}

async function saveAdminPortfolio() {
    const title = document.getElementById('portfolioTitle')?.value?.trim();
    if (!title) { Toast.error(__t?.titleRequired || 'Title is required'); return; }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', document.getElementById('portfolioDescription')?.value?.trim() || '');
    formData.append('category', document.getElementById('portfolioCategory')?.value || 'general');
    formData.append('is_active', document.getElementById('portfolioIsActive')?.checked ? '1' : '0');

    const fileInput = document.getElementById('portfolioImages');
    if (fileInput?.files?.length > 0) {
        Array.from(fileInput.files).forEach(f => formData.append('images', f));
    }

    try {
        if (editingPortfolioId) {
            await API.putForm(`/portfolio/${editingPortfolioId}`, formData);
            Toast.success(__t?.portfolioUpdated || 'Portfolio item updated');
        } else {
            await API.postForm('/portfolio', formData);
            Toast.success(__t?.portfolioCreated || 'Portfolio item created');
        }
        closePortfolioModal();
        loadAdminPortfolio();
    } catch (err) {
        Toast.error(err.message || (__t?.failedSave || 'Failed to save portfolio item'));
    }
}

async function deletePortfolioItem(id) {
    const ok = await glassConfirm(__t?.deactivatePortfolio || 'Deactivate Item', __t?.confirmDeactivate || 'Are you sure you want to deactivate this portfolio item?', 'danger');
    if (!ok) return;
    try {
        await API.delete(`/portfolio/${id}`);
        Toast.success(__t?.portfolioDeactivated || 'Portfolio item deactivated');
        loadAdminPortfolio();
    } catch { Toast.error(__t?.failedSave || 'Failed to deactivate portfolio item'); }
}

// Wire up portfolio images live preview
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('portfolioImages')?.addEventListener('change', (e) => {
        const preview = document.getElementById('portfolioImgPreview');
        if (!preview) return;
        preview.innerHTML = '';
        Array.from(e.target.files).forEach(file => {
            const reader = new FileReader();
            reader.onload = ev => {
                const img = document.createElement('img');
                img.src = ev.target.result;
                img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color)';
                preview.appendChild(img);
            };
            reader.readAsDataURL(file);
        });
    });

    document.getElementById('portfolioModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('portfolioModal')) closePortfolioModal();
    });
});
