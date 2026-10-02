/**
 * SaaS User Registration & Authentication Modal
 */
import { authStore, AuthUser } from '../auth/auth-store';

export function showAuthModal(onSuccess?: (user: AuthUser) => void): void {
  const existing = document.getElementById('saas-auth-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'saas-auth-modal';
  modal.className = 'saas-overlay';

  let currentTab: 'signin' | 'register' = 'signin';

  const renderContent = () => {
    modal.innerHTML = `
      <div class="saas-modal-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; background:linear-gradient(135deg, #38bdf8, #0284c7); border-radius:8px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px; color:#0b0f19;">RS</div>
            <div>
              <h2 style="margin:0; font-size:18px; font-weight:800; color:#fff;">Rack Slicer SaaS</h2>
              <p style="margin:0; font-size:11px; color:#94a3b8;">Enterprise CAD Platform & Datacenter Studio</p>
            </div>
          </div>
          <button id="auth-close-btn" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer;" title="Close">✕</button>
        </div>

        <!-- Tabs -->
        <div class="saas-auth-tabs">
          <button class="saas-auth-tab ${currentTab === 'signin' ? 'active' : ''}" id="tab-signin-btn">Sign In</button>
          <button class="saas-auth-tab ${currentTab === 'register' ? 'active' : ''}" id="tab-register-btn">Create Account</button>
        </div>

        <div id="auth-form-container">
          ${currentTab === 'signin' ? renderSignInForm() : renderRegisterForm()}
        </div>

        <!-- Quick Demo Accounts Bar -->
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08);">
          <div style="font-size:11px; font-weight:600; text-transform:uppercase; color:#64748b; margin-bottom:10px; text-align:center;">⚡ Quick Demo One-Click Sign In</div>
          <div style="display:flex; gap:8px;">
            <button id="demo-admin-btn" style="flex:1; padding:8px; background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.2); border-radius:6px; color:#38bdf8; font-size:12px; font-weight:600; cursor:pointer; text-align:center;">
              👨‍💼 Admin User
            </button>
            <button id="demo-eng-btn" style="flex:1; padding:8px; background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.2); border-radius:6px; color:#c084fc; font-size:12px; font-weight:600; cursor:pointer; text-align:center;">
              👩‍💻 Lead Engineer
            </button>
          </div>
        </div>

        <!-- Guest Mode Footer -->
        <div style="margin-top: 16px; text-align: center;">
          <button id="auth-guest-btn" style="background:none; border:none; color:#94a3b8; font-size:12px; cursor:pointer; text-decoration:underline;">
            Continue as Guest (Limited Workspace) →
          </button>
        </div>
      </div>
    `;

    attachEvents();
  };

  const renderSignInForm = () => `
    <form id="signin-form">
      <div class="saas-form-group">
        <label>Work Email</label>
        <input type="email" id="auth-email" class="saas-input" placeholder="alex@nexusdatacenter.io" required value="admin@rackslicer.io" />
      </div>
      <div class="saas-form-group">
        <label>Password</label>
        <input type="password" id="auth-password" class="saas-input" placeholder="••••••••" required value="demo1234" />
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
        <label style="font-size:12px; color:#94a3b8; cursor:pointer; display:flex; align-items:center; gap:6px;">
          <input type="checkbox" checked style="accent-color:#38bdf8;"/> Remember session
        </label>
        <a href="#" id="auth-forgot-link" style="font-size:12px; color:#38bdf8; text-decoration:none;">Forgot password?</a>
      </div>
      <button type="submit" class="saas-btn-primary">Sign In to Platform</button>
    </form>
  `;

  const renderRegisterForm = () => `
    <form id="register-form">
      <div class="saas-form-group">
        <label>Full Name</label>
        <input type="text" id="reg-name" class="saas-input" placeholder="Jane Doe" required />
      </div>
      <div class="saas-form-group">
        <label>Work Email</label>
        <input type="email" id="reg-email" class="saas-input" placeholder="jane@company.com" required />
      </div>
      <div class="saas-form-group">
        <label>Company / Datacenter Name</label>
        <input type="text" id="reg-company" class="saas-input" placeholder="Cloud Infrastructure Inc." />
      </div>
      <div class="saas-form-group">
        <label>Password</label>
        <input type="password" id="reg-password" class="saas-input" placeholder="Min. 8 characters" required />
      </div>
      <button type="submit" class="saas-btn-primary">Create Free Account</button>
    </form>
  `;

  const attachEvents = () => {
    modal.querySelector('#auth-close-btn')?.addEventListener('click', () => modal.remove());

    modal.querySelector('#tab-signin-btn')?.addEventListener('click', () => {
      currentTab = 'signin';
      renderContent();
    });

    modal.querySelector('#tab-register-btn')?.addEventListener('click', () => {
      currentTab = 'register';
      renderContent();
    });

    modal.querySelector('#demo-admin-btn')?.addEventListener('click', () => {
      const res = authStore.login('admin@rackslicer.io');
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });

    modal.querySelector('#demo-eng-btn')?.addEventListener('click', () => {
      const res = authStore.login('engineer@enterprise.com');
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });

    modal.querySelector('#auth-guest-btn')?.addEventListener('click', () => {
      const guest = authStore.createGuestUser();
      modal.remove();
      if (onSuccess) onSuccess(guest);
    });

    modal.querySelector('#signin-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = (modal.querySelector('#auth-email') as HTMLInputElement)?.value;
      const res = authStore.login(email);
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });

    modal.querySelector('#register-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = (modal.querySelector('#reg-name') as HTMLInputElement)?.value;
      const email = (modal.querySelector('#reg-email') as HTMLInputElement)?.value;
      const company = (modal.querySelector('#reg-company') as HTMLInputElement)?.value;
      const res = authStore.register(name, email, company);
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });
  };

  document.body.appendChild(modal);
  renderContent();
}
