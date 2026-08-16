export function formatearNumeroWhatsApp(numero) {
    const limpio = numero.replace(/\D/g, "");
    // Si son 10 dígitos (número nacional de México), le agregamos 521
    if (limpio.length === 10) {
        return `521${limpio}@s.whatsapp.net`;
    }
    // Si viene con 52 pero le falta el 1 (12 dígitos)
    if (limpio.length === 12 && limpio.startsWith("52")) {
        return `521${limpio.slice(2)}@s.whatsapp.net`;
    }
    // Si ya tiene el formato completo con 521 (13 dígitos)
    if (limpio.length === 13 && limpio.startsWith("521")) {
        return `${limpio}@s.whatsapp.net`;
    }
    return `${limpio}@s.whatsapp.net`;
}
