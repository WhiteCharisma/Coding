/**
 * Demo content: fictional creators, communities and conversations that show
 * what the platform is for. Everything created here is flagged `is_demo` and is
 * labelled "Demo" in the UI. Artwork and audio are generated procedurally
 * (src/seed/art.ts, src/seed/audio.ts) — no third-party assets.
 *
 * Demo accounts get random passwords nobody knows; they cannot be signed into.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, inArray, or } from 'drizzle-orm';
import type { CommunityTemplate, Discipline } from '@creator-network/shared';
import { Permission } from '@creator-network/shared';
import type { AppContext } from '../context';
import { newId, newIdAt } from '../db/ids';
import {
  channelParticipants,
  channels,
  communities,
  communityMembers,
  memberRoles,
  messageMentions,
  messageReactions,
  messages,
  roles,
  uploads,
  users,
} from '../db/schema';
import { randomToken } from '../lib/crypto';
import { hashPassword } from '../lib/password';
import { addMemberDirect, createCommunity, removeCommunity } from '../communities/service';
import { deleteStoredFile, resolveStoragePath, storageKeyFor } from '../uploads/service';
import type { UserRow } from '../users/dto';
import { bauhaus, blobs, dunes, glow, ripples, sunsetGrid } from './art';
import { synthesize, type TrackSpec } from './audio';

interface DemoUser {
  key: string;
  username: string;
  displayName: string;
  headline: string;
  bio: string;
  disciplines: Discipline[];
  location: string;
  timezone: string;
  projects: string;
  links: { label: string; url: string }[];
  palette: [string, string, string];
  bannerHue: number;
}

const USERS: DemoUser[] = [
  {
    key: 'mara',
    username: 'mara.okafor',
    displayName: 'Mara Okafor',
    headline: 'Producer & mix engineer',
    bio: 'Late-night downtempo, broken beats and too many tape delays. Mixing for independent artists since 2016. Lagos-born, Berlin-based.',
    disciplines: ['music-production', 'mixing-mastering', 'sound-design'],
    location: 'Berlin, Germany',
    timezone: 'Europe/Berlin',
    projects: 'Glasshouse EP (Lowlight Records) · mixing a debut LP for a Lisbon jazz trio',
    links: [{ label: 'Portfolio', url: 'https://example.com/mara-okafor' }],
    palette: ['#1d1a2b', '#f0b45a', '#c35a7a'],
    bannerHue: 32,
  },
  {
    key: 'theo',
    username: 'theolind',
    displayName: 'Theo Lindqvist',
    headline: 'Composer for games',
    bio: 'Adaptive scores for small games with big feelings. Music boxes, felt pianos and the occasional modular patch.',
    disciplines: ['composition', 'game-audio'],
    location: 'Stockholm, Sweden',
    timezone: 'Europe/Stockholm',
    projects: 'Score for "Lantern" (Moth & Lantern Games)',
    links: [{ label: 'Showreel', url: 'https://example.com/theo-showreel' }],
    palette: ['#14202b', '#7fb8d6', '#e9d8a6'],
    bannerHue: 200,
  },
  {
    key: 'juniper',
    username: 'juniperhale',
    displayName: 'Juniper Hale',
    headline: 'Illustrator & character designer',
    bio: 'Characters, creatures and cover art. Gouache on paper, then far too long in Procreate.',
    disciplines: ['illustration', 'character-design'],
    location: 'Portland, USA',
    timezone: 'America/Los_Angeles',
    projects: 'Character sheets for Lantern · album art commissions open in spring',
    links: [{ label: 'Gallery', url: 'https://example.com/juniper-hale' }],
    palette: ['#2a1f1a', '#e07a5f', '#81b29a'],
    bannerHue: 14,
  },
  {
    key: 'kenji',
    username: 'arai.mastering',
    displayName: 'Kenji Arai',
    headline: 'Mastering engineer · Arai Mastering',
    bio: 'Mastering for vinyl, streaming and film. Analog chain, honest metering, no loudness wars.',
    disciplines: ['mixing-mastering', 'audio-engineering'],
    location: 'Osaka, Japan',
    timezone: 'Asia/Tokyo',
    projects: 'Jazz trio LP · Glasshouse EP',
    links: [{ label: 'Studio', url: 'https://example.com/arai-mastering' }],
    palette: ['#101418', '#8ab0ab', '#f4f1de'],
    bannerHue: 170,
  },
  {
    key: 'sofia',
    username: 'sofiamarin',
    displayName: 'Sofia Marín',
    headline: 'Singer-songwriter',
    bio: 'Bedroom ballads in Spanish and English. Writing on a nylon-string guitar that is older than me.',
    disciplines: ['songwriting', 'vocals', 'instrumentalist'],
    location: 'Valencia, Spain',
    timezone: 'Europe/Madrid',
    projects: 'Night Bus Home (demo) · looking for a cellist',
    links: [],
    palette: ['#2b1d2e', '#f2a07b', '#9d8df1'],
    bannerHue: 280,
  },
  {
    key: 'lowlight',
    username: 'lowlightrecords',
    displayName: 'Lowlight Records',
    headline: 'Independent label — ambient, downtempo, left-field electronic',
    bio: 'A small label for music that sounds like 2 a.m. Artist-first contracts, 50/50 splits, physical runs on recycled vinyl.',
    disciplines: ['label-management', 'a-and-r'],
    location: 'Rotterdam, Netherlands',
    timezone: 'Europe/Amsterdam',
    projects: 'Autumn compilation · Glasshouse EP',
    links: [{ label: 'Catalog', url: 'https://example.com/lowlight-records' }],
    palette: ['#0f0f12', '#f0b45a', '#3a3a48'],
    bannerHue: 38,
  },
  {
    key: 'moth',
    username: 'mothlantern',
    displayName: 'Moth & Lantern Games',
    headline: 'Two-person indie studio making cozy horror',
    bio: 'We make small games about light, fear and friendship. Currently: "Lantern", a stealth-puzzle game where the light is your only friend.',
    disciplines: ['game-development'],
    location: 'Glasgow, UK',
    timezone: 'Europe/London',
    projects: 'Lantern (vertical slice)',
    links: [{ label: 'Devlog', url: 'https://example.com/moth-lantern' }],
    palette: ['#0d1117', '#f6c26b', '#5b4b8a'],
    bannerHue: 45,
  },
  {
    key: 'priya',
    username: 'priya.n',
    displayName: 'Priya Natarajan',
    headline: 'Sound designer',
    bio: 'Foley, creature sounds and UI audio. If it squeaks, I have probably recorded it.',
    disciplines: ['sound-design', 'game-audio'],
    location: 'Bengaluru, India',
    timezone: 'Asia/Kolkata',
    projects: 'Creature library vol. 2',
    links: [],
    palette: ['#1b1b2f', '#e43f5a', '#f1c40f'],
    bannerHue: 350,
  },
  {
    key: 'elias',
    username: 'eliasbrandt',
    displayName: 'Elias Brandt',
    headline: '3D artist & animator',
    bio: 'Stylised 3D, hand-painted textures, low-poly worlds.',
    disciplines: ['3d-art', 'animation'],
    location: 'Vienna, Austria',
    timezone: 'Europe/Vienna',
    projects: 'Environment kit for Lantern',
    links: [],
    palette: ['#16222a', '#3a6073', '#e8d5b7'],
    bannerHue: 190,
  },
  {
    key: 'nia',
    username: 'nia.thompson',
    displayName: 'Nia Thompson',
    headline: 'A&R at Lowlight Records',
    bio: 'I listen to every demo. Really. Send one track, tell me why it matters to you.',
    disciplines: ['a-and-r', 'label-management'],
    location: 'London, UK',
    timezone: 'Europe/London',
    projects: 'Autumn compilation curation',
    links: [],
    palette: ['#20141f', '#d9a5b3', '#7c9eb2'],
    bannerHue: 330,
  },
];

type Attach = { type: 'image'; name: string; art: () => Buffer } | { type: 'audio'; name: string; track: TrackSpec };

interface Msg {
  by: string;
  text: string;
  /** Minutes after the previous message. */
  gap?: number;
  reply?: number; // index of an earlier message in the same channel
  reactions?: Record<string, string[]>;
  pin?: boolean;
  attach?: Attach[];
}

