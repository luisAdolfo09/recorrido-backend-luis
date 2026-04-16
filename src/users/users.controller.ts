import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { Public } from '../common/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // =========================================================
  // 🚨 RUTAS PÚBLICAS (Sin Auth — van SIEMPRE PRIMERO)
  // =========================================================

  @Public()
  @Post('lookup')
  lookup(@Body() body: { identifier: string }) {
    return this.usersService.lookupUser(body.identifier);
  }

  @Public()
  @Post('login')
  login(@Body() body: { username: string; contrasena: string }) {
    return this.usersService.login(body.username, body.contrasena);
  }

  // Mantener activar para compatibilidad con links viejos
  @Public()
  @Post('activar')
  activar(@Body() body: { token: string; password: string }) {
    return this.usersService.activarCuenta(body.token, body.password);
  }

  @Public()
  @Post('solicitar-reset')
  solicitarReset(@Body() body: { identifier: string }) {
    return this.usersService.solicitarResetPassword(body.identifier);
  }

  // =========================================================
  // RUTAS PROTEGIDAS (Requieren Token de Supabase)
  // =========================================================

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.usersService.create(body);
  }

  // ✅ NUEVO: Completar primer acceso (usuario ya logueado con contraseña temporal)
  @Post('completar-primer-acceso')
  completarPrimerAcceso(@Body() body: { userId: string; nuevaPassword: string }) {
    return this.usersService.completarPrimerAcceso(body.userId, body.nuevaPassword);
  }

  // =========================================================
  // RUTAS DINÁMICAS (:id) — AL FINAL SIEMPRE
  // =========================================================

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }

  // ✅ NUEVO: Genera contraseña temporal (reemplaza el viejo endpoint de invitacion)
  @Post(':id/invitacion')
  generarInvitacion(@Param('id') id: string) {
    return this.usersService.generarAccesoTemporal(id);
  }
}