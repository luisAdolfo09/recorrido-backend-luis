import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacion } from './notificacion.entity';

@Injectable()
export class NotificacionesService {
  constructor(
    @InjectRepository(Notificacion)
    private notificacionRepo: Repository<Notificacion>,
  ) {}

  // 1. Crear una notificación genérica
  async crear(
    usuarioId: string,
    titulo: string,
    mensaje: string,
    tipo: 'pago' | 'asistencia' | 'sistema',
  ) {
    const nueva = this.notificacionRepo.create({
      usuarioId,
      titulo,
      mensaje,
      tipo,
      leido: false,
    });
    return await this.notificacionRepo.save(nueva);
  }

  // 2. Obtener mis notificaciones (No leídas primero)
  async obtenerMisNotificaciones(usuarioId: string) {
    return await this.notificacionRepo.find({
      where: { usuarioId },
      order: { fechaCreacion: 'DESC', leido: 'ASC' },
      take: 30,
    });
  }

  // 3. Marcar todas como leídas
  async marcarTodasComoLeidas(usuarioId: string) {
    return await this.notificacionRepo.update(
      { usuarioId, leido: false },
      { leido: true },
    );
  }

  // 4. Conteo de no leídas (Para el badge de campana)
  async contarNoLeidas(usuarioId: string) {
    return await this.notificacionRepo.count({
      where: { usuarioId, leido: false },
    });
  }

  // 5. Helper: Enviar a un usuario específico (tutor, asistente, etc.)
  async notificarUsuario(
    usuarioId: string,
    titulo: string,
    mensaje: string,
    tipo: 'pago' | 'asistencia' | 'sistema' = 'sistema',
  ) {
    if (!usuarioId) return;
    try {
      await this.crear(usuarioId, titulo, mensaje, tipo);
    } catch (e) {
      console.error(`[Notificaciones] Error notificando usuario ${usuarioId}:`, (e as Error).message);
    }
  }
}