/**
 * SaaS User Registration & Authentication Modal
 * Implements Section 4 & 5 of RackSlicer SaaS Blueprint with Social SSO (Google, Microsoft, LinkedIn, Facebook),
 * Email/Password registration with validation, forgot password, and guest workspace modes.
 */
import { authStore, AuthUser } from '../auth/auth-store';

export function showAuthModal(onSuccess?: (user: AuthUser) => void): void {
  const existing = document.getElementById('saas-auth-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'saas-auth-modal';
  modal.className = 'saas-overlay';

  let currentTab: 'signin' | 'register' | 'forgot' = 'signin';
  let messageNotice: { text: string; type: 'success' | 'error' | 'info' } | null = null;

  const renderContent = () => {
    modal.innerHTML = `
      <div class="saas-modal-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 18px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:40px; height:40px; background:linear-gradient(135deg, #38bdf8, #0284c7); border-radius:10px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:20px; color:#0b0f19; box-shadow:0 0 16px rgba(56,189,248,0.4);">RS</div>
            <div>
              <h2 style="margin:0; font-size:19px; font-weight:800; color:#fff; letter-spacing:-0.02em;">RACKSLICER</h2>
              <p style="margin:2px 0 0; font-size:11.5px; color:#94a3b8; font-weight:500;">Design. Architect. Optimize.</p>
            </div>
          </div>
          <button id="auth-close-btn" style="background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer; padding:4px 8px; border-radius:6px;" title="Close">✕</button>
        </div>

        ${messageNotice ? `
          <div style="padding:10px 14px; border-radius:8px; margin-bottom:16px; font-size:12.5px; font-weight:500; ${
            messageNotice.type === 'error' ? 'background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#fca5a5;' :
            messageNotice.type === 'success' ? 'background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.3); color:#86efac;' :
            'background:rgba(56,189,248,0.15); border:1px solid rgba(56,189,248,0.3); color:#7dd3fc;'
          }">
            ${messageNotice.text}
          </div>
        ` : ''}

        <!-- Social SSO Buttons -->
        <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:18px;">
          <button id="sso-google-btn" style="display:flex; align-items:center; justify-content:center; gap:10px; padding:10px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.15s ease;">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.3 9 5 12 5z"/><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"/><path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3 0-.8.1-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.1c0 2.8.7 5.4 1.9 7.8l3.7-3z"/><path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2-6.4-4.8L1.9 17c1.8 3.7 5.6 6.5 10.1 6.5z"/></svg>
            Continue with Google
          </button>

          <button id="sso-ms-btn" style="display:flex; align-items:center; justify-content:center; gap:10px; padding:10px; border-radius:8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.15s ease;">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#F25022" d="M1 1h10v10H1z"/><path fill="#7FBA00" d="M13 1h10v10H13z"/><path fill="#00A4EF" d="M1 13h10v10H1z"/><path fill="#FFB900" d="M13 13h10v10H13z"/></svg>
            Continue with Microsoft (Entra ID)
          </button>

          <div style="display:flex; gap:8px;">
            <button id="sso-linkedin-btn" style="flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:8px; border-radius:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); color:#93c5fd; font-size:12px; font-weight:600; cursor:pointer;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#0a66c2"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
              LinkedIn
            </button>
            <button id="sso-facebook-btn" style="flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:8px; border-radius:8px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); color:#93c5fd; font-size:12px; font-weight:600; cursor:pointer;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#1877f2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              Facebook
            </button>
          </div>
        </div>

        <!-- OR Divider -->
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:18px;">
          <div style="flex:1; height:1px; background:rgba(255,255,255,0.1);"></div>
          <span style="font-size:11px; font-weight:700; color:#64748b; letter-spacing:0.08em; text-transform:uppercase;">OR EMAIL</span>
          <div style="flex:1; height:1px; background:rgba(255,255,255,0.1);"></div>
        </div>

        <!-- Tabs -->
        <div class="saas-auth-tabs">
          <button class="saas-auth-tab ${currentTab === 'signin' ? 'active' : ''}" id="tab-signin-btn">Sign In</button>
          <button class="saas-auth-tab ${currentTab === 'register' ? 'active' : ''}" id="tab-register-btn">Create Account</button>
        </div>

        <div id="auth-form-container">
          ${currentTab === 'signin' ? renderSignInForm() : currentTab === 'register' ? renderRegisterForm() : renderForgotPasswordForm()}
        </div>

        <!-- Quick Demo Accounts Bar -->
        <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.08);">
          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; color:#64748b; margin-bottom:8px; text-align:center; letter-spacing:0.06em;">⚡ Quick Demo One-Click Sign In</div>
          <div style="display:flex; gap:8px;">
            <button id="demo-srinivas-btn" style="flex:1; padding:7px; background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.25); border-radius:6px; color:#38bdf8; font-size:11.5px; font-weight:600; cursor:pointer; text-align:center;">
              👨‍💼 Srinivas Anand
            </button>
            <button id="demo-eng-btn" style="flex:1; padding:7px; background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.25); border-radius:6px; color:#c084fc; font-size:11.5px; font-weight:600; cursor:pointer; text-align:center;">
              👩‍💻 Sarah Chen
            </button>
          </div>
        </div>

        <!-- Guest Mode Footer -->
        <div style="margin-top: 14px; text-align: center;">
          <button id="auth-guest-btn" style="background:none; border:none; color:#94a3b8; font-size:12px; cursor:pointer; text-decoration:underline;">
            Continue as Guest (Sandbox Mode) →
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
        <input type="email" id="auth-email" class="saas-input" placeholder="srinivas@rackslicer.io" required value="srinivas@rackslicer.io" />
      </div>
      <div class="saas-form-group">
        <label>Password</label>
        <input type="password" id="auth-password" class="saas-input" placeholder="••••••••" required value="demo1234" />
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <label style="font-size:12px; color:#94a3b8; cursor:pointer; display:flex; align-items:center; gap:6px;">
          <input type="checkbox" checked style="accent-color:#38bdf8;"/> Remember session
        </label>
        <a href="#" id="auth-forgot-link" style="font-size:12px; color:#38bdf8; text-decoration:none;">Forgot password?</a>
      </div>
      <button type="submit" class="saas-btn-primary">Sign In to RackSlicer</button>
    </form>
  `;

  const renderRegisterForm = () => `
    <form id="register-form">
      <div class="saas-form-group">
        <label>Full Name</label>
        <input type="text" id="reg-name" class="saas-input" placeholder="Srinivas Anand" required />
      </div>
      <div class="saas-form-group">
        <label>Work Email</label>
        <input type="email" id="reg-email" class="saas-input" placeholder="srinivas@enterprise.com" required />
      </div>
      <div class="saas-form-group">
        <label>Organization / Datacenter Name</label>
        <input type="text" id="reg-company" class="saas-input" placeholder="Global Infrastructure Architecture" />
      </div>
      <div class="saas-form-group">
        <label>Password</label>
        <input type="password" id="reg-password" class="saas-input" placeholder="Min. 8 characters" required />
      </div>
      <div class="saas-form-group">
        <label>Confirm Password</label>
        <input type="password" id="reg-password-confirm" class="saas-input" placeholder="Re-enter password" required />
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:11.5px; color:#94a3b8; display:flex; align-items:flex-start; gap:8px; cursor:pointer;">
          <input type="checkbox" required checked style="accent-color:#38bdf8; margin-top:2px;"/>
          <span>I agree to the <a href="#" style="color:#38bdf8;">Terms of Service</a> and <a href="#" style="color:#38bdf8;">Privacy Policy</a>.</span>
        </label>
      </div>
      <button type="submit" class="saas-btn-primary">Create RackSlicer Account</button>
    </form>
  `;

  const renderForgotPasswordForm = () => `
    <form id="forgot-form">
      <div class="saas-form-group">
        <label>Enter your registered Email</label>
        <input type="email" id="forgot-email" class="saas-input" placeholder="srinivas@enterprise.com" required />
      </div>
      <p style="font-size:12px; color:#94a3b8; margin:0 0 16px;">We will dispatch password recovery instructions and an authentication token to your email.</p>
      <button type="submit" class="saas-btn-primary" style="margin-bottom:10px;">Send Password Reset Link</button>
      <button type="button" id="forgot-back-btn" class="saas-btn-secondary" style="width:100%; text-align:center;">Back to Sign In</button>
    </form>
  `;

  const attachEvents = () => {
    modal.querySelector('#auth-close-btn')?.addEventListener('click', () => modal.remove());

    modal.querySelector('#tab-signin-btn')?.addEventListener('click', () => {
      currentTab = 'signin';
      messageNotice = null;
      renderContent();
    });

    modal.querySelector('#tab-register-btn')?.addEventListener('click', () => {
      currentTab = 'register';
      messageNotice = null;
      renderContent();
    });

    modal.querySelector('#auth-forgot-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      currentTab = 'forgot';
      messageNotice = null;
      renderContent();
    });

    modal.querySelector('#forgot-back-btn')?.addEventListener('click', () => {
      currentTab = 'signin';
      messageNotice = null;
      renderContent();
    });

    // SSO Social Logins
    modal.querySelector('#sso-google-btn')?.addEventListener('click', async () => {
      const res = await authStore.signInWithGoogle();
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });

    modal.querySelector('#sso-ms-btn')?.addEventListener('click', async () => {
      const res = await authStore.signInWithMicrosoft();
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });

    modal.querySelector('#sso-linkedin-btn')?.addEventListener('click', async () => {
      const res = await authStore.signInWithLinkedIn();
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });

    modal.querySelector('#sso-facebook-btn')?.addEventListener('click', async () => {
      const res = await authStore.signInWithFacebook();
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });

    // Demo Accounts
    modal.querySelector('#demo-srinivas-btn')?.addEventListener('click', () => {
      const res = authStore.login('srinivas@rackslicer.io');
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

    // Form Submissions
    modal.querySelector('#signin-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (modal.querySelector('#auth-email') as HTMLInputElement)?.value;
      const res = await authStore.signInWithEmail(email);
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });

    modal.querySelector('#register-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = (modal.querySelector('#reg-name') as HTMLInputElement)?.value;
      const email = (modal.querySelector('#reg-email') as HTMLInputElement)?.value;
      const company = (modal.querySelector('#reg-company') as HTMLInputElement)?.value;
      const pass = (modal.querySelector('#reg-password') as HTMLInputElement)?.value;
      const passConf = (modal.querySelector('#reg-password-confirm') as HTMLInputElement)?.value;

      if (pass !== passConf) {
        messageNotice = { text: 'Passwords do not match. Please re-enter.', type: 'error' };
        renderContent();
        return;
      }

      const res = await authStore.signUp(name, email, pass, company);
      if (res.user) {
        modal.remove();
        if (onSuccess) onSuccess(res.user);
      }
    });

    modal.querySelector('#forgot-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (modal.querySelector('#forgot-email') as HTMLInputElement)?.value;
      const res = await authStore.resetPassword(email);
      messageNotice = { text: res.message, type: 'success' };
      renderContent();
    });
  };

  document.body.appendChild(modal);
  renderContent();
}
