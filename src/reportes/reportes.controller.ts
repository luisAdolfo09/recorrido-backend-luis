import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportesService } from './reportes.service';
import { AuthGuard } from '../supabase/auth.guard';
import { Roles } from '../common/roles.decorator';

@Roles('propietario')
@Controller('reportes')
@UseGuards(AuthGuard)
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Get('dashboard')
  getDashboard(@Query('periodo') periodo?: string) {
    const periodoValido = periodo === 'semestre' ? 'semestre' : 'anio';
    return this.reportesService.getDashboardStats(periodoValido);
  }
}
