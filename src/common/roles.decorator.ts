import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restringe un endpoint (o controlador completo) a los roles indicados.
 * El rol efectivo se lee desde la tabla `users` (fuente de verdad), no desde
 * la metadata de Supabase (que es editable por el propio usuario).
 * Uso: @Roles('propietario')  /  @Roles('propietario', 'asistente')
 */
export const Roles = (...roles: string[]) =>
  SetMetadata(ROLES_KEY, roles.map((r) => r.toLowerCase()));
