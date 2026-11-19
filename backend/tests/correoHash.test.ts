import { describe, expect, it } from "vitest";
import { FixedReloj } from "../src/components/Reloj.js";
import { FakeCorreo, VALID_NOTICE_TYPES } from "../src/components/Correo.js";
import { HashPassword } from "../src/components/HashPassword.js";

describe("T-04 — Correo simulado y HashPassword", () => {
  it("FakeCorreo arranca vacío, registra avisos válidos con instante del Reloj y rechaza tipos inventados (RN-28)", async () => {
    const reloj = new FixedReloj("2026-10-21T18:00:00-03:00");
    const correo = new FakeCorreo(reloj);

    expect(correo.listSentMails()).toHaveLength(0);

    await correo.send({
      to: "ana@club.test",
      type: "reserva confirmada",
      message: "Tu reserva está confirmada.",
    });

    reloj.advanceByHours(2);
    await correo.send({
      to: "bruno@club.test",
      type: "turno disponible en lista de espera",
      message: "Tenés 24 h hábiles para confirmar.",
    });

    const enviados = correo.listSentMails();
    expect(enviados).toHaveLength(2);
    expect(enviados[0].to).toBe("ana@club.test");
    expect(enviados[0].instant.toISOString()).toBe(
      new Date("2026-10-21T18:00:00-03:00").toISOString()
    );
    expect(enviados[1].instant.toISOString()).toBe(
      new Date("2026-10-21T20:00:00-03:00").toISOString()
    );
    expect(VALID_NOTICE_TYPES).toHaveLength(5);

    await expect(
      correo.send({
        to: "ana@club.test",
        type: "aviso inventado" as never,
        message: "No debería enviarse",
      })
    ).rejects.toThrow();
  });

  it("HashPassword genera hash con salt distinto del texto plano y verifica correctamente (RN-04)", () => {
    const hash1 = HashPassword.hash("clave-secreta-123");
    const hash2 = HashPassword.hash("clave-secreta-123");

    expect(hash1).not.toBe("clave-secreta-123");
    expect(hash1).not.toBe(hash2);
    expect(HashPassword.verify("clave-secreta-123", hash1)).toBe(true);
    expect(HashPassword.verify("otra-clave", hash1)).toBe(false);
  });
});
