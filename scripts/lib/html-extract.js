'use strict';

function extractFromHtml(html, sourceUrl) {
  function strip(s) { return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  function first(regex) {
    const m = html.match(regex);
    return m ? strip(m[1]).substring(0, 300) : '';
  }
  function all(regex) {
    const results = [];
    let m;
    const r = new RegExp(regex.source, regex.flags + (regex.flags.includes('g') ? '' : 'g'));
    while ((m = r.exec(html)) !== null) {
      const text = strip(m[1]).replace(/^[-•·▸►]+\s*/, '').trim();
      if (text.length > 3 && text.length < 120) results.push(text);
      if (results.length >= 10) break;
    }
    return results;
  }

  // Business name: OG site name > title tag > h1
  const ogSiteName = first(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    || first(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);
  const titleTag = first(/<title[^>]*>(.*?)<\/title>/i).replace(/\s*[-|–]\s*.*$/, '').trim();
  const h1Text = first(/<h1[^>]*>(.*?)<\/h1>/i);
  const businessName = ogSiteName || titleTag || h1Text || new URL(sourceUrl).hostname;

  // Description: meta description > OG description > first long paragraph
  const metaDesc = first(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{30,})["']/i)
    || first(/<meta[^>]+content=["']([^"']{30,})["'][^>]+name=["']description["']/i);
  const ogDesc = first(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{30,})["']/i)
    || first(/<meta[^>]+content=["']([^"']{30,})["'][^>]+property=["']og:description["']/i);
  // Find first paragraph with meaningful text (>60 chars)
  let firstPara = '';
  const paraMatches = html.matchAll(/<p[^>]*>([\s\S]{60,400}?)<\/p>/gi);
  for (const pm of paraMatches) {
    const t = strip(pm[1]);
    if (t.length > 60 && !t.match(/^(cookie|privacy|terms|copyright)/i)) {
      firstPara = t.substring(0, 200);
      break;
    }
  }
  const description = metaDesc || ogDesc || firstPara || '';

  // Products/services: h2, h3, nav links (short items likely products)
  const h2s = all(/<h2[^>]*>(.*?)<\/h2>/i);
  const h3s = all(/<h3[^>]*>(.*?)<\/h3>/i);
  // Filter headings that look like product/service names (not blog post titles)
  const productish = [...h2s, ...h3s].filter(t =>
    t.length < 60 && !t.match(/^(beranda|home|tentang|about|kontak|contact|blog|news|artikel|galeri|gallery|faq)/i)
  ).slice(0, 8);

  // Tagline: OG title (often has tagline) or short h1 different from business name
  const ogTitle = first(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || first(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const tagline = (ogTitle && ogTitle !== businessName && ogTitle.length < 100) ? ogTitle : '';

  return {
    businessName,
    description,
    products: productish,
    tagline,
    url: sourceUrl
  };
}

module.exports = { extractFromHtml };
