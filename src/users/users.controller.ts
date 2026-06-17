import { Controller, Get, Post, Patch, Body, Param, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { Public } from '../common/public.decorator';
import { Roles } from '../common/roles.decorator';
import { AllowInvitado } from '../common/allow-invitado.decorator';
import { CreateUserDto } from './dto/create-user.dto';

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
  // ✅ PRIMER ACCESO (usuario logueado con clave temporal — estatus INVITADO)
  // El id SIEMPRE se deriva del token, NUNCA del body (evita toma de cuenta / IDOR).
  // =========================================================
  @AllowInvitado()
  @Post('completar-primer-acceso')
  completarPrimerAcceso(@Req() req: any, @Body() body: { nuevaPassword: string }) {
    return this.usersService.completarPrimerAcceso(req.user.id, body.nuevaPassword);
  }

  // =========================================================
  // RUTAS ADMINISTRATIVAS (solo propietario)
  // =========================================================

  @Roles('propietario')
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Roles('propietario')
  @Post()
  create(@Body() body: CreateUserDto) {
    return this.usersService.create(body);
  }

  // =========================================================
  // RUTAS DINÁMICAS (:id) — AL FINAL SIEMPRE
  // =========================================================

  @Roles('propietario')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Roles('propietario')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }

  // Genera contraseña temporal (reenviada por WhatsApp por el admin)
  @Roles('propietario')
  @Post(':id/invitacion')
  generarInvitacion(@Param('id') id: string) {
    return this.usersService.generarAccesoTemporal(id);
  }
}
