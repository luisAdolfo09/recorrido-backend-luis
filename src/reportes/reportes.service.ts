import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Pago } from '../pagos/pago.entity';
import { Gasto } from '../gastos/gasto.entity';
import { Alumno } from '../alumnos/alumno.entity';
import { Vehiculo } from '../vehiculos/vehiculo.entity';

// Meses del ciclo escolar (Febrero -> Diciembre). El índice del arreglo + 1
// coincide con el índice de mes de JavaScript (Febrero = getMonth() 1).
const MESES_ESCOLARES = [
  'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio',
  'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MESES_CALENDARIO = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Pago) private pagoRepo: Repository<Pago>,
    @InjectRepository(Gasto) private gastoRepo: Repository<Gasto>,
    @InjectRepository(Alumno) private alumnoRepo: Repository<Alumno>,
    @InjectRepository(Vehiculo) private vehiculoRepo: Repository<Vehiculo>,
  ) {}

  async getDashboardStats(periodo: 'semestre' | 'anio' = 'anio') {
    const ahora = new Date();
    const mesActualJS = ahora.getMonth(); // 0 = Enero, 5 = Junio...
    const anioActual = ahora.getFullYear();

    // 1. ALUMNOS ACTIVOS (cargamos la lista una sola vez y reutilizamos)
    const alumnosActivosList = await this.alumnoRepo.find({ where: { activo: true } });
    const alumnosActivos = alumnosActivosList.length;

    // 2. DATOS FINANCIEROS (KPIs: Ingresos, Gastos, Utilidad)
    const ingresosRaw = await this.pagoRepo.find({ where: { estado: 'pagado' } });
    const gastosRaw = await this.gastoRepo.find();

    const ingresosTotales = ingresosRaw.reduce((sum, p) => sum + Number(p.monto), 0);
    const gastosTotales = gastosRaw.reduce((sum, g) => sum + Number(g.monto || 0), 0);
    const beneficioNeto = ingresosTotales - gastosTotales;

    // 3. GRÁFICA: FINANZAS POR MES (respeta el período seleccionado)
    const mesesMap = new Map<string, { ingreso: number; gasto: number }>();
    MESES_CALENDARIO.forEach((m) => mesesMap.set(m, { ingreso: 0, gasto: 0 }));

    ingresosRaw.forEach((p) => {
      const mesNombre = (p.mes || '').split(' ')[0]; // "Febrero 2026" -> "Febrero"
      if (mesesMap.has(mesNombre)) {
        mesesMap.get(mesNombre)!.ingreso += Number(p.monto);
      }
    });

    gastosRaw.forEach((g) => {
      const fecha = new Date(g.fecha);
      if (!isNaN(fecha.getTime())) {
        const mesNombre = MESES_CALENDARIO[fecha.getMonth()];
        if (mesesMap.has(mesNombre)) {
          mesesMap.get(mesNombre)!.gasto += Number(g.monto || 0);
        }
      }
    });

    let finanzasPorMes = Array.from(mesesMap.entries()).map(([mes, data]) => ({
      mes,
      ingreso: data.ingreso,
      gasto: data.gasto,
    }));

    // Si el período es "semestre", devolvemos solo los últimos 6 meses hasta hoy.
    if (periodo === 'semestre') {
      const desde = Math.max(0, mesActualJS - 5);
      finanzasPorMes = finanzasPorMes.slice(desde, mesActualJS + 1);
    }

    // 4. GRÁFICA: RENTABILIDAD POR VEHÍCULO
    const vehiculos = await this.vehiculoRepo.find();
    const pagosConRelacion = await this.pagoRepo.find({
      relations: ['alumno', 'alumno.vehiculo'],
      where: { estado: 'pagado' },
    });

    const finanzasPorVehiculo = vehiculos.map((v) => {
      const ingresos = pagosConRelacion
        .filter((p) => p.alumno?.vehiculo?.id === v.id)
        .reduce((sum, p) => sum + Number(p.monto), 0);

      const gastos = gastosRaw
        .filter((g) => g.vehiculoId === v.id)
        .reduce((sum, g) => sum + Number(g.monto || 0), 0);

      return { nombre: v.nombre, ingresos, gastos };
    });

    // 5. GRÁFICA: ALUMNOS POR GRADO
    const gradosMap = new Map<string, number>();
    alumnosActivosList.forEach((a) => {
      const grado = a.grado || 'Sin Grado';
      gradosMap.set(grado, (gradosMap.get(grado) || 0) + 1);
    });
    const alumnosPorGrado = Array.from(gradosMap.entries()).map(([grado, cantidad]) => ({
      grado,
      alumnos: cantidad,
    }));

    // 6. ANÁLISIS REAL DE MOROSIDAD / CARTERA
    // Construimos un índice rápido: alumnoId -> (mes -> monto pagado)
    const pagosPorAlumnoMes = new Map<string, Map<string, number>>();
    ingresosRaw.forEach((p) => {
      if (!pagosPorAlumnoMes.has(p.alumnoId)) pagosPorAlumnoMes.set(p.alumnoId, new Map());
      const m = pagosPorAlumnoMes.get(p.alumnoId)!;
      m.set(p.mes, (m.get(p.mes) || 0) + Number(p.monto || 0));
    });

    // Meses ya vencidos (incluye el mes actual). Feb (idx 0) vence si su mes JS (1) <= mesActualJS.
    const mesesVencidos = MESES_ESCOLARES.filter((_, i) => i + 1 <= mesActualJS);

    const deudaPorMesMap = new Map<string, { deudores: number; monto: number }>();
    mesesVencidos.forEach((m) => deudaPorMesMap.set(m, { deudores: 0, monto: 0 }));

    type FamiliaMora = {
      familia: string;
      alumnos: Set<string>;
      meses: Set<string>;
      monto: number;
    };
    const familiasMap = new Map<string, FamiliaMora>();

    let alumnosMorosos = 0;
    let alumnosAlDia = 0;
    let alumnosFacturables = 0; // alumnos activos con mensualidad (precio > 0)
    let deudaTotal = 0;
    let esperadoVencido = 0;
    let recaudadoVencido = 0;

    for (const a of alumnosActivosList) {
      const precio = Number(a.precio) || 0;
      if (precio <= 0) continue; // no genera cobro
      alumnosFacturables++;

      const familia = (a as any).tutorUser?.nombre || a.tutor || 'Sin Tutor';
      const pagosA = pagosPorAlumnoMes.get(a.id) || new Map<string, number>();
      let debeAlgo = false;

      for (const mesNombre of mesesVencidos) {
        const mesKey = `${mesNombre} ${anioActual}`;
        const pagado = pagosA.get(mesKey) || 0;
        esperadoVencido += precio;
        recaudadoVencido += Math.min(pagado, precio);

        const saldo = precio - pagado;
        if (saldo > 0.01) {
          debeAlgo = true;
          deudaTotal += saldo;

          const dm = deudaPorMesMap.get(mesNombre)!;
          dm.deudores += 1;
          dm.monto += saldo;

          if (!familiasMap.has(familia)) {
            familiasMap.set(familia, {
              familia,
              alumnos: new Set(),
              meses: new Set(),
              monto: 0,
            });
          }
          const f = familiasMap.get(familia)!;
          f.alumnos.add(a.nombre);
          f.meses.add(mesNombre);
          f.monto += saldo;
        }
      }

      if (debeAlgo) alumnosMorosos++;
      else alumnosAlDia++;
    }

    const deudaPorMes = mesesVencidos.map((m) => ({
      mes: m,
      deudores: deudaPorMesMap.get(m)!.deudores,
      monto: Math.round(deudaPorMesMap.get(m)!.monto),
    }));

    const ordenMes = (m: string) => MESES_ESCOLARES.indexOf(m);
    const morosos = Array.from(familiasMap.values())
      .map((f) => ({
        familia: f.familia,
        alumnos: Array.from(f.alumnos),
        meses: Array.from(f.meses).sort((a, b) => ordenMes(a) - ordenMes(b)),
        cantidadMeses: f.meses.size,
        monto: Math.round(f.monto),
      }))
      .sort((a, b) => b.monto - a.monto);

    // Estado de cartera real: alumnos al día vs. con deuda
    const estadoPagos = [
      { nombre: 'Al día', valor: alumnosAlDia, color: '#10b981' },
      { nombre: 'Con deuda', valor: alumnosMorosos, color: '#ef4444' },
    ];

    const tasaCobro =
      esperadoVencido > 0 ? Math.round((recaudadoVencido / esperadoVencido) * 100) : 100;

    // RETORNO FINAL
    return {
      kpi: {
        alumnosActivos,
        ingresosTotales,
        gastosTotales,
        beneficioNeto,
        // Nuevos indicadores de cobranza
        deudaTotal: Math.round(deudaTotal),
        familiasMorosas: familiasMap.size,
        alumnosMorosos,
        alumnosAlDia,
        alumnosFacturables, // activos con precio > 0; si es 0, no hay cobranza configurada
        tasaCobro,
      },
      periodo,
      finanzasPorMes,
      finanzasPorVehiculo,
      alumnosPorGrado,
      estadoPagos,
      // Datos de morosidad para la sección de reportes
      deudaPorMes,
      morosos,
    };
  }
}
