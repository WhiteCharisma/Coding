import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config';
import { newId } from '../db/ids';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  /** True only when real delivery (SMTP) or the development outbox is configured. */
  readonly enabled: boolean;
  readonly transport: 'smtp' | 'outbox' | 'disabled';
  send(message: MailMessage): Promise<void>;
}

/**
 * Email delivery.
 *  - smtp:     real delivery through the configured SMTP server.
 *  - outbox:   development/testing only — writes messages as JSON files to
 *              DATA_DIR/mail-outbox (never served over HTTP).
 *  - disabled: nothing is sent; features that depend on email report that
 *              they are unavailable instead of pretending to work.
 */
export function createMailer(config: AppConfig, log: { warn: (msg: string) => void }): Mailer {
  const mail = config.mail;
  if (mail.transport === 'smtp') {
    const transporter: Transporter = nodemailer.createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
    });
    return {
      enabled: true,
      transport: 'smtp',
      async send(message) {
        await transporter.sendMail({ from: mail.from, to: message.to, subject: message.subject, text: message.text });
      },
    };
  }
  if (mail.transport === 'outbox') {
    if (config.isProduction) {
      log.warn('MAIL_TRANSPORT=outbox in production: emails are written to disk, not delivered.');
    }
    return {
      enabled: true,
      transport: 'outbox',
      async send(message) {
        await fs.mkdir(config.outboxDir, { recursive: true });
        const file = path.join(config.outboxDir, `${newId()}.json`);
        await fs.writeFile(file, JSON.stringify({ from: mail.from, ...message, createdAt: Date.now() }, null, 2), {
          mode: 0o600,
        });
      },
    };
  }
  return {
    enabled: false,
    transport: 'disabled',
    async send() {
      throw new Error('Email delivery is not configured');
    },
  };
}
