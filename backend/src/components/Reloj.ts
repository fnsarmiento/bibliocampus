const CLUB_TZ = "America/Argentina/Buenos_Aires";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: CLUB_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("es-AR", {
  timeZone: CLUB_TZ,
  weekday: "long",
});

export interface Reloj {
  now(): Date;
  clubDay(): string;
  clubWeekday(): string;
}

export function formatClubDay(instant: Date): string {
  return dateFormatter.format(instant);
}

export function formatClubWeekday(instant: Date): string {
  return weekdayFormatter.format(instant).toLowerCase();
}

export class SystemReloj implements Reloj {
  now(): Date {
    return new Date();
  }

  clubDay(): string {
    return formatClubDay(this.now());
  }

  clubWeekday(): string {
    return formatClubWeekday(this.now());
  }
}

export class FixedReloj implements Reloj {
  private current: Date;

  constructor(initialInstant: Date | string) {
    this.current = new Date(initialInstant);
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceTo(nextInstant: Date | string): void {
    this.current = new Date(nextInstant);
  }

  advanceByHours(hours: number): void {
    this.current = new Date(this.current.getTime() + hours * 60 * 60 * 1000);
  }

  advanceByDays(days: number): void {
    this.advanceByHours(days * 24);
  }

  clubDay(): string {
    return formatClubDay(this.current);
  }

  clubWeekday(): string {
    return formatClubWeekday(this.current);
  }
}
