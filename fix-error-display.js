// Fix temporal para mostrar errores de reserva
// Aplicar manualmente en la línea 1800 del archivo app/admin/socios/page.tsx

// Reemplazar esta línea:
// console.warn(`No se pudo crear la reserva para ${c.concepto}:`, await reservaRes.text());

// Por este bloque:
const errorResponse = await reservaRes.text();
let errorMsg = errorResponse;
try {
  const errorJson = JSON.parse(errorResponse);
  errorMsg = errorJson.msg || errorResponse;
} catch (e) {
  // Si no es JSON válido, usar el texto tal como está
}
console.warn(`No se pudo crear la reserva para ${c.concepto}:`, errorMsg);
alert(`❌ No se pudo crear la reserva para ${c.concepto}:\n\n${errorMsg}`);
return; // Importante: detener el proceso