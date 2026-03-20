// deno-lint-ignore-file no-explicit-any

import "@supabase/functions-js/edge-runtime.d.ts"
import { supabase } from "../../lib/supabaseClient.ts"
import {
  ACCEPTED_EXTENSIONS,
  MAX_IMAGE_MB,
  REQUEST_PASSWORD,
  deleteFiles,
  listAllPostFiles,
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

Deno.serve(async (req) => {

  const uploadedPaths: string[] = []

  try {

    if (req.method !== "PUT") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.METHOD_NOT_ALLOWED }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      )
    }

    const form = await req.formData()

    const id = form.get("id")
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
      typeof id !== "string" ||
      typeof category !== "string" ||
      typeof title !== "string" ||
      typeof preview !== "string" ||
      typeof contentMarkdown !== "string" ||
      typeof password !== "string" ||
      !(banner instanceof File) ||
      imageFiles.length !== images.length
    ) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_FORM_DATA }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (password !== REQUEST_PASSWORD) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.WRONG_PASSWORD }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    const { data: existingPost, error: fetchError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", id)
      .single()

    if (fetchError || !existingPost) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.POST_NOT_FOUND }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const slug = slugify(title)

    if (!slug) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_TITLE }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const existingFiles = await listAllPostFiles(id)
    const existingPaths = existingFiles.map(file => `${id}/${file.name}`)

    const bannerPath = await uploadBanner(id, banner, {
      upsert: true,
      mapErrors: false
    })
    uploadedPaths.push(bannerPath)

    const contentPaths = await uploadContentImages(id, imageFiles, {
      upsert: true,
      mapErrors: false
    })
    uploadedPaths.push(...Object.values(contentPaths))

    const finalMarkdown = replaceImagePaths(
      contentMarkdown,
      contentPaths
    )

    const { error: updateError } = await supabase
      .from("posts")
      .update({
        post_type: category,
        title,
        slug,
        banner_path: bannerPath,
        preview,
        content_markdown: finalMarkdown
      })
      .eq("id", id)

    if (updateError) {
      if (
        updateError.message.includes("posts_slug_unique") ||
        updateError.message.includes("posts_title_unique")
      ) {
        throw new Error("TITLE_OR_SLUG_ALREADY_EXISTS")
      }

      throw updateError
    }

    const keepPaths = new Set<string>([
      bannerPath,
      ...Object.values(contentPaths)
    ])

    const removePaths = existingPaths.filter(path => !keepPaths.has(path))

    await deleteFiles(removePaths)

    return new Response(
      JSON.stringify({
        success: true,
        message: SUCCESS_MESSAGES.POST_UPDATED,
        id
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
      console.error("Failed cleanup", cleanupError)
    }

    if (err.message === "TITLE_OR_SLUG_ALREADY_EXISTS") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.TITLE_OR_SLUG_ALREADY_EXISTS }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    }

    if (err.message === "DUPLICATE_IMAGE_NAME") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.DUPLICATE_IMAGE_NAME }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const invalidMimeMatch = /^INVALID_IMAGE_MIME:(.+)$/.exec(err.message)
    if (invalidMimeMatch) {
      const fileName = invalidMimeMatch[1].trim()
      return new Response(
        JSON.stringify({
          error: buildInvalidImageMimeMessage(fileName, ACCEPTED_EXTENSIONS)
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const tooLargeMatch = /^IMAGE_TOO_LARGE:(.+)$/.exec(err.message)
    if (tooLargeMatch) {
      const fileName = tooLargeMatch[1].trim()
      return new Response(
        JSON.stringify({
          error: buildImageTooLargeMessage(fileName, MAX_IMAGE_MB)
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (
      err.message === "INVALID_BANNER_EXTENSION" ||
      err.message === "INVALID_IMAGE_EXTENSION"
    ) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_EXTENSION }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})