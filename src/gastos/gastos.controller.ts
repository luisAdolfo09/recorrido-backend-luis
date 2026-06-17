import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, HttpCode, Query } from '@nestjs/common';
import { GastosService } from './gastos.service';
import { CreateGastoDto } from './dto/create-gasto.dto';
import { UpdateGastoDto } from './dto/update-gasto.dto';
import { Roles } from '../common/roles.decorator';

@Roles('propietario')
@Controller('gastos')
export class GastosController {
  constructor(private readonly gastosService: GastosService) {}

  @Post()
  create(@Body() createGastoDto: CreateGastoDto) {
    return this.gastosService.create(createGastoDto);
  }

  @Get()
  findAll(@Query('estado') estado: string) {
    // Permitimos filtrar por estado, ej: /gastos?estado=activo
    if (estado === 'activo' || estado === 'inactivo') {
      return this.gastosService.findAllByEstado(estado);
    }
    // Por defecto, devuelve 'activo' y 'inactivo', pero no 'eliminado'
    return this.gastosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.gastosService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateGastoDto: UpdateGastoDto
  ) {
    // Este endpoint se usa para TODO: editar, activar, desactivar, eliminar (soft delete)
    return this.gastosService.update(id, updateGastoDto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    // Este es un borrado FÍSICO (Hard Delete)
    return this.gastosService.remove(id);
  }
}