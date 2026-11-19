import { formatClubDay, formatClubWeekday } from "./Reloj.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLUB_TZ = "America/Argentina/Buenos_Aires";

const timeFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: CLUB_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export interface ResultadoVencimiento {
  fechaLimite: Date;
  corrimientoInformado: boolean;
  detalleCorrimiento: string | null;
}

export class CalendarioHabil {
  toClubDay(instant: Date): string {
    return formatClubDay(instant);
  }

  esDiaNoHabil(instant: Date, feriados: string[]): boolean {
    const weekday = formatClubWeekday(instant);
    if (weekday === "sábado" || weekday === "domingo") {
      return true;
    }
    return feriados.includes(formatClubDay(instant));
  }

  private moverASiguienteHabil(instant: Date, feriados: string[]): { fecha: Date; diasSaltados: number } {
    let cursor = new Date(instant.getTime());
    let diasSaltados = 0;
    while (this.esDiaNoHabil(cursor, feriados)) {
      cursor = new Date(cursor.getTime() + DAY_MS);
      diasSaltados += 1;
    }
    return { fecha: cursor, diasSaltados };
  }

  private armarDetalle(fechaLimite: Date): string {
    const dia = formatClubDay(fechaLimite);
    const hora = timeFormatter.format(fechaLimite);
    return `Plazo corrido por fin de semana o feriado hasta ${dia} ${hora} hs.`;
  }

  /**
   * Suma horas hábiles en bloques de 24 h saltando sábados, domingos y feriados.
   */
  sumarHorasHabiles(desde: Date, horas: number, feriados: string[]): ResultadoVencimiento {
    const bloquesDeDia = Math.max(1, Math.ceil(horas / 24));
    let cursor = new Date(desde.getTime());
    let diasCalendario = 0;
    let habilesContados = 0;

    while (habilesContados < bloquesDeDia) {
      cursor = new Date(cursor.getTime() + DAY_MS);
      diasCalendario += 1;
      if (!this.esDiaNoHabil(cursor, feriados)) {
        habilesContados += 1;
      }
    }

    const corrimientoInformado = diasCalendario > bloquesDeDia;
    return {
      fechaLimite: cursor,
      corrimientoInformado,
      detalleCorrimiento: corrimientoInformado ? this.armarDetalle(cursor) : null,
    };
  }

  /**
   * Suma días base (ej. 7, 15 o +5) y traslada al siguiente día hábil si el vencimiento cae no hábil.
   */
  calcularVencimientoPrestamo(desde: Date, diasBase: number, feriados: string[]): ResultadoVencimiento {
    const tentativo = new Date(desde.getTime() + diasBase * DAY_MS);
    const { fecha, diasSaltados } = this.moverASiguienteHabil(tentativo, feriados);
    const corrimientoInformado = diasSaltados > 0;

    return {
      fechaLimite: fecha,
      corrimientoInformado,
      detalleCorrimiento: corrimientoInformado ? this.armarDetalle(fecha) : null,
    };
  }
}
