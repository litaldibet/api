// const allowedOrigin = "https://litaldibet.github.io"

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Lembrar de configurar depois a URL certa
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
}

export const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json"
}
