export const validarRFC = (rfc: string): boolean => {
  // Esta es la regla oficial para RFC de México (Personas Físicas y Morales)
  const regex = /^([A-ZÑ&]{3,4})([0-9]{2})(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])([A-Z\d]{3})$/;
  
  return regex.test(rfc.toUpperCase().trim());
};