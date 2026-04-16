import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

// Entidades
import { Asistencia } from './asistencia.entity';
import { User } from '../users/user.entity'; 
import { Alumno } from '../alumnos/alumno.entity';
import { Aviso } from '../avisos/aviso.entity';
import { CreateLoteAsistenciaDto } from './dto/create-lote-asistencia.dto';

// Servicios Inyectados
import { DiasNoLectivosService } from '../dias-no-lectivos/dias-no-lectivos.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
// 👇 IMPORTACIÓN NUEVA (Para Tiempo Real)
import { EventsGateway } from '../events/events.gateway';
import { NotificacionesService } from '../notificaciones/notificaciones.service';

@Injectable()
export class AsistenciaService {
  constructor(
    @InjectRepository(Asistencia)
    private asistenciaRepository: Repository<Asistencia>,
    
    @InjectRepository(User) 
    private userRepository: Repository<User>, 
    
    @InjectRepository(Alumno)
    private alumnoRepository: Repository<Alumno>,
    
    @InjectRepository(Aviso)
    private avisoRepository: Repository<Aviso>,

    private readonly diasNoLectivosService: DiasNoLectivosService,
    private readonly configuracionService: ConfiguracionService,
    // 👇 INYECCIÓN DEL GATEWAY
    private readonly eventsGateway: EventsGateway,
    // 👇 INYECTAR SERVICIO DE NOTIFICACIONES
    private readonly notificacionesService: NotificacionesService,
  ) {}

  // --- HELPERS PRIVADOS (Sin cambios) ---

  private getHoy(): { fecha: Date; fechaString: string; diaSemana: number } {
    const fecha = new Date();
    const fechaString = fecha.toISOString().split('T')[0];
    const diaSemana = fecha.getDay();
    return { fecha, fechaString, diaSemana };
  }

  private async checkEsDiaLectivo(): Promise<{ esDiaLectivo: boolean; motivo: string | null }> {
    const { fechaString, diaSemana } = this.getHoy();

    if (diaSemana === 0 || diaSemana === 6) return { esDiaLectivo: false, motivo: 'Fin de semana' };

    const diaNoLectivo = await this.diasNoLectivosService.checkDia(fechaString);
    if (diaNoLectivo) return { esDiaLectivo: false, motivo: diaNoLectivo.motivo };

    const config = await this.configuracionService.getConfig();
    if (config.inicioAnioEscolar && config.finAnioEscolar) {
      if (fechaString < config.inicioAnioEscolar || fechaString > config.finAnioEscolar) {
        return { esDiaLectivo: false, motivo: 'Vacaciones (Fuera del año escolar)' };
      }
    }
    if (config.inicioVacacionesMedioAnio && config.finVacacionesMedioAnio) {
      if (fechaString >= config.inicioVacacionesMedioAnio && fechaString <= config.finVacacionesMedioAnio) {
        return { esDiaLectivo: false, motivo: 'Vacaciones (Intersemestrales)' };
      }
    }

    return { esDiaLectivo: true, motivo: null };
  }

  private async checkAsistenciaRegistradaHoy(asistenteId: string): Promise<boolean> {
    const { fechaString } = this.getHoy();
    const count = await this.asistenciaRepository.count({
      where: {
        asistente: { id: asistenteId },
        fecha: fechaString,
      },
    });
    return count > 0;
  }