interface DemoCommunity {
  key: string;
  owner: string;
  name: string;
  description: string;
  template: CommunityTemplate;
  tags: string[];
  icon: () => Buffer;
  members: string[];
  moderators: string[];
  extraRoles?: { name: string; color: string; members: string[]; permissions?: number }[];
  channels: Record<string, Msg[]>;
}

const TRACKS: Record<string, TrackSpec> = {
  glasshouse: {
    bpm: 92,
    style: 'downtempo',
    seed: 'glasshouse',
    chords: [
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [55, 59, 62, 65],
      [52, 55, 59, 62],
    ],
    melody: [
      76,
      null,
      74,
      null,
      72,
      null,
      74,
      71,
      null,
      null,
      69,
      null,
      72,
      null,
      71,
      null,
      69,
      null,
      67,
      null,
      69,
      null,
      null,
      null,
      72,
      null,
      74,
      null,
      76,
      null,
      79,
      null,
    ],
  },
  nightbus: {
    bpm: 82,
    style: 'lofi',
    seed: 'night-bus',
    chords: [
      [53, 56, 60, 63],
      [51, 55, 58, 62],
      [49, 53, 56, 60],
      [48, 51, 55, 58],
    ],
    melody: [72, null, null, 70, null, 68, null, null, 67, null, 68, null, 70, null, null, null],
  },
  lantern: {
    bpm: 96,
    style: 'musicbox',
    seed: 'lantern',
    chords: [
      [60, 64, 67],
      [57, 60, 64],
      [53, 57, 60],
      [55, 59, 62],
    ],
    melody: [
      79,
      76,
      72,
      76,
      81,
      79,
      76,
      null,
      77,
      74,
      71,
      74,
      79,
      77,
      74,
      null,
      76,
      72,
      69,
      72,
      77,
      76,
      72,
      null,
      74,
      71,
      67,
      71,
      76,
      74,
      71,
      null,
    ],
  },
  staticbloom: {
    bpm: 108,
    style: 'synthwave',
    seed: 'static-bloom',
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ],
    melody: [
      69,
      null,
      72,
      null,
      76,
      null,
      74,
      72,
      69,
      null,
      72,
      null,
      77,
      null,
      76,
      74,
      67,
      null,
      72,
      null,
      76,
      null,
      74,
      72,
      71,
      null,
      74,
      null,
      79,
      null,
      77,
      76,
    ],
  },
};

