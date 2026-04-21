// api/arxiv.js - arXiv에서 최신 AI 논문 가져오기

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // cs.AI, cs.CL (NLP), cs.CV (Vision), cs.LG (ML) 카테고리
    const query = 'cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.CV+OR+cat:cs.LG';
    const url = `https://export.arxiv.org/api/query?search_query=${query}&sortBy=submittedDate&sortOrder=descending&max_results=30`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const text = await response.text();
    
    // XML 파싱 (정규식 사용 - serverless 환경에서 DOMParser 없음)
    const entries = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const matches = text.matchAll(entryRegex);
    
    // 최근 3일 내
    const threeDaysAgo = Date.now() - 3 * 24 * 3600 * 1000;
    
    for (const match of matches) {
      const entryXml = match[1];
      
      const titleMatch = entryXml.match(/<title>([\s\S]*?)<\/title>/);
      const summaryMatch = entryXml.match(/<summary>([\s\S]*?)<\/summary>/);
      const idMatch = entryXml.match(/<id>([\s\S]*?)<\/id>/);
      const publishedMatch = entryXml.match(/<published>([\s\S]*?)<\/published>/);
      
      if (titleMatch && idMatch) {
        const id = idMatch[1].trim();
        const title = titleMatch[1].trim().replace(/\s+/g, ' ');
        const summary = summaryMatch ? summaryMatch[1].trim() : '';
        const published = publishedMatch ? publishedMatch[1].trim() : new Date().toISOString();
        
        // 최근 3일 필터링
        if (new Date(published).getTime() < threeDaysAgo) continue;
        
        entries.push({
          id: `arxiv-${id.split('/').pop()}`,
          title: title,
          url: id,
          source: 'arXiv',
          score: 0,
          comments: 0,
          date: published,
          originalText: summary,
        });
      }
    }
    
    return res.status(200).json({ success: true, data: entries });
  } catch (err) {
    console.error('arXiv error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
