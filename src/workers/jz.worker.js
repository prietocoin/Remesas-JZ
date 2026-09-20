const { Worker, Queue } = require('bullmq');
const { redisConfig } = require('../config/redis');
const calculoEngine = require('../modules/calculo/calculo.engine');

const distribuidorQueue = new Queue('cola-distribuidor', { connection: redisConfig });

function iniciarWorkerJOHN() {
  const worker = new Worker('cola-reglas-john', async (job) => {
    console.log(`[Worker JOHN] Procesando comprobante #${job.data.id_comprobante || job.id}...`);

    const { id_comprobante, monto_extraido, moneda_origen, moneda_destino, nombre_asesor } = job.data;

    const resultadoCalculo = await calculoEngine.calcularConversion({
      montoExtraido: monto_extraido,
      monedaOrigen: moneda_origen || 'USD',
      monedaDestino: moneda_destino || 'VES',
      nombreAsesor: nombre_asesor
    });

    const payloadProcesado = {
      ...job.data,
      instancia: 'JOHN',
      calculo_tasas: {
        ...resultadoCalculo,
        procesado_at: new Date().toISOString()
      }
    };

    await distribuidorQueue.add('entrega-webhook', payloadProcesado);
    console.log(`[Worker JOHN] Comprobante #${id_comprobante || job.id} liquidado con Lote ${resultadoCalculo.id_tasa_lote}`);

  }, { connection: redisConfig });

  worker.on('failed', (job, err) => {
    console.error(`❌ [Worker JOHN] Error en trabajo #${job?.id}:`, err.message);
  });

  return worker;
}

module.exports = { iniciarWorkerJOHN };
