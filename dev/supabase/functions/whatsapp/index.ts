// Meu Caixa — entrada da função "whatsapp" (robô do WhatsApp e assistente do app). O código está em main.ts.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { start } from './main.ts';

start(createClient);
