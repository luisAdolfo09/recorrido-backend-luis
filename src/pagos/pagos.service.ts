import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Pago } from './pago.entity';
import { CreatePagoDto } from './dto/create-pago.dto';
import { UpdatePagoDto } from './dto/update-pago.dto';
import { CreatePagoBatchDto } from './dto/create-pago-batch.dto';
import { Alumno } from '../alumnos/alumno.entity';

// 👇 IMPORTACIONES NUEVAS (Para Notificaciones y Tiempo Real)
import { User } from '../users/user.entity';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class PagosService {
  constructor(
    @InjectRepository(Pago)
    private pagosRepository: Repository<Pago>,

    @InjectRepository(Alumno)
    private alumnosRepository: Repository<Alumno>,

    // 👇 INYECCIONES NUEVAS
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private notificacionesService: NotificacionesService,
    private eventsGateway: EventsGateway,
  ) {}

  // --- CREAR (UN PAGO) ---
  // TU LÓGICA ORIGINAL + NOTIFICACIONES
  async create(createPagoDto: CreatePagoDto): Promise<Pago> {
    
    const { alumnoId, mes, monto } = createPagoDto;

    const ANIO_ESCOLAR = new Date().getFullYear().toString();
    const MES_DICIEMBRE = `Diciembre ${ANIO_ESCOLAR}`;

    // 1. Obtener el precio mensual del alumno desde la BD
    const alumno = await this.alumnosRepository.findOneBy({ id: alumnoId });
    if (!alumno || !alumno.precio) {
      throw new NotFoundException(`No se encontró el alumno o su precio.`);
    }
    const precioMensual = alumno.precio;

    // 2. Sumar pagos existentes para ese mes (en la BD)
    const pagosExistentes = await this.pagosRepository.find({
      where: {
        alumnoId: alumnoId,
        mes: mes
      }
    });

    // 3. Lógica de Validación (Híbrida)
    if (mes === MES_DICIEMBRE) {
      // --- LÓGICA DE ABONOS (Diciembre) ---
      const totalPagadoYa = pagosExistentes.reduce((sum, pago) => sum + Number(pago.monto), 0);
      const saldoReal = precioMensual - totalPagadoYa;

      // (con margen de 0.01 para errores de flotante)
      if (Number(monto) > (saldoReal + 0.01)) {
        throw new BadRequestException( // Error 400
          `El monto C$ ${monto} excede el saldo pendiente real de C$ ${saldoReal.toFixed(2)}`
        );
      }
    } else {
      // --- LÓGICA DE PAGO ÚNICO (Feb-Nov) ---
      // Si ya existe CUALQUIER pago para este mes, lo rechazamos.
      if (pagosExistentes.length > 0) {
        throw new BadRequestException( // Error 400
          `Ya existe un pago registrado para ${mes}. No se permiten pagos duplicados.`
        );
      }
      
      // Opcional: Validar que el monto sea el completo
      if (Math.abs(Number(monto) - Number(precioMensual)) > 0.01) {
         throw new BadRequestException(
          `El monto C$ ${monto} no coincide con la mensualidad de C$ ${precioMensual.toFixed(2)} para este mes.`
        );
      }
    }
    // --- FIN DE LA VALIDACIÓN ---

    // 4. Guardar Pago
    const newPago = this.pagosRepository.create(createPagoDto);
    const resultado = await this.pagosRepository.save(newPago);

    // 🔔 MAGIA 1: Notificar a los Propietarios
    this.notificarAdmins('💰 Pago Recibido', `Pago de C$ ${resultado.monto} recibido de ${resultado.alumnoNombre} (${mes}).`);

    // ⚡ MAGIA 2: Actualizar Dashboard en Tiempo Real
    this.eventsGateway.emitir('nuevo-pago', resultado);

    return resultado;
  }

  // --- PAGO EN LOTE (BATCH) ---
  // TU LÓGICA ORIGINAL + NOTIFICACIONES
  async createBatch(createPagoBatchDto: CreatePagoBatchDto): Promise<Pago[]> {
    const { alumnoId, alumnoNombre, montoPorMes, meses, fecha } = createPagoBatchDto;

    const pagosExistentes = await this.pagosRepository.find({
      where: {
        alumnoId: alumnoId,
        mes: In(meses) 
      }
    });
    const mesesYaPagados = new Set(pagosExistentes.map(p => p.mes));

    const mesesAGuardar = meses.filter(mes => !mesesYaPagados.has(mes));
    
    if (mesesAGuardar.length === 0) {
      return []; 
    }

    const pagosAGuardar = mesesAGuardar.map(mes => 
       this.pagosRepository.create({
            alumnoId: alumnoId,
            alumnoNombre: alumnoNombre,
            monto: montoPorMes,
            mes: mes,
            fecha: fecha,
            estado: 'pagado',
       })
    );

    const nuevosPagos = await this.pagosRepository.save(pagosAGuardar);
    
    // Calcular total para la notificación
    const total = nuevosPagos.reduce((sum, p) => sum + Number(p.monto), 0);

    // 🔔 Notificar Batch
    this.notificarAdmins('💰 Pago Anual/Lote', `Se registraron ${nuevosPagos.length} pagos (Total: C$ ${total}) para ${alumnoNombre}.`);

    // ⚡ Evento en tiempo real
    this.eventsGateway.emitir('nuevo-pago-lote', { total, cantidad: nuevosPagos.length });

    return nuevosPagos;
  }

  // --- LEER TODOS ---
  findAll(): Promise<Pago[]> {
    return this.pagosRepository.find({ order: { fecha: 'DESC' } });
  }

  // --- LEER UNO ---
  async findOne(id: string): Promise<Pago> {
    const pago = await this.pagosRepository.findOneBy({ id });
    if (!pago) {
      throw new NotFoundException(`Pago con id ${id} no encontrado`);
    }
    return pago;
  }

  // --- ACTUALIZAR ---
  async update(id: string, updatePagoDto: UpdatePagoDto): Promise<Pago> {
    const pago = await this.pagosRepository.preload({
      id: id,
      ...updatePagoDto,
    });
    if (!pago) {
      throw new NotFoundException(`Pago con id ${id} no encontrado`);
    }
    return this.pagosRepository.save(pago);
  }

  // --- ELIMINAR (Borrado Físico) ---
  async remove(id: string): Promise<void> {
    const pago = await this.findOne(id); // Revisa si existe
    await this.pagosRepository.remove(pago);
  }

  // --- NUEVO MÉTODO PARA EL TUTOR ---
  async findByAlumnos(alumnoIds: string[]): Promise<Pago[]> {
    if (!alumnoIds || alumnoIds.length === 0) {
      return [];
    }
    
    return this.pagosRepository.find({
      where: { 
        alumnoId: In(alumnoIds) 
      },
      relations: ['alumno'], 
      order: { 
        fecha: 'DESC' 
      }
    });
  }

  // --- HELPER PRIVADO PARA NOTIFICAR ---
  private async notificarAdmins(titulo: string, mensaje: string) {
      try {
          const admins = await this.usersRepository.find({ where: { rol: 'propietario' } });
          for (const admin of admins) {
              await this.notificacionesService.notificarUsuario(
                  admin.id,
                  titulo,
                  mensaje,
                  'pago'
              );
          }
      } catch (e) {
          console.error("Error enviando notificación:", e);
      }
  }

  // --- AUTOMATIZACIÓN DE RECORDATORIOS (Cron Job Casero) ---
  
  onModuleInit() {
    // Cuando el servidor arranca, configuramos el revisor
    // Esperamos 10 segundos para asegurarnos que la BD está lista, luego revisamos
    setTimeout(() => this.revisarPagosYNotificar(), 1000 * 10);
    
    // Luego configuramos un intervalo para revisar cada 12 horas
    setInterval(() => this.revisarPagosYNotificar(), 1000 * 60 * 60 * 12);
  }

  // Variable de control en memoria para no spamear si Render reinicia el servidor
  private ultimaRevision: string | null = null;

  async revisarPagosYNotificar() {
    try {
      const hoy = new Date();
      // Configurarlo a la zona horaria de Nicaragua
      const formatoNica = new Intl.DateTimeFormat('es-NI', { timeZone: 'America/Managua' });
      const fechaNicaStr = formatoNica.format(hoy); // "DD/MM/YYYY"
      
      // Solo notificar una vez por día (para no saturar en re-deploys o cold starts)
      if (this.ultimaRevision === fechaNicaStr) {
        return;
      }

      console.log(`[Pagos Cron] Iniciando revisión automática de pagos para el día ${fechaNicaStr}`);

      const ANIO_ESCOLAR = hoy.getFullYear().toString();
      const MESES_REGULARES = [
        "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre"
      ];

      const mesActualJS = hoy.getMonth(); // 0 = Ene, 1 = Feb, etc.
      const diaActual = hoy.getDate();

      // Solo evaluamos pagos regulares de Feb a Nov
      if (mesActualJS < 1 || mesActualJS > 10) {
          this.ultimaRevision = fechaNicaStr;
          return;
      }

      // Obtener todos los alumnos activos y sus tutores
      const alumnos = await this.alumnosRepository.createQueryBuilder('alumno')
        .leftJoinAndSelect('alumno.tutorUser', 'tutorUser')
        .where('alumno.activo = :activo', { activo: true })
        .getMany();

      // Recorrer los alumnos para calcular su estado
      for (const alumno of alumnos) {
        if (!alumno.tutorUserId) continue; // Si no tiene tutor, no hay a quién notificar

        const precio = Number(alumno.precio) || 0;
        if (precio <= 0) continue; // No paga

        // Traer pagos del alumno
        const pagosAlumno = await this.pagosRepository.find({
            where: { alumnoId: alumno.id }
        });

        const pagosPorMes = new Map<string, number>();
        pagosAlumno.forEach(p => {
            if (p.mes.includes(ANIO_ESCOLAR)) {
                pagosPorMes.set(p.mes, (pagosPorMes.get(p.mes) || 0) + Number(p.monto));
            }
        });

        // Buscar el primer mes regular que debe
        let proximoMesADeber = "AL DIA";
        for (let i = 0; i < MESES_REGULARES.length; i++) {
            const mesNombre = `${MESES_REGULARES[i]} ${ANIO_ESCOLAR}`;
            if ((pagosPorMes.get(mesNombre) || 0) < (precio - 0.1)) { 
                proximoMesADeber = mesNombre;
                break;
            }
        }

        if (proximoMesADeber !== "AL DIA") {
            const mesQueDebeStr = proximoMesADeber.split(' ')[0]; // Ej: "Febrero"
            const idxMesQueDebe = MESES_REGULARES.indexOf(mesQueDebeStr);
            const mesActualEvaluado = mesActualJS - 1; // Ajuste (1:Feb -> idx 0 en array)

            if (idxMesQueDebe < mesActualEvaluado) {
                // 🔴 MORA: Debe un mes anterior al actual
                if (diaActual % 5 === 0) { // Notificar cada 5 días para no spamearlo a diario
                    await this.notificacionesService.notificarUsuario(
                        alumno.tutorUserId,
                        '⚠️ Aviso de Mora',
                        `Estimado tutor, el alumno ${alumno.nombre} tiene pendiente el pago de ${proximoMesADeber}. Por favor póngase al día.`,
                        'pago'
                    );
                }
            } else if (idxMesQueDebe === mesActualEvaluado) {
                // 🟡 MES ACTUAL: Puede ser próximo a pagar o mora reciente
                if (diaActual >= 1 && diaActual <= 5) { // Del 1 al 5 es "Próximo a Pagar"
                   // Avisar días 1, 3 y 5
                   if (diaActual === 1 || diaActual === 3 || diaActual === 5) {
                        await this.notificacionesService.notificarUsuario(
                            alumno.tutorUserId,
                            '🗓️ Pago Próximo a Vencer',
                            `Le recordamos que el pago correspondiente a ${proximoMesADeber} para ${alumno.nombre} vence pronto.`,
                            'pago'
                        );
                   }
                } else if (diaActual >= 6) { // Del 6 en adelante ya es mora
                    // Avisar días 6, 11, 16, etc.
                   if ((diaActual - 1) % 5 === 0) {
                        await this.notificacionesService.notificarUsuario(
                            alumno.tutorUserId,
                            '⚠️ Mensualidad Vencida',
                            `Estimado tutor, el pago de ${proximoMesADeber} para ${alumno.nombre} se encuentra vencido. Evite suspensión de servicio.`,
                            'pago'
                        );
                   }
                }
            }
        }
      }

      this.ultimaRevision = fechaNicaStr;
      console.log(`[Pagos Cron] Revisión finalizada.`);
    } catch (error) {
      console.error("[Pagos Cron] Error al revisar notificaciones:", error);
    }
  }
}