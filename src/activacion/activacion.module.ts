import { Module } from '@nestjs/common';
import { ActivacionController } from './activacion.controller';

@Module({
  controllers: [ActivacionController],
})
export class ActivacionModule {}
