import { POST_ERROR_CODES } from "../../../shared/contracts/postErrorCodes.ts"
import { POST_SUCCESS_CODES } from "../../../shared/contracts/postSuccessCodes.ts"

export const ERROR_MESSAGES = POST_ERROR_CODES

export const SUCCESS_MESSAGES = POST_SUCCESS_CODES

export function buildInvalidImageMimeMessage(
  fileName: string,
  acceptedExtensions: string[]
) {
  return `imagem ${fileName} nao e de um formato aceito. Formatos aceitos: ${acceptedExtensions.join(", ")}`
}

export function buildImageTooLargeMessage(fileName: string, maxImageMb: number) {
  return `imagem ${fileName} ultrapassa o limite de ${maxImageMb}mb de tamanho`
}
