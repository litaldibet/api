// deno-lint-ignore-file no-explicit-any

import "@supabase/functions-js/edge-runtime.d.ts"
import { supabase } from "../../lib/supabaseClient.ts"

const BUCKET = "post-images"

function generateUUID() {
  return crypto.randomUUID()
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function isTransientError(error: any) {
  const message = String(error?.message ?? "").toLowerCase()
  const code = String(error?.code ?? "").toUpperCase()
  const status = Number(error?.status ?? 0)

  if ([502, 503, 504].includes(status)) return true

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("network") ||
    message.includes("connection")
  ) {
    return true
  }

  if (["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return true
  }

  return false
}

async function uploadFile(path: string, file: File) {

  const { error } = await supabase
    .storage
    .from(BUCKET)
    .upload(path, file)

  if (error) throw error
}

async function deleteFiles(paths: string[]) {

  if (paths.length === 0) return

  await supabase
    .storage
    .from(BUCKET)
    .remove(paths)
}

async function uploadBanner(postId: string, banner: File) {

  const ext = banner.name.split(".").pop()

  if (!ext) throw new Error("INVALID_BANNER_EXTENSION")

  const path = `${postId}/banner.${ext}`

  await uploadFile(path, banner)

  return path
}

async function uploadContentImages(postId: string, files: File[]) {

  const paths: Record<string, string> = {}
  const usedNames = new Set<string>()

  for (const file of files) {

    const ext = file.name.split(".").pop()

    if (!ext) throw new Error("INVALID_IMAGE_EXTENSION")

    const shortName = file.name.split(".")[0]

    if (usedNames.has(shortName)) {
      throw new Error("DUPLICATE_IMAGE_NAME")
    }

    const path = `${postId}/${shortName}.${ext}`

    await uploadFile(path, file)

    paths[shortName] = path
    usedNames.add(shortName)
  }

  return paths
}

function replaceImagePaths(
  markdown: string,
  paths: Record<string, string>
) {

  let result = markdown

  for (const [name, path] of Object.entries(paths)) {

    const safeName = escapeRegExp(name)
    const regex = new RegExp(`\\(${safeName}\\)`, "g")

    result = result.replace(regex, `(${path})`)
  }

  return result
}

async function insertPostWithRetry(postData: any, retries = 3) {

  for (let i = 0; i < retries; i++) {

    const { error } = await supabase
      .from("posts")
      .insert(postData)

    if (!error) return postData.id

    if (error.message.includes("posts_pkey")) {
      throw new Error("UUID_COLLISION")
    }

    if (
      error.message.includes("posts_slug_unique") ||
      error.message.includes("posts_title_unique")
    ) {

      throw new Error("TITLE_OR_SLUG_ALREADY_EXISTS")
    }

    if (isTransientError(error)) {
      continue
    }

    throw error
  }

  throw new Error("TRANSIENT_ERROR_RETRY_FAILED")
}

Deno.serve(async (req) => {

  const uploadedPaths: string[] = []

  try {

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({
          error: "METHOD_NOT_ALLOWED"
        }),
        {
          status: 405,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    const form = await req.formData()

    const category = form.get("category")
    const title = form.get("title")
    const preview = form.get("preview")
    const contentMarkdown = form.get("content_markdown")

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
      !(banner instanceof File) ||
      imageFiles.length !== images.length
    ) {
      return new Response(
        JSON.stringify({
          error: "INVALID_FORM_DATA"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    if (imageFiles.length === 0) {
      return new Response(
        JSON.stringify({
          error: "MISSING_IMAGES"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    const postId = generateUUID()

    const slug = slugify(title)

    if (!slug) {
      return new Response(
        JSON.stringify({
          error: "INVALID_TITLE"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
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
      post_type: category,
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
        id: finalId
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
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
          error: "Título ou slug já existem"
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    if (err.message === "DUPLICATE_IMAGE_NAME") {
      return new Response(
        JSON.stringify({
          error: "Nomes de imagens duplicados"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    if (
      err.message === "INVALID_BANNER_EXTENSION" ||
      err.message === "INVALID_IMAGE_EXTENSION"
    ) {
      return new Response(
        JSON.stringify({
          error: "Extensao de arquivo invalida"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    if (err.message === "UUID_COLLISION") {
      return new Response(
        JSON.stringify({
          error: "Erro ao gerar identificador, tente novamente"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    if (err.message === "TRANSIENT_ERROR_RETRY_FAILED") {
      return new Response(
        JSON.stringify({
          error: "Falha temporaria de conexao"
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" }
        }
      )
    }

    return new Response(
      JSON.stringify({
        error: err.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    )
  }
})