import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SupabaseService } from './supabase.service';
import { User, UserStatus } from '../users/user.entity';
import { IS_PUBLIC_KEY } from '../common/public.decorator';
import { ROLES_KEY } from '../common/roles.decorator';
import { ALLOW_INVITADO_KEY } from '../common/allow-invitado.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseService,
    private reflector: Reflector,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = request.path;

    // --- 🚨 LISTA BLANCA MANUAL (SOLO RUTAS SEGURAS) ---
    const publicPaths = [
      '/',                  // Raíz (Health check)
      '/users/login',       // Login
      '/users/lookup',      // Lookup
      '/users/activar',     // Activación (links legacy)
      '/favicon.ico',
    ];
    if (publicPaths.some((p) => path === p || path.startsWith(p + '/'))) {
      return true;
    }

    // 1. Decorador @Public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2. Autenticación: validar el token contra Supabase
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('No se encontró token de autenticación');
    }

    let authUser: any;
    try {
      const { data: { user }, error } = await this.supabase.client.auth.getUser(token);
      if (error || !user) {
        throw new UnauthorizedException('Token inválido o expirado');
      }
      authUser = user;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Sesión no válida');
    }

    // 3. Cargar rol/estatus desde la BD (FUENTE DE VERDAD, no la metadata editable)
    const dbUser = await this.usersRepository.findOne({ where: { id: authUser.id } });
    const rol = (dbUser?.rol || '').toLowerCase();
    const estatus = dbUser?.estatus ?? null;

    request.user = authUser;
    request.user.rol = rol || null;
    request.user.estatus = estatus;
    request.dbUser = dbUser ?? null;
    // Shim: el código que aún lee `user_metadata.rol` recibirá el rol canónico de la BD.
    request.user.user_metadata = {
      ...(authUser.user_metadata || {}),
      rol: rol || authUser.user_metadata?.rol || null,
    };

    // 4. Bloqueo de primer acceso: un usuario INVITADO solo puede completar el cambio de clave
    const allowInvitado = this.reflector.getAllAndOverride<boolean>(ALLOW_INVITADO_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (estatus === UserStatus.INVITADO && !allowInvitado) {
      throw new ForbiddenException('Debe establecer su contraseña definitiva antes de continuar.');
    }
    if (estatus === UserStatus.BLOQUEADO) {
      throw new ForbiddenException('Tu cuenta está bloqueada. Contacta al administrador.');
    }

    // 5. Autorización por rol (@Roles)
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0) {
      if (!rol || !requiredRoles.includes(rol)) {
        throw new ForbiddenException('No tienes permiso para realizar esta acción.');
      }
    }

    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