const COMMUNITIES: DemoCommunity[] = [
  {
    key: 'lowlight',
    owner: 'lowlight',
    name: 'Lowlight Records',
    description:
      'The home of Lowlight Records: release news, demo submissions and a place for the roster and listeners to hang out.',
    template: 'record-label',
    tags: ['music', 'label'],
    icon: () => glow(192, ['#0f0f12', '#f6d29b', '#f0b45a', '#f0b45a'], 'lowlight-icon'),
    members: ['mara', 'kenji', 'sofia', 'nia', 'theo', 'priya'],
    moderators: ['nia'],
    extraRoles: [
      { name: 'Roster', color: '#f0b45a', members: ['mara', 'sofia'] },
      {
        name: 'A&R',
        color: '#c9a7f5',
        members: ['nia'],
        permissions: Permission.MANAGE_MESSAGES | Permission.MENTION_EVERYONE,
      },
    ],
    channels: {
      announcements: [
        {
          by: 'lowlight',
          text: 'Welcome to the new Lowlight community space 🌙 Release news lands here first. Say hello in #general.',
          reactions: { '🙌': ['mara', 'sofia', 'kenji'] },
        },
        {
          by: 'lowlight',
          gap: 1440,
          text: '📣 **Glasshouse EP** by @mara.okafor is out this Friday. Four tracks of late-night downtempo, mastered by @arai.mastering. Physical run: 300 copies on recycled vinyl.',
          pin: true,
          attach: [
            {
              type: 'image',
              name: 'glasshouse-cover.png',
              art: () => sunsetGrid(384, ['#1a1030', '#5b2a6e', '#ffd27a', '#f0763a', '#ff5fa2', '#120a1f']),
            },
          ],
          reactions: { '🔥': ['mara', 'kenji', 'sofia', 'nia', 'theo'], '🎧': ['priya', 'sofia'] },
        },
        {
          by: 'lowlight',
          gap: 600,
          text: 'Submissions for the autumn compilation are open until the 30th. One track per artist in #demo-submissions, with a sentence about what it means to you.',
        },
      ],
      releases: [
        {
          by: 'mara',
          text: 'Title track preview for Glasshouse. Would love to know how the low end translates on headphones vs. speakers 🎧',
          attach: [{ type: 'audio', name: 'Glasshouse (preview).wav', track: TRACKS.glasshouse as TrackSpec }],
          reactions: { '🔥': ['sofia', 'nia', 'theo', 'lowlight'], '🎧': ['kenji'] },
        },
        {
          by: 'kenji',
          gap: 35,
          reply: 0,
          text: 'Translates well on my monitors and on cheap earbuds. I left about 1 dB of true-peak headroom so streaming normalisation does not flatten the kick.',
        },
        { by: 'sofia', gap: 12, text: 'The pad that comes in around 0:06 🤯 what is that?' },
        {
          by: 'mara',
          gap: 9,
          reply: 2,
          text: 'Two detuned saws through a tape delay, then resampled and pitched down an octave. Happy accident at 3 a.m.',
        },
      ],
      'demo-submissions': [
        {
          by: 'sofia',
          text: 'Submitting "Night Bus Home" for the compilation — a lo-fi ballad, the vocal is still a guide take. 82 BPM, F minor. It is about the last bus after a gig.',
          attach: [{ type: 'audio', name: 'Night Bus Home (demo).wav', track: TRACKS.nightbus as TrackSpec }],
          reactions: { '❤️': ['nia', 'mara'] },
        },
        {
          by: 'nia',
          gap: 180,
          reply: 0,
          text: 'Love the chord movement in the third bar. Could you send a version with the vocal up 2 dB? We will talk about it in Thursday’s A&R call.',
        },
        { by: 'sofia', gap: 20, text: 'Will do! @nia.thompson I will upload stems tonight.' },
      ],
      feedback: [
        {
          by: 'nia',
          text: 'General note for everyone submitting: export at -1 dBTP, no limiter on the master if you can avoid it, and name files "artist – title".',
        },
      ],
      general: [
        { by: 'theo', text: 'Anyone going to the panel on independent distribution next month?' },
        { by: 'mara', gap: 15, text: 'Yes! I will be there with a box of test pressings.' },
        {
          by: 'priya',
          gap: 42,
          text: 'Recording rain on a tin roof today for a client. If anyone needs ambience, ask 🌧️',
        },
      ],
      collabs: [
        {
          by: 'sofia',
          text: 'Looking for a cellist for an ambient arrangement of "Night Bus Home". Remote is fine and there is a small budget. DM me!',
          reactions: { '👀': ['mara'] },
        },
      ],
    },
  },
  {
    key: 'collective',
    owner: 'mara',
    name: 'Synth & Sample Collective',
    description:
      'Producers sharing works in progress, honest feedback, gear talk and finished releases. Monthly listening session on the first Sunday.',
    template: 'music-collective',
    tags: ['music', 'production', 'feedback', 'collective'],
    icon: () => ripples(192, ['#16121f', '#2c2340', '#f0b45a'], 'collective-icon'),
    members: ['theo', 'kenji', 'sofia', 'priya', 'elias', 'nia', 'juniper'],
    moderators: ['kenji'],
    channels: {
      announcements: [
        {
          by: 'mara',
          text: 'Welcome to the collective! Rules are simple: be kind, be specific, and give feedback before you ask for it. Listening session: first Sunday of the month, 19:00 CET.',
          pin: true,
          reactions: { '👏': ['theo', 'priya', 'kenji'] },
        },
      ],
      introductions: [
        {
          by: 'priya',
          text: 'Hi! Sound designer from Bengaluru — creature sounds, foley and UI audio. Here to learn more about music production.',
        },
        {
          by: 'elias',
          gap: 60,
          text: 'Hey all, I mostly do 3D but I have been making ambient loops for my environments. Total beginner with mixing.',
        },
        {
          by: 'juniper',
          gap: 30,
          text: 'Illustrator here 🎨 I draw while listening to everything you post, so keep posting.',
          reactions: { '❤️': ['mara', 'priya'] },
        },
      ],
      general: [
        { by: 'kenji', text: 'Reminder that loudness is a choice, not a requirement. Dynamics are a feature.' },
        { by: 'theo', gap: 22, text: 'Printing this on a t-shirt.' },
      ],
      'feedback-loop': [
        {
          by: 'mara',
          text: 'WIP: "Static Bloom" — going for a synthwave-meets-UK-garage thing. The bass feels muddy to me around 200 Hz, any ideas?',
          attach: [{ type: 'audio', name: 'Static Bloom (WIP).wav', track: TRACKS.staticbloom as TrackSpec }],
        },
        {
          by: 'priya',
          gap: 40,
          reply: 0,
          text: 'Try sidechaining the pad to the kick lightly (2–3 dB) and a gentle dip around 220 Hz on the pad bus. The bass will breathe.',
        },
        {
          by: 'kenji',
          gap: 18,
          text: 'Also check mono compatibility — the stereo widener on the bass is fighting the kick in mono.',
        },
        {
          by: 'mara',
          gap: 64,
          text: 'Both fixed it. Thank you 🙏 v2 tomorrow.',
          reactions: { '🙌': ['priya', 'kenji'] },
        },
      ],
      collabs: [
        {
          by: 'elias',
          text: 'Need a 60-second ambient loop for an environment showcase video. Credit + a 3D asset pack of your choice in return.',
        },
      ],
      'gear-and-plugins': [
        {
          by: 'theo',
          text: 'Has anyone moved their whole template to 48 kHz? Wondering if it is worth it for game work.',
        },
        {
          by: 'kenji',
          gap: 25,
          text: 'For games and film, yes — engines and video are 48k native. For music-only releases it matters much less than gain staging.',
        },
      ],
      releases: [
        {
          by: 'kenji',
          text: 'Mastered a jazz trio record this week. The room mics were gorgeous — barely touched them.',
          reactions: { '🎧': ['mara', 'sofia'] },
        },
      ],
    },
  },
  {
    key: 'guild',
    owner: 'theo',
    name: 'Indie Game Audio Guild',
    description:
      'Composers, sound designers and developers making games sound alive. Monthly jams, devlogs and implementation help.',
    template: 'game-studio',
    tags: ['game-audio', 'game-dev', 'music'],
    icon: () => bauhaus(192, ['#141c26', '#7fb8d6', '#f0b45a', '#e07a5f'], 'guild-icon'),
    members: ['priya', 'moth', 'elias', 'juniper', 'mara'],
    moderators: ['priya'],
    channels: {
      announcements: [
        {
          by: 'theo',
          text: 'Jam #12 theme: **"Small lights in big places"**. 72 hours, starts Friday 18:00 UTC. Teams of up to four — composers welcome!',
          pin: true,
          reactions: { '🕹️': ['moth', 'priya', 'elias'], '🔥': ['juniper'] },
        },
      ],
      devlog: [
        {
          by: 'moth',
          text: 'Day 14: the lantern light now pulses with the music’s amplitude. Tiny change, huge mood.',
          attach: [
            {
              type: 'image',
              name: 'lantern-mood.png',
              art: () => glow(384, ['#0b0d14', '#ffe6a8', '#f6a94b', '#5b4b8a'], 'lantern-mood'),
            },
          ],
          reactions: { '😮': ['theo', 'priya'], '✨': ['juniper'] },
        },
        { by: 'elias', gap: 90, text: 'The environment kit is 70% done — moss shader next.' },
      ],
      art: [
        {
          by: 'juniper',
          text: 'Character concept for the lantern-keeper. Shapes first, details later.',
          attach: [
            {
              type: 'image',
              name: 'keeper-concept.png',
              art: () => bauhaus(384, ['#1e1a24', '#e07a5f', '#f2cc8f', '#81b29a', '#3d405b'], 'keeper'),
            },
          ],
          reactions: { '🎨': ['moth', 'elias'], '❤️': ['theo'] },
        },
        {
          by: 'elias',
          gap: 55,
          reply: 0,
          text: 'That silhouette will read really well in 3D. Can I block it out this weekend?',
        },
      ],
      audio: [
        {
          by: 'theo',
          text: 'Lantern theme loop for the prototype — music box over a soft pad. Should it loop after 4 bars or 8?',
          attach: [{ type: 'audio', name: 'Lantern Theme (loop).wav', track: TRACKS.lantern as TrackSpec }],
          reactions: { '🎹': ['moth', 'priya'] },
        },
        {
          by: 'moth',
          gap: 30,
          reply: 0,
          text: 'Eight please! Players sit in the safe rooms for a while and four bars gets repetitive.',
        },
        { by: 'priya', gap: 14, text: 'I can make a few creaky-floor variations that sit in the same key area 👀' },
      ],
      design: [
        {
          by: 'moth',
          text: 'Design pillar check: every sound should tell the player something. If it is just decoration, it is too loud.',
        },
      ],
      playtesting: [
        {
          by: 'moth',
          text: 'Build 0.4 is up for guild members — mostly testing whether the audio cues are readable without visuals.',
        },
      ],
      general: [
        {
          by: 'priya',
          text: 'Who else names their files "final_final_v3_REAL.wav"? 🙃',
          reactions: { '😂': ['theo', 'mara', 'elias'] },
        },
      ],
    },
  },
  {
    key: 'pigment',
    owner: 'juniper',
    name: 'Pixel & Pigment',
    description:
      'An art collective for illustrators, character designers, animators and 3D artists. WIPs, critique and commission etiquette.',
    template: 'art-collective',
    tags: ['illustration', 'animation', '3d', 'design'],
    icon: () => dunes(192, ['#1c1720', '#e07a5f', '#f2cc8f', '#81b29a'], 'pigment-icon'),
    members: ['elias', 'moth', 'sofia', 'mara'],
    moderators: ['elias'],
    channels: {
      announcements: [
        {
          by: 'juniper',
          text: 'October challenge: **"Sound you can see"** — pick a track from someone in this community and draw what it feels like.',
          pin: true,
          reactions: { '🎨': ['elias', 'sofia'] },
        },
      ],
      introductions: [
        { by: 'sofia', text: 'Not an artist, but I would love cover art for my first single one day — hello! 👋' },
      ],
      wip: [
        {
          by: 'juniper',
          text: 'Cover art sketch inspired by Glasshouse. Too busy?',
          attach: [
            {
              type: 'image',
              name: 'glasshouse-study.png',
              art: () => ripples(384, ['#1f1a2e', '#3b2f5c', '#f0b45a'], 'glasshouse-study'),
            },
          ],
        },
        {
          by: 'elias',
          gap: 33,
          text: 'Low-poly dunes for the Lantern overworld. Still need fog.',
          attach: [
            {
              type: 'image',
              name: 'dunes-wip.png',
              art: () => dunes(384, ['#2b2d42', '#8d99ae', '#ef8354', '#4f5d75', '#2d3142'], 'dunes'),
            },
          ],
        },
      ],
      critique: [
        {
          by: 'elias',
          text: '@juniperhale the Glasshouse study works for me — maybe drop the outer ring contrast so the centre glows more?',
        },
        { by: 'juniper', gap: 20, text: 'Good call. Doing a value pass tonight.' },
      ],
      'commissions-info': [
        {
          by: 'juniper',
          text: 'Until built-in commissions arrive, agree on scope, price, deadline and usage rights in writing before starting. Never pay through links from people you do not know.',
          pin: true,
        },
      ],
    },
  },
];

