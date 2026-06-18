import { Controller, Get, Query } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { Roles } from '../common/roles.decorator';

// La autenticación la aplica el AuthGuard GLOBAL (APP_GUARD en app.module.ts).
// No usamos @UseGuards(AuthGuard) aquí para no re-instanciar el guard en un módulo
// que no provee UserRepository (rompería el arranque de Nest). @Roles lo lee el guard global.
@Roles('propietario')
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('dashboard')
  getDashboard(@Query('periodo') periodo?: string) {
    const periodoValido = periodo === 'semestre' ? 'semestre' : 'anio';
    return this.reportesService.getDashboardStats(periodoValido);
  }
}
