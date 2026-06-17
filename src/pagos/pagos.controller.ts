// src/pagos/pagos.controller.ts

import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, HttpCode } from '@nestjs/common';
import { PagosService } from './pagos.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { UpdatePagoDto } from './dto/update-pago.dto';
import { CreatePagoBatchDto } from './dto/create-pago-batch.dto'; // <-- 1. IMPORTAR
import { Roles } from '../common/roles.decorator';

@Roles('propietario')
@Controller('pagos') // URL Base: /pagos
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  @Post()
  create(@Body() createPagoDto: CreatePagoDto) {
    return this.pagosService.create(createPagoDto);
  }

  // --- NUEVO ENDPOINT PARA PAGO EN LOTE (PUNTO 3) ---
  @Post('batch') // Responderá a [POST] /pagos/batch
  @HttpCode(201)
  createBatch(@Body() createPagoBatchDto: CreatePagoBatchDto) {
    // 2. LLAMAR AL NUEVO MÉTODO DEL SERVICIO
    return this.pagosService.createBatch(createPagoBatchDto);
  }
  // --- FIN DEL NUEVO ENDPOINT ---

  @Get()
  findAll() {
    return this.pagosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagosService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string, 
    @Body() updatePagoDto: UpdatePagoDto
  ) {
    return this.pagosService.update(id, updatePagoDto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.pagosService.remove(id);
  }
}