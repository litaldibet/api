// deno-lint-ignore-file no-explicit-any
import "@supabase/functions-js/edge-runtime.d.ts"
import { supabase } from "../../lib/supabaseClient.ts"
import {
  REQUEST_PASSWORD,
  deleteFiles,
  listAllPostFiles
} from "../../lib/auxiliaryFunctions.ts"
import { ERROR_MESSAGES, SUCCESS_MESSAGES } from "../../lib/errorMessages.ts"

Deno.serve(async (req) => {

  try {

    if (req.method !== "DELETE") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.METHOD_NOT_ALLOWED }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      )
    }

    let body: any

    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_JSON }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { id, password: requestPassword } = body ?? {}

    if (!id || typeof id !== "string") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_ID }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!requestPassword || typeof requestPassword !== "string") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_PASSWORD }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    if (requestPassword !== REQUEST_PASSWORD) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.WRONG_PASSWORD }),
        { status: 401, headers: { "Content-Type": "application/json" } }
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
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    const files = await listAllPostFiles(id)
    const paths = files.map(file => `${id}/${file.name}`)

    await deleteFiles(paths)

    const { error: deleteError } = await supabase
      .from("posts")
      .delete()
      .eq("id", id)

    if (deleteError) throw deleteError

    return new Response(
      JSON.stringify({
        success: true,
        message: SUCCESS_MESSAGES.POST_DELETED
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )

  } catch (err: any) {

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )

  }
})

