// Meu Caixa — entrada da função "ai" (Conselheiro IA e leitura de comprovante). O código está em main.ts.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { start } from './main.ts';

start(createClient);
