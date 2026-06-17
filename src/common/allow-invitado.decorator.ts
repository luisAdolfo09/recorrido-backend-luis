import { SetMetadata } from '@nestjs/common';

export const ALLOW_INVITADO_KEY = 'allowInvitado';

/**
 * Permite que un usuario en estatus INVITADO (primer acceso con clave temporal)
 * acceda a este endpoint. Por defecto, el AuthGuard bloquea a los usuarios
 * INVITADO en todo el sistema hasta que establecen su contraseña definitiva,
 * salvo en los endpoints marcados con @AllowInvitado().
 */
export const AllowInvitado = () => SetMetadata(ALLOW_INVITADO_KEY, true);
