// ===========================================================================
// CONFIGURAÇÃO DO SUPABASE  — cole aqui suas credenciais
// ===========================================================================
// Onde achar:
//   1. Crie um projeto grátis em https://supabase.com
//   2. SUPABASE_URL:  Settings -> Data API -> "Project URL"
//                     (algo como https://xxxxxxxx.supabase.co)
//   3. SUPABASE_ANON_KEY:  Settings -> API Keys -> "Publishable key"
//                     (começa com sb_publishable_... — é a chave segura pra
//                      navegador. NÃO use a "Secret key" sb_secret_...!)
//      Obs.: em projetos antigos essa chave se chamava "anon public" — serve
//      igual. A segurança fica nas policies do banco (o supabase_setup.sql).
//
// Enquanto isso estiver em branco, o site roda em MODO DEMO: os votos ficam
// só no seu navegador (localStorage) e nada é enviado pra nuvem. Útil pra
// testar. Preencha antes de mandar pros amigos.
// ===========================================================================

window.CONFIG = {
  SUPABASE_URL: "",          // ex: "https://xxxxxxxx.supabase.co"
  SUPABASE_ANON_KEY: "",     // ex: "eyJhbGciOi..."

  // Senha simples pra abrir a página de resultados (admin.html). Não é
  // segurança de verdade, só pra amigo curioso não bisbilhotar o ranking.
  ADMIN_PASSWORD: "troque-isto",
};
