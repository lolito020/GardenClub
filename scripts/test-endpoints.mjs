import fetch from 'node-fetch';

async function testEndpoints() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('=== TESTING API ENDPOINTS FOR MEMBER m1 ===\n');
  
  try {
    // Test endpoint 1: /api/members/m1/movements
    console.log('1. Testing /api/members/m1/movements:');
    let response = await fetch(`${baseUrl}/api/members/m1/movements`);
    console.log(`Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Response type: ${Array.isArray(data) ? 'Array' : typeof data}`);
      console.log(`Items count: ${Array.isArray(data) ? data.length : Array.isArray(data?.items) ? data.items.length : 'N/A'}`);
      
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      const debits = items.filter(x => x.tipo === 'DEBIT' || x.tipo === 'DEBE');
      console.log(`Debits found: ${debits.length}`);
      
      let totalDebt = 0;
      debits.forEach(d => {
        const pending = Math.max(0, (d.monto || 0) - (d.paidAmount || 0));
        totalDebt += pending;
        console.log(`  ${d.id}: ${d.concepto} - Monto: ${d.monto}, Pagado: ${d.paidAmount || 0}, Pendiente: ${pending}`);
      });
      console.log(`Total debt from endpoint 1: ${totalDebt}\n`);
    } else {
      console.log(`Error: ${response.statusText}\n`);
    }
    
    // Test endpoint 2: /api/movements?memberId=m1
    console.log('2. Testing /api/movements?memberId=m1:');
    response = await fetch(`${baseUrl}/api/movements?memberId=m1`);
    console.log(`Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log(`Response type: ${Array.isArray(data) ? 'Array' : typeof data}`);
      console.log(`Items count: ${Array.isArray(data) ? data.length : Array.isArray(data?.items) ? data.items.length : 'N/A'}`);
      
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      const debits = items.filter(x => x.tipo === 'DEBIT' || x.tipo === 'DEBE');
      console.log(`Debits found: ${debits.length}`);
      
      let totalDebt = 0;
      debits.forEach(d => {
        const pending = Math.max(0, (d.monto || 0) - (d.paidAmount || 0));
        totalDebt += pending;
        console.log(`  ${d.id}: ${d.concepto} - Monto: ${d.monto}, Pagado: ${d.paidAmount || 0}, Pendiente: ${pending}`);
      });
      console.log(`Total debt from endpoint 2: ${totalDebt}\n`);
    } else {
      console.log(`Error: ${response.statusText}\n`);
    }
    
  } catch (error) {
    console.error('Error testing endpoints:', error);
  }
}

testEndpoints();