const DM_THREADS: { users: string[]; name?: string; msgs: Msg[] }[] = [
  {
    users: ['mara', 'kenji'],
    msgs: [
      {
        by: 'mara',
        text: 'Kenji, thank you again for the Glasshouse masters. Could we do one more pass on track 3 with a touch less high shelf?',
      },
      {
        by: 'kenji',
        gap: 95,
        text: 'Of course. I will send it tomorrow morning my time, and a vinyl pre-master with the sibilance tamed.',
      },
    ],
  },
  {
    users: ['theo', 'priya', 'moth'],
    name: 'Lantern audio',
    msgs: [
      {
        by: 'moth',
        text: 'Kick-off for the Lantern audio pass: Theo on music, Priya on sound design. Deadline for the vertical slice is the 20th.',
      },
      { by: 'theo', gap: 12, text: 'Sounds good. I will share the stems folder structure today.' },
      { by: 'priya', gap: 7, text: 'I will start with footsteps on five surfaces and the lantern hum.' },
    ],
  },
];

function writeUpload(
  uploaderId: string,
  purpose: 'attachment' | 'avatar' | 'community_icon',
  name: string,
  mime: string,
  data: Buffer,
  extra: Partial<typeof uploads.$inferInsert>,
) {
  const id = newId();
  const storageKey = storageKeyFor(id);
  return { id, storageKey, purpose, name, mime, size: data.length, data, uploaderId, extra };
}

