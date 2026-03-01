export const dynamic = 'force-static';
import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/server';

const DOMAIN_SOURCE_MAP = [
  { pattern: /instagram\.com/i, source: 'Instagram', fallbackTitle: 'Instagram 게시물' },
  { pattern: /youtube\.com|youtu\.be/i, source: 'YouTube', fallbackTitle: 'YouTube 영상' },
  { pattern: /(^|\.)x\.com|twitter\.com/i, source: 'X', fallbackTitle: 'X 게시물' },
  { pattern: /pinterest\.com|pin\.it/i, source: 'Pinterest', fallbackTitle: 'Pinterest 핀' },
  { pattern: /tiktok\.com/i, source: 'TikTok', fallbackTitle: 'TikTok 영상' },
  { pattern: /threads\.net|threads\.com/i, source: 'Threads', fallbackTitle: 'Threads 게시물' },
];

function detectSource(hostname) {
  for (const entry of DOMAIN_SOURCE_MAP) {
    if (entry.pattern.test(hostname)) {
      return { source: entry.source, fallbackTitle: entry.fallbackTitle };
    }
  }
  return { source: 'Other', fallbackTitle: null };
}

function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractMeta(html) {
  const get = (name) => {
    const regex = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i');
    const match = html.match(regex);
    if (match) return match[1];
    const reversed = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i');
    const match2 = html.match(reversed);
    return match2 ? match2[1] : null;
  };

  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);

  return {
    ogTitle: decodeHtmlEntities(get('og:title') || get('twitter:title') || (titleTag ? titleTag[1].trim() : null)),
    ogImage: decodeHtmlEntities(get('og:image') || get('twitter:image') || null),
    ogDescription: decodeHtmlEntities(get('og:description') || get('description') || null),
  };
}

export async function POST(request) {
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch {
      return NextResponse.json({ error: '유효하지 않은 URL입니다.' }, { status: 400 });
    }

    const { source, fallbackTitle } = detectSource(parsedUrl.hostname);

    let title = fallbackTitle;
    let thumbnailUrl = null;
    let description = null;

    // YouTube/TikTok은 oEmbed API로 정확한 제목/썸네일을 가져옴
    if (source === 'YouTube' || source === 'TikTok') {
      try {
        const oembedBase = source === 'YouTube'
          ? 'https://www.youtube.com/oembed'
          : 'https://www.tiktok.com/oembed';
        const oembedUrl = `${oembedBase}?url=${encodeURIComponent(parsedUrl.href)}&format=json`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(oembedUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data = await res.json();
          if (data.title) title = data.title;
          if (data.thumbnail_url) thumbnailUrl = data.thumbnail_url;
        }
      } catch {
        // oEmbed 실패 시 아래 일반 fetch로 fallback
      }
    }

    // oEmbed에서 제목을 못 가져왔거나 YouTube가 아닌 경우 일반 HTML fetch
    if (!title || title === fallbackTitle) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        // Meta 계열(Threads/Instagram)은 facebookexternalhit UA에만 og 태그 응답
        const isMeta = source === 'Threads' || source === 'Instagram';
        const htmlUserAgent = isMeta
          ? 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        const response = await fetch(parsedUrl.href, {
          signal: controller.signal,
          headers: {
            'User-Agent': htmlUserAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          },
          redirect: 'follow',
        });
        clearTimeout(timeout);

        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('text/html')) {
            const html = await response.text();
            const meta = extractMeta(html);
            if (meta.ogTitle) title = meta.ogTitle;
            if (meta.ogImage && !thumbnailUrl) thumbnailUrl = meta.ogImage;
            if (meta.ogDescription) description = meta.ogDescription;
          }
        }
      } catch {
        // fetch 실패해도 도메인 기반 정보는 반환
      }
    }

    // 상대경로 이미지를 절대 URL로 변환
    if (thumbnailUrl && !thumbnailUrl.startsWith('http')) {
      try {
        thumbnailUrl = new URL(thumbnailUrl, parsedUrl.origin).href;
      } catch {
        thumbnailUrl = null;
      }
    }

    // og:image를 Supabase Storage에 프록시 업로드
    // Threads/Instagram CDN은 서버에서 직접 다운로드 불가 → og:image URL 그대로 반환
    const isMeta = source === 'Threads' || source === 'Instagram';
    if (thumbnailUrl && !isMeta) {
      try {
        const imgController = new AbortController();
        const imgTimeout = setTimeout(() => imgController.abort(), 5000);

        const imgResponse = await fetch(thumbnailUrl, {
          signal: imgController.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
          redirect: 'follow',
        });
        clearTimeout(imgTimeout);

        if (imgResponse.ok) {
          const contentLength = imgResponse.headers.get('content-length');
          const MAX_SIZE = 2 * 1024 * 1024; // 2MB

          if (!contentLength || parseInt(contentLength, 10) <= MAX_SIZE) {
            const buffer = await imgResponse.arrayBuffer();

            if (buffer.byteLength <= MAX_SIZE) {
              const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
              const extMap = {
                'image/jpeg': 'jpg',
                'image/png': 'png',
                'image/webp': 'webp',
                'image/gif': 'gif',
              };
              const ext = extMap[contentType.split(';')[0].trim()] || 'jpg';
              const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
              const filePath = `thumbnails/${fileName}`;

              const supabase = getSupabaseAdminClient();
              const { error: uploadError } = await supabase.storage
                .from('thumbnails')
                .upload(filePath, Buffer.from(buffer), {
                  contentType: contentType.split(';')[0].trim(),
                  upsert: false,
                });

              if (!uploadError) {
                const { data: publicData } = supabase.storage
                  .from('thumbnails')
                  .getPublicUrl(filePath);
                if (publicData?.publicUrl) {
                  thumbnailUrl = publicData.publicUrl;
                }
              }
            }
          }
        }
      } catch {
        // 이미지 프록시 실패 시 원본 og:image URL 유지
      }
    }

    return NextResponse.json({
      title: title || parsedUrl.hostname,
      source,
      thumbnailUrl,
      description,
      url: parsedUrl.href,
    });
  } catch {
    return NextResponse.json({ error: '메타데이터를 가져올 수 없습니다.' }, { status: 500 });
  }
}
