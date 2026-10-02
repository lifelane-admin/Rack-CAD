/**
 * User Profile & Account Settings Modal
 */
import { authStore } from '../auth/auth-store';
import { showSubscriptionModal } from './subscription-modal';
import { showAuthModal } from './auth-modal';

export function showUserProfileModal(onLogout?: () => void): void {
  const existing = document.getElementById('saas-user-profile-modal');
  if (existing) existing.remove();

  const user = authStore.getCurrentUser();

  const modal = document.createElement('div');
  modal.id = 'saas-user-profile-modal';
  modal.className = 'saas-overlay';

  modal.innerHTML = `
    <div class="saas-modal-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
        <h2 style="margin:0; font-size:18px; font-weight:800; color:#fff;">Account & Workspace Settings</h2>
        <button id="profile-close-btn" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer;" title="Close">✕</button>
      </div>

      <!-- User Header Card -->
      <div style="display:flex; align-items:center; gap:16px; padding:16px; background:rgba(15,23,42,0.8); border:1px solid rgba(255,255,255,0.08); border-radius:12px; margin-bottom:20px;">
        <div style="width:48px; height:48px; border-radius:50%; background:linear-gradient(135deg, #38bdf8, #818cf8); display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:#0b0f19;">
          ${user.name.charAt(0).toUpperCase()}
        </div>
        <div style="flex:1;">
          <h3 style="margin:0; font-size:16px; font-weight:700; color:#fff;">${user.name}</h3>
          <div style="font-size:12px; color:#94a3b8;">${user.email}</div>
          <div style="display:flex; gap:8px; margin-top:6px;">
            <span class="saas-badge-tag" style="background:rgba(56,189,248,0.15); color:#38bdf8; text-transform:uppercase;">
              ${user.plan} PLAN
            </span>
            <span class="saas-badge-tag">${user.role.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <!-- Profile Form -->
      <form id="profile-edit-form">
        <div class="saas-form-group">
          <label>Full Name</label>
          <input type="text" id="prof-name" class="saas-input" value="${user.name}" />
        </div>
        <div class="saas-form-group">
          <label>Company / Datacenter</label>
          <input type="text" id="prof-company" class="saas-input" value="${user.company || ''}" />
        </div>
        
        <div style="display:flex; gap:10px; margin-top:20px;">
          <button type="submit" class="saas-btn-primary" style="flex:1;">Save Profile Changes</button>
          <button type="button" id="prof-upgrade-btn" class="saas-btn-secondary">View SaaS Tiers</button>
        </div>
      </form>

      <!-- Sign Out / Auth Actions -->
      <div style="margin-top:24px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;">
        ${user.isGuest ? `
          <button id="prof-signin-btn" class="saas-btn-primary" style="padding:8px 16px; font-size:12px;">Sign In / Register</button>
        ` : `
          <button id="prof-logout-btn" style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#ef4444; border-radius:8px; padding:8px 16px; font-size:12px; font-weight:600; cursor:pointer;">
            Sign Out of Session
          </button>
        `}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#profile-close-btn')?.addEventListener('click', () => modal.remove());

  modal.querySelector('#prof-upgrade-btn')?.addEventListener('click', () => {
    modal.remove();
    showSubscriptionModal();
  });

  modal.querySelector('#prof-signin-btn')?.addEventListener('click', () => {
    modal.remove();
    showAuthModal();
  });

  modal.querySelector('#prof-logout-btn')?.addEventListener('click', () => {
    authStore.logout();
    modal.remove();
    if (onLogout) onLogout();
  });

  modal.querySelector('#profile-edit-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = (modal.querySelector('#prof-name') as HTMLInputElement).value;
    const company = (modal.querySelector('#prof-company') as HTMLInputElement).value;
    authStore.updateProfile({ name, company });
    modal.remove();
  });
}
