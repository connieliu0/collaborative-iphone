import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT =
  'You are a poetic narrator weaving a continuous story from images. ' +
  'When given an image and its position in the story, write exactly 4-8 words — ' +
  'never descriptive, always evocative. If fragments exist before and after, interpolate. ' +
  'If only before, continue. If neither, begin. Maintain a single coherent emotional thread ' +
  'across all fragments. Return only the caption text, no quotes.'

const MAX_WORDS = 8

interface CaptionRequest {
  uploadedImageUrl: string
  beforeCaption?: string | null
  afterCaption?: string | null
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: { type: 'base64'; media_type: string; data: string }
    }

function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  return trimmed.length > 0 ? trimmed : null
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

async function downloadFromStorage(
  url: string
): Promise<{ data: ArrayBuffer; mediaType: string } | null> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return null

  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (!match) return null

  const [, bucket, path] = match
  const supabase = createClient(supabaseUrl, serviceKey)
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) return null

  const mediaType = data.type || 'image/jpeg'
  return { data: await data.arrayBuffer(), mediaType }
}

async function imageUrlToBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const fromStorage = await downloadFromStorage(url)
  if (fromStorage) {
    return {
      data: arrayBufferToBase64(fromStorage.data),
      mediaType: fromStorage.mediaType.split(';')[0].trim() || 'image/jpeg',
    }
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`)

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mediaType = contentType.split(';')[0].trim() || 'image/jpeg'

  return { data: arrayBufferToBase64(await res.arrayBuffer()), mediaType }
}

function imageBlock(data: string, mediaType: string): AnthropicContentBlock {
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data },
  }
}

function normalizeCaption(caption: string | null | undefined): string | null {
  if (!caption || typeof caption !== 'string') return null
  const trimmed = caption.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildUserMessage(beforeCaption: string | null, afterCaption: string | null): string {
  const prev = beforeCaption ?? '—'
  const next = afterCaption ?? '—'
  return `Fragment before: '${prev}' | Fragment after: '${next}' | Write this beat.`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const model = Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_MODEL
    const body: CaptionRequest = await req.json()
    const uploadedImageUrl = normalizeImageUrl(body.uploadedImageUrl)
    const beforeCaption = normalizeCaption(body.beforeCaption)
    const afterCaption = normalizeCaption(body.afterCaption)

    if (!uploadedImageUrl) {
      throw new Error('uploadedImageUrl is required')
    }

    const main = await imageUrlToBase64(uploadedImageUrl)
    const content: AnthropicContentBlock[] = [
      { type: 'text', text: buildUserMessage(beforeCaption, afterCaption) },
      imageBlock(main.data, main.mediaType),
    ]

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 40,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content }],
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      throw new Error(`Anthropic error: ${err}`)
    }

    const data = await anthropicRes.json()
    const textBlock = (data.content ?? []).find(
      (block: { type: string }) => block.type === 'text'
    )
    let caption = (textBlock?.text ?? '').trim()
    caption = caption.replace(/^["']|["']$/g, '')

    const words = caption.split(/\s+/).filter(Boolean)
    if (words.length > MAX_WORDS) {
      caption = words.slice(0, MAX_WORDS).join(' ')
    }

    return new Response(JSON.stringify({ caption }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
