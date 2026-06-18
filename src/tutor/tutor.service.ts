import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm'; 
import { User } from '../users/user.entity';
import { Alumno } from '../alumnos/alumno.entity';
import { Asistencia } from '../asistencias/asistencia.entity';
import { Aviso } from '../avisos/aviso.entity';
import { PagosService } from '../pagos/pagos.service'; 

@Injectable()
export class TutorService {
    constructor(
        @InjectRepository(User) private userRepository: Repository<User>,
        @InjectRepository(Alumno) private alumnoRepository: Repository<Alumno>,
        @InjectRepository(Asistencia) private asistenciaRepository: Repository<Asistencia>,
        @InjectRepository(Aviso) private avisoRepository: Repository<Aviso>,
        private readonly pagosService: PagosService,
    ) {}

    /**
     * Devuelve los hijos de un tutor. Si no encuentra ninguno por `tutorUserId`
     * (p. ej. porque el id quedó desincronizado), intenta recuperarlos por el
     * teléfono del tutor — que se guarda en `alumno.contacto` al crear al alumno —
     * y repara el vínculo (`tutorUserId`) para que las siguientes consultas sean
     * consistentes.
     */
    private async resolverHijos(userId: string, soloActivos: boolean): Promise<Alumno[]> {
        const whereBase: any = { tutorUserId: userId };
        if (soloActivos) whereBase.activo = true;

        let hijos = await this.alumnoRepository.find({
            where: whereBase,
            relations: ['vehiculo'],
        });
        if (hijos.length > 0) return hijos;

        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user?.telefono) return hijos;

        const wherePorTel: any = { contacto: user.telefono };
        if (soloActivos) wherePorTel.activo = true;

        const porTelefono = await this.alumnoRepository.find({
            where: wherePorTel,
            relations: ['vehiculo'],
        });

        if (porTelefono.length > 0) {
            try {
                await this.alumnoRepository.update(
                    porTelefono.map((h) => h.id),
                    { tutorUserId: userId },
                );
            } catch {
                // Auto-reparación best-effort; si falla, igual devolvemos los hijos.
            }
        }
        return porTelefono;
    }

    // 1. Resumen para el Dashboard
    async getResumen(userId: string) {
        // Buscamos hijos y su vehículo (con auto-reparación de vínculo por teléfono)
        const hijos = await this.resolverHijos(userId, true);

        if (hijos.length === 0) {
             // Si no tiene hijos, devolvemos estructura vacía pero válida para no romper el front
             return {
                 hijos: [],
                 avisos: [],
                 pagos: { estado: 'al_dia', montoPendiente: 0 }
             };
        }

        const hoy = new Date().toISOString().split('T')[0];
        const hijosIds = hijos.map(h => h.id);
        
        // Buscar asistencias de hoy para todos los hijos
        const asistenciasHoy = await this.asistenciaRepository.find({
            where: { 
                 alumno: { id: In(hijosIds) },
                 fecha: hoy 
            },
            relations: ['alumno']
        });

        // Mapear estado de cada hijo
        const estadoHijos = hijos.map(hijo => {
            const asistencia = asistenciasHoy.find(a => a.alumno.id === hijo.id);
            const estado = asistencia ? asistencia.estado : 'pendiente';
            
            return {
                id: hijo.id,
                nombre: hijo.nombre,
                grado: hijo.grado,
                estadoHoy: estado,
                horaRecogida: asistencia?.fechaCreacion || null, 
                vehiculoFotoUrl: hijo.vehiculo?.fotoUrl || null,
                vehiculoPlaca: hijo.vehiculo?.placa || "S/P"
            };
        });

        // Avisos 
        const avisos = await this.avisoRepository.find({
            where: [{ destinatario: 'tutores' }, { destinatario: 'todos' }],
            order: { fechaCreacion: 'DESC' },
            take: 5,
        });

        // Cálculo de Pagos Pendientes (Lógica simplificada)
        // Usamos el servicio de pagos para traer el historial
        const pagos = await this.pagosService.findByAlumnos(hijosIds);
        
        const ANIO = new Date().getFullYear().toString();
        const MESES_REGULARES = ["Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre"];
        
        let deudaTotal = 0;

        hijos.forEach(hijo => {
            const precio = Number(hijo.precio) || 0;
            // Filtramos pagos de este hijo en este año
            const pagosHijo = pagos.filter(p => p.alumnoId === hijo.id && p.mes.includes(ANIO));
            
            // Verificamos mes a mes
            MESES_REGULARES.forEach(mes => {
                const mesFull = `${mes} ${ANIO}`;
                // Si no hay pago registrado para este mes, se suma la deuda
                // (Nota: Esto asume que el mes ya pasó o es el actual. Para ser estrictos, compararíamos con fecha actual)
                const pagado = pagosHijo.some(p => p.mes === mesFull);
                
                // Lógica simple: Si estamos en o después del mes, y no pagó, debe.
                // Aquí simplificamos asumiendo que si no está en la base de datos de pagos, lo debe.
                if (!pagado) {
                     // Podrías agregar validación de fecha aquí (ej. si hoy es Marzo, no cobramos Abril todavía)
                     // deudaTotal += precio; 
                }
            });
            
            // Para efectos del Dashboard rápido, podemos confiar en un cálculo más directo si tienes un campo de deuda
            // O usar la lógica de "Total Esperado vs Total Pagado"
        });
        
        // Lógica alternativa más robusta para el "Monto Pendiente" de la tarjeta:
        // Sumamos el precio mensual de todos los hijos * meses transcurridos - lo que han pagado.
        // Por simplicidad y rapidez, devolvemos 0 si están al día o el monto si hay algo flagrante.
        
        // (Para que funcione idéntico al admin, deberíamos replicar la lógica de `PagosPage` aquí, 
        // pero como es solo un resumen visual, podemos dejarlo en 0 o calcular solo el mes actual).
        
        // Cálculo de Mes Actual:
        const mesActualNombre = new Date().toLocaleString('es-MX', { month: 'long' });
        const mesActualFull = `${mesActualNombre.charAt(0).toUpperCase() + mesActualNombre.slice(1)} ${ANIO}`;
        
        const deudaMesActual = hijos.reduce((acc, hijo) => {
            const pagado = pagos.some(p => p.alumnoId === hijo.id && p.mes === mesActualFull);
            return acc + (pagado ? 0 : Number(hijo.precio));
        }, 0);

        return {
            hijos: estadoHijos,
            avisos, 
            pagos: {
                montoPendiente: deudaMesActual, 
                estado: deudaMesActual > 0 ? 'pendiente' : 'al_dia'
            }
        };
    }

    // 2. Historial de asistencias
    async getAsistencias(userId: string) {
        const hijos = await this.resolverHijos(userId, false);

        const historial = await Promise.all(hijos.map(async (hijo) => {
            const registros = await this.asistenciaRepository.find({
                where: { alumnoId: hijo.id },
                order: { fecha: 'DESC' },
                take: 30 
            });
            
            return {
                ...hijo,
                registros
            };
        }));

        return historial;
    }

    // 3. Historial de Pagos
    async getPagos(userId: string) {
        const hijos = await this.resolverHijos(userId, false);

        if (hijos.length === 0) {
            return [];
        }

        const hijosIds = hijos.map(h => h.id);
        return this.pagosService.findByAlumnos(hijosIds);
    }
    
    // 4. Obtener avisos
    async getAvisos(userId: string) {
         return this.avisoRepository.find({
             where: [{ destinatario: 'tutores' }, { destinatario: 'todos' }],
             order: { fechaCreacion: 'DESC' },
         });
    }
}