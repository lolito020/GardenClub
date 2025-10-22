// Test del endpoint de debug

async function testDebugEndpoint() {
  try {
    console.log('Consultando endpoint de debug...\n');
    
    const response = await fetch('http://localhost:3000/api/debug/calculations');
    
    if (!response.ok) {
      console.error(`Error: ${response.status} - ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const data = await response.json();
    
    console.log('=== RESULTADO DEL ENDPOINT DEBUG ===');
    console.log(`Member ID: ${data.memberId}`);
    console.log(`Total movimientos: ${data.totalMovements}`);
    console.log('');
    
    console.log('=== CÁLCULOS ===');
    console.log(`Método Principal: ${data.calculations.metodoPrincipal.toLocaleString()}`);
    console.log(`Método Detalles: ${data.calculations.metodoDetalles.toLocaleString()}`);
    console.log(`Método Saldo Global: ${data.calculations.metodoSaldoGlobal.toLocaleString()}`);
    console.log(`Total Debe: ${data.calculations.totalDebe.toLocaleString()}`);
    console.log(`Total Haber: ${data.calculations.totalHaber.toLocaleString()}`);
    console.log(`Saldo Global: ${data.calculations.saldoGlobal.toLocaleString()}`);
    console.log('');
    
    console.log('=== DÉBITOS PROCESADOS (PRINCIPAL) ===');
    data.processedPrincipal.forEach(d => {
      const pendiente = Math.max(0, d.monto - (d.paidAmount || 0));
      console.log(`${d.id}: ${d.concepto} | Monto: ${d.monto.toLocaleString()} | Pagado: ${(d.paidAmount || 0).toLocaleString()} | Pendiente: ${pendiente.toLocaleString()}`);
    });
    
    console.log('\n=== DÉBITOS PROCESADOS (DETALLES) ===');
    data.processedDetalles.forEach(d => {
      const pendiente = Math.max(0, d.monto - (d.paidAmount || 0));
      console.log(`${d.id}: ${d.concepto} | Monto: ${d.monto.toLocaleString()} | Pagado: ${(d.paidAmount || 0).toLocaleString()} | Pendiente: ${pendiente.toLocaleString()}`);
    });
    
  } catch (error) {
    console.error('Error consultando endpoint:', error.message);
  }
}

testDebugEndpoint();