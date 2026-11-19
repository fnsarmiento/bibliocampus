import { describe, expect, it } from "vitest";
import { FixedReloj, SystemReloj } from "../src/components/Reloj.js";
import { CalendarioHabil } from "../src/components/CalendarioHabil.js";

describe("T-03 — Reloj (zona Argentina) y CalendarioHabil", () => {
  it("FixedReloj maneja día argentino sin desfase UTC y permite avanzar instantes", () => {
    const reloj = new FixedReloj(new Date("2026-10-21T23:30:00-03:00"));
    expect(reloj.clubDay()).toBe("2026-10-21");
    expect(reloj.clubWeekday()).toBe("miércoles");

    reloj.advanceTo(new Date("2026-10-24T20:00:00-03:00"));
    expect(reloj.clubDay()).toBe("2026-10-24");
    expect(reloj.clubWeekday()).toBe("sábado");

    const systemReloj = new SystemReloj();
    expect(Math.abs(systemReloj.now().getTime() - Date.now())).toBeLessThanOrEqual(1000);
  });

  it("ventana de 48 h hábiles desde viernes 15:00 vence martes 15:00 saltando fin de semana e informando corrimiento (RN-10)", () => {
    const calendario = new CalendarioHabil();
    const viernes = new Date("2026-10-23T15:00:00-03:00");

    const resultado = calendario.sumarHorasHabiles(viernes, 48, []);

    expect(resultado.fechaLimite.toISOString()).toBe(
      new Date("2026-10-27T15:00:00-03:00").toISOString()
    );
    expect(resultado.corrimientoInformado).toBe(true);
    expect(resultado.detalleCorrimiento).toBeTruthy();
  });

  it("ventana de 24 h hábiles salta fin de semana y feriados informando el corrimiento (RN-25)", () => {
    const calendario = new CalendarioHabil();
    const viernes = new Date("2026-10-23T11:00:00-03:00");

    // Lunes 2026-10-26 cargado como feriado -> vence recién el martes 27 a las 11:00
    const resultado = calendario.sumarHorasHabiles(viernes, 24, ["2026-10-26"]);

    expect(resultado.fechaLimite.toISOString()).toBe(
      new Date("2026-10-27T11:00:00-03:00").toISOString()
    );
    expect(resultado.corrimientoInformado).toBe(true);
  });

  it("vencimiento de préstamo que cae sábado, domingo o feriado se traslada al siguiente día hábil (RN-11, RN-15)", () => {
    const calendario = new CalendarioHabil();
    // Viernes 16/10 + 7 días = viernes 23/10 (supongamos feriado 23/10 -> salta sáb 24, dom 25 -> lunes 26/10)
    const inicio = new Date("2026-10-16T14:00:00-03:00");
    const conFeriado = calendario.calcularVencimientoPrestamo(inicio, 7, ["2026-10-23"]);

    expect(calendario.toClubDay(conFeriado.fechaLimite)).toBe("2026-10-26");
    expect(conFeriado.corrimientoInformado).toBe(true);

    // Miércoles 14/10 + 7 días = miércoles 21/10 (hábil, sin feriados)
    const inicioHabil = new Date("2026-10-14T14:00:00-03:00");
    const sinCorrimiento = calendario.calcularVencimientoPrestamo(inicioHabil, 7, []);
    expect(calendario.toClubDay(sinCorrimiento.fechaLimite)).toBe("2026-10-21");
    expect(sinCorrimiento.corrimientoInformado).toBe(false);
  });
});
