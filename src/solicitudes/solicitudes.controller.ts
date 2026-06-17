import { Controller, Get, Post, Body, Param, Delete, Patch } from '@nestjs/common';
import { SolicitudesService } from './solicitudes.service';
import { Solicitud } from './solicitud.entity';
import { Roles } from '../common/roles.decorator';

@Roles('propietario')
@Controller('solicitudes')
export class SolicitudesController {
  constructor(private readonly solicitudesService: SolicitudesService) {}

  @Post()
  create(@Body() datos: Partial<Solicitud>) {
    return this.solicitudesService.create(datos);
  }

  @Get()
  findAll() {
    return this.solicitudesService.findAll();
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.solicitudesService.remove(id);
  }

  // --- EL BOTÓN DE APROBAR ---
  @Patch(':id/aprobar')
  aprobar(@Param('id') id: string) {
    return this.solicitudesService.aprobar(id);
  }
}