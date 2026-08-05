// ===========================================================================
// CONFIGURAÇÃO DO SUPABASE  — cole aqui suas credenciais
// ===========================================================================
// Onde achar:
//   1. Crie um projeto grátis em https://supabase.com
//   2. Painel do projeto -> Settings -> API
//   3. Copie "Project URL" e a chave "anon public" (pode ficar pública, é
//      feita pra front-end; a segurança fica nas policies do banco).
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
