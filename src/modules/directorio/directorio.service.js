const directorioRepo = require('./directorio.repository');

class DirectorioService {
  async obtenerAjustesAsesor(nombreAsesor) {
    if (!nombreAsesor) return { comision: 0, descuento: 0 };
    const socio = await directorioRepo.obtenerPorNombre(nombreAsesor);
    if (!socio) return { comision: 0, descuento: 0 };

    const comision = socio.porcentaje_comision !== '-' ? parseFloat(socio.porcentaje_comision || 0) : 0;
    const descuento = socio.descuento !== '-' ? parseFloat(socio.descuento || 0) : 0;

    return { comision, descuento };
  }
}

module.exports = new DirectorioService();
