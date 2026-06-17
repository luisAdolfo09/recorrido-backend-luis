import { Controller, Get, Body, Patch, UseGuards } from '@nestjs/common';
import { ConfiguracionService } from './configuracion.service';
import { UpdateConfiguracionDto } from './dto/update-configuracion.dto';
import { AuthGuard } from '@nestjs/passport'; // O tu Guard de JWT
// import { RolesGuard } from '../auth/guards/roles.guard'; // (Opcional) Si tienes guard de roles
// import { Roles } from '../auth/decorators/roles.decorator'; // (Opcional)
import { Roles } from '../common/roles.decorator';

@Roles('propietario')
@Controller('configuracion')
//@UseGuards(AuthGuard('jwt')) // Proteger todas las rutas
export class ConfiguracionController {
  constructor(private readonly configuracionService: ConfiguracionService) {}

  @Get()
  // @Roles('propietario') // (Opcional) Asegurar que solo el propietario vea
  getConfig() {
    return this.configuracionService.getConfig();
  }

  @Patch()
  // @Roles('propietario') // (Opcional) Asegurar que solo el propietario edite
  updateConfig(@Body() updateConfiguracionDto: UpdateConfiguracionDto) {
    return this.configuracionService.updateConfig(updateConfiguracionDto);
  }

  @Get('stats')
  getStats() {
    return this.configuracionService.getDashboardStats();
  }
}