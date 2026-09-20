const visorRepo = require('./visor.repository');

class VisorService {
  async getRawImagenes(instancia) {
    const rows = await visorRepo.obtenerRawImagenes(instancia);
    return rows.map((r, idx) => {
      let fecha = new Date();
      if (r.created_at) fecha = new Date(r.created_at);
      else if (r.timestamp_msg) {
        let ts = Number(r.timestamp_msg);
        if (ts < 1e11) ts *= 1000;
        fecha = new Date(ts);
      }
      return {
        id: r.id || r.hash_corto || r.hash_largo || (idx + 1),
        hash_largo: r.hash_largo || '',
        hash_corto: r.hash_corto || 'Sin Hash',
        grupo_raw: r.grupo_raw || 'Chat Directo',
        usuario_raw: r.usuario_raw || 'Cliente',
        nombre_push: r.nombre_push || r.usuario_raw || 'Desconocido',
        caption: r.caption || 'Sin texto...',
        url_imagen: r.url_imagen || '',
        conteo: r.conteo || 1,
        estado: r.estado || 'PROCESADO',
        instancia: r.instancia || 'JOHN',
        created_at: fecha.toISOString()
      };
    });
  }

  async getLecturasIA(instancia) {
    const rows = await visorRepo.obtenerLecturasIA(instancia);
    return rows.map((r, idx) => {
      let fecha = new Date();
      if (r.timestamp_msg) {
        let ts = Number(r.timestamp_msg);
        if (ts < 1e11) ts *= 1000;
        fecha = new Date(ts);
      }
      return {
        id: r.hash_corto || r.hash_largo || (idx + 1),
        hash_corto: r.hash_corto || (r.hash_largo ? r.hash_largo.substring(0, 8) : 'Sin Hash'),
        url_imagen: r.url_imagen,
        nombre_push: r.nombre_push || r.usuario_raw || 'Desconocido',
        grupo_raw: r.grupo_raw || 'Chat Directo',
        caption: r.caption || '',
        created_at: fecha.toISOString(),
        directorio_nombre: r.directorio_nombre || null,
        directorio_rol: r.directorio_rol || 'Socio',
        directorio_moneda: r.directorio_moneda || 'USD',
        ia_monto: r.ia_monto || null,
        ia_banco: r.ia_banco || null,
        ia_titular: r.ia_titular || null,
        ia_moneda: r.ia_moneda || 'USD',
        ia_tasa: r.ia_tasa || null,
        ia_estado: r.ia_estado || r.estado_raw || 'PROCESADO'
      };
    });
  }
}

module.exports = new VisorService();