type PendingUpload = ReturnType<typeof writeUpload>;

async function persistUploads(ctx: AppContext, list: PendingUpload[]): Promise<void> {
  for (const u of list) {
    const full = resolveStoragePath(ctx, u.storageKey);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, u.data, { mode: 0o600 });
  }
}

export async function seedDemoData(ctx: AppContext, opts: { member?: string } = {}): Promise<string> {
  const existing = ctx.db.select({ id: users.id }).from(users).where(eq(users.isDemo, true)).get();
  if (existing) return 'Demo data is already present. Run "purge-demo" first to recreate it.';

  const start = Date.now() - 6 * 24 * 3600_000;
  const userIds = new Map<string, string>();
  const userRows = new Map<string, UserRow>();
  const files: PendingUpload[] = [];

  // Users with generated avatars.
  for (const u of USERS) {
    const id = newId();
    userIds.set(u.key, id);
    const avatar = writeUpload(id, 'avatar', `${u.username}.png`, 'image/png', blobs(192, u.palette, u.username), {
      width: 192,
      height: 192,
    });
    files.push(avatar);
    const row = {
      id,
      username: u.username,
      email: `${u.username}@demo.invalid`,
      emailVerifiedAt: start,
      passwordHash: await hashPassword(randomToken(24)),
      displayName: u.displayName,
      headline: u.headline,
      bio: u.bio,
      disciplines: u.disciplines,
      location: u.location,
      timezone: u.timezone,
      links: u.links,
      currentProjects: u.projects,
      bannerHue: u.bannerHue,
      isDemo: true,
      onboardingCompletedAt: start,
      createdAt: start,
      updatedAt: start,
    };
    ctx.db.insert(users).values(row).run();
    userRows.set(u.key, ctx.db.select().from(users).where(eq(users.id, id)).get() as UserRow);
  }
  await persistUploads(ctx, files);
  for (const f of files) {
    ctx.db
      .insert(uploads)
      .values({
        id: f.id,
        uploaderId: f.uploaderId,
        purpose: f.purpose,
        name: f.name,
        mime: f.mime,
        size: f.size,
        storageKey: f.storageKey,
        status: 'attached',
        createdAt: start,
        ...f.extra,
      })
      .run();
    ctx.db.update(users).set({ avatarId: f.id }).where(eq(users.id, f.uploaderId)).run();
  }

  let clock = start;
  const tick = (minutes = 3) => {
    clock += Math.max(1, minutes) * 60_000 + Math.floor(Math.random() * 50_000);
    return clock;
  };
  const uid = (key: string) => userIds.get(key) as string;
  let messageCount = 0;

  const writeThread = async (channelId: string, msgs: Msg[]) => {
    const ids: string[] = [];
    for (const m of msgs) {
      const t = tick(m.gap ?? 4);
      const id = newIdAt(t);
      ids.push(id);
      const authorId = uid(m.by);
      ctx.db
        .insert(messages)
        .values({
          id,
          channelId,
          authorId,
          content: m.text,
          replyToId: m.reply !== undefined ? (ids[m.reply] ?? null) : null,
          mentionEveryone: false,
          pinnedAt: m.pin ? t : null,
          pinnedBy: m.pin ? authorId : null,
          createdAt: t,
          updatedAt: t,
        })
        .run();
      const mentioned = [...m.text.matchAll(/@([a-z0-9._-]+)/g)]
        .map((x) => USERS.find((u) => u.username === x[1]))
        .filter((u): u is DemoUser => !!u);
      if (mentioned.length)
        ctx.db
          .insert(messageMentions)
          .values(mentioned.map((u) => ({ messageId: id, userId: uid(u.key) })))
          .onConflictDoNothing()
          .run();
      for (const [emoji, who] of Object.entries(m.reactions ?? {})) {
        ctx.db
          .insert(messageReactions)
          .values(who.map((k, i) => ({ messageId: id, userId: uid(k), emoji, createdAt: t + (i + 1) * 60_000 })))
          .onConflictDoNothing()
          .run();
      }
      for (const a of m.attach ?? []) {
        if (a.type === 'image') {
          const data = a.art();
          const up = writeUpload(authorId, 'attachment', a.name, 'image/png', data, {});
          await persistUploads(ctx, [up]);
          ctx.db
            .insert(uploads)
            .values({
              id: up.id,
              uploaderId: authorId,
              purpose: 'attachment',
              channelId,
              messageId: id,
              name: a.name,
              mime: 'image/png',
              size: data.length,
              storageKey: up.storageKey,
              width: data.readUInt32BE(16),
              height: data.readUInt32BE(20),
              status: 'attached',
              createdAt: t,
            })
            .run();
        } else {
          const rendered = synthesize(a.track);
          const up = writeUpload(authorId, 'attachment', a.name, 'audio/wav', rendered.wav, {});
          await persistUploads(ctx, [up]);
          ctx.db
            .insert(uploads)
            .values({
              id: up.id,
              uploaderId: authorId,
              purpose: 'attachment',
              channelId,
              messageId: id,
              name: a.name,
              mime: 'audio/wav',
              size: rendered.wav.length,
              storageKey: up.storageKey,
              durationMs: rendered.durationMs,
              waveform: rendered.peaks,
              status: 'attached',
              createdAt: t,
            })
            .run();
        }
      }
      messageCount++;
    }
    const last = ids[ids.length - 1];
    if (last)
      ctx.db
        .update(channels)
        .set({ lastMessageId: last, lastMessageAt: clock })
        .where(eq(channels.id, channelId))
        .run();
  };

  const createdCommunities: string[] = [];
  for (const c of COMMUNITIES) {
    const owner = userRows.get(c.owner) as UserRow;
    const dto = createCommunity(
      ctx,
      owner,
      { name: c.name, description: c.description, visibility: 'public', template: c.template, tags: c.tags as never },
      { isDemo: true, bypassChecks: true },
    );
    createdCommunities.push(dto.id);
    const icon = writeUpload(owner.id, 'community_icon', `${c.key}.png`, 'image/png', c.icon(), {
      width: 192,
      height: 192,
    });
    await persistUploads(ctx, [icon]);
    ctx.db
      .insert(uploads)
      .values({
        id: icon.id,
        uploaderId: owner.id,
        purpose: 'community_icon',
        name: icon.name,
        mime: 'image/png',
        size: icon.size,
        storageKey: icon.storageKey,
        width: 192,
        height: 192,
        status: 'attached',
        createdAt: start,
      })
      .run();
    ctx.db
      .update(communities)
      .set({ iconId: icon.id, createdAt: start, updatedAt: start })
      .where(eq(communities.id, dto.id))
      .run();

    for (const key of c.members) addMemberDirect(ctx, dto.id, uid(key));
    const moderatorRole = ctx.db
      .select()
      .from(roles)
      .where(and(eq(roles.communityId, dto.id), eq(roles.name, 'Moderator')))
      .get();
    if (moderatorRole) {
      for (const key of c.moderators)
        ctx.db
          .insert(memberRoles)
          .values({ communityId: dto.id, userId: uid(key), roleId: moderatorRole.id })
          .onConflictDoNothing()
          .run();
    }
    let position = 2;
    for (const r of c.extraRoles ?? []) {
      const roleId = newId();
      ctx.db
        .insert(roles)
        .values({
          id: roleId,
          communityId: dto.id,
          name: r.name,
          color: r.color,
          position: position++,
          permissions: r.permissions ?? 0,
          hoist: true,
          createdAt: start,
        })
        .run();
      for (const key of r.members)
        ctx.db
          .insert(memberRoles)
          .values({ communityId: dto.id, userId: uid(key), roleId })
          .onConflictDoNothing()
          .run();
    }

    const channelRows = ctx.db.select().from(channels).where(eq(channels.communityId, dto.id)).all();
    for (const [name, msgs] of Object.entries(c.channels)) {
      const ch = channelRows.find((x) => x.name === name);
      if (ch) await writeThread(ch.id, msgs);
    }
  }

  for (const dm of DM_THREADS) {
    const ids = dm.users.map(uid);
    const id = newId();
    ctx.db
      .insert(channels)
      .values({
        id,
        kind: dm.users.length === 2 ? 'dm' : 'group_dm',
        name: dm.name ?? '',
        ownerId: dm.users.length > 2 ? ids[0] : null,
        dmKey: dm.users.length === 2 ? [...ids].sort().join(':') : null,
        createdAt: start,
        updatedAt: start,
      })
      .run();
    ctx.db
      .insert(channelParticipants)
      .values(ids.map((userId) => ({ channelId: id, userId, joinedAt: start })))
      .run();
    await writeThread(id, dm.msgs);
  }

  if (opts.member) {
    const member = ctx.db.select().from(users).where(eq(users.username, opts.member.toLowerCase())).get();
    if (member) for (const id of createdCommunities) addMemberDirect(ctx, id, member.id);
  }

  return `Demo data created: ${USERS.length} demo users, ${COMMUNITIES.length} public communities, ${messageCount} messages. Demo content is labelled "Demo" in the app; remove it any time with "purge-demo".`;
}

