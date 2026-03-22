// deno-lint-ignore-file no-explicit-any

import "@supabase/functions-js/edge-runtime.d.ts"
import {
  ACCEPTED_EXTENSIONS,
  MAX_IMAGE_MB,
  REQUEST_PASSWORD,
  deleteFiles,
  generateUUID,
  insertPostWithRetry,
  replaceImagePaths,
  slugify,
  uploadBanner,
  uploadContentImages
} from "../../lib/auxiliaryFunctions.ts"
import {
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  buildImageTooLargeMessage,
  buildInvalidImageMimeMessage
} from "../../lib/errorMessages.ts"
import { corsHeaders, jsonHeaders } from "../../lib/cors.ts"

Deno.serve(async (req) => {

  const uploadedPaths: string[] = []

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.METHOD_NOT_ALLOWED
        }),
        {
          status: 405,
          headers: jsonHeaders
        }
      )
    }

    const form = await req.formData()

    const category = form.get("category")
    const title = form.get("title")
    const preview = form.get("preview")
    const contentMarkdown = form.get("content_markdown")
    const password = form.get("password")

    const banner = form.get("banner")
    const images = form.getAll("images")

    const imageFiles = images.filter(
      (image): image is File => image instanceof File
    )

    if (
      typeof category !== "string" ||
      typeof title !== "string" ||
      typeof preview !== "string" ||
      typeof contentMarkdown !== "string" ||
      typeof password !== "string" ||
      !(banner instanceof File) ||
      imageFiles.length !== images.length
    ) {
      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.INVALID_FORM_DATA
        }),
        {
          status: 400,
          headers: jsonHeaders
        }
      )
    }

    const normalizedCategory = normalizePostType(category)

    if (!normalizedCategory) {
      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.INVALID_FORM_DATA
        }),
        {
          status: 400,
          headers: jsonHeaders
        }
      )
    }

    if (password !== REQUEST_PASSWORD) {
      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.WRONG_PASSWORD
        }),
        {
          status: 401,
          headers: jsonHeaders
        }
      )
    }

    const postId = generateUUID()

    const slug = slugify(title)

    if (!slug) {
      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.INVALID_TITLE
        }),
        {
          status: 400,
          headers: jsonHeaders
        }
      )
    }

    const bannerPath = await uploadBanner(postId, banner)

    uploadedPaths.push(bannerPath)

    const contentPaths = await uploadContentImages(postId, imageFiles)

    uploadedPaths.push(...Object.values(contentPaths))

    const finalMarkdown = replaceImagePaths(
      contentMarkdown,
      contentPaths
    )

    const postData = {
      id: postId,
      post_type: normalizedCategory,
      title,
      slug,
      banner_path: bannerPath,
      preview,
      content_markdown: finalMarkdown,
      active: true
    }

    const finalId = await insertPostWithRetry(postData)

    return new Response(
      JSON.stringify({
        success: true,
        message: SUCCESS_MESSAGES.POST_CREATED,
        id: finalId
      }),
      {
        status: 200,
        headers: jsonHeaders
      }
    )

  } catch (err: any) {

    try {
      await deleteFiles(uploadedPaths)
    } catch (cleanupError) {
      console.error("Failed to cleanup uploaded files", cleanupError)
    }

    if (err.message === "TITLE_OR_SLUG_ALREADY_EXISTS") {

      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.TITLE_OR_SLUG_ALREADY_EXISTS
        }),
        {
          status: 409,
          headers: jsonHeaders
        }
      )
    }

    if (err.message === "DUPLICATE_IMAGE_NAME") {
      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.DUPLICATE_IMAGE_NAME
        }),
        {
          status: 400,
          headers: jsonHeaders
        }
      )
    }

    const invalidMimeMatch = /^INVALID_IMAGE_MIME:(.+)$/.exec(err.message)
    if (invalidMimeMatch) {
      const fileName = invalidMimeMatch[1].trim()
      return new Response(
        JSON.stringify({
          error: buildInvalidImageMimeMessage(fileName, ACCEPTED_EXTENSIONS)
        }),
        {
          status: 400,
          headers: jsonHeaders
        }
      )
    }

    const tooLargeMatch = /^IMAGE_TOO_LARGE:(.+)$/.exec(err.message)
    if (tooLargeMatch) {
      const fileName = tooLargeMatch[1].trim()
      return new Response(
        JSON.stringify({
          error: buildImageTooLargeMessage(fileName, MAX_IMAGE_MB)
        }),
        {
          status: 400,
          headers: jsonHeaders
        }
      )
    }

    if (
      err.message === "INVALID_BANNER_EXTENSION" ||
      err.message === "INVALID_IMAGE_EXTENSION"
    ) {
      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.INVALID_EXTENSION
        }),
        {
          status: 400,
          headers: jsonHeaders
        }
      )
    }

    if (err.message === "UUID_COLLISION") {
      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.UUID_COLLISION
        }),
        {
          status: 500,
          headers: jsonHeaders
        }
      )
    }

    if (err.message === "TRANSIENT_ERROR_RETRY_FAILED") {
      return new Response(
        JSON.stringify({
          error: ERROR_MESSAGES.TRANSIENT_ERROR_RETRY_FAILED
        }),
        {
          status: 503,
          headers: jsonHeaders
        }
      )
    }

    return new Response(
      JSON.stringify({
        error: err.message
      }),
      {
        status: 500,
        headers: jsonHeaders
      }
    )
  }
})

function normalizePostType(rawCategory: string): "BLOG" | "PROMOCAO" | null {
  const normalized = rawCategory.trim().toUpperCase()
  const mapped = normalized === "POST" ? "BLOG" : normalized

  if (mapped === "BLOG" || mapped === "PROMOCAO") {
    return mapped
  }

  return null
}