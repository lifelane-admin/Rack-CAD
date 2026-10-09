import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authStore } from '../auth/auth-store';
import { showUserProfileModal } from '../components/user-profile-modal';

describe('User Profile & Public Showcase Studio', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset session
    authStore.logout();
    document.body.innerHTML = '';
  });

  it('initializes default user with rich profile, LinkedIn, skills, and certified achievements', () => {
    const user = authStore.getCurrentUser();
    expect(user).toBeTruthy();
    expect(user.name).toBe('Srinivas Anand');
    expect(user.title).toContain('Architect');
    expect(user.linkedinUrl).toContain('linkedin.com/in/');
    expect(user.skills).toBeInstanceOf(Array);
    expect(user.skills!.length).toBeGreaterThan(0);
    expect(user.achievements).toBeInstanceOf(Array);
    expect(user.achievements!.length).toBeGreaterThan(0);
    expect(user.stats).toBeDefined();
    expect(user.stats!.racksDesigned).toBeGreaterThan(0);
  });

  it('updates and persists user profile information including LinkedIn, photo, and skills', () => {
    const updated = authStore.updateProfile({
      name: 'Srinivas V. Anand',
      title: 'Distinguished Hyperscale Datacenter Fellow',
      linkedinUrl: 'https://www.linkedin.com/in/srinivas-hyperscale-fellow',
      bio: 'Leading 800GbE optical network topologies and liquid-cooled AI superclusters.',
      skills: ['800GbE OSFP Optical', 'Direct-to-Chip Liquid Cooling', 'TIA-942 Tier IV'],
      avatarUrl: 'data:image/png;base64,mockImageDataUrl',
    });

    expect(updated.name).toBe('Srinivas V. Anand');
    expect(updated.title).toBe('Distinguished Hyperscale Datacenter Fellow');
    expect(updated.linkedinUrl).toBe('https://www.linkedin.com/in/srinivas-hyperscale-fellow');
    expect(updated.avatarUrl).toBe('data:image/png;base64,mockImageDataUrl');
    expect(updated.skills).toEqual(['800GbE OSFP Optical', 'Direct-to-Chip Liquid Cooling', 'TIA-942 Tier IV']);

    // Check stored session in localStorage
    const saved = authStore.getCurrentUser();
    expect(saved.name).toBe('Srinivas V. Anand');
    expect(saved.linkedinUrl).toBe('https://www.linkedin.com/in/srinivas-hyperscale-fellow');
  });

  it('renders Public Showcase view by default with verified badge, LinkedIn button, and achievements', () => {
    showUserProfileModal();

    const overlay = document.querySelector('#saas-user-profile-modal');
    expect(overlay).toBeTruthy();

    // Verify verified badge
    const badge = overlay?.querySelector('.profile-verified-badge');
    expect(badge).toBeTruthy();

    // Verify LinkedIn link
    const linkedinBtn = overlay?.querySelector('#prof-btn-linkedin-direct') as HTMLAnchorElement;
    expect(linkedinBtn).toBeTruthy();
    expect(linkedinBtn.href).toContain('linkedin.com');

    // Verify stats grid
    const statsBoxes = overlay?.querySelectorAll('.profile-stat-box');
    expect(statsBoxes && statsBoxes.length).toBe(5);

    // Verify certified achievements
    const achCards = overlay?.querySelectorAll('.profile-achievement-card');
    expect(achCards && achCards.length).toBeGreaterThan(0);

    // Close modal
    const closeBtn = overlay?.querySelector('#profile-close-btn') as HTMLElement;
    closeBtn?.click();
    expect(document.querySelector('#saas-user-profile-modal')).toBeNull();
  });

  it('allows switching to Edit Profile tab and editing profile fields', () => {
    showUserProfileModal(undefined, 'edit');

    const overlay = document.querySelector('#saas-user-profile-modal');
    expect(overlay).toBeTruthy();

    const nameInput = overlay?.querySelector('#edit-prof-name') as HTMLInputElement;
    const titleInput = overlay?.querySelector('#edit-prof-title') as HTMLInputElement;
    const linkedinInput = overlay?.querySelector('#edit-prof-linkedin') as HTMLInputElement;

    expect(nameInput).toBeTruthy();
    expect(titleInput).toBeTruthy();
    expect(linkedinInput).toBeTruthy();

    // Modify name and title
    nameInput.value = 'Srinivas Enterprise';
    titleInput.value = 'Chief Infrastructure Architect';
    linkedinInput.value = 'https://www.linkedin.com/in/srinivas-chief';

    const form = overlay?.querySelector('#profile-full-edit-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    // Verify updated state
    const currentUser = authStore.getCurrentUser();
    expect(currentUser.name).toBe('Srinivas Enterprise');
    expect(currentUser.title).toBe('Chief Infrastructure Architect');
    expect(currentUser.linkedinUrl).toBe('https://www.linkedin.com/in/srinivas-chief');

    const closeBtn = overlay?.querySelector('#profile-close-btn') as HTMLElement;
    closeBtn?.click();
  });

  it('opens Share Profile dialog with public link and 1-click social sharing', () => {
    showUserProfileModal();

    const overlay = document.querySelector('#saas-user-profile-modal');
    const shareBtn = overlay?.querySelector('#prof-btn-share') as HTMLElement;
    expect(shareBtn).toBeTruthy();

    shareBtn.click();

    const shareDialog = document.querySelector('#profile-share-dialog');
    expect(shareDialog).toBeTruthy();

    const linkInput = shareDialog?.querySelector('#share-link-input') as HTMLInputElement;
    expect(linkInput).toBeTruthy();
    expect(linkInput.value).toContain('https://rackslicer.io/u/');

    const linkedinShareBtn = shareDialog?.querySelector('#share-to-linkedin-btn');
    expect(linkedinShareBtn).toBeTruthy();

    const twitterShareBtn = shareDialog?.querySelector('#share-to-twitter-btn');
    expect(twitterShareBtn).toBeTruthy();

    // Close share dialog
    const closeShareBtn = shareDialog?.querySelector('#share-close-btn') as HTMLElement;
    closeShareBtn?.click();
    expect(document.querySelector('#profile-share-dialog')).toBeNull();
  });
});