  private async getAsistenteProfile(userId: string) {
    const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: ['vehiculo'] 
    });

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    if (!user.vehiculo) throw new NotFoundException('No tienes vehículo asignado en tu perfil.');
    
    return user;
  }

  // --- ENDPOINTS PÚBLICOS ---

  // 1. Resumen para el Asistente
  async getResumenHoy(userId: string) {
    const asistente = await this.getAsistenteProfile(userId);
    
    const { fechaString } = this.getHoy();
    const { esDiaLectivo, motivo } = await this.checkEsDiaLectivo();
    const asistenciaRegistrada = await this.checkAsistenciaRegistradaHoy(asistente.id);
    const vehiculo = asistente.vehiculo;

    const totalAlumnos = await this.alumnoRepository.count({
      where: { vehiculo: { id: vehiculo.id }, activo: true },
    });
    
    const presentesHoy = await this.asistenciaRepository.count({
      where: { fecha: fechaString, estado: 'presente', asistente: { id: asistente.id } },
    });
    
    const ausentesHoy = await this.asistenciaRepository.count({
      where: { fecha: fechaString, estado: 'ausente', asistente: { id: asistente.id } },
    });

    const avisos = await this.avisoRepository.find({
      where: [{ destinatario: 'personal' }, { destinatario: 'todos' }],
      select: ['id', 'titulo', 'contenido', 'destinatario', 'fechaCreacion'],
      order: { fechaCreacion: 'DESC' },
      take: 5,
    });

    return {
      stats: {
        vehiculo: {
          placa: vehiculo.placa,
          choferNombre: asistente.nombre,
          fotoUrl: vehiculo.fotoUrl || null,
        },
        totalAlumnos,
        presentesHoy,
        ausentesHoy,
      },
      avisos,
      esDiaLectivo,
      motivoNoLectivo: motivo,
      asistenciaRegistrada,
    };
  }

  // 2. Lista de Alumnos para marcar
  async getAlumnosParaAsistencia(userId: string) {
    const asistente = await this.getAsistenteProfile(userId);
    
    const alumnos = await this.alumnoRepository.find({
      where: { 
          vehiculo: { id: asistente.vehiculo.id },
          activo: true 
      },
      relations: ['tutorUser'], 
      order: { nombre: 'ASC' }
    });

    return alumnos.map((a) => ({
      id: a.id,
      nombre: a.nombre,
      grado: a.grado || 'N/A',
      tutor: a.tutorUser?.nombre || a.tutor || 'N/A', 
    }));
  }

  // 3. Guardar Asistencia (AHORA CON NOTIFICACIÓN EN VIVO ⚡)
  async registrarLote(loteDto: CreateLoteAsistenciaDto, userId: string) {
    const { esDiaLectivo, motivo } = await this.checkEsDiaLectivo();
    if (!esDiaLectivo) throw new BadRequestException(motivo);
    
    const asistente = await this.getAsistenteProfile(userId);

    const asistenciaRegistrada = await this.checkAsistenciaRegistradaHoy(asistente.id);
    if (asistenciaRegistrada) throw new BadRequestException('La asistencia ya fue registrada.');

    const { fechaString } = this.getHoy();
    
    const registros = loteDto.registros.map((r) =>
      this.asistenciaRepository.create({
        alumno: { id: r.alumnoId },
        estado: r.estado,
        fecha: fechaString,
        asistente: { id: asistente.id },
      }),
    );

    const resultado = await this.asistenciaRepository.save(registros);

    // ⚡ ENVIAR NOTIFICACIONES DE AUSENCIA ⚡
    // Cargamos los datos de los alumnos incluyendo al tutor
    const alumnosIds = loteDto.registros.filter(r => r.estado === 'ausente').map(r => r.alumnoId);
    
    if (alumnosIds.length > 0) {
      const alumnosAusentes = await this.alumnoRepository.createQueryBuilder('alumno')
        .where('alumno.id IN (:...ids)', { ids: alumnosIds })
        .getMany();

      for (const alumno of alumnosAusentes) {
        if (alumno.tutorUserId) {
          await this.notificacionesService.notificarUsuario(
            alumno.tutorUserId,
            '⚠️ Inasistencia Registrada',
            `El alumno ${alumno.nombre} ha sido marcado como ausente el día de hoy (${fechaString}).`,
            'asistencia'
          );
        }
      }
    }

    // ⚡ EVENTO EN TIEMPO REAL ⚡
    // Esto activa el "Monitor de Ruta" y las notificaciones a los padres.
    this.eventsGateway.emitir('nueva-asistencia-lote', {
        vehiculo: asistente.vehiculo.nombre,
        asistente: asistente.nombre,
        totalRegistros: resultado.length,
        detalles: resultado.map(r => ({
            alumnoId: r.alumno.id, // Importante para filtrar en el frontend del padre
            estado: r.estado
        }))
    });

    return resultado;
  }

  // 4. Historial
  async getHistorial(userId: string, mes: string) {
    const asistente = await this.getAsistenteProfile(userId);

    const [year, month] = mes.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const registros = await this.asistenciaRepository.find({
      where: {
        asistente: { id: asistente.id },
        fecha: Between(
          startDate.toISOString().split('T')[0],
          endDate.toISOString().split('T')[0],
        ),
      },
      relations: ['alumno'],
      order: { fecha: 'ASC' },
    });

    const diasAgrupados: Record<string, any[]> = registros.reduce(
      (acc, reg) => {
        const fecha = reg.fecha;
        if (!acc[fecha]) acc[fecha] = [];
        acc[fecha].push({
          id: reg.id,
          alumnoNombre: reg.alumno?.nombre || 'Alumno desconocido',
          presente: reg.estado === 'presente',
        });
        return acc;
      },
      {},
    );

    return Object.keys(diasAgrupados).map((fecha) => ({
      fecha,
      registros: diasAgrupados[fecha],
    }));
  }
}