// ═══════════════════════════════════════════════
// Admin Jobs — CRUD for Jobs Board
// Depends on: api.js, utils.js, admin.init.js (esc, glassConfirm)
// ═══════════════════════════════════════════════

let editingJobId = null;

async function loadAdminJobs() {
    const tbody = document.getElementById('jobsTableBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px"><i class="fas fa-spinner fa-spin" style="color:var(--accent-primary);font-size:1.5rem"></i></td></tr>`;

    try {
        const data = await API.get('/jobs?limit=50');
        const jobs = data.data.jobs;

        if (!jobs.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-3)"><i class="fas fa-briefcase" style="font-size:2rem;margin-bottom:8px;display:block;opacity:.4"></i> ${__t?.noJobsYet || 'No jobs yet'}</td></tr>`;
            return;
        }

        tbody.innerHTML = jobs.map(j => `
            <tr>
                <td><strong>${esc(document.documentElement.lang === 'ar' && j.title_ar ? j.title_ar : j.title)}</strong></td>
                <td>${esc(j.company || '—')}</td>
                <td>${esc(j.location || '—')}</td>
                <td>${esc(j.type?.replace('_', ' ') || '—')}</td>
                <td>
                    <span class="badge ${j.is_active ? 'badge-success' : 'badge-danger'}">
                        ${j.is_active ? `<i class="fas fa-check-circle"></i> ${__t?.activeStatus || 'Active'}` : `<i class="fas fa-times-circle"></i> ${__t?.inactiveStatus || 'Inactive'}`}
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:6px;">
                        <button class="btn btn-ghost btn-sm" onclick="editJob(${j.id})" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${hasMinRole('admin') ? `<button class="btn btn-sm" style="background:rgba(239,68,68,.1);color:#ef4444;border:1px solid rgba(239,68,68,.2)"
                            onclick="deleteJob(${j.id})" title="Deactivate">
                            <i class="fas fa-trash"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        Toast.error(__t?.failedLoad || 'Failed to load jobs');
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--danger)">Failed to load jobs</td></tr>`;
    }
}

function openJobModal(job = null) {
    editingJobId = job ? job.id : null;
    const modal = document.getElementById('jobModal');
    const title = document.getElementById('jobModalTitle');
    if (!modal) return;

    title.textContent = job ? (__t?.editJob || 'Edit Job') : (__t?.addNewJob || 'Add New Job');
    document.getElementById('jobTitle').value = job?.title || '';
    document.getElementById('jobDescription').value = job?.description || '';
    document.getElementById('jobCompany').value = job?.company || '';
    document.getElementById('jobLocation').value = job?.location || '';
    document.getElementById('jobType').value = job?.type || 'full_time';
    document.getElementById('jobSalary').value = job?.salary_range || '';
    document.getElementById('jobIsActive').checked = job ? !!job.is_active : true;
    // Currency field
    const currEl = document.getElementById('jobCurrency');
    if (currEl) currEl.value = job?.currency || 'SAR';

    // i18n Arabic fields
    const titleArEl = document.getElementById('jobTitleAr');
    const descArEl = document.getElementById('jobDescriptionAr');
    if (titleArEl) titleArEl.value = job?.title_ar || '';
    if (descArEl) descArEl.value = job?.description_ar || '';

    modal.classList.add('show');
}

function closeJobModal() {
    document.getElementById('jobModal')?.classList.remove('show');
    editingJobId = null;
}

async function editJob(id) {
    try {
        const data = await API.get(`/jobs/${id}`);
        openJobModal(data.data.job);
    } catch { Toast.error(__t?.failedLoad || 'Failed to load job'); }
}

async function saveAdminJob() {
    const title = document.getElementById('jobTitle')?.value?.trim();
    if (!title) { Toast.error(__t?.titleRequired || 'Title is required'); return; }

    const payload = {
        title,
        description: document.getElementById('jobDescription')?.value?.trim(),
        company: document.getElementById('jobCompany')?.value?.trim(),
        location: document.getElementById('jobLocation')?.value?.trim(),
        type: document.getElementById('jobType')?.value,
        salary_range: document.getElementById('jobSalary')?.value?.trim(),
        currency: document.getElementById('jobCurrency')?.value || 'SAR',
        is_active: document.getElementById('jobIsActive')?.checked ? '1' : '0',
    };

    // i18n Arabic fields
    const titleAr = (document.getElementById('jobTitleAr')?.value || '').trim();
    const descAr = (document.getElementById('jobDescriptionAr')?.value || '').trim();
    if (titleAr) payload.title_ar = titleAr;
    if (descAr) payload.description_ar = descAr;

    try {
        if (editingJobId) {
            await API.put(`/jobs/${editingJobId}`, payload);
            Toast.success(__t?.jobUpdated || 'Job updated successfully');
        } else {
            await API.post('/jobs', payload);
            Toast.success(__t?.jobCreated || 'Job created successfully');
        }
        closeJobModal();
        loadAdminJobs();
    } catch (err) {
        Toast.error(err.message || (__t?.failedSave || 'Failed to save job'));
    }
}

async function deleteJob(id) {
    const ok = await glassConfirm(__t?.deactivateJob || 'Deactivate Job', __t?.confirmDeactivate || 'Are you sure you want to deactivate this job?', 'danger');
    if (!ok) return;
    try {
        await API.delete(`/jobs/${id}`);
        Toast.success(__t?.jobDeactivated || 'Job deactivated');
        loadAdminJobs();
    } catch { Toast.error(__t?.failedSave || 'Failed to deactivate job'); }
}

// Wire up modal close on overlay click
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('jobModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('jobModal')) closeJobModal();
    });
});
