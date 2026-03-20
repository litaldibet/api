export const ERROR_MESSAGES = {
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  INVALID_FORM_DATA: "INVALID_FORM_DATA",
  INVALID_JSON: "INVALID_JSON",
  INVALID_ID: "INVALID_ID",
  INVALID_PASSWORD: "INVALID_PASSWORD",
  WRONG_PASSWORD: "SENHA_ERRADA",
  POST_NOT_FOUND: "POST_NOT_FOUND",
  INVALID_TITLE: "INVALID_TITLE",
  MISSING_IMAGES: "MISSING_IMAGES",
  DUPLICATE_IMAGE_NAME: "Nomes de imagens duplicados",
  TITLE_OR_SLUG_ALREADY_EXISTS: "Titulo ou slug ja existem",
  INVALID_EXTENSION: "Extensao de arquivo invalida",
  UUID_COLLISION: "Erro ao gerar identificador, tente novamente",
  TRANSIENT_ERROR_RETRY_FAILED: "Falha temporaria de conexao"
} as const

export const SUCCESS_MESSAGES = {
  POST_CREATED: "POST_CREATED",
  POST_UPDATED: "POST_UPDATED",
  POST_DELETED: "POST_DELETED"
} as const

export function buildInvalidImageMimeMessage(
  fileName: string,
  acceptedExtensions: string[]
) {
  return `imagem ${fileName} nao e de um formato aceito. Formatos aceitos: ${acceptedExtensions.join(", ")}`
}

export function buildImageTooLargeMessage(fileName: string, maxImageMb: number) {
  return `imagem ${fileName} ultrapassa o limite de ${maxImageMb}mb de tamanho`
}
