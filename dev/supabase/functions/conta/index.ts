// Meu Caixa — entrada da função "conta" (cadastro sem depender de e-mail e link de nova senha). O código está em main.ts.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { start } from './main.ts';

start(createClient);
