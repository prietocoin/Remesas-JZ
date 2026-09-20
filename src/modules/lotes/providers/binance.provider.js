async function obtenerTasasBinance() {
  const fiats = ['PEN', 'VES', 'COP', 'CLP', 'MXN', 'ARS', 'EUR'];
  const ratesObj = { USD: 1.0, USDT: 1.0 };

  for (const fiat of fiats) {
    try {
      const response = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'ClientType': 'web',
          'Origin': 'https://p2p.binance.com'
        },
        body: JSON.stringify({ page: 1, rows: 5, asset: 'USDT', fiat, tradeType: 'BUY' })
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.data?.length > 0) {
          const precios = data.data.slice(0, 3).map(adv => parseFloat(adv.adv.price));
          const promedio = precios.reduce((a, b) => a + b, 0) / precios.length;
          ratesObj[fiat] = Number(promedio.toFixed(2));
        }
      }
    } catch (e) {
      console.error(`❌ Error Binance P2P (${fiat}):`, e.message);
    }
  }

  if (ratesObj['EUR']) ratesObj['ESP'] = ratesObj['EUR'];
  ratesObj['PYP'] = ratesObj['VES'] ? Number((ratesObj['VES'] * 0.82).toFixed(2)) : 790.00;

  return ratesObj;
}

module.exports = { obtenerTasasBinance };
