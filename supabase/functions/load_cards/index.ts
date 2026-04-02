// deno-lint-ignore-file no-explicit-any

import "@supabase/functions-js/edge-runtime.d.ts"
import type { LoadCardsSuccessResponse, PostCard } from "@shared/contracts/loadCards.ts"
import { POST_IMAGES_BUCKET } from "@shared/constants/storage.ts"
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

    const url = new URL(req.url)
    const includeInactive = url.searchParams.get("include_inactive") === "true"

    const cardsQuery = supabase
      .from("posts")
      .select("id, title, slug, preview, banner_path, post_type, active")

    if (!includeInactive) {
      cardsQuery.eq("active", true)
    }

    const { data: posts, error } = await cardsQuery

    if (error) throw error

    const cards: PostCard[] = (posts ?? []).map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      preview: post.preview,
      post_type: post.post_type,
      active: post.active,
      banner_url: buildPublicUrl(post.banner_path)
    }))

    const payload: LoadCardsSuccessResponse = {
      success: true,
      data: cards,
    }

    return new Response(
      JSON.stringify(payload),
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
    .from(POST_IMAGES_BUCKET)
    .getPublicUrl(path)

  return data.publicUrl
}
