// src/features/fiscal/services/validator.ts
export class FiscalValidator {
    REGIMENES_VALIDOS = [
        '601', '603', '605', '606', '607', '608', '609', '610',
        '611', '612', '614', '615', '616', '620', '621', '622',
        '623', '624', '625', '626', '628', '629', '630'
    ];
    USOS_CFDI_VALIDOS = [
        'G01', 'G02', 'G03', 'G04', 'G05', 'G06', 'G07', 'G08',
        'G09', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15', 'G16',
        'G17', 'G18', 'G19', 'G20', 'G21', 'G22', 'G23', 'G24',
        'G25', 'G26', 'G27', 'G28', 'G29', 'G30', 'G31', 'G32',
        'G33', 'G34', 'G35'
    ];
    validate(data) {
        const errors = [];
        const missingFields = [];
        // Validar RFC
        if (!data.rfc) {
            missingFields.push('RFC');
        }
        else if (!this.validateRFC(data.rfc)) {
            errors.push({
                field: 'RFC',
                message: `El RFC ${data.rfc} no es válido. Debe tener 12 o 13 caracteres.`
            });
        }
        // Validar Razón Social
        if (!data.razonSocial) {
            missingFields.push('Razón Social');
        }
        else if (data.razonSocial.length < 3) {
            errors.push({
                field: 'Razón Social',
                message: 'La razón social debe tener al menos 3 caracteres.'
            });
        }
        // Validar Régimen Fiscal
        if (!data.regimenFiscal) {
            missingFields.push('Régimen Fiscal');
        }
        else if (!this.REGIMENES_VALIDOS.includes(data.regimenFiscal)) {
            errors.push({
                field: 'Régimen Fiscal',
                message: `El régimen ${data.regimenFiscal} no es válido. Usa: 601, 612, etc.`
            });
        }
        // Validar Uso CFDI
        if (!data.usoCFDI) {
            missingFields.push('Uso CFDI');
        }
        else if (!this.USOS_CFDI_VALIDOS.includes(data.usoCFDI)) {
            errors.push({
                field: 'Uso CFDI',
                message: `El uso CFDI ${data.usoCFDI} no es válido. Usa: G01, G03, etc.`
            });
        }
        // Validar Código Postal
        if (!data.codigoPostal) {
            missingFields.push('Código Postal');
        }
        else if (!/^\d{5}$/.test(data.codigoPostal)) {
            errors.push({
                field: 'Código Postal',
                message: 'El código postal debe tener 5 dígitos.'
            });
        }
        // Validar Email
        if (!data.email) {
            missingFields.push('Correo electrónico');
        }
        else if (!this.validateEmail(data.email)) {
            errors.push({
                field: 'Correo electrónico',
                message: 'El correo electrónico no es válido.'
            });
        }
        return {
            isValid: errors.length === 0 && missingFields.length === 0,
            errors,
            missingFields
        };
    }
    validateRFC(rfc) {
        return /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(rfc.toUpperCase());
    }
    validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
}
