import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { Public } from '../common/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // =========================================================
  // 🚨 RUTAS PÚBLICAS Y ESTÁTICAS (DEBEN IR PRIMERO)
  // Si pones estas abajo de ':id', NestJS pensará que "login" es un ID
  // =========================================================

  // 1. LOOKUP (Necesario para tu Frontend actual)
  // Recibe { identifier: "admin" } y devuelve { email: "...", rol: "..." }
  @Public()
  @Post('lookup')
  lookup(@Body() body: { identifier: string }) {
    console.log('👉 PETICIÓN LOOKUP:', body);
    return this.usersService.lookupUser(body.identifier);
  }

  // 2. LOGIN (Alternativa Server-Side)
  @Public()
  @Post('login')
  login(@Body() body: { username: string; contrasena: string }) {
    return this.usersService.login(body.username, body.contrasena);
  }

  // 3. ACTIVAR CUENTA (Para establecer contraseña nueva)
  @Public()
  @Post('activar')
  activar(@Body() body: { token: string; password: string }) {
    return this.usersService.activarCuenta(body.token, body.password);
  }

  // 4. SOLICITAR RESET DE CONTRASEÑA
  @Public()
  @Post('solicitar-reset')
  solicitarReset(@Body() body: { identifier: string }) {
    return this.usersService.solicitarResetPassword(body.identifier);
  }

  // ❌ LA RUTA 'SEED' HA SIDO ELIMINADA POR SEGURIDAD ❌
  // Si necesitas usarla de emergencia, descoméntala temporalmente.
  /*
  @Public()
  @Get('seed')
  crearAdminDeEmergencia() {
    return this.usersService.createAdminSeed();
  }
  */

  // =========================================================
  // RUTAS PROTEGIDAS O GENÉRICAS (Requieren Token)
  // =========================================================

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  create(@Body() body: any) {
    return this.usersService.create(body);
  }

  // =========================================================
  // 🚨 AL FINAL: LAS RUTAS DINÁMICAS (:id)
  // =========================================================

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // 👇 ESTE ES EL QUE TE FALTA
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }

  @Post(':id/invitacion')
  generarInvitacion(@Param('id') id: string) {
    return this.usersService.generarTokenInvitacion(id);
  }
}