export async function purgeDemoData(ctx: AppContext): Promise<string> {
  const demoUsers = ctx.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isDemo, true))
    .all()
    .map((u) => u.id);
  const demoCommunities = ctx.db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.isDemo, true))
    .all()
    .map((c) => c.id);
  for (const id of demoCommunities) removeCommunity(ctx, id, null, 'community.demo_purged', 'platform');
  if (demoUsers.length) {
    const dmChannels = ctx.db
      .select({ id: channelParticipants.channelId })
      .from(channelParticipants)
      .innerJoin(channels, eq(channels.id, channelParticipants.channelId))
      .where(
        and(inArray(channelParticipants.userId, demoUsers), or(eq(channels.kind, 'dm'), eq(channels.kind, 'group_dm'))),
      )
      .all()
      .map((r) => r.id);
    if (dmChannels.length) ctx.db.delete(channels).where(inArray(channels.id, dmChannels)).run();
    const files = ctx.db
      .select({ storageKey: uploads.storageKey })
      .from(uploads)
      .where(inArray(uploads.uploaderId, demoUsers))
      .all();
    for (const f of files) await deleteStoredFile(ctx, f.storageKey);
    ctx.db.update(users).set({ avatarId: null }).where(inArray(users.id, demoUsers)).run();
    ctx.db.delete(uploads).where(inArray(uploads.uploaderId, demoUsers)).run();
    ctx.db.delete(communityMembers).where(inArray(communityMembers.userId, demoUsers)).run();
    for (const id of demoUsers) {
      try {
        ctx.db.delete(users).where(eq(users.id, id)).run();
      } catch {
        ctx.db.update(users).set({ status: 'deleted', displayName: 'Deleted user' }).where(eq(users.id, id)).run();
      }
    }
  }
  return `Removed ${demoCommunities.length} demo communities and ${demoUsers.length} demo users.`;
}
