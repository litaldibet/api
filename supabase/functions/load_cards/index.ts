// deno-lint-ignore-file no-explicit-any

import "@supabase/functions-js/edge-runtime.d.ts"
import { bucket } from "../../lib/data.ts"
import { ERROR_MESSAGES } from "../../lib/errorMessages.ts"
import { corsHeaders, jsonHeaders } from "../../lib/cors.ts"
import { supabase } from "../../lib/supabaseClient.ts"

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {

    if (req.method !== "GET") {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.METHOD_NOT_ALLOWED }),
        { status: 405, headers: jsonHeaders }
      )
    }

    const { data: posts, error } = await supabase
      .from("posts")
      .select("id, title, slug, preview, banner_path, post_type")
      .eq("active", true)

    if (error) throw error

    const cards = (posts ?? []).map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      preview: post.preview,
      post_type: post.post_type,
      banner_url: buildPublicUrl(post.banner_path)
    }))

    return new Response(
      JSON.stringify({
        success: true,
        data: cards
      }),
      {
        status: 200,
        headers: jsonHeaders
      }
    )

  } catch (err: any) {

    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: jsonHeaders }
    )

  }
})

function buildPublicUrl(path: string) {
  const { data } = supabase
    .storage
    .from(bucket)
    .getPublicUrl(path)

  return data.publicUrl
}
