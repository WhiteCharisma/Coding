# Third-party notices

Creator Network is built on open-source software. The direct runtime dependencies are listed
below with their licenses; their full license texts are included in each package (in
`node_modules/<package>/LICENSE` after `npm install`, and inside the Docker image). All
production dependencies (233 packages including transitive ones, checked 2026-10-09) use
permissive licenses: MIT, ISC, BSD-3-Clause, Apache-2.0, BlueOak-1.0.0, MIT-0 and 0BSD, plus
the SIL Open Font License for the fonts. No copyleft (GPL/AGPL/LGPL) code is included.

## Browser application

| Package                                                                   | License    | Use                                           |
| ------------------------------------------------------------------------- | ---------- | --------------------------------------------- |
| react, react-dom 19.3                                                     | MIT        | UI library                                    |
| react-router 8.4                                                          | MIT        | Routing                                       |
| @tanstack/react-query 5.104                                               | MIT        | Request caching                               |
| zustand 5.0                                                               | MIT        | State stores                                  |
| radix-ui 1.7                                                              | MIT        | Accessible UI primitives                      |
| class-variance-authority 0.7                                              | Apache-2.0 | Component variants                            |
| clsx 2.1, tailwind-merge 3.7                                              | MIT        | Class name helpers                            |
| motion 12.43                                                              | MIT        | Enter/exit animations                         |
| lucide-react 1.54                                                         | ISC        | Icons                                         |
| socket.io-client 4.8                                                      | MIT        | Real-time connection                          |
| Tailwind CSS 4.3 (build tool; its base styles ship in the CSS)            | MIT        | Styling                                       |
| Inter, Bricolage Grotesque, JetBrains Mono (via @fontsource-variable 5.3) | OFL-1.1    | Typefaces, bundled with the app (self-hosted) |

UI component structure follows the patterns popularised by **shadcn/ui** (MIT); the visual
design, tokens and styles are original to this project.

## Server

| Package                                                              | License                            | Use                      |
| -------------------------------------------------------------------- | ---------------------------------- | ------------------------ |
| fastify 5.12, @fastify/cookie, helmet, multipart, rate-limit, static | MIT                                | HTTP server and plugins  |
| socket.io 4.8                                                        | MIT                                | Real-time gateway        |
| better-sqlite3 13.0 (bundles SQLite 3.53)                            | MIT (SQLite: public domain)        | Database driver          |
| drizzle-orm 0.45                                                     | Apache-2.0                         | Query builder            |
| argon2 0.45 (bundles the Argon2 reference implementation)            | MIT (Argon2: CC0-1.0 / Apache-2.0) | Password hashing         |
| zod 4.6                                                              | MIT                                | Input validation         |
| file-type 22.1                                                       | MIT                                | File signature detection |
| image-size 2.0                                                       | MIT                                | Image dimensions         |
| nodemailer 10.0                                                      | MIT-0                              | Email delivery (SMTP)    |
| pino 10.4                                                            | MIT                                | Logging                  |

## Runtime and infrastructure (not bundled; run as separate software)

| Software                  | License                                    | Use                                      |
| ------------------------- | ------------------------------------------ | ---------------------------------------- |
| Node.js 24 (Docker image) | MIT and others (see the Node.js `LICENSE`) | JavaScript runtime                       |
| Caddy 2.11 (Docker image) | Apache-2.0                                 | Reverse proxy, automatic HTTPS           |
| Docker Engine / Compose   | Apache-2.0                                 | Container runtime (installed on the VPS) |

## Development tools (not shipped)

TypeScript (Apache-2.0), Vite (MIT), Vitest (MIT), Playwright (Apache-2.0), ESLint (MIT),
typescript-eslint (MIT), Prettier (MIT), esbuild (MIT), tsx (MIT), drizzle-kit
(MIT), happy-dom (MIT).

## Project assets

The logo, illustrations, auth-page artwork, demo images (procedurally generated PNGs) and demo
audio (synthesized WAV loops) are generated by code in this repository and contain no
third-party material. Demo content is clearly labelled "Demo" in the app.
