import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    // Inicializamos el cliente con la Service Role Key para tener permisos de administrador
    this.supabase = createClient(
      this.configService.get<string>('SUPABASE_URL') ?? '',
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false, // Importante: El backend no mantiene sesión
        },
      },
    );
  }

  // Al arrancar, garantizamos que el bucket de fotos de vehículos exista y sea
  // PÚBLICO (la app usa getPublicUrl). Es idempotente y no rompe el arranque si falla.
  async onModuleInit() {
    await this.ensureBucketPublico('vehiculos');
  }

  private async ensureBucketPublico(nombre: string) {
    try {
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();
      if (listError) throw listError;

      const existe = buckets?.some((b) => b.name === nombre);
      if (!existe) {
        const { error } = await this.supabase.storage.createBucket(nombre, { public: true });
        if (error) throw error;
        console.log(`[Storage] Bucket '${nombre}' creado como público.`);
      } else {
        const { error } = await this.supabase.storage.updateBucket(nombre, { public: true });
        if (error) throw error;
        console.log(`[Storage] Bucket '${nombre}' asegurado como público.`);
      }
    } catch (e: any) {
      console.error(`[Storage] No se pudo asegurar el bucket '${nombre}' público:`, e?.message || e);
    }
  }

  // Getter para acceder al cliente desde otros servicios
  get admin() {
    return this.supabase.auth.admin;
  }
  
  get client() {
    return this.supabase;
  }
}