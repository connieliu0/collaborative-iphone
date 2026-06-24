import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DEFAULT_MODEL = 'claude-haiku-4-20250514'

interface CaptionRequest {
  uploadedImageUrl: string
  beforeImageUrl?: string | null
  afterImageUrl?: string | null
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: { type: 'base64'; media_type: string; data: string }
    }

async function imageUrlToBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`)

  const contentType = res.headers.get('content-type') ?? 'image/jpeg'
  const mediaType = contentType.split(';')[0].trim() || 'image/jpeg'

  const buf = await res.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }

  return { data: btoa(binary), mediaType }
}

function imageBlock(url: string, data: string, mediaType: string): AnthropicContentBlock {
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType, data },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const model = Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_MODEL
    const body: CaptionRequest = await req.json()
    const { uploadedImageUrl, beforeImageUrl, afterImageUrl } = body

    if (!uploadedImageUrl) {
      throw new Error('uploadedImageUrl is required')
    }

    const content: AnthropicContentBlock[] = [
      {
        type: 'text',
        text:
          'Write a poetic caption for the MAIN image (the one being added). ' +
          'Under 10 words. It should feel related to the images before and after it in a sequence. ' +
          'Return only the caption text, no quotes.',
      },
    ]

    if (beforeImageUrl) {
      const before = await imageUrlToBase64(beforeImageUrl)
      content.push({ type: 'text', text: 'Image BEFORE in sequence:' })
      content.push(imageBlock(beforeImageUrl, before.data, before.mediaType))
    }

    const main = await imageUrlToBase64(uploadedImageUrl)
    content.push({ type: 'text', text: 'MAIN image to caption:' })
    content.push(imageBlock(uploadedImageUrl, main.data, main.mediaType))

    if (afterImageUrl) {
      const after = await imageUrlToBase64(afterImageUrl)
      content.push({ type: 'text', text: 'Image AFTER in sequence:' })
      content.push(imageBlock(afterImageUrl, after.data, after.mediaType))
    }

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
    if (words.length > 10) {
      caption = words.slice(0, 10).join(' ')
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
