import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, HttpCode, Query } from '@nestjs/common';
import { VehiculosService } from './vehiculos.service';
import { CreateVehiculoDto } from './dto/create-vehiculo.dto';
import { UpdateVehiculoDto } from './dto/update-vehiculo.dto';
import { Roles } from '../common/roles.decorator';

@Roles('propietario')
@Controller('vehiculos')
export class VehiculosController {
  constructor(private readonly vehiculosService: VehiculosService) {}

  @Post()
  create(@Body() createVehiculoDto: CreateVehiculoDto) {
    return this.vehiculosService.create(createVehiculoDto);
  }

  @Get()
  findAll(@Query('estado') estado: string) {
    // /vehiculos?estado=activo
    if (['activo', 'inactivo', 'en mantenimiento'].includes(estado)) {
      return this.vehiculosService.findAllByEstado(estado);
    }
    // /vehiculos (devuelve todos excepto 'eliminado')
    return this.vehiculosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.vehiculosService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updateVehiculoDto: UpdateVehiculoDto
  ) {
    // Se usa para editar datos y para borrado lógico (soft delete)
    return this.vehiculosService.update(id, updateVehiculoDto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    // Borrado FÍSICO (Hard Delete)
    return this.vehiculosService.remove(id);
  }
}