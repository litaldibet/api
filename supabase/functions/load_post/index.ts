// deno-lint-ignore-file no-explicit-any

import "@supabase/functions-js/edge-runtime.d.ts"
import { bucket } from "../../lib/data.ts"
import { corsHeaders, jsonHeaders } from "../../lib/cors.ts"
import { ERROR_MESSAGES } from "../../lib/errorMessages.ts"
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

    const url = new URL(req.url)
    const id = url.searchParams.get("id")

    if (!id) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.INVALID_ID }),
        { status: 400, headers: jsonHeaders }
      )
    }

    const { data: post, error: postError } = await supabase
      .from("posts")
      .select("id, post_type, title, slug, banner_path, preview, content_markdown, active")
      .eq("id", id)
      .single()

    if (postError || !post) {
      return new Response(
        JSON.stringify({ error: ERROR_MESSAGES.POST_NOT_FOUND }),
        { status: 404, headers: jsonHeaders }
      )
    }

    const bannerUrl = buildPublicUrl(post.banner_path)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          title: post.title,
          slug: post.slug,
          banner_url: bannerUrl,
          content_markdown: post.content_markdown
        }
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

