import type { CommunityTemplate } from '@creator-network/shared';

export interface TemplateChannel {
  name: string;
  topic: string;
  /** Read-only for @everyone; moderators can post. */
  announcement?: boolean;
}

export interface TemplateCategory {
  name: string;
  channels: TemplateChannel[];
}

/** Starter layouts offered when creating a community. */
export const COMMUNITY_TEMPLATE_LAYOUTS: Record<CommunityTemplate, TemplateCategory[]> = {
  blank: [{ name: 'Text channels', channels: [{ name: 'general', topic: 'Say hello and talk about anything.' }] }],
  'music-collective': [
    {
      name: 'Start here',
      channels: [
        { name: 'announcements', topic: 'News from the collective.', announcement: true },
        { name: 'introductions', topic: 'Who are you, what do you make, what are you working on?' },
      ],
    },
    {
      name: 'Studio',
      channels: [
        { name: 'general', topic: 'Everyday conversation.' },
        { name: 'feedback-loop', topic: 'Share a work in progress and ask for specific feedback.' },
        { name: 'collabs', topic: 'Looking for a vocalist, a mix engineer or a co-producer? Post here.' },
        { name: 'gear-and-plugins', topic: 'Hardware, plugins, DAWs and workflow tips.' },
      ],
    },
    { name: 'Showcase', channels: [{ name: 'releases', topic: 'Finished tracks, EPs and albums.' }] },
  ],
  'record-label': [
    {
      name: 'Label',
      channels: [
        { name: 'announcements', topic: 'Official label news and release dates.', announcement: true },
        { name: 'releases', topic: 'Catalog releases, artwork and liner notes.' },
      ],
    },
    {
      name: 'A&R',
      channels: [
        { name: 'demo-submissions', topic: 'Submit one track per post with a short description.' },
        { name: 'feedback', topic: 'Notes from the A&R team.' },
      ],
    },
    {
      name: 'Community',
      channels: [
        { name: 'general', topic: 'Talk with the roster and the fans.' },
        { name: 'collabs', topic: 'Find collaborators on the roster.' },
      ],
    },
  ],
  'game-studio': [
    {
      name: 'Studio',
      channels: [
        { name: 'announcements', topic: 'Milestones, builds and deadlines.', announcement: true },
        { name: 'devlog', topic: 'What changed today.' },
      ],
    },
    {
      name: 'Production',
      channels: [
        { name: 'art', topic: 'Concept art, sprites, models and UI.' },
        { name: 'audio', topic: 'Music, SFX and implementation.' },
        { name: 'design', topic: 'Mechanics, levels and narrative.' },
        { name: 'playtesting', topic: 'Builds to test and feedback.' },
      ],
    },
    { name: 'Community', channels: [{ name: 'general', topic: 'Everything else.' }] },
  ],
  'art-collective': [
    {
      name: 'Start here',
      channels: [
        { name: 'announcements', topic: 'Collective news and open calls.', announcement: true },
        { name: 'introductions', topic: 'Introduce yourself and your style.' },
      ],
    },
    {
      name: 'Studio',
      channels: [
        { name: 'wip', topic: 'Works in progress.' },
        { name: 'critique', topic: 'Ask for honest, kind, specific critique.' },
        { name: 'references', topic: 'Inspiration and reference boards.' },
      ],
    },
    {
      name: 'Business',
      channels: [{ name: 'commissions-info', topic: 'Rates, availability and commission etiquette.' }],
    },
  ],
};
