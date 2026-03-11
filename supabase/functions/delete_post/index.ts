// deno-lint-ignore-file no-explicit-any
import "@supabase/functions-js/edge-runtime.d.ts"
import { supabase } from "../../lib/supabaseClient.ts"
import { bucket, password } from "../../lib/data.ts"

const BUCKET = bucket
const REQUEST_PASSWORD = password

const LIST_LIMIT = 100

async function listAllPostFiles(postId: string) {
  const allFiles: Array<{ name: string }> = []
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .storage
      .from(BUCKET)
      .list(postId, { limit: LIST_LIMIT, offset })

    if (error) throw error

    if (!data || data.length === 0) break

    allFiles.push(...data)

    if (data.length < LIST_LIMIT) break

    offset += LIST_LIMIT
  }

  return allFiles
}

async function deletePostFiles(postId: string) {

  const files = await listAllPostFiles(postId)

  if (!files || files.length === 0) return

  const paths = files.map(file => `${postId}/${file.name}`)

  const { error: removeError } = await supabase
    .storage
    .from(BUCKET)
    .remove(paths)

  if (removeError) throw removeError
}

Deno.serve(async (req) => {

  try {

    if (req.method !== "DELETE") {
      return new Response(
        JSON.stringify({ error: "METHOD_NOT_ALLOWED" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      )
    }

    let body: any

    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ error: "INVALID_JSON" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const { id, password: requestPassword } = body ?? {}

    if (!id || typeof id !== "string") {
      return new Response(
        JSON.stringify({ error: "INVALID_ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!requestPassword || typeof requestPassword !== "string") {
      return new Response(
        JSON.stringify({ error: "INVALID_PASSWORD" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }

    if (requestPassword !== REQUEST_PASSWORD) {
      return new Response(
        JSON.stringify({ error: "SENHA_ERRADA" }),
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
        JSON.stringify({ error: "POST_NOT_FOUND" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    await deletePostFiles(id)

    const { error: deleteError } = await supabase
      .from("posts")
      .delete()
      .eq("id", id)

    if (deleteError) throw deleteError

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )

  } catch (err: any) {

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )

  }
})

