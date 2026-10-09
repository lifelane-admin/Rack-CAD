/**
 * RackSlicer — User Profile & Public Showcase Studio
 * Allows users to showcase profile info, LinkedIn profile, photo,
 * publish RackSlicer achievements, and share their profile to showcase
 * their works, projects, and skills.
 */

import { authStore, AuthUser, UserAchievement } from '../auth/auth-store';
import { projectStore, SaaSProject } from '../storage/project-store';
import { showSubscriptionModal } from './subscription-modal';
import { showAuthModal } from './auth-modal';
import { importJSON } from '../utils/export';
import EventBus from '../core/event-bus';

export type ProfileTab = 'showcase' | 'edit' | 'account';

export function showUserProfileModal(onLogout?: () => void, initialTab: ProfileTab = 'showcase'): void {
  const existing = document.getElementById('saas-user-profile-modal');
  if (existing) existing.remove();

  let activeTab: ProfileTab = initialTab;
  let currentUser = authStore.getCurrentUser();
  let tempAvatarUrl = currentUser.avatarUrl || '';
  let activeSkills = [...(currentUser.skills || [])];

  const modal = document.createElement('div');
  modal.id = 'saas-user-profile-modal';
  modal.className = 'profile-overlay';

  function renderModalContent(): void {
    currentUser = authStore.getCurrentUser();
    const allProjects: SaaSProject[] = projectStore.getAllProjects().filter(p => !p.isTemplate);
    const showcaseProjects = allProjects.length > 0 
      ? allProjects.slice(0, 4) 
      : (currentUser.showcaseProjects || []);

    const userInitial = (currentUser.name || 'U').charAt(0).toUpperCase();
    const stats = currentUser.stats || {
      racksDesigned: 68,
      totalRuDeployed: 2840,
      cablesRouted: 348,
      pueOptimized: 1.14,
      designsPublished: 12,
    };
    const achievements: UserAchievement[] = currentUser.achievements || [];

    modal.innerHTML = `
      <div class="profile-modal-card">
        <!-- Header -->
        <div class="profile-modal-header">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="font-size:18px;">👤</div>
            <div>
              <div style="font-size:15px; font-weight:800; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                <span>RackSlicer Architect Showcase</span>
                <span class="profile-verified-badge">✓ Verified Profile</span>
              </div>
              <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                Public engineering portfolio, certified achievements & infrastructure blueprints
              </div>
            </div>
          </div>

          <!-- Navigation Tabs -->
          <div class="profile-header-tabs">
            <button class="profile-tab-btn ${activeTab === 'showcase' ? 'active' : ''}" data-tab="showcase">
              <span>👁️</span> <span>Public Showcase</span>
            </button>
            <button class="profile-tab-btn ${activeTab === 'edit' ? 'active' : ''}" data-tab="edit">
              <span>✏️</span> <span>Edit Profile</span>
            </button>
            <button class="profile-tab-btn ${activeTab === 'account' ? 'active' : ''}" data-tab="account">
              <span>⚙️</span> <span>Account & Plan</span>
            </button>
          </div>

          <button id="profile-close-btn" style="background:none; border:none; color:var(--text-secondary); font-size:18px; cursor:pointer; padding:4px 8px; border-radius:6px;" title="Close (Esc)">✕</button>
        </div>

        <!-- Body -->
        <div class="profile-modal-body">
          ${activeTab === 'showcase' ? renderShowcaseView(currentUser, stats, achievements, showcaseProjects, userInitial) : ''}
          ${activeTab === 'edit' ? renderEditView(currentUser, tempAvatarUrl, activeSkills) : ''}
          ${activeTab === 'account' ? renderAccountView(currentUser) : ''}
        </div>
      </div>
    `;

    attachModalEvents(allProjects);
  }

  function renderShowcaseView(
    user: AuthUser,
    stats: any,
    achievements: UserAchievement[],
    showcaseProjects: any[],
    userInitial: string
  ): string {
    const avatarSrc = user.avatarUrl || tempAvatarUrl;
    const linkedinUrl = user.linkedinUrl || 'https://www.linkedin.com/in/srinivas-datacenter-architect';

    return `
      <!-- Hero Banner & Card -->
      <div class="profile-hero-card">
        <div class="profile-banner-bg">
          <div class="profile-banner-grid-overlay"></div>
        </div>

        <div class="profile-hero-content">
          <div style="display:flex; gap:18px; align-items:flex-end; flex-wrap:wrap;">
            <div class="profile-avatar-wrap">
              ${avatarSrc ? `
                <img class="profile-avatar-img" src="${avatarSrc}" alt="${user.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
                <div class="profile-avatar-initials" style="display:none;">${userInitial}</div>
              ` : `
                <div class="profile-avatar-initials">${userInitial}</div>
              `}
            </div>

            <div style="padding-bottom:2px;">
              <h1 class="profile-name">
                ${user.name}
                <span class="profile-verified-badge" title="Identity & Architecture Certifications Verified">✓ Verified Architect</span>
              </h1>
              <div class="profile-title">${user.title || 'Principal Datacenter Infrastructure Architect'}</div>
              <div class="profile-meta-line">
                <span>🏢 ${user.company || 'Enterprise Infrastructure Architecture'}</span>
                <span>📍 ${user.location || 'San Jose, CA & Hyderabad, India'}</span>
                <span>📅 Member since ${new Date(user.createdAt).getFullYear() || 2026}</span>
              </div>
            </div>
          </div>

          <!-- Top Action Buttons -->
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button class="profile-social-pill share-btn" id="prof-btn-share" title="Share public RackSlicer profile link & accomplishments">
              <span>🔗</span> <span>Share Profile</span>
            </button>
            <a href="${linkedinUrl}" target="_blank" rel="noopener noreferrer" class="profile-social-pill linkedin" id="prof-btn-linkedin-direct" title="Visit LinkedIn Profile">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.68 1.68 0 1 0 0 3.36 1.68 1.68 0 0 0 0-3.36z"/></svg>
              <span>LinkedIn Profile</span>
              <span style="font-size:10px;">↗</span>
            </a>
            <button class="profile-tab-btn" id="prof-btn-quick-edit" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#fff; padding:6px 12px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer;">
              <span>✏️</span> <span>Edit</span>
            </button>
          </div>
        </div>

        <!-- Social Bar -->
        <div class="profile-social-bar">
          <a href="${linkedinUrl}" target="_blank" rel="noopener noreferrer" class="profile-social-pill linkedin">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.68 1.68 0 1 0 0 3.36 1.68 1.68 0 0 0 0-3.36z"/></svg>
            <span>LinkedIn</span>
          </a>
          ${user.githubUrl ? `
            <a href="${user.githubUrl}" target="_blank" rel="noopener noreferrer" class="profile-social-pill github">
              <span>🐙</span> <span>GitHub</span>
            </a>
          ` : ''}
          ${user.websiteUrl ? `
            <a href="${user.websiteUrl}" target="_blank" rel="noopener noreferrer" class="profile-social-pill github">
              <span>🌐</span> <span>Portfolio</span>
            </a>
          ` : ''}
          <div style="font-size:12px; color:var(--text-secondary); margin-left:auto; display:flex; align-items:center; gap:8px;">
            <span>✉️ ${user.email}</span>
            <span style="background:rgba(56,189,248,0.15); color:var(--accent-primary); padding:2px 8px; border-radius:10px; font-weight:700; font-size:10px; text-transform:uppercase;">
              ${user.plan} PLAN
            </span>
          </div>
        </div>
      </div>

      <!-- Bio / About -->
      ${user.bio ? `
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:16px 20px;">
          <div class="profile-section-title" style="margin-bottom:8px;">
            <span>About & Engineering Philosophy</span>
          </div>
          <p style="font-size:13px; color:var(--text-secondary); line-height:1.6; margin:0;">
            ${user.bio}
          </p>
        </div>
      ` : ''}

      <!-- Engineering Impact Stats -->
      <div>
        <div class="profile-section-title">
          <span>RackSlicer Infrastructure Impact</span>
          <span style="font-size:11px; color:var(--accent-primary); font-weight:600;">Verified Metrics</span>
        </div>
        <div class="profile-stats-grid">
          <div class="profile-stat-box">
            <div class="profile-stat-val">${stats.racksDesigned || 68}</div>
            <div class="profile-stat-lbl">Racks Built</div>
          </div>
          <div class="profile-stat-box">
            <div class="profile-stat-val">${stats.totalRuDeployed?.toLocaleString() || '2,840'}</div>
            <div class="profile-stat-lbl">Total RU Deployed</div>
          </div>
          <div class="profile-stat-box">
            <div class="profile-stat-val">${stats.cablesRouted || 348}</div>
            <div class="profile-stat-lbl">Cable Runs Built</div>
          </div>
          <div class="profile-stat-box">
            <div class="profile-stat-val" style="color:#10b981;">${stats.pueOptimized || '1.14'}</div>
            <div class="profile-stat-lbl">Efficiency (PUE)</div>
          </div>
          <div class="profile-stat-box">
            <div class="profile-stat-val" style="color:#c084fc;">${stats.designsPublished || 12}</div>
            <div class="profile-stat-lbl">Community Designs</div>
          </div>
        </div>
      </div>

      <!-- Published Certified Achievements -->
      <div>
        <div class="profile-section-title">
          <span>Certified RackSlicer Achievements & Badges (${achievements.length})</span>
          <span style="font-size:11px; color:var(--text-secondary);">Click to publish any badge directly to LinkedIn</span>
        </div>
        <div class="profile-achievements-grid">
          ${achievements.map(ach => `
            <div class="profile-achievement-card">
              <div class="profile-achievement-top">
                <div class="profile-achievement-icon">${ach.icon}</div>
                <span class="profile-achievement-badge">${ach.highlightBadge || 'Certified'}</span>
              </div>
              <h4 class="profile-achievement-title">${ach.title}</h4>
              <p class="profile-achievement-desc">${ach.description}</p>
              <div class="profile-achievement-footer">
                <span class="profile-achievement-date">Earned ${ach.earnedDate}</span>
                <button class="profile-publish-li-btn" data-ach-id="${ach.id}" title="Publish this credential to your LinkedIn feed">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.68 1.68 0 1 0 0 3.36 1.68 1.68 0 0 0 0-3.36z"/></svg>
                  <span>Publish to LinkedIn</span>
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Featured Architecture Works & Projects -->
      <div>
        <div class="profile-section-title">
          <span>Featured Works & Project Blueprints</span>
          <span style="font-size:11px; color:var(--text-secondary);">Direct 1-click launch into interactive canvas</span>
        </div>
        <div class="profile-projects-grid">
          ${showcaseProjects.map((p: any) => `
            <div class="profile-project-card">
              <div class="profile-project-header">
                <span class="profile-project-cat">${p.category || 'Architecture'}</span>
                <span style="font-size:11px; color:var(--text-secondary);">Updated ${p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : 'Recent'}</span>
              </div>
              <h4 class="profile-project-name">${p.name || p.title}</h4>
              <p class="profile-project-desc">${p.description || 'Full-scale datacenter blueprint with automated power distribution, rack elevation schedules, and fiber routing.'}</p>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid var(--border-color);">
                <span style="font-size:11px; color:#38bdf8; font-weight:700;">
                  ${p.rackCount ? `🖥️ ${p.rackCount} Racks` : '📐 True-Scale 48U'}
                </span>
                <button class="profile-open-proj-btn" data-proj-id="${p.id}" style="background:var(--btn-mode-active-bg, rgba(56,189,248,0.15)); border:1px solid var(--accent-primary, #38bdf8); color:var(--accent-primary, #38bdf8); font-size:11px; font-weight:700; padding:4px 10px; border-radius:6px; cursor:pointer;">
                  Open Blueprint →
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Verified Skills & Specialties -->
      <div>
        <div class="profile-section-title">
          <span>Infrastructure Specialties & Technical Competencies</span>
        </div>
        <div class="profile-skills-wrap">
          ${(user.skills || []).map(skill => `
            <div class="profile-skill-chip">
              <span>⚡</span>
              <span>${skill}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderEditView(user: AuthUser, currentAvatar: string, skills: string[]): string {
    const avatarSrc = currentAvatar || user.avatarUrl || '';
    const userInitial = (user.name || 'U').charAt(0).toUpperCase();

    return `
      <form id="profile-full-edit-form" style="display:flex; flex-direction:column; gap:20px;">
        
        <!-- Photo & Avatar Section -->
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
          <label style="font-size:13px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:12px;">
            Profile Photo & Avatar
          </label>
          <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
            <div class="profile-avatar-wrap" style="width:80px; height:80px;">
              ${avatarSrc ? `
                <img id="edit-avatar-preview" class="profile-avatar-img" src="${avatarSrc}" alt="Avatar Preview" />
              ` : `
                <div id="edit-avatar-fallback" class="profile-avatar-initials" style="font-size:28px;">${userInitial}</div>
              `}
            </div>

            <div style="flex:1; min-width:260px; display:flex; flex-direction:column; gap:8px;">
              <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <label style="background:var(--accent-primary); color:#ffffff; font-size:12px; font-weight:700; padding:7px 14px; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                  <span>📷</span> <span>Upload Custom Photo</span>
                  <input type="file" id="edit-avatar-file-input" accept="image/*" style="display:none;" />
                </label>
                <button type="button" id="edit-btn-dicebear" style="background:rgba(255,255,255,0.08); border:1px solid var(--border-color); color:var(--text-primary); font-size:12px; padding:7px 14px; border-radius:6px; cursor:pointer;">
                  🤖 Tech Avatar
                </button>
                <button type="button" id="edit-btn-clear-photo" style="background:none; border:1px solid rgba(239,68,68,0.4); color:#ef4444; font-size:12px; padding:7px 12px; border-radius:6px; cursor:pointer;">
                  Remove Photo
                </button>
              </div>
              <div style="font-size:11.5px; color:var(--text-secondary);">
                Supports PNG, JPG, or SVG up to 5MB. Photo will be displayed on your public profile showcase and shared on LinkedIn.
              </div>
            </div>
          </div>
        </div>

        <!-- Personal & Professional Information Form -->
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; flex-direction:column; gap:16px;">
          <div style="font-size:13px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px;">
            Personal & Professional Details
          </div>

          <div class="profile-form-grid">
            <div class="profile-form-group">
              <label for="edit-prof-name">Full Name *</label>
              <input type="text" id="edit-prof-name" class="profile-input" value="${user.name}" required />
            </div>

            <div class="profile-form-group">
              <label for="edit-prof-title">Professional Title / Headline *</label>
              <input type="text" id="edit-prof-title" class="profile-input" value="${user.title || ''}" placeholder="e.g. Senior Datacenter Infrastructure Architect" required />
            </div>

            <div class="profile-form-group">
              <label for="edit-prof-company">Company / Organization</label>
              <input type="text" id="edit-prof-company" class="profile-input" value="${user.company || ''}" placeholder="e.g. Microsoft Azure Datacenter Engineering" />
            </div>

            <div class="profile-form-group">
              <label for="edit-prof-location">Location</label>
              <input type="text" id="edit-prof-location" class="profile-input" value="${user.location || ''}" placeholder="e.g. San Jose, CA & Hyderabad, India" />
            </div>

            <!-- LinkedIn Profile Input -->
            <div class="profile-form-group profile-form-full">
              <label for="edit-prof-linkedin" style="display:flex; align-items:center; gap:6px; color:#38bdf8;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.68 1.68 0 1 0 0 3.36 1.68 1.68 0 0 0 0-3.36z"/></svg>
                LinkedIn Profile URL (Public Showcase)
              </label>
              <input type="url" id="edit-prof-linkedin" class="profile-input" value="${user.linkedinUrl || ''}" placeholder="https://www.linkedin.com/in/your-profile-slug" />
              <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                Allows other architects, clients, and recruiters to connect with you directly from your RackSlicer designs.
              </div>
            </div>

            <div class="profile-form-group">
              <label for="edit-prof-github">GitHub Profile (Optional)</label>
              <input type="url" id="edit-prof-github" class="profile-input" value="${user.githubUrl || ''}" placeholder="https://github.com/username" />
            </div>

            <div class="profile-form-group">
              <label for="edit-prof-website">Personal Website / Portfolio</label>
              <input type="url" id="edit-prof-website" class="profile-input" value="${user.websiteUrl || ''}" placeholder="https://yourportfolio.com" />
            </div>

            <div class="profile-form-group profile-form-full">
              <label for="edit-prof-bio">Bio & Infrastructure Philosophy</label>
              <textarea id="edit-prof-bio" class="profile-input profile-textarea" rows="3" placeholder="Describe your datacenter engineering specialties, standards compliance, and cable routing philosophy...">${user.bio || ''}</textarea>
            </div>
          </div>
        </div>

        <!-- Skills Management -->
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:20px; display:flex; flex-direction:column; gap:14px;">
          <div style="font-size:13px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:flex; justify-content:space-between; align-items:center;">
            <span>Specialties & Technical Skills</span>
            <span style="font-size:11px; color:var(--text-secondary); font-weight:normal;">(${skills.length} skills listed)</span>
          </div>

          <div class="profile-skills-wrap" id="edit-skills-container">
            ${skills.map((s, idx) => `
              <div class="profile-skill-chip">
                <span>⚡</span>
                <span>${s}</span>
                <button type="button" class="profile-skill-remove" data-skill-idx="${idx}" title="Remove skill">✕</button>
              </div>
            `).join('')}
          </div>

          <!-- Add Skill Input -->
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="text" id="edit-new-skill-input" class="profile-input" style="flex:1;" placeholder="Add custom skill (e.g. Single-Mode Fiber OS2, Liquid Cooling, TIA-942)..." />
            <button type="button" id="edit-btn-add-skill" style="background:var(--accent-primary); color:#fff; border:none; padding:9px 16px; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;">
              + Add Skill
            </button>
          </div>

          <!-- Quick Suggestion Pills -->
          <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
            <span style="font-size:11px; color:var(--text-secondary); margin-right:4px;">Suggestions:</span>
            ${['Liquid Cooling (Direct-to-Chip)', '400G QSFP-DD Cabling', 'OCP Open Rack v3', 'Hot/Cold Aisle Containment', 'CFD Airflow Simulation', 'TIA-942 Tier IV Audit'].map(s => `
              <button type="button" class="edit-quick-skill-pill" data-skill="${s}" style="background:rgba(255,255,255,0.06); border:1px solid var(--border-color); color:var(--text-secondary); font-size:10.5px; padding:3px 8px; border-radius:99px; cursor:pointer;">
                + ${s}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Submit Button Bar -->
        <div style="display:flex; justify-content:flex-end; gap:12px; align-items:center; margin-top:8px;">
          <button type="button" id="edit-btn-cancel" style="background:none; border:1px solid var(--border-color); color:var(--text-secondary); padding:9px 18px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;">
            Cancel
          </button>
          <button type="submit" id="edit-btn-save" style="background:linear-gradient(135deg, #0284c7, #2563eb); color:#ffffff; border:none; padding:9px 24px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; box-shadow:0 4px 14px rgba(2,132,199,0.35);">
            ✓ Save Profile & Showcase
          </button>
        </div>
      </form>
    `;
  }

  function renderAccountView(user: AuthUser): string {
    return `
      <div style="display:flex; flex-direction:column; gap:20px;">
        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
          <h3 style="margin:0 0 14px; font-size:15px; font-weight:800; color:var(--text-primary);">
            RackSlicer SaaS Subscription & Tier
          </h3>
          <div style="display:flex; justify-content:space-between; align-items:center; padding:16px; background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.25); border-radius:10px;">
            <div>
              <div style="font-size:16px; font-weight:800; color:#38bdf8;">
                ${user.plan.toUpperCase()} TIER PLAN
              </div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
                Role: <strong>${user.role.toUpperCase()}</strong> • Organization: <strong>${user.company || 'Enterprise Workspace'}</strong>
              </div>
            </div>
            <button id="prof-btn-view-tiers" style="background:var(--accent-primary); color:#ffffff; border:none; padding:8px 16px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;">
              Upgrade / View SaaS Tiers
            </button>
          </div>
        </div>

        <div style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:12px; padding:20px;">
          <h3 style="margin:0 0 14px; font-size:15px; font-weight:800; color:var(--text-primary);">
            Session & Authentication
          </h3>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${user.email}</div>
              <div style="font-size:12px; color:var(--text-secondary);">Currently signed in via ${user.provider || 'email'} session</div>
            </div>
            ${user.isGuest ? `
              <button id="prof-btn-signin" style="background:var(--accent-primary); color:#fff; border:none; padding:8px 16px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;">
                Sign In / Register
              </button>
            ` : `
              <button id="prof-btn-signout" style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; color:#ef4444; padding:8px 16px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer;">
                Sign Out of Session
              </button>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function attachModalEvents(allProjects: SaaSProject[]): void {
    // Close button
    modal.querySelector('#profile-close-btn')?.addEventListener('click', () => modal.remove());

    // Tab buttons
    modal.querySelectorAll<HTMLElement>('.profile-tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as ProfileTab;
        if (tab) {
          activeTab = tab;
          renderModalContent();
        }
      });
    });

    // Quick edit button from showcase view
    modal.querySelector('#prof-btn-quick-edit')?.addEventListener('click', () => {
      activeTab = 'edit';
      renderModalContent();
    });

    // Share Profile button
    modal.querySelector('#prof-btn-share')?.addEventListener('click', () => {
      showShareProfileDialog(currentUser);
    });

    // Publish Achievement to LinkedIn buttons
    modal.querySelectorAll('.profile-publish-li-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const achId = (btn as HTMLElement).dataset.achId;
        const ach = currentUser.achievements?.find(a => a.id === achId);
        if (ach) {
          publishAchievementToLinkedIn(ach, currentUser);
        }
      });
    });

    // Open Project Blueprint buttons
    modal.querySelectorAll('.profile-open-proj-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const projId = (btn as HTMLElement).dataset.projId;
        const proj = allProjects.find(p => p.id === projId);
        if (proj && proj.dataJson && proj.dataJson !== '{}') {
          try {
            importJSON(proj.dataJson);
            modal.remove();
            EventBus.emit('notification', {
              message: `🚀 Opened showcase blueprint "${proj.name}"!`,
              type: 'success',
            });
          } catch (err: any) {
            EventBus.emit('notification', { message: `Could not load blueprint: ${err.message}`, type: 'error' });
          }
        }
      });
    });

    // --- Edit View Events ---
    if (activeTab === 'edit') {
      const fileInput = modal.querySelector('#edit-avatar-file-input') as HTMLInputElement;
      fileInput?.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            if (dataUrl) {
              tempAvatarUrl = dataUrl;
              const preview = modal.querySelector('#edit-avatar-preview') as HTMLImageElement;
              const fallback = modal.querySelector('#edit-avatar-fallback') as HTMLElement;
              if (preview) {
                preview.src = dataUrl;
                preview.style.display = 'block';
              }
              if (fallback) fallback.style.display = 'none';
              EventBus.emit('notification', { message: '📷 Photo ready for saving!', type: 'info' });
            }
          };
          reader.readAsDataURL(fileInput.files[0]);
        }
      });

      // Tech avatar preset
      modal.querySelector('#edit-btn-dicebear')?.addEventListener('click', () => {
        const seed = Math.random().toString(36).substring(7);
        tempAvatarUrl = `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}`;
        const preview = modal.querySelector('#edit-avatar-preview') as HTMLImageElement;
        const fallback = modal.querySelector('#edit-avatar-fallback') as HTMLElement;
        if (preview) {
          preview.src = tempAvatarUrl;
          preview.style.display = 'block';
        }
        if (fallback) fallback.style.display = 'none';
      });

      // Clear photo
      modal.querySelector('#edit-btn-clear-photo')?.addEventListener('click', () => {
        tempAvatarUrl = '';
        const preview = modal.querySelector('#edit-avatar-preview') as HTMLImageElement;
        const fallback = modal.querySelector('#edit-avatar-fallback') as HTMLElement;
        if (preview) preview.style.display = 'none';
        if (fallback) fallback.style.display = 'flex';
      });

      // Remove skill
      modal.querySelectorAll('.profile-skill-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt((btn as HTMLElement).dataset.skillIdx || '-1', 10);
          if (idx >= 0 && idx < activeSkills.length) {
            activeSkills.splice(idx, 1);
            renderModalContent();
          }
        });
      });

      // Add custom skill
      const addSkillInput = modal.querySelector('#edit-new-skill-input') as HTMLInputElement;
      const addSkillBtn = modal.querySelector('#edit-btn-add-skill');
      const handleAddSkill = () => {
        const val = addSkillInput?.value.trim();
        if (val && !activeSkills.includes(val)) {
          activeSkills.push(val);
          renderModalContent();
        }
      };
      addSkillBtn?.addEventListener('click', handleAddSkill);
      addSkillInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAddSkill();
        }
      });

      // Quick skill pills
      modal.querySelectorAll('.edit-quick-skill-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          const skill = (pill as HTMLElement).dataset.skill;
          if (skill && !activeSkills.includes(skill)) {
            activeSkills.push(skill);
            renderModalContent();
          }
        });
      });

      // Cancel edit
      modal.querySelector('#edit-btn-cancel')?.addEventListener('click', () => {
        activeTab = 'showcase';
        renderModalContent();
      });

      // Save form
      modal.querySelector('#profile-full-edit-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = (modal.querySelector('#edit-prof-name') as HTMLInputElement)?.value.trim();
        const title = (modal.querySelector('#edit-prof-title') as HTMLInputElement)?.value.trim();
        const company = (modal.querySelector('#edit-prof-company') as HTMLInputElement)?.value.trim();
        const location = (modal.querySelector('#edit-prof-location') as HTMLInputElement)?.value.trim();
        const linkedinUrl = (modal.querySelector('#edit-prof-linkedin') as HTMLInputElement)?.value.trim();
        const githubUrl = (modal.querySelector('#edit-prof-github') as HTMLInputElement)?.value.trim();
        const websiteUrl = (modal.querySelector('#edit-prof-website') as HTMLInputElement)?.value.trim();
        const bio = (modal.querySelector('#edit-prof-bio') as HTMLTextAreaElement)?.value.trim();

        authStore.updateProfile({
          name: name || currentUser.name,
          title: title || currentUser.title,
          company: company || currentUser.company,
          location: location || currentUser.location,
          linkedinUrl: linkedinUrl || currentUser.linkedinUrl,
          githubUrl: githubUrl || currentUser.githubUrl,
          websiteUrl: websiteUrl || currentUser.websiteUrl,
          bio: bio || currentUser.bio,
          avatarUrl: tempAvatarUrl !== undefined ? tempAvatarUrl : currentUser.avatarUrl,
          skills: [...activeSkills],
        });

        EventBus.emit('notification', {
          message: '✓ Profile and RackSlicer Showcase successfully updated & published!',
          type: 'success',
        });

        activeTab = 'showcase';
        renderModalContent();
      });
    }

    // --- Account View Events ---
    if (activeTab === 'account') {
      modal.querySelector('#prof-btn-view-tiers')?.addEventListener('click', () => {
        modal.remove();
        showSubscriptionModal();
      });

      modal.querySelector('#prof-btn-signin')?.addEventListener('click', () => {
        modal.remove();
        showAuthModal();
      });

      modal.querySelector('#prof-btn-signout')?.addEventListener('click', () => {
        authStore.logout();
        modal.remove();
        if (onLogout) onLogout();
      });
    }
  }

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.body.appendChild(modal);
  renderModalContent();
}

/**
 * Interactive Share Dialog for RackSlicer Profile
 */
function showShareProfileDialog(user: AuthUser): void {
  const existing = document.getElementById('profile-share-dialog');
  if (existing) existing.remove();

  const shareOverlay = document.createElement('div');
  shareOverlay.id = 'profile-share-dialog';
  shareOverlay.className = 'profile-overlay';
  shareOverlay.style.zIndex = '100005';

  const userSlug = (user.name || 'architect').toLowerCase().replace(/\s+/g, '-');
  const profileUrl = `https://rackslicer.io/u/${userSlug}`;
  const shareText = `Check out my verified Datacenter Infrastructure Architect profile & blueprints on RackSlicer! 🏆 ${user.title || 'Infrastructure Architect'} | ${user.stats?.racksDesigned || 68} Racks Built • ${user.stats?.pueOptimized || 1.14} PUE Efficiency.`;

  shareOverlay.innerHTML = `
    <div class="profile-share-modal-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <div style="font-size:16px; font-weight:800; display:flex; align-items:center; gap:8px;">
          <span>🚀</span> <span>Share Your RackSlicer Profile</span>
        </div>
        <button id="share-close-btn" style="background:none; border:none; color:var(--text-secondary); font-size:18px; cursor:pointer;">✕</button>
      </div>

      <p style="font-size:12.5px; color:var(--text-secondary); line-height:1.5; margin:0 0 16px;">
        Showcase your verified rack designs, certified achievements, and infrastructure blueprints with your network and recruiters.
      </p>

      <!-- Copy Profile Link -->
      <div style="margin-bottom:20px;">
        <label style="font-size:11px; font-weight:700; color:var(--text-secondary); text-transform:uppercase; display:block; margin-bottom:6px;">
          Public Profile Link
        </label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="share-link-input" class="profile-input" value="${profileUrl}" readonly style="flex:1; font-family:monospace; font-size:12px;" />
          <button id="share-copy-btn" style="background:var(--accent-primary); color:#ffffff; border:none; padding:8px 14px; border-radius:6px; font-weight:700; font-size:12px; cursor:pointer; white-space:nowrap;">
            📋 Copy Link
          </button>
        </div>
      </div>

      <!-- 1-Click Social Sharing -->
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button id="share-to-linkedin-btn" style="display:flex; align-items:center; justify-content:center; gap:8px; background:#0a66c2; color:#ffffff; border:none; padding:10px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer; transition:all 0.15s ease;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 10.9v8.37H9.2V10.9H6.46M7.83 6.64a1.68 1.68 0 1 0 0 3.36 1.68 1.68 0 0 0 0-3.36z"/></svg>
          <span>Share to LinkedIn Feed</span>
        </button>

        <button id="share-to-twitter-btn" style="display:flex; align-items:center; justify-content:center; gap:8px; background:#000000; border:1px solid rgba(255,255,255,0.2); color:#ffffff; padding:10px; border-radius:8px; font-weight:700; font-size:13px; cursor:pointer;">
          <span>𝕏</span> <span>Share on X / Twitter</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(shareOverlay);

  shareOverlay.querySelector('#share-close-btn')?.addEventListener('click', () => shareOverlay.remove());
  shareOverlay.addEventListener('click', (e) => {
    if (e.target === shareOverlay) shareOverlay.remove();
  });

  // Copy link
  shareOverlay.querySelector('#share-copy-btn')?.addEventListener('click', () => {
    const input = shareOverlay.querySelector('#share-link-input') as HTMLInputElement;
    input?.select();
    try {
      navigator.clipboard.writeText(profileUrl);
    } catch (_) {}
    const btn = shareOverlay.querySelector('#share-copy-btn') as HTMLElement;
    if (btn) btn.innerText = '✓ Copied!';
    EventBus.emit('notification', { message: '✓ Public profile link copied to clipboard!', type: 'success' });
  });

  // LinkedIn
  shareOverlay.querySelector('#share-to-linkedin-btn')?.addEventListener('click', () => {
    const encodedUrl = encodeURIComponent(profileUrl);
    const encodedText = encodeURIComponent(shareText);
    window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${encodedText}%20${encodedUrl}`, '_blank');
  });

  // Twitter
  shareOverlay.querySelector('#share-to-twitter-btn')?.addEventListener('click', () => {
    const encodedText = encodeURIComponent(`${shareText} ${profileUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${encodedText}`, '_blank');
  });
}

/**
 * Publish an individual achievement badge directly to LinkedIn feed
 */
function publishAchievementToLinkedIn(ach: UserAchievement, user: AuthUser): void {
  const achText = encodeURIComponent(
    `Proud to publish my RackSlicer Certified Datacenter Achievement: "${ach.title}"! 🏆\n\n"${ach.description}"\n\nVerified via RackSlicer Infrastructure Platform.\n#DatacenterArchitecture #RackSlicer #InfrastructureEngineering #Hyperscale`
  );
  window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${achText}`, '_blank');
}
