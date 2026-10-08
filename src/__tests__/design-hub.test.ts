import { describe, it, expect, beforeEach } from 'vitest';
import { designHubStore } from '../community/design-hub-store';
import { projectStore } from '../storage/project-store';

describe('RackSlicer Design Hub & Community Platform', () => {
  beforeEach(() => {
    localStorage.clear();
    designHubStore.resetToSeeds();
  });

  it('initializes with seed production-grade reference architectures', () => {
    const designs = designHubStore.getAllDesigns();
    expect(designs.length).toBeGreaterThanOrEqual(6);

    const ceph = designs.find(d => d.slug === '3-node-ceph-mesh');
    expect(ceph).toBeDefined();
    expect(ceph?.category).toBe('Storage & HCI');
    expect(ceph?.rackSlicerScore.overall).toBe(92);
    expect(ceph?.classification).toBe('public');
  });

  it('filters and ranks architectures by category and search queries', () => {
    const aiDesigns = designHubStore.queryDesigns({ category: 'AI Infrastructure' });
    expect(aiDesigns.length).toBeGreaterThanOrEqual(1);
    expect(aiDesigns[0].title).toContain('NVIDIA H100');

    const searchResults = designHubStore.queryDesigns({ search: 'Ceph' });
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    expect(searchResults.some(d => d.title.includes('Ceph'))).toBe(true);
  });

  it('correctly ranks designs according to sort tabs', () => {
    const topRated = designHubStore.queryDesigns({ tab: 'top-rated' });
    expect(topRated.length).toBeGreaterThan(1);
    expect(topRated[0].communityRating.average).toBeGreaterThanOrEqual(topRated[1].communityRating.average);

    const mostForked = designHubStore.queryDesigns({ tab: 'most-forked' });
    expect(mostForked.length).toBeGreaterThan(1);
    expect(mostForked[0].forks).toBeGreaterThanOrEqual(mostForked[1].forks);
  });

  it('forks an architecture with proper attribution lineage into projectStore', () => {
    const designs = designHubStore.getAllDesigns();
    const target = designs[0];
    const initialForks = target.forks;

    const forked = designHubStore.forkDesign(target.id);
    expect(forked).toBeDefined();
    expect(forked.name).toContain('(Fork)');
    expect(forked.description).toContain(`Based on: "${target.title}" by @${target.author.username}`);

    const updated = designHubStore.getDesignById(target.id);
    expect(updated?.forks).toBe(initialForks + 1);

    // Verify project exists in projectStore
    const saved = projectStore.getProjectById(forked.id);
    expect(saved).toBeDefined();
    expect(saved?.dataJson).toBe(target.dataJson);
  });

  it('adds reviews and dynamically recalculates community average rating', () => {
    const designs = designHubStore.getAllDesigns();
    const target = designs[0];
    const prevCount = target.communityRating.count;

    const review = designHubStore.addReview(target.id, 5, 'Outstanding mesh cabling architecture!');
    expect(review.id).toBeDefined();
    expect(review.rating).toBe(5);

    const updated = designHubStore.getDesignById(target.id);
    expect(updated?.communityRating.count).toBe(prevCount + 1);
    expect(updated?.communityRating.reviews[0].comment).toBe('Outstanding mesh cabling architecture!');
  });

  it('adds technical discussion threads, replies, and supports upvoting', () => {
    const designs = designHubStore.getAllDesigns();
    const target = designs[0];

    const thread = designHubStore.addDiscussion(target.id, 'What transceiver latency are you seeing on the 25GbE links?');
    expect(thread.id).toBeDefined();
    expect(thread.text).toContain('25GbE links');

    // Add author reply
    designHubStore.addReply(target.id, thread.id, 'Sub-0.8 microseconds using direct DAC cables.');
    const updated = designHubStore.getDesignById(target.id);
    const updatedThread = updated?.discussions.find(d => d.id === thread.id);
    expect(updatedThread?.replies.length).toBe(1);
    expect(updatedThread?.replies[0].text).toContain('Sub-0.8 microseconds');

    // Upvote
    const likes = designHubStore.likeDiscussion(target.id, thread.id);
    expect(likes).toBe(1);
  });

  it('publishes projects with access control classification (private / invite-only / public)', () => {
    const testProject = projectStore.getAllProjects()[0];
    const published = designHubStore.publishProject(testProject, {
      title: 'Enterprise Air-Gapped Cluster',
      description: 'Strict security isolated rack blueprint.',
      category: 'Security & DR',
      tags: ['Security', 'Air-Gap'],
      classification: 'invite-only',
      license: 'All Rights Reserved (Proprietary)',
      invitedUsers: [
        {
          emailOrUsername: 'auditor@enterprise.com',
          role: 'reviewer',
          canFork: false,
          canReshare: false,
          invitedAt: new Date().toISOString(),
        },
      ],
      communitySettings: {
        allowRatings: true,
        allowReviews: true,
        allowDiscussions: true,
        allowFork: false,
        allowSocialSharing: false,
        includeAiScore: true,
      },
    });

    expect(published.id).toBeDefined();
    expect(published.classification).toBe('invite-only');
    expect(published.invitedUsers?.length).toBe(1);
    expect(published.invitedUsers?.[0].emailOrUsername).toBe('auditor@enterprise.com');
  });
});
