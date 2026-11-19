import type { Reloj } from "./Reloj.js";

export const VALID_NOTICE_TYPES = [
  "reserva confirmada",
  "reserva vencida",
  "turno disponible en lista de espera",
  "suspension aplicada",
  "reparacion",
] as const;

export type NoticeType = (typeof VALID_NOTICE_TYPES)[number];

export interface CorreoPayload {
  to: string;
  type: NoticeType;
  message: string;
}

export interface SentMail {
  to: string;
  type: NoticeType;
  message: string;
  instant: Date;
}

export interface Correo {
  send(payload: CorreoPayload): Promise<void>;
}

export class FakeCorreo implements Correo {
  private readonly sent: SentMail[] = [];

  constructor(private readonly reloj: Reloj) {}

  async send(payload: CorreoPayload): Promise<void> {
    if (!VALID_NOTICE_TYPES.includes(payload.type)) {
      throw new Error(`Tipo de aviso inválido según RN-28: ${String(payload.type)}`);
    }

    this.sent.push({
      to: payload.to,
      type: payload.type,
      message: payload.message,
      instant: this.reloj.now(),
    });
  }

  listSentMails(): SentMail[] {
    return this.sent.map((m) => ({ ...m, instant: new Date(m.instant.getTime()) }));
  }

  clear(): void {
    this.sent.length = 0;
  }
}
