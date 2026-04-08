// deno-lint-ignore-file no-explicit-any
import "@supabase/functions-js/edge-runtime.d.ts"
import type { DeletePostRequestBody } from "@shared/contracts/deletePost.ts"
import { supabase } from "../../lib/supabaseClient.ts"
import {
  REQUEST_PASSWORD,
  deleteFiles,
  listAllPostFiles
} from "../../lib/auxiliaryFunctions.ts"
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../../lib/errorMessages.ts"
import { getCorsHeaders, getJsonHeaders, isOriginAllowed } from "../../lib/cors.ts"

Deno.serve(async (req) => {

  const origin = req.headers.get("origin")
  const corsHeaders = getCorsHeaders(origin)
  const jsonHeaders = getJsonHeaders(origin)

  if (req.method === "OPTIONS") {
    if (!isOriginAllowed(origin)) {
      return new Response("Forbidden origin", { status: 403, headers: corsHeaders })
    }

    return new Response("ok", { headers: corsHeaders })
  }

  try {

    if (req.method !== "DELETE") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.METHOD_NOT_ALLOWED }),
        { status: 405, headers: jsonHeaders }
      )
    }

    let body: DeletePostRequestBody | null

    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_JSON }),
        { status: 400, headers: jsonHeaders }
      )
    }

    const { id, password: requestPassword } = body ?? {}

    if (!id || typeof id !== "string") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_ID }),
        { status: 400, headers: jsonHeaders }
      )
    }

    if (!requestPassword || typeof requestPassword !== "string") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_PASSWORD }),
        { status: 401, headers: jsonHeaders }
      )
    }

    if (requestPassword !== REQUEST_PASSWORD) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.WRONG_PASSWORD }),
        { status: 401, headers: jsonHeaders }
      )
    }

    const { data: post, error: fetchError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", id)
      .single()

    if (fetchError || !post) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.POST_NOT_FOUND }),
        { status: 404, headers: jsonHeaders }
      )
    }

    const files = await listAllPostFiles(id)
    const paths = files.map(file => `${id}/${file.name}`)

    const { error: deleteError } = await supabase
      .from("posts")
      .delete()
      .eq("id", id)

    if (deleteError) throw deleteError

    // Storage cleanup is best-effort. The source of truth is removing the post row.
    try {
      await deleteFiles(paths)
    } catch (storageError) {
      console.error("Failed to cleanup post files after DB deletion", storageError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: SUCCESS_MESSAGES.POST_DELETED
      }),
      { status: 200, headers: jsonHeaders }
    )

  } catch (err: any) {

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: jsonHeaders }
    )

  }
})

