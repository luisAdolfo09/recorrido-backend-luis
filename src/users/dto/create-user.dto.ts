import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';

const ROLES_PERMITIDOS = ['propietario', 'asistente', 'tutor', 'chofer'];

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  nombre: string;

  @IsString()
  @IsNotEmpty({ message: 'El teléfono es obligatorio.' })
  telefono: string;

  @IsOptional()
  @IsString()
  username?: string;

  // Whitelist estricta: impide auto-asignarse roles no contemplados (p.ej. inyectar privilegios).
  @IsOptional()
  @IsIn(ROLES_PERMITIDOS, { message: `El rol debe ser uno de: ${ROLES_PERMITIDOS.join(', ')}` })
  rol?: string;

  @IsOptional()
  @IsString()
  vehiculoId?: string;
}
